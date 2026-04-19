import { useEffect, useRef, useState } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";

const BOOT_LINES = [
    { tag: "    0.000", text: "kobiOS kernel 1.0.0 — loading...", cls: "info" },
    {
        tag: "    0.142",
        text: "Initializing process manager...       [ OK ]",
        cls: "ok",
    },
    {
        tag: "    0.289",
        text: "Loading scheduler (FCFS)...           [ OK ]",
        cls: "ok",
    },
    {
        tag: "    0.401",
        text: "Mounting memory manager (32 frames)... [ OK ]",
        cls: "ok",
    },
    {
        tag: "    0.553",
        text: "Starting semaphore subsystem...       [ OK ]",
        cls: "ok",
    },
    {
        tag: "    0.709",
        text: "Initializing Zustand kernel store...  [ OK ]",
        cls: "ok",
    },
    {
        tag: "    0.883",
        text: "Linking UI shell...                   [ OK ]",
        cls: "ok",
    },
    {
        tag: "    1.042",
        text: "Starting kobiOS desktop environment.. [ OK ]",
        cls: "ok",
    },
    { tag: "    1.204", text: "All systems operational.", cls: "info" },
];

interface BootScreenProps {
    onComplete: () => void;
}

export function BootScreen({ onComplete }: BootScreenProps) {
    const [lines, setLines] = useState<typeof BOOT_LINES>([]);
    const [progress, setProgress] = useState(0);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let startTimeout: ReturnType<typeof setTimeout> | null = null;
        let nextTickTimeout: ReturnType<typeof setTimeout> | null = null;
        let completeTimeout: ReturnType<typeof setTimeout> | null = null;
        let i = 0;

        const tick = () => {
            if (cancelled) return;
            if (i < BOOT_LINES.length) {
                const nextLine = BOOT_LINES[i];
                if (nextLine) {
                    setLines((prev) => [...prev, nextLine]);
                }
                i++;
                nextTickTimeout = setTimeout(tick, 260 + Math.random() * 140);
            } else {
                setDone(true);
                completeTimeout = setTimeout(onComplete, 900);
            }
        };

        startTimeout = setTimeout(tick, 600);

        const prog = setInterval(() => {
            setProgress((p) => Math.min(100, p + Math.random() * 14 + 4));
        }, 280);

        return () => {
            cancelled = true;
            clearInterval(prog);
            if (startTimeout) clearTimeout(startTimeout);
            if (nextTickTimeout) clearTimeout(nextTickTimeout);
            if (completeTimeout) clearTimeout(completeTimeout);
        };
    }, [onComplete]);

    // Seed initial processes once (ref-guard prevents StrictMode double-fire)
    const spawnProcess = useKernelStore((s) => s.spawnProcess);
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current) return;
        seeded.current = true;
        spawnProcess("init", 4, 1, 0);
        spawnProcess("SystemD", 8, 2, 0);
        spawnProcess("kDesktop", 12, 3, 0);
    }, [spawnProcess]);

    const lineStyle = (cls: string): CSSProperties => {
        switch (cls) {
            case "ok":
                return { color: "#b8bb26" };
            case "info":
                return { color: "#ebdbb2" };
            case "warn":
                return { color: "#fabd2f" };
            case "err":
                return { color: "#fb4934" };
            default:
                return { color: "#a89984" };
        }
    };

    return (
        <motion.div
            className="boot-screen"
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
        >
            {/* Logo */}
            <div
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 32,
                    color: "var(--color-accent)",
                    letterSpacing: "0.3em",
                    marginBottom: 8,
                    textShadow: "0 0 30px rgba(200,146,42,0.5)",
                }}
            >
                kobiOS
            </div>
            <div
                style={{
                    color: "#83a598",
                    fontSize: 11,
                    marginBottom: 32,
                    letterSpacing: "0.2em",
                }}
            >
                kernel 1.0.0 — university CEP build
            </div>

            {/* Boot log terminal */}
            <div
                style={{
                    width: 580,
                    background: "rgba(12,10,8,0.95)",
                    border: "1px solid var(--color-panel-border)",
                    borderRadius: 4,
                    padding: "16px 20px",
                    minHeight: 220,
                }}
            >
                <div className="boot-log">
                    {lines.filter(Boolean).map((l, idx) => (
                        <div key={idx}>
                            <span
                                style={{
                                    color: "#504945",
                                    marginRight: 12,
                                }}
                            >
                                [{l.tag}]
                            </span>
                            <span style={lineStyle(l.cls)}>
                                {l.text.includes("[ OK ]") ? (
                                    <>
                                        {l.text.replace("[ OK ]", "")}
                                        <span style={{ color: "#b8bb26" }}>
                                            [ OK ]
                                        </span>
                                    </>
                                ) : (
                                    l.text
                                )}
                            </span>
                        </div>
                    ))}
                    {!done && (
                        <span
                            style={{
                                display: "inline-block",
                                width: 8,
                                height: 13,
                                background: "var(--color-accent)",
                                marginTop: 2,
                                animation: "pulse 1s infinite",
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: 580, marginTop: 16 }}>
                <div
                    style={{
                        height: 3,
                        background: "rgba(61,53,48,0.8)",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            height: "100%",
                            width: `${progress}%`,
                            background: "#b8bb26",
                            transition: "width 0.3s ease",
                            boxShadow: "0 0 8px rgba(200,146,42,0.6)",
                        }}
                    />
                </div>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        fontSize: 10,
                        color: "var(--color-muted)",
                    }}
                >
                    <span style={{ color: "#a89984" }}>
                        {done ? "Boot complete" : "Loading..."}
                    </span>
                    <span style={{ color: "#fabd2f" }}>
                        {Math.floor(progress)}%
                    </span>
                </div>
            </div>

            {done && (
                <div
                    style={{
                        marginTop: 20,
                        fontSize: 11,
                        color: "var(--color-accent)",
                        letterSpacing: "0.2em",
                        animation: "pulse 1s infinite",
                    }}
                >
                    entering desktop...
                </div>
            )}
        </motion.div>
    );
}
