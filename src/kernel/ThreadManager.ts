// ============================================================
//  kobiOS — ThreadManager
//  Manages threads (TCBs) across all processes.
//  NO React imports. Pure simulation logic.
// ============================================================

import type { TCB, ProcessState } from "../types/index"

// ─── Thread name presets per app ─────────────────────────────
export const APP_THREAD_NAMES: Record<string, string[]> = {
  Calculator:                    ["main", "compute"],
  WebBrowser:                    ["main", "renderer", "network", "js-engine", "gpu-compositor"],
  "WebBrowser:RenderHelper":     ["main", "paint"],
  Notepad:                       ["main", "io-handler"],
  FileExplorer:                  ["main", "dir-scanner", "thumbnail-loader"],
  "FileExplorer:ThumbWorker":    ["main"],
  SystemMonitor:                 ["main", "cpu-poller", "mem-poller", "net-poller"],
  DummyProcess:                  ["main", "worker-1", "worker-2"],
  init:                          ["kobiOS-kernel"],
}

export class ThreadManager {
  private threads: Map<number, TCB> = new Map()
  private nextTid = 1

  // ── Create a new thread for a given process ───────────────
  createThread(
    pid: number,
    name: string,
    burstTime: number,
    createdAt: number
  ): TCB {
    const tid = this.nextTid++
    const thread: TCB = {
      tid,
      pid,
      name,
      state: "new",
      stackPointer: Math.floor(Math.random() * 0xffff) + 0x1000, // simulated stack address
      cpuUsagePercent: 0,
      createdAt,
      terminatedAt: null,
      burstTime,
      remainingTime: burstTime,
    }
    this.threads.set(tid, thread)
    return thread
  }

  // ── Get a single thread ───────────────────────────────────
  getThread(tid: number): TCB | undefined {
    return this.threads.get(tid)
  }

  // ── Get all threads belonging to a process ────────────────
  getThreadsByPid(pid: number): TCB[] {
    const result: TCB[] = []
    for (const t of this.threads.values()) {
      if (t.pid === pid) result.push(t)
    }
    return result
  }

  // ── Get all threads across all processes ──────────────────
  getAllThreads(): TCB[] {
    return Array.from(this.threads.values())
  }

  // ── Get all living (non-terminated) threads ───────────────
  getLivingThreads(): TCB[] {
    return this.getAllThreads().filter(t => t.state !== "terminated")
  }

  // ── Terminate a single thread ─────────────────────────────
  terminateThread(tid: number, clock: number): void {
    const t = this.threads.get(tid)
    if (!t) return
    t.state = "terminated"
    t.terminatedAt = clock
    t.remainingTime = 0
    t.cpuUsagePercent = 0
  }

  // ── Terminate all threads for a process ───────────────────
  terminateAllThreadsForProcess(pid: number, clock: number): void {
    for (const t of this.threads.values()) {
      if (t.pid === pid && t.state !== "terminated") {
        this.terminateThread(t.tid, clock)
      }
    }
  }

  // ── Update thread state ───────────────────────────────────
  updateThreadState(tid: number, state: ProcessState): void {
    const t = this.threads.get(tid)
    if (t) t.state = state
  }

  // ── Set simulated CPU% for a thread ──────────────────────
  setThreadCpuUsage(tid: number, percent: number): void {
    const t = this.threads.get(tid)
    if (t) t.cpuUsagePercent = Math.min(100, Math.max(0, percent))
  }

  // ── Clone threads from a parent process to a child ────────
  //    Used by fork() — child inherits thread layout with new TIDs
  cloneThreadsForFork(
    parentPid: number,
    childPid: number,
    clock: number
  ): TCB[] {
    const parentThreads = this.getThreadsByPid(parentPid)
    const cloned: TCB[] = []
    for (const pt of parentThreads) {
      if (pt.state === "terminated") continue
      const child = this.createThread(childPid, pt.name, pt.burstTime, clock)
      child.state = "new"
      child.remainingTime = pt.remainingTime
      cloned.push(child)
    }
    return cloned
  }

  // ── Redistribute CPU% across threads in a process ─────────
  //    Called after state changes to keep per-thread numbers realistic
  redistributeCpu(pid: number, processCpuPercent: number): void {
    const living = this.getThreadsByPid(pid).filter(t => t.state !== "terminated")
    if (living.length === 0) return
    const share = processCpuPercent / living.length
    for (const t of living) {
      t.cpuUsagePercent = Math.round(share * 10) / 10
    }
  }

  // ── Reset everything ──────────────────────────────────────
  reset(): void {
    this.threads.clear()
    this.nextTid = 1
  }

  // ── Stats helpers ─────────────────────────────────────────
  getTotalThreadCount(): number {
    return this.threads.size
  }

  getLivingThreadCount(): number {
    return this.getLivingThreads().length
  }
}
