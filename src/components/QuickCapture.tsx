import { useEffect, useRef, useState } from "react";
import { CheckSquare, NotebookPen, DollarSign, Zap } from "lucide-react";
import { getDb } from "../db";
import { sounds } from "../sounds";
import { todayStr } from "../time";

interface Props { open: boolean; onClose: () => void; onToast: (t: string, b?: string) => void; }

type Mode = "task" | "note" | "expense" | "income";

export default function QuickCapture({ open, onClose, onToast }: Props) {
  const [mode, setMode] = useState<Mode>("task");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setAmount("");
      setMode("task");
      setTimeout(() => (mode === "note" ? textareaRef : inputRef).current?.focus(), 50);
    }
  }, [open]);

  async function submit() {
    if (!text.trim() && mode !== "expense" && mode !== "income") return;
    try {
      const db = await getDb();
      if (mode === "task") {
        await db.execute("INSERT INTO todos (title, priority) VALUES (?, 'medium')", [text]);
        sounds.success();
        onToast("Task added", text);
      } else if (mode === "note") {
        await db.execute("INSERT INTO notes (title, body) VALUES (?, ?)", [text.slice(0, 60), text]);
        sounds.success();
        onToast("Note saved");
      } else {
        const amt = parseFloat(amount.replace(/\D/g, ""));
        if (!amt || amt <= 0) { onToast("Enter an amount"); return; }
        await db.execute(
          "INSERT INTO transactions (type, amount, description, tx_date) VALUES (?,?,?,?)",
          [mode, amt, text, todayStr()]
        );
        sounds.success();
        onToast(`${mode === "income" ? "Income" : "Expense"} recorded`);
      }
      onClose();
    } catch (e) {
      onToast("Failed", String(e));
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey || mode !== "note")) {
      e.preventDefault();
      submit();
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520, marginTop: "-15vh", padding: 18 }} onKeyDown={onKey}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <Zap size={12} /> Quick Capture
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {([
            { id: "task" as Mode, label: "Task", icon: CheckSquare },
            { id: "note" as Mode, label: "Note", icon: NotebookPen },
            { id: "expense" as Mode, label: "Expense", icon: DollarSign },
            { id: "income" as Mode, label: "Income", icon: DollarSign },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`btn btn-sm ${mode === id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode(id)} style={{ flex: 1, justifyContent: "center" }}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {(mode === "expense" || mode === "income") && (
          <input
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="Amount"
            inputMode="numeric"
            style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 600 }}
          />
        )}

        {mode === "note" ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Capture a thought… (Ctrl+Enter to save)"
            rows={5}
            style={{ resize: "vertical", lineHeight: 1.6 }}
          />
        ) : (
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              mode === "task" ? "What needs to be done?" :
              mode === "expense" ? "What was it for?" :
              "Where did it come from?"
            }
          />
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
            <kbd style={{ background: "var(--surface3)", padding: "2px 5px", borderRadius: 3 }}>Esc</kbd> close · <kbd style={{ background: "var(--surface3)", padding: "2px 5px", borderRadius: 3 }}>{mode === "note" ? "Ctrl+↵" : "↵"}</kbd> save
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={submit}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
