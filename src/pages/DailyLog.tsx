import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import DatePicker from "../components/DatePicker";
import { todayStr, shiftDay } from "../time";

interface Log { id: number; log_date: string; body: string; mood: string; }
interface RecentEntry { log_date: string; mood: string; }

const MOODS: Record<string, string> = { great:"😄", good:"🙂", okay:"😐", bad:"😕", awful:"😞" };

export default function DailyLog() {
  const [date, setDate]   = useState(todayStr());
  const [body, setBody]   = useState("");
  const [mood, setMood]   = useState("");
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const { toast } = useApp();

  useEffect(() => { loadDate(date); loadRecent(); }, [date]);

  async function loadDate(d: string) {
    try {
      const db = await getDb();
      const rows = await db.select<Log[]>("SELECT * FROM daily_logs WHERE log_date=?", [d]);
      setBody(rows[0]?.body ?? "");
      setMood(rows[0]?.mood ?? "");
      setSaved(false);
    } catch (e) { toast("Load failed", String(e)); }
  }

  async function loadRecent() {
    try {
      const db = await getDb();
      const rows = await db.select<RecentEntry[]>(
        "SELECT log_date, mood FROM daily_logs ORDER BY log_date DESC LIMIT 30"
      );
      setRecent(rows);
    } catch (e) { toast("Load failed", String(e)); }
  }

  async function save() {
    try {
      const db = await getDb();
      await db.execute(
        `INSERT INTO daily_logs (log_date, body, mood) VALUES (?,?,?)
         ON CONFLICT(log_date) DO UPDATE SET body=excluded.body, mood=excluded.mood, updated_at=datetime('now')`,
        [date, body, mood]
      );
      setSaved(true);
      toast("Log saved ✓");
      await loadRecent();
    } catch (e) { toast("Save failed", String(e)); }
  }

  function shift(days: number) {
    setDate(shiftDay(date, days));
  }

  const today = todayStr();

  return (
    <div className="page" style={{ flexDirection:"row" }}>
      {/* Entry list sidebar */}
      <div style={{ width:210, borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", flexShrink:0, background:"var(--surface)" }}>
        <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--border)", fontWeight:700, fontSize:12, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em" }}>
          Entries
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {/* Always show today first, then the rest of the recent entries */}
          {[today, ...recent.map(r => r.log_date).filter(d => d !== today)].slice(0, 31).map(d => {
            const entry = recent.find(r => r.log_date === d);
            const hasEntry = !!entry;
            return (
              <div key={d} onClick={() => setDate(d)} style={{
                padding:"10px 14px",
                cursor:"pointer",
                borderBottom:"1px solid var(--border)",
                background: date === d ? "var(--surface2)" : "transparent",
                borderLeft: date === d ? "3px solid var(--accent)" : "3px solid transparent",
                display:"flex", justifyContent:"space-between", alignItems:"center",
                transition:"background 0.12s",
              }}>
                <div>
                  <div style={{ fontSize:12.5, fontWeight: date === d ? 600 : 400, color: date === d ? "var(--text)" : "var(--text-muted)" }}>
                    {d === today ? "Today" : d}
                  </div>
                  {d === today && <div style={{ fontSize:10.5, color:"var(--text-dim)" }}>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {entry?.mood && <span style={{ fontSize:13 }} title={entry.mood}>{MOODS[entry.mood]}</span>}
                  <div style={{ width:7, height:7, borderRadius:"50%", background: hasEntry ? "var(--teal)" : "var(--surface3)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Toolbar */}
        <div style={{ padding:"12px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:12, background:"var(--surface)", flexWrap:"wrap" }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
          <div style={{ width: 150 }}>
            <DatePicker value={date} onChange={v => v && setDate(v)} allowClear={false} />
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => shift(1)}><ChevronRight size={15} /></button>
          <span style={{ flex:1, color:"var(--text-muted)", fontSize:12 }}>
            {new Date(date+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
          </span>

          {/* Mood picker inline */}
          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
            {Object.entries(MOODS).map(([key, emoji]) => (
              <button key={key} className={`mood-btn ${mood===key ? "selected" : ""}`}
                onClick={() => { setMood(key); setSaved(false); }}
                title={key} style={{ fontSize:16, padding:"4px 7px" }}>
                {emoji}
              </button>
            ))}
          </div>

          {date !== today && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Today</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={save}>
            {saved ? <><Check size={13} /> Saved</> : "Save"}
          </button>
        </div>

        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); setSaved(false); }}
          placeholder={`What did you do on ${date}?\n\nWrite anything — tasks completed, wins, blockers, thoughts, things learned...`}
          style={{
            flex:1, border:"none", background:"transparent",
            padding:"28px 32px", fontSize:14.5, lineHeight:1.9,
            resize:"none",
          }}
        />

        {/* Bottom bar */}
        <div style={{ padding:"8px 20px", borderTop:"1px solid var(--border)", display:"flex", gap:12, alignItems:"center", background:"var(--surface)" }}>
          <span style={{ fontSize:11, color:"var(--text-dim)" }}>{body.length} chars · {body.split(/\s+/).filter(Boolean).length} words</span>
          {mood && <span style={{ fontSize:12, color:"var(--text-muted)" }}>Mood: {MOODS[mood]} {mood}</span>}
        </div>
      </div>
    </div>
  );
}
