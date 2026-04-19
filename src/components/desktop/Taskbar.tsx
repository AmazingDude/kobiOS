import { useKernelStore } from "../../store/kernelStore";
import {
    Settings,
    Clock,
    Grid3x3,
    RefreshCw,
    Terminal as TermIcon,
    FileText,
} from "lucide-react";

interface TaskbarProps {
    openWindows: string[];
    minimizedWindows: string[];
    activeWindow: string | null;
    onAppLaunch: (id: string) => void;
    onWindowRestore: (id: string) => void;
    onWindowMinimize: (id: string) => void;
    onWindowFocus: (id: string) => void;
}

const APP_DEFS = [
    { id: "process-manager", label: "Process Manager", icon: Settings },
    { id: "scheduler", label: "Scheduler", icon: Clock },
    { id: "memory", label: "Memory", icon: Grid3x3 },
    { id: "sync", label: "Sync Demo", icon: RefreshCw },
    { id: "terminal", label: "Terminal", icon: TermIcon },
    { id: "notepad", label: "Notepad", icon: FileText },
] as const;

export function Taskbar({
    openWindows,
    minimizedWindows,
    activeWindow,
    onAppLaunch,
    onWindowRestore,
    onWindowMinimize,
    onWindowFocus,
}: TaskbarProps) {
    const processes = useKernelStore((s) => s.processes);
    const runningCount = processes.filter(
        (p) => p.state !== "terminated",
    ).length;

    const handleClick = (id: string) => {
        if (!openWindows.includes(id)) {
            // Not open → launch
            onAppLaunch(id);
        } else if (minimizedWindows.includes(id)) {
            // Minimized → restore
            onWindowRestore(id);
            onWindowFocus(id);
        } else if (activeWindow === id) {
            // Focused → minimize
            onWindowMinimize(id);
        } else {
            // Open, not focused → focus
            onWindowFocus(id);
        }
    };

    return (
        <div className="taskbar">
            {/* kobiOS logo */}
            <div
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "#fabd2f",
                    letterSpacing: "0.15em",
                    paddingRight: 12,
                    borderRight: "1px solid var(--color-panel-border)",
                    marginRight: 8,
                    cursor: "default",
                }}
            >
                kobiOS
            </div>

            {/* App buttons */}
            {APP_DEFS.map((app) => {
                const isOpen = openWindows.includes(app.id);
                const isActive =
                    activeWindow === app.id &&
                    !minimizedWindows.includes(app.id);
                const isMinimized = minimizedWindows.includes(app.id);
                const IconComp = app.icon;

                return (
                    <button
                        key={app.id}
                        className="taskbar-btn"
                        onClick={() => handleClick(app.id)}
                        title={app.label}
                        style={{
                            opacity: isOpen ? 1 : 0.5,
                            background: isActive
                                ? "rgba(232, 168, 48, 0.12)"
                                : "transparent",
                            border: "none",
                            borderBottom: isOpen
                                ? `2px solid ${isActive ? "#b8bb26" : "transparent"}`
                                : "2px solid transparent",
                            color: isMinimized
                                ? "#504945"
                                : isActive
                                  ? "#b8bb26"
                                  : "#a89984",
                        }}
                    >
                        <span
                            style={{ marginRight: 4, display: "inline-flex" }}
                        >
                            <IconComp size={12} strokeWidth={1.8} />
                        </span>
                        {app.label}
                    </button>
                );
            })}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Status */}
            <div
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--color-muted)",
                    display: "flex",
                    gap: 14,
                    paddingLeft: 12,
                    borderLeft: "1px solid var(--color-panel-border)",
                }}
            >
                <span>
                    <span style={{ color: "#a89984" }}>procs: </span>
                    <span style={{ color: "#d3869b" }}>{runningCount}</span>
                </span>
                <span style={{ color: "#504945" }}>kobi@kobiOS</span>
            </div>
        </div>
    );
}
