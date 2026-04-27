import type {
    PCB,
    GanttEntry,
    SchedulerConfig,
    SchedulerMetrics,
} from "../types";

/**
 * Tick-based unified scheduler simulator.
 *
 * Supports:
 *   - FCFS (non-preemptive)
 *   - RR (preemptive, time quantum)
 *   - PRIORITY_RR (priority-driven RR with optional aging — Section 8.5.2)
 *   - SRJF (preemptive, shortest remaining job first)
 *
 * Each process can have I/O bursts. The CPU burst (`burstTime`) is divided
 * into `ioCount + 1` chunks. Between chunks the process waits for
 * `ioBurstTime` ticks in the "waiting" state, allowing other processes to
 * occupy the CPU. This is what produces the I/O-bound vs CPU-bound vs mixed
 * workload behaviour used in experiments.
 *
 * `responseTime` for a process is `firstRunAt - arrivalTime`, recorded the
 * first time it executes on the CPU.
 */

interface SimState {
    pid: number;
    name: string;
    color: string;
    arrivalTime: number;
    burstTime: number;
    remaining: number;
    basePriority: number;
    priority: number;
    ioCount: number;
    ioBurstTime: number;
    ioRemainingThisBlock: number;
    ioBurstsDone: number;
    cpuUsedSinceLastIO: number;
    chunkSize: number;
    state: "future" | "ready" | "running" | "waiting" | "done";
    firstRunAt: number | null;
    completionTime: number | null;
    waitTimeInReady: number;
    quantumUsed: number;
}

export class Scheduler {
    private config: SchedulerConfig;

    constructor(config: SchedulerConfig) {
        this.config = config;
    }

    setConfig(config: SchedulerConfig) {
        this.config = config;
    }

    getConfig(): SchedulerConfig {
        return this.config;
    }

    /**
     * Run the scheduler against `processes` and write back per-process metrics
     * (waitingTime, turnaroundTime, responseTime, completionTime).
     */
    run(processes: PCB[]): { gantt: GanttEntry[]; metrics: SchedulerMetrics } {
        const states = processes.map<SimState>((p) => this.toSimState(p));
        const { gantt, totalTime } = this.simulate(states);

        for (const s of states) {
            const pcb = processes.find((p) => p.pid === s.pid);
            if (!pcb) continue;
            const completionTime = s.completionTime ?? s.arrivalTime;
            const turnaround = Math.max(0, completionTime - s.arrivalTime);
            const totalDemand = s.burstTime + s.ioCount * s.ioBurstTime;
            const waiting = Math.max(0, turnaround - totalDemand);
            const response = Math.max(
                0,
                (s.firstRunAt ?? completionTime) - s.arrivalTime,
            );

            pcb.completionTime = completionTime;
            pcb.turnaroundTime = turnaround;
            pcb.waitingTime = waiting;
            pcb.responseTime = response;
            pcb.firstResponseAt = s.firstRunAt ?? undefined;
            pcb.remainingTime = 0;
            pcb.priority = s.priority;
        }

        const metrics = this.calcMetrics(processes, totalTime);
        return { gantt, metrics };
    }

    // -------------------------------------------------------------------------
    // Core simulator
    // -------------------------------------------------------------------------

    private simulate(states: SimState[]): {
        gantt: GanttEntry[];
        totalTime: number;
    } {
        const gantt: GanttEntry[] = [];
        const algo = this.config.algorithm;
        const quantum = Math.max(1, this.config.timeQuantum);
        const aging = this.config.priorityAging;
        const agingThreshold = Math.max(1, this.config.agingThreshold);

        let time = 0;
        let currentPid: number | null = null;

        const safetyLimit = states.reduce(
            (sum, s) => sum + s.burstTime + (s.ioCount + 1) * s.ioBurstTime + 5,
            100,
        );

        while (
            states.some((s) => s.state !== "done") &&
            time < safetyLimit * 4
        ) {
            // 1. New arrivals
            for (const s of states) {
                if (s.state === "future" && s.arrivalTime <= time) {
                    s.state = "ready";
                }
            }

            // 2. I/O completions
            for (const s of states) {
                if (s.state === "waiting") {
                    s.ioRemainingThisBlock -= 1;
                    if (s.ioRemainingThisBlock <= 0) {
                        s.state = "ready";
                        s.ioBurstsDone += 1;
                    }
                }
            }

            // 3. Aging (PRIORITY_RR only)
            if (algo === "PRIORITY_RR" && aging) {
                for (const s of states) {
                    if (s.state === "ready" && s.pid !== currentPid) {
                        s.waitTimeInReady += 1;
                        if (s.waitTimeInReady >= agingThreshold) {
                            s.priority += 1;
                            s.waitTimeInReady = 0;
                        }
                    }
                }
            }

            // 4. Pick a process to run if needed
            const currentRunning =
                currentPid !== null
                    ? states.find((s) => s.pid === currentPid)
                    : undefined;

            const needsPick =
                currentRunning === undefined ||
                currentRunning.state !== "running";

            if (needsPick) {
                const candidate = this.pickNext(states, algo);
                if (!candidate) {
                    // No ready process — idle tick, advance time
                    time += 1;
                    continue;
                }
                if (candidate.firstRunAt === null) {
                    candidate.firstRunAt = time;
                }
                candidate.state = "running";
                candidate.quantumUsed = 0;
                candidate.waitTimeInReady = 0;
                currentPid = candidate.pid;
            }

            // For SRJF, preempt every tick if a shorter job is now available
            if (algo === "SRJF" && currentPid !== null) {
                const running = states.find((s) => s.pid === currentPid);
                if (running) {
                    const better = states.find(
                        (s) =>
                            s.state === "ready" &&
                            s.remaining < running.remaining,
                    );
                    if (better) {
                        running.state = "ready";
                        if (better.firstRunAt === null) {
                            better.firstRunAt = time;
                        }
                        better.state = "running";
                        better.quantumUsed = 0;
                        currentPid = better.pid;
                    }
                }
            }

            // Likewise for PRIORITY_RR with aging — check if a higher-priority
            // process should preempt at quantum start (we're at start because
            // we either just picked or just preempted at quantum boundary).
            if (algo === "PRIORITY_RR" && currentPid !== null) {
                const running = states.find((s) => s.pid === currentPid);
                if (running) {
                    const better = states.find(
                        (s) =>
                            s.state === "ready" &&
                            s.priority > running.priority,
                    );
                    if (better && running.quantumUsed === 0) {
                        running.state = "ready";
                        if (better.firstRunAt === null) {
                            better.firstRunAt = time;
                        }
                        better.state = "running";
                        better.quantumUsed = 0;
                        currentPid = better.pid;
                    }
                }
            }

            // 5. Run the current process for one tick
            if (currentPid === null) {
                time += 1;
                continue;
            }
            const running = states.find((s) => s.pid === currentPid);
            if (!running) {
                currentPid = null;
                continue;
            }

            // Append/extend gantt entry
            const last = gantt[gantt.length - 1];
            if (
                last &&
                last.pid === running.pid &&
                last.kind === "cpu" &&
                last.endTime === time
            ) {
                last.endTime = time + 1;
            } else {
                gantt.push({
                    pid: running.pid,
                    name: running.name,
                    color: running.color,
                    startTime: time,
                    endTime: time + 1,
                    kind: "cpu",
                });
            }

            running.remaining -= 1;
            running.cpuUsedSinceLastIO += 1;
            running.quantumUsed += 1;
            time += 1;

            // 6. Decide what happens after this tick
            if (running.remaining <= 0) {
                running.state = "done";
                running.completionTime = time;
                currentPid = null;
                continue;
            }

            // I/O burst trigger
            const triggerIO =
                running.ioBurstsDone < running.ioCount &&
                running.cpuUsedSinceLastIO >= running.chunkSize;

            if (triggerIO) {
                running.state = "waiting";
                running.ioRemainingThisBlock = running.ioBurstTime;
                running.cpuUsedSinceLastIO = 0;
                currentPid = null;
                continue;
            }

            // Quantum expired
            if (
                (algo === "RR" || algo === "PRIORITY_RR") &&
                running.quantumUsed >= quantum
            ) {
                running.state = "ready";
                currentPid = null;
                continue;
            }

            // SRJF re-evaluates each tick
            if (algo === "SRJF") {
                running.state = "ready";
                currentPid = null;
                continue;
            }

            // FCFS: keep running, do nothing
        }

        return { gantt, totalTime: time };
    }

    private pickNext(
        states: SimState[],
        algo: SchedulerConfig["algorithm"],
    ): SimState | undefined {
        const ready = states.filter((s) => s.state === "ready");
        if (ready.length === 0) return undefined;

        switch (algo) {
            case "FCFS":
                return ready.sort(
                    (a, b) =>
                        a.arrivalTime - b.arrivalTime || a.pid - b.pid,
                )[0];
            case "RR":
                // FIFO of ready queue; we approximate by arrival/PID order
                return ready.sort((a, b) => a.pid - b.pid)[0];
            case "PRIORITY_RR":
                return ready.sort(
                    (a, b) => b.priority - a.priority || a.pid - b.pid,
                )[0];
            case "SRJF":
                return ready.sort(
                    (a, b) => a.remaining - b.remaining || a.pid - b.pid,
                )[0];
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private toSimState(p: PCB): SimState {
        const ioCount = Math.max(0, p.ioCount ?? 0);
        const ioBurstTime = Math.max(0, p.ioBurstTime ?? 0);
        const chunkSize =
            ioCount > 0 ? Math.max(1, Math.ceil(p.burstTime / (ioCount + 1))) : p.burstTime;

        return {
            pid: p.pid,
            name: p.name,
            color: p.color,
            arrivalTime: p.arrivalTime,
            burstTime: p.burstTime,
            remaining: p.burstTime,
            basePriority: p.basePriority ?? p.priority,
            priority: p.priority,
            ioCount,
            ioBurstTime,
            ioRemainingThisBlock: 0,
            ioBurstsDone: 0,
            cpuUsedSinceLastIO: 0,
            chunkSize,
            state: "future",
            firstRunAt: null,
            completionTime: null,
            waitTimeInReady: 0,
            quantumUsed: 0,
        };
    }

    private calcMetrics(procs: PCB[], totalTime: number): SchedulerMetrics {
        const n = procs.length;
        if (n === 0 || totalTime === 0) {
            return {
                averageWaitingTime: 0,
                averageTurnaroundTime: 0,
                averageResponseTime: 0,
                cpuUtilization: 0,
                throughput: 0,
                totalTime,
            };
        }
        const totalCPUDemand = procs.reduce((s, p) => s + p.burstTime, 0);
        return {
            averageWaitingTime:
                procs.reduce((s, p) => s + p.waitingTime, 0) / n,
            averageTurnaroundTime:
                procs.reduce((s, p) => s + p.turnaroundTime, 0) / n,
            averageResponseTime:
                procs.reduce((s, p) => s + p.responseTime, 0) / n,
            cpuUtilization: (totalCPUDemand / totalTime) * 100,
            throughput: n / totalTime,
            totalTime,
        };
    }
}
