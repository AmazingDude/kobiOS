import { create } from "zustand";
import type {
    PCB,
    SchedulerConfig,
    GanttEntry,
    SchedulerMetrics,
} from "../types";
import { ProcessManager } from "../kernel/ProcessManager";
import { Scheduler } from "../kernel/Scheduler";

const pm = new ProcessManager();
const scheduler = new Scheduler({ algorithm: "FCFS", timeQuantum: 2 });

interface KernelStore {
    processes: PCB[];
    gantt: GanttEntry[];
    metrics: SchedulerMetrics | null;
    schedulerConfig: SchedulerConfig;

    spawnProcess: (
        name: string,
        burst: number,
        priority?: number,
        arrival?: number,
    ) => void;
    killProcess: (pid: number) => void;
    runScheduler: () => void;
    setSchedulerConfig: (config: SchedulerConfig) => void;
    resetAll: () => void;
}

export const useKernelStore = create<KernelStore>((set, get) => ({
    processes: [],
    gantt: [],
    metrics: null,
    schedulerConfig: { algorithm: "FCFS", timeQuantum: 2 },

    spawnProcess: (name, burst, priority = 1, arrival = 0) => {
        pm.createProcess(name, burst, priority, arrival);
        set({ processes: pm.getAllProcesses() });
    },

    killProcess: (pid) => {
        pm.killProcess(pid);
        set({ processes: pm.getAllProcesses() });
    },

    runScheduler: () => {
        const active = get().processes.filter((p) => p.state !== "terminated");
        const { gantt, metrics } = scheduler.run(active);
        set({ gantt, metrics });
    },

    setSchedulerConfig: (config) => {
        scheduler.setConfig(config);
        set({ schedulerConfig: config });
    },

    resetAll: () => {
        pm.reset();
        set({ processes: [], gantt: [], metrics: null });
    },
}));
