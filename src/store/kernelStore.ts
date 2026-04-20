import { create } from "zustand";
import type {
    PCB,
    ProcessState,
    SchedulerConfig,
    GanttEntry,
    SchedulerMetrics,
    SchedulerSnapshot,
} from "../types";
import { ProcessManager } from "../kernel/ProcessManager";
import { Scheduler } from "../kernel/Scheduler";

const pm = new ProcessManager();
const scheduler = new Scheduler({ algorithm: "FCFS", timeQuantum: 2 });

interface KernelStore {
    processes: PCB[];
    gantt: GanttEntry[];
    metrics: SchedulerMetrics | null;
    latestSchedulerSnapshot: SchedulerSnapshot | null;
    schedulerConfig: SchedulerConfig;

    spawnProcess: (
        name: string,
        burst: number,
        priority?: number,
        arrival?: number,
    ) => void;
    updateState: (pid: number, state: ProcessState) => void;
    killProcess: (pid: number) => void;
    runScheduler: () => void;
    setSchedulerConfig: (config: SchedulerConfig) => void;
    resetAll: () => void;
}

export const useKernelStore = create<KernelStore>((set, get) => ({
    processes: [],
    gantt: [],
    metrics: null,
    latestSchedulerSnapshot: null,
    schedulerConfig: { algorithm: "FCFS", timeQuantum: 2 },

    spawnProcess: (name, burst, priority = 1, arrival = 0) => {
        pm.createProcess(name, burst, priority, arrival);
        set({ processes: pm.getAllProcesses() });
    },

    updateState: (pid, state) => {
        pm.updateState(pid, state);
        set({ processes: pm.getAllProcesses() });
    },

    killProcess: (pid) => {
        pm.killProcess(pid);
        set({ processes: pm.getAllProcesses() });
    },

    runScheduler: () => {
        const active = get().processes.filter((p) => p.state !== "terminated");
        const { gantt, metrics } = scheduler.run(active);
        const snapshot: SchedulerSnapshot = {
            algorithm: get().schedulerConfig.algorithm,
            timeQuantum: get().schedulerConfig.timeQuantum,
            gantt,
            metrics,
            processStates: active.map((p) => ({
                pid: p.pid,
                name: p.name,
                waitingTime: p.waitingTime,
                turnaroundTime: p.turnaroundTime,
                completionTime: p.completionTime ?? 0,
                responseTime: 0,
            })),
            ranAt: Date.now(),
        };
        set({ gantt, metrics, latestSchedulerSnapshot: snapshot });
    },

    setSchedulerConfig: (config) => {
        scheduler.setConfig(config);
        set({ schedulerConfig: config });
    },

    resetAll: () => {
        pm.reset();
        set({
            processes: [],
            gantt: [],
            metrics: null,
            latestSchedulerSnapshot: null,
        });
    },
}));
