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
    color: string;
}

export interface TCB {
    tid: number;
    pid: number;
    state: ProcessState;
    stackPointer: number;
}

export type SchedulerAlgorithm = "FCFS" | "RR" | "PRIORITY_RR" | "SRJF";

export interface SchedulerConfig {
    algorithm: SchedulerAlgorithm;
    timeQuantum: number;
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

export interface SchedulerProcessState {
    pid: number;
    name: string;
    waitingTime: number;
    turnaroundTime: number;
    completionTime: number;
    responseTime: number;
}

export interface SchedulerSnapshot {
    algorithm: SchedulerAlgorithm;
    timeQuantum: number;
    gantt: GanttEntry[];
    metrics: SchedulerMetrics;
    processStates: SchedulerProcessState[];
    ranAt: number;
}

// Memory

export type PageReplacementPolicy = "FIFO" | "LRU";

export interface MemoryFrame {
    frameId: number;
    pid: number | null;
    pageNumber: number | null;
    color: string | null;
}

export interface PageTableEntry {
    pageNumber: number;
    frameId: number | null;
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
    waitingQueue: number[];
}

// System

export interface SystemStats {
    cpuUsage: number;
    memoryUsage: number;
    runningProcesses: number;
    uptime: number;
}
