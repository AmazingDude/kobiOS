import { create } from "zustand";
import type {
    PCB,
    ProcessState,
    SchedulerConfig,
    GanttEntry,
    SchedulerMetrics,
    SchedulerSnapshot,
    MemoryFrame,
    MemoryStats,
    PageReplacementPolicy,
} from "../types";
import { ProcessManager } from "../kernel/ProcessManager";
import { Scheduler } from "../kernel/Scheduler";
import { MemoryManager } from "../kernel/MemoryManager";
import { Mutex, Semaphore } from "../kernel/Semaphore";

const pm = new ProcessManager();
const scheduler = new Scheduler({ algorithm: "FCFS", timeQuantum: 2 });
const mm = new MemoryManager();
const mutex = new Mutex();
const semaphore = new Semaphore(1, "main");

interface KernelStore {
    processes: PCB[];
    gantt: GanttEntry[];
    metrics: SchedulerMetrics | null;
    latestSchedulerSnapshot: SchedulerSnapshot | null;
    schedulerConfig: SchedulerConfig;
    memoryFrames: MemoryFrame[];
    memoryStats: MemoryStats;
    pageFaults: number;
    semaphoreState: {
        locked: boolean;
        owner: number | null;
        waitingQueue: number[];
    };
    semaphoreValue: number;

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
    allocateMemory: (pid: number, numPages: number) => void;
    deallocateMemory: (pid: number) => void;
    accessPage: (pid: number, pageNumber: number) => void;
    setMemoryPolicy: (policy: PageReplacementPolicy) => void;
    acquireMutex: (pid: number) => void;
    releaseMutex: (pid: number) => void;
    waitSemaphore: (pid: number) => void;
    signalSemaphore: () => void;
    resetMemory: () => void;
    resetAll: () => void;
}

export const useKernelStore = create<KernelStore>((set, get) => ({
    processes: [],
    gantt: [],
    metrics: null,
    latestSchedulerSnapshot: null,
    schedulerConfig: { algorithm: "FCFS", timeQuantum: 2 },
    memoryFrames: mm.getFrames(),
    memoryStats: mm.getStats(),
    pageFaults: mm.getStats().pageFaults,
    semaphoreState: mutex.getState(),
    semaphoreValue: semaphore.getValue(),

    spawnProcess: (name, burst, priority = 1, arrival = 0) => {
        const pcb = pm.createProcess(name, burst, priority, arrival);
        const pages = Math.floor(Math.random() * 4) + 1;
        mm.allocatePages(pcb.pid, pages, pcb.color);
        const stats = mm.getStats();

        set({
            processes: pm.getAllProcesses(),
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
        });
    },

    updateState: (pid, state) => {
        pm.updateState(pid, state);
        set({ processes: pm.getAllProcesses() });
    },

    killProcess: (pid) => {
        pm.killProcess(pid);
        mm.deallocatePages(pid);
        const stats = mm.getStats();
        set({
            processes: pm.getAllProcesses(),
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
        });
    },

    runScheduler: () => {
        const active = get().processes.filter((p) => p.state !== "terminated");
        const { gantt, metrics } = scheduler.run(active);
        const completionByPid = new Map<number, number>();

        for (const entry of gantt) {
            const prev = completionByPid.get(entry.pid) ?? 0;
            if (entry.endTime > prev) completionByPid.set(entry.pid, entry.endTime);
        }

        for (const p of active) {
            const completionTime = completionByPid.get(p.pid) ?? p.arrivalTime;
            const turnaroundTime = Math.max(0, completionTime - p.arrivalTime);
            const waitingTime = Math.max(0, turnaroundTime - p.burstTime);
            const real = pm.getProcess(p.pid);
            if (real) {
                real.completionTime = completionTime;
                real.turnaroundTime = turnaroundTime;
                real.waitingTime = waitingTime;
                real.remainingTime = 0;
            }
        }

        const updatedProcesses = pm.getAllProcesses();
        const snapshot: SchedulerSnapshot = {
            algorithm: get().schedulerConfig.algorithm,
            timeQuantum: get().schedulerConfig.timeQuantum,
            gantt,
            metrics,
            processStates: updatedProcesses
                .filter((p) => p.state !== "terminated")
                .map((p) => ({
                pid: p.pid,
                name: p.name,
                waitingTime: p.waitingTime,
                turnaroundTime: p.turnaroundTime,
                completionTime: p.completionTime ?? 0,
                responseTime: 0,
            })),
            ranAt: Date.now(),
        };
        set({
            processes: updatedProcesses,
            gantt,
            metrics,
            latestSchedulerSnapshot: snapshot,
        });
    },

    setSchedulerConfig: (config) => {
        scheduler.setConfig(config);
        set({ schedulerConfig: config });
    },

    allocateMemory: (pid, numPages) => {
        const color = get().processes.find((p) => p.pid === pid)?.color ?? "#6366f1";
        mm.allocatePages(pid, numPages, color);
        const stats = mm.getStats();
        set({
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
        });
    },

    deallocateMemory: (pid) => {
        mm.deallocatePages(pid);
        const stats = mm.getStats();
        set({
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
        });
    },

    accessPage: (pid, pageNumber) => {
        mm.accessPage(pid, pageNumber);
        const stats = mm.getStats();
        set({
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
        });
    },

    setMemoryPolicy: (policy) => {
        mm.setPolicy(policy);
    },

    acquireMutex: (pid) => {
        mutex.acquire(pid);
        set({ semaphoreState: mutex.getState() });
    },

    releaseMutex: (pid) => {
        mutex.release(pid);
        set({ semaphoreState: mutex.getState() });
    },

    waitSemaphore: (pid) => {
        semaphore.wait(pid);
        set({ semaphoreValue: semaphore.getValue() });
    },

    signalSemaphore: () => {
        semaphore.signal();
        set({ semaphoreValue: semaphore.getValue() });
    },

    resetMemory: () => {
        mm.reset();
        set({
            memoryFrames: mm.getFrames(),
            memoryStats: mm.getStats(),
            pageFaults: mm.getStats().pageFaults,
        });
    },

    resetAll: () => {
        pm.reset();
        mm.reset();
        mutex.reset();
        semaphore.reset();
        const stats = mm.getStats();
        set({
            processes: [],
            gantt: [],
            metrics: null,
            latestSchedulerSnapshot: null,
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
            semaphoreState: mutex.getState(),
            semaphoreValue: semaphore.getValue(),
        });
    },
}));
