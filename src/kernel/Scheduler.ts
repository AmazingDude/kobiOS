import type {
    PCB,
    GanttEntry,
    SchedulerConfig,
    SchedulerMetrics,
} from "../types";

export class Scheduler {
    private config: SchedulerConfig;

    constructor(config: SchedulerConfig) {
        this.config = config;
    }

    setConfig(config: SchedulerConfig) {
        this.config = config;
    }

    // Returns gantt chart entries + updates PCB metrics in place
    run(processes: PCB[]): { gantt: GanttEntry[]; metrics: SchedulerMetrics } {
        // deep clone so we don't mutate originals
        const procs = processes.map((p) => ({
            ...p,
            remainingTime: p.burstTime,
        }));

        switch (this.config.algorithm) {
            case "FCFS":
                return this.fcfs(procs);
            case "RR":
                return this.roundRobin(procs);
            case "PRIORITY_RR":
                return this.priorityRoundRobin(procs);
            case "SRJF":
                return this.srjf(procs);
            default:
                return this.priority(procs);
        }
    }

    private fcfs(procs: PCB[]): {
        gantt: GanttEntry[];
        metrics: SchedulerMetrics;
    } {
        const gantt: GanttEntry[] = [];
        const sorted = [...procs].sort((a, b) => a.arrivalTime - b.arrivalTime);
        let time = 0;

        for (const p of sorted) {
            if (time < p.arrivalTime) time = p.arrivalTime;
            p.waitingTime = time - p.arrivalTime;
            gantt.push({
                pid: p.pid,
                name: p.name,
                color: p.color,
                startTime: time,
                endTime: time + p.burstTime,
            });
            time += p.burstTime;
            p.turnaroundTime = p.waitingTime + p.burstTime;
        }

        return { gantt, metrics: this.calcMetrics(sorted, time) };
    }

    private roundRobin(procs: PCB[]): {
        gantt: GanttEntry[];
        metrics: SchedulerMetrics;
    } {
        const gantt: GanttEntry[] = [];
        const q = this.config.timeQuantum;
        const queue = [...procs].sort((a, b) => a.arrivalTime - b.arrivalTime);
        let time = 0;
        const remaining = new Map(queue.map((p) => [p.pid, p.burstTime]));
        const ready: PCB[] = [];
        const arrived = new Set<number>();
        let i = 0;

        while (true) {
            // add newly arrived
            while (i < queue.length && queue[i].arrivalTime <= time) {
                ready.push(queue[i]);
                arrived.add(queue[i].pid);
                i++;
            }
            if (ready.length === 0) {
                if (i < queue.length) {
                    time = queue[i].arrivalTime;
                    continue;
                }
                break;
            }

            const p = ready.shift()!;
            const rem = remaining.get(p.pid)!;
            const exec = Math.min(rem, q);

            gantt.push({
                pid: p.pid,
                name: p.name,
                color: p.color,
                startTime: time,
                endTime: time + exec,
            });
            time += exec;
            remaining.set(p.pid, rem - exec);

            // add any newly arrived during this slice
            while (i < queue.length && queue[i].arrivalTime <= time) {
                ready.push(queue[i]);
                i++;
            }

            if (rem - exec > 0) ready.push(p);
            else {
                p.turnaroundTime = time - p.arrivalTime;
                p.waitingTime = p.turnaroundTime - p.burstTime;
            }
        }

        return { gantt, metrics: this.calcMetrics(queue, time) };
    }

    private priority(procs: PCB[]): {
        gantt: GanttEntry[];
        metrics: SchedulerMetrics;
    } {
        const gantt: GanttEntry[] = [];
        const sorted = [...procs].sort((a, b) =>
            a.arrivalTime !== b.arrivalTime
                ? a.arrivalTime - b.arrivalTime
                : b.priority - a.priority,
        );
        let time = 0;
        const done = new Set<number>();

        while (done.size < sorted.length) {
            const available = sorted.filter(
                (p) => p.arrivalTime <= time && !done.has(p.pid),
            );
            if (available.length === 0) {
                time++;
                continue;
            }

            const p = available.sort((a, b) => b.priority - a.priority)[0];
            p.waitingTime = time - p.arrivalTime;
            gantt.push({
                pid: p.pid,
                name: p.name,
                color: p.color,
                startTime: time,
                endTime: time + p.burstTime,
            });
            time += p.burstTime;
            p.turnaroundTime = p.waitingTime + p.burstTime;
            done.add(p.pid);
        }

        return { gantt, metrics: this.calcMetrics(sorted, time) };
    }

    private priorityRoundRobin(procs: PCB[]): {
        gantt: GanttEntry[];
        metrics: SchedulerMetrics;
    } {
        const gantt: GanttEntry[] = [];
        const q = this.config.timeQuantum;
        const queue = [...procs].sort((a, b) => a.arrivalTime - b.arrivalTime);
        const remaining = new Map(queue.map((p) => [p.pid, p.burstTime]));
        const ready: PCB[] = [];
        let time = 0;
        let i = 0;

        while (true) {
            while (i < queue.length && queue[i].arrivalTime <= time) {
                ready.push(queue[i]);
                i++;
            }

            if (ready.length === 0) {
                if (i < queue.length) {
                    time = queue[i].arrivalTime;
                    continue;
                }
                break;
            }

            // Highest priority first; ties handled by ready queue order (RR behavior).
            ready.sort((a, b) => b.priority - a.priority);
            const p = ready.shift()!;
            const rem = remaining.get(p.pid)!;
            const exec = Math.min(rem, q);

            gantt.push({
                pid: p.pid,
                name: p.name,
                color: p.color,
                startTime: time,
                endTime: time + exec,
            });

            time += exec;
            remaining.set(p.pid, rem - exec);

            while (i < queue.length && queue[i].arrivalTime <= time) {
                ready.push(queue[i]);
                i++;
            }

            if (rem - exec > 0) {
                ready.push(p);
            } else {
                p.turnaroundTime = time - p.arrivalTime;
                p.waitingTime = p.turnaroundTime - p.burstTime;
            }
        }

        return { gantt, metrics: this.calcMetrics(queue, time) };
    }

    private srjf(procs: PCB[]): {
        gantt: GanttEntry[];
        metrics: SchedulerMetrics;
    } {
        const gantt: GanttEntry[] = [];
        const queue = [...procs].sort((a, b) => a.arrivalTime - b.arrivalTime);
        const remaining = new Map(queue.map((p) => [p.pid, p.burstTime]));
        let time = 0;
        let completed = 0;

        while (completed < queue.length) {
            const available = queue
                .filter(
                    (p) =>
                        p.arrivalTime <= time &&
                        (remaining.get(p.pid) ?? 0) > 0,
                )
                .sort(
                    (a, b) =>
                        (remaining.get(a.pid) ?? 0) -
                        (remaining.get(b.pid) ?? 0),
                );

            if (available.length === 0) {
                time++;
                continue;
            }

            const p = available[0];
            const rem = remaining.get(p.pid)!;
            const last = gantt[gantt.length - 1];

            if (last && last.pid === p.pid && last.endTime === time) {
                last.endTime += 1;
            } else {
                gantt.push({
                    pid: p.pid,
                    name: p.name,
                    color: p.color,
                    startTime: time,
                    endTime: time + 1,
                });
            }

            remaining.set(p.pid, rem - 1);
            time += 1;

            if (rem - 1 === 0) {
                completed++;
                p.completionTime = time;
                p.turnaroundTime = time - p.arrivalTime;
                p.waitingTime = p.turnaroundTime - p.burstTime;
            }
        }

        return { gantt, metrics: this.calcMetrics(queue, time) };
    }

    private calcMetrics(procs: PCB[], totalTime: number): SchedulerMetrics {
        const n = procs.length;
        const totalBurst = procs.reduce((s, p) => s + p.burstTime, 0);
        return {
            averageWaitingTime:
                procs.reduce((s, p) => s + p.waitingTime, 0) / n,
            averageTurnaroundTime:
                procs.reduce((s, p) => s + p.turnaroundTime, 0) / n,
            cpuUtilization: (totalBurst / totalTime) * 100,
            throughput: n / totalTime,
        };
    }
}
