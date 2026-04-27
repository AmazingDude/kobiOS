import type { PCB, ProcessState, WorkloadType } from "../types";

const PROCESS_COLORS = [
    "#6366f1",
    "#ec4899",
    "#14b8a6",
    "#f59e0b",
    "#84cc16",
    "#3b82f6",
    "#f97316",
    "#a855f7",
];

let pidCounter = 1;

export interface CreateProcessOptions {
    priority?: number;
    arrivalTime?: number;
    isProtected?: boolean;
    workloadType?: WorkloadType;
    ioBurstTime?: number;
    ioCount?: number;
    threadCount?: number;
}

export class ProcessManager {
    private processes: Map<number, PCB> = new Map();

    createProcess(
        name: string,
        burstTime: number,
        opts: CreateProcessOptions = {},
    ): PCB {
        const pid = pidCounter++;
        const priority = opts.priority ?? 1;
        const pcb: PCB = {
            pid,
            name,
            state: "new",
            isProtected: opts.isProtected ?? false,
            priority,
            basePriority: priority,
            burstTime,
            remainingTime: burstTime,
            arrivalTime: opts.arrivalTime ?? 0,
            waitingTime: 0,
            turnaroundTime: 0,
            responseTime: 0,
            color: PROCESS_COLORS[(pid - 1) % PROCESS_COLORS.length],
            workloadType: opts.workloadType ?? "cpu",
            ioBurstTime: Math.max(0, opts.ioBurstTime ?? 0),
            ioCount: Math.max(0, opts.ioCount ?? 0),
            threadCount: Math.max(1, opts.threadCount ?? 1),
        };
        this.processes.set(pid, pcb);
        return pcb;
    }

    getProcess(pid: number): PCB | undefined {
        return this.processes.get(pid);
    }

    getAllProcesses(): PCB[] {
        return Array.from(this.processes.values());
    }

    updateState(pid: number, state: ProcessState): void {
        const pcb = this.processes.get(pid);
        if (pcb) pcb.state = state;
    }

    killProcess(pid: number): void {
        const pcb = this.processes.get(pid);
        if (!pcb) return;
        if (pcb.isProtected) return;
        pcb.state = "terminated";
    }

    isProtected(pid: number): boolean {
        return this.processes.get(pid)?.isProtected ?? false;
    }

    reset(): void {
        this.processes.clear();
        pidCounter = 1;
    }
}
