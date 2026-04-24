import { useEffect, useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import { Wifi, Volume2, Bluetooth, BatteryFull } from "lucide-react";

interface TopBarProps {
    openWindows: string[];
    activeWindow: string | null;
    onWindowClick: (id: string) => void;
}

export function TopBar({
    openWindows,
    activeWindow,
    onWindowClick,
}: TopBarProps) {
    const processes = useKernelStore((s) => s.processes);
    const [clock, setClock] = useState(() =>
        new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }),
    );
    const [activeWs, setActiveWs] = useState(1);

    // Derive system stats from process list
    const runningCount = processes.filter(
        (p) => p.state !== "terminated",
    ).length;
    const cpuEst = Math.min(
        100,
        Math.round(
            processes.filter((p) => p.state === "running").length * 25 +
                (runningCount > 0 ? 8 : 0),
        ),
    );
    const memEst = Math.min(100, runningCount * 6 + 10);

    useEffect(() => {
        const id = setInterval(() => {
            setClock(
                new Date().toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
            );
        }, 30_000);
        return () => clearInterval(id);
    }, []);

    const WINDOW_LABELS: Record<string, string> = {
        "process-manager": "proc",
        scheduler: "sched",
        memory: "mem",
        sync: "sync",
        terminal: "term",
    };

    return (
        <div
            className="topbar"
            style={{ userSelect: "none", WebkitUserSelect: "none" }}
        >
            {/* Left — workspace dots */}
            <div
                style={{
                    display: "flex",
                    gap: 10,
                    flex: 1,
                    alignItems: "center",
                }}
            >
                <span
                    className="topbar-accent"
                    style={{
                        fontSize: 11,
                        letterSpacing: "0.2em",
                        color: "#83a598",
                    }}
                >
                    λ
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                    {[1, 2, 3, 4].map((ws) => (
                        <button
                            key={ws}
                            onClick={() => setActiveWs(ws)}
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                color:
                                    activeWs === ws
                                        ? "#fabd2f"
                                        : "var(--color-subtle)",
                                transition: "color 0.15s",
                                letterSpacing: "0.1em",
                            }}
                        >
                            [{ws}]
                        </button>
                    ))}
                </div>

                {/* Open window chips */}
                {openWindows.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                        {openWindows.map((id) => (
                            <button
                                key={id}
                                onClick={() => onWindowClick(id)}
                                style={{
                                    background:
                                        activeWindow === id
                                            ? "rgba(200,146,42,0.15)"
                                            : "none",
                                    border: `1px solid ${activeWindow === id ? "rgba(200,146,42,0.4)" : "rgba(61,53,48,0.6)"}`,
                                    borderRadius: 2,
                                    padding: "1px 7px",
                                    cursor: "pointer",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 10,
                                    color:
                                        activeWindow === id
                                            ? "var(--color-accent)"
                                            : "var(--color-muted)",
                                    transition: "all 0.12s",
                                    letterSpacing: "0.06em",
                                }}
                            >
                                {WINDOW_LABELS[id] ?? id}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Center — hostname */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <span style={{ color: "var(--color-subtle)" }}>[ </span>
                <span style={{ color: "#b8bb26" }}>kobiOS</span>
                <span style={{ color: "var(--color-muted)" }}>@</span>
                <span style={{ color: "#83a598" }}>Sophos</span>
                <span style={{ color: "var(--color-muted)" }}>:~</span>
                <span style={{ color: "var(--color-subtle)" }}> ]</span>
            </div>

            {/* Right — stats + clock */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                    alignItems: "center",
                }}
            >
                <span
                    title="CPU estimate"
                    style={{ color: "var(--color-muted)" }}
                >
                    [ CPU: <span style={{ color: "#fb4934" }}>{cpuEst}%</span> ]
                </span>
                <span
                    title="Memory estimate"
                    style={{ color: "var(--color-muted)" }}
                >
                    [ MEM: <span style={{ color: "#8ec07c" }}>{memEst}%</span> ]
                </span>
                <span style={{ color: "var(--color-muted)" }}>
                    [ PROCS:{" "}
                    <span style={{ color: "#d3869b" }}>{runningCount}</span> ]
                </span>
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#83a598",
                    }}
                    title="System status"
                >
                    <Wifi size={13} strokeWidth={2.4} />
                    <Volume2 size={13} strokeWidth={2.4} />
                    <Bluetooth size={13} strokeWidth={2.4} />
                    <BatteryFull size={13} strokeWidth={2.4} />
                </span>
                <span style={{ color: "#fabd2f" }}>[ {clock} ]</span>
            </div>
        </div>
    );
}
