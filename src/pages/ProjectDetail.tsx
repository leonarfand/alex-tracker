import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Check, Play, Pause, TrendingUp, TrendingDown, Clock as ClockIcon, NotebookPen, CheckSquare, Calendar, DollarSign } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { sounds } from "../sounds";
import { nowStamp } from "../time";

interface Project {
  id: number;
  name: string;
  color: string;
  description: string;
  status: string;
  deadline: string | null;
  tracks_finance?: number;
}

interface Todo { id:number; title:string; done:number; priority:string; due_date:string|null; project:string; }
interface Note { id:number; title:string; body:string; color:string; updated_at:string; }
interface Transaction { id:number; type:string; amount:number; category:string; description:string; tx_date:string; }
interface TimeEntry { id:number; started_at:string; ended_at:string|null; duration_seconds:number; note:string; }

interface Props { project: Project; onBack: () => void; }

type Tab = "overview"|"tasks"|"notes"|"finances"|"time";

const PRIO_COLOR: Record<string,string> = { high:"var(--red)", medium:"var(--amber)", low:"var(--green)" };

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ProjectDetail({ project, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const { toast, money, startTimer, stopTimer, runningTimer, openProjectFinance } = useApp();

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    try {
      const db = await getDb();
      const [t, n, x, e] = await Promise.all([
        db.select<Todo[]>("SELECT * FROM todos WHERE project=? ORDER BY done ASC, due_date ASC NULLS LAST, created_at DESC", [project.name]),
        db.select<Note[]>("SELECT * FROM notes WHERE project=? ORDER BY pinned DESC, updated_at DESC", [project.name]),
        db.select<Transaction[]>("SELECT * FROM transactions WHERE project_id=? ORDER BY tx_date DESC", [project.id]),
        db.select<TimeEntry[]>("SELECT * FROM time_entries WHERE project_id=? ORDER BY started_at DESC", [project.id]),
      ]);
      setTodos(t); setNotes(n); setTxs(x); setEntries(e);
    } catch (err) { toast("Load failed", String(err)); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    try {
      const db = await getDb();
      await db.execute("INSERT INTO todos (title, project, priority) VALUES (?,?,?)", [newTask, project.name, "medium"]);
      sounds.success();
      setNewTask("");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function toggleTask(t: Todo) {
    try {
      const db = await getDb();
      await db.execute("UPDATE todos SET done=?, completed_at=? WHERE id=?", [t.done ? 0 : 1, t.done ? null : nowStamp(), t.id]);
      if (t.done) sounds.unhit(); else sounds.hit();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function delTask(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM todos WHERE id=?", [id]);
      sounds.pop();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function addNote() {
    if (!newNoteTitle.trim() && !newNoteBody.trim()) return;
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO notes (title, body, project, color) VALUES (?,?,?,?)",
        [newNoteTitle || "Untitled", newNoteBody, project.name, "default"]
      );
      sounds.success();
      setNewNoteTitle("");
      setNewNoteBody("");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function delNote(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM notes WHERE id=?", [id]);
      sounds.pop();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  const stats = useMemo(() => {
    const income  = txs.filter(t => t.type === "income").reduce((s,t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
    const taskDone = todos.filter(t => t.done).length;
    const taskTotal = todos.length;
    const totalSeconds = entries.reduce((s, e) => s + (e.duration_seconds || 0), 0);
    return { income, expense, net: income - expense, taskDone, taskTotal, totalSeconds, pct: taskTotal === 0 ? 0 : Math.round((taskDone/taskTotal)*100) };
  }, [txs, todos, entries]);

  const isRunning = runningTimer?.projectId === project.id;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ gap: 14, borderBottom: `1px solid var(--border)`, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: project.color }} />
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginLeft: 8 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 18, flex: "unset" }}>{project.name}</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
              background: `${project.color}22`, color: project.color, textTransform: "capitalize" }}>
              {project.status === "paused" ? "On Hold" : project.status}
            </span>
          </div>
          {project.description && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {project.description}
            </div>
          )}
        </div>
        {project.tracks_finance !== 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => openProjectFinance(project.id)} title="Open this project in Finance">
            <DollarSign size={13} /> View in Finance
          </button>
        )}
        <button
          className={`btn btn-sm ${isRunning ? "btn-danger" : "btn-primary"}`}
          onClick={() => isRunning ? stopTimer() : startTimer(project.id, project.name)}
        >
          {isRunning ? <><Pause size={13} /> Stop Timer</> : <><Play size={13} /> Start Focus</>}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, padding: "8px 24px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {([
          { id: "overview" as Tab, label: "Overview" },
          { id: "tasks" as Tab, label: `Tasks (${stats.taskTotal})` },
          { id: "notes" as Tab, label: `Notes (${notes.length})` },
          { id: "finances" as Tab, label: `Finances (${txs.length})` },
          { id: "time" as Tab, label: `Time (${entries.length})` },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: "transparent", border: "none",
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.id ? 700 : 500,
              padding: "10px 14px", cursor: "pointer", fontSize: 13,
              borderBottom: tab === t.id ? `2px solid ${project.color}` : "2px solid transparent",
              marginBottom: -1,
              fontFamily: "inherit",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="page-body">

        {/* Overview */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Stat grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <StatCard icon={<CheckSquare size={14} />} label="Task Progress" value={`${stats.pct}%`} sub={`${stats.taskDone} of ${stats.taskTotal}`} color={project.color} />
              <StatCard icon={<ClockIcon size={14} />} label="Time Tracked" value={formatDuration(stats.totalSeconds)} sub={`${entries.length} ${entries.length === 1 ? "session" : "sessions"}`} color="var(--accent2)" />
              <StatCard icon={<TrendingUp size={14} />} label="Income" value={money(stats.income, 0)} sub={`${txs.filter(t=>t.type==='income').length} entries`} color="var(--green)" />
              <StatCard icon={<TrendingDown size={14} />} label="Expenses" value={money(stats.expense, 0)} sub={`${txs.filter(t=>t.type==='expense').length} entries`} color="var(--red)" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* What's left */}
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>What's left</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTab("tasks")}>View all</button>
                </div>
                {todos.filter(t => !t.done).length === 0 ? (
                  <div className="empty" style={{ padding: "16px 0" }}>
                    <div className="empty-icon">🎉</div>
                    <p>All tasks done!</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {todos.filter(t => !t.done).slice(0, 6).map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button className="check-btn" onClick={() => toggleTask(t)} style={{ width: 17, height: 17 }} />
                        <div className={`prio-dot prio-${t.priority}`} />
                        <span style={{ flex: 1, fontSize: 13 }}>{t.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent notes */}
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Recent notes</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTab("notes")}>View all</button>
                </div>
                {notes.length === 0 ? (
                  <div className="empty" style={{ padding: "16px 0" }}>
                    <div className="empty-icon">📝</div>
                    <p>No notes yet</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {notes.slice(0, 4).map(n => (
                      <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <NotebookPen size={11} color="var(--text-muted)" />
                        <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title || "Untitled"}</span>
                        <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{n.updated_at.slice(0,10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tasks tab */}
        {tab === "tasks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ display: "flex", gap: 8, padding: "12px 14px" }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)}
                placeholder="Add a task to this project…"
                onKeyDown={e => e.key === "Enter" && addTask()}
                style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={addTask}>
                <Plus size={13} /> Add
              </button>
            </div>

            {todos.length === 0 ? (
              <div className="empty"><div className="empty-icon">✅</div><p>No tasks for this project yet.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todos.map(t => (
                  <div key={t.id} className="card" style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    opacity: t.done ? 0.55 : 1,
                    borderLeft: `3px solid ${PRIO_COLOR[t.priority]}`,
                  }}>
                    <button className={`check-btn ${t.done ? "checked" : ""}`} onClick={() => toggleTask(t)}>
                      {t.done && <Check size={11} color="#fff" strokeWidth={3} />}
                    </button>
                    <span style={{ flex: 1, fontSize: 13.5,
                      textDecoration: t.done ? "line-through" : "none",
                      color: t.done ? "var(--text-muted)" : "var(--text)" }}>
                      {t.title}
                    </span>
                    {t.due_date && <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={11} /> {t.due_date}</span>}
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delTask(t.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes tab */}
        {tab === "notes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={newNoteTitle} onChange={e => setNewNoteTitle(e.target.value)}
                placeholder="Note title…" style={{ fontWeight: 600 }} />
              <textarea value={newNoteBody} onChange={e => setNewNoteBody(e.target.value)}
                placeholder="Add a quick note for this project…" rows={3} />
              <button className="btn btn-primary btn-sm" onClick={addNote} style={{ alignSelf: "flex-end" }}>
                <Plus size={13} /> Add Note
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="empty"><div className="empty-icon">📝</div><p>No notes for this project yet.</p></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {notes.map(n => (
                  <div key={n.id} className={`card sticky-card sticky-${n.color}`} style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{n.title || "Untitled"}</span>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delNote(n.id)}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap",
                        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical" }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 8 }}>
                      {n.updated_at.slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Finances tab */}
        {tab === "finances" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Header with totals + jump to the full Finance view for this project */}
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Net for this project</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: stats.net >= 0 ? "var(--green)" : "var(--red)" }}>
                  {stats.net < 0 ? "-" : "+"}{money(Math.abs(stats.net), 0)}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  <span style={{ color: "var(--green)" }}>+{money(stats.income, 0)}</span> · <span style={{ color: "var(--red)" }}>-{money(stats.expense, 0)}</span>
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openProjectFinance(project.id)}>
                <DollarSign size={13} /> Open in Finance
              </button>
            </div>
            {txs.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">💰</div>
                <p>No transactions yet for this project.</p>
                <button className="btn btn-primary btn-sm" onClick={() => openProjectFinance(project.id)} style={{ marginTop: 8 }}>
                  <DollarSign size={13} /> Add entries in Finance
                </button>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Type</th><th>Category</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map(t => (
                      <tr key={t.id}>
                        <td style={{ color: "var(--text-muted)" }}>{t.tx_date}</td>
                        <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                        <td>{t.category || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                        <td style={{ color: "var(--text-muted)" }}>{t.description || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                        <td style={{ textAlign: "right", fontWeight: 700,
                          color: t.type === "income" ? "var(--green)" : "var(--red)" }}>
                          {t.type === "income" ? "+" : "-"}{money(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Time tab */}
        {tab === "time" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Total tracked</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: project.color }}>
                  {formatDuration(stats.totalSeconds)}
                </div>
              </div>
              <button
                className={`btn ${isRunning ? "btn-danger" : "btn-primary"}`}
                onClick={() => isRunning ? stopTimer() : startTimer(project.id, project.name)}
              >
                {isRunning ? <><Pause size={14} /> Stop Timer</> : <><Play size={14} /> Start Focus Session</>}
              </button>
            </div>
            {entries.length === 0 ? (
              <div className="empty"><div className="empty-icon">⏱️</div><p>No time tracked yet.<br />Hit Start Focus Session above to begin.</p></div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Started</th><th>Ended</th><th style={{ textAlign: "right" }}>Duration</th></tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id}>
                        <td style={{ color: "var(--text-muted)" }}>{new Date(e.started_at).toLocaleString()}</td>
                        <td style={{ color: "var(--text-muted)" }}>{e.ended_at ? new Date(e.ended_at).toLocaleString() : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{formatDuration(e.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label" style={{ display: "flex", alignItems: "center", gap: 6, color }}>
        {icon} {label}
      </div>
      <div className="stat-value" style={{ color, fontSize: 22 }}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}
