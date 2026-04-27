import { describe, it, expect, beforeEach } from "vitest";
import { DeadlockDetector } from "../DeadlockDetector";

describe("DeadlockDetector", () => {
    let dd: DeadlockDetector;
    beforeEach(() => {
        dd = new DeadlockDetector();
    });

    it("safe state has no cycle", () => {
        dd.allocate(1, "R1");
        dd.allocate(2, "R2");
        dd.request(1, "R3"); // R3 nobody holds → no cycle
        const result = dd.detect();
        expect(result.deadlocked).toBe(false);
        expect(result.cycle).toEqual([]);
        expect(result.victimPid).toBeNull();
    });

    it("detects two-process circular wait", () => {
        // P1 holds R1, requests R2.  P2 holds R2, requests R1.
        dd.allocate(1, "R1");
        dd.allocate(2, "R2");
        dd.request(1, "R2");
        dd.request(2, "R1");
        const result = dd.detect();
        expect(result.deadlocked).toBe(true);
        expect(result.cycle.sort()).toEqual([1, 2]);
        expect(result.victimPid).toBe(1); // lowest PID in cycle
        expect(result.cycleResources.sort()).toEqual(["R1", "R2"]);
    });

    it("detects four-process circular wait", () => {
        for (let p = 1; p <= 4; p++) dd.allocate(p, `R${p}`);
        dd.request(1, "R2");
        dd.request(2, "R3");
        dd.request(3, "R4");
        dd.request(4, "R1");
        const result = dd.detect();
        expect(result.deadlocked).toBe(true);
        expect(result.cycle.sort()).toEqual([1, 2, 3, 4]);
        expect(result.victimPid).toBe(1);
    });

    it("releasing the right resource breaks the deadlock", () => {
        dd.allocate(1, "R1");
        dd.allocate(2, "R2");
        dd.request(1, "R2");
        dd.request(2, "R1");
        expect(dd.detect().deadlocked).toBe(true);
        dd.release(2, "R2");
        expect(dd.detect().deadlocked).toBe(false);
    });

    it("removeProcess clears all of its allocations and requests", () => {
        dd.allocate(1, "R1");
        dd.allocate(2, "R2");
        dd.request(1, "R2");
        dd.request(2, "R1");
        dd.removeProcess(1);
        const state = dd.getState();
        expect(state.allocations.find((a) => a.pid === 1)).toBeUndefined();
        expect(state.requests.find((r) => r.pid === 1)).toBeUndefined();
        expect(dd.detect().deadlocked).toBe(false);
    });
});
