// Process & Thread

export type ProcessState =
    | "new"
    | "ready"
    | "running"
    | "waiting"
    | "terminated";

export interface PCB {
    pid: number;
    name: string;
    state: ProcessState;
    priority: number;
    burstTime: number;
    remainingTime: number;
    arrivalTime: number;
    waitingTime: number;
    turnaroundTime: number;
    completionTime?: number;
    color: string; // for UI visualization
}

export interface TCB {
    tid: number;
    pid: number; // parent process
    state: ProcessState;
    stackPointer: number; // simulated
}

// ─── Scheduling ─────────────────────────────────────────────────

export type SchedulerAlgorithm = "FCFS" | "RR" | "PRIORITY";

export interface SchedulerConfig {
    algorithm: SchedulerAlgorithm;
    timeQuantum: number; // for Round Robin
}

export interface GanttEntry {
    pid: number;
    name: string;
    color: string;
    startTime: number;
    endTime: number;
}

export interface SchedulerMetrics {
    averageWaitingTime: number;
    averageTurnaroundTime: number;
    cpuUtilization: number;
    throughput: number;
}

// Memory

export type PageReplacementPolicy = "FIFO" | "LRU";

export interface MemoryFrame {
    frameId: number;
    pid: number | null; // null = free
    pageNumber: number | null;
    color: string | null;
}

export interface PageTableEntry {
    pageNumber: number;
    frameId: number | null; // null = not in memory (page fault)
    valid: boolean;
}

export interface MemoryStats {
    totalFrames: number;
    usedFrames: number;
    freeFrames: number;
    pageFaults: number;
}

// Synchronization

export type SemaphoreState = "locked" | "unlocked";

export interface SemaphoreInfo {
    id: string;
    name: string;
    value: number;
    waitingQueue: number[]; // list of PIDs waiting
}

// System

export interface SystemStats {
    cpuUsage: number;
    memoryUsage: number;
    runningProcesses: number;
    uptime: number; // in seconds
}
