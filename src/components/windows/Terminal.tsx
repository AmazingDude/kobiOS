import { useState, useRef, useEffect } from "react";
import { useKernelStore } from "../../store/kernelStore";
import type {
    SchedulerAlgorithm,
    PageReplacementPolicy,
    ThreadState,
} from "../../types";

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
        spawnThread,
        setThreadState,
        tickThreads,
        ragAllocate,
        ragRequest,
        ragRelease,
        detectDeadlock,
        resetRAG,
        loadDeadlockExample,
        runExperimentSuite,
        setMemoryPolicy,
    } = store;

    const HELP = `
Available commands:

  process / scheduling
    spawn <name> <burst> [priority] [arrival]   create a process
    kill <pid>                                  terminate a process
    ps                                          list all processes
    scheduler <FCFS|RR|PRIORITY_RR|SRJF> [q]    change algorithm
    aging <on|off>                              toggle priority aging (PRIORITY_RR)
    run                                         run scheduler simulation
    gantt                                       show last gantt chart
    metrics                                     show last scheduler metrics (incl. RT)

  threads
    threads [pid]                               list threads (all or for pid)
    tspawn <pid> [name]                         spawn a new thread inside a process
    ttick <pid>                                 advance the running thread of a process
    tstate <tid> <ready|running|waiting|terminated>
                                                set a thread's state

  memory
    mempolicy <FIFO|LRU|OPTIMAL|CLOCK>          set page-replacement policy

  deadlock (resource allocation graph)
    rag alloc <pid> <resource>                  allocate resource to process
    rag req <pid> <resource>                    process requests resource
    rag release <pid> <resource>                process releases resource
    rag detect                                  run cycle detection
    rag example                                 load classic 4-process circular wait
    rag reset                                   clear the RAG

  experiments
    bench [quantum]                             run all algorithms x all workloads
    bench show [metric]                         show comparison table

  misc
    reset                                       reset everything
    clear                                       clear terminal
    exit                                        philosophical shutdown attempt
    neofetch                                    show kobiOS system info
    help                                        this help text
    uname                                       system info
    uptime                                      fake uptime
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
                    ...schedulerConfig,
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
                            `  avg response time:   ${metrics.averageResponseTime.toFixed(3)}`,
                            `  cpu utilization:     ${metrics.cpuUtilization.toFixed(1)}%`,
                            `  throughput:          ${metrics.throughput.toFixed(4)}/tick`,
                            `  total time:          ${metrics.totalTime}`,
                        ].join("\n"),
                    },
                ];
            }

            case "aging": {
                const arg = parts[1]?.toLowerCase();
                if (arg !== "on" && arg !== "off")
                    return [{ type: "error", text: "usage: aging <on|off>" }];
                setSchedulerConfig({
                    ...schedulerConfig,
                    priorityAging: arg === "on",
                });
                return [
                    {
                        type: "system",
                        text: `[OK] priority aging ${arg.toUpperCase()} (threshold=${schedulerConfig.agingThreshold})`,
                    },
                ];
            }

            case "threads": {
                const filterPid = parts[1] ? parseInt(parts[1]) : undefined;
                const all = useKernelStore.getState().threads;
                const list =
                    filterPid !== undefined && !isNaN(filterPid)
                        ? all.filter((t) => t.pid === filterPid)
                        : all;
                if (list.length === 0)
                    return [{ type: "output", text: "no threads" }];
                const header =
                    "TID  PID  NAME              STATE        PRI  PC    SP    r0  r1";
                const rows = list.map(
                    (t) =>
                        `${String(t.tid).padEnd(4)} ${String(t.pid).padEnd(4)} ${t.name.padEnd(17)} ${t.state.padEnd(12)} ${String(t.priority).padEnd(4)} ${String(t.programCounter).padEnd(5)} ${String(t.stackPointer).padEnd(5)} ${String(t.registers.r0 ?? 0).padEnd(3)} ${t.registers.r1 ?? 0}`,
                );
                return [{ type: "output", text: [header, ...rows].join("\n") }];
            }

            case "tspawn": {
                const pid = parseInt(parts[1]);
                if (isNaN(pid))
                    return [
                        {
                            type: "error",
                            text: "usage: tspawn <pid> [name]",
                        },
                    ];
                const proc = processes.find((p) => p.pid === pid);
                if (!proc)
                    return [
                        {
                            type: "error",
                            text: `tspawn: no process with PID ${pid}`,
                        },
                    ];
                const name = parts.slice(2).join(" ") || undefined;
                spawnThread(pid, name);
                const newCount =
                    useKernelStore
                        .getState()
                        .threads.filter((t) => t.pid === pid).length;
                return [
                    {
                        type: "system",
                        text: `[OK] thread spawned in PID ${pid} (now ${newCount} threads)`,
                    },
                ];
            }

            case "ttick": {
                const pid = parseInt(parts[1]);
                if (isNaN(pid))
                    return [{ type: "error", text: "usage: ttick <pid>" }];
                tickThreads(pid);
                const running = useKernelStore
                    .getState()
                    .threads.find(
                        (t) => t.pid === pid && t.state === "running",
                    );
                return [
                    {
                        type: "system",
                        text: running
                            ? `[OK] tick PID ${pid}: TID ${running.tid} (${running.name}) PC=${running.programCounter} r0=${running.registers.r0 ?? 0}`
                            : `[OK] tick PID ${pid}: no running thread`,
                    },
                ];
            }

            case "tstate": {
                const tid = parseInt(parts[1]);
                const state = parts[2] as ThreadState;
                const valid: ThreadState[] = [
                    "ready",
                    "running",
                    "waiting",
                    "terminated",
                ];
                if (isNaN(tid) || !valid.includes(state))
                    return [
                        {
                            type: "error",
                            text: "usage: tstate <tid> <ready|running|waiting|terminated>",
                        },
                    ];
                setThreadState(tid, state);
                return [
                    {
                        type: "system",
                        text: `[OK] TID ${tid} -> ${state}`,
                    },
                ];
            }

            case "mempolicy": {
                const policy = parts[1]?.toUpperCase() as PageReplacementPolicy;
                const valid: PageReplacementPolicy[] = [
                    "FIFO",
                    "LRU",
                    "OPTIMAL",
                    "CLOCK",
                ];
                if (!valid.includes(policy))
                    return [
                        {
                            type: "error",
                            text: "usage: mempolicy <FIFO|LRU|OPTIMAL|CLOCK>",
                        },
                    ];
                setMemoryPolicy(policy);
                const note =
                    policy === "OPTIMAL"
                        ? " (live mode falls back to LRU; full OPTIMAL runs in bench/memory simulator)"
                        : "";
                return [
                    {
                        type: "system",
                        text: `[OK] page replacement policy = ${policy}${note}`,
                    },
                ];
            }

            case "rag": {
                const sub = parts[1]?.toLowerCase();
                switch (sub) {
                    case "alloc": {
                        const pid = parseInt(parts[2]);
                        const res = parts[3];
                        if (isNaN(pid) || !res)
                            return [
                                {
                                    type: "error",
                                    text: "usage: rag alloc <pid> <resource>",
                                },
                            ];
                        ragAllocate(pid, res);
                        return [
                            {
                                type: "system",
                                text: `[OK] ${res} -> PID ${pid}`,
                            },
                        ];
                    }
                    case "req":
                    case "request": {
                        const pid = parseInt(parts[2]);
                        const res = parts[3];
                        if (isNaN(pid) || !res)
                            return [
                                {
                                    type: "error",
                                    text: "usage: rag req <pid> <resource>",
                                },
                            ];
                        ragRequest(pid, res);
                        return [
                            {
                                type: "system",
                                text: `[OK] PID ${pid} requests ${res}`,
                            },
                        ];
                    }
                    case "release": {
                        const pid = parseInt(parts[2]);
                        const res = parts[3];
                        if (isNaN(pid) || !res)
                            return [
                                {
                                    type: "error",
                                    text: "usage: rag release <pid> <resource>",
                                },
                            ];
                        ragRelease(pid, res);
                        return [
                            {
                                type: "system",
                                text: `[OK] PID ${pid} releases ${res}`,
                            },
                        ];
                    }
                    case "detect": {
                        const result = detectDeadlock();
                        const lines: Line[] = [
                            {
                                type: result.deadlocked ? "error" : "system",
                                text: result.deadlocked
                                    ? "[!] DEADLOCK DETECTED"
                                    : "[OK] system is in a SAFE state",
                            },
                            { type: "output", text: `   ${result.explanation}` },
                        ];
                        if (result.deadlocked && result.victimPid !== null) {
                            lines.push({
                                type: "output",
                                text: `   suggested victim: PID ${result.victimPid}`,
                            });
                        }
                        return lines;
                    }
                    case "example": {
                        loadDeadlockExample();
                        return [
                            {
                                type: "system",
                                text: "[OK] loaded classic 4-process circular wait — try 'rag detect'",
                            },
                        ];
                    }
                    case "reset": {
                        resetRAG();
                        return [{ type: "system", text: "[OK] RAG cleared" }];
                    }
                    default:
                        return [
                            {
                                type: "error",
                                text: "usage: rag <alloc|req|release|detect|example|reset> ...",
                            },
                        ];
                }
            }

            case "bench":
            case "experiment": {
                const sub = parts[1]?.toLowerCase();
                if (sub === "show") {
                    const exp = useKernelStore.getState().latestExperiment;
                    if (!exp)
                        return [
                            {
                                type: "error",
                                text: "no experiment results — run 'bench' first",
                            },
                        ];
                    const metric = (parts[2] ?? "wait").toLowerCase();
                    const labels: Record<string, string> = {
                        wait: "AvgWait",
                        turn: "AvgTurn",
                        rt: "AvgRT",
                        cpu: "CPU%",
                        tput: "Tput",
                    };
                    const label = labels[metric] ?? "AvgWait";
                    const workloadIds: string[] = [];
                    const workloadLabels = new Map<string, string>();
                    for (const r of exp.rows) {
                        if (!workloadLabels.has(r.workloadId)) {
                            workloadLabels.set(r.workloadId, r.workloadLabel);
                            workloadIds.push(r.workloadId);
                        }
                    }
                    const algos = Array.from(
                        new Set(exp.rows.map((r) => r.algorithm)),
                    );
                    const lines = [
                        `experiment: ${label}  (lower is better for wait/turn/rt; higher for cpu/tput)`,
                        `workload         | ${algos.map((a) => a.padEnd(12)).join(" ")}`,
                        `-`.repeat(20 + algos.length * 13),
                    ];
                    for (const wid of workloadIds) {
                        const cells = algos.map((a) => {
                            const row = exp.rows.find(
                                (r) =>
                                    r.workloadId === wid && r.algorithm === a,
                            );
                            if (!row) return "-".padEnd(12);
                            const m = row.metrics;
                            const v =
                                metric === "wait"
                                    ? m.averageWaitingTime
                                    : metric === "turn"
                                      ? m.averageTurnaroundTime
                                      : metric === "rt"
                                        ? m.averageResponseTime
                                        : metric === "cpu"
                                          ? m.cpuUtilization
                                          : m.throughput;
                            return v.toFixed(3).padEnd(12);
                        });
                        const label2 = workloadLabels.get(wid) ?? wid;
                        lines.push(`${label2.padEnd(16)} | ${cells.join(" ")}`);
                    }
                    return [{ type: "output", text: lines.join("\n") }];
                }
                const quantum = parseInt(parts[1] ?? "");
                const q = isNaN(quantum)
                    ? schedulerConfig.timeQuantum
                    : quantum;
                const exp = runExperimentSuite(q);
                const workloadCount = new Set(
                    exp.rows.map((r) => r.workloadId),
                ).size;
                const algoCount = new Set(exp.rows.map((r) => r.algorithm))
                    .size;
                return [
                    {
                        type: "system",
                        text: `[OK] ran ${algoCount} algos x ${workloadCount} workloads (q=${q}, ${exp.rows.length} rows)`,
                    },
                    {
                        type: "output",
                        text: `     try 'bench show wait' | 'bench show rt' | 'bench show cpu' | 'bench show tput'`,
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
