import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Folder, ArrowUpRight, ArrowDownRight, PiggyBank, ChevronDown } from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { Donut, BarChart, Sparkline } from "../components/Charts";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
import { todayStr, shiftDay, monthStrWIB } from "../time";

interface Project { id: number; name: string; color: string; }
interface Transaction {
  id: number;
  project_id: number | null;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  tx_date: string;
  project_name?: string;
}

const PROJECT_COLORS = ["#7c5af6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#a78bfa","#14b8a6"];
const EXPENSE_CATS = ["Hosting","Tools","Salary","Ads","Office","Transport","Food","Marketing","Other"];
const INCOME_CATS  = ["Client","Product","Freelance","Investment","Other"];

const CAT_COLORS: Record<string,string> = {
  Hosting:"#7c5af6", Tools:"#06b6d4", Salary:"#fbbf24", Ads:"#ec4899",
  Office:"#22d3a4", Transport:"#a78bfa", Food:"#fb923c", Marketing:"#f43f5e",
  Client:"#7c5af6", Product:"#22d3a4", Freelance:"#06b6d4",
  Investment:"#fbbf24", Other:"#6b6b8a",
};

const CURRENCY_LOCALE: Record<string, string> = {
  "$":"en-US", "Rp":"id-ID", "€":"de-DE", "£":"en-GB",
  "¥":"ja-JP", "₹":"en-IN", "A$":"en-AU", "C$":"en-CA",
};

function fmtNum(n: number, currency = "$", decimals = 2) {
  const locale = CURRENCY_LOCALE[currency] || "en-US";
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatAmountInput(digits: string, currency: string) {
  if (!digits) return "";
  const num = parseInt(digits, 10);
  if (isNaN(num)) return "";
  const locale = CURRENCY_LOCALE[currency] || "en-US";
  return num.toLocaleString(locale);
}

function monthLabel(date: Date) {
  return date.toLocaleString("en-US", { month: "short" });
}

interface FinanceProps { focusProjectId?: number | null; onConsumeFocus?: () => void; }

export default function Finance({ focusProjectId, onConsumeFocus }: FinanceProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeProject, setActiveProject] = useState<number | null>(null);
  const [showTxModal,   setShowTxModal]   = useState(false);
  const [showProjModal, setShowProjModal] = useState(false);
  const [showAllTx,     setShowAllTx]     = useState(false);
  const [txForm, setTxForm] = useState({
    type:"expense" as "income"|"expense", amount:"", category:"",
    description:"", tx_date:todayStr(), project_id:"",
  });
  const [projForm, setProjForm] = useState({ name:"", color:PROJECT_COLORS[0] });
  const { toast, currency, confirm } = useApp();
  const fmtMoney = (n: number, d = 2) => currency + fmtNum(n, currency, d);

  useEffect(() => { loadAll(); }, []);

  // When opened from a project's Focus Mode, pre-filter to that project.
  useEffect(() => {
    if (focusProjectId != null) {
      setActiveProject(focusProjectId);
      onConsumeFocus?.();
    }
  }, [focusProjectId]);

  async function loadAll() {
    try {
      const db = await getDb();
      // Show only active/on-hold finance projects here; Done projects drop off
      // the live Finance view (their transactions still count in All Projects).
      const projs = await db.select<Project[]>("SELECT * FROM projects WHERE COALESCE(tracks_finance, 1) = 1 AND status != 'done' ORDER BY name");
      setProjects(projs);
      const txs = await db.select<Transaction[]>(`
        SELECT t.*, p.name as project_name
        FROM transactions t
        LEFT JOIN projects p ON t.project_id = p.id
        ORDER BY t.tx_date DESC, t.created_at DESC
      `);
      setTransactions(txs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast("Failed to load", msg);
    }
  }

  async function addProject() {
    if (!projForm.name.trim()) return;
    try {
      const db = await getDb();
      await db.execute("INSERT OR IGNORE INTO projects (name,color) VALUES (?,?)", [projForm.name, projForm.color]);
      setProjForm({ name:"", color:PROJECT_COLORS[0] });
      setShowProjModal(false);
      toast("Project created", projForm.name);
      await loadAll();
    } catch (e) {
      toast("Failed to add project", String(e));
    }
  }

  async function delProject(id: number, name: string) {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      message: "This permanently deletes the project and all its finance entries.",
      confirmLabel: "Delete project",
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM transactions WHERE project_id=?", [id]);
      await db.execute("DELETE FROM projects WHERE id=?", [id]);
      if (activeProject === id) setActiveProject(null);
      toast("Project deleted");
      await loadAll();
    } catch (e) {
      toast("Delete failed", String(e));
    }
  }

  async function addTransaction() {
    const amt = parseFloat(txForm.amount);
    if (!amt || amt <= 0) { toast("Enter a valid amount"); return; }
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO transactions (project_id,type,amount,category,description,tx_date) VALUES (?,?,?,?,?,?)",
        [txForm.project_id ? parseInt(txForm.project_id) : null, txForm.type, amt, txForm.category, txForm.description, txForm.tx_date]
      );
      setTxForm({ type:"expense", amount:"", category:"", description:"", tx_date:todayStr(), project_id:"" });
      setShowTxModal(false);
      toast(`${txForm.type === "income" ? "Income" : "Expense"} recorded`, fmtMoney(amt));
      await loadAll();
    } catch (e) {
      toast("Save failed", String(e));
    }
  }

  async function delTx(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM transactions WHERE id=?", [id]);
      await loadAll();
    } catch (e) {
      toast("Delete failed", String(e));
    }
  }

  const filtered = useMemo(() =>
    activeProject === null ? transactions : transactions.filter(t => t.project_id === activeProject),
    [activeProject, transactions]
  );

  // ── Stats ──
  const stats = useMemo(() => {
    const thisMonth = monthStrWIB();
    const todayS = todayStr();
    const lastMonth = thisMonth.endsWith("-01")
      ? `${parseInt(thisMonth.slice(0,4),10)-1}-12`
      : `${thisMonth.slice(0,5)}${String(parseInt(thisMonth.slice(5),10)-1).padStart(2,"0")}`;
    const yestStr = shiftDay(todayS, -1);

    let totalBalance = 0, monthIncome = 0, monthExpense = 0;
    let lastMonthIncome = 0, lastMonthExpense = 0;
    let todayIncome = 0, todayExpense = 0;
    let yestIncome = 0, yestExpense = 0;
    for (const t of filtered) {
      const m = t.tx_date.slice(0, 7);
      const sign = t.type === "income" ? 1 : -1;
      totalBalance += t.amount * sign;
      if (m === thisMonth) { if (t.type==="income") monthIncome += t.amount; else monthExpense += t.amount; }
      if (m === lastMonth) { if (t.type==="income") lastMonthIncome += t.amount; else lastMonthExpense += t.amount; }
      if (t.tx_date === todayS) { if (t.type==="income") todayIncome += t.amount; else todayExpense += t.amount; }
      if (t.tx_date === yestStr)  { if (t.type==="income") yestIncome  += t.amount; else yestExpense  += t.amount; }
    }
    const monthNet = monthIncome - monthExpense;
    const lastMonthNet = lastMonthIncome - lastMonthExpense;
    const todayNet = todayIncome - todayExpense;
    const yestNet = yestIncome - yestExpense;
    const netChange = lastMonthNet === 0 ? null : ((monthNet - lastMonthNet) / Math.abs(lastMonthNet)) * 100;
    const savingsRate = monthIncome === 0 ? 0 : Math.round((monthNet / monthIncome) * 100);
    return { totalBalance, monthIncome, monthExpense, monthNet, netChange, savingsRate, todayIncome, todayExpense, todayNet, yestNet };
  }, [filtered]);

  // ── 6-month bar chart ──
  const barData = useMemo(() => {
    const months: { label: string; key: string; income: number; expense: number; }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      months.push({ label: monthLabel(d), key, income: 0, expense: 0 });
    }
    for (const t of filtered) {
      const key = t.tx_date.slice(0, 7);
      const m = months.find(x => x.key === key);
      if (m) { if (t.type === "income") m.income += t.amount; else m.expense += t.amount; }
    }
    return months;
  }, [filtered]);

  // ── Spending donut ──
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(t => t.type === "expense").forEach(t => {
      const c = t.category || "Other";
      map[c] = (map[c] ?? 0) + t.amount;
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value, color: CAT_COLORS[label] || "#6b6b8a" }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── Income by source donut ──
  const incomeBySource = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(t => t.type === "income").forEach(t => {
      const c = t.category || "Other";
      map[c] = (map[c] ?? 0) + t.amount;
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value, color: CAT_COLORS[label] || "#22d3a4" }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── Project P&L ──
  const projectStats = useMemo(() => {
    return projects.map(p => {
      const txs = transactions.filter(t => t.project_id === p.id);
      let income = 0, expense = 0;
      for (const t of txs) { if (t.type === "income") income += t.amount; else expense += t.amount; }
      return { ...p, income, expense, net: income - expense, count: txs.length };
    });
  }, [projects, transactions]);

  // ── Balance sparkline (running balance over time) ──
  const balanceTrend = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    let running = 0;
    return sorted.map(t => {
      running += t.type === "income" ? t.amount : -t.amount;
      return running;
    });
  }, [filtered]);

  const txToShow = showAllTx ? filtered : filtered.slice(0, 8);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Finance</h1>
        {/* Project pills */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap", flex:1, justifyContent:"flex-end", maxWidth:"60%" }}>
          <button className={`btn btn-sm ${activeProject===null ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveProject(null)}>
            All Projects
          </button>
          {projects.slice(0, 4).map(p => (
            <button key={p.id} className={`btn btn-sm ${activeProject===p.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveProject(activeProject===p.id ? null : p.id)} style={{ gap:6 }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:p.color }} />
              {p.name}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowProjModal(true)}>
          <Folder size={13} /> New Project
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => {
          // Pre-select the project when viewing a single project's finance
          if (activeProject != null) setTxForm(f => ({ ...f, project_id: String(activeProject) }));
          setShowTxModal(true);
        }}>
          <Plus size={13} /> Add Entry
        </button>
      </div>

      <div className="page-body" style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* ── Hero balance card ── */}
        <div className="balance-hero">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:20 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, color:"rgba(255,255,255,0.7)", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.1em" }}>
                <Wallet size={14} /> Available Balance
              </div>
              <div style={{ fontSize:42, fontWeight:800, letterSpacing:"-0.02em", lineHeight:1.1, marginTop:8, color:"#fff" }}>
                {fmtMoney(stats.totalBalance)}
              </div>
              {stats.netChange !== null && (
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(255,255,255,0.15)", color: stats.netChange >= 0 ? "#86efac" : "#fda4af", fontSize:11, fontWeight:700 }}>
                    {stats.netChange >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {Math.abs(stats.netChange).toFixed(1)}%
                  </div>
                  <span style={{ color:"rgba(255,255,255,0.7)", fontSize:11 }}>vs last month</span>
                </div>
              )}
            </div>
            <Sparkline data={balanceTrend} color="rgba(255,255,255,0.85)" width={150} height={50} />
          </div>
        </div>

        {/* ── Today's P&L (hero strip) ── */}
        <div className="card" style={{
          padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 20,
          borderLeft: `4px solid ${stats.todayNet >= 0 ? "var(--green)" : "var(--red)"}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", display: "flex", alignItems: "center", gap: 6 }}>
              Today {stats.todayNet >= 0 ? <TrendingUp size={12} color="var(--green)" /> : <TrendingDown size={12} color="var(--red)" />}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: stats.todayNet >= 0 ? "var(--green)" : "var(--red)" }}>
                {stats.todayNet < 0 ? "-" : "+"}{fmtMoney(Math.abs(stats.todayNet), 0)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <span style={{ color: "var(--green)" }}>+{fmtMoney(stats.todayIncome, 0)}</span>
                {" · "}
                <span style={{ color: "var(--red)" }}>-{fmtMoney(stats.todayExpense, 0)}</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Yesterday
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: stats.yestNet >= 0 ? "var(--green)" : "var(--red)" }}>
              {stats.yestNet < 0 ? "-" : "+"}{fmtMoney(Math.abs(stats.yestNet), 0)}
            </div>
            {stats.yestNet !== 0 && (
              <div style={{ fontSize: 10.5, color: stats.todayNet >= stats.yestNet ? "var(--green)" : "var(--red)", marginTop: 2, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                {stats.todayNet >= stats.yestNet ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {stats.todayNet >= stats.yestNet ? "Better than yesterday" : "Worse than yesterday"}
              </div>
            )}
          </div>
        </div>

        {/* ── 3 mini stat cards ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          <MiniStat
            icon={<TrendingUp size={14} />} label="Income (month)"
            value={`${fmtMoney(stats.monthIncome, 0)}`} color="var(--green)"
          />
          <MiniStat
            icon={<TrendingDown size={14} />} label="Expenses (month)"
            value={`${fmtMoney(stats.monthExpense, 0)}`} color="var(--red)"
          />
          <MiniStat
            icon={<PiggyBank size={14} />} label="Savings Rate"
            value={`${stats.savingsRate}%`}
            color={stats.savingsRate >= 0 ? "var(--accent2)" : "var(--red)"}
          />
        </div>

        {/* ── Charts row ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:12 }}>
          {/* Bar chart */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>Income vs Expenses</div>
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>Last 6 months</div>
              </div>
              <div style={{ display:"flex", gap:14, fontSize:11 }}>
                <Legend color="#14b8a6" label="Income" />
                <Legend color="#f43f5e" label="Expense" />
              </div>
            </div>
            <BarChart data={barData} />
          </div>

          {/* Spending donut */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Spending Breakdown</div>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <Donut
                data={expenseByCategory}
                size={140}
                thickness={18}
                centerValue={fmtMoney(expenseByCategory.reduce((s, c) => s + c.value, 0), 0)}
                centerLabel="Total"
              />
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6, minWidth:0 }}>
                {expenseByCategory.length === 0 && (
                  <div style={{ fontSize:11.5, color:"var(--text-dim)" }}>No expenses yet</div>
                )}
                {expenseByCategory.slice(0, 5).map(c => (
                  <div key={c.label} style={{ display:"flex", alignItems:"center", gap:7, fontSize:11.5 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                    <span style={{ flex:1, color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.label}</span>
                    <span style={{ fontWeight:700 }}>{fmtMoney(c.value, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Income sources + Projects row ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr", gap:12 }}>
          {/* Income sources */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Income Sources</div>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <Donut
                data={incomeBySource}
                size={120}
                thickness={16}
                centerValue={fmtMoney(incomeBySource.reduce((s, c) => s + c.value, 0), 0)}
                centerLabel="Total"
              />
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6, minWidth:0 }}>
                {incomeBySource.length === 0 && (
                  <div style={{ fontSize:11.5, color:"var(--text-dim)" }}>No income yet</div>
                )}
                {incomeBySource.slice(0, 4).map(c => (
                  <div key={c.label} style={{ display:"flex", alignItems:"center", gap:7, fontSize:11.5 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                    <span style={{ flex:1, color:"var(--text-muted)" }}>{c.label}</span>
                    <span style={{ fontWeight:700 }}>{fmtMoney(c.value, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Project performance */}
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Project Performance</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowProjModal(true)} style={{ padding:"3px 8px" }}>
                <Plus size={11} /> Add
              </button>
            </div>
            {projectStats.length === 0 ? (
              <div style={{ fontSize:11.5, color:"var(--text-dim)", textAlign:"center", padding:"16px 0" }}>
                No projects yet. Create one to track separate P&Ls.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {projectStats.map(p => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 10px", background:"var(--surface2)", borderRadius:8, borderLeft:`3px solid ${p.color}` }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>{p.name}</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)" }}>{p.count} {p.count === 1 ? "entry" : "entries"}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:14, fontWeight:700, color: p.net >= 0 ? "var(--green)" : "var(--red)" }}>
                        {p.net < 0 ? "-" : "+"}{fmtMoney(Math.abs(p.net), 0)}
                      </div>
                      <div style={{ fontSize:10.5, color:"var(--text-dim)" }}>
                        <span style={{ color:"var(--green)" }}>+{fmtMoney(p.income, 0)}</span>
                        {" · "}
                        <span style={{ color:"var(--red)" }}>-{fmtMoney(p.expense, 0)}</span>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delProject(p.id, p.name)} style={{ padding:"4px 5px" }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Transactions ── */}
        <div className="card" style={{ padding:0, overflow:"hidden", display:"flex", flexDirection:"column", maxHeight: 460 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>Recent Transactions</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>{filtered.length} total · scroll to see more</div>
            </div>
            {filtered.length > 8 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAllTx(!showAllTx)}>
                {showAllTx ? "Show recent" : `Show all (${filtered.length})`} <ChevronDown size={11} style={{ transform: showAllTx ? "rotate(180deg)" : "none", transition:"transform 0.15s" }} />
              </button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="empty"><div className="empty-icon">💰</div><p>No entries yet. Click <strong>+ Add Entry</strong> to record income or expenses.</p></div>
          ) : (
            <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Project</th>
                  <th style={{ textAlign:"right" }}>Amount</th><th></th>
                </tr>
              </thead>
              <tbody>
                {txToShow.map(t => (
                  <tr key={t.id}>
                    <td style={{ color:"var(--text-muted)", fontSize:12 }}>{t.tx_date}</td>
                    <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                    <td>{t.category || <span style={{ color:"var(--text-dim)" }}>—</span>}</td>
                    <td style={{ color:"var(--text-muted)" }}>{t.description || <span style={{ color:"var(--text-dim)" }}>—</span>}</td>
                    <td>{t.project_name ? <span className="tag">{t.project_name}</span> : <span style={{ color:"var(--text-dim)" }}>—</span>}</td>
                    <td style={{ textAlign:"right", fontWeight:700, color: t.type==="income" ? "var(--green)" : "var(--red)" }}>
                      {t.type==="income" ? "+" : "-"}{fmtMoney(t.amount)}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delTx(t.id)} style={{ padding:"4px 6px" }}>
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Transaction Modal ── */}
      {showTxModal && (
        <div className="modal-backdrop" onClick={() => setShowTxModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Entry</h2>
            <div style={{ display:"flex", gap:8 }}>
              {(["expense","income"] as const).map(t => (
                <button key={t} className={`btn ${txForm.type===t ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setTxForm({...txForm,type:t,category:""})}
                  style={{ flex:1, justifyContent:"center", textTransform:"capitalize" }}>
                  {t === "income" ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {t}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Amount ({currency})</label>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={formatAmountInput(txForm.amount, currency)}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setTxForm({...txForm, amount: digits});
                  }}
                  placeholder="0"
                  onKeyDown={e => e.key === "Enter" && addTransaction()}
                  style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 15 }}
                />
              </div>
              <div className="form-row">
                <label>Date</label>
                <DatePicker value={txForm.tx_date} onChange={v => setTxForm({...txForm, tx_date: v})} />
              </div>
              <div className="form-row">
                <label>Category</label>
                <Select
                  value={txForm.category}
                  onChange={v => setTxForm({...txForm, category: v})}
                  placeholder="Select category…"
                  options={(txForm.type === "expense" ? EXPENSE_CATS : INCOME_CATS).map(c => ({ value: c, label: c }))}
                />
              </div>
              <div className="form-row">
                <label>Project</label>
                <Select
                  value={txForm.project_id}
                  onChange={v => setTxForm({...txForm, project_id: v})}
                  placeholder="No project"
                  options={[{ value: "", label: "No project" }, ...projects.map(p => ({ value: String(p.id), label: p.name, color: p.color }))]}
                />
              </div>
            </div>
            <div className="form-row">
              <label>Description</label>
              <input value={txForm.description} onChange={e => setTxForm({...txForm,description:e.target.value})} placeholder="Optional note" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowTxModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addTransaction}>Add Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Project Modal ── */}
      {showProjModal && (
        <div className="modal-backdrop" onClick={() => setShowProjModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>New Project</h2>
            <div className="form-row">
              <label>Name</label>
              <input autoFocus value={projForm.name} onChange={e => setProjForm({...projForm,name:e.target.value})}
                placeholder="Project name" onKeyDown={e => e.key==="Enter" && addProject()} />
            </div>
            <div className="form-row">
              <label>Color</label>
              <div style={{ display:"flex", gap:8 }}>
                {PROJECT_COLORS.map(c => (
                  <div key={c} onClick={() => setProjForm({...projForm,color:c})} style={{
                    width:26, height:26, borderRadius:"50%", background:c, cursor:"pointer",
                    border: projForm.color===c ? "2.5px solid #fff" : "2.5px solid transparent",
                    boxShadow: projForm.color===c ? `0 0 10px ${c}aa` : "none",
                    transition: "transform 0.1s",
                  }} />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowProjModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addProject}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label" style={{ display:"flex", alignItems:"center", gap:6, color }}>
        {icon} {label}
      </div>
      <div className="stat-value" style={{ color, fontSize: 24 }}>{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--text-muted)" }}>
      <span style={{ width:8, height:8, borderRadius:2, background:color }} />
      {label}
    </div>
  );
}
