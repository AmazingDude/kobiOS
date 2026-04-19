// ============================================================
//  kobiOS — TaskManagerGateway
//  Collects real-time process + thread snapshots for the
//  Task Manager UI (table view, tree view, performance graphs).
//  NO React imports. Pure simulation logic.
// ============================================================

import type {
  ProcessState,
  TaskManagerSnapshot,
  ProcessTreeNode,
} from "../types/index"
import { ProcessManager   } from "./ProcessManager"
import { ThreadManager    } from "./ThreadManager"
import { ProcessLifecycle } from "./ProcessLifecycle"

type ProcessRow    = TaskManagerSnapshot["processes"][number]
type ThreadRow     = ProcessRow["threads"][number]

export class TaskManagerGateway {
  // ── Take a full snapshot of the current system state ──────
  takeSnapshot(
    processManager: ProcessManager,
    threadManager:  ThreadManager,
    lifecycle:      ProcessLifecycle,
    simulationClock: number
  ): TaskManagerSnapshot {
    const allProcs = processManager.getAllProcesses()

    const processRows: ProcessRow[] = allProcs.map(pcb => {
      const threads  = threadManager.getThreadsByPid(pcb.pid)
      const threadRows: ThreadRow[] = threads.map(t => ({
        tid:             t.tid,
        name:            t.name,
        state:           t.state,
        cpuUsagePercent: t.cpuUsagePercent,
      }))

      return {
        pid:             pcb.pid,
        parentPid:       pcb.parentPid,
        name:            pcb.name,
        programName:     pcb.programName,
        state:           pcb.state,
        priority:        pcb.priority,
        cpuUsagePercent: pcb.cpuUsagePercent,
        memoryUsageKB:   pcb.memoryUsageKB,
        openFileCount:   pcb.openFileCount,
        threadCount:     threadRows.length,
        threads:         threadRows,
        forkDepth:       pcb.forkDepth,
        isZombie:        pcb.isZombie,
        isOrphan:        pcb.isOrphan,
        createdAt:       pcb.createdAt,
      }
    })

    const living   = processRows.filter(p => p.state !== "terminated")
    const cpuTotal = living.reduce((s, p) => s + p.cpuUsagePercent, 0)
    const memTotal = living.reduce((s, p) => s + p.memoryUsageKB, 0)

    return {
      timestamp:            simulationClock,
      processes:            processRows,
      systemCpuPercent:     Math.min(100, Math.round(cpuTotal * 10) / 10),
      systemMemoryUsedKB:   memTotal,
      totalProcesses:       processManager.getLivingCount(),
      totalThreads:         threadManager.getLivingThreadCount(),
      zombieCount:          processManager.getZombieCount(),
    }
  }

  // ── Process tree (for tree-view tab in Task Manager) ──────
  getProcessTree(lifecycle: ProcessLifecycle): ProcessTreeNode {
    return lifecycle.getProcessTree()
  }

  // ── Flat sorted process list (for table-view tab) ─────────
  //  sortBy: "pid" | "cpuUsage" | "memoryUsage" | "name" | "state"
  getSortedProcessList(
    snapshot: TaskManagerSnapshot,
    sortBy:   "pid" | "cpuUsage" | "memoryUsage" | "name" | "state" = "pid"
  ): ProcessRow[] {
    const rows = [...snapshot.processes]
    switch (sortBy) {
      case "pid":         return rows.sort((a, b) => a.pid - b.pid)
      case "cpuUsage":    return rows.sort((a, b) => b.cpuUsagePercent - a.cpuUsagePercent)
      case "memoryUsage": return rows.sort((a, b) => b.memoryUsageKB   - a.memoryUsageKB)
      case "name":        return rows.sort((a, b) => a.name.localeCompare(b.name))
      case "state": {
        const order: Record<ProcessState, number> = {
          running:    0,
          ready:      1,
          waiting:    2,
          new:        3,
          terminated: 4,
        }
        return rows.sort((a, b) => order[a.state] - order[b.state])
      }
      default: return rows
    }
  }

  // ── Filter processes by state ─────────────────────────────
  filterByState(
    snapshot: TaskManagerSnapshot,
    state:    ProcessState
  ): ProcessRow[] {
    return snapshot.processes.filter(p => p.state === state)
  }

  // ── All threads across all processes, annotated with their ─
  //  parent process name (for a flat thread list view).
  getAllThreads(snapshot: TaskManagerSnapshot): Array<{
    pid:         number
    processName: string
    thread:      ThreadRow
  }> {
    const result: Array<{ pid: number; processName: string; thread: ThreadRow }> = []
    for (const p of snapshot.processes) {
      for (const t of p.threads) {
        result.push({ pid: p.pid, processName: p.name, thread: t })
      }
    }
    return result
  }

  // ── Living processes only (convenience) ───────────────────
  getLivingProcesses(snapshot: TaskManagerSnapshot): ProcessRow[] {
    return snapshot.processes.filter(p => p.state !== "terminated")
  }

  // ── System-level summary (for StatusBar) ──────────────────
  getSystemSummary(snapshot: TaskManagerSnapshot): {
    cpuPercent:   number
    memoryKB:     number
    processCount: number
    threadCount:  number
    zombieCount:  number
  } {
    return {
      cpuPercent:   snapshot.systemCpuPercent,
      memoryKB:     snapshot.systemMemoryUsedKB,
      processCount: snapshot.totalProcesses,
      threadCount:  snapshot.totalThreads,
      zombieCount:  snapshot.zombieCount,
    }
  }
}
