import { useEffect, useRef, useState } from "react";
import { Search, NotebookPen, CheckSquare, DollarSign, CalendarDays, Folder } from "lucide-react";
import { getDb } from "../db";

type Page = "dashboard"|"notes"|"todos"|"calendar"|"habits"|"daily"|"finance"|"projects"|"settings";

interface Props { open: boolean; onClose: () => void; onNavigate: (p: Page) => void; }

interface Result {
  kind: "note"|"todo"|"transaction"|"log"|"project";
  id: number;
  title: string;
  subtitle?: string;
  date?: string;
}

export default function GlobalSearch({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => runSearch(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  async function runSearch(q: string) {
    try {
      const db = await getDb();
      const like = `%${q}%`;
      const [notes, todos, txs, logs, projects] = await Promise.all([
        db.select<{id:number;title:string;body:string;updated_at:string}[]>(
          "SELECT id,title,body,updated_at FROM notes WHERE title LIKE ? OR body LIKE ? OR tags LIKE ? ORDER BY updated_at DESC LIMIT 6",
          [like, like, like]
        ),
        db.select<{id:number;title:string;done:number;due_date:string|null}[]>(
          "SELECT id,title,done,due_date FROM todos WHERE title LIKE ? OR project LIKE ? ORDER BY done ASC, due_date ASC LIMIT 6",
          [like, like]
        ),
        db.select<{id:number;description:string;category:string;amount:number;type:string;tx_date:string}[]>(
          "SELECT id,description,category,amount,type,tx_date FROM transactions WHERE description LIKE ? OR category LIKE ? ORDER BY tx_date DESC LIMIT 6",
          [like, like]
        ),
        db.select<{id:number;log_date:string;body:string}[]>(
          "SELECT id,log_date,body FROM daily_logs WHERE body LIKE ? ORDER BY log_date DESC LIMIT 4",
          [like]
        ),
        db.select<{id:number;name:string;description:string}[]>(
          "SELECT id,name,description FROM projects WHERE name LIKE ? OR description LIKE ? LIMIT 4",
          [like, like]
        ),
      ]);

      const out: Result[] = [];
      const stripBody = (b: string) =>
        b.replace(/!\[[^\]]*\]\([^)]+\)/g, "📷")
         .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
         .replace(/[#*`>_~]+/g, "")
         .replace(/\s+/g, " ").trim().slice(0, 80);

      for (const n of notes) {
        out.push({ kind:"note", id:n.id, title:n.title || "Untitled", subtitle: stripBody(n.body), date: n.updated_at.slice(0,10) });
      }
      for (const t of todos) {
        out.push({ kind:"todo", id:t.id, title:t.title, subtitle: t.done ? "✓ Done" : (t.due_date ? `Due ${t.due_date}` : "Pending"), date: t.due_date || undefined });
      }
      for (const t of txs) {
        out.push({ kind:"transaction", id:t.id, title:`${t.type === "income" ? "+" : "-"}$${t.amount.toFixed(2)} · ${t.category || "Uncategorized"}`, subtitle: t.description, date:t.tx_date });
      }
      for (const l of logs) {
        out.push({ kind:"log", id:l.id, title:`Daily log: ${l.log_date}`, subtitle: l.body.slice(0, 80) });
      }
      for (const p of projects) {
        out.push({ kind:"project", id:p.id, title:p.name, subtitle:p.description });
      }
      setResults(out);
      setActiveIdx(0);
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  function pick(r: Result) {
    onClose();
    if (r.kind === "note")        onNavigate("notes");
    if (r.kind === "todo")        onNavigate("todos");
    if (r.kind === "transaction") onNavigate("finance");
    if (r.kind === "log")         onNavigate("daily");
    if (r.kind === "project")     onNavigate("projects");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(results.length-1, i+1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(0, i-1)); }
    if (e.key === "Enter" && results[activeIdx]) pick(results[activeIdx]);
  }

  if (!open) return null;

  const iconFor = (k: Result["kind"]) => {
    if (k === "note")        return <NotebookPen size={14} />;
    if (k === "todo")        return <CheckSquare size={14} />;
    if (k === "transaction") return <DollarSign size={14} />;
    if (k === "log")         return <CalendarDays size={14} />;
    return <Folder size={14} />;
  };

  const labelFor = (k: Result["kind"]) => {
    if (k === "note") return "NOTE";
    if (k === "todo") return "TASK";
    if (k === "transaction") return "TX";
    if (k === "log") return "LOG";
    return "PROJ";
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()} onKeyDown={onKey}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"4px 4px 12px", borderBottom:"1px solid var(--border)" }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search notes, tasks, transactions, logs, projects…"
            style={{ flex:1, fontSize:14, background:"transparent", border:"none", padding:"6px 0", boxShadow:"none" }}
          />
          <span style={{ fontSize:10, color:"var(--text-dim)", padding:"2px 6px", border:"1px solid var(--border2)", borderRadius:4 }}>ESC</span>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:2, maxHeight:420, overflowY:"auto", marginTop:8 }}>
          {!query.trim() && (
            <div style={{ padding:"30px 10px", textAlign:"center", color:"var(--text-dim)", fontSize:12 }}>
              Type to search across everything. <kbd style={{ background:"var(--surface3)", padding:"2px 5px", borderRadius:3, fontSize:10 }}>↑↓</kbd> to navigate, <kbd style={{ background:"var(--surface3)", padding:"2px 5px", borderRadius:3, fontSize:10 }}>↵</kbd> to open.
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div style={{ padding:"30px 10px", textAlign:"center", color:"var(--text-dim)", fontSize:12 }}>
              No matches found.
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.kind}-${r.id}`}
              onClick={() => pick(r)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"10px 12px",
                borderRadius:8,
                cursor:"pointer",
                background: i === activeIdx ? "var(--surface2)" : "transparent",
                borderLeft: i === activeIdx ? `3px solid var(--accent)` : "3px solid transparent",
              }}
            >
              <div style={{ color:"var(--text-muted)", display:"flex" }}>{iconFor(r.kind)}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.title}</div>
                {r.subtitle && (
                  <div style={{ fontSize:11, color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:2 }}>
                    {r.subtitle}
                  </div>
                )}
              </div>
              <span style={{ fontSize:9.5, color:"var(--text-dim)", padding:"2px 6px", background:"var(--surface3)", borderRadius:4, fontWeight:700, letterSpacing:"0.05em" }}>
                {labelFor(r.kind)}
              </span>
              {r.date && (
                <span style={{ fontSize:10.5, color:"var(--text-dim)" }}>{r.date}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
