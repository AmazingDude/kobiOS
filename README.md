# kobiOS — Mini OS Kernel Simulator

A **user-space simulator of a mini operating-system kernel** built in
TypeScript + React + Vite, presented through a desktop-style UI.
This is the deliverable for **CS-330: Operating Systems – Spring 2026
Complex Engineering Problem (CEP)** at NUST SEECS (BESE 30, Section A/B/C).

It models the four core subsystems the spec asks for and lets you
**run experiments, inspect data structures, and validate behaviour**
all from inside the browser:

1. **Process and thread management** — PCBs, TCBs, lifecycle, real
   per-process threads with stack pointer / PC / registers.
2. **CPU scheduling** — FCFS, Round-Robin, Priority RR with **aging**,
   SRJF, with I/O bursts.
3. **Process synchronization** — Mutex, counting semaphore, classic
   Producer-Consumer demo, and a Resource-Allocation-Graph deadlock
   detector with cycle detection and victim selection.
4. **Memory management** — paging-based virtual memory with **four**
   page-replacement policies (FIFO, LRU, **Optimal**, **Clock**) and a
   reference-string simulator.

It also ships a built-in **Experiments window** that runs every
scheduling algorithm against three realistic workloads
(CPU-bound, I/O-bound, mixed) and renders a comparison table plus bar
charts of the metrics — fulfilling the "compare scheduling and memory
policies using experiments" objective directly inside the simulator.

---

## Quick start

Requirements:

- Node.js 18+ (tested on Node 20 / 22)
- npm 9+

```bash
git clone <repo-url> kobiOS
cd kobiOS
npm install
npm run dev      # http://localhost:5173
```

Other useful scripts:

```bash
npm run build       # tsc -b && vite build (production bundle in dist/)
npm run preview     # serve the production bundle
npm run lint        # eslint
npm test            # vitest run (40 structured test cases)
npm run test:watch  # vitest in watch mode
```

---

## Project layout

```
src/
  kernel/                 # pure simulation logic (testable in isolation)
    ProcessManager.ts     # PCBs + lifecycle
    Scheduler.ts          # FCFS / RR / PRIORITY_RR / SRJF + I/O + aging + RT
    MemoryManager.ts      # paging + FIFO/LRU/OPTIMAL/CLOCK
    ThreadManager.ts      # TCBs + per-process round-robin thread scheduler
    Semaphore.ts          # Mutex + counting Semaphore
    DeadlockDetector.ts   # Resource Allocation Graph + cycle detection
    ExperimentRunner.ts   # canned workloads + run-all-algos batch
    __tests__/            # vitest test cases (one file per module)

  store/
    kernelStore.ts        # Zustand store wiring kernel modules to UI

  components/
    desktop/              # window manager, top-bar, wallpaper
    windows/
      ProcessManager.tsx  # spawn/kill/inspect processes
      SchedulerWindow.tsx # configure algorithm, run, see Gantt + metrics
      MemoryViewer.tsx    # frames, page table, reference-string sim
      SyncDemo.tsx        # producer-consumer with mutex + semaphore
      ThreadsWindow.tsx   # per-process TCB inspector + thread tick
      DeadlockWindow.tsx  # interactive RAG + cycle detection
      ExperimentsWindow.tsx
                          # run-all-algos suite + recharts comparison
      Terminal.tsx        # kobiSH — drives every kernel feature via CLI

  types/
    index.ts              # all shared types (PCB, TCB, RAG, etc.)
```

---

## What each subsystem does

### Process / thread management

`PCB` (`src/types/index.ts`) and `ProcessManager` model the classic
process lifecycle (`new -> ready -> running -> waiting -> terminated`).
Each PCB carries: PID, name, state, priority + base priority, burst
time, remaining time, arrival time, waiting / turnaround / response
time, and now also `workloadType`, `ioBurstTime`, `ioCount`, and
`threadCount` so the scheduler can simulate realistic I/O behaviour.

`ThreadManager` instantiates real **TCBs**: each thread has a unique
TID, a stack pointer (per-thread), a program counter, a small register
file (`r0..r3`), priority, quantum, and cumulative CPU time. The
simulator's `tick(pid)` advances the running thread's PC + R0 by one
"instruction" and rotates threads when their quantum expires
(round-robin within the process, prioritised by thread priority).

This is exposed in the **Threads** window and via the terminal:
`tspawn <pid>`, `ttick <pid>`, `tstate <tid> <state>`, `threads`.

### CPU scheduling

`Scheduler.run(processes)` is a single-tick simulator that supports:

- **FCFS** — non-preemptive.
- **Round Robin (RR)** — preemptive, time quantum.
- **Priority RR** — priority-driven RR, with optional **aging**
  (Section 8.5.2 of OS Concepts: a starving process gets `+1` priority
  every `agingThreshold` ticks while ready).
- **SRJF** — preemptive shortest-remaining-job-first.

Each PCB can declare an I/O burst pattern: the CPU burst is split into
`ioCount + 1` chunks, with `ioBurstTime` ticks of "waiting" between
chunks. This is what gives the I/O-bound and mixed workloads their
realistic shape.

The scheduler writes back **completionTime, turnaroundTime,
waitingTime, and responseTime** on every PCB and returns a Gantt chart
plus aggregate metrics:

```ts
interface SchedulerMetrics {
  averageWaitingTime: number;
  averageTurnaroundTime: number;
  averageResponseTime: number;     // first-run-at − arrival, averaged
  cpuUtilization: number;          // % busy ticks
  throughput: number;              // processes/tick
  totalTime: number;
}
```

### Synchronization

`Mutex` and `Semaphore` are in `src/kernel/Semaphore.ts`. The
**SyncDemo** window runs the textbook bounded-buffer
producer-consumer with a mutex protecting the buffer and two counting
semaphores (`empty`, `full`) — you can step it tick-by-tick and watch
the queue, owner, and value evolve.

### Deadlock detection

`DeadlockDetector` builds a **Resource Allocation Graph** (allocation
edges resource→process, request edges process→resource), reduces it
to the wait-for graph, and runs a DFS-coloured cycle finder. If it
finds a cycle it reports the cycle, the resources involved, and a
deterministic victim (lowest PID in the cycle).

The **Deadlock** window lets you build the RAG visually, load a classic
4-process circular wait, run detection, and "kill" the victim. The
terminal mirrors all of this:

```
rag alloc 1 R1
rag alloc 2 R2
rag req   1 R2
rag req   2 R1
rag detect       # → DEADLOCK DETECTED, victim P1
```

### Memory management

`MemoryManager` simulates 32 page frames with per-process page tables.
Live calls (`accessPage`) use the currently selected policy. Four
replacement policies are implemented:

- **FIFO** — oldest-loaded victim
- **LRU** — least-recently-used victim
- **OPTIMAL** — Belady's optimal (for live mode it falls back to LRU
  because future is unknown; the **pure simulator** below runs full
  Optimal correctly)
- **CLOCK** — second-chance, reference-bit based

`MemoryManager.simulateReferenceString(refs, frameCount, policy)` is a
**pure** static method that runs a policy against an arbitrary
reference string with full future knowledge, returning the per-step
trace, page faults, hits, and final frame contents. The Memory window
exposes this through a "Reference-string simulator" panel and the
Experiments window uses it to compare all four policies on canonical
strings (Belady's anomaly, OS-Concepts §10 example, etc.).

### Experiments

`runExperiments(quantum)` (`src/kernel/ExperimentRunner.ts`) runs every
algorithm against three pre-defined workloads:

- **CPU-bound** — four long CPU-only processes
- **I/O-bound** — five short bursts with frequent I/O waits
- **Mixed** — realistic mix of CPU-bound, I/O-bound, and balanced

The Experiments window renders a comparison table (best algorithm
highlighted per workload) and bar charts for any of: avg waiting,
turnaround, response time, CPU utilisation, throughput. There is also
a parallel chart comparing FIFO/LRU/Optimal/Clock on canonical
reference strings.

From the terminal:

```
bench               # run the full suite
bench show wait     # tabulate avg waiting time
bench show rt       # tabulate avg response time
```

---

## Validating correctness — automated tests

The CEP rubric explicitly asks for "validate correctness and
performance using structured test cases". These live in
`src/kernel/__tests__/` and run with **Vitest**:

```bash
npm test
```

Coverage:

| File | Tests | What it proves |
| --- | --- | --- |
| `Scheduler.test.ts` | 9 | FCFS ordering, RR interleaving, SRJF preemption, response-time formula, aging actually changes priority, I/O bursts inflate turnaround, average metrics |
| `MemoryManager.test.ts` | 9 | **Belady's anomaly is reproduced** (FIFO 9 faults @ 3 frames vs 10 @ 4), OPTIMAL ≤ LRU ≤ FIFO on the OS-Concepts reference string with the textbook numbers (9 / 12 / 15), faults + hits = total references, eviction at frame limit |
| `ThreadManager.test.ts` | 7 | TCB has stack pointer / PC / registers / priority, tick advances PC + r0, quantum-driven round-robin, blocked threads aren't picked, kill-process terminates all its threads |
| `DeadlockDetector.test.ts` | 5 | safe state, 2-cycle, 4-cycle, releasing resource breaks deadlock, victim selection |
| `Semaphore.test.ts` | 7 | Mutex queueing + handoff, counting semaphore P/V, full producer-consumer round-trip |
| `ExperimentRunner.test.ts` | 3 | Every (workload, algorithm) combination produces sane metrics, SRJF ≤ FCFS on CPU-bound avg-wait |
| **Total** | **40** | — |

All tests are pure: they exercise the kernel modules directly without
needing the React UI.

---

## Terminal cheat-sheet

The "tty0" window inside the simulator (`Terminal.tsx`) is a
mini-shell that drives every kernel feature. `help` prints the full
list; the most useful ones:

```
spawn <name> <burst> [pri] [arrival]    create a process
ps                                      list processes
scheduler <FCFS|RR|PRIORITY_RR|SRJF> q  switch algorithm
aging on|off                            toggle priority aging
run                                     simulate
metrics                                 avg wait / turnaround / RT / CPU / tput
gantt                                   Gantt chart of last run

threads [pid]                           list TCBs
tspawn <pid>                            spawn another thread inside a process
ttick <pid>                             advance the running thread of <pid>

mempolicy FIFO|LRU|OPTIMAL|CLOCK        switch page replacement

rag alloc <pid> <res>                   resource → process
rag req   <pid> <res>                   process → resource
rag detect                              cycle detection
rag example                             load 4-process circular wait

bench [q]                               run all algos × all workloads
bench show wait|turn|rt|cpu|tput        comparison table
```

---

## Mapping back to the CEP rubric

| Spec objective | Where it lives |
| --- | --- |
| (a) PCB / TCB / page table abstractions | `types/index.ts`, `ProcessManager.ts`, `ThreadManager.ts`, `MemoryManager.ts` |
| (b) ≥2 scheduling algorithms + WT/TAT/CPU | `Scheduler.ts` (FCFS, RR, PRIORITY_RR, SRJF) — also reports response time |
| (c) Mutex / semaphore + race-condition demo | `Semaphore.ts`, `SyncDemo.tsx` |
| (d) Paging + ≥1 page replacement policy | `MemoryManager.ts` (4 policies) |
| (e.1) CPU-bound / I/O-bound / mixed workloads | `ExperimentRunner.ts` (`WORKLOADS`) |
| (e.2) Compare scheduling + memory policies via experiments | `ExperimentsWindow.tsx` (table + bar charts) |
| (e.3) Validate correctness / performance via test cases | `src/kernel/__tests__/` (40 vitest cases) |
| Process state diagrams / scheduler flowcharts / memory diagrams | Technical report (`/docs`) |

---

## Tech stack

- **TypeScript** (~6.0)
- **React 19** + **Vite 8**
- **Zustand** for kernel-state management (single source of truth, no
  prop-drilling)
- **Recharts** for the experiment bar charts
- **Framer Motion** for window animations
- **Tailwind CSS v4** + custom CSS variables for the desktop theme
- **Vitest 4** for the test suite
- **ESLint 9** + `typescript-eslint`

This was developed and tested on Windows 10/11 + Node 20+, but
nothing in the project is platform-specific — `npm install && npm run
dev` works identically on macOS and Linux.

---

## Authors

BESE 30 — Section A — CS-330 CEP, Spring 2026.
