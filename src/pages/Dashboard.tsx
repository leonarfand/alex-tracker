import { useEffect, useState } from "react";
import { CheckSquare, NotebookPen, ArrowRight, TrendingUp, TrendingDown, Plus, Flame, Pin, Check, Bell } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { sounds } from "../sounds";
import { todayStr, nowStamp, shiftDay, monthStrWIB } from "../time";

type Page = "dashboard" | "notes" | "todos" | "calendar" | "habits" | "daily" | "finance";

interface Props { onNavigate: (p: Page) => void; }

interface UpReminder { id: number; title: string; remind_at: string; }

interface Stats {
  todosDue: number;
  todosTotal: number;
  todosDoneToday: number;
  notes: number;
  income: number;
  expense: number;
  streak: number;
}

interface RecentTodo { id: number; title: string; priority: string; due_date: string | null; done: number; }
interface RecentNote { id: number; title: string; color: string; updated_at: string; pinned: number; }
interface HabitInfo { id: number; name: string; emoji: string; color: string; doneToday: number; streak: number; }

const MOODS: Record<string, string> = { great:"😄", good:"🙂", okay:"😐", bad:"😕", awful:"😞" };

export default function Dashboard({ onNavigate }: Props) {
  const [stats, setStats] = useState<Stats>({ todosDue:0, todosTotal:0, todosDoneToday:0, notes:0, income:0, expense:0, streak:0 });
  const [todos, setTodos]   = useState<RecentTodo[]>([]);
  const [notes, setNotes]   = useState<RecentNote[]>([]);
  const [habits, setHabits] = useState<HabitInfo[]>([]);
  const [reminders, setReminders] = useState<UpReminder[]>([]);
  const [weekly, setWeekly] = useState<number[]>([]);
  const [todayMood, setTodayMood] = useState("");
  const [quickAdd, setQuickAdd]   = useState("");
  const { toast, refresh, money } = useApp();
  const today = todayStr();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const db = await getDb();
      const monthPrefix = monthStrWIB();
      const since30 = shiftDay(today, -30);
      const since6 = shiftDay(today, -6);
      const [tdDue, tdAll, tdDoneToday, noteCount, txRows, logRows, habitRows, habitChecks, doneWeek] = await Promise.all([
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM todos WHERE done=0 AND due_date<=?", [today]),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM todos WHERE done=0"),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM todos WHERE done=1 AND date(completed_at)=?", [today]),
        db.select<{c:number}[]>("SELECT COUNT(*) as c FROM notes"),
        db.select<{type:string,amount:number}[]>("SELECT type,SUM(amount) as amount FROM transactions WHERE substr(tx_date,1,7)=? GROUP BY type", [monthPrefix]),
        db.select<{log_date:string}[]>("SELECT log_date FROM daily_logs ORDER BY log_date DESC LIMIT 60"),
        db.select<{id:number;name:string;emoji:string;color:string}[]>("SELECT id,name,emoji,color FROM habits ORDER BY created_at ASC"),
        db.select<{habit_id:number;check_date:string}[]>("SELECT habit_id,check_date FROM habit_checks WHERE check_date >= ?", [since30]),
        db.select<{d:string;c:number}[]>("SELECT date(completed_at) as d, COUNT(*) as c FROM todos WHERE done=1 AND completed_at IS NOT NULL AND date(completed_at) >= ? GROUP BY d", [since6]),
      ]);

      const income  = txRows.find(r => r.type==="income")?.amount  ?? 0;
      const expense = txRows.find(r => r.type==="expense")?.amount ?? 0;

      let streak = 0;
      let cursor = today;
      for (const row of logRows) {
        if (row.log_date === cursor) { streak++; cursor = shiftDay(cursor, -1); }
        else break;
      }

      // Build weekly done array (last 7 days)
      const week: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const key = shiftDay(today, -i);
        const m = doneWeek.find(r => r.d === key);
        week.push(m?.c ?? 0);
      }

      // Build habit stats
      const habitInfos: HabitInfo[] = habitRows.map(h => {
        const checks = habitChecks.filter(c => c.habit_id === h.id);
        const doneToday = checks.some(c => c.check_date === today) ? 1 : 0;
        // streak (counts back from today; today not yet checked doesn't break it)
        let s = 0;
        let ds = today;
        while (true) {
          if (checks.some(c => c.check_date === ds)) { s++; ds = shiftDay(ds, -1); }
          else if (ds === today) { ds = shiftDay(ds, -1); }
          else break;
        }
        return { ...h, doneToday, streak: s };
      });

      setStats({
        todosDue: tdDue[0]?.c ?? 0,
        todosTotal: tdAll[0]?.c ?? 0,
        todosDoneToday: tdDoneToday[0]?.c ?? 0,
        notes: noteCount[0]?.c ?? 0,
        income, expense, streak,
      });
      setWeekly(week);
      setHabits(habitInfos);

      const [recentTodos, recentNotes, upReminders] = await Promise.all([
        db.select<RecentTodo[]>("SELECT id,title,priority,due_date,done FROM todos WHERE done=0 ORDER BY due_date ASC NULLS LAST, priority DESC LIMIT 5"),
        db.select<RecentNote[]>("SELECT id,title,color,updated_at,pinned FROM notes ORDER BY pinned DESC, updated_at DESC LIMIT 5"),
        db.select<UpReminder[]>("SELECT id,title,remind_at FROM reminders WHERE remind_at >= ? ORDER BY remind_at ASC LIMIT 6", [nowStamp()]),
      ]);
      setTodos(recentTodos);
      setNotes(recentNotes);
      setReminders(upReminders);

      const moodRow = await db.select<{mood:string}[]>("SELECT mood FROM daily_logs WHERE log_date=?", [today]);
      setTodayMood(moodRow[0]?.mood ?? "");
    } catch (e) {
      toast("Load failed", String(e));
    }
  }

  async function addQuickTask() {
    if (!quickAdd.trim()) return;
    try {
      const db = await getDb();
      await db.execute("INSERT INTO todos (title,priority) VALUES (?, 'medium')", [quickAdd]);
      sounds.success();
      setQuickAdd("");
      toast("Task added ✓");
      await load();
      refresh();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function toggleTodo(id: number, done: number) {
    try {
      const db = await getDb();
      await db.execute("UPDATE todos SET done=?, completed_at=? WHERE id=?", [done ? 0 : 1, done ? null : nowStamp(), id]);
      if (done) sounds.unhit(); else sounds.hit();
      await load();
      refresh();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function toggleHabit(id: number, done: number) {
    try {
      const db = await getDb();
      if (done) {
        await db.execute("DELETE FROM habit_checks WHERE habit_id=? AND check_date=?", [id, today]);
        sounds.unhit();
      } else {
        await db.execute("INSERT INTO habit_checks (habit_id, check_date) VALUES (?,?)", [id, today]);
        sounds.hit();
      }
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  const net = stats.income - stats.expense;
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const totalToday = stats.todosDoneToday + stats.todosDue;
  const progressPct = totalToday === 0 ? 0 : Math.round((stats.todosDoneToday / totalToday) * 100);
  const maxWeekly = Math.max(...weekly, 1);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{greeting()}, Alex 👋</h1>
        <span style={{ color:"var(--text-muted)", fontSize:12 }}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</span>
      </div>
      <div className="page-body" style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* Today's progress card */}
        <div className="card" style={{ display:"flex", flexDirection:"column", gap:12, background:"linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Today's Progress</div>
              <div style={{ fontSize:22, fontWeight:800, marginTop:4 }}>
                {stats.todosDoneToday} <span style={{ color:"var(--text-muted)", fontWeight:500, fontSize:14 }}>/ {totalToday} tasks done</span>
              </div>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color: progressPct >= 80 ? "var(--green)" : progressPct >= 50 ? "var(--amber)" : "var(--accent2)" }}>
              {progressPct}%
            </div>
          </div>
          <div style={{ height:8, background:"var(--surface3)", borderRadius:99, overflow:"hidden" }}>
            <div style={{
              width:`${progressPct}%`, height:"100%",
              background: progressPct >= 80 ? "linear-gradient(90deg, var(--green), var(--teal))" : "linear-gradient(90deg, var(--accent), var(--accent2))",
              transition:"width 0.4s ease", borderRadius:99,
            }} />
          </div>

          {/* Quick add */}
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <input
              value={quickAdd}
              onChange={e => setQuickAdd(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addQuickTask()}
              placeholder="⚡ Quick add a task… (press Enter)"
              style={{ flex:1, fontSize:13 }}
            />
            <button className="btn btn-primary btn-sm" onClick={addQuickTask}>
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          <div className="stat-card" onClick={() => onNavigate("todos")} style={{ cursor:"pointer" }}>
            <div className="stat-label" style={{ display:"flex", alignItems:"center", gap:6 }}>
              <CheckSquare size={12} /> Tasks Due
            </div>
            <div className="stat-value" style={{ color: stats.todosDue > 0 ? "var(--red)" : "var(--green)" }}>
              {stats.todosDue}
            </div>
            <div className="stat-sub">{stats.todosTotal} total pending</div>
          </div>

          <div className="stat-card" onClick={() => onNavigate("notes")} style={{ cursor:"pointer" }}>
            <div className="stat-label" style={{ display:"flex", alignItems:"center", gap:6 }}>
              <NotebookPen size={12} /> Notes
            </div>
            <div className="stat-value" style={{ color:"var(--accent2)" }}>{stats.notes}</div>
            <div className="stat-sub">saved locally</div>
          </div>

          <div className="stat-card" onClick={() => onNavigate("finance")} style={{ cursor:"pointer" }}>
            <div className="stat-label" style={{ display:"flex", alignItems:"center", gap:6 }}>
              {net >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} Net (month)
            </div>
            <div className="stat-value" style={{ color: net >= 0 ? "var(--green)" : "var(--red)" }}>
              {net < 0 ? "-" : ""}{money(Math.abs(net), 0)}
            </div>
            <div className="stat-sub">{money(stats.income, 0)} in · {money(stats.expense, 0)} out</div>
          </div>

          <div className="stat-card" onClick={() => onNavigate("daily")} style={{ cursor:"pointer" }}>
            <div className="stat-label" style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Flame size={12} color="var(--amber)" /> Streak
            </div>
            <div className="stat-value" style={{ color:"var(--amber)" }}>{stats.streak}</div>
            <div className="stat-sub">{stats.streak === 1 ? "day" : "days"} of journaling</div>
          </div>
        </div>

        {/* Weekly chart + Mood */}
        <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:12 }}>
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>This Week</div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>Tasks completed per day</div>
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:"var(--accent2)" }}>
                {weekly.reduce((a,b) => a+b, 0)} <span style={{ fontSize:11, color:"var(--text-muted)", fontWeight:500 }}>total</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, height:90, alignItems:"flex-end" }}>
              {weekly.map((v, i) => {
                const d = new Date(); d.setDate(d.getDate() - (6 - i));
                const label = d.toLocaleString("en-US",{weekday:"narrow"});
                const isToday = i === 6;
                return (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", gap:5, alignItems:"center", height:"100%" }}>
                    <div style={{ flex:1, width:"100%", display:"flex", alignItems:"flex-end" }}>
                      <div title={`${v} task${v===1?"":"s"}`} style={{
                        width:"100%",
                        height:`${(v/maxWeekly)*100}%`,
                        minHeight: v > 0 ? 4 : 0,
                        background: isToday
                          ? "linear-gradient(180deg, var(--accent2), var(--accent))"
                          : "linear-gradient(180deg, var(--surface3), var(--surface2))",
                        borderRadius:"6px 6px 2px 2px",
                        transition:"height 0.4s ease",
                      }} />
                    </div>
                    <div style={{ fontSize:10, color: isToday ? "var(--accent2)" : "var(--text-muted)", fontWeight:isToday ? 700 : 500 }}>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mood */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>How are you today?</div>
            <div style={{ display:"flex", gap:6, justifyContent:"space-between" }}>
              {Object.entries(MOODS).map(([key, emoji]) => (
                <button key={key} className={`mood-btn ${todayMood===key ? "selected" : ""}`}
                  onClick={async () => {
                    setTodayMood(key);
                    try {
                      const db = await getDb();
                      await db.execute(
                        `INSERT INTO daily_logs (log_date, mood) VALUES (?,?) ON CONFLICT(log_date) DO UPDATE SET mood=excluded.mood`,
                        [today, key]
                      );
                    } catch (e) { toast("Failed", String(e)); }
                  }}
                  style={{ flex:1, fontSize:20 }}>{emoji}</button>
              ))}
            </div>
            <div style={{ fontSize:11, color:"var(--text-muted)", textAlign:"center", marginTop:2 }}>
              {todayMood ? `Feeling ${todayMood} today` : "Pick a mood"}
            </div>
          </div>
        </div>

        {/* Tasks · Reminders · Habits */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {/* Pending tasks */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
                <CheckSquare size={13} color="var(--text-muted)" /> Tasks · Up Next
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("todos")} style={{ gap:4 }}>
                All <ArrowRight size={11} />
              </button>
            </div>
            {todos.length === 0 ? (
              <div className="empty" style={{ padding:"16px 0" }}><div className="empty-icon">✅</div><p>All clear!</p></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {todos.map(t => (
                  <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 8px", borderRadius:6, transition:"background 0.12s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <button className={`check-btn ${t.done ? "checked" : ""}`} onClick={() => toggleTodo(t.id, t.done)} style={{ width:16, height:16 }}>
                      {t.done ? <Check size={9} color="#fff" strokeWidth={3} /> : null}
                    </button>
                    <div className={`prio-dot prio-${t.priority}`} />
                    <span style={{ flex:1, fontSize:13, color:"var(--text)" }}>{t.title}</span>
                    {t.due_date && (
                      <span style={{ fontSize:10.5, color: t.due_date <= today ? "var(--red)" : "var(--text-muted)" }}>
                        {t.due_date}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming reminders */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
                <Bell size={13} color="#38bdf8" /> Reminders
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("calendar")} style={{ gap:4 }}>
                Calendar <ArrowRight size={11} />
              </button>
            </div>
            {reminders.length === 0 ? (
              <div className="empty" style={{ padding:"16px 0" }}><div className="empty-icon">🔔</div><p style={{ fontSize:12 }}>No upcoming reminders</p></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {reminders.map(r => (
                  <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 8px", borderRadius:6, borderLeft:"2px solid #38bdf8", background:"#0d1f2d55" }}>
                    <Bell size={12} color="#38bdf8" style={{ flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:13, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.title}</span>
                    <span style={{ fontSize:10.5, color:"#7dd3fc", whiteSpace:"nowrap" }}>
                      {r.remind_at.slice(5, 10).replace("-", "/")} {r.remind_at.slice(11, 16)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Habits today */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontWeight:700, fontSize:13 }}>Habits Today</span>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("habits")} style={{ gap:4 }}>
                All <ArrowRight size={11} />
              </button>
            </div>
            {habits.length === 0 ? (
              <div className="empty" style={{ padding:"16px 0" }}>
                <div className="empty-icon">🎯</div>
                <p style={{ fontSize:12 }}>No habits yet</p>
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("habits")} style={{ marginTop:6 }}>
                  <Plus size={11} /> Start tracking
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {habits.slice(0, 5).map(h => (
                  <div key={h.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"4px 6px" }}>
                    <button onClick={() => toggleHabit(h.id, h.doneToday)} style={{
                      width:22, height:22, borderRadius:6, cursor:"pointer",
                      border: `1.5px solid ${h.color}`,
                      background: h.doneToday ? h.color : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center", padding:0,
                      transition:"background 0.15s",
                    }}>
                      {h.doneToday ? <Check size={11} color="#fff" strokeWidth={3} /> : null}
                    </button>
                    <span style={{ fontSize:16 }}>{h.emoji}</span>
                    <span style={{ flex:1, fontSize:13, color: h.doneToday ? "var(--text-muted)" : "var(--text)", textDecoration: h.doneToday ? "line-through" : "none" }}>
                      {h.name}
                    </span>
                    {h.streak > 0 && (
                      <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:11, color:"var(--amber)" }}>
                        <Flame size={10} /> {h.streak}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pinned/recent notes */}
        <div className="card" style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontWeight:700, fontSize:13 }}>Recent Notes</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("notes")} style={{ gap:4 }}>
              All <ArrowRight size={11} />
            </button>
          </div>
          {notes.length === 0 ? (
            <div className="empty" style={{ padding:"16px 0" }}><div className="empty-icon">📝</div><p>No notes yet</p></div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
              {notes.map(n => (
                <div key={n.id} className={`sticky-card sticky-${n.color}`}
                  onClick={() => onNavigate("notes")}
                  style={{ cursor:"pointer", padding:"10px 12px", borderRadius:8, minHeight:60, borderLeft: `3px solid var(--snc)` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
                    {n.pinned === 1 && <Pin size={10} color="var(--amber)" />}
                    <span style={{ fontWeight:600, fontSize:12.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {n.title || "Untitled"}
                    </span>
                  </div>
                  <div style={{ fontSize:10.5, color:"var(--text-muted)" }}>{n.updated_at.slice(0, 10)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
