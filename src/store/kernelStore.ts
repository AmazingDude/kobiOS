// ============================================================
//  kobiOS — kernelStore (Zustand)
//  Single source of truth bridging kernel ↔ UI.
//  All kernel calls go through here.
// ============================================================

import { create } from "zustand"
import type {
  PCB,
  TCB,
  SchedulerConfig,
  SchedulerAlgorithm,
  SchedulerSnapshot,
  SchedulerMetrics,
  TaskManagerSnapshot,
  ProcessTreeNode,
  ForkEvent,
  ExecEvent,
  WaitEvent,
  DummyAppType,
  MemoryFrame,
  MemoryStats,
  SemaphoreInfo,
  SystemStats,
} from "../types/index"

// Kernel singletons
import { ProcessManager    } from "../kernel/ProcessManager"
import { ThreadManager     } from "../kernel/ThreadManager"
import { ProcessLifecycle  } from "../kernel/ProcessLifecycle"
import { Scheduler         } from "../kernel/Scheduler"
import { GanttGateway      } from "../kernel/GanttGateway"
import { TaskManagerGateway } from "../kernel/TaskManagerGateway"
import { bootstrapInit     } from "../kernel/InitProcess"
import { launchApp as kernelLaunchApp } from "../kernel/DummyApps"

// ── Kernel singleton instances ────────────────────────────────
const processManager     = new ProcessManager()
const threadManager      = new ThreadManager()
const lifecycle          = new ProcessLifecycle(processManager, threadManager)
const scheduler          = new Scheduler()
const ganttGateway       = new GanttGateway()
const taskManagerGateway = new TaskManagerGateway()

// Bootstrap PID 1 immediately on module load
let initPid = bootstrapInit(processManager, threadManager, lifecycle)

// ── Store interface ───────────────────────────────────────────
interface KernelStore {
  // ── Existing process/scheduler state ─────────────────────
  processes:       PCB[]
  schedulerConfig: SchedulerConfig
  isBooting:       boolean

  // ── New process management state ─────────────────────────
  threads:             TCB[]
  forkEvents:          ForkEvent[]
  execEvents:          ExecEvent[]
  waitEvents:          WaitEvent[]
  processTree:         ProcessTreeNode | null

  // ── Gateway outputs (what the frontend reads) ─────────────
  latestSchedulerSnapshot: SchedulerSnapshot | null
  ganttHistory:            SchedulerSnapshot[]
  taskManagerSnapshot:     TaskManagerSnapshot | null

  // ── Memory (placeholder — wired up in MemoryManager phase) ─
  memoryFrames: MemoryFrame[]
  memoryStats:  MemoryStats

  // ── Synchronization (placeholder) ────────────────────────
  semaphores: SemaphoreInfo[]

  // ── System stats (StatusBar) ─────────────────────────────
  systemStats: SystemStats

  // ─────────────────────────────────────────────────────────
  //  ACTIONS
  // ─────────────────────────────────────────────────────────

  // Legacy spawn (direct PCB creation, no fork/exec — for Scheduler window)
  spawnProcess(name: string, burst: number, priority?: number, arrival?: number): void

  // Kill a single process
  killProcess(pid: number): void

  // Launch a dummy app via fork() + exec() + optional wait()
  launchApp(appType: DummyAppType | string, config?: Partial<{
    burstTime:            number
    priority:             number
    arrivalTime:          number
    spawnChildProcesses:  boolean
  }>): number

  // Kill a process and its entire child tree
  killProcessTree(pid: number): void

  // Run scheduler on current living processes, store in GanttGateway
  runScheduler(): void

  // Change algorithm / quantum
  setSchedulerConfig(config: Partial<SchedulerConfig>): void

  // Refresh TaskManager snapshot
  refreshTaskManager(): void

  // Convenience: get latest Gantt snapshot
  getLatestGantt(): SchedulerSnapshot | null

  // Compare all stored algorithm runs
  compareSchedulers(): Array<{ algorithm: SchedulerAlgorithm; metrics: SchedulerMetrics }>

  // Sync processes array from ProcessManager
  syncProcesses(): void

  // Full reset
  resetAll(): void
}

// ── Default / placeholder values ─────────────────────────────
const DEFAULT_MEMORY_STATS: MemoryStats = {
  totalFrames: 32,
  usedFrames:  0,
  freeFrames:  32,
  pageFaults:  0,
  pageHits:    0,
}

const DEFAULT_SYSTEM_STATS: SystemStats = {
  cpuUtilization:   5,
  totalMemoryKB:    512_000,
  usedMemoryKB:     4_000,
  totalProcesses:   1,
  totalThreads:     1,
  zombieProcesses:  0,
  orphanProcesses:  0,
  uptime:           0,
}

// ── Store implementation ──────────────────────────────────────
export const useKernelStore = create<KernelStore>((set, get) => ({
  // ── Initial state ─────────────────────────────────────────
  processes:       processManager.getAllProcesses(),
  schedulerConfig: { algorithm: "FCFS", timeQuantum: 2 },
  isBooting:       false,

  threads:      threadManager.getAllThreads(),
  forkEvents:   [],
  execEvents:   [],
  waitEvents:   [],
  processTree:  null,

  latestSchedulerSnapshot: null,
  ganttHistory:            [],
  taskManagerSnapshot:     null,

  memoryFrames: [],
  memoryStats:  DEFAULT_MEMORY_STATS,
  semaphores:   [],
  systemStats:  DEFAULT_SYSTEM_STATS,

  // ─────────────────────────────────────────────────────────
  //  syncProcesses — pulls fresh PCB + thread arrays into state
  // ─────────────────────────────────────────────────────────
  syncProcesses() {
    const snap = taskManagerGateway.takeSnapshot(
      processManager,
      threadManager,
      lifecycle,
      lifecycle.getSimulationClock()
    )
    set({
      processes:   processManager.getAllProcesses(),
      threads:     threadManager.getAllThreads(),
      forkEvents:  lifecycle.getForkEvents(),
      execEvents:  lifecycle.getExecEvents(),
      waitEvents:  lifecycle.getWaitEvents(),
      processTree: lifecycle.getProcessTree(),
      taskManagerSnapshot: snap,
      systemStats: {
        cpuUtilization:   snap.systemCpuPercent,
        totalMemoryKB:    DEFAULT_SYSTEM_STATS.totalMemoryKB,
        usedMemoryKB:     snap.systemMemoryUsedKB,
        totalProcesses:   snap.totalProcesses,
        totalThreads:     snap.totalThreads,
        zombieProcesses:  snap.zombieCount,
        orphanProcesses:  processManager.getOrphanCount(),
        uptime:           lifecycle.getSimulationClock(),
      },
    })
  },

  // ─────────────────────────────────────────────────────────
  //  spawnProcess — legacy direct PCB creation (Scheduler demo)
  // ─────────────────────────────────────────────────────────
  spawnProcess(name, burst, priority = 1, arrival = 0) {
    processManager.createProcess(
      name, burst, priority, arrival,
      lifecycle.getSimulationClock(),
      initPid,
      name,
      1
    )
    get().syncProcesses()
  },

  // ─────────────────────────────────────────────────────────
  //  killProcess — terminates one process
  // ─────────────────────────────────────────────────────────
  killProcess(pid) {
    lifecycle.terminateProcess(pid)
    get().syncProcesses()
  },

  // ─────────────────────────────────────────────────────────
  //  launchApp — fork + exec + optional wait per app type
  // ─────────────────────────────────────────────────────────
  launchApp(appType, config = {}) {
    const { DummyAppType: DATEnum } = require("../types/index") as typeof import("../types/index")
    const resolved = (appType in DATEnum
      ? DATEnum[appType as keyof typeof DATEnum]
      : appType) as DummyAppType

    const full = {
      appType:             resolved,
      burstTime:           config.burstTime           ?? 15,
      priority:            config.priority            ?? 3,
      arrivalTime:         config.arrivalTime         ?? lifecycle.getSimulationClock(),
      spawnChildProcesses: config.spawnChildProcesses ?? true,
    }

    const mainPid = kernelLaunchApp(resolved, lifecycle, full, initPid)
    get().syncProcesses()
    return mainPid
  },

  // ─────────────────────────────────────────────────────────
  //  killProcessTree — terminates a process and all children
  // ─────────────────────────────────────────────────────────
  killProcessTree(pid) {
    const killRecursive = (p: number) => {
      const pcb = processManager.getProcess(p)
      if (!pcb) return
      const children = [...pcb.children]
      for (const cpid of children) killRecursive(cpid)
      lifecycle.terminateProcess(p)
    }
    killRecursive(pid)
    get().syncProcesses()
  },

  // ─────────────────────────────────────────────────────────
  //  runScheduler — schedules living (non-init) processes
  // ─────────────────────────────────────────────────────────
  runScheduler() {
    const { schedulerConfig } = get()
    scheduler.setConfig(schedulerConfig)
    scheduler.setClock(lifecycle.getSimulationClock())

    // Exclude init (PID 1) and already-terminated processes
    const eligible = processManager.getAllProcesses().filter(
      p => p.pid !== initPid && p.state !== "terminated" && p.burstTime > 0
    )

    const snapshot = scheduler.run(eligible)
    ganttGateway.addSnapshot(snapshot)

    set({
      latestSchedulerSnapshot: snapshot,
      ganttHistory:            ganttGateway.getAllSnapshots(),
    })
  },

  // ─────────────────────────────────────────────────────────
  //  setSchedulerConfig
  // ─────────────────────────────────────────────────────────
  setSchedulerConfig(config) {
    set(state => ({
      schedulerConfig: { ...state.schedulerConfig, ...config },
    }))
  },

  // ─────────────────────────────────────────────────────────
  //  refreshTaskManager — pulls a fresh snapshot on demand
  // ─────────────────────────────────────────────────────────
  refreshTaskManager() {
    get().syncProcesses()
  },

  // ─────────────────────────────────────────────────────────
  //  getLatestGantt
  // ─────────────────────────────────────────────────────────
  getLatestGantt() {
    return ganttGateway.getLatestSnapshot()
  },

  // ─────────────────────────────────────────────────────────
  //  compareSchedulers
  // ─────────────────────────────────────────────────────────
  compareSchedulers() {
    return ganttGateway.compareAlgorithms()
  },

  // ─────────────────────────────────────────────────────────
  //  resetAll — full system wipe and reinitialise
  // ─────────────────────────────────────────────────────────
  resetAll() {
    processManager.reset()
    threadManager.reset()
    lifecycle.reset()
    ganttGateway.reset()
    scheduler.setClock(0)

    initPid = bootstrapInit(processManager, threadManager, lifecycle)

    set({
      processes:               processManager.getAllProcesses(),
      threads:                 [],
      forkEvents:              [],
      execEvents:              [],
      waitEvents:              [],
      processTree:             null,
      latestSchedulerSnapshot: null,
      ganttHistory:            [],
      taskManagerSnapshot:     null,
      memoryFrames:            [],
      memoryStats:             DEFAULT_MEMORY_STATS,
      semaphores:              [],
      systemStats:             DEFAULT_SYSTEM_STATS,
      schedulerConfig:         { algorithm: "FCFS", timeQuantum: 2 },
    })
  },
}))

// ── Export kernel singletons (for advanced use / testing) ────
export {
  processManager,
  threadManager,
  lifecycle,
  scheduler,
  ganttGateway,
  taskManagerGateway,
  initPid as getInitPid,
}
