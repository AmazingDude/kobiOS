import { useState, useEffect, useRef, useCallback } from "react";
import { useKernelStore } from "../../store/kernelStore";

interface LogEntry {
    id: number;
    tick: number;
    who: "producer" | "consumer" | "system";
    text: string;
    isError?: boolean;
}

type SyncMode = "sync" | "unsync";
type SimState = "idle" | "running" | "paused";

const BUFFER_SIZE = 5;

function BufferVis({ slots, capacity }: { slots: number[]; capacity: number }) {
    return (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {Array.from({ length: capacity }, (_, i) => {
                const hasItem = i < slots.length;
                return (
                    <div
                        key={i}
                        title={hasItem ? `Item ${slots[i]}` : "empty"}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 4,
                            border: `1px solid ${hasItem ? "rgba(200,146,42,0.6)" : "rgba(61,53,48,0.5)"}`,
                            background: hasItem
                                ? "rgba(200,146,42,0.2)"
                                : "rgba(26,22,20,0.5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: hasItem
                                ? "var(--color-accent)"
                                : "var(--color-muted)",
                            transition: "all 0.2s",
                        }}
                    >
                        {hasItem ? slots[i] : "·"}
                    </div>
                );
            })}
            <div
                style={{
                    marginLeft: 8,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-muted)",
                }}
            >
                {slots.length}/{capacity}
            </div>
        </div>
    );
}

function SemaphoreBox({
    name,
    value,
    locked,
}: {
    name: string;
    value: number;
    locked: boolean;
}) {
    return (
        <div
            style={{
                background: "rgba(26,22,20,0.6)",
                border: `1px solid ${locked ? "rgba(160,69,85,0.5)" : "rgba(107,142,107,0.5)"}`,
                borderRadius: 3,
                padding: "6px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                minWidth: 90,
            }}
        >
            <div
                style={{
                    color: "var(--color-muted)",
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    marginBottom: 2,
                }}
            >
                SEM:{name}
            </div>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: locked ? "#e07080" : "#6b8e6b",
                }}
            >
                <span style={{ fontSize: 12 }}>{locked ? "🔒" : "🔓"}</span>
                <span>val={value}</span>
            </div>
        </div>
    );
}

function ThreadActor({
    label,
    role,
    state,
    count,
}: {
    label: string;
    role: "producer" | "consumer";
    state: "idle" | "running" | "blocked" | "racing";
    count: number;
}) {
    const color =
        state === "running"
            ? "#14b8a6"
            : state === "blocked"
              ? "#f59e0b"
              : state === "racing"
                ? "#f97316"
                : "var(--color-muted)";

    const glyph = role === "producer" ? "▶" : "◀";

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px 14px",
                background: "rgba(26,22,20,0.5)",
                border: `1px solid ${state === "running" ? "rgba(20,184,166,0.3)" : state === "racing" ? "rgba(249,115,22,0.3)" : "var(--color-panel-border)"}`,
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                minWidth: 110,
                transition: "border-color 0.2s",
            }}
        >
            <div
                style={{
                    fontSize: 22,
                    color,
                    transition: "color 0.2s",
                }}
            >
                {glyph}
            </div>
            <div style={{ fontSize: 10, color: "var(--color-foreground)" }}>
                {label}
            </div>
            <div
                style={{
                    fontSize: 9,
                    color,
                    letterSpacing: "0.08em",
                    background: color + "18",
                    padding: "1px 6px",
                    borderRadius: 2,
                    border: `1px solid ${color}33`,
                }}
            >
                {state}
            </div>
            <div style={{ fontSize: 9, color: "var(--color-muted)" }}>
                ops: {count}
            </div>
        </div>
    );
}

function EventLog({ logs }: { logs: LogEntry[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const color = (who: LogEntry["who"], isError?: boolean) => {
        if (isError) return "#e07080";
        if (who === "producer") return "#14b8a6";
        if (who === "consumer") return "#6366f1";
        return "var(--color-muted)";
    };

    return (
        <div
            style={{
                flex: 1,
                overflow: "auto",
                padding: "8px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                lineHeight: 1.7,
            }}
        >
            {logs.map((l) => (
                <div key={l.id} style={{ color: color(l.who, l.isError) }}>
                    <span
                        style={{
                            color: "rgba(138,122,106,0.5)",
                            marginRight: 8,
                        }}
                    >
                        [t={String(l.tick).padStart(3)}]
                    </span>
                    <span>{l.text}</span>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
}

function useProducerConsumer(mode: SyncMode, simState: SimState) {
    const [buffer, setBuffer] = useState<number[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([
        {
            id: 0,
            tick: 0,
            who: "system",
            text: "Producer-Consumer with bounded buffer (size=5)",
        },
    ]);
    const [pState, setPState] = useState<
        "idle" | "running" | "blocked" | "racing"
    >("idle");
    const [cState, setCState] = useState<
        "idle" | "running" | "blocked" | "racing"
    >("idle");
    const [pOps, setPOps] = useState(0);
    const [cOps, setCOps] = useState(0);
    const [raceDetected, setRaceDetected] = useState(false);
    const tickRef = useRef(0);
    const idRef = useRef(1);

    const addLog = useCallback(
        (who: LogEntry["who"], text: string, isError?: boolean) => {
            const entry: LogEntry = {
                id: idRef.current++,
                tick: tickRef.current,
                who,
                text,
                isError,
            };
            setLogs((prev) => [...prev.slice(-80), entry]);
        },
        [],
    );

    useEffect(() => {
        if (simState !== "running") {
            setPState("idle");
            setCState("idle");
            return;
        }

        if (mode === "unsync") {
            const pInterval = setInterval(() => {
                tickRef.current++;
                setPState("racing");
                setBuffer((buf) => {
                    if (buf.length >= BUFFER_SIZE) {
                        // RACE: overflow
                        addLog(
                            "producer",
                            `⚠ OVERFLOW! buffer full (${buf.length}/${BUFFER_SIZE}) — item LOST`,
                            true,
                        );
                        setRaceDetected(true);
                        return buf;
                    }
                    const item = Math.floor(Math.random() * 99) + 1;
                    addLog(
                        "producer",
                        `produced item=${item} → buffer[${buf.length}]`,
                    );
                    setPOps((n) => n + 1);
                    return [...buf, item];
                });
            }, 700);

            const cInterval = setInterval(() => {
                tickRef.current++;
                setCState("racing");
                setBuffer((buf) => {
                    if (buf.length === 0) {
                        addLog(
                            "consumer",
                            `⚠ UNDERFLOW! buffer empty — consume on EMPTY`,
                            true,
                        );
                        setRaceDetected(true);
                        return buf;
                    }
                    addLog("consumer", `consumed item=${buf[0]} ← buffer[0]`);
                    setCOps((n) => n + 1);
                    return buf.slice(1);
                });
            }, 500); // consumer faster → will underflow

            return () => {
                clearInterval(pInterval);
                clearInterval(cInterval);
            };
        }

        const pInterval = setInterval(() => {
            tickRef.current++;
            setBuffer((buf) => {
                const empty = BUFFER_SIZE - buf.length;
                if (empty === 0) {
                    setPState("blocked");
                    addLog(
                        "producer",
                        "wait(empty) — buffer full, blocking...",
                    );
                    return buf;
                }

                useKernelStore.getState().acquireMutex(1);
                setPState("running");

                const item = Math.floor(Math.random() * 99) + 1;
                const next = [...buf, item];
                addLog(
                    "producer",
                    `produced item=${item} → buffer[${buf.length}]  mutex=locked`,
                );
                setPOps((n) => n + 1);
                useKernelStore.getState().releaseMutex(1);
                return next;
            });
        }, 800);

        const cInterval = setInterval(() => {
            tickRef.current++;
            setBuffer((buf) => {
                const full = buf.length;
                if (full === 0) {
                    setCState("blocked");
                    addLog(
                        "consumer",
                        "wait(full) — buffer empty, blocking...",
                    );
                    return buf;
                }

                useKernelStore.getState().acquireMutex(2);
                setCState("running");

                const item = buf[0];
                addLog(
                    "consumer",
                    `consumed item=${item} ← buffer[0]  mutex=locked`,
                );
                setCOps((n) => n + 1);
                useKernelStore.getState().releaseMutex(2);
                return buf.slice(1);
            });
        }, 600);

        return () => {
            clearInterval(pInterval);
            clearInterval(cInterval);
        };
    }, [simState, mode, addLog]);

    const reset = useCallback(() => {
        setBuffer([]);
        setLogs([
            {
                id: 0,
                tick: 0,
                who: "system",
                text: "Reset. Choose a mode and press Run.",
            },
        ]);
        tickRef.current = 0;
        idRef.current = 1;
        setPState("idle");
        setCState("idle");
        setPOps(0);
        setCOps(0);
        setRaceDetected(false);
    }, []);

    return {
        buffer,
        logs,
        pState,
        cState,
        pOps,
        cOps,
        raceDetected,
        reset,
    };
}

export function SyncDemo() {
    const semaphoreState = useKernelStore((s) => s.semaphoreState);
    const semaphoreValue = useKernelStore((s) => s.semaphoreValue);
    const [mode, setMode] = useState<SyncMode>("sync");
    const [simState, setSimState] = useState<SimState>("idle");
    const { buffer, logs, pState, cState, pOps, cOps, raceDetected, reset } =
        useProducerConsumer(mode, simState);

    const handleRun = () => {
        if (simState === "running") {
            setSimState("paused");
        } else {
            setSimState("running");
        }
    };

    const handleReset = () => {
        setSimState("idle");
        reset();
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
            {/* Toolbar */}
            <div
                style={{
                    padding: "7px 12px",
                    borderBottom: "1px solid var(--color-panel-border)",
                    display: "flex",
                    gap: 10,
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
                    MODE:
                </span>
                {(
                    [
                        ["sync", "With Sync (mutex+semaphore)"],
                        ["unsync", "Without Sync (race conditions)"],
                    ] as const
                ).map(([m, label]) => (
                    <button
                        key={m}
                        className="kobi-btn"
                        onClick={() => {
                            setMode(m);
                            handleReset();
                        }}
                        style={{
                            background:
                                mode === m
                                    ? "rgba(200,146,42,0.25)"
                                    : "rgba(200,146,42,0.06)",
                            borderColor:
                                mode === m
                                    ? "var(--color-accent)"
                                    : "rgba(61,53,48,0.6)",
                            color:
                                mode === m
                                    ? "var(--color-accent)"
                                    : "var(--color-muted)",
                        }}
                    >
                        {label}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                <button className="kobi-btn" onClick={handleRun}>
                    {simState === "running" ? "⏸ Pause" : "▶ Run"}
                </button>
                <button
                    className="kobi-btn kobi-btn-danger"
                    onClick={handleReset}
                    style={{ fontSize: 9 }}
                >
                    Reset
                </button>
            </div>

            {/* Race condition banner */}
            {raceDetected && mode === "unsync" && (
                <div
                    style={{
                        padding: "5px 12px",
                        background: "rgba(160,69,85,0.15)",
                        borderBottom: "1px solid rgba(160,69,85,0.4)",
                        fontSize: 10,
                        color: "#e07080",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    ⚠ RACE CONDITION DETECTED — buffer overflow/underflow due to
                    missing synchronization
                </div>
            )}

            {/* Visualization area */}
            <div
                style={{
                    padding: "12px",
                    borderBottom: "1px solid rgba(61,53,48,0.4)",
                    flexShrink: 0,
                    background: "rgba(12,10,8,0.3)",
                }}
            >
                {/* Actors + buffer */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        justifyContent: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <ThreadActor
                        label="Producer"
                        role="producer"
                        state={pState}
                        count={pOps}
                    />

                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 9,
                                color: "var(--color-muted)",
                                letterSpacing: "0.1em",
                            }}
                        >
                            BOUNDED BUFFER
                        </div>
                        <BufferVis slots={buffer} capacity={BUFFER_SIZE} />
                    </div>

                    <ThreadActor
                        label="Consumer"
                        role="consumer"
                        state={cState}
                        count={cOps}
                    />
                </div>

                {/* Semaphores (sync mode only) */}
                {mode === "sync" && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            gap: 10,
                            marginTop: 12,
                        }}
                    >
                        <SemaphoreBox
                            name="mutex"
                            value={semaphoreState.locked ? 0 : 1}
                            locked={semaphoreState.locked}
                        />
                        <SemaphoreBox
                            name="empty"
                            value={BUFFER_SIZE - buffer.length}
                            locked={BUFFER_SIZE - buffer.length === 0}
                        />
                        <SemaphoreBox
                            name="full"
                            value={semaphoreValue}
                            locked={semaphoreValue === 0}
                        />
                    </div>
                )}

                {mode === "unsync" && (
                    <div
                        style={{
                            textAlign: "center",
                            marginTop: 10,
                            fontSize: 10,
                            color: "rgba(249,115,22,0.7)",
                            letterSpacing: "0.06em",
                        }}
                    >
                        No mutex. No semaphores. Race conditions will occur.
                    </div>
                )}
            </div>

            {/* Event log */}
            <div
                style={{
                    flex: 1,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div
                    style={{
                        padding: "4px 12px",
                        fontSize: 9,
                        color: "var(--color-muted)",
                        letterSpacing: "0.1em",
                        background: "rgba(16,12,10,0.3)",
                        borderBottom: "1px solid rgba(61,53,48,0.3)",
                        flexShrink: 0,
                        display: "flex",
                        justifyContent: "space-between",
                    }}
                >
                    <span>EVENT LOG</span>
                    <span>
                        <span style={{ color: "#14b8a6" }}>■ producer</span>
                        {"  "}
                        <span style={{ color: "#6366f1" }}>■ consumer</span>
                        {"  "}
                        <span style={{ color: "#e07080" }}>■ race</span>
                    </span>
                </div>
                <EventLog logs={logs} />
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
                    Mode:{" "}
                    <span
                        style={{
                            color: mode === "sync" ? "#14b8a6" : "#f97316",
                        }}
                    >
                        {mode === "sync" ? "synchronized" : "unsynchronized"}
                    </span>
                </span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>
                    Producer-Consumer
                </span>
            </div>
        </div>
    );
}
