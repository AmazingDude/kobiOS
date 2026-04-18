import type { PCB, ProcessState } from "../types";

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

export class ProcessManager {
    private processes: Map<number, PCB> = new Map();

    createProcess(
        name: string,
        burstTime: number,
        priority: number = 1,
        arrivalTime: number = 0,
    ): PCB {
        const pid = pidCounter++;
        const pcb: PCB = {
            pid,
            name,
            state: "new",
            priority,
            burstTime,
            remainingTime: burstTime,
            arrivalTime,
            waitingTime: 0,
            turnaroundTime: 0,
            color: PROCESS_COLORS[(pid - 1) % PROCESS_COLORS.length],
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
        if (pcb) pcb.state = "terminated";
    }

    reset(): void {
        this.processes.clear();
        pidCounter = 1;
    }
}
