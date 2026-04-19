// ============================================================
//  kobiOS — ProcessLifecycle
//  Simulates UNIX fork(), exec(), and wait() system calls.
//  NO React imports. Pure simulation logic.
// ============================================================

import type {
  PCB,
  ForkEvent,
  ExecEvent,
  WaitEvent,
  ProcessTreeNode,
} from "../types/index"
import { ProcessManager } from "./ProcessManager"
import { ThreadManager } from "./ThreadManager"

export class ProcessLifecycle {
  private forkEvents: ForkEvent[] = []
  private execEvents: ExecEvent[] = []
  private waitEvents: WaitEvent[] = []
  private simulationClock = 0

  constructor(
    private processManager: ProcessManager,
    private threadManager: ThreadManager
  ) {}

  // ── Clock helpers ─────────────────────────────────────────
  get clock(): number {
    return this.simulationClock
  }

  tick(amount = 1): void {
    this.simulationClock += amount
  }

  private uid(): string {
    return `${this.simulationClock}-${Math.random().toString(36).slice(2, 7)}`
  }

  // ── fork() ────────────────────────────────────────────────
  //  Creates a child process that is a copy of the parent.
  //  Parent's threads are cloned to child with new TIDs.
  //  Returns the child's PID.
  fork(parentPid: number, arrivalTime?: number): number {
    const parent = this.processManager.getProcess(parentPid)
    if (!parent) throw new Error(`fork(): parent PID ${parentPid} not found`)

    const childArrival = arrivalTime ?? this.simulationClock

    // Create child PCB inheriting key parent properties
    const child = this.processManager.createProcess(
      parent.name,
      parent.burstTime,
      parent.priority,
      childArrival,
      this.simulationClock,
      parentPid,
      parent.programName,
      parent.forkDepth + 1
    )

    // Inherit simulated resource characteristics from parent
    child.memoryUsageKB = parent.memoryUsageKB
    child.openFileCount = parent.openFileCount

    // Register child in parent's children list
    parent.children.push(child.pid)

    // Clone parent's living threads to child (fork duplicates address space)
    const clonedThreads = this.threadManager.cloneThreadsForFork(
      parentPid,
      child.pid,
      this.simulationClock
    )
    child.threads = clonedThreads.map(t => t.tid)

    // Child immediately transitions to ready state
    child.state = "ready"
    for (const t of clonedThreads) {
      this.threadManager.updateThreadState(t.tid, "ready")
    }

    this.forkEvents.push({
      id: this.uid(),
      parentPid,
      childPid: child.pid,
      timestamp: this.simulationClock,
    })

    this.simulationClock++
    return child.pid
  }

  // ── exec() ────────────────────────────────────────────────
  //  Replaces the process image: new program name, burst, threads.
  //  PID, parentPid, priority, children — all unchanged.
  exec(
    pid: number,
    programName: string,
    burstTime: number,
    threads: Array<{ name: string; burstTime: number }>
  ): void {
    const pcb = this.processManager.getProcess(pid)
    if (!pcb) throw new Error(`exec(): PID ${pid} not found`)

    const oldProgram = pcb.programName

    this.execEvents.push({
      id: this.uid(),
      pid,
      oldProgram,
      newProgram: programName,
      timestamp: this.simulationClock,
    })

    // Replace process image
    pcb.name        = programName
    pcb.programName = programName
    pcb.burstTime   = burstTime
    pcb.remainingTime = burstTime
    pcb.execHistory.push(programName)

    // Realistic simulated resource usage for this program type
    pcb.memoryUsageKB  = this.simulatedMemory(programName)
    pcb.openFileCount  = this.simulatedFiles(programName)
    pcb.cpuUsagePercent = this.simulatedCpu(programName)

    // exec() replaces thread image — terminate old, create new
    this.threadManager.terminateAllThreadsForProcess(pid, this.simulationClock)
    pcb.threads = []

    for (const tDef of threads) {
      const t = this.threadManager.createThread(
        pid,
        tDef.name,
        tDef.burstTime,
        this.simulationClock
      )
      t.state = "ready"
      pcb.threads.push(t.tid)
    }

    // Distribute CPU% across the new threads
    this.threadManager.redistributeCpu(pid, pcb.cpuUsagePercent)

    pcb.state = "ready"
    this.simulationClock++
  }

  // ── wait() ────────────────────────────────────────────────
  //  Blocks the parent until its children terminate.
  //  Returns false if parent has no living children (no-op).
  wait(parentPid: number): boolean {
    const parent = this.processManager.getProcess(parentPid)
    if (!parent) return false

    const livingChildren = parent.children.filter(cpid => {
      const child = this.processManager.getProcess(cpid)
      return child && child.state !== "terminated"
    })

    if (livingChildren.length === 0) return false

    parent.state = "waiting"

    for (const cpid of livingChildren) {
      this.waitEvents.push({
        id: this.uid(),
        parentPid,
        awaitedChildPid: cpid,
        startedAt: this.simulationClock,
        resolvedAt: null,
      })
    }

    this.simulationClock++
    return true
  }

  // ── resolveWait() ─────────────────────────────────────────
  //  Called when a child terminates — notifies waiting parent.
  //  Reaps zombie, unblocks parent if all children done.
  resolveWait(childPid: number): void {
    const child = this.processManager.getProcess(childPid)
    if (!child || child.parentPid === null) return

    const parentPid = child.parentPid
    const parent = this.processManager.getProcess(parentPid)
    if (!parent) return

    // Resolve the open wait event for this child
    const openWait = this.waitEvents.find(
      w =>
        w.parentPid === parentPid &&
        w.awaitedChildPid === childPid &&
        w.resolvedAt === null
    )
    if (openWait) openWait.resolvedAt = this.simulationClock

    // Remove child from parent's active children list
    parent.children = parent.children.filter(pid => pid !== childPid)

    // Temporarily mark as zombie (acknowledged by parent via wait)
    child.isZombie = true

    // Check if parent is unblocked (all children done)
    const remainingLiving = parent.children.filter(cpid => {
      const c = this.processManager.getProcess(cpid)
      return c && c.state !== "terminated"
    })

    if (parent.state === "waiting" && remainingLiving.length === 0) {
      parent.state = "ready"
    }

    // Fully reap zombie — parent has acknowledged via wait
    child.isZombie = false
  }

  // ── terminateProcess() ───────────────────────────────────
  //  Sets process to terminated, kills its threads,
  //  marks living children as orphans, notifies parent.
  terminateProcess(pid: number): void {
    const pcb = this.processManager.getProcess(pid)
    if (!pcb) return

    pcb.state = "terminated"
    pcb.cpuUsagePercent = 0
    this.threadManager.terminateAllThreadsForProcess(pid, this.simulationClock)

    // Orphan any living children (parent gone before children)
    for (const cpid of pcb.children) {
      const child = this.processManager.getProcess(cpid)
      if (child && child.state !== "terminated") {
        child.isOrphan  = true
        child.parentPid = null  // reparented to "init" (simulated by nulling)
      }
    }

    // Notify parent via wait resolution
    this.resolveWait(pid)
    this.simulationClock++
  }

  // ── getProcessTree() ─────────────────────────────────────
  //  Builds a recursive tree rooted at init (parentPid === null).
  getProcessTree(): ProcessTreeNode {
    const buildNode = (pcb: PCB): ProcessTreeNode => ({
      pid: pcb.pid,
      name: pcb.name,
      programName: pcb.programName,
      state: pcb.state,
      children: this.processManager
        .getAllProcesses()
        .filter(c => c.parentPid === pcb.pid)
        .map(buildNode),
    })

    const roots = this.processManager
      .getAllProcesses()
      .filter(p => p.parentPid === null)

    if (roots.length === 1) return buildNode(roots[0])

    // Fallback virtual root when no init exists yet
    return {
      pid: 0,
      name: "root",
      programName: "root",
      state: "running",
      children: roots.map(buildNode),
    }
  }

  // ── Event getters ─────────────────────────────────────────
  getForkEvents(): ForkEvent[]  { return [...this.forkEvents] }
  getExecEvents(): ExecEvent[]  { return [...this.execEvents] }
  getWaitEvents(): WaitEvent[]  { return [...this.waitEvents] }
  getSimulationClock(): number  { return this.simulationClock }

  // ── Reset ─────────────────────────────────────────────────
  reset(): void {
    this.forkEvents       = []
    this.execEvents       = []
    this.waitEvents       = []
    this.simulationClock  = 0
  }

  // ── Simulated resource helpers ────────────────────────────
  private simulatedMemory(programName: string): number {
    const base: Record<string, number> = {
      "WebBrowser":               150_000,
      "WebBrowser:RenderHelper":   80_000,
      "Calculator":                 8_000,
      "Notepad":                   12_000,
      "FileExplorer":              35_000,
      "FileExplorer:ThumbWorker":  20_000,
      "SystemMonitor":             25_000,
      "DummyProcess":              15_000,
      "init":                       4_000,
    }
    const b = base[programName] ?? 10_000
    return b + Math.floor(Math.random() * b * 0.2)
  }

  private simulatedFiles(programName: string): number {
    const base: Record<string, number> = {
      "WebBrowser":               80,
      "WebBrowser:RenderHelper":  30,
      "Calculator":                5,
      "Notepad":                  10,
      "FileExplorer":             50,
      "FileExplorer:ThumbWorker": 20,
      "SystemMonitor":            15,
      "DummyProcess":              8,
      "init":                      3,
    }
    const b = base[programName] ?? 5
    return b + Math.floor(Math.random() * 5)
  }

  private simulatedCpu(programName: string): number {
    const ranges: Record<string, [number, number]> = {
      "WebBrowser":               [15, 40],
      "WebBrowser:RenderHelper":  [10, 25],
      "Calculator":               [ 2,  8],
      "Notepad":                  [ 1,  5],
      "FileExplorer":             [ 5, 15],
      "FileExplorer:ThumbWorker": [ 3, 10],
      "SystemMonitor":            [ 4, 12],
      "DummyProcess":             [ 5, 20],
      "init":                     [ 1,  5],
    }
    const [lo, hi] = ranges[programName] ?? [2, 10]
    return Math.round((lo + Math.random() * (hi - lo)) * 10) / 10
  }
}
