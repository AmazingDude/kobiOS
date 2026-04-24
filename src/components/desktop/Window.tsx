import { useRef, useState, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface WindowProps {
    id: string;
    title: string;
    icon?: ReactNode;
    children: ReactNode;
    defaultPosition?: { x: number; y: number };
    defaultSize?: { w: number; h: number };
    zIndex: number;
    isActive?: boolean;
    isMinimized?: boolean;
    isTiled?: boolean;
    tiledRect?: { x: number; y: number; w: number; h: number };
    onClose: (id: string) => void;
    onMinimize: (id: string) => void;
    onFocus: (id: string) => void;
}

export function Window({
    id,
    title,
    children,
    defaultPosition = { x: 80, y: 60 },
    defaultSize = { w: 720, h: 480 },
    zIndex,
    isActive = false,
    isMinimized = false,
    isTiled = false,
    tiledRect,
    onClose,
    onMinimize,
    onFocus,
}: WindowProps) {
    const [pos, setPos] = useState(defaultPosition);
    const [size, setSize] = useState(defaultSize);
    const [isMaximized] = useState(false);
    const dragRef = useRef<{
        startX: number;
        startY: number;
        origX: number;
        origY: number;
    } | null>(null);
    const resizeRef = useRef<{
        startX: number;
        startY: number;
        origW: number;
        origH: number;
    } | null>(null);

    // Drag logic
    const handleTitleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onFocus(id);
        if (isMaximized || isTiled) return;
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: pos.x,
            origY: pos.y,
        };
    };

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if (isMaximized || isTiled) return;
        e.preventDefault();
        e.stopPropagation();
        onFocus(id);
        resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origW: size.w,
            origH: size.h,
        };
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            setPos({
                x: Math.max(0, dragRef.current.origX + dx),
                y: Math.max(28, dragRef.current.origY + dy), // don't go above topbar
            });
        };
        const onResize = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            const dx = e.clientX - resizeRef.current.startX;
            const dy = e.clientY - resizeRef.current.startY;
            setSize({
                w: Math.max(360, resizeRef.current.origW + dx),
                h: Math.max(220, resizeRef.current.origH + dy),
            });
        };
        const onUp = () => {
            dragRef.current = null;
            resizeRef.current = null;
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mousemove", onResize);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mousemove", onResize);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    useEffect(() => {
        if (!isTiled || !tiledRect) return;
        setPos({ x: tiledRect.x, y: tiledRect.y });
        setSize({ w: tiledRect.w, h: tiledRect.h });
    }, [isTiled, tiledRect]);

    return (
        <AnimatePresence propagate>
            {!isMinimized && (
                <motion.div
                    key={id}
                    className={`window-chrome glass-panel${isActive ? " active" : ""}`}
                    initial={{ opacity: 0, scale: 0.92, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{
                        opacity: 0,
                        scale: 0.85,
                        y: 40,
                        transition: { duration: 0.15, ease: "easeIn" },
                    }}
                    transition={{
                        duration: 0.18,
                        ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                    whileTap={{ scale: 0.998 }}
                    layoutId={id}
                    style={{
                        left: isTiled
                            ? (tiledRect?.x ?? 0)
                            : isMaximized
                              ? 0
                              : pos.x,
                        top: isTiled
                            ? (tiledRect?.y ?? 28)
                            : isMaximized
                              ? 28
                              : pos.y,
                        width: isTiled
                            ? (tiledRect?.w ?? size.w)
                            : isMaximized
                              ? "100vw"
                              : size.w,
                        height: isTiled
                            ? (tiledRect?.h ?? size.h)
                            : isMaximized
                              ? "calc(100vh - 28px)"
                              : size.h,
                        zIndex,
                        border: `2px solid ${isActive ? "rgba(235, 219, 178, 0.22)" : "rgba(80, 73, 69, 0.30)"}`,
                        borderRadius: 10,
                    }}
                    data-active={isActive ? "true" : "false"}
                    onMouseDown={() => onFocus(id)}
                >
                    {/* Title bar */}
                    <div
                        className="window-titlebar"
                        onMouseDown={handleTitleMouseDown}
                        style={{ background: "rgba(29, 32, 33, 0.95)" }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            <div
                                className="window-controls"
                                style={{ marginRight: 4 }}
                            >
                                <button
                                    className="window-btn window-btn-close"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose(id);
                                    }}
                                    title="Close"
                                />
                                <button
                                    className="window-btn window-btn-min"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onMinimize(id);
                                    }}
                                    title="Minimize"
                                />
                            </div>
                            <span
                                className="window-title"
                                style={{ color: "#fabd2f" }}
                            >
                                {title}
                            </span>
                        </div>

                        <div style={{ width: 1 }} />
                    </div>

                    {/* Body */}
                    <div
                        className="window-body"
                        style={{
                            padding: 0,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        {children}
                    </div>

                    {!isMaximized && !isTiled && (
                        <div
                            onMouseDown={handleResizeMouseDown}
                            style={{
                                position: "absolute",
                                right: 0,
                                bottom: 0,
                                width: 14,
                                height: 14,
                                cursor: "nwse-resize",
                                background:
                                    "linear-gradient(135deg, transparent 0 35%, rgba(168,153,132,0.35) 35% 50%, transparent 50% 65%, rgba(168,153,132,0.35) 65% 80%, transparent 80% 100%)",
                            }}
                            title="Resize"
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
