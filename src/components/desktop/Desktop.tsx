import { useState, useCallback, useEffect, useRef } from "react";
import { TopBar } from "./TopBar";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";
import { ProcessManager } from "../windows/ProcessManager";
import { SchedulerWindow } from "../windows/SchedulerWindow";
import { MemoryViewer } from "../windows/MemoryViewer";
import { SyncDemo } from "../windows/SyncDemo";
import { Terminal } from "../windows/Terminal";
import { Notepad } from "../windows/Notepad";
import {
    Settings,
    Clock,
    Grid3x3,
    RefreshCw,
    Terminal as TerminalIcon,
    FileText,
} from "lucide-react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useKernelStore } from "../../store/kernelStore";

interface AppDef {
    id: string;
    title: string;
    icon?: ReactNode;
    defaultPos: { x: number; y: number };
    defaultSize: { w: number; h: number };
    component: React.ComponentType;
}

const APPS: AppDef[] = [
    {
        id: "process-manager",
        title: "Process Manager",
        icon: <Settings size={14} strokeWidth={1.5} />,
        defaultPos: { x: 60, y: 50 },
        defaultSize: { w: 860, h: 500 },
        component: ProcessManager,
    },
    {
        id: "scheduler",
        title: "CPU Scheduler",
        icon: <Clock size={14} strokeWidth={1.5} />,
        defaultPos: { x: 120, y: 70 },
        defaultSize: { w: 900, h: 530 },
        component: SchedulerWindow,
    },
    {
        id: "memory",
        title: "Memory Viewer",
        icon: <Grid3x3 size={14} strokeWidth={1.5} />,
        defaultPos: { x: 180, y: 90 },
        defaultSize: { w: 780, h: 500 },
        component: MemoryViewer,
    },
    {
        id: "sync",
        title: "Sync Demo",
        icon: <RefreshCw size={14} strokeWidth={1.5} />,
        defaultPos: { x: 200, y: 80 },
        defaultSize: { w: 820, h: 560 },
        component: SyncDemo,
    },
    {
        id: "terminal",
        title: "Terminal",
        icon: <TerminalIcon size={14} strokeWidth={1.5} />,
        defaultPos: { x: 240, y: 100 },
        defaultSize: { w: 700, h: 440 },
        component: Terminal,
    },
    {
        id: "notepad",
        title: "Notepad",
        icon: <FileText size={14} strokeWidth={1.5} />,
        defaultPos: { x: 300, y: 120 },
        defaultSize: { w: 600, h: 420 },
        component: Notepad,
    },
];

const APP_BURST_TIMES: Record<string, number> = {
    "process-manager": 8,
    scheduler: 20,
    memory: 15,
    sync: 12,
    terminal: 5,
    notepad: 4,
};

const APP_PRIORITIES: Record<string, number> = {
    "process-manager": 5,
    scheduler: 4,
    memory: 4,
    sync: 3,
    terminal: 3,
    notepad: 2,
};

const DESKTOP_ICONS = [
    {
        id: "process-manager",
        label: "Process\nManager",
        glyph: "process-manager",
    },
    { id: "scheduler", label: "CPU\nScheduler", glyph: "scheduler" },
    { id: "memory", label: "Memory\nViewer", glyph: "memory" },
    { id: "sync", label: "Sync\nDemo", glyph: "sync" },
    { id: "terminal", label: "Terminal", glyph: "terminal" },
    { id: "notepad", label: "Notepad", glyph: "notepad" },
];

const DESKTOP_ICON_COMPONENTS: Record<
    string,
    React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
    "process-manager": Settings,
    scheduler: Clock,
    memory: Grid3x3,
    sync: RefreshCw,
    terminal: TerminalIcon,
    notepad: FileText,
};

interface WinState {
    id: string;
    zIndex: number;
    minimized: boolean;
}

let zCounter = 100;

export function Desktop() {
    const [windows, setWindows] = useState<WinState[]>([]);
    const [wallpaperLoaded, setWallpaperLoaded] = useState(false);
    const wallpaperUrl = `${import.meta.env.BASE_URL}wallpaper.png`;
    const processes = useKernelStore((s) => s.processes);
    const spawnProcess = useKernelStore((s) => s.spawnProcess);
    const killProcess = useKernelStore((s) => s.killProcess);
    const windowPids = useRef<Record<string, number>>({});

    useEffect(() => {
        const img = new Image();
        img.onload = () => setWallpaperLoaded(true);
        img.onerror = () => setWallpaperLoaded(false);
        img.src = wallpaperUrl;
    }, [wallpaperUrl]);

    // If a mapped process is terminated externally, close its window.
    useEffect(() => {
        const terminatedWindowIds = windows
            .filter((w) => {
                const pid = windowPids.current[w.id];
                if (pid === undefined) return false;
                const proc = processes.find((p) => p.pid === pid);
                return proc?.state === "terminated";
            })
            .map((w) => w.id);

        if (terminatedWindowIds.length === 0) return;

        setWindows((prev) =>
            prev.filter((w) => !terminatedWindowIds.includes(w.id)),
        );

        for (const id of terminatedWindowIds) {
            delete windowPids.current[id];
        }
    }, [windows, processes]);

    // If kernel state is reset while windows stay open, recreate missing process entries.
    useEffect(() => {
        // Only auto-rebuild processes after a full reset.
        if (processes.length !== 0) return;

        for (const win of windows) {
            const mappedPid = windowPids.current[win.id];
            const hasMappedProcess =
                mappedPid !== undefined &&
                processes.some((p) => p.pid === mappedPid);

            if (hasMappedProcess) continue;

            const def = APPS.find((a) => a.id === win.id);
            if (!def) continue;

            spawnProcess(
                def.title,
                APP_BURST_TIMES[win.id] ?? 10,
                APP_PRIORITIES[win.id] ?? 2,
                0,
            );

            const procs = useKernelStore.getState().processes;
            const newProc = procs[procs.length - 1];
            if (newProc) windowPids.current[win.id] = newProc.pid;
        }
    }, [windows, processes, spawnProcess]);

    const openWindow = useCallback(
        (id: string) => {
            setWindows((prev) => {
                if (prev.find((w) => w.id === id)) {
                    // already exists — restore + focus
                    return prev.map((w) =>
                        w.id === id
                            ? { ...w, minimized: false, zIndex: ++zCounter }
                            : w,
                    );
                }
                return [...prev, { id, zIndex: ++zCounter, minimized: false }];
            });

            if (!windowPids.current[id]) {
                const def = APPS.find((a) => a.id === id);
                if (def) {
                    spawnProcess(
                        def.title,
                        APP_BURST_TIMES[id] ?? 10,
                        APP_PRIORITIES[id] ?? 2,
                        0,
                    );
                    const procs = useKernelStore.getState().processes;
                    const newProc = procs[procs.length - 1];
                    if (newProc) windowPids.current[id] = newProc.pid;
                }
            } else {
                const pid = windowPids.current[id];
                if (pid !== undefined) {
                    useKernelStore.getState().updateState(pid, "running");
                }
            }
        },
        [spawnProcess],
    );

    const closeWindow = useCallback(
        (id: string) => {
            setWindows((prev) => prev.filter((w) => w.id !== id));

            const pid = windowPids.current[id];
            if (pid !== undefined) {
                const procs = useKernelStore.getState().processes;
                const proc = procs.find((p) => p.pid === pid);
                if (proc && !proc.isProtected) {
                    killProcess(pid);
                }
                delete windowPids.current[id];
            }
        },
        [killProcess],
    );

    const minimizeWindow = useCallback((id: string) => {
        setWindows((prev) =>
            prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
        );

        const pid = windowPids.current[id];
        if (pid !== undefined) {
            useKernelStore.getState().updateState(pid, "waiting");
        }
    }, []);

    const focusWindow = useCallback((id: string) => {
        setWindows((prev) =>
            prev.map((w) =>
                w.id === id
                    ? { ...w, zIndex: ++zCounter, minimized: false }
                    : w,
            ),
        );

        const pid = windowPids.current[id];
        if (pid !== undefined) {
            useKernelStore.getState().updateState(pid, "running");
        }
    }, []);

    const openIds = windows.map((w) => w.id);
    const minimizedIds = windows.filter((w) => w.minimized).map((w) => w.id);

    // The "active" window is the one with the highest z-index that is not minimized
    const activeWin =
        windows
            .filter((w) => !w.minimized)
            .sort((a, b) => b.zIndex - a.zIndex)[0]?.id ?? null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                position: "relative",
                backgroundColor: "#141617",
                backgroundImage: wallpaperLoaded
                    ? `url('${wallpaperUrl}')`
                    : "radial-gradient(ellipse at 30% 20%, #1a3a4a 0%, #0f2535 30%, #1a1408 60%, #0e0a06 100%)",
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                backgroundPosition: "center top",
            }}
        >
            {/* Vibrancy overlay - boosts wallpaper colors */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(135deg, rgba(20,50,60,0.15) 0%, rgba(0,0,0,0) 50%, rgba(40,20,0,0.2) 100%)",
                    pointerEvents: "none",
                    zIndex: 0,
                    mixBlendMode: "color",
                }}
            />

            {/* Subtle noise/texture overlay */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
                    backgroundSize: "300px 300px",
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />

            {/* Decorative grid lines — subtle scanline feel */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                        "linear-gradient(rgba(200,146,42,0.020) 1px, transparent 1px), linear-gradient(90deg, rgba(200,146,42,0.020) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />

            {/* TopBar */}
            <TopBar
                openWindows={openIds}
                activeWindow={activeWin}
                onWindowClick={focusWindow}
            />

            {/* Desktop icons — left column */}
            <div
                style={{
                    position: "absolute",
                    top: 44,
                    left: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    zIndex: 10,
                }}
            >
                {DESKTOP_ICONS.map((icon, index) => {
                    const IconComp = DESKTOP_ICON_COMPONENTS[icon.id];
                    return (
                        <motion.div
                            key={icon.id}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                                delay: 0.3 + index * 0.07,
                                duration: 0.25,
                                ease: "easeOut",
                            }}
                        >
                            <button
                                className="desktop-icon"
                                onClick={() => openWindow(icon.id)}
                                onDoubleClick={() => openWindow(icon.id)}
                                title={`Double-click to open ${icon.label.replace("\n", " ")}`}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    padding: 0,
                                }}
                            >
                                <div className="desktop-icon-glyph">
                                    {IconComp && (
                                        <IconComp size={22} strokeWidth={1.5} />
                                    )}
                                </div>
                                <span className="desktop-icon-label">
                                    {icon.label}
                                </span>
                            </button>
                        </motion.div>
                    );
                })}
            </div>

            {/* Corner watermark */}
            <div
                style={{
                    position: "absolute",
                    bottom: 44,
                    right: 20,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "rgba(200,146,42,0.18)",
                    textAlign: "right",
                    lineHeight: 1.8,
                    zIndex: 1,
                    userSelect: "none",
                }}
            >
                <div>~/</div>
                <div style={{ color: "rgba(200,146,42,0.35)", fontSize: 14 }}>
                    λ
                </div>
                <div style={{ fontSize: 9 }}>kobiOS v1.0</div>
            </div>

            {/* Windows */}
            <AnimatePresence>
                {windows.map((win) => {
                    const def = APPS.find((a) => a.id === win.id);
                    if (!def) return null;
                    const AppComponent = def.component;
                    return (
                        <Window
                            key={win.id}
                            id={win.id}
                            title={def.title}
                            icon={def.icon}
                            defaultPosition={def.defaultPos}
                            defaultSize={def.defaultSize}
                            zIndex={win.zIndex}
                            isActive={activeWin === win.id}
                            isMinimized={win.minimized}
                            onClose={closeWindow}
                            onMinimize={minimizeWindow}
                            onFocus={focusWindow}
                        >
                            <AppComponent />
                        </Window>
                    );
                })}
            </AnimatePresence>

            {/* Taskbar */}
            <Taskbar
                openWindows={openIds}
                minimizedWindows={minimizedIds}
                activeWindow={activeWin}
                onAppLaunch={openWindow}
                onWindowRestore={focusWindow}
                onWindowMinimize={minimizeWindow}
                onWindowFocus={focusWindow}
            />
        </motion.div>
    );
}
