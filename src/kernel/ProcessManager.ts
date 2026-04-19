// ============================================================
//  kobiOS — ProcessManager
//  Create, query, update and kill process PCBs.
//  NO React imports. Pure simulation logic.
// ============================================================

import type { PCB, ProcessState } from "../types/index"

const PROCESS_COLORS = [
  "#6366f1", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#a78bfa",
  "#e11d48", "#0ea5e9", "#d97706", "#7c3aed", "#059669",
]

export class ProcessManager {
  private processes: Map<number, PCB> = new Map()
  private nextPid = 1

  // ── Create a new PCB ──────────────────────────────────────
  createProcess(
    name: string,
    burstTime: number,
    priority: number,
    arrivalTime: number,
    clock: number = 0,
    parentPid: number | null = null,
    programName: string = name,
    forkDepth: number = 0
  ): PCB {
    const pid = this.nextPid++
    const pcb: PCB = {
      pid,
      name,
      state: "new",
      priority,
      burstTime,
      remainingTime: burstTime,
      arrivalTime,
      waitingTime: 0,
      turnaroundTime: 0,
      completionTime: undefined,
      color: PROCESS_COLORS[(pid - 1) % PROCESS_COLORS.length],

      // Extended process management fields
      parentPid,
      children: [],
      threads: [],
      programName,
      cpuUsagePercent: 0,
      memoryUsageKB: 0,     // assigned after exec()
      openFileCount: 0,      // assigned after exec()
      createdAt: clock,
      execHistory: [programName],
      forkDepth,
      isZombie: false,
      isOrphan: false,
    }
    this.processes.set(pid, pcb)
    return pcb
  }

  // ── Lookups ───────────────────────────────────────────────
  getProcess(pid: number): PCB | undefined {
    return this.processes.get(pid)
  }

  getAllProcesses(): PCB[] {
    return Array.from(this.processes.values())
  }

  getLivingProcesses(): PCB[] {
    return this.getAllProcesses().filter(p => p.state !== "terminated")
  }

  // ── State mutation ────────────────────────────────────────
  updateState(pid: number, state: ProcessState): void {
    const p = this.processes.get(pid)
    if (p) p.state = state
  }

  killProcess(pid: number): void {
    const p = this.processes.get(pid)
    if (p) p.state = "terminated"
  }

  // ── Stats ─────────────────────────────────────────────────
  getTotalCount(): number {
    return this.processes.size
  }

  getLivingCount(): number {
    return this.getLivingProcesses().length
  }

  getZombieCount(): number {
    return this.getAllProcesses().filter(p => p.isZombie).length
  }

  getOrphanCount(): number {
    return this.getLivingProcesses().filter(p => p.isOrphan).length
  }

  // ── Reset ─────────────────────────────────────────────────
  reset(): void {
    this.processes.clear()
    this.nextPid = 1
  }
}
