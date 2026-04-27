import { useMemo, useState } from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { useKernelStore } from "../../store/kernelStore";
import { WORKLOADS } from "../../kernel/ExperimentRunner";
import { MemoryManager } from "../../kernel/MemoryManager";
import type {
    ExperimentResult,
    ExperimentRow,
    PageReplacementPolicy,
    SchedulerAlgorithm,
} from "../../types";

const ALGORITHMS: SchedulerAlgorithm[] = [
    "FCFS",
    "RR",
    "PRIORITY_RR",
    "SRJF",
];

const ALGO_COLOR: Record<SchedulerAlgorithm, string> = {
    FCFS: "#6366f1",
    RR: "#14b8a6",
    PRIORITY_RR: "#f59e0b",
    SRJF: "#ec4899",
};

const POLICY_COLOR: Record<PageReplacementPolicy, string> = {
    FIFO: "#6366f1",
    LRU: "#14b8a6",
    OPTIMAL: "#f59e0b",
    CLOCK: "#ec4899",
};

const PAGE_REPLACEMENT_POLICIES: PageReplacementPolicy[] = [
    "FIFO",
    "LRU",
    "OPTIMAL",
    "CLOCK",
];

type Metric =
    | "averageWaitingTime"
    | "averageTurnaroundTime"
    | "averageResponseTime"
    | "cpuUtilization"
    | "throughput";

const METRIC_LABEL: Record<Metric, string> = {
    averageWaitingTime: "Avg Waiting Time",
    averageTurnaroundTime: "Avg Turnaround Time",
    averageResponseTime: "Avg Response Time",
    cpuUtilization: "CPU Utilization (%)",
    throughput: "Throughput (proc/tick)",
};

const REFERENCE_STRINGS = [
    {
        id: "belady",
        label: "Belady (1,2,3,4,1,2,5,1,2,3,4,5)",
        refs: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
        frames: 3,
    },
    {
        id: "stallings",
        label: "Stallings 8.21",
        refs: [
            7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1,
        ],
        frames: 3,
    },
    {
        id: "loop",
        label: "Tight loop (1..6 ×3)",
        refs: [
            1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6,
        ],
        frames: 4,
    },
];

function metricFmt(v: number, m: Metric): string {
    if (m === "throughput") return v.toFixed(3);
    if (m === "cpuUtilization") return v.toFixed(1);
    return v.toFixed(2);
}

function findRow(
    rows: ExperimentRow[],
    workloadId: string,
    algo: SchedulerAlgorithm,
): ExperimentRow | undefined {
    return rows.find((r) => r.workloadId === workloadId && r.algorithm === algo);
}

function bestAlgoFor(
    rows: ExperimentRow[],
    workloadId: string,
    metric: Metric,
): SchedulerAlgorithm | null {
    const subset = rows.filter((r) => r.workloadId === workloadId);
    if (subset.length === 0) return null;
    const minimize =
        metric === "averageWaitingTime" ||
        metric === "averageTurnaroundTime" ||
        metric === "averageResponseTime";
    let best = subset[0];
    for (const r of subset.slice(1)) {
        const a = r.metrics[metric];
        const b = best.metrics[metric];
        if ((minimize && a < b) || (!minimize && a > b)) best = r;
    }
    return best.algorithm;
}

function ResultsTable({
    result,
    metric,
}: {
    result: ExperimentResult;
    metric: Metric;
}) {
    return (
        <div style={{ overflow: "auto", padding: "8px 12px" }}>
            <div
                style={{
                    fontSize: 9,
                    color: "var(--color-muted)",
                    letterSpacing: "0.1em",
                    marginBottom: 6,
                }}
            >
                COMPARISON TABLE — {METRIC_LABEL[metric].toUpperCase()}
            </div>
            <table className="kobi-table">
                <thead>
                    <tr>
                        <th>Workload</th>
                        {ALGORITHMS.map((a) => (
                            <th key={a} style={{ color: ALGO_COLOR[a] }}>
                                {a}
                            </th>
                        ))}
                        <th>Best</th>
                    </tr>
                </thead>
                <tbody>
                    {WORKLOADS.map((wl) => {
                        const best = bestAlgoFor(result.rows, wl.id, metric);
                        return (
                            <tr key={wl.id}>
                                <td style={{ fontWeight: 600 }}>
                                    {wl.label}
                                </td>
                                {ALGORITHMS.map((a) => {
                                    const row = findRow(
                                        result.rows,
                                        wl.id,
                                        a,
                                    );
                                    const v = row?.metrics[metric] ?? 0;
                                    return (
                                        <td
                                            key={a}
                                            style={{
                                                color:
                                                    a === best
                                                        ? "var(--color-accent)"
                                                        : "var(--color-foreground)",
                                                fontWeight:
                                                    a === best ? 600 : 400,
                                            }}
                                        >
                                            {metricFmt(v, metric)}
                                        </td>
                                    );
                                })}
                                <td
                                    style={{
                                        color: "var(--color-accent)",
                                        fontWeight: 600,
                                    }}
                                >
                                    {best ?? "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function ComparisonChart({
    result,
    metric,
}: {
    result: ExperimentResult;
    metric: Metric;
}) {
    const data = useMemo(() => {
        return WORKLOADS.map((wl) => {
            const obj: Record<string, number | string> = { workload: wl.label };
            for (const a of ALGORITHMS) {
                const r = findRow(result.rows, wl.id, a);
                obj[a] = r ? r.metrics[metric] : 0;
            }
            return obj;
        });
    }, [result, metric]);

    return (
        <div style={{ padding: "0 12px 12px", height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{ top: 10, right: 16, left: -8, bottom: 4 }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(138,122,106,0.15)"
                    />
                    <XAxis
                        dataKey="workload"
                        tick={{ fontSize: 10, fill: "#a89984" }}
                        stroke="rgba(138,122,106,0.4)"
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: "#a89984" }}
                        stroke="rgba(138,122,106,0.4)"
                    />
                    <Tooltip
                        contentStyle={{
                            background: "rgba(16,12,10,0.95)",
                            border: "1px solid rgba(61,53,48,0.6)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "#ebdbb2",
                        }}
                        formatter={(value) =>
                            metricFmt(Number(value), metric)
                        }
                    />
                    <Legend
                        wrapperStyle={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                        }}
                    />
                    {ALGORITHMS.map((a) => (
                        <Bar key={a} dataKey={a} fill={ALGO_COLOR[a]} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function PageReplacementChart() {
    const data = useMemo(() => {
        return REFERENCE_STRINGS.map((ref) => {
            const obj: Record<string, number | string> = {
                workload: ref.label,
            };
            for (const policy of PAGE_REPLACEMENT_POLICIES) {
                const sim = MemoryManager.simulateReferenceString(
                    ref.refs,
                    ref.frames,
                    policy,
                );
                obj[policy] = sim.pageFaults;
            }
            return obj;
        });
    }, []);

    return (
        <div style={{ padding: "0 12px 12px" }}>
            <div
                style={{
                    fontSize: 9,
                    color: "var(--color-muted)",
                    letterSpacing: "0.1em",
                    marginBottom: 6,
                }}
            >
                PAGE REPLACEMENT — FAULTS BY POLICY (lower is better)
            </div>
            <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 10, right: 16, left: -8, bottom: 4 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(138,122,106,0.15)"
                        />
                        <XAxis
                            dataKey="workload"
                            tick={{ fontSize: 10, fill: "#a89984" }}
                            stroke="rgba(138,122,106,0.4)"
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: "#a89984" }}
                            stroke="rgba(138,122,106,0.4)"
                        />
                        <Tooltip
                            contentStyle={{
                                background: "rgba(16,12,10,0.95)",
                                border: "1px solid rgba(61,53,48,0.6)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                color: "#ebdbb2",
                            }}
                        />
                        <Legend
                            wrapperStyle={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                            }}
                        />
                        {PAGE_REPLACEMENT_POLICIES.map((p) => (
                            <Bar
                                key={p}
                                dataKey={p}
                                fill={POLICY_COLOR[p]}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function ExperimentsWindow() {
    const latest = useKernelStore((s) => s.latestExperiment);
    const runExperimentSuite = useKernelStore((s) => s.runExperimentSuite);
    const [quantum, setQuantum] = useState(2);
    const [metric, setMetric] = useState<Metric>("averageWaitingTime");
    const [running, setRunning] = useState(false);

    const handleRun = () => {
        setRunning(true);
        setTimeout(() => {
            runExperimentSuite(quantum);
            setRunning(false);
        }, 80);
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--color-panel-border)",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    background: "rgba(16,12,10,0.4)",
                    flexShrink: 0,
                }}
            >
                <span
                    style={{
                        color: "var(--color-muted)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                    }}
                >
                    METRIC:
                </span>
                <select
                    className="kobi-select"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                >
                    {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                        <option key={m} value={m}>
                            {METRIC_LABEL[m]}
                        </option>
                    ))}
                </select>

                <span
                    style={{
                        color: "var(--color-muted)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                    }}
                >
                    QUANTUM:
                </span>
                <input
                    className="kobi-input"
                    type="number"
                    min={1}
                    max={20}
                    value={quantum}
                    onChange={(e) =>
                        setQuantum(
                            Math.max(1, parseInt(e.target.value) || 1),
                        )
                    }
                    style={{ width: 56 }}
                />

                <button
                    className="kobi-btn"
                    onClick={handleRun}
                    disabled={running}
                    style={{
                        background: running
                            ? "rgba(200,146,42,0.06)"
                            : "rgba(200,146,42,0.18)",
                        borderColor: "var(--color-accent)",
                    }}
                >
                    {running ? "Running..." : "▶ Run All Experiments"}
                </button>

                <div style={{ flex: 1 }} />

                {latest && (
                    <span
                        style={{ fontSize: 9, color: "var(--color-muted)" }}
                    >
                        last run:{" "}
                        <span style={{ color: "var(--color-accent)" }}>
                            {new Date(latest.ranAt).toLocaleTimeString()}
                        </span>
                        {" "}| {latest.rows.length} rows
                    </span>
                )}
            </div>

            <div style={{ flex: 1, overflow: "auto" }}>
                {!latest ? (
                    <EmptyState />
                ) : (
                    <>
                        <div
                            style={{
                                padding: "8px 12px",
                                fontSize: 10,
                                color: "var(--color-muted)",
                                background: "rgba(12,10,8,0.3)",
                                borderBottom: "1px solid rgba(61,53,48,0.4)",
                            }}
                        >
                            Each row is one of {WORKLOADS.length} workloads, run
                            against {ALGORITHMS.length} CPU scheduling
                            algorithms with quantum =&nbsp;
                            <span style={{ color: "var(--color-accent)" }}>
                                {quantum}
                            </span>
                            . Bold / accented entries are the winning algorithm
                            for that workload + metric. Lower is better for
                            waiting / turnaround / response times; higher is
                            better for utilization and throughput.
                        </div>

                        <ComparisonChart result={latest} metric={metric} />
                        <ResultsTable result={latest} metric={metric} />

                        <div
                            style={{
                                padding: "10px 12px 4px",
                                fontSize: 10,
                                color: "var(--color-muted)",
                                background: "rgba(12,10,8,0.3)",
                                borderTop: "1px solid rgba(61,53,48,0.4)",
                            }}
                        >
                            Page-replacement comparison runs the static
                            reference strings through FIFO / LRU / OPTIMAL /
                            CLOCK with a fixed frame count.
                        </div>
                        <PageReplacementChart />

                        <WorkloadDescriptions />
                    </>
                )}
            </div>

            <div
                style={{
                    padding: "5px 12px",
                    borderTop: "1px solid var(--color-panel-border)",
                    fontSize: 9,
                    color: "var(--color-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    flexShrink: 0,
                    background: "rgba(16,12,10,0.4)",
                }}
            >
                <span>
                    {latest
                        ? `${latest.rows.length} rows`
                        : "no experiments run yet"}
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>
                    Experiments
                </span>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 40,
                color: "var(--color-muted)",
                fontSize: 11,
                flexDirection: "column",
                gap: 10,
                textAlign: "center",
            }}
        >
            <div style={{ fontSize: 28 }}>∑</div>
            <div style={{ maxWidth: 380, lineHeight: 1.6 }}>
                Press <strong>Run All Experiments</strong> to evaluate every
                CPU-scheduling algorithm against the CPU-bound, I/O-bound, and
                Mixed workloads. Comparison tables and bar charts will appear
                here.
            </div>
        </div>
    );
}

function WorkloadDescriptions() {
    return (
        <div style={{ padding: "0 12px 14px" }}>
            <div
                style={{
                    fontSize: 9,
                    color: "var(--color-muted)",
                    letterSpacing: "0.1em",
                    marginBottom: 6,
                    paddingTop: 8,
                    borderTop: "1px solid rgba(61,53,48,0.4)",
                }}
            >
                WORKLOAD DEFINITIONS
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 8,
                }}
            >
                {WORKLOADS.map((wl) => (
                    <div
                        key={wl.id}
                        style={{
                            border: "1px solid rgba(61,53,48,0.5)",
                            background: "rgba(26,22,20,0.45)",
                            borderRadius: 3,
                            padding: 8,
                        }}
                    >
                        <div
                            style={{
                                color: "var(--color-accent)",
                                fontSize: 10,
                                marginBottom: 4,
                                letterSpacing: "0.08em",
                            }}
                        >
                            {wl.label}
                        </div>
                        <div
                            style={{
                                fontSize: 9,
                                color: "var(--color-muted)",
                                marginBottom: 6,
                                lineHeight: 1.5,
                            }}
                        >
                            {wl.description}
                        </div>
                        <table
                            className="kobi-table"
                            style={{ fontSize: 9, marginTop: 4 }}
                        >
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Burst</th>
                                    <th>I/O</th>
                                    <th>Pri</th>
                                </tr>
                            </thead>
                            <tbody>
                                {wl.processes.map((p) => (
                                    <tr key={p.name}>
                                        <td>{p.name}</td>
                                        <td>{p.burstTime}</td>
                                        <td>
                                            {p.ioCount > 0
                                                ? `${p.ioCount}x${p.ioBurstTime}`
                                                : "—"}
                                        </td>
                                        <td>{p.priority}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );
}
