import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

interface Props {
  value: string;          // "HH:MM" (24-hour)
  onChange: (v: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export default function TimePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const [hStr, mStr] = (value || "09:00").split(":");
  const h = parseInt(hStr ?? "9", 10) || 0;
  const m = parseInt(mStr ?? "0", 10) || 0;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const panelH = 290;
    const below = window.innerHeight - r.bottom;
    const top = below < panelH && r.top > panelH ? r.top - panelH - 6 : r.bottom + 6;
    setPos({ left: r.left, top, width: Math.max(r.width, 220) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      hourRef.current?.querySelector<HTMLElement>(".tp-sel")?.scrollIntoView({ block: "center" });
      minRef.current?.querySelector<HTMLElement>(".tp-sel")?.scrollIntoView({ block: "center" });
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const display12 = () => {
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${pad(h12)}:${pad(m)} ${ampm}`;
  };

  return (
    <>
      <button ref={triggerRef} type="button" className="select-trigger" onClick={() => setOpen(o => !o)}>
        <Clock size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className="select-value" style={{ fontVariantNumeric: "tabular-nums" }}>{display12()}</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{pad(h)}:{pad(m)}</span>
      </button>

      {open && createPortal(
        <div className="picker-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="picker-pop"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width ?? 220, visibility: pos ? "visible" : "hidden" }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="tp-headline">
              <Clock size={13} color="var(--accent2)" />
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{display12()}</span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "0 8px" }}>
              <div ref={hourRef} className="tp-col">
                <div className="tp-head">Hour</div>
                {HOURS.map(hh => (
                  <div key={hh} className={`tp-item ${hh === h ? "tp-sel" : ""}`}
                    onClick={() => onChange(`${pad(hh)}:${pad(m)}`)}>{pad(hh)}</div>
                ))}
              </div>
              <div ref={minRef} className="tp-col">
                <div className="tp-head">Minute</div>
                {MINUTES.map(mm => (
                  <div key={mm} className={`tp-item ${mm === m ? "tp-sel" : ""}`}
                    onClick={() => onChange(`${pad(h)}:${pad(mm)}`)}>{pad(mm)}</div>
                ))}
              </div>
            </div>
            <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
              <button type="button" className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }}
                onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
