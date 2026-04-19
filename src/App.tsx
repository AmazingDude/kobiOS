import { useState, useCallback } from "react";
import { BootScreen } from "./components/desktop/BootScreen";
import { Desktop } from "./components/desktop/Desktop";
import { AnimatePresence } from "framer-motion";

export default function App() {
    const [booted, setBooted] = useState(false);

    const handleBootComplete = useCallback(() => {
        setBooted(true);
    }, []);

    return (
        <AnimatePresence mode="wait">
            {booted ? (
                <Desktop key="desktop" />
            ) : (
                <BootScreen key="boot" onComplete={handleBootComplete} />
            )}
        </AnimatePresence>
    );
}
