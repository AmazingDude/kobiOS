import type {
    ExperimentResult,
    ExperimentRow,
    PCB,
    SchedulerAlgorithm,
    SchedulerConfig,
    WorkloadDefinition,
} from "../types";
import { Scheduler } from "./Scheduler";

const PROCESS_COLORS = [
    "#6366f1",
    "#ec4899",
    "#14b8a6",
    "#f59e0b",
    "#84cc16",
    "#3b82f6",
    "#f97316",
    "#a855f7",
];

const ALGORITHMS: SchedulerAlgorithm[] = [
    "FCFS",
    "RR",
    "PRIORITY_RR",
    "SRJF",
];

/**
 * Pre-defined workloads used by the Experiments window and the test suite.
 *
 * - cpu-bound:   long CPU bursts, no I/O.
 * - io-bound:    short CPU bursts split by I/O waits (lots of context switches
 *                will help; FCFS will be the worst).
 * - mixed:       some CPU-bound, some I/O-bound, some in between.
 */
export const WORKLOADS: WorkloadDefinition[] = [
    {
        id: "cpu-bound",
        label: "CPU-bound",
        description:
            "Four long CPU-only processes — measures pure CPU scheduling.",
        processes: [
            {
                name: "CPU-1",
                burstTime: 20,
                priority: 5,
                arrivalTime: 0,
                workloadType: "cpu",
                ioBurstTime: 0,
                ioCount: 0,
            },
            {
                name: "CPU-2",
                burstTime: 18,
                priority: 4,
                arrivalTime: 1,
                workloadType: "cpu",
                ioBurstTime: 0,
                ioCount: 0,
            },
            {
                name: "CPU-3",
                burstTime: 22,
                priority: 5,
                arrivalTime: 2,
                workloadType: "cpu",
                ioBurstTime: 0,
                ioCount: 0,
            },
            {
                name: "CPU-4",
                burstTime: 15,
                priority: 3,
                arrivalTime: 3,
                workloadType: "cpu",
                ioBurstTime: 0,
                ioCount: 0,
            },
        ],
    },
    {
        id: "io-bound",
        label: "I/O-bound",
        description:
            "Five processes with short CPU bursts and frequent I/O waits.",
        processes: [
            {
                name: "IO-1",
                burstTime: 6,
                priority: 2,
                arrivalTime: 0,
                workloadType: "io",
                ioBurstTime: 4,
                ioCount: 2,
            },
            {
                name: "IO-2",
                burstTime: 6,
                priority: 2,
                arrivalTime: 1,
                workloadType: "io",
                ioBurstTime: 4,
                ioCount: 2,
            },
            {
                name: "IO-3",
                burstTime: 5,
                priority: 1,
                arrivalTime: 0,
                workloadType: "io",
                ioBurstTime: 5,
                ioCount: 2,
            },
            {
                name: "IO-4",
                burstTime: 4,
                priority: 2,
                arrivalTime: 2,
                workloadType: "io",
                ioBurstTime: 3,
                ioCount: 2,
            },
            {
                name: "IO-5",
                burstTime: 6,
                priority: 1,
                arrivalTime: 3,
                workloadType: "io",
                ioBurstTime: 4,
                ioCount: 2,
            },
        ],
    },
    {
        id: "mixed",
        label: "Mixed",
        description:
            "A realistic mix of CPU-bound, I/O-bound, and balanced processes.",
        processes: [
            {
                name: "CPU-A",
                burstTime: 16,
                priority: 5,
                arrivalTime: 0,
                workloadType: "cpu",
                ioBurstTime: 0,
                ioCount: 0,
            },
            {
                name: "IO-A",
                burstTime: 6,
                priority: 2,
                arrivalTime: 1,
                workloadType: "io",
                ioBurstTime: 4,
                ioCount: 2,
            },
            {
                name: "CPU-B",
                burstTime: 12,
                priority: 4,
                arrivalTime: 2,
                workloadType: "cpu",
                ioBurstTime: 0,
                ioCount: 0,
            },
            {
                name: "IO-B",
                burstTime: 6,
                priority: 1,
                arrivalTime: 0,
                workloadType: "io",
                ioBurstTime: 5,
                ioCount: 2,
            },
            {
                name: "MIX-1",
                burstTime: 10,
                priority: 3,
                arrivalTime: 3,
                workloadType: "mixed",
                ioBurstTime: 3,
                ioCount: 1,
            },
        ],
    },
];

let pcbPidCounter = 10000;

function workloadToPCBs(def: WorkloadDefinition): PCB[] {
    return def.processes.map((spec, i) => ({
        pid: pcbPidCounter++,
        name: spec.name,
        state: "new" as const,
        isProtected: false,
        priority: spec.priority,
        basePriority: spec.priority,
        burstTime: spec.burstTime,
        remainingTime: spec.burstTime,
        arrivalTime: spec.arrivalTime,
        waitingTime: 0,
        turnaroundTime: 0,
        responseTime: 0,
        color: PROCESS_COLORS[i % PROCESS_COLORS.length],
        workloadType: spec.workloadType,
        ioBurstTime: spec.ioBurstTime,
        ioCount: spec.ioCount,
        threadCount: 1,
    }));
}

/**
 * Run every algorithm against every workload and return aggregated results.
 *
 * `quantum` is used for RR / PRIORITY_RR. Aging is on by default so the
 * comparison is fair against the textbook description.
 */
export function runExperiments(
    quantum: number = 2,
    workloads: WorkloadDefinition[] = WORKLOADS,
    algorithms: SchedulerAlgorithm[] = ALGORITHMS,
): ExperimentResult {
    const rows: ExperimentRow[] = [];

    for (const def of workloads) {
        for (const algo of algorithms) {
            const procs = workloadToPCBs(def);
            const config: SchedulerConfig = {
                algorithm: algo,
                timeQuantum: quantum,
                priorityAging: true,
                agingThreshold: 5,
            };
            const scheduler = new Scheduler(config);
            const { metrics } = scheduler.run(procs);
            rows.push({
                workloadId: def.id,
                workloadLabel: def.label,
                algorithm: algo,
                metrics,
            });
        }
    }

    return { rows, ranAt: Date.now() };
}

export function findExperimentRow(
    result: ExperimentResult,
    workloadId: string,
    algorithm: SchedulerAlgorithm,
): ExperimentRow | undefined {
    return result.rows.find(
        (r) => r.workloadId === workloadId && r.algorithm === algorithm,
    );
}
