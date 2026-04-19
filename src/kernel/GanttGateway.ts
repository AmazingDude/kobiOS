// ============================================================
//  kobiOS — GanttGateway
//  Stores scheduler run snapshots and exposes them for the
//  Gantt chart UI and algorithm comparison panel.
//  NO React imports. Pure simulation logic.
// ============================================================

import type {
  SchedulerSnapshot,
  SchedulerMetrics,
  SchedulerAlgorithm,
  GanttEntry,
} from "../types/index"

export class GanttGateway {
  private snapshots: SchedulerSnapshot[] = []

  // ── Store a snapshot after every scheduler run ────────────
  addSnapshot(snapshot: SchedulerSnapshot): void {
    this.snapshots.push(snapshot)
  }

  // ── Most recent snapshot (default Gantt display) ──────────
  getLatestSnapshot(): SchedulerSnapshot | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null
  }

  // ── All snapshots (history) ───────────────────────────────
  getAllSnapshots(): SchedulerSnapshot[] {
    return [...this.snapshots]
  }

  // ── Latest snapshot for a specific algorithm ─────────────
  getSnapshotByAlgorithm(
    algorithm: SchedulerAlgorithm
  ): SchedulerSnapshot | null {
    const matching = this.snapshots.filter(s => s.algorithm === algorithm)
    return matching.length > 0 ? matching[matching.length - 1] : null
  }

  // ── Gantt entries only (convenience for chart rendering) ──
  //  If algorithm is specified, returns entries for that algorithm's
  //  latest run; otherwise returns the latest run's entries.
  getGanttEntries(algorithm?: SchedulerAlgorithm): GanttEntry[] {
    const snap = algorithm
      ? this.getSnapshotByAlgorithm(algorithm)
      : this.getLatestSnapshot()
    return snap ? [...snap.gantt] : []
  }

  // ── Metrics only (convenience for metrics panel) ──────────
  getMetrics(algorithm?: SchedulerAlgorithm): SchedulerMetrics | null {
    const snap = algorithm
      ? this.getSnapshotByAlgorithm(algorithm)
      : this.getLatestSnapshot()
    return snap ? { ...snap.metrics } : null
  }

  // ── Side-by-side comparison of all stored algorithms ──────
  //  Returns one entry per unique algorithm (latest run each).
  compareAlgorithms(): Array<{
    algorithm: SchedulerAlgorithm
    metrics: SchedulerMetrics
  }> {
    const seen = new Map<SchedulerAlgorithm, SchedulerSnapshot>()
    for (const s of this.snapshots) {
      seen.set(s.algorithm, s)   // later runs overwrite earlier ones
    }
    return Array.from(seen.values()).map(s => ({
      algorithm: s.algorithm,
      metrics:   { ...s.metrics },
    }))
  }

  // ── Per-process metrics table (for Gantt detail panel) ────
  getProcessStates(algorithm?: SchedulerAlgorithm) {
    const snap = algorithm
      ? this.getSnapshotByAlgorithm(algorithm)
      : this.getLatestSnapshot()
    return snap ? [...snap.processStates] : []
  }

  // ── Max time value across all Gantt entries ───────────────
  //  Useful for scaling the x-axis of the chart.
  getTimelineLength(algorithm?: SchedulerAlgorithm): number {
    const entries = this.getGanttEntries(algorithm)
    return entries.length > 0 ? Math.max(...entries.map(e => e.endTime)) : 0
  }

  // ── Reset ─────────────────────────────────────────────────
  reset(): void {
    this.snapshots = []
  }
}
