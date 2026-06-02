import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Flame } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { sounds } from "../sounds";
import { todayStr, shiftDay } from "../time";

interface Habit { id: number; name: string; emoji: string; color: string; }
interface HabitCheck { habit_id: number; check_date: string; }

const HABIT_COLORS = ["#7c5af6","#22d3a4","#06b6d4","#fbbf24","#f43f5e","#ec4899","#a78bfa","#fb923c"];
const COMMON_EMOJIS = ["💧","📚","🏃","🧘","💤","🥗","✍️","☕","🎯","🎨","💪","🚭","🤝","🧠","🎵","☀️"];
const DAYS_TO_SHOW = 14;

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheck[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:"", emoji:"✨", color:HABIT_COLORS[0] });
  const { toast } = useApp();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const db = await getDb();
      const h = await db.select<Habit[]>("SELECT * FROM habits ORDER BY created_at ASC");
      const c = await db.select<HabitCheck[]>(
        "SELECT habit_id, check_date FROM habit_checks WHERE check_date >= ?", [shiftDay(todayStr(), -60)]
      );
      setHabits(h);
      setChecks(c);
    } catch (e) {
      toast("Load failed", String(e));
    }
  }

  async function addHabit() {
    if (!form.name.trim()) return;
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO habits (name,emoji,color) VALUES (?,?,?)",
        [form.name, form.emoji, form.color]
      );
      setForm({ name:"", emoji:"✨", color:HABIT_COLORS[0] });
      setShowModal(false);
      toast("Habit created", form.name);
      await load();
    } catch (e) {
      toast("Failed", String(e));
    }
  }

  async function delHabit(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM habit_checks WHERE habit_id=?", [id]);
      await db.execute("DELETE FROM habits WHERE id=?", [id]);
      toast("Habit deleted");
      await load();
    } catch (e) {
      toast("Delete failed", String(e));
    }
  }

  async function toggleCheck(habitId: number, date: string) {
    try {
      const db = await getDb();
      const existing = checks.find(c => c.habit_id === habitId && c.check_date === date);
      if (existing) {
        await db.execute("DELETE FROM habit_checks WHERE habit_id=? AND check_date=?", [habitId, date]);
        sounds.unhit();
      } else {
        // OR IGNORE guards against a duplicate from rapid double-clicks (UNIQUE constraint)
        await db.execute("INSERT OR IGNORE INTO habit_checks (habit_id, check_date) VALUES (?,?)", [habitId, date]);
        sounds.hit();
      }
      await load();
    } catch (e) {
      toast("Failed", String(e));
    }
  }

  const today = todayStr();

  const days = useMemo(() => {
    const arr: { date: string; label: string; isToday: boolean }[] = [];
    for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
      const dateStr = shiftDay(today, -i);
      arr.push({
        date: dateStr,
        label: new Date(dateStr + "T00:00:00").toLocaleString("en-US", { weekday: "narrow" }),
        isToday: i === 0,
      });
    }
    return arr;
  }, [today]);

  function streak(habitId: number) {
    let count = 0;
    let ds = today;
    while (true) {
      if (checks.some(c => c.habit_id === habitId && c.check_date === ds)) {
        count++;
        ds = shiftDay(ds, -1);
      } else if (ds === today) {
        ds = shiftDay(ds, -1);
      } else break;
    }
    return count;
  }

  function totalThisMonth(habitId: number) {
    const ym = today.slice(0, 7);
    return checks.filter(c => c.habit_id === habitId && c.check_date.startsWith(ym)).length;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Habits</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <Plus size={13} /> New Habit
        </button>
      </div>

      <div className="page-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {habits.length === 0 && (
          <div className="empty">
            <div className="empty-icon">🎯</div>
            <p>No habits yet.<br />Build consistency by tracking daily routines.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)} style={{ marginTop:10 }}>
              <Plus size={13} /> Create your first habit
            </button>
          </div>
        )}

        {habits.map(h => {
          const s = streak(h.id);
          const month = totalThisMonth(h.id);
          return (
            <div key={h.id} className="card" style={{ display:"flex", alignItems:"center", gap:16, padding:"14px 18px", borderLeft:`3px solid ${h.color}` }}>
              <div style={{ fontSize:28 }}>{h.emoji}</div>

              <div style={{ minWidth:140 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{h.name}</div>
                <div style={{ display:"flex", gap:10, marginTop:4, fontSize:11, color:"var(--text-muted)" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:3, color: s>0 ? "var(--amber)" : "var(--text-muted)" }}>
                    <Flame size={11} /> {s} day{s===1?"":"s"}
                  </span>
                  <span>· {month} this month</span>
                </div>
              </div>

              {/* Check grid */}
              <div style={{ flex:1, display:"flex", gap:4, justifyContent:"flex-end" }}>
                {days.map(d => {
                  const done = checks.some(c => c.habit_id === h.id && c.check_date === d.date);
                  return (
                    <div key={d.date} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                      <div style={{ fontSize:9, color:"var(--text-dim)" }}>{d.label}</div>
                      <button
                        onClick={() => toggleCheck(h.id, d.date)}
                        title={d.date}
                        style={{
                          width:24, height:24, borderRadius:6, cursor:"pointer",
                          border: d.isToday ? `1.5px solid ${h.color}` : "1px solid var(--border2)",
                          background: done ? h.color : "var(--surface2)",
                          transition:"background 0.15s, transform 0.1s",
                          padding:0,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delHabit(h.id)} style={{ padding:"5px 6px" }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>New Habit</h2>
            <div className="form-row">
              <label>Name</label>
              <input autoFocus value={form.name} onChange={e => setForm({...form,name:e.target.value})}
                placeholder="e.g. Drink water, Read 20 min..." onKeyDown={e => e.key==="Enter" && addHabit()} />
            </div>
            <div className="form-row">
              <label>Emoji</label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {COMMON_EMOJIS.map(e => (
                  <button key={e} className={`mood-btn ${form.emoji===e ? "selected" : ""}`}
                    onClick={() => setForm({...form, emoji:e})} style={{ fontSize:18 }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>Color</label>
              <div style={{ display:"flex", gap:8 }}>
                {HABIT_COLORS.map(c => (
                  <div key={c} onClick={() => setForm({...form,color:c})} style={{
                    width:26, height:26, borderRadius:"50%", background:c, cursor:"pointer",
                    border: form.color===c ? "2.5px solid #fff" : "2.5px solid transparent",
                    boxShadow: form.color===c ? `0 0 10px ${c}aa` : "none",
                  }} />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addHabit}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
