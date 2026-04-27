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
    TCB,
    RAGState,
    DeadlockResult,
    ExperimentResult,
    WorkloadType,
    ThreadState,
} from "../types";
import { ProcessManager } from "../kernel/ProcessManager";
import { Scheduler } from "../kernel/Scheduler";
import { MemoryManager } from "../kernel/MemoryManager";
import { Mutex, Semaphore } from "../kernel/Semaphore";
import { ThreadManager } from "../kernel/ThreadManager";
import { DeadlockDetector } from "../kernel/DeadlockDetector";
import { runExperiments } from "../kernel/ExperimentRunner";

const pm = new ProcessManager();
const scheduler = new Scheduler({
    algorithm: "FCFS",
    timeQuantum: 2,
    priorityAging: false,
    agingThreshold: 5,
});
const mm = new MemoryManager();
const mutex = new Mutex();
const semaphore = new Semaphore(1, "main");
const tm = new ThreadManager();
const deadlock = new DeadlockDetector();

interface SpawnExtras {
    workloadType?: WorkloadType;
    ioBurstTime?: number;
    ioCount?: number;
    threadCount?: number;
}

interface KernelStore {
    processes: PCB[];
    threads: TCB[];
    gantt: GanttEntry[];
    metrics: SchedulerMetrics | null;
    latestSchedulerSnapshot: SchedulerSnapshot | null;
    schedulerConfig: SchedulerConfig;
    memoryFrames: MemoryFrame[];
    memoryStats: MemoryStats;
    pageFaults: number;
    memoryPolicy: PageReplacementPolicy;
    semaphoreState: {
        locked: boolean;
        owner: number | null;
        waitingQueue: number[];
    };
    semaphoreValue: number;
    deadlockState: RAGState;
    deadlockResult: DeadlockResult | null;
    latestExperiment: ExperimentResult | null;

    spawnProcess: (
        name: string,
        burst: number,
        priority?: number,
        arrival?: number,
        isProtected?: boolean,
        extras?: SpawnExtras,
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

    spawnThread: (pid: number, name?: string) => void;
    setThreadState: (tid: number, state: ThreadState) => void;
    tickThreads: (pid: number) => void;

    ragAllocate: (pid: number, resourceId: string) => void;
    ragRequest: (pid: number, resourceId: string) => void;
    ragRelease: (pid: number, resourceId: string) => void;
    detectDeadlock: () => DeadlockResult;
    resetRAG: () => void;
    loadDeadlockExample: () => void;

    runExperimentSuite: (quantum?: number) => ExperimentResult;

    resetMemory: () => void;
    resetAll: () => void;
}

function refreshThreadView(): TCB[] {
    return tm.getAllThreads().map((t) => ({
        ...t,
        registers: { ...t.registers },
    }));
}

export const useKernelStore = create<KernelStore>((set, get) => ({
    processes: [],
    threads: [],
    gantt: [],
    metrics: null,
    latestSchedulerSnapshot: null,
    schedulerConfig: {
        algorithm: "FCFS",
        timeQuantum: 2,
        priorityAging: false,
        agingThreshold: 5,
    },
    memoryFrames: mm.getFrames(),
    memoryStats: mm.getStats(),
    pageFaults: mm.getStats().pageFaults,
    memoryPolicy: "FIFO",
    semaphoreState: mutex.getState(),
    semaphoreValue: semaphore.getValue(),
    deadlockState: deadlock.getState(),
    deadlockResult: null,
    latestExperiment: null,

    // -------------------------------------------------------------------------
    // Process lifecycle
    // -------------------------------------------------------------------------

    spawnProcess: (
        name,
        burst,
        priority = 1,
        arrival = 0,
        isProtected = false,
        extras = {},
    ) => {
        const pcb = pm.createProcess(name, burst, {
            priority,
            arrivalTime: arrival,
            isProtected,
            workloadType: extras.workloadType,
            ioBurstTime: extras.ioBurstTime,
            ioCount: extras.ioCount,
            threadCount: extras.threadCount,
        });
        const pages = Math.floor(Math.random() * 4) + 1;
        mm.allocatePages(pcb.pid, pages, pcb.color);
        tm.spawnThreadsForProcess(
            pcb.pid,
            pcb.name,
            pcb.threadCount,
            pcb.priority,
            Math.max(1, get().schedulerConfig.timeQuantum),
        );
        const stats = mm.getStats();

        set({
            processes: pm.getAllProcesses(),
            threads: refreshThreadView(),
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
        if (pm.isProtected(pid)) return;
        pm.killProcess(pid);
        mm.deallocatePages(pid);
        tm.killThreadsOfProcess(pid);
        deadlock.removeProcess(pid);
        const stats = mm.getStats();
        set({
            processes: pm.getAllProcesses(),
            threads: refreshThreadView(),
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
            deadlockState: deadlock.getState(),
        });
    },

    // -------------------------------------------------------------------------
    // Scheduling
    // -------------------------------------------------------------------------

    runScheduler: () => {
        const active = get().processes.filter((p) => p.state !== "terminated");
        if (active.length === 0) return;

        const { gantt, metrics } = scheduler.run(active);

        const updatedProcesses = pm.getAllProcesses();
        const snapshot: SchedulerSnapshot = {
            algorithm: get().schedulerConfig.algorithm,
            timeQuantum: get().schedulerConfig.timeQuantum,
            priorityAging: get().schedulerConfig.priorityAging,
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
                    responseTime: p.responseTime,
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

    // -------------------------------------------------------------------------
    // Memory
    // -------------------------------------------------------------------------

    allocateMemory: (pid, numPages) => {
        const color =
            get().processes.find((p) => p.pid === pid)?.color ?? "#6366f1";
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
        set({ memoryPolicy: policy });
    },

    // -------------------------------------------------------------------------
    // Synchronization
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Threads
    // -------------------------------------------------------------------------

    spawnThread: (pid, name) => {
        const proc = get().processes.find((p) => p.pid === pid);
        if (!proc) return;
        const threadName =
            name ?? `${proc.name}-T${tm.getThreadsOf(pid).length}`;
        tm.spawnThread(
            pid,
            threadName,
            proc.priority,
            Math.max(1, get().schedulerConfig.timeQuantum),
        );
        set({ threads: refreshThreadView() });
    },

    setThreadState: (tid, state) => {
        tm.setThreadState(tid, state);
        set({ threads: refreshThreadView() });
    },

    tickThreads: (pid) => {
        tm.tick(pid);
        set({ threads: refreshThreadView() });
    },

    // -------------------------------------------------------------------------
    // Deadlock
    // -------------------------------------------------------------------------

    ragAllocate: (pid, resourceId) => {
        deadlock.allocate(pid, resourceId);
        set({
            deadlockState: deadlock.getState(),
            deadlockResult: null,
        });
    },

    ragRequest: (pid, resourceId) => {
        deadlock.request(pid, resourceId);
        set({
            deadlockState: deadlock.getState(),
            deadlockResult: null,
        });
    },

    ragRelease: (pid, resourceId) => {
        deadlock.release(pid, resourceId);
        set({
            deadlockState: deadlock.getState(),
            deadlockResult: null,
        });
    },

    detectDeadlock: () => {
        const result = deadlock.detect();
        set({ deadlockResult: result });
        return result;
    },

    resetRAG: () => {
        deadlock.reset();
        set({
            deadlockState: deadlock.getState(),
            deadlockResult: null,
        });
    },

    loadDeadlockExample: () => {
        deadlock.reset();
        // Classic 4-process / 4-resource circular wait example.
        deadlock.allocate(1, "R1");
        deadlock.allocate(2, "R2");
        deadlock.allocate(3, "R3");
        deadlock.allocate(4, "R4");
        deadlock.request(1, "R2");
        deadlock.request(2, "R3");
        deadlock.request(3, "R4");
        deadlock.request(4, "R1");
        set({
            deadlockState: deadlock.getState(),
            deadlockResult: null,
        });
    },

    // -------------------------------------------------------------------------
    // Experiments
    // -------------------------------------------------------------------------

    runExperimentSuite: (quantum = 2) => {
        const result = runExperiments(quantum);
        set({ latestExperiment: result });
        return result;
    },

    // -------------------------------------------------------------------------
    // Resets
    // -------------------------------------------------------------------------

    resetMemory: () => {
        mm.reset();
        set({
            memoryFrames: mm.getFrames(),
            memoryStats: mm.getStats(),
            pageFaults: mm.getStats().pageFaults,
            memoryPolicy: mm.getPolicy(),
        });
    },

    resetAll: () => {
        pm.reset();
        mm.reset();
        mutex.reset();
        semaphore.reset();
        tm.reset();
        deadlock.reset();
        const stats = mm.getStats();
        set({
            processes: [],
            threads: [],
            gantt: [],
            metrics: null,
            latestSchedulerSnapshot: null,
            memoryFrames: mm.getFrames(),
            memoryStats: stats,
            pageFaults: stats.pageFaults,
            memoryPolicy: mm.getPolicy(),
            semaphoreState: mutex.getState(),
            semaphoreValue: semaphore.getValue(),
            deadlockState: deadlock.getState(),
            deadlockResult: null,
            latestExperiment: null,
        });
    },
}));
