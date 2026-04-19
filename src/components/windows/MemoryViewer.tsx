import { useState, useEffect } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { MemoryFrame, PageReplacementPolicy } from "../../types";

const TOTAL_FRAMES = 32;

function buildFrames(
    pids: { pid: number; color: string; name: string }[],
): MemoryFrame[] {
    // Seed deterministically: distribute pages, leave ~30% free
    const allocPerProc = Math.max(
        1,
        Math.floor((TOTAL_FRAMES * 0.7) / Math.max(pids.length, 1)),
    );
    let frameId = 0;
    const used: MemoryFrame[] = [];

    for (const p of pids) {
        for (let pg = 0; pg < Math.min(allocPerProc, 8); pg++) {
            used.push({
                frameId: frameId++,
                pid: p.pid,
                pageNumber: pg,
                color: p.color,
            });
        }
    }

    // Fill remaining as free
    for (let i = used.length; i < TOTAL_FRAMES; i++) {
        used.push({ frameId: i, pid: null, pageNumber: null, color: null });
    }

    return used.slice(0, TOTAL_FRAMES);
}

function FrameGrid({
    frames,
    selectedPid,
    onSelect,
}: {
    frames: MemoryFrame[];
    selectedPid: number | null;
    onSelect: (pid: number | null) => void;
}) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(16, 1fr)",
                gap: 3,
                padding: "10px 12px",
            }}
        >
            {frames.map((f) => {
                const isOwned = f.pid !== null;
                const isSelected =
                    f.pid === selectedPid && selectedPid !== null;
                return (
                    <div
                        key={f.frameId}
                        title={
                            isOwned
                                ? `Frame ${f.frameId} — PID ${f.pid} page ${f.pageNumber}`
                                : `Frame ${f.frameId} — free`
                        }
                        onClick={() => onSelect(isOwned ? f.pid : null)}
                        style={{
                            height: 18,
                            borderRadius: 2,
                            background: isOwned
                                ? (f.color ?? "#6366f1")
                                : "rgba(61,53,48,0.35)",
                            border: isSelected
                                ? "2px solid var(--color-accent)"
                                : `1px solid ${isOwned ? (f.color ?? "#6366f1") + "55" : "rgba(61,53,48,0.3)"}`,
                            cursor: isOwned ? "pointer" : "default",
                            opacity: isOwned ? (isSelected ? 1 : 0.7) : 0.5,
                            transition: "opacity 0.15s, border 0.15s",
                        }}
                    />
                );
            })}
        </div>
    );
}

function Sparkline({ values }: { values: number[] }) {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1);
    const w = 200,
        h = 40;
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - (v / max) * h;
        return `${x},${y}`;
    });
    return (
        <svg width={w} height={h} style={{ display: "block" }}>
            <polyline
                points={pts.join(" ")}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                opacity={0.8}
            />
            {values.map((v, i) => (
                <circle
                    key={i}
                    cx={(i / (values.length - 1)) * w}
                    cy={h - (v / max) * h}
                    r={2}
                    fill="var(--color-accent)"
                    opacity={0.6}
                />
            ))}
        </svg>
    );
}

export function MemoryViewer() {
    const processes = useKernelStore((s) => s.processes);
    // TODO(kobi): Replace local frame/page-fault simulation with kernel-backed memory snapshots once MemoryManager is wired to the store.
    const [policy, setPolicy] = useState<PageReplacementPolicy>("FIFO");
    const [selectedPid, setSelectedPid] = useState<number | null>(null);
    const [pageFaults, setPageFaults] = useState<number[]>([0]);
    const [tick, setTick] = useState(0);

    // Simulate page fault activity
    useEffect(() => {
        const id = setInterval(() => {
            if (processes.filter((p) => p.state !== "terminated").length > 0) {
                setPageFaults((prev) => {
                    const next = [...prev, Math.floor(Math.random() * 4)].slice(
                        -20,
                    );
                    return next;
                });
            }
            setTick((t) => t + 1);
        }, 1200);
        return () => clearInterval(id);
    }, [processes]);

    const activeProcs = processes
        .filter((p) => p.state !== "terminated")
        .map((p) => ({ pid: p.pid, color: p.color, name: p.name }));

    const frames = buildFrames(activeProcs);
    const usedFrames = frames.filter((f) => f.pid !== null).length;
    const freeFrames = TOTAL_FRAMES - usedFrames;
    const totalPageFaults = pageFaults.reduce((a, b) => a + b, 0);

    const selectedProc = activeProcs.find((p) => p.pid === selectedPid);
    const selectedFrames = frames.filter((f) => f.pid === selectedPid);

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
            {/* Toolbar */}
            <div
                style={{
                    padding: "7px 12px",
                    borderBottom: "1px solid var(--color-panel-border)",
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
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
                    POLICY:
                </span>
                {(["FIFO", "LRU"] as PageReplacementPolicy[]).map((p) => (
                    <button
                        key={p}
                        className="kobi-btn"
                        onClick={() => setPolicy(p)}
                        style={{
                            background:
                                policy === p
                                    ? "rgba(200,146,42,0.25)"
                                    : "rgba(200,146,42,0.06)",
                            borderColor:
                                policy === p
                                    ? "var(--color-accent)"
                                    : "rgba(61,53,48,0.6)",
                        }}
                    >
                        {p}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 9, color: "var(--color-muted)" }}>
                    tick:{" "}
                    <span style={{ color: "var(--color-accent)" }}>{tick}</span>
                </span>
            </div>

            {/* Stats row */}
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    padding: "7px 12px",
                    borderBottom: "1px solid rgba(61,53,48,0.4)",
                    flexShrink: 0,
                    background: "rgba(12,10,8,0.3)",
                }}
            >
                {[
                    { label: "Total Frames", value: TOTAL_FRAMES },
                    {
                        label: "Used",
                        value: usedFrames,
                        style: { color: "#f59e0b" },
                    },
                    {
                        label: "Free",
                        value: freeFrames,
                        style: { color: "#14b8a6" },
                    },
                    {
                        label: "Page Faults",
                        value: totalPageFaults,
                        style: { color: "#f97316" },
                    },
                ].map((s) => (
                    <div
                        className="metric-card"
                        key={s.label}
                        style={{ flex: 1 }}
                    >
                        <div className="metric-label">{s.label}</div>
                        <div
                            className="metric-value"
                            style={{ fontSize: 18, ...(s.style ?? {}) }}
                        >
                            {s.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Main area */}
            <div style={{ flex: 1, overflow: "auto" }}>
                {/* Legend */}
                {activeProcs.length > 0 && (
                    <div
                        style={{
                            padding: "6px 12px",
                            borderBottom: "1px solid rgba(61,53,48,0.3)",
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                        }}
                    >
                        {activeProcs.map((p) => (
                            <button
                                key={p.pid}
                                onClick={() =>
                                    setSelectedPid(
                                        selectedPid === p.pid ? null : p.pid,
                                    )
                                }
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                    background:
                                        selectedPid === p.pid
                                            ? "rgba(200,146,42,0.1)"
                                            : "none",
                                    border: `1px solid ${selectedPid === p.pid ? "var(--color-accent-border)" : "transparent"}`,
                                    borderRadius: 3,
                                    padding: "2px 7px",
                                    cursor: "pointer",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 10,
                                    color: "var(--color-foreground)",
                                }}
                            >
                                <span
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: p.color,
                                        flexShrink: 0,
                                    }}
                                />
                                PID {p.pid}: {p.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Frame grid */}
                <div>
                    <div
                        style={{
                            padding: "6px 12px 0",
                            fontSize: 9,
                            color: "var(--color-muted)",
                            letterSpacing: "0.1em",
                        }}
                    >
                        FRAME GRID ({TOTAL_FRAMES} frames)
                    </div>
                    <FrameGrid
                        frames={frames}
                        selectedPid={selectedPid}
                        onSelect={setSelectedPid}
                    />
                </div>

                {/* Selected process page table */}
                {selectedPid !== null && selectedProc && (
                    <div style={{ padding: "0 12px 10px" }}>
                        <div
                            style={{
                                fontSize: 9,
                                color: "var(--color-muted)",
                                letterSpacing: "0.1em",
                                marginBottom: 6,
                                paddingTop: 6,
                                borderTop: "1px solid rgba(61,53,48,0.4)",
                            }}
                        >
                            PAGE TABLE — PID {selectedPid} ({selectedProc.name})
                        </div>
                        <table className="kobi-table">
                            <thead>
                                <tr>
                                    <th>Page #</th>
                                    <th>Frame ID</th>
                                    <th>Valid</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedFrames.map((f) => (
                                    <tr key={f.frameId}>
                                        <td>{f.pageNumber}</td>
                                        <td
                                            style={{
                                                color: "var(--color-accent)",
                                            }}
                                        >
                                            {f.frameId}
                                        </td>
                                        <td style={{ color: "#14b8a6" }}>✓</td>
                                        <td>
                                            <span
                                                className="state-badge"
                                                style={{
                                                    background:
                                                        "rgba(20,184,166,0.1)",
                                                    color: "#14b8a6",
                                                    border: "1px solid rgba(20,184,166,0.3)",
                                                }}
                                            >
                                                in-memory
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Page fault graph */}
                {pageFaults.length > 2 && (
                    <div style={{ padding: "6px 12px 12px" }}>
                        <div
                            style={{
                                fontSize: 9,
                                color: "var(--color-muted)",
                                letterSpacing: "0.1em",
                                marginBottom: 8,
                                paddingTop: 6,
                                borderTop: "1px solid rgba(61,53,48,0.4)",
                            }}
                        >
                            PAGE FAULT HISTORY ({policy})
                        </div>
                        <Sparkline values={pageFaults} />
                    </div>
                )}

                {activeProcs.length === 0 && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 180,
                            color: "var(--color-muted)",
                            fontSize: 11,
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        <div style={{ fontSize: 24 }}>▦</div>
                        <div>
                            No active processes — spawn some in Process Manager
                        </div>
                    </div>
                )}
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
                    Policy:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                        {policy}
                    </span>{" "}
                    | Used: {usedFrames}/{TOTAL_FRAMES} frames
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>
                    Memory Viewer
                </span>
            </div>
        </div>
    );
}
