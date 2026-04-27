import { describe, it, expect } from "vitest";
import { runExperiments, WORKLOADS } from "../ExperimentRunner";

describe("ExperimentRunner", () => {
    it("produces a row for every (workload, algorithm) combination", () => {
        const result = runExperiments(2);
        expect(result.rows.length).toBe(WORKLOADS.length * 4);
    });

    it("metrics are non-negative and totals are positive", () => {
        const result = runExperiments(2);
        for (const row of result.rows) {
            const m = row.metrics;
            expect(m.totalTime).toBeGreaterThan(0);
            expect(m.averageWaitingTime).toBeGreaterThanOrEqual(0);
            expect(m.averageTurnaroundTime).toBeGreaterThan(0);
            expect(m.averageResponseTime).toBeGreaterThanOrEqual(0);
            expect(m.cpuUtilization).toBeGreaterThan(0);
            expect(m.cpuUtilization).toBeLessThanOrEqual(100);
            expect(m.throughput).toBeGreaterThan(0);
        }
    });

    it("on the CPU-bound workload, SRJF beats FCFS on avg wait", () => {
        const result = runExperiments(2);
        const fcfs = result.rows.find(
            (r) => r.workloadId === "cpu-bound" && r.algorithm === "FCFS",
        );
        const srjf = result.rows.find(
            (r) => r.workloadId === "cpu-bound" && r.algorithm === "SRJF",
        );
        expect(fcfs).toBeDefined();
        expect(srjf).toBeDefined();
        expect(srjf!.metrics.averageWaitingTime).toBeLessThanOrEqual(
            fcfs!.metrics.averageWaitingTime,
        );
    });
});
