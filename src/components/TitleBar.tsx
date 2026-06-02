import { useEffect, useState } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Clock from "./Clock";
import { useApp } from "../App";

const appWindow = getCurrentWindow();

export default function TitleBar() {
  const [isMax, setIsMax] = useState(false);
  const { runningTimer } = useApp();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMax).catch(() => {});
    const unlistenP = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMax).catch(() => {});
    });
    return () => { unlistenP.then(fn => fn()).catch(() => {}); };
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <div className="titlebar-mark">A</div>
        <span className="titlebar-name" data-tauri-drag-region>Alex Tracker</span>
      </div>

      <div className="titlebar-center" data-tauri-drag-region>
        {runningTimer && (
          <div className="timer-pill" title="Active time entry">
            <span className="timer-dot" />
            <span>{runningTimer.projectName || "Untracked"}</span>
            <strong>{runningTimer.display}</strong>
          </div>
        )}
      </div>

      <div className="titlebar-right" data-tauri-drag-region>
        <Clock />
        <div className="titlebar-controls">
          <button onClick={() => appWindow.minimize()} title="Minimize" aria-label="Minimize">
            <Minus size={13} />
          </button>
          <button onClick={() => appWindow.toggleMaximize()} title={isMax ? "Restore" : "Maximize"} aria-label="Maximize">
            {isMax ? <Square size={11} /> : <Maximize2 size={11} />}
          </button>
          <button className="close" onClick={() => appWindow.close()} title="Close" aria-label="Close">
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
