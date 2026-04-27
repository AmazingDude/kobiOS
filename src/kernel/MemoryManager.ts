import type {
    MemoryFrame,
    MemoryStats,
    PageReplacementPolicy,
    PageReferenceEvent,
    PageTableEntry,
} from "../types";

const TOTAL_FRAMES = 32;

/**
 * MemoryManager — paging-based virtual memory simulator.
 *
 * Supports four page replacement policies:
 *   - FIFO   (oldest-loaded victim)
 *   - LRU    (least-recently-used victim)
 *   - OPTIMAL (Belady's optimal — uses future reference string when provided)
 *   - CLOCK  (second-chance, reference-bit based)
 *
 * Live calls (`accessPage`) use the currently selected policy. OPTIMAL has no
 * future knowledge during live access so it transparently falls back to LRU
 * for those calls. The pure-simulation method `simulateReferenceString`
 * computes Optimal correctly because it has the full trace up-front.
 */
export class MemoryManager {
    private frames: MemoryFrame[] = [];
    private pageTables: Map<number, Map<number, PageTableEntry>> = new Map();
    private processColors: Map<number, string> = new Map();
    private frameLoadedAt: Map<number, number> = new Map();
    private frameLastAccessedAt: Map<number, number> = new Map();
    private clockHand = 0;
    private policy: PageReplacementPolicy = "FIFO";
    private pageFaults = 0;
    private pageHits = 0;
    private clock = 0;

    constructor() {
        this.frames = this.createEmptyFrames();
    }

    // -------------------------------------------------------------------------
    // Public API — live access
    // -------------------------------------------------------------------------

    allocatePages(pid: number, numPages: number, color: string): void {
        if (numPages < 1) return;

        const table = this.ensurePageTable(pid);
        this.processColors.set(pid, color);

        let nextPage = table.size;
        while (table.has(nextPage)) nextPage++;

        for (let i = 0; i < numPages; i++) {
            const pageNumber = nextPage + i;
            const frameId = this.allocateFrame(pid, pageNumber, color);
            table.set(pageNumber, {
                pageNumber,
                frameId,
                valid: true,
            });
        }
    }

    deallocatePages(pid: number): void {
        for (const frame of this.frames) {
            if (frame.pid !== pid) continue;
            this.clearFrame(frame.frameId);
        }
        this.pageTables.delete(pid);
        this.processColors.delete(pid);
    }

    accessPage(pid: number, pageNumber: number): boolean {
        const table = this.ensurePageTable(pid);
        const entry = table.get(pageNumber);

        if (entry && entry.valid && entry.frameId !== null) {
            this.touchFrame(entry.frameId);
            this.pageHits += 1;
            return false;
        }

        this.pageFaults += 1;
        const color = this.processColors.get(pid) ?? "#6366f1";
        const frameId = this.allocateFrame(pid, pageNumber, color);

        table.set(pageNumber, {
            pageNumber,
            frameId,
            valid: true,
        });

        return true;
    }

    getFrames(): MemoryFrame[] {
        return this.frames.map((f) => ({ ...f }));
    }

    getPageTable(pid: number): PageTableEntry[] {
        const table = this.pageTables.get(pid);
        if (!table) return [];

        return Array.from(table.values())
            .sort((a, b) => a.pageNumber - b.pageNumber)
            .map((e) => ({ ...e }));
    }

    getStats(): MemoryStats {
        const usedFrames = this.frames.filter((f) => f.pid !== null).length;
        return {
            totalFrames: TOTAL_FRAMES,
            usedFrames,
            freeFrames: TOTAL_FRAMES - usedFrames,
            pageFaults: this.pageFaults,
            pageHits: this.pageHits,
        };
    }

    setPolicy(policy: PageReplacementPolicy): void {
        this.policy = policy;
    }

    getPolicy(): PageReplacementPolicy {
        return this.policy;
    }

    reset(): void {
        this.frames = this.createEmptyFrames();
        this.pageTables.clear();
        this.processColors.clear();
        this.frameLoadedAt.clear();
        this.frameLastAccessedAt.clear();
        this.policy = "FIFO";
        this.pageFaults = 0;
        this.pageHits = 0;
        this.clock = 0;
        this.clockHand = 0;
    }

    // -------------------------------------------------------------------------
    // Pure simulation — used for experiments + tests.
    // Operates on its own state so it doesn't disturb the live frames.
    // -------------------------------------------------------------------------

    static simulateReferenceString(
        references: number[],
        frameCount: number,
        policy: PageReplacementPolicy,
    ): {
        events: PageReferenceEvent[];
        pageFaults: number;
        pageHits: number;
        finalFrames: (number | null)[];
    } {
        const frames: (number | null)[] = Array(frameCount).fill(null);
        const loadedAt: number[] = Array(frameCount).fill(-1);
        const lastUsed: number[] = Array(frameCount).fill(-1);
        const refBit: boolean[] = Array(frameCount).fill(false);
        let clockHand = 0;
        let pageFaults = 0;
        let pageHits = 0;
        const events: PageReferenceEvent[] = [];

        for (let step = 0; step < references.length; step++) {
            const page = references[step];
            const hitFrame = frames.indexOf(page);

            if (hitFrame !== -1) {
                lastUsed[hitFrame] = step;
                refBit[hitFrame] = true;
                pageHits += 1;
                events.push({
                    step,
                    pid: 0,
                    pageNumber: page,
                    fault: false,
                });
                continue;
            }

            pageFaults += 1;
            const freeIdx = frames.indexOf(null);
            let victim: number;
            let evictedPage: number | undefined;

            if (freeIdx !== -1) {
                victim = freeIdx;
            } else {
                victim = MemoryManager.pickVictim(
                    frames,
                    loadedAt,
                    lastUsed,
                    refBit,
                    clockHand,
                    references,
                    step,
                    policy,
                );
                if (policy === "CLOCK") {
                    clockHand = (victim + 1) % frameCount;
                }
                evictedPage = frames[victim] ?? undefined;
            }

            frames[victim] = page;
            loadedAt[victim] = step;
            lastUsed[victim] = step;
            refBit[victim] = true;

            events.push({
                step,
                pid: 0,
                pageNumber: page,
                fault: true,
                evictedFrameId: evictedPage !== undefined ? victim : undefined,
                evictedPid: evictedPage !== undefined ? 0 : undefined,
                evictedPage,
            });
        }

        return { events, pageFaults, pageHits, finalFrames: frames };
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    private createEmptyFrames(): MemoryFrame[] {
        return Array.from({ length: TOTAL_FRAMES }, (_, frameId) => ({
            frameId,
            pid: null,
            pageNumber: null,
            color: null,
            referenceBit: false,
        }));
    }

    private ensurePageTable(pid: number): Map<number, PageTableEntry> {
        let table = this.pageTables.get(pid);
        if (!table) {
            table = new Map();
            this.pageTables.set(pid, table);
        }
        return table;
    }

    private allocateFrame(
        pid: number,
        pageNumber: number,
        color: string,
    ): number {
        const free = this.frames.find((f) => f.pid === null);
        const frameId = free ? free.frameId : this.evictFrame();

        const frame = this.frames[frameId];
        frame.pid = pid;
        frame.pageNumber = pageNumber;
        frame.color = color;
        frame.referenceBit = true;

        const now = this.nextTime();
        this.frameLoadedAt.set(frameId, now);
        this.frameLastAccessedAt.set(frameId, now);

        return frameId;
    }

    private evictFrame(): number {
        const occupied = this.frames.filter((f) => f.pid !== null);
        if (occupied.length === 0) return 0;

        let victimFrameId: number;

        if (this.policy === "CLOCK") {
            victimFrameId = this.evictClock();
        } else {
            // FIFO / LRU / OPTIMAL (live → fallback to LRU for live calls)
            const policy =
                this.policy === "OPTIMAL" ? "LRU" : this.policy;

            let victim = occupied[0];
            for (const frame of occupied.slice(1)) {
                if (this.shouldReplace(frame.frameId, victim.frameId, policy)) {
                    victim = frame;
                }
            }
            victimFrameId = victim.frameId;
        }

        const v = this.frames[victimFrameId];
        if (v.pid !== null && v.pageNumber !== null) {
            const table = this.pageTables.get(v.pid);
            const entry = table?.get(v.pageNumber);
            if (entry) {
                entry.valid = false;
                entry.frameId = null;
            }
        }

        return victimFrameId;
    }

    private evictClock(): number {
        const n = this.frames.length;
        for (let i = 0; i < n * 2; i++) {
            const idx = (this.clockHand + i) % n;
            const f = this.frames[idx];
            if (f.pid === null) continue;
            if (f.referenceBit) {
                f.referenceBit = false;
            } else {
                this.clockHand = (idx + 1) % n;
                return idx;
            }
        }
        // Fallback (shouldn't happen): pick the hand
        const fallback = this.clockHand;
        this.clockHand = (fallback + 1) % n;
        return fallback;
    }

    private shouldReplace(
        candidateFrameId: number,
        currentVictimFrameId: number,
        policy: "FIFO" | "LRU",
    ): boolean {
        if (policy === "LRU") {
            const cand = this.frameLastAccessedAt.get(candidateFrameId) ?? 0;
            const vict = this.frameLastAccessedAt.get(currentVictimFrameId) ?? 0;
            return cand < vict;
        }
        const cand = this.frameLoadedAt.get(candidateFrameId) ?? 0;
        const vict = this.frameLoadedAt.get(currentVictimFrameId) ?? 0;
        return cand < vict;
    }

    private clearFrame(frameId: number): void {
        const frame = this.frames[frameId];
        frame.pid = null;
        frame.pageNumber = null;
        frame.color = null;
        frame.referenceBit = false;
        this.frameLoadedAt.delete(frameId);
        this.frameLastAccessedAt.delete(frameId);
    }

    private touchFrame(frameId: number): void {
        this.frameLastAccessedAt.set(frameId, this.nextTime());
        const f = this.frames[frameId];
        if (f) f.referenceBit = true;
    }

    private nextTime(): number {
        this.clock += 1;
        return this.clock;
    }

    // -------------------------------------------------------------------------
    // Static victim picker for pure simulator
    // -------------------------------------------------------------------------

    private static pickVictim(
        frames: (number | null)[],
        loadedAt: number[],
        lastUsed: number[],
        refBit: boolean[],
        clockHand: number,
        references: number[],
        step: number,
        policy: PageReplacementPolicy,
    ): number {
        const n = frames.length;

        if (policy === "FIFO") {
            let victim = 0;
            for (let i = 1; i < n; i++) {
                if (loadedAt[i] < loadedAt[victim]) victim = i;
            }
            return victim;
        }

        if (policy === "LRU") {
            let victim = 0;
            for (let i = 1; i < n; i++) {
                if (lastUsed[i] < lastUsed[victim]) victim = i;
            }
            return victim;
        }

        if (policy === "OPTIMAL") {
            let victim = 0;
            let victimDist = -1;
            for (let i = 0; i < n; i++) {
                const page = frames[i];
                if (page === null) return i;
                let nextUse = Infinity;
                for (let j = step + 1; j < references.length; j++) {
                    if (references[j] === page) {
                        nextUse = j;
                        break;
                    }
                }
                if (nextUse > victimDist) {
                    victim = i;
                    victimDist = nextUse;
                }
            }
            return victim;
        }

        // CLOCK
        for (let i = 0; i < n * 2; i++) {
            const idx = (clockHand + i) % n;
            if (refBit[idx]) {
                refBit[idx] = false;
            } else {
                return idx;
            }
        }
        return clockHand;
    }
}
