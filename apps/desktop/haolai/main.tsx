import "@phoenix/ui/styles/globals.css";
import { createRoot } from "react-dom/client";
import { App } from "./src/App";
import { installTauriDesktopBridge } from "./src/lib/tauriDesktop";

installTauriDesktopBridge();

createRoot(document.getElementById("root")!).render(<App />);
