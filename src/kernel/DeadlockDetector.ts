import type {
    DeadlockResult,
    RAGAllocation,
    RAGRequest,
    RAGState,
} from "../types";

/**
 * DeadlockDetector — Resource Allocation Graph (RAG) with cycle detection.
 *
 * Edges:
 *   - Allocation:  resource -> process     (resource is held by process)
 *   - Request:     process -> resource     (process is waiting for resource)
 *
 * For single-instance resources, a cycle in the graph implies deadlock
 * (Operating System Concepts §8.6 / Silberschatz). Victim selection here is
 * the lowest-PID process in the cycle (deterministic, easy to explain).
 */
export class DeadlockDetector {
    private resources: Set<string> = new Set();
    private processes: Set<number> = new Set();
    private allocations: RAGAllocation[] = [];
    private requests: RAGRequest[] = [];

    addResource(id: string): void {
        this.resources.add(id);
    }

    addProcess(pid: number): void {
        this.processes.add(pid);
    }

    /** Process `pid` now holds resource `resourceId`. */
    allocate(pid: number, resourceId: string): void {
        this.processes.add(pid);
        this.resources.add(resourceId);
        this.allocations.push({ pid, resourceId });
    }

    /** Process `pid` is waiting for resource `resourceId`. */
    request(pid: number, resourceId: string): void {
        this.processes.add(pid);
        this.resources.add(resourceId);
        this.requests.push({ pid, resourceId });
    }

    release(pid: number, resourceId: string): void {
        this.allocations = this.allocations.filter(
            (a) => !(a.pid === pid && a.resourceId === resourceId),
        );
        this.requests = this.requests.filter(
            (r) => !(r.pid === pid && r.resourceId === resourceId),
        );
    }

    removeProcess(pid: number): void {
        this.processes.delete(pid);
        this.allocations = this.allocations.filter((a) => a.pid !== pid);
        this.requests = this.requests.filter((r) => r.pid !== pid);
    }

    getState(): RAGState {
        return {
            resources: Array.from(this.resources).sort(),
            processes: Array.from(this.processes).sort((a, b) => a - b),
            allocations: this.allocations.map((a) => ({ ...a })),
            requests: this.requests.map((r) => ({ ...r })),
        };
    }

    reset(): void {
        this.resources.clear();
        this.processes.clear();
        this.allocations = [];
        this.requests = [];
    }

    /**
     * Detect deadlock by reducing the RAG to the wait-for graph
     * (process -> process: P_i waits for P_j if P_i is requesting a resource
     * that P_j currently holds) and looking for a directed cycle.
     */
    detect(): DeadlockResult {
        const waitFor = new Map<number, Set<number>>();
        for (const r of this.requests) {
            const holders = this.allocations
                .filter((a) => a.resourceId === r.resourceId)
                .map((a) => a.pid);
            for (const holder of holders) {
                if (holder === r.pid) continue;
                if (!waitFor.has(r.pid)) waitFor.set(r.pid, new Set());
                waitFor.get(r.pid)!.add(holder);
            }
        }

        const cycle = this.findCycle(waitFor);
        if (cycle.length === 0) {
            return {
                deadlocked: false,
                cycle: [],
                cycleResources: [],
                victimPid: null,
                explanation: "No cycle in wait-for graph — no deadlock.",
            };
        }

        const victim = Math.min(...cycle);
        const cycleResources = this.resourcesInCycle(cycle);

        const cycleStr = cycle.map((p) => `P${p}`).join(" -> ");
        const explanation =
            `Cycle detected in wait-for graph: ${cycleStr} -> P${cycle[0]}. ` +
            `Resources involved: ${cycleResources.join(", ") || "n/a"}. ` +
            `Selected victim: P${victim} (lowest PID).`;

        return {
            deadlocked: true,
            cycle,
            cycleResources,
            victimPid: victim,
            explanation,
        };
    }

    private findCycle(graph: Map<number, Set<number>>): number[] {
        const WHITE = 0;
        const GRAY = 1;
        const BLACK = 2;
        const color = new Map<number, number>();
        for (const p of this.processes) color.set(p, WHITE);

        const parent = new Map<number, number | null>();
        let cycleStart: number | null = null;
        let cycleEnd: number | null = null;

        const dfs = (u: number): boolean => {
            color.set(u, GRAY);
            const neighbors = graph.get(u) ?? new Set<number>();
            for (const v of neighbors) {
                if (color.get(v) === WHITE) {
                    parent.set(v, u);
                    if (dfs(v)) return true;
                } else if (color.get(v) === GRAY) {
                    cycleStart = v;
                    cycleEnd = u;
                    return true;
                }
            }
            color.set(u, BLACK);
            return false;
        };

        for (const p of this.processes) {
            parent.set(p, null);
            if (color.get(p) === WHITE && dfs(p)) break;
        }

        if (cycleStart === null || cycleEnd === null) return [];

        const cycle: number[] = [];
        let cur: number | null = cycleEnd;
        while (cur !== null && cur !== cycleStart) {
            cycle.push(cur);
            cur = parent.get(cur) ?? null;
        }
        if (cycleStart !== null) cycle.push(cycleStart);
        cycle.reverse();
        return cycle;
    }

    private resourcesInCycle(cycle: number[]): string[] {
        const inCycle = new Set(cycle);
        const result = new Set<string>();
        for (const r of this.requests) {
            if (!inCycle.has(r.pid)) continue;
            const holders = this.allocations.filter(
                (a) => a.resourceId === r.resourceId && inCycle.has(a.pid),
            );
            if (holders.length > 0) result.add(r.resourceId);
        }
        return Array.from(result).sort();
    }
}
