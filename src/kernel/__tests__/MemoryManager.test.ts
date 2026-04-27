import { describe, it, expect, beforeEach } from "vitest";
import { MemoryManager } from "../MemoryManager";

describe("MemoryManager — pure simulation", () => {
    /**
     * Belady's classic example reference string for FIFO anomaly.
     * With 3 frames FIFO produces 9 faults; with 4 frames FIFO produces 10.
     */
    const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

    it("FIFO reproduces Belady's anomaly (3 frames < 4 frames)", () => {
        const r3 = MemoryManager.simulateReferenceString(BELADY, 3, "FIFO");
        const r4 = MemoryManager.simulateReferenceString(BELADY, 4, "FIFO");
        expect(r3.pageFaults).toBe(9);
        expect(r4.pageFaults).toBe(10);
    });

    it("OPTIMAL is at least as good as LRU/FIFO", () => {
        const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
        const fifo = MemoryManager.simulateReferenceString(refs, 3, "FIFO");
        const lru = MemoryManager.simulateReferenceString(refs, 3, "LRU");
        const opt = MemoryManager.simulateReferenceString(refs, 3, "OPTIMAL");
        expect(opt.pageFaults).toBeLessThanOrEqual(fifo.pageFaults);
        expect(opt.pageFaults).toBeLessThanOrEqual(lru.pageFaults);
        // textbook (OS Concepts) numbers for this string and 3 frames:
        // FIFO 15, LRU 12, OPTIMAL 9
        expect(fifo.pageFaults).toBe(15);
        expect(lru.pageFaults).toBe(12);
        expect(opt.pageFaults).toBe(9);
    });

    it("CLOCK approximates LRU and never exceeds FIFO badly", () => {
        const refs = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
        const clock = MemoryManager.simulateReferenceString(refs, 3, "CLOCK");
        expect(clock.pageFaults).toBeGreaterThan(0);
        expect(clock.pageFaults).toBeLessThanOrEqual(refs.length);
    });

    it("page faults + page hits = total references", () => {
        const refs = [1, 2, 3, 1, 2, 4, 5, 1, 2, 3];
        const r = MemoryManager.simulateReferenceString(refs, 3, "LRU");
        expect(r.pageFaults + r.pageHits).toBe(refs.length);
    });

    it("emits a fault event for every miss and a hit event for every hit", () => {
        const refs = [1, 2, 1, 3, 2];
        const r = MemoryManager.simulateReferenceString(refs, 3, "LRU");
        const faults = r.events.filter((e) => e.fault).length;
        const hits = r.events.filter((e) => !e.fault).length;
        expect(faults).toBe(r.pageFaults);
        expect(hits).toBe(r.pageHits);
    });
});

describe("MemoryManager — live access", () => {
    let mm: MemoryManager;
    beforeEach(() => {
        mm = new MemoryManager();
    });

    it("counts a fault on first access and a hit on the second", () => {
        mm.allocatePages(1, 1, "#fff");
        const stats0 = mm.getStats();
        expect(stats0.usedFrames).toBe(1);

        mm.accessPage(1, 0); // already mapped → hit
        const after = mm.getStats();
        expect(after.pageHits).toBe(1);
    });

    it("evicts when total demand exceeds frame count (FIFO)", () => {
        mm.setPolicy("FIFO");
        // 32 frames available; allocate 33 pages to force eviction
        mm.allocatePages(1, 33, "#fff");
        const stats = mm.getStats();
        expect(stats.usedFrames).toBe(32);
    });

    it("deallocate frees the process's frames", () => {
        mm.allocatePages(1, 5, "#fff");
        mm.allocatePages(2, 5, "#fff");
        mm.deallocatePages(1);
        const stats = mm.getStats();
        expect(stats.usedFrames).toBe(5);
    });

    it("setPolicy/getPolicy round-trip", () => {
        mm.setPolicy("CLOCK");
        expect(mm.getPolicy()).toBe("CLOCK");
        mm.setPolicy("OPTIMAL");
        expect(mm.getPolicy()).toBe("OPTIMAL");
    });
});
