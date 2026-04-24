import type {
    MemoryFrame,
    MemoryStats,
    PageReplacementPolicy,
    PageTableEntry,
} from "../types";

const TOTAL_FRAMES = 32;

export class MemoryManager {
    private frames: MemoryFrame[] = [];
    private pageTables: Map<number, Map<number, PageTableEntry>> = new Map();
    private processColors: Map<number, string> = new Map();
    private frameLoadedAt: Map<number, number> = new Map();
    private frameLastAccessedAt: Map<number, number> = new Map();
    private policy: PageReplacementPolicy = "FIFO";
    private pageFaults = 0;
    private clock = 0;

    constructor() {
        this.frames = this.createEmptyFrames();
    }

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
            return false;
        }

        this.pageFaults++;
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
        };
    }

    setPolicy(policy: PageReplacementPolicy): void {
        this.policy = policy;
    }

    reset(): void {
        this.frames = this.createEmptyFrames();
        this.pageTables.clear();
        this.processColors.clear();
        this.frameLoadedAt.clear();
        this.frameLastAccessedAt.clear();
        this.policy = "FIFO";
        this.pageFaults = 0;
        this.clock = 0;
    }

    private createEmptyFrames(): MemoryFrame[] {
        return Array.from({ length: TOTAL_FRAMES }, (_, frameId) => ({
            frameId,
            pid: null,
            pageNumber: null,
            color: null,
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

    private allocateFrame(pid: number, pageNumber: number, color: string): number {
        const free = this.frames.find((f) => f.pid === null);
        const frameId = free ? free.frameId : this.evictFrame();

        const frame = this.frames[frameId];
        frame.pid = pid;
        frame.pageNumber = pageNumber;
        frame.color = color;

        const now = this.nextTime();
        this.frameLoadedAt.set(frameId, now);
        this.frameLastAccessedAt.set(frameId, now);

        return frameId;
    }

    private evictFrame(): number {
        const occupied = this.frames.filter((f) => f.pid !== null);
        if (occupied.length === 0) return 0;

        let victim = occupied[0];
        for (const frame of occupied.slice(1)) {
            if (this.shouldReplace(frame.frameId, victim.frameId)) {
                victim = frame;
            }
        }

        const victimPid = victim.pid;
        const victimPage = victim.pageNumber;
        if (victimPid !== null && victimPage !== null) {
            const table = this.pageTables.get(victimPid);
            const entry = table?.get(victimPage);
            if (entry) {
                entry.valid = false;
                entry.frameId = null;
            }
        }

        return victim.frameId;
    }

    private shouldReplace(candidateFrameId: number, currentVictimFrameId: number): boolean {
        if (this.policy === "LRU") {
            const candidateAccess = this.frameLastAccessedAt.get(candidateFrameId) ?? 0;
            const victimAccess = this.frameLastAccessedAt.get(currentVictimFrameId) ?? 0;
            return candidateAccess < victimAccess;
        }

        const candidateLoaded = this.frameLoadedAt.get(candidateFrameId) ?? 0;
        const victimLoaded = this.frameLoadedAt.get(currentVictimFrameId) ?? 0;
        return candidateLoaded < victimLoaded;
    }

    private clearFrame(frameId: number): void {
        const frame = this.frames[frameId];
        frame.pid = null;
        frame.pageNumber = null;
        frame.color = null;
        this.frameLoadedAt.delete(frameId);
        this.frameLastAccessedAt.delete(frameId);
    }

    private touchFrame(frameId: number): void {
        this.frameLastAccessedAt.set(frameId, this.nextTime());
    }

    private nextTime(): number {
        this.clock += 1;
        return this.clock;
    }
}
