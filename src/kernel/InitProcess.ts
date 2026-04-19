// ============================================================
//  kobiOS — InitProcess
//  Bootstraps PID 1 ("init") — the root of all processes.
//  All dummy apps are forked from PID 1.
//  NO React imports. Pure simulation logic.
// ============================================================

import { ProcessManager } from "./ProcessManager"
import { ThreadManager  } from "./ThreadManager"
import { ProcessLifecycle } from "./ProcessLifecycle"

// ── bootstrapInit ─────────────────────────────────────────
//  Creates PID 1 directly (NOT via fork — init has no parent).
//  Sets up the "kobiOS-kernel" thread.
//  Returns PID 1.
export function bootstrapInit(
  processManager: ProcessManager,
  threadManager:  ThreadManager,
  _lifecycle:     ProcessLifecycle   // reserved for future expansion
): number {
  const init = processManager.createProcess(
    "init",   // name
    9_999,    // burst — effectively infinite, init never terminates
    99,       // highest possible priority
    0,        // arrival time = simulation start
    0,        // clock = 0
    null,     // no parent
    "init",   // programName
    0         // forkDepth = 0 (root)
  )

  // Give init its kernel thread directly (bypassing exec)
  const kernelThread = threadManager.createThread(
    init.pid,
    "kobiOS-kernel",
    9_999,
    0   // createdAt = clock 0
  )
  kernelThread.state          = "running"
  kernelThread.cpuUsagePercent = 5

  init.threads.push(kernelThread.tid)
  init.state           = "running"
  init.cpuUsagePercent = 5
  init.memoryUsageKB   = 4_000
  init.openFileCount   = 3

  return init.pid
}
