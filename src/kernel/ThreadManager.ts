import type { TCB, ThreadState } from "../types";

/**
 * ThreadManager — simulates per-process threads (TCBs).
 *
 * A process can host one or more threads. The CPU-time given to a process
 * (by the higher-level CPU scheduler) is divided among its threads in
 * round-robin fashion using each thread's quantum. Each thread carries its
 * own context: stack pointer, program counter, register file, priority,
 * cumulative CPU time used.
 *
 * This is what fulfils Objective (a): "Design core OS data structures such
 * as ... thread control blocks (TCB)" — by actually instantiating and
 * scheduling them, not just declaring the type.
 */

let tidCounter = 1;

const STACK_BASE = 0xfffff0;
const STACK_STRIDE = 0x000400;

export class ThreadManager {
    private threads: Map<number, TCB> = new Map();
    /** runningTid keyed by pid */
    private runningByPid: Map<number, number | null> = new Map();

    spawnThread(
        pid: number,
        name: string,
        priority: number,
        quantum: number = 2,
    ): TCB {
        const tid = tidCounter++;
        const stackBase = STACK_BASE - (tid - 1) * STACK_STRIDE;
        const tcb: TCB = {
            tid,
            pid,
            name,
            state: "ready",
            stackPointer: stackBase,
            programCounter: 0x400000,
            registers: { r0: 0, r1: 0, r2: 0, r3: 0 },
            priority,
            cpuTimeUsed: 0,
            quantum,
        };
        this.threads.set(tid, tcb);
        if (!this.runningByPid.has(pid)) this.runningByPid.set(pid, null);
        return tcb;
    }

    /**
     * Allocate `count` threads for a process, named "<procName>-T<n>".
     */
    spawnThreadsForProcess(
        pid: number,
        procName: string,
        count: number,
        priority: number,
        quantum: number = 2,
    ): TCB[] {
        const out: TCB[] = [];
        for (let i = 0; i < count; i++) {
            out.push(
                this.spawnThread(
                    pid,
                    `${procName}-T${i}`,
                    priority,
                    quantum,
                ),
            );
        }
        return out;
    }

    /**
     * Tick the running thread of `pid`. If no thread is running, picks the
     * highest-priority ready thread of that pid (round-robin within priority).
     * Returns the running TCB after the tick (or null if none).
     */
    tick(pid: number): TCB | null {
        const ready = this.getReadyThreads(pid);
        let running: TCB | null = this.getRunningThread(pid);

        if (!running || running.state !== "running") {
            const next = this.pickNext(ready);
            if (!next) return null;
            running = next;
            running.state = "running";
            this.runningByPid.set(pid, running.tid);
        }

        // simulate one instruction
        running.programCounter += 4;
        running.registers.r0 = (running.registers.r0 + 1) >>> 0;
        running.cpuTimeUsed += 1;

        // quantum expired? rotate
        if (running.cpuTimeUsed % running.quantum === 0) {
            const others = ready.filter((t) => t.tid !== running!.tid);
            if (others.length > 0) {
                running.state = "ready";
                const next = this.pickNext(others);
                if (next) {
                    next.state = "running";
                    this.runningByPid.set(pid, next.tid);
                }
            }
        }

        return this.getRunningThread(pid);
    }

    yieldThread(tid: number): void {
        const t = this.threads.get(tid);
        if (!t) return;
        t.state = "ready";
        const cur = this.runningByPid.get(t.pid);
        if (cur === tid) this.runningByPid.set(t.pid, null);
    }

    blockThread(tid: number): void {
        const t = this.threads.get(tid);
        if (!t) return;
        t.state = "waiting";
        const cur = this.runningByPid.get(t.pid);
        if (cur === tid) this.runningByPid.set(t.pid, null);
    }

    unblockThread(tid: number): void {
        const t = this.threads.get(tid);
        if (!t) return;
        if (t.state === "waiting") t.state = "ready";
    }

    exitThread(tid: number): void {
        const t = this.threads.get(tid);
        if (!t) return;
        t.state = "terminated";
        const cur = this.runningByPid.get(t.pid);
        if (cur === tid) this.runningByPid.set(t.pid, null);
    }

    killThreadsOfProcess(pid: number): void {
        for (const t of this.threads.values()) {
            if (t.pid === pid) t.state = "terminated";
        }
        this.runningByPid.set(pid, null);
    }

    getThread(tid: number): TCB | undefined {
        return this.threads.get(tid);
    }

    getThreadsOf(pid: number): TCB[] {
        return Array.from(this.threads.values())
            .filter((t) => t.pid === pid)
            .sort((a, b) => a.tid - b.tid);
    }

    getAllThreads(): TCB[] {
        return Array.from(this.threads.values()).sort((a, b) => a.tid - b.tid);
    }

    getRunningThread(pid: number): TCB | null {
        const tid = this.runningByPid.get(pid);
        if (tid === undefined || tid === null) return null;
        return this.threads.get(tid) ?? null;
    }

    setThreadState(tid: number, state: ThreadState): void {
        const t = this.threads.get(tid);
        if (t) t.state = state;
    }

    reset(): void {
        this.threads.clear();
        this.runningByPid.clear();
        tidCounter = 1;
    }

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------

    private getReadyThreads(pid: number): TCB[] {
        return this.getThreadsOf(pid).filter(
            (t) => t.state === "ready" || t.state === "running",
        );
    }

    private pickNext(candidates: TCB[]): TCB | undefined {
        if (candidates.length === 0) return undefined;
        // highest priority, then least-recently-run (least cpuTimeUsed)
        return [...candidates].sort(
            (a, b) =>
                b.priority - a.priority ||
                a.cpuTimeUsed - b.cpuTimeUsed ||
                a.tid - b.tid,
        )[0];
    }
}
