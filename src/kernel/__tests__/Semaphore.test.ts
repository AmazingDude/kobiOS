import { describe, it, expect } from "vitest";
import { Mutex, Semaphore } from "../Semaphore";

describe("Mutex", () => {
    it("first acquirer gets the lock", () => {
        const m = new Mutex();
        expect(m.acquire(1)).toBe(true);
        expect(m.getState().owner).toBe(1);
    });

    it("second acquirer is queued, not granted", () => {
        const m = new Mutex();
        m.acquire(1);
        expect(m.acquire(2)).toBe(false);
        expect(m.getState().waitingQueue).toEqual([2]);
    });

    it("release passes the lock to the next waiter", () => {
        const m = new Mutex();
        m.acquire(1);
        m.acquire(2);
        m.acquire(3);
        const next = m.release(1);
        expect(next).toBe(2);
        expect(m.getState().owner).toBe(2);
        expect(m.getState().waitingQueue).toEqual([3]);
    });

    it("releasing without owning is a no-op", () => {
        const m = new Mutex();
        m.acquire(1);
        expect(m.release(99)).toBeNull();
        expect(m.getState().owner).toBe(1);
    });
});

describe("Semaphore — counting", () => {
    it("wait decrements; signal increments", () => {
        const s = new Semaphore(2, "buf");
        s.wait(1);
        s.wait(2);
        expect(s.getValue()).toBe(0);
        s.signal();
        expect(s.getValue()).toBe(1);
    });

    it("wait blocks when value goes negative", () => {
        const s = new Semaphore(1, "buf");
        s.wait(1);
        s.wait(2); // now negative — pid 2 waits
        expect(s.getWaitingQueue()).toEqual([2]);
    });

    it("producer-consumer: signal wakes a waiter", () => {
        const empty = new Semaphore(3, "empty");
        const full = new Semaphore(0, "full");

        // producer produces 1 item
        empty.wait(1);
        full.signal();
        expect(empty.getValue()).toBe(2);
        expect(full.getValue()).toBe(1);

        // consumer consumes
        full.wait(2);
        empty.signal();
        expect(full.getValue()).toBe(0);
        expect(empty.getValue()).toBe(3);
    });
});
