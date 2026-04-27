import { useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { ThreadState } from "../../types";

const THREAD_COLOR: Record<ThreadState, string> = {
    ready: "#f59e0b",
    running: "#14b8a6",
    waiting: "#f97316",
    terminated: "#64748b",
};

function ThreadStateBadge({ state }: { state: ThreadState }) {
    return (
        <span
            className="state-badge"
            style={{
                background: THREAD_COLOR[state] + "22",
                color: THREAD_COLOR[state],
                border: `1px solid ${THREAD_COLOR[state]}55`,
            }}
        >
            {state}
        </span>
    );
}

export function ThreadsWindow() {
    const processes = useKernelStore((s) => s.processes);
    const threads = useKernelStore((s) => s.threads);
    const spawnThread = useKernelStore((s) => s.spawnThread);
    const setThreadState = useKernelStore((s) => s.setThreadState);
    const tickThreads = useKernelStore((s) => s.tickThreads);
    const [selectedPid, setSelectedPid] = useState<number | null>(null);

    const activeProcs = processes.filter((p) => p.state !== "terminated");
    const effectivePid =
        selectedPid && activeProcs.find((p) => p.pid === selectedPid)
            ? selectedPid
            : (activeProcs[0]?.pid ?? null);

    const procThreads =
        effectivePid !== null
            ? threads.filter((t) => t.pid === effectivePid)
            : [];

    const proc = activeProcs.find((p) => p.pid === effectivePid);

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
                    PROCESS:
                </span>
                <select
                    className="kobi-select"
                    value={effectivePid ?? ""}
                    onChange={(e) =>
                        setSelectedPid(parseInt(e.target.value) || null)
                    }
                    disabled={activeProcs.length === 0}
                >
                    {activeProcs.length === 0 && (
                        <option value="">— no active processes —</option>
                    )}
                    {activeProcs.map((p) => (
                        <option key={p.pid} value={p.pid}>
                            PID {p.pid} — {p.name}
                        </option>
                    ))}
                </select>

                <button
                    className="kobi-btn"
                    disabled={effectivePid === null}
                    onClick={() => {
                        if (effectivePid !== null) spawnThread(effectivePid);
                    }}
                >
                    + spawn thread
                </button>

                <button
                    className="kobi-btn"
                    disabled={effectivePid === null || procThreads.length === 0}
                    onClick={() => {
                        if (effectivePid !== null) tickThreads(effectivePid);
                    }}
                    title="Run one CPU tick on the chosen process — picks the next ready thread, increments its program counter and registers, rotates if quantum expires."
                >
                    ▶ tick (run 1 instruction)
                </button>

                <div style={{ flex: 1 }} />

                <span style={{ fontSize: 9, color: "var(--color-muted)" }}>
                    {threads.length} TCB{threads.length === 1 ? "" : "s"} alive
                </span>
            </div>

            {proc && (
                <div
                    style={{
                        padding: "6px 12px",
                        borderBottom: "1px solid rgba(61,53,48,0.4)",
                        fontSize: 10,
                        color: "var(--color-muted)",
                        display: "flex",
                        gap: 14,
                        background: "rgba(12,10,8,0.3)",
                        flexShrink: 0,
                    }}
                >
                    <span>
                        process:{" "}
                        <span style={{ color: proc.color }}>{proc.name}</span>
                    </span>
                    <span>
                        threads:{" "}
                        <span style={{ color: "var(--color-accent)" }}>
                            {procThreads.length}
                        </span>
                    </span>
                    <span>
                        running:{" "}
                        <span style={{ color: "#14b8a6" }}>
                            {procThreads.filter((t) => t.state === "running")
                                .length}
                        </span>
                    </span>
                    <span>
                        ready:{" "}
                        <span style={{ color: "#f59e0b" }}>
                            {procThreads.filter((t) => t.state === "ready")
                                .length}
                        </span>
                    </span>
                    <span>
                        waiting:{" "}
                        <span style={{ color: "#f97316" }}>
                            {procThreads.filter((t) => t.state === "waiting")
                                .length}
                        </span>
                    </span>
                </div>
            )}

            <div style={{ flex: 1, overflow: "auto" }}>
                {procThreads.length === 0 ? (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 32,
                            color: "var(--color-muted)",
                            fontSize: 11,
                            flexDirection: "column",
                            gap: 8,
                            textAlign: "center",
                        }}
                    >
                        <div style={{ fontSize: 26 }}>⫩</div>
                        <div>
                            {activeProcs.length === 0
                                ? "No active processes — spawn one in Process Manager."
                                : "No threads in this process — click + spawn thread."}
                        </div>
                    </div>
                ) : (
                    <table className="kobi-table">
                        <thead>
                            <tr>
                                <th>TID</th>
                                <th>Name</th>
                                <th>State</th>
                                <th>Priority</th>
                                <th>SP</th>
                                <th>PC</th>
                                <th>R0</th>
                                <th>R1</th>
                                <th>R2</th>
                                <th>R3</th>
                                <th>CPU</th>
                                <th>Q</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {procThreads.map((t) => (
                                <tr key={t.tid}>
                                    <td
                                        style={{
                                            color: "var(--color-accent)",
                                        }}
                                    >
                                        {t.tid}
                                    </td>
                                    <td>{t.name}</td>
                                    <td>
                                        <ThreadStateBadge state={t.state} />
                                    </td>
                                    <td>{t.priority}</td>
                                    <td
                                        style={{
                                            color: "#83a598",
                                            fontSize: 10,
                                        }}
                                    >
                                        0x
                                        {t.stackPointer
                                            .toString(16)
                                            .padStart(6, "0")}
                                    </td>
                                    <td
                                        style={{
                                            color: "#83a598",
                                            fontSize: 10,
                                        }}
                                    >
                                        0x
                                        {t.programCounter
                                            .toString(16)
                                            .padStart(6, "0")}
                                    </td>
                                    <td style={{ fontSize: 10 }}>
                                        {t.registers.r0}
                                    </td>
                                    <td style={{ fontSize: 10 }}>
                                        {t.registers.r1}
                                    </td>
                                    <td style={{ fontSize: 10 }}>
                                        {t.registers.r2}
                                    </td>
                                    <td style={{ fontSize: 10 }}>
                                        {t.registers.r3}
                                    </td>
                                    <td>{t.cpuTimeUsed}</td>
                                    <td>{t.quantum}</td>
                                    <td style={{ display: "flex", gap: 3 }}>
                                        {t.state !== "waiting" &&
                                            t.state !== "terminated" && (
                                                <button
                                                    className="kobi-btn"
                                                    onClick={() =>
                                                        setThreadState(
                                                            t.tid,
                                                            "waiting",
                                                        )
                                                    }
                                                    style={{
                                                        padding: "1px 5px",
                                                        fontSize: 9,
                                                    }}
                                                >
                                                    block
                                                </button>
                                            )}
                                        {t.state === "waiting" && (
                                            <button
                                                className="kobi-btn"
                                                onClick={() =>
                                                    setThreadState(
                                                        t.tid,
                                                        "ready",
                                                    )
                                                }
                                                style={{
                                                    padding: "1px 5px",
                                                    fontSize: 9,
                                                }}
                                            >
                                                wake
                                            </button>
                                        )}
                                        {t.state !== "terminated" && (
                                            <button
                                                className="kobi-btn kobi-btn-danger"
                                                onClick={() =>
                                                    setThreadState(
                                                        t.tid,
                                                        "terminated",
                                                    )
                                                }
                                                style={{
                                                    padding: "1px 5px",
                                                    fontSize: 9,
                                                }}
                                            >
                                                kill
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
                    Per-process round-robin thread scheduler. Each tick advances
                    PC by 4 and r0 by 1 to model an instruction.
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>TCB</span>
            </div>
        </div>
    );
}
