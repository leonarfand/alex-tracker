import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Check } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  allowCreate?: boolean;
}

export default function ComboBox({ value, onChange, options, placeholder, allowCreate = true }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()));
  const showCreate = allowCreate && value.trim() && !options.some(o => o.toLowerCase() === value.toLowerCase());
  const items: { kind: "opt" | "create"; label: string }[] = [
    ...filtered.map(o => ({ kind: "opt" as const, label: o })),
    ...(showCreate ? [{ kind: "create" as const, label: value }] : []),
  ];

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const listH = Math.min(items.length * 38 + 12, 240);
    const below = window.innerHeight - r.bottom;
    const flip = below < listH + 12 && r.top > below;
    setPos({ left: r.left, top: flip ? r.top - listH - 6 : r.bottom + 6, width: r.width });
  }, [open, items.length]);

  // Close on outside click (handles both the input area and the portal)
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      const pop = document.getElementById("combo-portal");
      if (pop?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function pick(item: { kind: "opt"|"create"; label: string }) {
    onChange(item.label);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActiveIdx(i => Math.min(items.length-1, i+1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(0, i-1)); }
    if (e.key === "Enter" && open && items[activeIdx]) { e.preventDefault(); pick(items[activeIdx]); }
    if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder ?? "Pick or type…"}
        style={{ width: "100%", paddingRight: 32 }}
      />
      <button
        type="button"
        onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
        style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          background: "transparent", border: "none", color: "var(--text-muted)",
          cursor: "pointer", padding: 4, display: "flex", borderRadius: 4,
        }}
      >
        <ChevronDown size={14} style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && items.length > 0 && createPortal(
        <div id="combo-portal" className="combo-dropdown"
          style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width ?? 200, maxHeight: 240, visibility: pos ? "visible" : "hidden" }}>
          {items.map((item, i) => (
            <div
              key={`${item.kind}-${item.label}-${i}`}
              onMouseDown={e => { e.preventDefault(); pick(item); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`combo-item ${activeIdx === i ? "active" : ""}`}
            >
              {item.kind === "create" ? (
                <>
                  <Plus size={12} style={{ flexShrink: 0, color: "var(--accent2)" }} />
                  <span>Create <strong>"{item.label}"</strong></span>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
                  {value === item.label && <Check size={12} color="var(--accent2)" />}
                </>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
