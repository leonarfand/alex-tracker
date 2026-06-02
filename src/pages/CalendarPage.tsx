import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Plus, CheckSquare, BookOpen, Bell, Trash2, Pencil } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import ContextMenu, { MenuItem as CtxMenuItem } from "../components/ContextMenu";
import TimePicker from "../components/TimePicker";
import DatePicker from "../components/DatePicker";
import Select from "../components/Select";
import { todayStr, nowStamp } from "../time";

type Page = "dashboard"|"notes"|"todos"|"calendar"|"habits"|"daily"|"finance"|"projects"|"goals"|"settings";

interface Props { onNavigate: (p: Page) => void; }

interface CalTodo { id:number; title:string; done:number; priority:string; due_date:string; reminder_at:string|null; }
interface EditForm { id:number; title:string; priority:string; due_date:string; remDate:string; remTime:string; }
interface DayData { hasLog: boolean; mood: string; todos: CalTodo[]; }

const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MOODS: Record<string,string> = { great:"😄", good:"🙂", okay:"😐", bad:"😕", awful:"😞" };

const PRIO_BG: Record<string,string> = {
  high:   "linear-gradient(90deg, #2d0a0a, #450a0a)",
  medium: "linear-gradient(90deg, #1c1504, #2c1f04)",
  low:    "linear-gradient(90deg, #061a14, #0a2e22)",
};
const PRIO_FG: Record<string,string> = { high:"#fca5a5", medium:"#fcd34d", low:"#6ee7b7" };
const PRIO_BAR: Record<string,string> = { high:"#f43f5e", medium:"#fbbf24", low:"#22d3a4" };

export default function CalendarPage({ onNavigate }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(todayStr());
  const [data, setData]   = useState<Record<string, DayData>>({});
  const [ctx, setCtx]     = useState<{ x: number; y: number; date: string } | null>(null);
  const [quickTaskInput, setQuickTaskInput] = useState<{ date: string; reminder: boolean } | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [edit, setEdit] = useState<EditForm | null>(null);
  const { toast, confirm } = useApp();

  function openEdit(t: CalTodo) {
    const [rd, rt] = (t.reminder_at || "").split("T");
    setEdit({
      id: t.id,
      title: t.title,
      priority: t.priority,
      due_date: t.due_date,
      remDate: rd || "",
      remTime: (rt || "09:00").slice(0, 5),
    });
  }

  async function saveEdit() {
    if (!edit || !edit.title.trim()) return;
    try {
      const db = await getDb();
      const reminderAt = edit.remDate ? `${edit.remDate}T${edit.remTime}:00` : null;
      await db.execute(
        "UPDATE todos SET title=?, priority=?, due_date=?, reminder_at=?, reminder_fired=0 WHERE id=?",
        [edit.title, edit.priority, edit.due_date || null, reminderAt, edit.id]
      );
      toast("Task updated");
      setEdit(null);
      await loadMonth();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function deleteEditTask() {
    if (!edit) return;
    const ok = await confirm({ title: "Delete this task?", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM todos WHERE id=?", [edit.id]);
      toast("Task deleted");
      setEdit(null);
      await loadMonth();
    } catch (e) { toast("Failed", String(e)); }
  }

  useEffect(() => { loadMonth(); }, [year, month]);

  async function quickAddTask() {
    if (!quickTaskInput || !quickTaskTitle.trim()) return;
    const { date, reminder } = quickTaskInput;
    try {
      const db = await getDb();
      if (reminder) {
        const reminderAt = `${date}T${reminderTime}:00`;
        await db.execute(
          "INSERT INTO todos (title, due_date, reminder_at, priority) VALUES (?,?,?,?)",
          [quickTaskTitle, date, reminderAt, "medium"]
        );
        toast("Reminder set", `${date} at ${reminderTime}`);
      } else {
        await db.execute("INSERT INTO todos (title, due_date, priority) VALUES (?,?,?)", [quickTaskTitle, date, "medium"]);
        toast("Task added", date);
      }
      setQuickTaskInput(null);
      setQuickTaskTitle("");
      await loadMonth();
    } catch (e) { toast("Failed", String(e)); }
  }

  function dayMenuItems(date: string): CtxMenuItem[] {
    return [
      {
        label: "Add task on this day",
        icon: <CheckSquare size={13} />,
        onClick: () => { setQuickTaskInput({ date, reminder: false }); setQuickTaskTitle(""); },
      },
      {
        label: "Set reminder",
        icon: <Bell size={13} />,
        onClick: () => { setQuickTaskInput({ date, reminder: true }); setQuickTaskTitle(""); },
      },
      {
        label: "Write daily log",
        icon: <BookOpen size={13} />,
        onClick: () => onNavigate("daily"),
      },
    ];
  }

  async function loadMonth() {
    try {
      const db = await getDb();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ym = `${year}-${pad(month+1)}`;

      const [logs, todos] = await Promise.all([
        db.select<{log_date:string; mood:string}[]>(
          "SELECT log_date, mood FROM daily_logs WHERE strftime('%Y-%m', log_date) = ?", [ym]
        ),
        db.select<CalTodo[]>(
          "SELECT id,title,done,priority,due_date,reminder_at FROM todos WHERE strftime('%Y-%m', due_date) = ?", [ym]
        ),
      ]);

      const map: Record<string, DayData> = {};
      const ensure = (d: string) => { if (!map[d]) map[d] = { hasLog:false, mood:"", todos:[] }; };
      for (const l of logs) {
        ensure(l.log_date);
        map[l.log_date].hasLog = true;
        map[l.log_date].mood = l.mood;
      }
      for (const t of todos) {
        ensure(t.due_date);
        map[t.due_date].todos.push(t);
      }
      setData(map);
    } catch (e) { toast("Load failed", String(e)); }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function buildGrid() {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const cells: { date: string; day: number; current: boolean }[] = [];
    const pad = (n: number) => String(n).padStart(2, "0");

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      cells.push({ date:`${y}-${pad(m)}-${pad(d)}`, day:d, current:false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date:`${year}-${pad(month+1)}-${pad(d)}`, day:d, current:true });
    }
    const rem = 42 - cells.length;
    for (let d = 1; d <= rem; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      cells.push({ date:`${y}-${pad(m)}-${pad(d)}`, day:d, current:false });
    }
    return cells;
  }

  const today = todayStr();
  const cells = buildGrid();
  const selData = data[selected];

  async function toggleTodo(id: number, done: number) {
    try {
      const db = await getDb();
      await db.execute("UPDATE todos SET done=?, completed_at=? WHERE id=?",
        [done ? 0 : 1, done ? null : nowStamp(), id]);
      await loadMonth();
    } catch (e) { toast("Failed", String(e)); }
  }

  return (
    <div className="page" style={{ flexDirection:"row" }}>
      {/* Calendar grid */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        <div className="page-header">
          <button className="btn btn-ghost btn-icon" onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
          <h1 style={{ flex:"unset", textAlign:"center", minWidth:160 }}>{MONTHS[month]} {year}</h1>
          <button className="btn btn-ghost btn-icon" onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today); }}>
            Today
          </button>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:14, fontSize:11, color:"var(--text-muted)", flexWrap:"wrap" }}>
            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:9, height:3, borderRadius:1, background:"var(--red)" }} /> High
            </span>
            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:9, height:3, borderRadius:1, background:"var(--amber)" }} /> Medium
            </span>
            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:9, height:3, borderRadius:1, background:"var(--green)" }} /> Low
            </span>
          </div>
        </div>

        <div className="page-body" style={{ paddingBottom:24 }}>
          {/* Weekday header */}
          <div className="cal-grid" style={{ marginBottom:6 }}>
            {WEEKDAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          </div>
          {/* Cells */}
          <div className="cal-grid">
            {cells.map(cell => {
              const d = data[cell.date];
              const isToday    = cell.date === today;
              const isSelected = cell.date === selected;
              const tasks = d?.todos ?? [];
              const visible = tasks.slice(0, 3);
              const overflow = tasks.length - visible.length;
              return (
                <div key={cell.date}
                  className={`cal-cell ${!cell.current ? "other-month" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelected(cell.date)}
                  onContextMenu={e => { e.preventDefault(); setSelected(cell.date); setCtx({ x: e.clientX, y: e.clientY, date: cell.date }); }}
                >
                  <div className="cal-cell-top">
                    <div className="cal-cell-num">{cell.day}</div>
                    {d?.mood && <span style={{ fontSize:11 }}>{MOODS[d.mood]}</span>}
                    {d?.hasLog && !d.mood && <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--teal)" }} title="Has daily log" />}
                  </div>
                  <div className="cal-cell-events">
                    {visible.map(t => (
                      <div key={t.id} className="cal-event"
                        title="Click to edit"
                        onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                        style={{
                        background: t.done ? "var(--surface3)" : PRIO_BG[t.priority] ?? PRIO_BG.medium,
                        color: t.done ? "var(--text-muted)" : PRIO_FG[t.priority] ?? PRIO_FG.medium,
                        borderLeftColor: t.done ? "var(--green)" : PRIO_BAR[t.priority] ?? PRIO_BAR.medium,
                        textDecoration: t.done ? "line-through" : "none",
                        cursor: "pointer",
                      }}>
                        {t.done && <Check size={8} strokeWidth={3} />}
                        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="cal-event-more">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      <div style={{ width:300, borderLeft:"1px solid var(--border)", display:"flex", flexDirection:"column", background:"var(--surface)", flexShrink:0, minHeight:0 }}>
        <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontWeight:700, fontSize:14 }}>
            {new Date(selected+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          </div>
          {selData?.mood && (
            <div style={{ marginTop:4, fontSize:13, color:"var(--text-muted)" }}>
              Mood: {MOODS[selData.mood] ?? selData.mood}
            </div>
          )}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"14px 18px", display:"flex", flexDirection:"column", gap:18, minHeight:0 }}>
          {/* Daily log */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>
              Daily Log
            </div>
            {selData?.hasLog ? (
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("daily")} style={{ width:"100%", justifyContent:"center" }}>
                View log →
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("daily")} style={{ width:"100%", justifyContent:"center", color:"var(--text-muted)" }}>
                <Plus size={12} /> Write a log
              </button>
            )}
          </div>

          {/* Tasks */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8, display:"flex", justifyContent:"space-between" }}>
              <span>Tasks ({selData?.todos.length ?? 0})</span>
              <button onClick={() => onNavigate("todos")} style={{ background:"none", border:"none", color:"var(--accent2)", cursor:"pointer", fontSize:10, padding:0 }}>
                + Add
              </button>
            </div>
            {(!selData || selData.todos.length === 0) ? (
              <div style={{ fontSize:12, color:"var(--text-dim)" }}>No tasks due.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {selData.todos.map(t => (
                  <div key={t.id} className="cal-task-row" style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"8px 10px", background:"var(--surface2)",
                    borderRadius:8, borderLeft:`3px solid ${PRIO_BAR[t.priority]}`,
                  }}>
                    <button className={`check-btn ${t.done ? "checked" : ""}`} onClick={() => toggleTodo(t.id, t.done)} style={{ width:18, height:18 }}>
                      {t.done && <Check size={10} color="#fff" strokeWidth={3} />}
                    </button>
                    <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={() => openEdit(t)}>
                      <div style={{ fontSize:12.5, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>
                        {t.title}
                      </div>
                      {t.reminder_at && (
                        <div style={{ fontSize:10.5, color:"var(--text-muted)", display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                          <Bell size={9} /> {t.reminder_at.slice(11, 16)}
                        </div>
                      )}
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm cal-task-edit" onClick={() => openEdit(t)} style={{ padding:"4px 5px" }} title="Edit task">
                      <Pencil size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={dayMenuItems(ctx.date)} onClose={() => setCtx(null)} />}

      {quickTaskInput && (
        <div className="modal-backdrop" onMouseDown={() => setQuickTaskInput(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ width: 440 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {quickTaskInput.reminder ? <Bell size={16} color="var(--accent2)" /> : <CheckSquare size={16} color="var(--accent2)" />}
              {quickTaskInput.reminder ? "Set reminder" : "New task"}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
                · {new Date(quickTaskInput.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </h2>
            <div className="form-row">
              <label>{quickTaskInput.reminder ? "Remind me to…" : "Task title"}</label>
              <input
                autoFocus
                value={quickTaskTitle}
                onChange={e => setQuickTaskTitle(e.target.value)}
                placeholder="What needs to be done?"
                onKeyDown={e => {
                  if (e.key === "Enter") quickAddTask();
                  if (e.key === "Escape") setQuickTaskInput(null);
                }}
              />
            </div>
            {quickTaskInput.reminder && (
              <div className="form-row">
                <label>Notify me at</label>
                <TimePicker value={reminderTime} onChange={setReminderTime} />
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setQuickTaskInput(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={quickAddTask}>
                {quickTaskInput.reminder ? "Set reminder" : "Add task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit task / reminder */}
      {edit && (
        <div className="modal-backdrop" onMouseDown={() => setEdit(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()} style={{ width: 460 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Pencil size={15} color="var(--accent2)" /> Edit task
            </h2>
            <div className="form-row">
              <label>Title</label>
              <input autoFocus value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); }} />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Priority</label>
                <Select value={edit.priority} onChange={v => setEdit({ ...edit, priority: v })}
                  options={[
                    { value: "high", label: "High", color: "var(--red)" },
                    { value: "medium", label: "Medium", color: "var(--amber)" },
                    { value: "low", label: "Low", color: "var(--green)" },
                  ]} />
              </div>
              <div className="form-row">
                <label>Due date</label>
                <DatePicker value={edit.due_date} onChange={v => setEdit({ ...edit, due_date: v })} placeholder="No due date" />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Reminder date</label>
                <DatePicker value={edit.remDate} onChange={v => setEdit({ ...edit, remDate: v })} placeholder="No reminder" />
              </div>
              {edit.remDate && (
                <div className="form-row">
                  <label>Remind at</label>
                  <TimePicker value={edit.remTime} onChange={v => setEdit({ ...edit, remTime: v })} />
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button className="btn btn-danger btn-sm" onClick={deleteEditTask}><Trash2 size={12} /> Delete</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
