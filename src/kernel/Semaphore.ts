export class Mutex {
    private locked = false;
    private owner: number | null = null;
    private waitingQueue: number[] = [];

    acquire(pid: number): boolean {
        if (!this.locked) {
            this.locked = true;
            this.owner = pid;
            return true;
        }

        if (this.owner === pid) return true;

        if (!this.waitingQueue.includes(pid)) {
            this.waitingQueue.push(pid);
        }
        return false;
    }

    release(pid: number): number | null {
        if (!this.locked || this.owner !== pid) return null;

        if (this.waitingQueue.length === 0) {
            this.locked = false;
            this.owner = null;
            return null;
        }

        const nextPid = this.waitingQueue.shift() ?? null;
        this.locked = nextPid !== null;
        this.owner = nextPid;
        return nextPid;
    }

    getState(): { locked: boolean; owner: number | null; waitingQueue: number[] } {
        return {
            locked: this.locked,
            owner: this.owner,
            waitingQueue: [...this.waitingQueue],
        };
    }

    reset(): void {
        this.locked = false;
        this.owner = null;
        this.waitingQueue = [];
    }
}

export class Semaphore {
    private value: number;
    private readonly initialValue: number;
    private waitingQueue: number[] = [];

    constructor(initialValue: number, name: string) {
        this.initialValue = initialValue;
        this.value = initialValue;
        void name;
    }

    wait(pid: number): void {
        this.value -= 1;
        if (this.value < 0) {
            this.waitingQueue.push(pid);
        }
    }

    signal(): void {
        this.value += 1;
        if (this.value <= 0 && this.waitingQueue.length > 0) {
            this.waitingQueue.shift();
        }
    }

    getValue(): number {
        return this.value;
    }

    getWaitingQueue(): number[] {
        return [...this.waitingQueue];
    }

    reset(): void {
        this.value = this.initialValue;
        this.waitingQueue = [];
    }
}
