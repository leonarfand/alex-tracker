import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption { value: string; label: string; color?: string; }

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export default function Select({ value, onChange, options, placeholder = "Select…" }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const listH = Math.min(options.length * 38 + 12, 260);
    const below = window.innerHeight - r.bottom;
    const flip = below < listH + 12 && r.top > below;
    setPos({
      left: r.left,
      top: flip ? r.top - listH - 6 : r.bottom + 6,
      width: r.width,
      flip,
    });
  }, [open, options.length]);

  const current = options.find(o => o.value === value);

  return (
    <>
      <button ref={triggerRef} type="button" className="select-trigger" onClick={() => setOpen(o => !o)}>
        {current?.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: current.color, flexShrink: 0 }} />}
        <span className={`select-value ${current ? "" : "placeholder"}`}>{current ? current.label : placeholder}</span>
        <ChevronDown size={14} style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none", color: "var(--text-muted)", flexShrink: 0 }} />
      </button>

      {open && createPortal(
        <div className="picker-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="combo-dropdown"
            style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width ?? 200, maxHeight: 260, visibility: pos ? "visible" : "hidden" }}
            onMouseDown={e => e.stopPropagation()}
          >
            {options.map(o => (
              <div key={o.value} className={`combo-item ${o.value === value ? "active" : ""}`}
                onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color, flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                {o.value === value && <Check size={13} color="var(--accent2)" />}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
