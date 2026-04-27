import { describe, it, expect, beforeEach } from "vitest";
import { ThreadManager } from "../ThreadManager";

describe("ThreadManager", () => {
    let tm: ThreadManager;
    beforeEach(() => {
        tm = new ThreadManager();
    });

    it("spawns a thread with stack pointer, PC, registers, priority", () => {
        const t = tm.spawnThread(1, "main", 5, 2);
        expect(t.tid).toBeGreaterThan(0);
        expect(t.pid).toBe(1);
        expect(t.state).toBe("ready");
        expect(t.stackPointer).toBeGreaterThan(0);
        expect(t.programCounter).toBeGreaterThan(0);
        expect(t.priority).toBe(5);
        expect(t.quantum).toBe(2);
        expect(t.registers.r0).toBe(0);
    });

    it("spawns N threads for a process", () => {
        const ts = tm.spawnThreadsForProcess(1, "P1", 4, 3);
        expect(ts).toHaveLength(4);
        expect(tm.getThreadsOf(1)).toHaveLength(4);
    });

    it("tick advances PC and increments r0 of the running thread", () => {
        const t = tm.spawnThread(1, "main", 1, 4);
        const initialPC = t.programCounter;
        tm.tick(1);
        const after = tm.getThread(t.tid)!;
        expect(after.programCounter).toBeGreaterThan(initialPC);
        expect(after.registers.r0).toBe(1);
        expect(after.cpuTimeUsed).toBe(1);
    });

    it("rotates threads after quantum expires", () => {
        const t1 = tm.spawnThread(1, "T1", 1, 2);
        const t2 = tm.spawnThread(1, "T2", 1, 2);
        // tick twice with quantum=2 — t1 should fill its quantum, then rotate
        tm.tick(1);
        tm.tick(1);
        // after 2 ticks, t1 has used its quantum; t2 should be ready to run next
        tm.tick(1);
        const after1 = tm.getThread(t1.tid)!;
        const after2 = tm.getThread(t2.tid)!;
        expect(after1.cpuTimeUsed + after2.cpuTimeUsed).toBe(3);
        // t2 should have run at least once
        expect(after2.cpuTimeUsed).toBeGreaterThan(0);
    });

    it("blocked threads are not picked", () => {
        const t1 = tm.spawnThread(1, "T1", 1, 4);
        const t2 = tm.spawnThread(1, "T2", 1, 4);
        tm.blockThread(t1.tid);
        tm.tick(1);
        const after2 = tm.getThread(t2.tid)!;
        expect(after2.state).toBe("running");
    });

    it("killThreadsOfProcess terminates them all", () => {
        tm.spawnThreadsForProcess(1, "P1", 3, 1);
        tm.killThreadsOfProcess(1);
        for (const t of tm.getThreadsOf(1)) {
            expect(t.state).toBe("terminated");
        }
    });

    it("each thread gets a distinct stack pointer", () => {
        const t1 = tm.spawnThread(1, "T1", 1, 1);
        const t2 = tm.spawnThread(1, "T2", 1, 1);
        expect(t1.stackPointer).not.toBe(t2.stackPointer);
    });
});
