import { useEffect, useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import { Wifi, Volume2, Bluetooth, BatteryFull } from "lucide-react";

interface TopBarProps {
    openWindows: string[];
    minimizedWindows: string[];
    activeWindow: string | null;
    onWindowClick: (id: string) => void;
    onWindowRestore: (id: string) => void;
    onWindowMinimize: (id: string) => void;
    tilingMode: boolean;
    onToggleTiling: () => void;
}

export function TopBar({
    openWindows,
    minimizedWindows,
    activeWindow,
    onWindowClick,
    onWindowRestore,
    onWindowMinimize,
    tilingMode,
    onToggleTiling,
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
        "process-manager": "procfs",
        scheduler: "sched",
        memory: "vmstat",
        sync: "ipc-demo",
        terminal: "tty0",
        notepad: "nano",
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
                <button
                    onClick={onToggleTiling}
                    style={{
                        background: "none",
                        border: "1px solid var(--color-subtle)",
                        borderRadius: 2,
                        cursor: "pointer",
                        padding: "0 6px",
                        height: 18,
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: tilingMode ? "#b8bb26" : "var(--color-muted)",
                        letterSpacing: "0.08em",
                    }}
                    title="Toggle tiling mode"
                >
                    {tilingMode ? "tile:on" : "tile:off"}
                </button>

                {/* Open window chips */}
                {openWindows.length > 0 && (
                    <div
                        style={{
                            display: "flex",
                            gap: 2,
                            marginLeft: 12,
                            borderLeft: "1px solid var(--color-subtle)",
                            paddingLeft: 12,
                        }}
                    >
                        {openWindows.map((id) => {
                            const isActive = activeWindow === id;
                            const isMinimized = minimizedWindows.includes(id);
                            return (
                                <button
                                    key={id}
                                    onClick={() =>
                                        isMinimized
                                            ? onWindowRestore(id)
                                            : isActive
                                              ? onWindowMinimize(id)
                                              : onWindowClick(id)
                                    }
                                    style={{
                                        background: isActive
                                            ? "rgba(184,187,38,0.12)"
                                            : "transparent",
                                        border: "none",
                                        borderBottom: `1px solid ${
                                            isActive
                                                ? "#b8bb26"
                                                : isMinimized
                                                  ? "var(--color-subtle)"
                                                  : "transparent"
                                        }`,
                                        padding: "0 8px",
                                        height: 22,
                                        cursor: "pointer",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: 10,
                                        color: isActive
                                            ? "#b8bb26"
                                            : isMinimized
                                              ? "var(--color-subtle)"
                                              : "var(--color-muted)",
                                        letterSpacing: "0.06em",
                                        transition: "all 0.1s",
                                        opacity: isMinimized ? 0.5 : 1,
                                    }}
                                >
                                    {WINDOW_LABELS[id] ?? id}
                                </button>
                            );
                        })}
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
