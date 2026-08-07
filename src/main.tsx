import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerStaleBuildRecovery } from "@/lib/lazyImportRecovery";
import "./index.css";

registerStaleBuildRecovery();

createRoot(document.getElementById("root")!).render(<App />);
