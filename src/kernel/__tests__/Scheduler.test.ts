import { describe, it, expect } from "vitest";
import { Scheduler } from "../Scheduler";
import type { PCB, SchedulerConfig } from "../../types";

function makePCB(
    pid: number,
    name: string,
    burstTime: number,
    arrivalTime = 0,
    priority = 1,
    extras: Partial<PCB> = {},
): PCB {
    return {
        pid,
        name,
        state: "new",
        isProtected: false,
        priority,
        basePriority: priority,
        burstTime,
        remainingTime: burstTime,
        arrivalTime,
        waitingTime: 0,
        turnaroundTime: 0,
        responseTime: 0,
        color: "#fff",
        workloadType: "cpu",
        ioBurstTime: 0,
        ioCount: 0,
        threadCount: 1,
        ...extras,
    };
}

function cfg(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
    return {
        algorithm: "FCFS",
        timeQuantum: 2,
        priorityAging: false,
        agingThreshold: 5,
        ...overrides,
    };
}

describe("Scheduler — FCFS", () => {
    it("runs processes in arrival order with no preemption", () => {
        const scheduler = new Scheduler(cfg({ algorithm: "FCFS" }));
        const procs = [
            makePCB(1, "P1", 4, 0),
            makePCB(2, "P2", 3, 1),
            makePCB(3, "P3", 2, 2),
        ];

        const { gantt, metrics } = scheduler.run(procs);

        expect(gantt[0].pid).toBe(1);
        expect(gantt.at(-1)?.pid).toBe(3);
        expect(procs.find((p) => p.pid === 1)?.completionTime).toBe(4);
        expect(procs.find((p) => p.pid === 2)?.completionTime).toBe(7);
        expect(procs.find((p) => p.pid === 3)?.completionTime).toBe(9);
        expect(metrics.totalTime).toBe(9);
        expect(metrics.cpuUtilization).toBeCloseTo(100, 0);
    });

    it("computes response time as firstRun - arrival", () => {
        const scheduler = new Scheduler(cfg({ algorithm: "FCFS" }));
        const procs = [makePCB(1, "P1", 5, 0), makePCB(2, "P2", 3, 0)];
        scheduler.run(procs);
        expect(procs[0].responseTime).toBe(0);
        expect(procs[1].responseTime).toBe(5);
    });
});

describe("Scheduler — Round Robin", () => {
    it("interleaves CPU between processes by quantum", () => {
        const scheduler = new Scheduler(
            cfg({ algorithm: "RR", timeQuantum: 2 }),
        );
        const procs = [
            makePCB(1, "P1", 4, 0),
            makePCB(2, "P2", 4, 0),
        ];
        const { gantt, metrics } = scheduler.run(procs);

        // first 2 ticks → P1, next 2 → P2, then P1 finishes, then P2.
        const pidOrder = gantt.map((e) => e.pid);
        expect(pidOrder[0]).toBe(1);
        expect(pidOrder).toContain(2);
        expect(metrics.totalTime).toBe(8);
    });
});

describe("Scheduler — SRJF", () => {
    it("preempts in favour of shorter remaining job", () => {
        const scheduler = new Scheduler(cfg({ algorithm: "SRJF" }));
        const procs = [
            makePCB(1, "Long", 8, 0),
            makePCB(2, "Short", 2, 1),
        ];
        scheduler.run(procs);
        const shortP = procs.find((p) => p.pid === 2)!;
        // P2 arrives at t=1 with burst 2; SRJF should let it finish at t=3
        expect(shortP.completionTime).toBe(3);
    });
});

describe("Scheduler — PRIORITY_RR with aging", () => {
    it("aging actually raises a starving process's priority above its base", () => {
        const cfgWithAging = cfg({
            algorithm: "PRIORITY_RR",
            timeQuantum: 1,
            priorityAging: true,
            agingThreshold: 2,
        });
        const scheduler = new Scheduler(cfgWithAging);
        const procs = [
            makePCB(1, "Hi", 8, 0, 10),
            makePCB(2, "Lo", 3, 0, 1),
        ];
        scheduler.run(procs);
        const lo = procs.find((p) => p.pid === 2)!;
        expect(lo.basePriority).toBe(1);
        // Aging should have raised Lo's priority above its base value.
        expect(lo.priority).toBeGreaterThan(lo.basePriority);
    });

    it("without aging, the high-priority process always runs first", () => {
        const scheduler = new Scheduler(
            cfg({
                algorithm: "PRIORITY_RR",
                timeQuantum: 1,
                priorityAging: false,
            }),
        );
        const procs = [
            makePCB(1, "Hi", 4, 0, 10),
            makePCB(2, "Lo", 4, 0, 1),
        ];
        scheduler.run(procs);
        const hi = procs.find((p) => p.pid === 1)!;
        const lo = procs.find((p) => p.pid === 2)!;
        // Lo cannot start before Hi is done.
        expect(lo.responseTime).toBeGreaterThanOrEqual(hi.completionTime ?? 0);
    });
});

describe("Scheduler — I/O bursts", () => {
    it("a single I/O-bound process takes longer than its raw CPU burst", () => {
        const scheduler = new Scheduler(cfg({ algorithm: "FCFS" }));
        const procs = [
            makePCB(1, "IO", 6, 0, 1, {
                ioBurstTime: 3,
                ioCount: 2,
                workloadType: "io",
            }),
        ];
        const { metrics } = scheduler.run(procs);
        // I/O time inflates the schedule beyond the raw 6-tick CPU burst.
        expect(metrics.totalTime).toBeGreaterThan(6);
        expect(procs[0].turnaroundTime).toBe(metrics.totalTime);
        // Pure I/O wait should not be counted as "ready-queue waiting time".
        expect(procs[0].waitingTime).toBe(0);
    });

    it("lets a second process use the CPU while the first is in I/O", () => {
        const scheduler = new Scheduler(cfg({ algorithm: "FCFS" }));
        const procs = [
            makePCB(1, "IO", 4, 0, 1, {
                ioBurstTime: 5,
                ioCount: 1,
                workloadType: "io",
            }),
            makePCB(2, "CPU", 4, 1, 1),
        ];
        const { gantt } = scheduler.run(procs);
        // P2 should run while P1 is blocked on I/O
        const p2Entries = gantt.filter((e) => e.pid === 2);
        expect(p2Entries.length).toBeGreaterThan(0);
        // P2 should start before P1 finishes
        const p1Done = procs.find((p) => p.pid === 1)?.completionTime ?? 0;
        const p2Start = p2Entries[0].startTime;
        expect(p2Start).toBeLessThan(p1Done);
    });
});

describe("Scheduler — metrics", () => {
    it("computes averages across processes", () => {
        const scheduler = new Scheduler(cfg({ algorithm: "FCFS" }));
        const procs = [
            makePCB(1, "P1", 4, 0),
            makePCB(2, "P2", 4, 0),
            makePCB(3, "P3", 4, 0),
        ];
        const { metrics } = scheduler.run(procs);
        expect(metrics.averageWaitingTime).toBeCloseTo((0 + 4 + 8) / 3, 5);
        expect(metrics.averageResponseTime).toBeCloseTo((0 + 4 + 8) / 3, 5);
        expect(metrics.averageTurnaroundTime).toBeCloseTo(
            (4 + 8 + 12) / 3,
            5,
        );
        expect(metrics.totalTime).toBe(12);
    });
});
