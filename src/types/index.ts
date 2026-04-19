// ============================================================
//  kobiOS — Central Type Definitions
//  All kernel types live here. Never redefine in other files.
// ============================================================

// ─── Process State ───────────────────────────────────────────
export type ProcessState = "new" | "ready" | "running" | "waiting" | "terminated"

// ─── Scheduling Algorithm ────────────────────────────────────
export type SchedulerAlgorithm = "FCFS" | "RR" | "PRIORITY_RR" | "SRJF"

// ─── Process Control Block (PCB) ─────────────────────────────
export interface PCB {
  pid: number
  name: string
  state: ProcessState
  priority: number
  burstTime: number
  remainingTime: number
  arrivalTime: number
  waitingTime: number
  turnaroundTime: number
  completionTime?: number
  color: string                 // hex color for UI visualization

  // Extended fields for process management
  parentPid: number | null      // null = root process (no parent)
  children: number[]            // PIDs of child processes spawned via fork()
  threads: number[]             // TIDs of threads belonging to this process
  programName: string           // the "app" this process is running (set by exec)
  cpuUsagePercent: number       // simulated CPU% (0–100), used by task manager
  memoryUsageKB: number         // simulated memory in KB
  openFileCount: number         // simulated open file descriptors
  createdAt: number             // simulation clock tick at process creation
  execHistory: string[]         // list of program names this PID has exec()'d into
  forkDepth: number             // how deep in the process tree (root = 0)
  isZombie: boolean             // true if terminated but parent hasn't wait()'d yet
  isOrphan: boolean             // true if parent terminated before this child
}

// ─── Thread Control Block (TCB) ──────────────────────────────
export interface TCB {
  tid: number
  pid: number                   // parent process PID
  state: ProcessState
  stackPointer: number          // simulated value
  name: string                  // descriptive thread name (e.g. "renderer", "compute")
  cpuUsagePercent: number       // per-thread simulated CPU%
  createdAt: number             // simulation clock tick
  terminatedAt: number | null   // null if still alive
  burstTime: number             // total burst for this thread
  remainingTime: number         // remaining burst
}

// ─── Scheduler Config ────────────────────────────────────────
export interface SchedulerConfig {
  algorithm: SchedulerAlgorithm
  timeQuantum: number           // used for RR and PRIORITY_RR
}

// ─── Gantt Entry ─────────────────────────────────────────────
export interface GanttEntry {
  pid: number
  name: string
  color: string
  startTime: number
  endTime: number
  algorithmUsed: SchedulerAlgorithm
  isPreempted: boolean          // true if process was preempted mid-burst
}

// ─── Scheduler Metrics ───────────────────────────────────────
export interface SchedulerMetrics {
  averageWaitingTime: number
  averageTurnaroundTime: number
  cpuUtilization: number
  throughput: number
}

// ─── Scheduler Snapshot (Gantt Gateway output) ───────────────
export interface SchedulerSnapshot {
  algorithm: SchedulerAlgorithm
  timeQuantum: number
  gantt: GanttEntry[]
  metrics: SchedulerMetrics
  processStates: Array<{
    pid: number
    name: string
    waitingTime: number
    turnaroundTime: number
    completionTime: number
    responseTime: number        // first time process got CPU
  }>
  ranAt: number                 // simulation clock when this was run
}

// ─── Memory ──────────────────────────────────────────────────
export type PageReplacementPolicy = "FIFO" | "LRU"

export interface MemoryFrame {
  frameId: number
  pid: number | null            // null = free frame
  pageNumber: number | null
  color: string | null
}

export interface PageTableEntry {
  pageNumber: number
  frameId: number | null        // null = page fault
  valid: boolean
}

export interface MemoryStats {
  totalFrames: number
  usedFrames: number
  freeFrames: number
  pageFaults: number
  pageHits: number
}

// ─── Synchronization ─────────────────────────────────────────
export interface SemaphoreInfo {
  id: string
  name: string
  value: number
  waitingQueue: number[]        // PIDs waiting
}

// ─── Process Tree ─────────────────────────────────────────────
export interface ProcessTreeNode {
  pid: number
  name: string
  programName: string
  state: ProcessState
  children: ProcessTreeNode[]
}

// ─── System Calls — Events ───────────────────────────────────
export interface ForkEvent {
  id: string
  parentPid: number
  childPid: number
  timestamp: number             // simulation clock tick
}

export interface ExecEvent {
  id: string
  pid: number
  oldProgram: string
  newProgram: string
  timestamp: number
}

export interface WaitEvent {
  id: string
  parentPid: number
  awaitedChildPid: number
  startedAt: number             // when wait() was called
  resolvedAt: number | null     // null if still waiting
}

// ─── Dummy App Types ─────────────────────────────────────────
export enum DummyAppType {
  CALCULATOR = "Calculator",
  BROWSER    = "WebBrowser",
  NOTEPAD    = "Notepad",
  EXPLORER   = "FileExplorer",
  SYSMON     = "SystemMonitor",
  DUMMY      = "DummyProcess",
}

export interface DummyAppConfig {
  appType: DummyAppType
  burstTime: number
  priority: number
  arrivalTime: number
  spawnChildProcesses: boolean  // some apps fork() child helper processes
}

// ─── Task Manager Snapshot (Task Manager Gateway output) ─────
export interface TaskManagerSnapshot {
  timestamp: number
  processes: Array<{
    pid: number
    parentPid: number | null
    name: string
    programName: string
    state: ProcessState
    priority: number
    cpuUsagePercent: number
    memoryUsageKB: number
    openFileCount: number
    threadCount: number
    threads: Array<{
      tid: number
      name: string
      state: ProcessState
      cpuUsagePercent: number
    }>
    forkDepth: number
    isZombie: boolean
    isOrphan: boolean
    createdAt: number
  }>
  systemCpuPercent: number
  systemMemoryUsedKB: number
  totalProcesses: number
  totalThreads: number
  zombieCount: number
}

// ─── System Stats ─────────────────────────────────────────────
export interface SystemStats {
  cpuUtilization: number
  totalMemoryKB: number
  usedMemoryKB: number
  totalProcesses: number
  totalThreads: number
  zombieProcesses: number
  orphanProcesses: number
  uptime: number                // simulation clock ticks since start
}
