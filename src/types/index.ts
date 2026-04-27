// =============================================================================
// kobiOS — Kernel Type Definitions
// =============================================================================

// -----------------------------------------------------------------------------
// Process & Thread
// -----------------------------------------------------------------------------

export type ProcessState =
    | "new"
    | "ready"
    | "running"
    | "waiting"
    | "terminated";

export type WorkloadType = "cpu" | "io" | "mixed";

export interface PCB {
    pid: number;
    name: string;
    state: ProcessState;
    isProtected: boolean;
    priority: number;
    basePriority: number;
    burstTime: number;
    remainingTime: number;
    arrivalTime: number;
    waitingTime: number;
    turnaroundTime: number;
    responseTime: number;
    completionTime?: number;
    firstResponseAt?: number;
    color: string;
    workloadType: WorkloadType;
    ioBurstTime: number;
    ioCount: number;
    threadCount: number;
}

export type ThreadState = "ready" | "running" | "waiting" | "terminated";

export interface TCB {
    tid: number;
    pid: number;
    name: string;
    state: ThreadState;
    stackPointer: number;
    programCounter: number;
    registers: { r0: number; r1: number; r2: number; r3: number };
    priority: number;
    cpuTimeUsed: number;
    quantum: number;
}

// -----------------------------------------------------------------------------
// Scheduling
// -----------------------------------------------------------------------------

export type SchedulerAlgorithm = "FCFS" | "RR" | "PRIORITY_RR" | "SRJF";

export interface SchedulerConfig {
    algorithm: SchedulerAlgorithm;
    timeQuantum: number;
    priorityAging: boolean;
    agingThreshold: number;
}

export interface GanttEntry {
    pid: number;
    name: string;
    color: string;
    startTime: number;
    endTime: number;
    kind?: "cpu" | "io";
}

export interface SchedulerMetrics {
    averageWaitingTime: number;
    averageTurnaroundTime: number;
    averageResponseTime: number;
    cpuUtilization: number;
    throughput: number;
    totalTime: number;
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
    priorityAging: boolean;
    gantt: GanttEntry[];
    metrics: SchedulerMetrics;
    processStates: SchedulerProcessState[];
    ranAt: number;
}

// -----------------------------------------------------------------------------
// Memory
// -----------------------------------------------------------------------------

export type PageReplacementPolicy = "FIFO" | "LRU" | "OPTIMAL" | "CLOCK";

export interface MemoryFrame {
    frameId: number;
    pid: number | null;
    pageNumber: number | null;
    color: string | null;
    referenceBit?: boolean;
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
    pageHits: number;
}

export interface PageReferenceEvent {
    step: number;
    pid: number;
    pageNumber: number;
    fault: boolean;
    evictedFrameId?: number;
    evictedPid?: number;
    evictedPage?: number;
}

// -----------------------------------------------------------------------------
// Synchronization
// -----------------------------------------------------------------------------

export type SemaphoreState = "locked" | "unlocked";

export interface SemaphoreInfo {
    id: string;
    name: string;
    value: number;
    waitingQueue: number[];
}

// -----------------------------------------------------------------------------
// Deadlock detection (Resource Allocation Graph)
// -----------------------------------------------------------------------------

export interface RAGAllocation {
    resourceId: string;
    pid: number;
}

export interface RAGRequest {
    resourceId: string;
    pid: number;
}

export interface RAGState {
    resources: string[];
    processes: number[];
    allocations: RAGAllocation[];
    requests: RAGRequest[];
}

export interface DeadlockResult {
    deadlocked: boolean;
    cycle: number[];
    cycleResources: string[];
    victimPid: number | null;
    explanation: string;
}

// -----------------------------------------------------------------------------
// Experiment / workload comparison
// -----------------------------------------------------------------------------

export interface WorkloadProcessSpec {
    name: string;
    burstTime: number;
    priority: number;
    arrivalTime: number;
    workloadType: WorkloadType;
    ioBurstTime: number;
    ioCount: number;
}

export interface WorkloadDefinition {
    id: string;
    label: string;
    description: string;
    processes: WorkloadProcessSpec[];
}

export interface ExperimentRow {
    workloadId: string;
    workloadLabel: string;
    algorithm: SchedulerAlgorithm;
    metrics: SchedulerMetrics;
}

export interface ExperimentResult {
    rows: ExperimentRow[];
    ranAt: number;
}

// -----------------------------------------------------------------------------
// System
// -----------------------------------------------------------------------------

export interface SystemStats {
    cpuUsage: number;
    memoryUsage: number;
    runningProcesses: number;
    uptime: number;
}
