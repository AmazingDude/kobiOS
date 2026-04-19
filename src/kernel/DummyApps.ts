// ============================================================
//  kobiOS — DummyApps
//  Factory functions for each dummy application.
//  Every app uses the fork() → exec() → wait() pattern.
//  NO React imports. Pure simulation logic.
// ============================================================

import type { DummyAppConfig, DummyAppType } from "../types/index"
import { ProcessLifecycle } from "./ProcessLifecycle"
import { APP_THREAD_NAMES  } from "./ThreadManager"

// ── Helper: build thread definitions from APP_THREAD_NAMES ──
//  Splits totalBurst evenly across the app's named threads.
function makeThreads(
  programName: string,
  totalBurst: number
): Array<{ name: string; burstTime: number }> {
  const names   = APP_THREAD_NAMES[programName] ?? ["main"]
  const perThread = Math.max(1, Math.floor(totalBurst / names.length))
  const remainder = totalBurst - perThread * (names.length - 1)
  return names.map((name, i) => ({
    name,
    burstTime: i === names.length - 1 ? remainder : perThread,
  }))
}

// ── Calculator ───────────────────────────────────────────────
//  Single-process app, no child processes.
//  Threads: main, compute
export function launchCalculator(
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  const childPid = lifecycle.fork(initPid, config.arrivalTime)
  lifecycle.exec(
    childPid,
    "Calculator",
    config.burstTime,
    makeThreads("Calculator", config.burstTime)
  )
  return childPid
}

// ── WebBrowser ───────────────────────────────────────────────
//  Main browser process + a separate RenderHelper child process.
//  Main calls wait() until RenderHelper finishes.
//  Threads (main): main, renderer, network, js-engine, gpu-compositor
//  Threads (helper): main, paint
export function launchWebBrowser(
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  // 1. fork() main browser from init
  const mainPid = lifecycle.fork(initPid, config.arrivalTime)
  lifecycle.exec(
    mainPid,
    "WebBrowser",
    config.burstTime,
    makeThreads("WebBrowser", config.burstTime)
  )

  // 2. fork() RenderHelper from main browser (browsers use separate render processes)
  const renderBurst = Math.max(1, Math.floor(config.burstTime * 0.4))
  const renderHelperPid = lifecycle.fork(mainPid)
  lifecycle.exec(
    renderHelperPid,
    "WebBrowser:RenderHelper",
    renderBurst,
    makeThreads("WebBrowser:RenderHelper", renderBurst)
  )

  // 3. Main browser waits for RenderHelper (parent-child coordination)
  lifecycle.wait(mainPid)

  return mainPid
}

// ── Notepad ──────────────────────────────────────────────────
//  Single-process app.
//  Threads: main, io-handler
export function launchNotepad(
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  const childPid = lifecycle.fork(initPid, config.arrivalTime)
  lifecycle.exec(
    childPid,
    "Notepad",
    config.burstTime,
    makeThreads("Notepad", config.burstTime)
  )
  return childPid
}

// ── FileExplorer ─────────────────────────────────────────────
//  Main explorer + a ThumbnailWorker helper child process.
//  Main calls wait() until ThumbnailWorker finishes.
//  Threads (main): main, dir-scanner, thumbnail-loader
//  Threads (helper): main
export function launchFileExplorer(
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  // 1. fork() main explorer from init
  const mainPid = lifecycle.fork(initPid, config.arrivalTime)
  lifecycle.exec(
    mainPid,
    "FileExplorer",
    config.burstTime,
    makeThreads("FileExplorer", config.burstTime)
  )

  // 2. fork() ThumbnailWorker from main explorer
  const thumbBurst = Math.max(1, Math.floor(config.burstTime * 0.3))
  const thumbWorkerPid = lifecycle.fork(mainPid)
  lifecycle.exec(
    thumbWorkerPid,
    "FileExplorer:ThumbWorker",
    thumbBurst,
    makeThreads("FileExplorer:ThumbWorker", thumbBurst)
  )

  // 3. Main explorer waits for ThumbWorker
  lifecycle.wait(mainPid)

  return mainPid
}

// ── SystemMonitor ────────────────────────────────────────────
//  Single-process app with multiple polling threads.
//  Threads: main, cpu-poller, mem-poller, net-poller
export function launchSystemMonitor(
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  const childPid = lifecycle.fork(initPid, config.arrivalTime)
  lifecycle.exec(
    childPid,
    "SystemMonitor",
    config.burstTime,
    makeThreads("SystemMonitor", config.burstTime)
  )
  return childPid
}

// ── DummyProcess ─────────────────────────────────────────────
//  Generic placeholder process with worker threads.
//  Threads: main, worker-1, worker-2
export function launchDummyProcess(
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  const childPid = lifecycle.fork(initPid, config.arrivalTime)
  lifecycle.exec(
    childPid,
    "DummyProcess",
    config.burstTime,
    makeThreads("DummyProcess", config.burstTime)
  )
  return childPid
}

// ── Master Dispatcher ────────────────────────────────────────
//  Calls the correct launcher based on appType string.
//  Works with both DummyAppType enum values and raw strings.
export function launchApp(
  appType:   DummyAppType | string,
  lifecycle: ProcessLifecycle,
  config:    DummyAppConfig,
  initPid:   number
): number {
  switch (appType) {
    case "Calculator":    return launchCalculator(lifecycle, config, initPid)
    case "WebBrowser":    return launchWebBrowser(lifecycle, config, initPid)
    case "Notepad":       return launchNotepad(lifecycle, config, initPid)
    case "FileExplorer":  return launchFileExplorer(lifecycle, config, initPid)
    case "SystemMonitor": return launchSystemMonitor(lifecycle, config, initPid)
    case "DummyProcess":  return launchDummyProcess(lifecycle, config, initPid)
    default:              return launchDummyProcess(lifecycle, config, initPid)
  }
}
