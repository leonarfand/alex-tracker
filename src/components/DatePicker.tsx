import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  value: string;                 // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function DatePicker({ value, onChange, placeholder = "Pick a date", allowClear = true }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const selected = value ? new Date(value + "T00:00:00") : null;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  const [viewY, setViewY] = useState(selected ? selected.getFullYear() : today.getFullYear());
  const [viewM, setViewM] = useState(selected ? selected.getMonth() : today.getMonth());

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    if (selected) { setViewY(selected.getFullYear()); setViewM(selected.getMonth()); }
    const r = triggerRef.current.getBoundingClientRect();
    const panelH = 320, panelW = 268;
    const below = window.innerHeight - r.bottom;
    const top = below < panelH && r.top > panelH ? r.top - panelH - 6 : r.bottom + 6;
    let left = r.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    setPos({ left: Math.max(8, left), top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function shift(delta: number) {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  }

  function buildCells() {
    const firstDay = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(`${viewY}-${pad(viewM+1)}-${pad(d)}`);
    return cells;
  }

  const display = selected
    ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <>
      <button ref={triggerRef} type="button" className="select-trigger" onClick={() => setOpen(o => !o)}>
        <Calendar size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span className={`select-value ${selected ? "" : "placeholder"}`}>{display || placeholder}</span>
      </button>

      {open && createPortal(
        <div className="picker-backdrop" onMouseDown={() => setOpen(false)}>
          <div className="picker-pop" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: 268, padding: 12, visibility: pos ? "visible" : "hidden" }}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => shift(-1)}><ChevronLeft size={14} /></button>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{MONTHS[viewM]} {viewY}</span>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => shift(1)}><ChevronRight size={14} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text-dim)" }}>{w}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {buildCells().map((date, i) => {
                if (!date) return <div key={i} />;
                const day = parseInt(date.slice(8), 10);
                const isSel = date === value;
                const isToday = date === todayStr;
                return (
                  <button key={i} type="button" className="dp-day"
                    onClick={() => { onChange(date); setOpen(false); }}
                    style={{
                      background: isSel ? "var(--accent)" : "transparent",
                      color: isSel ? "#fff" : isToday ? "var(--accent2)" : "var(--text)",
                      fontWeight: isSel || isToday ? 700 : 400,
                      border: isToday && !isSel ? "1px solid var(--accent)" : "1px solid transparent",
                    }}>
                    {day}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(todayStr); setOpen(false); }}>Today</button>
              {allowClear && value && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
