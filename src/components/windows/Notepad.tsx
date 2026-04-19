import { useState } from "react";

const PLACEHOLDER = `# kobiOS Notepad
# Spring 2026 - CS-330 CEP

Notes go here...
`;

export function Notepad() {
    const [content, setContent] = useState(PLACEHOLDER);
    const lines = content.split("\n").length;
    const words = content.trim().split(/\s+/).filter(Boolean).length;

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                fontFamily: "var(--font-mono)",
                background: "rgba(29, 32, 33, 0.82)",
                backdropFilter: "blur(12px)",
            }}
        >
            {/* Toolbar */}
            <div
                style={{
                    padding: "5px 12px",
                    borderBottom: "1px solid var(--color-panel-border)",
                    display: "flex",
                    gap: 16,
                    fontSize: 9,
                    color: "var(--color-muted)",
                    background: "rgba(20, 22, 23, 0.6)",
                    flexShrink: 0,
                    letterSpacing: "0.1em",
                }}
            >
                <span>NOTEPAD</span>
                <span style={{ color: "var(--color-subtle)" }}>|</span>
                <span>
                    lines: <span style={{ color: "#8ec07c" }}>{lines}</span>
                </span>
                <span>
                    words: <span style={{ color: "#83a598" }}>{words}</span>
                </span>
                <span>
                    chars:{" "}
                    <span style={{ color: "#d3869b" }}>{content.length}</span>
                </span>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Line numbers */}
                <div
                    style={{
                        width: 40,
                        padding: "10px 0",
                        background: "rgba(20, 22, 23, 0.4)",
                        borderRight: "1px solid var(--color-panel-border)",
                        flexShrink: 0,
                        overflowY: "hidden",
                        textAlign: "right",
                        paddingRight: 8,
                        fontSize: 11,
                        lineHeight: "1.6",
                        color: "var(--color-subtle)",
                        userSelect: "none",
                    }}
                >
                    {Array.from({ length: lines }, (_, i) => (
                        <div key={i}>{i + 1}</div>
                    ))}
                </div>

                {/* Textarea */}
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    style={{
                        flex: 1,
                        padding: "10px 14px",
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        resize: "none",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        lineHeight: "1.6",
                        color: "var(--color-foreground)",
                        caretColor: "#fabd2f",
                    }}
                />
            </div>

            {/* Footer */}
            <div
                style={{
                    padding: "4px 12px",
                    borderTop: "1px solid var(--color-panel-border)",
                    fontSize: 9,
                    color: "var(--color-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    background: "rgba(20, 22, 23, 0.6)",
                    flexShrink: 0,
                }}
            >
                <span>UTF-8</span>
                <span>kobiOS Notepad</span>
            </div>
        </div>
    );
}
