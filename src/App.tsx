import { useState, useCallback } from "react";
import { BootScreen } from "./components/desktop/BootScreen";
import { Desktop } from "./components/desktop/Desktop";

export default function App() {
  const [booted, setBooted] = useState(false);

  const handleBootComplete = useCallback(() => {
    setBooted(true);
  }, []);

  return booted ? (
    <Desktop />
  ) : (
    <BootScreen onComplete={handleBootComplete} />
  );
}
