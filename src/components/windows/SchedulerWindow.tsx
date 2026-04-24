import { useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { SchedulerAlgorithm, GanttEntry } from "../../types";

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="metric-card" style={{ flex: 1, minWidth: 100 }}>
            <div className="metric-label">{label}</div>
            <div className="metric-value" style={{ fontSize: 15 }}>
                {value}
            </div>
        </div>
    );
}

function GanttChart({ entries }: { entries: GanttEntry[] }) {
    if (entries.length === 0) {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 120,
                    color: "var(--color-muted)",
                    fontSize: 11,
                    borderTop: "1px solid var(--color-panel-border)",
                }}
            >
                Run the scheduler to see the Gantt chart
            </div>
        );
    }

    // Group entries by PID for rows
    const pids = [...new Set(entries.map((e) => e.pid))];
    const maxTime = Math.max(...entries.map((e) => e.endTime));

    return (
        <div style={{ padding: "10px 12px", overflow: "auto" }}>
            {/* Time axis header */}
            <div
                style={{
                    display: "flex",
                    marginLeft: 100,
                    marginBottom: 4,
                    position: "relative",
                    borderBottom: "1px solid rgba(61,53,48,0.6)",
                    paddingBottom: 4,
                }}
            >
                {Array.from({ length: maxTime + 1 }, (_, t) => (
                    <div
                        key={t}
                        style={{
                            flex: 1,
                            textAlign: "left",
                            fontSize: 8,
                            color: "var(--color-muted)",
                            fontFamily: "var(--font-mono)",
                            minWidth: 20,
                        }}
                    >
                        {t % Math.max(1, Math.floor(maxTime / 12)) === 0
                            ? t
                            : ""}
                    </div>
                ))}
            </div>

            {/* Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pids.map((pid) => {
                    const pidEntries = entries.filter((e) => e.pid === pid);
                    const pName = pidEntries[0]?.name ?? `P${pid}`;
                    const color = pidEntries[0]?.color ?? "#6366f1";

                    return (
                        <div
                            key={pid}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0,
                            }}
                        >
                            {/* Label */}
                            <div
                                style={{
                                    width: 100,
                                    flexShrink: 0,
                                    fontSize: 10,
                                    fontFamily: "var(--font-mono)",
                                    color: color,
                                    paddingRight: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                <span
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: color,
                                        flexShrink: 0,
                                    }}
                                />
                                <span
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {pName} ({pid})
                                </span>
                            </div>

                            {/* Bar track */}
                            <div
                                style={{
                                    flex: 1,
                                    position: "relative",
                                    height: 20,
                                    background: "rgba(26,22,20,0.6)",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                }}
                            >
                                {pidEntries.map((entry, i) => {
                                    const left =
                                        (entry.startTime / maxTime) * 100;
                                    const width =
                                        ((entry.endTime - entry.startTime) /
                                            maxTime) *
                                        100;
                                    return (
                                        <div
                                            key={i}
                                            title={`${entry.name} | t=${entry.startTime}–${entry.endTime}`}
                                            style={{
                                                position: "absolute",
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                height: "100%",
                                                background: color,
                                                opacity: 0.85,
                                                borderRadius: 2,
                                                display: "flex",
                                                alignItems: "center",
                                                paddingLeft: 3,
                                                fontSize: 8,
                                                color: "rgba(0,0,0,0.75)",
                                                fontFamily: "var(--font-mono)",
                                                overflow: "hidden",
                                                whiteSpace: "nowrap",
                                                cursor: "default",
                                                transition: "opacity 0.15s",
                                            }}
                                        >
                                            {width > 4
                                                ? `${entry.startTime}→${entry.endTime}`
                                                : ""}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ProcessMetricsTable() {
    const processes = useKernelStore((s) => s.processes);
    const metrics = useKernelStore((s) => s.metrics);

    if (!metrics || processes.length === 0) return null;

    return (
        <div style={{ padding: "0 12px 10px" }}>
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
                PER-PROCESS METRICS
            </div>
            <table className="kobi-table">
                <thead>
                    <tr>
                        <th>PID</th>
                        <th>Name</th>
                        <th>Arrival</th>
                        <th>Burst</th>
                        <th>Waiting</th>
                        <th>Turnaround</th>
                    </tr>
                </thead>
                <tbody>
                    {processes
                        .filter(
                            (p) =>
                                p.state !== "terminated" || p.waitingTime > 0,
                        )
                        .map((p) => (
                            <tr key={p.pid}>
                                <td>
                                    <span
                                        style={{
                                            display: "inline-block",
                                            width: 7,
                                            height: 7,
                                            borderRadius: "50%",
                                            background: p.color,
                                            marginRight: 5,
                                        }}
                                    />
                                    {p.pid}
                                </td>
                                <td>{p.name}</td>
                                <td>{p.arrivalTime}</td>
                                <td>{p.burstTime}</td>
                                <td style={{ color: "#f59e0b" }}>
                                    {p.waitingTime}
                                </td>
                                <td style={{ color: "var(--color-accent)" }}>
                                    {p.turnaroundTime}
                                </td>
                            </tr>
                        ))}
                </tbody>
            </table>
        </div>
    );
}

export function SchedulerWindow() {
    const snapshot = useKernelStore((s) => s.latestSchedulerSnapshot);
    const gantt = snapshot?.gantt ?? [];
    const metrics = snapshot?.metrics ?? null;
    const schedulerConfig = useKernelStore((s) => s.schedulerConfig);
    const processes = useKernelStore((s) => s.processes);
    const runScheduler = useKernelStore((s) => s.runScheduler);
    const setSchedulerConfig = useKernelStore((s) => s.setSchedulerConfig);
    const spawnProcess = useKernelStore((s) => s.spawnProcess);
    const resetAll = useKernelStore((s) => s.resetAll);

    const [quantum, setQuantum] = useState(
        schedulerConfig.timeQuantum.toString(),
    );

    const activeProcs = processes.filter((p) => p.state !== "terminated");
    const showQuantum =
        schedulerConfig.algorithm === "RR" ||
        schedulerConfig.algorithm === "PRIORITY_RR";

    const handleAlgoChange = (algo: SchedulerAlgorithm) => {
        setSchedulerConfig({
            algorithm: algo,
            timeQuantum: schedulerConfig.timeQuantum,
        });
    };

    const handleQuantumChange = (val: string) => {
        setQuantum(val);
        const n = parseInt(val);
        if (!isNaN(n) && n >= 1) {
            setSchedulerConfig({
                algorithm: schedulerConfig.algorithm,
                timeQuantum: n,
            });
        }
    };

    const handleRun = () => {
        if (activeProcs.length === 0) return;
        runScheduler();
    };

    const loadWorkload = (preset: "cpu" | "io" | "mixed") => {
        resetAll();

        if (preset === "cpu") {
            spawnProcess("CPU-1", 20, 5, 0);
            spawnProcess("CPU-2", 18, 4, 2);
            spawnProcess("CPU-3", 22, 5, 1);
            spawnProcess("CPU-4", 15, 3, 3);
            return;
        }

        if (preset === "io") {
            spawnProcess("IO-1", 4, 2, 0);
            spawnProcess("IO-2", 3, 2, 1);
            spawnProcess("IO-3", 5, 1, 0);
            spawnProcess("IO-4", 2, 2, 2);
            spawnProcess("IO-5", 4, 1, 3);
            return;
        }

        spawnProcess("CPU-A", 16, 5, 0);
        spawnProcess("IO-A", 3, 2, 1);
        spawnProcess("CPU-B", 12, 4, 2);
        spawnProcess("IO-B", 4, 1, 0);
        spawnProcess("MIX-1", 8, 3, 3);
    };

    const ALGO_OPTIONS: { value: SchedulerAlgorithm; label: string }[] = [
        { value: "FCFS", label: "First Come First Served" },
        { value: "RR", label: "Round Robin" },
        { value: "PRIORITY_RR", label: "Priority + Round Robin" },
        { value: "SRJF", label: "Shortest Remaining Job First" },
    ];

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
            {/* Controls */}
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
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                        style={{
                            color: "var(--color-muted)",
                            fontSize: 9,
                            letterSpacing: "0.1em",
                        }}
                    >
                        ALGORITHM:
                    </span>
                    <select
                        className="kobi-select"
                        value={schedulerConfig.algorithm}
                        onChange={(e) =>
                            handleAlgoChange(
                                e.target.value as SchedulerAlgorithm,
                            )
                        }
                    >
                        {ALGO_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                {showQuantum && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
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
                            value={quantum}
                            onChange={(e) =>
                                handleQuantumChange(e.target.value)
                            }
                            style={{ width: 56 }}
                        />
                    </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                        style={{
                            color: "var(--color-muted)",
                            fontSize: 9,
                            letterSpacing: "0.1em",
                        }}
                    >
                        WORKLOAD PRESETS:
                    </span>
                    <button
                        className="kobi-btn"
                        onClick={() => loadWorkload("cpu")}
                    >
                        [ CPU-bound ]
                    </button>
                    <button
                        className="kobi-btn"
                        onClick={() => loadWorkload("io")}
                    >
                        [ I/O-bound ]
                    </button>
                    <button
                        className="kobi-btn"
                        onClick={() => loadWorkload("mixed")}
                    >
                        [ Mixed ]
                    </button>
                </div>

                <button
                    className="kobi-btn"
                    onClick={handleRun}
                    disabled={activeProcs.length === 0}
                    style={{
                        opacity: activeProcs.length === 0 ? 0.4 : 1,
                        cursor:
                            activeProcs.length === 0
                                ? "not-allowed"
                                : "pointer",
                    }}
                >
                    ▶ Run Simulation
                </button>

                <div style={{ flex: 1 }} />

                <span style={{ fontSize: 9, color: "var(--color-muted)" }}>
                    {activeProcs.length} process
                    {activeProcs.length !== 1 ? "es" : ""} queued
                </span>
            </div>

            {/* Metrics row */}
            {metrics && (
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        padding: "8px 12px",
                        borderBottom: "1px solid rgba(61,53,48,0.4)",
                        flexShrink: 0,
                        background: "rgba(12,10,8,0.3)",
                    }}
                >
                    <MetricCard
                        label="Avg Waiting"
                        value={metrics.averageWaitingTime.toFixed(2)}
                    />
                    <MetricCard
                        label="Avg Turnaround"
                        value={metrics.averageTurnaroundTime.toFixed(2)}
                    />
                    <MetricCard
                        label="CPU Utilization"
                        value={`${metrics.cpuUtilization.toFixed(1)}%`}
                    />
                    <MetricCard
                        label="Throughput"
                        value={`${metrics.throughput.toFixed(3)}/t`}
                    />
                </div>
            )}

            {/* Gantt chart + process table */}
            <div style={{ flex: 1, overflow: "auto" }}>
                <GanttChart entries={gantt} />
                <ProcessMetricsTable />
            </div>

            {/* Footer */}
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
                    Algorithm:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                        {schedulerConfig.algorithm}
                    </span>
                    {showQuantum && (
                        <span>
                            {" "}
                            | Quantum:{" "}
                            <span style={{ color: "var(--color-accent)" }}>
                                {schedulerConfig.timeQuantum}
                            </span>
                        </span>
                    )}
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>Gantt</span>
            </div>
        </div>
    );
}
