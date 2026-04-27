import { useMemo, useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { RAGState } from "../../types";

interface NodePos {
    id: string;
    label: string;
    type: "process" | "resource";
    x: number;
    y: number;
}

function layout(state: RAGState, width: number, height: number): NodePos[] {
    const nodes: NodePos[] = [];
    const padX = 70;
    const padY = 50;

    const procs = state.processes;
    const ress = state.resources;

    // Processes on the left, resources on the right
    if (procs.length > 0) {
        const stride = (height - padY * 2) / Math.max(1, procs.length - 1);
        procs.forEach((pid, i) => {
            nodes.push({
                id: `P${pid}`,
                label: `P${pid}`,
                type: "process",
                x: padX,
                y: procs.length === 1 ? height / 2 : padY + i * stride,
            });
        });
    }
    if (ress.length > 0) {
        const stride = (height - padY * 2) / Math.max(1, ress.length - 1);
        ress.forEach((rid, i) => {
            nodes.push({
                id: rid,
                label: rid,
                type: "resource",
                x: width - padX,
                y: ress.length === 1 ? height / 2 : padY + i * stride,
            });
        });
    }

    return nodes;
}

function RAGCanvas({
    state,
    cycle,
    cycleResources,
}: {
    state: RAGState;
    cycle: number[];
    cycleResources: string[];
}) {
    const width = 520;
    const height = 320;
    const nodes = useMemo(
        () => layout(state, width, height),
        [state],
    );

    const findNode = (id: string) => nodes.find((n) => n.id === id);
    const inCycle = new Set(cycle.map((p) => `P${p}`));
    const cycleResSet = new Set(cycleResources);

    return (
        <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
                background: "rgba(12,10,8,0.5)",
                border: "1px solid rgba(61,53,48,0.6)",
                borderRadius: 4,
            }}
        >
            <defs>
                <marker
                    id="arrowhead"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                >
                    <path d="M0,0 L10,5 L0,10 z" fill="#a89984" />
                </marker>
                <marker
                    id="arrowhead-cycle"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                >
                    <path d="M0,0 L10,5 L0,10 z" fill="#fb4934" />
                </marker>
            </defs>

            {/* Allocation edges: resource -> process */}
            {state.allocations.map((a, i) => {
                const r = findNode(a.resourceId);
                const p = findNode(`P${a.pid}`);
                if (!r || !p) return null;
                const isCycle =
                    cycleResSet.has(a.resourceId) && inCycle.has(`P${a.pid}`);
                return (
                    <line
                        key={`alloc-${i}`}
                        x1={r.x}
                        y1={r.y}
                        x2={p.x}
                        y2={p.y}
                        stroke={isCycle ? "#fb4934" : "#a89984"}
                        strokeWidth={isCycle ? 2 : 1.4}
                        markerEnd={
                            isCycle ? "url(#arrowhead-cycle)" : "url(#arrowhead)"
                        }
                        opacity={isCycle ? 0.95 : 0.6}
                    />
                );
            })}

            {/* Request edges: process -> resource (dashed) */}
            {state.requests.map((rq, i) => {
                const r = findNode(rq.resourceId);
                const p = findNode(`P${rq.pid}`);
                if (!r || !p) return null;
                const isCycle =
                    cycleResSet.has(rq.resourceId) && inCycle.has(`P${rq.pid}`);
                return (
                    <line
                        key={`req-${i}`}
                        x1={p.x}
                        y1={p.y}
                        x2={r.x}
                        y2={r.y}
                        stroke={isCycle ? "#fb4934" : "#83a598"}
                        strokeDasharray="5 4"
                        strokeWidth={isCycle ? 2 : 1.4}
                        markerEnd={
                            isCycle ? "url(#arrowhead-cycle)" : "url(#arrowhead)"
                        }
                        opacity={isCycle ? 0.95 : 0.7}
                    />
                );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
                const isProcessInCycle =
                    n.type === "process" && inCycle.has(n.id);
                const isResourceInCycle =
                    n.type === "resource" && cycleResSet.has(n.id);
                const stroke = isProcessInCycle || isResourceInCycle
                    ? "#fb4934"
                    : n.type === "process"
                      ? "#fabd2f"
                      : "#83a598";
                const fill = "rgba(26,22,20,0.95)";
                return (
                    <g key={n.id}>
                        {n.type === "process" ? (
                            <circle
                                cx={n.x}
                                cy={n.y}
                                r={22}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={2}
                            />
                        ) : (
                            <rect
                                x={n.x - 22}
                                y={n.y - 22}
                                width={44}
                                height={44}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={2}
                            />
                        )}
                        <text
                            x={n.x}
                            y={n.y + 4}
                            textAnchor="middle"
                            fontSize="11"
                            fontFamily="var(--font-mono)"
                            fill={stroke}
                            fontWeight={600}
                        >
                            {n.label}
                        </text>
                    </g>
                );
            })}

            {/* Legend */}
            <g transform={`translate(10, ${height - 36})`}>
                <line
                    x1={0}
                    y1={6}
                    x2={26}
                    y2={6}
                    stroke="#a89984"
                    strokeWidth={1.4}
                    markerEnd="url(#arrowhead)"
                />
                <text
                    x={32}
                    y={10}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fill="#a89984"
                >
                    allocation (R → P)
                </text>
                <line
                    x1={150}
                    y1={6}
                    x2={176}
                    y2={6}
                    stroke="#83a598"
                    strokeWidth={1.4}
                    strokeDasharray="5 4"
                    markerEnd="url(#arrowhead)"
                />
                <text
                    x={182}
                    y={10}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fill="#83a598"
                >
                    request (P → R)
                </text>
                <line
                    x1={310}
                    y1={6}
                    x2={336}
                    y2={6}
                    stroke="#fb4934"
                    strokeWidth={2}
                    markerEnd="url(#arrowhead-cycle)"
                />
                <text
                    x={342}
                    y={10}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fill="#fb4934"
                >
                    cycle edge
                </text>
            </g>
        </svg>
    );
}

export function DeadlockWindow() {
    const state = useKernelStore((s) => s.deadlockState);
    const result = useKernelStore((s) => s.deadlockResult);
    const ragAllocate = useKernelStore((s) => s.ragAllocate);
    const ragRequest = useKernelStore((s) => s.ragRequest);
    const ragRelease = useKernelStore((s) => s.ragRelease);
    const detectDeadlock = useKernelStore((s) => s.detectDeadlock);
    const resetRAG = useKernelStore((s) => s.resetRAG);
    const loadDeadlockExample = useKernelStore((s) => s.loadDeadlockExample);
    const killProcess = useKernelStore((s) => s.killProcess);
    const processes = useKernelStore((s) => s.processes);

    const [pid, setPid] = useState("1");
    const [resourceId, setResourceId] = useState("R1");

    const handleAllocate = () => {
        const n = parseInt(pid);
        if (!isNaN(n) && resourceId.trim()) ragAllocate(n, resourceId.trim());
    };
    const handleRequest = () => {
        const n = parseInt(pid);
        if (!isNaN(n) && resourceId.trim()) ragRequest(n, resourceId.trim());
    };
    const handleRelease = () => {
        const n = parseInt(pid);
        if (!isNaN(n) && resourceId.trim()) ragRelease(n, resourceId.trim());
    };

    const handleResolve = () => {
        if (result?.victimPid !== null && result?.victimPid !== undefined) {
            const exists = processes.some(
                (p) => p.pid === result.victimPid,
            );
            if (exists) {
                killProcess(result.victimPid);
            }
            // Also strip from the RAG so the cycle visibly breaks
            // (kill removes the process, which strips its allocations + requests)
            detectDeadlock();
        }
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
                    gap: 8,
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
                    PID:
                </span>
                <input
                    className="kobi-input"
                    type="number"
                    value={pid}
                    min={1}
                    onChange={(e) => setPid(e.target.value)}
                    style={{ width: 56 }}
                />
                <span
                    style={{
                        color: "var(--color-muted)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                    }}
                >
                    RES:
                </span>
                <input
                    className="kobi-input"
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                    style={{ width: 70 }}
                />

                <button className="kobi-btn" onClick={handleAllocate}>
                    allocate
                </button>
                <button className="kobi-btn" onClick={handleRequest}>
                    request
                </button>
                <button className="kobi-btn" onClick={handleRelease}>
                    release
                </button>

                <div style={{ flex: 1 }} />

                <button
                    className="kobi-btn"
                    onClick={loadDeadlockExample}
                    title="Loads a 4-process / 4-resource circular wait example"
                >
                    load example
                </button>
                <button
                    className="kobi-btn"
                    onClick={() => detectDeadlock()}
                    style={{
                        background: "rgba(200,146,42,0.18)",
                        borderColor: "var(--color-accent)",
                    }}
                >
                    detect
                </button>
                <button
                    className="kobi-btn kobi-btn-danger"
                    onClick={resetRAG}
                >
                    reset
                </button>
            </div>

            {result && (
                <div
                    style={{
                        padding: "6px 12px",
                        borderBottom: "1px solid rgba(61,53,48,0.4)",
                        background: result.deadlocked
                            ? "rgba(160,69,85,0.18)"
                            : "rgba(20,184,166,0.10)",
                        fontSize: 11,
                        flexShrink: 0,
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <span
                        style={{
                            color: result.deadlocked ? "#e07080" : "#14b8a6",
                            fontWeight: 600,
                        }}
                    >
                        {result.deadlocked ? "DEADLOCK DETECTED" : "SAFE"}
                    </span>
                    <span
                        style={{
                            color: "var(--color-foreground)",
                            fontSize: 10,
                        }}
                    >
                        {result.explanation}
                    </span>
                    {result.deadlocked && result.victimPid !== null && (
                        <button
                            className="kobi-btn"
                            onClick={handleResolve}
                            style={{
                                marginLeft: "auto",
                                background: "rgba(160,69,85,0.18)",
                                borderColor: "rgba(160,69,85,0.6)",
                                color: "#e07080",
                            }}
                        >
                            kill victim P{result.victimPid}
                        </button>
                    )}
                </div>
            )}

            <div
                style={{
                    flex: 1,
                    overflow: "auto",
                    padding: "12px",
                    background: "rgba(10,8,6,0.3)",
                }}
            >
                {state.processes.length === 0 ? (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            color: "var(--color-muted)",
                            gap: 10,
                            textAlign: "center",
                        }}
                    >
                        <div style={{ fontSize: 26 }}>↻</div>
                        <div style={{ maxWidth: 340, fontSize: 11 }}>
                            Empty resource allocation graph. Use the controls
                            above to add allocations / requests, or click
                            <strong> load example </strong>
                            to insert a classic 4-process circular wait.
                        </div>
                    </div>
                ) : (
                    <RAGCanvas
                        state={state}
                        cycle={result?.cycle ?? []}
                        cycleResources={result?.cycleResources ?? []}
                    />
                )}

                <div
                    style={{
                        marginTop: 12,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                    }}
                >
                    <div
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
                            ALLOCATIONS (R → P)
                        </div>
                        {state.allocations.length === 0 ? (
                            <div
                                style={{
                                    fontSize: 10,
                                    color: "var(--color-muted)",
                                }}
                            >
                                none
                            </div>
                        ) : (
                            <ul
                                style={{
                                    margin: 0,
                                    padding: 0,
                                    listStyle: "none",
                                    fontSize: 10,
                                }}
                            >
                                {state.allocations.map((a, i) => (
                                    <li key={i} style={{ marginBottom: 2 }}>
                                        <span style={{ color: "#83a598" }}>
                                            {a.resourceId}
                                        </span>{" "}
                                        → P{a.pid}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div
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
                            REQUESTS (P → R)
                        </div>
                        {state.requests.length === 0 ? (
                            <div
                                style={{
                                    fontSize: 10,
                                    color: "var(--color-muted)",
                                }}
                            >
                                none
                            </div>
                        ) : (
                            <ul
                                style={{
                                    margin: 0,
                                    padding: 0,
                                    listStyle: "none",
                                    fontSize: 10,
                                }}
                            >
                                {state.requests.map((r, i) => (
                                    <li key={i} style={{ marginBottom: 2 }}>
                                        P{r.pid} →{" "}
                                        <span style={{ color: "#83a598" }}>
                                            {r.resourceId}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
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
                    {state.processes.length} processes,{" "}
                    {state.resources.length} resources,{" "}
                    {state.allocations.length} allocations,{" "}
                    {state.requests.length} requests
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>
                    Resource Allocation Graph
                </span>
            </div>
        </div>
    );
}
