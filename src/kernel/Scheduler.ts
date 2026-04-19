// ============================================================
//  kobiOS — Scheduler
//  CPU scheduling algorithms: FCFS, RR, PRIORITY_RR, SRJF.
//  Returns a SchedulerSnapshot with full Gantt + metrics.
//  NO React imports. Pure simulation logic.
// ============================================================

import type {
  PCB,
  GanttEntry,
  SchedulerMetrics,
  SchedulerConfig,
  SchedulerAlgorithm,
  SchedulerSnapshot,
} from "../types/index"

// Internal simulation copy — avoids mutating real PCBs
interface SimProc {
  pid:           number
  name:          string
  color:         string
  priority:      number
  burstTime:     number
  remainingTime: number
  arrivalTime:   number
  waitingTime:   number
  turnaroundTime: number
  completionTime: number
  responseTime:  number   // -1 = never got CPU
}

export class Scheduler {
  private config: SchedulerConfig = { algorithm: "FCFS", timeQuantum: 2 }
  private clockOffset             = 0

  setConfig(config: SchedulerConfig): void {
    this.config = { ...config }
  }

  getConfig(): SchedulerConfig {
    return { ...this.config }
  }

  // Called by the store to align Gantt timestamps with simulation clock
  setClock(offset: number): void {
    this.clockOffset = offset
  }

  // ── Main entry point ──────────────────────────────────────
  run(processes: PCB[]): SchedulerSnapshot {
    const eligible = processes.filter(
      p => p.state !== "terminated" && p.burstTime > 0
    )
    if (eligible.length === 0) return this.emptySnapshot()

    const procs = this.cloneForSim(eligible)

    let result: { gantt: GanttEntry[]; completed: SimProc[] }

    switch (this.config.algorithm) {
      case "FCFS":        result = this.runFCFS(procs);                            break
      case "RR":          result = this.runRR(procs, this.config.timeQuantum);     break
      case "PRIORITY_RR": result = this.runPriorityRR(procs, this.config.timeQuantum); break
      case "SRJF":        result = this.runSRJF(procs);                            break
      default:            result = this.runFCFS(procs)
    }

    const metrics = this.computeMetrics(result.completed, result.gantt)

    return {
      algorithm:    this.config.algorithm,
      timeQuantum:  this.config.timeQuantum,
      gantt:        result.gantt,
      metrics,
      processStates: result.completed.map(p => ({
        pid:            p.pid,
        name:           p.name,
        waitingTime:    p.waitingTime,
        turnaroundTime: p.turnaroundTime,
        completionTime: p.completionTime,
        responseTime:   p.responseTime === -1 ? 0 : p.responseTime,
      })),
      ranAt: this.clockOffset,
    }
  }

  // ── Clone PCBs for simulation ─────────────────────────────
  private cloneForSim(processes: PCB[]): SimProc[] {
    return processes.map(p => ({
      pid:            p.pid,
      name:           p.name,
      color:          p.color,
      priority:       p.priority,
      burstTime:      p.burstTime,
      remainingTime:  p.burstTime,
      arrivalTime:    p.arrivalTime,
      waitingTime:    0,
      turnaroundTime: 0,
      completionTime: 0,
      responseTime:   -1,
    }))
  }

  // ══════════════════════════════════════════════════════════
  //  Algorithm 1 — FCFS (First Come First Served)
  //  Non-preemptive. Processes run to completion in arrival order.
  // ══════════════════════════════════════════════════════════
  private runFCFS(
    procs: SimProc[]
  ): { gantt: GanttEntry[]; completed: SimProc[] } {
    const sorted = [...procs].sort(
      (a, b) => a.arrivalTime - b.arrivalTime || a.pid - b.pid
    )
    const gantt: GanttEntry[] = []
    let clock = 0

    for (const p of sorted) {
      if (clock < p.arrivalTime) clock = p.arrivalTime  // idle gap

      p.responseTime  = clock
      const start     = clock
      const end       = clock + p.burstTime
      clock           = end

      p.completionTime  = end
      p.waitingTime     = start - p.arrivalTime
      p.turnaroundTime  = end   - p.arrivalTime

      gantt.push({
        pid:           p.pid,
        name:          p.name,
        color:         p.color,
        startTime:     start,
        endTime:       end,
        algorithmUsed: "FCFS",
        isPreempted:   false,
      })
    }

    return { gantt, completed: sorted }
  }

  // ══════════════════════════════════════════════════════════
  //  Algorithm 2 — Round Robin (RR)
  //  Preemptive by quantum. FIFO ready queue.
  // ══════════════════════════════════════════════════════════
  private runRR(
    procs:   SimProc[],
    quantum: number
  ): { gantt: GanttEntry[]; completed: SimProc[] } {
    const gantt:     GanttEntry[] = []
    const completed: SimProc[]    = []
    const sorted = [...procs].sort(
      (a, b) => a.arrivalTime - b.arrivalTime || a.pid - b.pid
    )

    let clock    = 0
    let i        = 0                   // arrival pointer
    const ready: SimProc[]  = []
    const enqueued = new Set<number>()

    const enqueueArrivals = () => {
      while (i < sorted.length && sorted[i].arrivalTime <= clock) {
        if (!enqueued.has(sorted[i].pid)) {
          enqueued.add(sorted[i].pid)
          ready.push(sorted[i])
        }
        i++
      }
    }

    enqueueArrivals()

    while (ready.length > 0 || i < sorted.length) {
      if (ready.length === 0) {
        clock = sorted[i].arrivalTime
        enqueueArrivals()
        continue
      }

      const p      = ready.shift()!
      if (p.responseTime === -1) p.responseTime = clock

      const runFor  = Math.min(quantum, p.remainingTime)
      const start   = clock
      clock        += runFor
      p.remainingTime -= runFor

      enqueueArrivals()  // new arrivals during this quantum

      const done = p.remainingTime === 0

      gantt.push({
        pid:           p.pid,
        name:          p.name,
        color:         p.color,
        startTime:     start,
        endTime:       clock,
        algorithmUsed: "RR",
        isPreempted:   !done,
      })

      if (done) {
        p.completionTime  = clock
        p.turnaroundTime  = clock - p.arrivalTime
        p.waitingTime     = p.turnaroundTime - p.burstTime
        completed.push(p)
      } else {
        ready.push(p)    // back of queue
      }
    }

    return { gantt, completed }
  }

  // ══════════════════════════════════════════════════════════
  //  Algorithm 3 — SRJF (Shortest Remaining Job First)
  //  Preemptive SJF. Tick-by-tick. Emits run-length Gantt entries.
  //  Ties broken in favour of the currently running process
  //  (avoids unnecessary context switches).
  // ══════════════════════════════════════════════════════════
  private runSRJF(
    procs: SimProc[]
  ): { gantt: GanttEntry[]; completed: SimProc[] } {
    const gantt:     GanttEntry[] = []
    const completed: SimProc[]    = []
    const sorted = [...procs].sort(
      (a, b) => a.arrivalTime - b.arrivalTime || a.pid - b.pid
    )
    const ready: SimProc[] = []
    let clock = 0
    let i     = 0

    let currentProc:    SimProc | null = null
    let currentRunStart = 0

    const maxTime =
      procs.reduce((s, p) => s + p.burstTime, 0) +
      procs.reduce((m, p) => Math.max(m, p.arrivalTime), 0) + 2

    const enqueueArrivals = () => {
      while (i < sorted.length && sorted[i].arrivalTime <= clock) {
        ready.push(sorted[i])
        i++
      }
    }

    while (completed.length < procs.length && clock <= maxTime) {
      enqueueArrivals()

      if (ready.length === 0) {
        // CPU idle — emit any in-progress run and jump to next arrival
        if (currentProc !== null) {
          gantt.push(this.entry(currentProc, currentRunStart, clock, "SRJF", true))
          currentProc = null
        }
        if (i < sorted.length) clock = sorted[i].arrivalTime
        else break
        continue
      }

      // Sort by remaining time; prefer currently running process on ties
      ready.sort((a, b) => {
        if (a.remainingTime !== b.remainingTime)
          return a.remainingTime - b.remainingTime
        if (currentProc && a.pid === currentProc.pid) return -1
        if (currentProc && b.pid === currentProc.pid) return  1
        return a.arrivalTime - b.arrivalTime || a.pid - b.pid
      })

      const shortest = ready[0]

      // Context switch (preemption or first run)
      if (currentProc === null || currentProc.pid !== shortest.pid) {
        if (currentProc !== null) {
          gantt.push(this.entry(currentProc, currentRunStart, clock, "SRJF", true))
        }
        currentProc    = shortest
        currentRunStart = clock
        if (currentProc.responseTime === -1) currentProc.responseTime = clock
      }

      // Run 1 tick
      currentProc.remainingTime--
      clock++

      if (currentProc.remainingTime === 0) {
        gantt.push(this.entry(currentProc, currentRunStart, clock, "SRJF", false))
        currentProc.completionTime  = clock
        currentProc.turnaroundTime  = clock - currentProc.arrivalTime
        currentProc.waitingTime     = currentProc.turnaroundTime - currentProc.burstTime
        completed.push(currentProc)
        ready.shift()   // ready[0] === currentProc (still sorted to front)
        currentProc = null
      }
    }

    return { gantt, completed }
  }

  // ══════════════════════════════════════════════════════════
  //  Algorithm 4 — Priority + Round Robin (PRIORITY_RR)
  //  Processes grouped by priority (higher number = higher priority).
  //  Within each priority group: Round Robin with timeQuantum.
  //  Higher priority group preempts lower one as soon as it arrives.
  //  Tick-by-tick simulation. Emits run-length Gantt entries.
  // ══════════════════════════════════════════════════════════
  private runPriorityRR(
    procs:   SimProc[],
    quantum: number
  ): { gantt: GanttEntry[]; completed: SimProc[] } {
    const gantt:     GanttEntry[] = []
    const completed: SimProc[]    = []
    const sorted = [...procs].sort(
      (a, b) => a.arrivalTime - b.arrivalTime || a.pid - b.pid
    )

    let clock = 0
    let i     = 0

    // Priority → FIFO queue at that priority level
    const queues    = new Map<number, SimProc[]>()
    const enqueued  = new Set<number>()

    let currentProc:     SimProc | null = null
    let currentPrio      = -1
    let ticksInQuantum   = 0
    let currentRunStart  = 0

    const maxTime =
      procs.reduce((s, p) => s + p.burstTime, 0) +
      procs.reduce((m, p) => Math.max(m, p.arrivalTime), 0) + 2

    const enqueueArrivals = () => {
      while (i < sorted.length && sorted[i].arrivalTime <= clock) {
        const p = sorted[i]
        if (!enqueued.has(p.pid)) {
          enqueued.add(p.pid)
          if (!queues.has(p.priority)) queues.set(p.priority, [])
          queues.get(p.priority)!.push(p)
        }
        i++
      }
    }

    const getMaxPriority = (): number => {
      let max = -Infinity
      for (const [prio, q] of queues) {
        if (q.length > 0 && prio > max) max = prio
      }
      return max
    }

    enqueueArrivals()

    while (completed.length < procs.length && clock <= maxTime) {
      enqueueArrivals()

      // ── Higher-priority preemption check ──────────────────
      if (currentProc !== null) {
        const maxPrio = getMaxPriority()
        if (maxPrio > currentPrio) {
          // Preempt: emit entry, push current back to front of its queue
          gantt.push(
            this.entry(currentProc, currentRunStart, clock, "PRIORITY_RR", true)
          )
          if (!queues.has(currentPrio)) queues.set(currentPrio, [])
          queues.get(currentPrio)!.unshift(currentProc)  // front (LIFO preemption)
          currentProc   = null
          ticksInQuantum = 0
        }
      }

      // ── Pick next process if CPU is free ──────────────────
      if (currentProc === null) {
        const maxPrio = getMaxPriority()
        if (maxPrio === -Infinity) {
          // CPU idle — jump to next arrival
          if (i < sorted.length) {
            clock = sorted[i].arrivalTime
            enqueueArrivals()
          } else {
            break
          }
          continue
        }
        currentProc     = queues.get(maxPrio)!.shift()!
        currentPrio     = maxPrio
        currentRunStart = clock
        ticksInQuantum  = 0
        if (currentProc.responseTime === -1) currentProc.responseTime = clock
      }

      // ── Run 1 tick ────────────────────────────────────────
      currentProc.remainingTime--
      ticksInQuantum++
      clock++

      enqueueArrivals()  // check for new arrivals at the new clock

      if (currentProc.remainingTime === 0) {
        // Done
        gantt.push(
          this.entry(currentProc, currentRunStart, clock, "PRIORITY_RR", false)
        )
        currentProc.completionTime  = clock
        currentProc.turnaroundTime  = clock - currentProc.arrivalTime
        currentProc.waitingTime     = currentProc.turnaroundTime - currentProc.burstTime
        completed.push(currentProc)
        currentProc   = null
        ticksInQuantum = 0

      } else if (ticksInQuantum >= quantum) {
        // Quantum expired — back of same-priority queue
        gantt.push(
          this.entry(currentProc, currentRunStart, clock, "PRIORITY_RR", true)
        )
        if (!queues.has(currentPrio)) queues.set(currentPrio, [])
        queues.get(currentPrio)!.push(currentProc)  // back of queue (Round Robin)
        currentProc   = null
        ticksInQuantum = 0
      }
    }

    return { gantt, completed }
  }

  // ── GanttEntry builder ────────────────────────────────────
  private entry(
    p:           SimProc,
    start:       number,
    end:         number,
    algorithm:   SchedulerAlgorithm,
    isPreempted: boolean
  ): GanttEntry {
    return {
      pid:           p.pid,
      name:          p.name,
      color:         p.color,
      startTime:     start,
      endTime:       end,
      algorithmUsed: algorithm,
      isPreempted,
    }
  }

  // ── Metrics computation ───────────────────────────────────
  private computeMetrics(
    completed: SimProc[],
    gantt:     GanttEntry[]
  ): SchedulerMetrics {
    if (completed.length === 0) {
      return { averageWaitingTime: 0, averageTurnaroundTime: 0, cpuUtilization: 0, throughput: 0 }
    }

    const avgWait  = completed.reduce((s, p) => s + p.waitingTime,    0) / completed.length
    const avgTAT   = completed.reduce((s, p) => s + p.turnaroundTime, 0) / completed.length
    const totalTime = gantt.length > 0 ? Math.max(...gantt.map(e => e.endTime)) : 1
    const busyTime  = gantt.reduce((s, e) => s + (e.endTime - e.startTime), 0)

    return {
      averageWaitingTime:    round2(avgWait),
      averageTurnaroundTime: round2(avgTAT),
      cpuUtilization:        round2(Math.min(100, (busyTime / totalTime) * 100)),
      throughput:            round3(completed.length / totalTime),
    }
  }

  // ── Empty snapshot ────────────────────────────────────────
  private emptySnapshot(): SchedulerSnapshot {
    return {
      algorithm:     this.config.algorithm,
      timeQuantum:   this.config.timeQuantum,
      gantt:         [],
      metrics:       { averageWaitingTime: 0, averageTurnaroundTime: 0, cpuUtilization: 0, throughput: 0 },
      processStates: [],
      ranAt:         this.clockOffset,
    }
  }
}

// ── Rounding helpers ─────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000
