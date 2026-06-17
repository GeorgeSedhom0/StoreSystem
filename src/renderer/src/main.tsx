import "./assets/main.css";
// Synthesize window.electron when running in a plain browser (web build).
// Must run before App so the boot sequence finds the IPC bridge.
import "./web-shim";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
