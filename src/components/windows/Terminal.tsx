import { useState, useRef, useEffect } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type { SchedulerAlgorithm } from "../../types";

interface Segment {
    text: string;
    color: string;
}

interface Line {
    type: "input" | "output" | "error" | "system" | "rich";
    text: string;
    segments?: Segment[];
}

function useTerminal() {
    const store = useKernelStore();
    const { processes, latestSchedulerSnapshot, schedulerConfig } = store;
    const gantt = latestSchedulerSnapshot?.gantt ?? [];
    const metrics = latestSchedulerSnapshot?.metrics ?? null;
    const {
        spawnProcess,
        killProcess,
        runScheduler,
        setSchedulerConfig,
        resetAll,
    } = store;

    const HELP = `
Available commands:
  spawn <name> <burst> [priority] [arrival]  — create a process
  kill <pid>                                  — terminate a process
  ps                                          — list all processes
  scheduler <FCFS|RR|PRIORITY_RR|SRJF> [quantum]      — change algorithm
  run                                         — run scheduler simulation
  gantt                                       — show last gantt result
  metrics                                     — show last scheduler metrics
  reset                                       — reset all processes
  clear                                       — clear terminal
    exit                                        — philosophical shutdown attempt
    neofetch                                    — show kobiOS system info
  help                                        — this help text
  uname                                       — system info
  uptime                                      — fake uptime
`.trim();

    const exec = (raw: string): Line[] => {
        const parts = raw.trim().split(/\s+/);
        const cmd = parts[0]?.toLowerCase();

        switch (cmd) {
            case "help":
                return [{ type: "output", text: HELP }];

            case "uname":
                return [
                    {
                        type: "system",
                        text: "kobiOS 1.0.0 browser-kernel TypeScript/React/Zustand",
                    },
                ];

            case "uptime": {
                const mins = Math.floor(Date.now() / 60000) % 1440;
                return [
                    {
                        type: "system",
                        text: `up ${Math.floor(mins / 60)}h ${mins % 60}m, load avg: ${(Math.random() * 2).toFixed(2)}`,
                    },
                ];
            }

            case "ps": {
                if (processes.length === 0)
                    return [{ type: "output", text: "no processes" }];
                const header =
                    "PID  NAME            STATE        PRI  BURST  REMAINING";
                const rows = processes.map(
                    (p) =>
                        `${String(p.pid).padEnd(4)} ${p.name.padEnd(15)} ${p.state.padEnd(12)} ${String(p.priority).padEnd(4)} ${String(p.burstTime).padEnd(6)} ${p.remainingTime}`,
                );
                return [{ type: "output", text: [header, ...rows].join("\n") }];
            }

            case "spawn": {
                const name = parts[1];
                const burst = parseInt(parts[2]);
                const priority = parseInt(parts[3] ?? "1");
                const arrival = parseInt(parts[4] ?? "0");
                if (!name || isNaN(burst) || burst < 1)
                    return [
                        {
                            type: "error",
                            text: "usage: spawn <name> <burst> [priority] [arrival]",
                        },
                    ];
                spawnProcess(
                    name,
                    burst,
                    isNaN(priority) ? 1 : priority,
                    isNaN(arrival) ? 0 : arrival,
                );
                const ps = useKernelStore.getState().processes;
                const newP = ps[ps.length - 1];
                return [
                    {
                        type: "system",
                        text: `[OK] spawned '${name}' PID ${newP?.pid ?? "?"} burst=${burst} priority=${priority ?? 1}`,
                    },
                ];
            }

            case "kill": {
                const pid = parseInt(parts[1]);
                if (isNaN(pid))
                    return [{ type: "error", text: "usage: kill <pid>" }];
                const target = processes.find((p) => p.pid === pid);
                if (!target)
                    return [
                        {
                            type: "error",
                            text: `kill: no process with PID ${pid}`,
                        },
                    ];
                if (target.state === "terminated")
                    return [
                        {
                            type: "error",
                            text: `kill: PID ${pid} already terminated`,
                        },
                    ];
                if (target.isProtected)
                    return [
                        {
                            type: "error",
                            text: `kill: PID ${pid} (${target.name}): operation not permitted`,
                        },
                    ];
                killProcess(pid);
                return [
                    {
                        type: "system",
                        text: `[OK] PID ${pid} (${target.name}) terminated`,
                    },
                ];
            }

            case "scheduler": {
                const algo = parts[1]?.toUpperCase() as SchedulerAlgorithm;
                const valid: SchedulerAlgorithm[] = [
                    "FCFS",
                    "RR",
                    "PRIORITY_RR",
                    "SRJF",
                ];
                if (!valid.includes(algo))
                    return [
                        {
                            type: "error",
                            text: "usage: scheduler <FCFS|RR|PRIORITY_RR|SRJF> [quantum]",
                        },
                    ];
                const quantum = parseInt(
                    parts[2] ?? String(schedulerConfig.timeQuantum),
                );
                setSchedulerConfig({
                    algorithm: algo,
                    timeQuantum: isNaN(quantum) ? 2 : quantum,
                });
                return [
                    {
                        type: "system",
                        text: `[OK] algorithm set to ${algo}${algo === "RR" || algo === "PRIORITY_RR" ? ` quantum=${quantum}` : ""}`,
                    },
                ];
            }

            case "run": {
                const active = processes.filter(
                    (p) => p.state !== "terminated",
                );
                if (active.length === 0)
                    return [
                        {
                            type: "error",
                            text: "no active processes to schedule",
                        },
                    ];
                runScheduler();
                const { latestSchedulerSnapshot } = useKernelStore.getState();
                const m = latestSchedulerSnapshot?.metrics ?? null;
                return [
                    {
                        type: "system",
                        text: `[OK] ran ${schedulerConfig.algorithm} on ${active.length} processes`,
                    },
                    {
                        type: "output",
                        text: m
                            ? `     avg wait: ${m.averageWaitingTime.toFixed(2)} | cpu util: ${m.cpuUtilization.toFixed(1)}%`
                            : "",
                    },
                ];
            }

            case "gantt": {
                if (gantt.length === 0)
                    return [
                        {
                            type: "error",
                            text: "no gantt data — run 'run' first",
                        },
                    ];
                const lines = gantt.map(
                    (e) =>
                        `  [${String(e.startTime).padStart(3)}–${String(e.endTime).padEnd(3)}] PID ${e.pid} (${e.name})`,
                );
                return [{ type: "output", text: lines.join("\n") }];
            }

            case "metrics": {
                if (!metrics)
                    return [
                        { type: "error", text: "no metrics — run 'run' first" },
                    ];
                return [
                    {
                        type: "output",
                        text: [
                            `  avg waiting time:    ${metrics.averageWaitingTime.toFixed(3)}`,
                            `  avg turnaround time: ${metrics.averageTurnaroundTime.toFixed(3)}`,
                            `  cpu utilization:     ${metrics.cpuUtilization.toFixed(1)}%`,
                            `  throughput:          ${metrics.throughput.toFixed(4)}/tick`,
                        ].join("\n"),
                    },
                ];
            }

            case "reset":
                resetAll();
                return [{ type: "system", text: "[OK] all processes reset" }];

            case "clear":
                return []; // handled by caller

            case "exit":
                return [
                    {
                        type: "system",
                        text: "[kobiOS] There is no escape. You are always in the kernel.",
                    },
                ];

            case "neofetch": {
                const procs = useKernelStore.getState().processes;
                const algo =
                    useKernelStore.getState().schedulerConfig.algorithm;
                const art = [
                    "  _          _     _  ___  ____  ",
                    " | | _____  | |__ (_)/ _ \\/ ___| ",
                    " | |/ / _ \\ | '_ \\| | | | \\___ \\ ",
                    " |   < (_) || |_) | | |_| |___) |",
                    " |_|\\_\\___/ |_.__/|_|\\___/|____/ ",
                    "                                  ",
                ];
                const info: Array<{
                    label: string;
                    value: string;
                    valueColor: string;
                }> = [
                    {
                        label: "OS",
                        value: "kobiOS 1.0.0 (browser kernel)",
                        valueColor: "#fabd2f",
                    },
                    {
                        label: "Shell",
                        value: "kobiSH 1.0",
                        valueColor: "#b8bb26",
                    },
                    {
                        label: "WM",
                        value: "kobiWM (floating)",
                        valueColor: "#83a598",
                    },
                    {
                        label: "Terminal",
                        value: "kobiTerm",
                        valueColor: "#8ec07c",
                    },
                    {
                        label: "Kernel",
                        value: "TypeScript / React / Zustand",
                        valueColor: "#d3869b",
                    },
                    {
                        label: "Uptime",
                        value: `${Math.floor(Date.now() / 60000) % 1440}m`,
                        valueColor: "#fe8019",
                    },
                    {
                        label: "Processes",
                        value: `${procs.length} total, ${procs.filter((p) => p.state !== "terminated").length} active`,
                        valueColor: "#fabd2f",
                    },
                    { label: "Scheduler", value: algo, valueColor: "#fb4934" },
                    {
                        label: "Memory",
                        value: "32 frames simulated",
                        valueColor: "#83a598",
                    },
                    {
                        label: "Build",
                        value: "CS-330 CEP Spring 2026",
                        valueColor: "#b8bb26",
                    },
                ];

                const blockColors = [
                    "#fb4934",
                    "#fabd2f",
                    "#b8bb26",
                    "#8ec07c",
                    "#83a598",
                    "#d3869b",
                    "#fe8019",
                    "#ebdbb2",
                ];

                const results: Line[] = [];
                const maxLen = Math.max(art.length, info.length);
                for (let i = 0; i < maxLen; i++) {
                    const artPart = (art[i] ?? "").padEnd(38);
                    const inf = info[i];
                    if (inf) {
                        results.push({
                            type: "rich",
                            text: "",
                            segments: [
                                { text: artPart, color: "#8ec07c" },
                                {
                                    text: inf.label.padEnd(10),
                                    color: "#a89984",
                                },
                                { text: ": ", color: "#504945" },
                                { text: inf.value, color: inf.valueColor },
                            ],
                        });
                    } else {
                        results.push({
                            type: "rich",
                            text: "",
                            segments: [{ text: artPart, color: "#8ec07c" }],
                        });
                    }
                }

                results.push({ type: "output", text: "" });
                results.push({
                    type: "rich",
                    text: "",
                    segments: [
                        { text: "  ", color: "#000" },
                        ...blockColors.map((c) => ({ text: "███ ", color: c })),
                    ],
                });
                results.push({ type: "output", text: "" });

                return results;
            }

            case "":
                return [];

            default:
                return [
                    {
                        type: "error",
                        text: `${cmd}: command not found — type 'help'`,
                    },
                ];
        }
    };

    return exec;
}

export function Terminal() {
    const [history, setHistory] = useState<Line[]>([
        {
            type: "system",
            text: "kobiOS kernel terminal  — type 'help' for commands",
        },
    ]);
    const [input, setInput] = useState("");
    const [cmdHistory, setCmdHistory] = useState<string[]>([]);
    const [histIdx, setHistIdx] = useState(-1);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const exec = useTerminal();

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [history]);

    const submit = () => {
        const raw = input.trim();
        const echoLine: Line = {
            type: "input",
            text: `kobiOS@Sophos:~$ ${raw}`,
        };

        if (raw === "clear") {
            setHistory([{ type: "system", text: "kobiOS kernel terminal" }]);
            setInput("");
            setHistIdx(-1);
            return;
        }

        const output = exec(raw);
        setHistory((prev) => [...prev, echoLine, ...output]);
        if (raw) {
            setCmdHistory((prev) => [raw, ...prev.slice(0, 49)]);
        }
        setInput("");
        setHistIdx(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            submit();
            return;
        }
        if (e.key === "ArrowUp") {
            const next = Math.min(histIdx + 1, cmdHistory.length - 1);
            setHistIdx(next);
            setInput(cmdHistory[next] ?? "");
            e.preventDefault();
        }
        if (e.key === "ArrowDown") {
            const next = Math.max(histIdx - 1, -1);
            setHistIdx(next);
            setInput(next === -1 ? "" : (cmdHistory[next] ?? ""));
            e.preventDefault();
        }
    };

    const lineColor = (type: Line["type"]) => {
        switch (type) {
            case "input":
                return "#ebdbb2";
            case "output":
                return "#a89984";
            case "error":
                return "#fb4934";
            case "system":
                return "#b8bb26";
            case "rich":
                return "#ebdbb2";
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                background: "rgba(29, 32, 33, 0.82)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
            }}
            onClick={() => inputRef.current?.focus()}
        >
            {/* Output scroll area */}
            <div
                style={{
                    flex: 1,
                    overflow: "auto",
                    padding: "10px 14px",
                    lineHeight: 1.7,
                }}
            >
                {history.map((line, i) => (
                    <div
                        key={i}
                        style={{
                            color: lineColor(line.type),
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {line.type === "rich" && line.segments
                            ? line.segments.map((seg, j) => (
                                  <span key={j} style={{ color: seg.color }}>
                                      {seg.text}
                                  </span>
                              ))
                            : line.text}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Input row */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    borderTop: "1px solid var(--color-panel-border)",
                    padding: "6px 14px",
                    background: "rgba(16,12,10,0.6)",
                    flexShrink: 0,
                }}
            >
                <span
                    style={{
                        marginRight: 8,
                        userSelect: "none",
                        display: "inline-flex",
                        gap: 0,
                    }}
                >
                    <span style={{ color: "#b8bb26" }}>kobiOS</span>
                    <span style={{ color: "#83a598" }}>@Sophos</span>
                    <span style={{ color: "#ebdbb2" }}>:~$</span>
                </span>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    spellCheck={false}
                    style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--color-foreground)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        caretColor: "#b8bb26",
                    }}
                />
            </div>
        </div>
    );
}
