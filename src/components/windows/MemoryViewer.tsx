import { useMemo, useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type {
    MemoryFrame,
    PageReplacementPolicy,
    PageReferenceEvent,
} from "../../types";
import { MemoryManager } from "../../kernel/MemoryManager";

const POLICIES: PageReplacementPolicy[] = ["FIFO", "LRU", "OPTIMAL", "CLOCK"];

const POLICY_DESCRIPTIONS: Record<PageReplacementPolicy, string> = {
    FIFO: "Evicts the frame that was loaded earliest.",
    LRU: "Evicts the frame whose page was accessed least recently.",
    OPTIMAL:
        "Belady's optimal — evicts the frame whose page will not be used for the longest time in the future.",
    CLOCK: "Second-chance algorithm using a circular reference-bit clock.",
};

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

function ReferenceStringSimulator() {
    const [refString, setRefString] = useState(
        "7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1",
    );
    const [frameCount, setFrameCount] = useState("3");
    const [policy, setPolicy] = useState<PageReplacementPolicy>("OPTIMAL");

    const result = useMemo(() => {
        const refs = refString
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .map((s) => parseInt(s, 10))
            .filter((n) => !isNaN(n));
        const fc = Math.max(1, parseInt(frameCount, 10) || 3);
        if (refs.length === 0) return null;
        return {
            refs,
            sim: MemoryManager.simulateReferenceString(refs, fc, policy),
            frameCount: fc,
        };
    }, [refString, frameCount, policy]);

    return (
        <div
            style={{
                padding: "8px 12px",
                borderTop: "1px solid rgba(61,53,48,0.4)",
            }}
        >
            <div
                style={{
                    fontSize: 9,
                    color: "var(--color-muted)",
                    letterSpacing: "0.1em",
                    marginBottom: 6,
                }}
            >
                REFERENCE STRING SIMULATOR — {policy}
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 8,
                }}
            >
                <span style={{ fontSize: 10, color: "var(--color-muted)" }}>
                    refs:
                </span>
                <input
                    className="kobi-input"
                    value={refString}
                    onChange={(e) => setRefString(e.target.value)}
                    style={{ width: 280 }}
                />
                <span style={{ fontSize: 10, color: "var(--color-muted)" }}>
                    frames:
                </span>
                <input
                    className="kobi-input"
                    type="number"
                    min={1}
                    max={16}
                    value={frameCount}
                    onChange={(e) => setFrameCount(e.target.value)}
                    style={{ width: 50 }}
                />
                <span style={{ fontSize: 10, color: "var(--color-muted)" }}>
                    policy:
                </span>
                <select
                    className="kobi-select"
                    value={policy}
                    onChange={(e) =>
                        setPolicy(e.target.value as PageReplacementPolicy)
                    }
                >
                    {POLICIES.map((p) => (
                        <option key={p} value={p}>
                            {p}
                        </option>
                    ))}
                </select>
            </div>

            {result && (
                <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <div className="metric-card" style={{ flex: 1 }}>
                            <div className="metric-label">Page Faults</div>
                            <div
                                className="metric-value"
                                style={{ fontSize: 16, color: "#f97316" }}
                            >
                                {result.sim.pageFaults}
                            </div>
                        </div>
                        <div className="metric-card" style={{ flex: 1 }}>
                            <div className="metric-label">Page Hits</div>
                            <div
                                className="metric-value"
                                style={{ fontSize: 16, color: "#14b8a6" }}
                            >
                                {result.sim.pageHits}
                            </div>
                        </div>
                        <div className="metric-card" style={{ flex: 1 }}>
                            <div className="metric-label">Hit Ratio</div>
                            <div
                                className="metric-value"
                                style={{ fontSize: 16 }}
                            >
                                {(
                                    (result.sim.pageHits /
                                        Math.max(1, result.refs.length)) *
                                    100
                                ).toFixed(1)}
                                %
                            </div>
                        </div>
                    </div>

                    <TraceGrid
                        events={result.sim.events}
                        refs={result.refs}
                        frameCount={result.frameCount}
                    />
                </>
            )}

            <div
                style={{
                    fontSize: 9,
                    color: "var(--color-muted)",
                    marginTop: 6,
                    fontStyle: "italic",
                }}
            >
                {POLICY_DESCRIPTIONS[policy]}
            </div>
        </div>
    );
}

function TraceGrid({
    events,
    refs,
    frameCount,
}: {
    events: PageReferenceEvent[];
    refs: number[];
    frameCount: number;
}) {
    // Reconstruct frame snapshots step-by-step
    const snapshots: (number | null)[][] = [];
    const cur: (number | null)[] = Array(frameCount).fill(null);
    let lastEvictedSlot: number | null = null;
    for (const ev of events) {
        if (ev.fault) {
            // find slot: free first, else evictedFrameId
            const free = cur.indexOf(null);
            if (free !== -1) {
                cur[free] = ev.pageNumber;
                lastEvictedSlot = free;
            } else if (ev.evictedFrameId !== undefined) {
                cur[ev.evictedFrameId] = ev.pageNumber;
                lastEvictedSlot = ev.evictedFrameId;
            }
        }
        snapshots.push([...cur]);
    }

    return (
        <div style={{ overflow: "auto" }}>
            <table className="kobi-table" style={{ fontSize: 10 }}>
                <thead>
                    <tr>
                        <th style={{ minWidth: 50 }}>Step</th>
                        <th>Ref</th>
                        {Array.from({ length: frameCount }, (_, i) => (
                            <th key={i}>F{i}</th>
                        ))}
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>
                    {events.map((ev, idx) => (
                        <tr key={idx}>
                            <td>{ev.step}</td>
                            <td
                                style={{
                                    color: "var(--color-accent)",
                                    fontWeight: 600,
                                }}
                            >
                                {refs[ev.step]}
                            </td>
                            {snapshots[idx].map((page, fi) => (
                                <td
                                    key={fi}
                                    style={{
                                        fontFamily: "var(--font-mono)",
                                        background:
                                            ev.fault && fi === lastEvictedSlot
                                                ? "rgba(249,115,22,0.1)"
                                                : "transparent",
                                    }}
                                >
                                    {page === null ? "·" : page}
                                </td>
                            ))}
                            <td
                                style={{
                                    color: ev.fault ? "#f97316" : "#14b8a6",
                                    fontSize: 9,
                                    letterSpacing: "0.1em",
                                }}
                            >
                                {ev.fault
                                    ? ev.evictedPage !== undefined
                                        ? `FAULT (evict p${ev.evictedPage})`
                                        : "FAULT"
                                    : "HIT"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function MemoryViewer() {
    const processes = useKernelStore((s) => s.processes);
    const memoryFrames = useKernelStore((s) => s.memoryFrames);
    const memoryStats = useKernelStore((s) => s.memoryStats);
    const pageFaults = useKernelStore((s) => s.pageFaults);
    const policy = useKernelStore((s) => s.memoryPolicy);
    const setPolicy = useKernelStore((s) => s.setMemoryPolicy);
    const accessPage = useKernelStore((s) => s.accessPage);
    const [selectedPid, setSelectedPid] = useState<number | null>(null);

    const activeProcs = processes
        .filter((p) => p.state !== "terminated")
        .map((p) => ({ pid: p.pid, color: p.color, name: p.name }));

    const selectedProc = activeProcs.find((p) => p.pid === selectedPid);
    const selectedFrames = memoryFrames.filter((f) => f.pid === selectedPid);

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
                    flexWrap: "wrap",
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
                {POLICIES.map((p) => (
                    <button
                        key={p}
                        className="kobi-btn"
                        onClick={() => setPolicy(p)}
                        title={POLICY_DESCRIPTIONS[p]}
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
                <button
                    className="kobi-btn"
                    onClick={() =>
                        accessPage(
                            selectedPid ?? 1,
                            Math.floor(Math.random() * 8),
                        )
                    }
                >
                    Simulate Access
                </button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 9, color: "var(--color-muted)" }}>
                    faults:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                        {pageFaults}
                    </span>
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
                    { label: "Total Frames", value: memoryStats.totalFrames },
                    {
                        label: "Used",
                        value: memoryStats.usedFrames,
                        style: { color: "#f59e0b" },
                    },
                    {
                        label: "Free",
                        value: memoryStats.freeFrames,
                        style: { color: "#14b8a6" },
                    },
                    {
                        label: "Page Faults",
                        value: pageFaults,
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

            <div style={{ flex: 1, overflow: "auto" }}>
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

                <div>
                    <div
                        style={{
                            padding: "6px 12px 0",
                            fontSize: 9,
                            color: "var(--color-muted)",
                            letterSpacing: "0.1em",
                        }}
                    >
                        FRAME GRID ({memoryStats.totalFrames} frames)
                    </div>
                    <FrameGrid
                        frames={memoryFrames}
                        selectedPid={selectedPid}
                        onSelect={setSelectedPid}
                    />
                </div>

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
                                        <td style={{ color: "#14b8a6" }}>OK</td>
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

                {activeProcs.length === 0 && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 100,
                            color: "var(--color-muted)",
                            fontSize: 11,
                            flexDirection: "column",
                            gap: 8,
                            padding: "20px 0",
                        }}
                    >
                        <div style={{ fontSize: 22 }}>▦</div>
                        <div>
                            No active processes — spawn some, or try the
                            simulator below
                        </div>
                    </div>
                )}

                <ReferenceStringSimulator />
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
                    Policy:{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                        {policy}
                    </span>{" "}
                    | Used: {memoryStats.usedFrames}/{memoryStats.totalFrames}
                    {" "}frames
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>
                    Memory Viewer
                </span>
            </div>
        </div>
    );
}
