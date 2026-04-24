import { useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { PCB } from "../../types";

const STATE_COLOR: Record<string, string> = {
    new: "#6366f1",
    ready: "#f59e0b",
    running: "#14b8a6",
    waiting: "#f97316",
    terminated: "#64748b",
};

function StateBadge({ state }: { state: string }) {
    return (
        <span
            className="state-badge"
            style={{
                background: STATE_COLOR[state] + "22",
                color: STATE_COLOR[state],
                border: `1px solid ${STATE_COLOR[state]}55`,
            }}
        >
            {state}
        </span>
    );
}

function SpawnForm() {
    const spawnProcess = useKernelStore((s) => s.spawnProcess);
    const [name, setName] = useState("");
    const [burst, setBurst] = useState("8");
    const [priority, setPri] = useState("1");
    const [arrival, setArrival] = useState("0");

    const nudge = (
        value: string,
        setter: (v: string) => void,
        delta: number,
        min: number,
    ) => {
        const base = parseInt(value);
        const next = Math.max(min, (isNaN(base) ? min : base) + delta);
        setter(String(next));
    };

    const Stepper = ({
        value,
        setter,
        min,
    }: {
        value: string;
        setter: (v: string) => void;
        min: number;
    }) => (
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
                type="button"
                className="kobi-btn"
                onClick={() => nudge(value, setter, -1, min)}
                style={{ padding: "0 5px", height: 18, fontSize: 9 }}
            >
                -
            </button>
            <button
                type="button"
                className="kobi-btn"
                onClick={() => nudge(value, setter, 1, min)}
                style={{ padding: "0 5px", height: 18, fontSize: 9 }}
            >
                +
            </button>
        </div>
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const b = parseInt(burst);
        const p = parseInt(priority);
        const a = parseInt(arrival);
        if (!name.trim() || isNaN(b) || b < 1) return;
        spawnProcess(name.trim(), b, isNaN(p) ? 1 : p, isNaN(a) ? 0 : a);
        setName("");
    };

    return (
        <form
            onSubmit={handleSubmit}
            style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap",
            }}
        >
            <input
                className="kobi-input"
                placeholder="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: 100 }}
            />
            <input
                className="kobi-input"
                placeholder="burst"
                type="number"
                min={1}
                value={burst}
                onChange={(e) => setBurst(e.target.value)}
                style={{ width: 64 }}
            />
            <Stepper value={burst} setter={setBurst} min={1} />
            <input
                className="kobi-input"
                placeholder="prio"
                type="number"
                min={1}
                value={priority}
                onChange={(e) => setPri(e.target.value)}
                style={{ width: 54 }}
            />
            <Stepper value={priority} setter={setPri} min={1} />
            <input
                className="kobi-input"
                placeholder="arrival"
                type="number"
                min={0}
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                style={{ width: 64 }}
            />
            <Stepper value={arrival} setter={setArrival} min={0} />
            <button className="kobi-btn" type="submit">
                + Spawn
            </button>
        </form>
    );
}

function ProcessRow({ p, onKill }: { p: PCB; onKill: (pid: number) => void }) {
    return (
        <tr>
            <td>
                <span
                    style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: p.color,
                        marginRight: 6,
                    }}
                />
                {p.pid}
            </td>
            <td>
                {p.name}
                {p.isProtected && (
                    <span
                        style={{ marginLeft: 6, fontSize: 9, color: "#83a598" }}
                    >
                        ⬡
                    </span>
                )}
            </td>
            <td>
                <StateBadge state={p.state} />
            </td>
            <td style={{ color: "var(--color-accent)" }}>{p.priority}</td>
            <td>{p.burstTime}</td>
            <td>{p.remainingTime}</td>
            <td>{p.arrivalTime}</td>
            <td>{p.waitingTime}</td>
            <td>
                {p.state !== "terminated" && !p.isProtected && (
                    <button
                        className="kobi-btn kobi-btn-danger"
                        onClick={() => onKill(p.pid)}
                        style={{ padding: "2px 8px", fontSize: 9 }}
                    >
                        kill
                    </button>
                )}
                {p.isProtected && (
                    <span
                        style={{
                            fontSize: 9,
                            color: "var(--color-muted)",
                            letterSpacing: "0.08em",
                        }}
                    >
                        [protected]
                    </span>
                )}
            </td>
        </tr>
    );
}

function SummaryBar({ processes }: { processes: PCB[] }) {
    const counts = { new: 0, ready: 0, running: 0, waiting: 0, terminated: 0 };
    processes.forEach((p) => {
        counts[p.state]++;
    });

    return (
        <div
            style={{
                display: "flex",
                gap: 12,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                alignItems: "center",
            }}
        >
            {(Object.entries(counts) as [string, number][]).map(([s, n]) => (
                <span key={s} style={{ color: STATE_COLOR[s] }}>
                    {s}: {n}
                </span>
            ))}
        </div>
    );
}

const PRESETS = [
    { name: "Calculator", burst: 10, priority: 3 },
    { name: "WebBrowser", burst: 25, priority: 5 },
    { name: "Notepad", burst: 8, priority: 2 },
    { name: "FileExplore", burst: 15, priority: 3 },
];

export function ProcessManager() {
    const processes = useKernelStore((s) => s.processes);
    const killProcess = useKernelStore((s) => s.killProcess);
    const spawnProcess = useKernelStore((s) => s.spawnProcess);
    const resetAll = useKernelStore((s) => s.resetAll);

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
                fontFamily: "var(--font-mono)",
            }}
        >
            {/* Toolbar */}
            <div
                style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--color-panel-border)",
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    background: "rgba(16,12,10,0.4)",
                    flexShrink: 0,
                }}
            >
                <SpawnForm />
                <div style={{ flex: 1 }} />
                <button
                    className="kobi-btn kobi-btn-danger"
                    onClick={resetAll}
                    style={{ fontSize: 9 }}
                >
                    reset all
                </button>
            </div>

            {/* Quick launch */}
            <div
                style={{
                    padding: "6px 12px",
                    borderBottom: "1px solid rgba(61,53,48,0.4)",
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexShrink: 0,
                    background: "rgba(12,10,8,0.3)",
                }}
            >
                <span
                    style={{
                        color: "var(--color-muted)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        marginRight: 4,
                    }}
                >
                    QUICK LAUNCH:
                </span>
                {PRESETS.map((p) => (
                    <button
                        key={p.name}
                        className="kobi-btn"
                        onClick={() =>
                            spawnProcess(p.name, p.burst, p.priority)
                        }
                        style={{ fontSize: 9, padding: "2px 8px" }}
                    >
                        {p.name}
                    </button>
                ))}
            </div>

            {/* Summary */}
            <div
                style={{
                    padding: "5px 12px",
                    borderBottom: "1px solid rgba(61,53,48,0.3)",
                    flexShrink: 0,
                    background: "rgba(12,10,8,0.2)",
                }}
            >
                <SummaryBar processes={processes} />
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: "auto" }}>
                {processes.length === 0 ? (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            color: "var(--color-muted)",
                            fontSize: 11,
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        <div style={{ fontSize: 24 }}>⚙</div>
                        <div>
                            No processes. Spawn one below or use Quick Launch.
                        </div>
                    </div>
                ) : (
                    <table className="kobi-table">
                        <thead>
                            <tr>
                                <th>PID</th>
                                <th>Name</th>
                                <th>State</th>
                                <th>Priority</th>
                                <th>Burst</th>
                                <th>Remaining</th>
                                <th>Arrival</th>
                                <th>Waiting</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processes.map((p) => (
                                <ProcessRow
                                    key={p.pid}
                                    p={p}
                                    onKill={killProcess}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer status */}
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
                <span>Total: {processes.length} processes</span>
                <span style={{ color: "rgba(138,122,106,0.5)" }}>
                    PCB table
                </span>
            </div>
        </div>
    );
}
