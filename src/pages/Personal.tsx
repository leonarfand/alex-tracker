import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Wallet, Landmark, Smartphone, CreditCard, ArrowLeftRight,
  TrendingUp, TrendingDown, Repeat, Check, PiggyBank, Pencil,
} from "lucide-react";
import { getDb } from "../db";
import { useApp } from "../App";
import { sounds } from "../sounds";
import { todayStr, monthStrWIB } from "../time";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";

interface WalletRow { id: number; name: string; type: string; opening_balance: number; color: string; }
interface PTx { id: number; wallet_id: number | null; type: "income" | "expense"; amount: number; category: string; description: string; tx_date: string; }
interface Transfer { id: number; from_wallet_id: number | null; to_wallet_id: number | null; amount: number; tx_date: string; }
interface Budget { id: number; category: string; monthly_limit: number; }
interface Bill { id: number; name: string; amount: number; category: string; due_day: number; wallet_id: number | null; last_paid_month: string; active: number; }

const WALLET_TYPES = [
  { value: "cash",    label: "Cash" },
  { value: "bank",    label: "Bank" },
  { value: "ewallet", label: "E-Wallet" },
  { value: "other",   label: "Other" },
];
const WALLET_COLORS = ["#7c5af6","#06b6d4","#22d3a4","#fbbf24","#f43f5e","#ec4899","#a78bfa","#fb923c"];
const EXPENSE_CATS = ["Food","Groceries","Transport","Rent","Utilities","Dining","Health","Entertainment","Shopping","Subscriptions","Bills","Other"];
const INCOME_CATS = ["Salary","Freelance","Bonus","Gift","Refund","Other"];
const CURRENCY_LOCALE: Record<string,string> = { "$":"en-US","Rp":"id-ID","€":"de-DE","£":"en-GB","¥":"ja-JP","₹":"en-IN","A$":"en-AU","C$":"en-CA" };

function walletIcon(type: string, size = 16) {
  if (type === "bank") return <Landmark size={size} />;
  if (type === "ewallet") return <Smartphone size={size} />;
  if (type === "other") return <CreditCard size={size} />;
  return <Wallet size={size} />;
}

export default function Personal() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<PTx[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  const [walletModal, setWalletModal] = useState<null | { id: number; name: string; type: string; opening_balance: string; color: string }>(null);
  const [txModal, setTxModal] = useState<null | { type: "income"|"expense"; amount: string; wallet_id: string; category: string; description: string; tx_date: string }>(null);
  const [transferModal, setTransferModal] = useState<null | { from: string; to: string; amount: string; tx_date: string }>(null);
  const [budgetModal, setBudgetModal] = useState<null | { category: string; monthly_limit: string }>(null);
  const [billModal, setBillModal] = useState<null | { id: number; name: string; amount: string; category: string; due_day: string; wallet_id: string }>(null);

  const { toast, money, currency, confirm } = useApp();
  const month = monthStrWIB();
  const todayDay = parseInt(todayStr().slice(8, 10), 10);

  const groupAmount = (digits: string) => digits ? Number(digits).toLocaleString(CURRENCY_LOCALE[currency] || "en-US") : "";

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const db = await getDb();
      const [w, t, tr, b, bl] = await Promise.all([
        db.select<WalletRow[]>("SELECT * FROM wallets ORDER BY sort_order ASC, created_at ASC"),
        db.select<PTx[]>("SELECT * FROM personal_tx ORDER BY tx_date DESC, created_at DESC"),
        db.select<Transfer[]>("SELECT * FROM transfers ORDER BY tx_date DESC"),
        db.select<Budget[]>("SELECT * FROM budgets ORDER BY category"),
        db.select<Bill[]>("SELECT * FROM bills WHERE active=1 ORDER BY due_day ASC"),
      ]);
      setWallets(w); setTxs(t); setTransfers(tr); setBudgets(b); setBills(bl);
    } catch (e) { toast("Load failed", String(e)); }
  }

  // ── Derived ──
  function walletBalance(id: number, opening: number) {
    let bal = opening;
    for (const t of txs) if (t.wallet_id === id) bal += t.type === "income" ? t.amount : -t.amount;
    for (const tr of transfers) {
      if (tr.from_wallet_id === id) bal -= tr.amount;
      if (tr.to_wallet_id === id) bal += tr.amount;
    }
    return bal;
  }

  const balances = useMemo(() => {
    const map: Record<number, number> = {};
    for (const w of wallets) map[w.id] = walletBalance(w.id, w.opening_balance);
    return map;
  }, [wallets, txs, transfers]);

  const totalBalance = useMemo(() => Object.values(balances).reduce((s, b) => s + b, 0), [balances]);

  const monthStats = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of txs) {
      if (t.tx_date.slice(0, 7) !== month) continue;
      if (t.type === "income") income += t.amount; else expense += t.amount;
    }
    return { income, expense, net: income - expense };
  }, [txs, month]);

  const budgetRows = useMemo(() => {
    return budgets.map(b => {
      const spent = txs
        .filter(t => t.type === "expense" && t.category === b.category && t.tx_date.slice(0, 7) === month)
        .reduce((s, t) => s + t.amount, 0);
      const pct = b.monthly_limit > 0 ? Math.round((spent / b.monthly_limit) * 100) : 0;
      return { ...b, spent, pct, remaining: b.monthly_limit - spent };
    });
  }, [budgets, txs, month]);

  function billStatus(bill: Bill) {
    if (bill.last_paid_month === month) return { label: "Paid this month", color: "var(--green)", state: "paid" as const };
    if (bill.due_day < todayDay) return { label: "Overdue", color: "var(--red)", state: "overdue" as const };
    if (bill.due_day === todayDay) return { label: "Due today", color: "var(--amber)", state: "due" as const };
    return { label: `Due in ${bill.due_day - todayDay} day${bill.due_day - todayDay === 1 ? "" : "s"}`, color: "var(--text-muted)", state: "upcoming" as const };
  }

  const billSummary = useMemo(() => {
    const total = bills.reduce((s, b) => s + b.amount, 0);
    const unpaid = bills.filter(b => b.last_paid_month !== month).reduce((s, b) => s + b.amount, 0);
    const paid = total - unpaid;
    return { total, unpaid, paid };
  }, [bills, month]);

  // ── Wallet actions ──
  async function saveWallet() {
    if (!walletModal || !walletModal.name.trim()) return;
    try {
      const db = await getDb();
      const opening = parseFloat(walletModal.opening_balance.replace(/[^\d.-]/g, "")) || 0;
      if (walletModal.id) {
        await db.execute("UPDATE wallets SET name=?,type=?,opening_balance=?,color=? WHERE id=?",
          [walletModal.name, walletModal.type, opening, walletModal.color, walletModal.id]);
      } else {
        await db.execute("INSERT INTO wallets (name,type,opening_balance,color) VALUES (?,?,?,?)",
          [walletModal.name, walletModal.type, opening, walletModal.color]);
        sounds.success();
      }
      setWalletModal(null);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function delWallet(w: WalletRow) {
    const ok = await confirm({ title: `Delete "${w.name}"?`, message: "Its transactions and transfers are removed too.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM personal_tx WHERE wallet_id=?", [w.id]);
      await db.execute("DELETE FROM transfers WHERE from_wallet_id=? OR to_wallet_id=?", [w.id, w.id]);
      await db.execute("DELETE FROM wallets WHERE id=?", [w.id]);
      toast("Wallet deleted");
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  // ── Transaction actions ──
  async function saveTx() {
    if (!txModal) return;
    const amt = parseFloat(txModal.amount.replace(/[^\d.]/g, ""));
    if (!amt || amt <= 0) { toast("Enter a valid amount"); return; }
    try {
      const db = await getDb();
      await db.execute("INSERT INTO personal_tx (wallet_id,type,amount,category,description,tx_date) VALUES (?,?,?,?,?,?)",
        [txModal.wallet_id ? parseInt(txModal.wallet_id) : null, txModal.type, amt, txModal.category, txModal.description, txModal.tx_date]);
      sounds.success();
      toast(`${txModal.type === "income" ? "Income" : "Expense"} recorded`, money(amt));
      setTxModal(null);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function delTx(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM personal_tx WHERE id=?", [id]);
      sounds.pop();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function saveTransfer() {
    if (!transferModal) return;
    const amt = parseFloat(transferModal.amount.replace(/[^\d.]/g, ""));
    if (!amt || amt <= 0) { toast("Enter a valid amount"); return; }
    if (!transferModal.from || !transferModal.to || transferModal.from === transferModal.to) { toast("Pick two different wallets"); return; }
    try {
      const db = await getDb();
      await db.execute("INSERT INTO transfers (from_wallet_id,to_wallet_id,amount,tx_date) VALUES (?,?,?,?)",
        [parseInt(transferModal.from), parseInt(transferModal.to), amt, transferModal.tx_date]);
      sounds.hit();
      toast("Transfer recorded", money(amt));
      setTransferModal(null);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  // ── Budget actions ──
  async function saveBudget() {
    if (!budgetModal || !budgetModal.category) return;
    const limit = parseFloat(budgetModal.monthly_limit.replace(/[^\d.]/g, "")) || 0;
    try {
      const db = await getDb();
      await db.execute(
        `INSERT INTO budgets (category, monthly_limit) VALUES (?,?)
         ON CONFLICT(category) DO UPDATE SET monthly_limit=excluded.monthly_limit`,
        [budgetModal.category, limit]);
      setBudgetModal(null);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function delBudget(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM budgets WHERE id=?", [id]);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  // ── Bill actions ──
  async function saveBill() {
    if (!billModal || !billModal.name.trim()) return;
    const amt = parseFloat(billModal.amount.replace(/[^\d.]/g, "")) || 0;
    const day = Math.min(28, Math.max(1, parseInt(billModal.due_day) || 1));
    try {
      const db = await getDb();
      if (billModal.id) {
        await db.execute("UPDATE bills SET name=?,amount=?,category=?,due_day=?,wallet_id=? WHERE id=?",
          [billModal.name, amt, billModal.category, day, billModal.wallet_id ? parseInt(billModal.wallet_id) : null, billModal.id]);
      } else {
        await db.execute("INSERT INTO bills (name,amount,category,due_day,wallet_id) VALUES (?,?,?,?,?)",
          [billModal.name, amt, billModal.category, day, billModal.wallet_id ? parseInt(billModal.wallet_id) : null]);
        sounds.success();
      }
      setBillModal(null);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function payBill(bill: Bill) {
    try {
      const db = await getDb();
      await db.execute("INSERT INTO personal_tx (wallet_id,type,amount,category,description,tx_date) VALUES (?,?,?,?,?,?)",
        [bill.wallet_id, "expense", bill.amount, bill.category || "Bills", bill.name, todayStr()]);
      await db.execute("UPDATE bills SET last_paid_month=? WHERE id=?", [month, bill.id]);
      sounds.success();
      toast("Bill paid", `${bill.name} · ${money(bill.amount)}`);
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  async function delBill(id: number) {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM bills WHERE id=?", [id]);
      sounds.pop();
      await load();
    } catch (e) { toast("Failed", String(e)); }
  }

  const walletName = (id: number | null) => wallets.find(w => w.id === id)?.name ?? "—";
  const walletOpts = wallets.map(w => ({ value: String(w.id), label: w.name, color: w.color }));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Personal</h1>
        <span style={{ color: "var(--text-muted)", fontSize: 12, flex: 1 }}>Your life money — separate from projects</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setTransferModal({ from: "", to: "", amount: "", tx_date: todayStr() })}>
          <ArrowLeftRight size={13} /> Transfer
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setTxModal({ type: "income", amount: "", wallet_id: walletOpts[0]?.value ?? "", category: "", description: "", tx_date: todayStr() })}>
          <TrendingUp size={13} /> Income
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setTxModal({ type: "expense", amount: "", wallet_id: walletOpts[0]?.value ?? "", category: "", description: "", tx_date: todayStr() })}>
          <Plus size={13} /> Expense
        </button>
      </div>

      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Hero: total + month */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 12 }}>
          <div className="balance-hero" style={{ minHeight: 0, padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <Wallet size={13} /> Total Balance
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginTop: 6 }}>{money(totalBalance)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>across {wallets.length} wallet{wallets.length === 1 ? "" : "s"}</div>
          </div>
          <MiniStat icon={<TrendingUp size={13} />} label="Income (mo)" value={money(monthStats.income, 0)} color="var(--green)" />
          <MiniStat icon={<TrendingDown size={13} />} label="Spent (mo)" value={money(monthStats.expense, 0)} color="var(--red)" />
          <MiniStat icon={<PiggyBank size={13} />} label="Net (mo)" value={money(monthStats.net, 0)} color={monthStats.net >= 0 ? "var(--accent2)" : "var(--red)"} />
        </div>

        {/* Wallets */}
        <Section title="Wallets" onAdd={() => setWalletModal({ id: 0, name: "", type: "cash", opening_balance: "", color: WALLET_COLORS[0] })} addLabel="Add wallet">
          {wallets.length === 0 ? (
            <Empty icon={<Wallet size={26} />} text="No wallets yet. Add Cash, your Bank, GoPay/OVO…" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {wallets.map(w => (
                <div key={w.id} className="card" style={{ padding: "14px 16px", borderTop: `3px solid ${w.color}`, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: w.color, display: "flex" }}>{walletIcon(w.type)}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{w.name}</span>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "3px 4px" }}
                      onClick={() => setWalletModal({ id: w.id, name: w.name, type: w.type, opening_balance: String(w.opening_balance), color: w.color })}>
                      <Pencil size={11} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "3px 4px" }} onClick={() => delWallet(w)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: balances[w.id] >= 0 ? "var(--text)" : "var(--red)" }}>
                    {money(balances[w.id] ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Budgets */}
        <Section title={`Budgets · ${new Date().toLocaleDateString("en-US",{month:"long"})}`} onAdd={() => setBudgetModal({ category: "", monthly_limit: "" })} addLabel="Set budget">
          {budgetRows.length === 0 ? (
            <Empty icon={<PiggyBank size={26} />} text="No budgets set. Cap a category (e.g. Food) and track it." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {budgetRows.map(b => {
                const over = b.spent > b.monthly_limit;
                const barColor = over ? "var(--red)" : b.pct >= 80 ? "var(--amber)" : "var(--green)";
                return (
                  <div key={b.id} className="card" style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{b.category}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {money(b.spent, 0)} <span style={{ color: "var(--text-dim)" }}>/ {money(b.monthly_limit, 0)}</span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{b.pct}%</span>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "3px 4px" }}
                        onClick={() => setBudgetModal({ category: b.category, monthly_limit: String(b.monthly_limit) })}><Pencil size={11} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "3px 4px" }} onClick={() => delBudget(b.id)}><Trash2 size={11} /></button>
                    </div>
                    <div style={{ height: 7, background: "var(--surface3)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, b.pct)}%`, height: "100%", background: barColor, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: over ? "var(--red)" : "var(--text-muted)", marginTop: 5 }}>
                      {over ? `Over by ${money(Math.abs(b.remaining), 0)}` : `${money(b.remaining, 0)} left`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Bills */}
        <Section title="Recurring Bills" onAdd={() => setBillModal({ id: 0, name: "", amount: "", category: "Bills", due_day: "1", wallet_id: walletOpts[0]?.value ?? "" })} addLabel="Add bill">
          {bills.length === 0 ? (
            <Empty icon={<Repeat size={26} />} text="No recurring bills. Add rent, electricity, subscriptions…" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Totals summary */}
              <div className="card" style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 16px", background: "var(--surface2)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total recurring / month</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{money(billSummary.total, 0)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Still unpaid</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: billSummary.unpaid > 0 ? "var(--amber)" : "var(--green)" }}>{money(billSummary.unpaid, 0)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid this month</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green)" }}>{money(billSummary.paid, 0)}</div>
                </div>
              </div>
              {bills.map(bill => {
                const st = billStatus(bill);
                return (
                  <div key={bill.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderLeft: `3px solid ${st.color}` }}>
                    <Repeat size={15} color="var(--text-muted)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{bill.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bill.category} · day {bill.due_day} · {walletName(bill.wallet_id)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{money(bill.amount, 0)}</div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: st.color }}>{st.label}</div>
                    </div>
                    {st.state !== "paid" && (
                      <button className="btn btn-primary btn-sm" onClick={() => payBill(bill)}>
                        <Check size={12} /> Pay
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "4px 5px" }}
                      onClick={() => setBillModal({ id: bill.id, name: bill.name, amount: String(bill.amount), category: bill.category, due_day: String(bill.due_day), wallet_id: bill.wallet_id ? String(bill.wallet_id) : "" })}>
                      <Pencil size={11} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "4px 5px" }} onClick={() => delBill(bill.id)}><Trash2 size={11} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Recent transactions */}
        <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 420 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            Recent Activity
          </div>
          {txs.length === 0 && transfers.length === 0 ? (
            <Empty icon={<Wallet size={26} />} text="No personal transactions yet." />
          ) : (
            <div style={{ overflowY: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Wallet</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
                <tbody>
                  {txs.map(t => (
                    <tr key={`tx-${t.id}`}>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{t.tx_date}</td>
                      <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                      <td>{t.category || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                      <td style={{ color: "var(--text-muted)" }}>{t.description || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                      <td style={{ color: "var(--text-muted)" }}>{walletName(t.wallet_id)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: t.type === "income" ? "var(--green)" : "var(--red)" }}>
                        {t.type === "income" ? "+" : "-"}{money(t.amount)}
                      </td>
                      <td><button className="btn btn-ghost btn-icon btn-sm" style={{ padding: "4px 6px" }} onClick={() => delTx(t.id)}><Trash2 size={11} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Wallet modal ── */}
      {walletModal && (
        <Modal title={walletModal.id ? "Edit wallet" : "New wallet"} onClose={() => setWalletModal(null)} onSave={saveWallet} saveLabel={walletModal.id ? "Save" : "Create"}>
          <Field label="Name"><input autoFocus value={walletModal.name} onChange={e => setWalletModal({ ...walletModal, name: e.target.value })} placeholder="e.g. BCA, Cash, GoPay" /></Field>
          <div className="form-grid">
            <Field label="Type"><Select value={walletModal.type} onChange={v => setWalletModal({ ...walletModal, type: v })} options={WALLET_TYPES} /></Field>
            <Field label="Opening balance"><input inputMode="numeric" value={groupAmount(walletModal.opening_balance.replace(/\D/g,""))} onChange={e => setWalletModal({ ...walletModal, opening_balance: e.target.value.replace(/\D/g, "") })} placeholder="0" style={{ fontFamily: "monospace" }} /></Field>
          </div>
          <Field label="Color"><ColorRow value={walletModal.color} onChange={c => setWalletModal({ ...walletModal, color: c })} /></Field>
        </Modal>
      )}

      {/* ── Transaction modal ── */}
      {txModal && (
        <Modal title="Add entry" onClose={() => setTxModal(null)} onSave={saveTx} saveLabel="Add">
          <div style={{ display: "flex", gap: 8 }}>
            {(["expense","income"] as const).map(t => (
              <button key={t} className={`btn ${txModal.type === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setTxModal({ ...txModal, type: t, category: "" })}
                style={{ flex: 1, justifyContent: "center", textTransform: "capitalize" }}>
                {t === "income" ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {t}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <Field label={`Amount (${currency})`}><input autoFocus inputMode="numeric" value={groupAmount(txModal.amount.replace(/\D/g,""))} onChange={e => setTxModal({ ...txModal, amount: e.target.value.replace(/\D/g, "") })} placeholder="0" style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 15 }} /></Field>
            <Field label="Date"><DatePicker value={txModal.tx_date} onChange={v => setTxModal({ ...txModal, tx_date: v })} allowClear={false} /></Field>
            <Field label="Wallet"><Select value={txModal.wallet_id} onChange={v => setTxModal({ ...txModal, wallet_id: v })} options={walletOpts} placeholder="Pick wallet" /></Field>
            <Field label="Category"><Select value={txModal.category} onChange={v => setTxModal({ ...txModal, category: v })} placeholder="Select" options={(txModal.type === "expense" ? EXPENSE_CATS : INCOME_CATS).map(c => ({ value: c, label: c }))} /></Field>
          </div>
          <Field label="Description"><input value={txModal.description} onChange={e => setTxModal({ ...txModal, description: e.target.value })} placeholder="Optional note" /></Field>
        </Modal>
      )}

      {/* ── Transfer modal ── */}
      {transferModal && (
        <Modal title="Transfer between wallets" onClose={() => setTransferModal(null)} onSave={saveTransfer} saveLabel="Transfer">
          <div className="form-grid">
            <Field label="From"><Select value={transferModal.from} onChange={v => setTransferModal({ ...transferModal, from: v })} options={walletOpts} placeholder="From wallet" /></Field>
            <Field label="To"><Select value={transferModal.to} onChange={v => setTransferModal({ ...transferModal, to: v })} options={walletOpts} placeholder="To wallet" /></Field>
          </div>
          <div className="form-grid">
            <Field label={`Amount (${currency})`}><input autoFocus inputMode="numeric" value={groupAmount(transferModal.amount.replace(/\D/g,""))} onChange={e => setTransferModal({ ...transferModal, amount: e.target.value.replace(/\D/g, "") })} placeholder="0" style={{ fontFamily: "monospace", fontWeight: 600 }} /></Field>
            <Field label="Date"><DatePicker value={transferModal.tx_date} onChange={v => setTransferModal({ ...transferModal, tx_date: v })} allowClear={false} /></Field>
          </div>
        </Modal>
      )}

      {/* ── Budget modal ── */}
      {budgetModal && (
        <Modal title="Monthly budget" onClose={() => setBudgetModal(null)} onSave={saveBudget} saveLabel="Save">
          <Field label="Category"><Select value={budgetModal.category} onChange={v => setBudgetModal({ ...budgetModal, category: v })} placeholder="Pick category" options={EXPENSE_CATS.map(c => ({ value: c, label: c }))} /></Field>
          <Field label={`Monthly limit (${currency})`}><input autoFocus inputMode="numeric" value={groupAmount(budgetModal.monthly_limit.replace(/\D/g,""))} onChange={e => setBudgetModal({ ...budgetModal, monthly_limit: e.target.value.replace(/\D/g, "") })} placeholder="0" style={{ fontFamily: "monospace", fontWeight: 600 }} /></Field>
        </Modal>
      )}

      {/* ── Bill modal ── */}
      {billModal && (
        <Modal title={billModal.id ? "Edit bill" : "New recurring bill"} onClose={() => setBillModal(null)} onSave={saveBill} saveLabel={billModal.id ? "Save" : "Create"}>
          <Field label="Name"><input autoFocus value={billModal.name} onChange={e => setBillModal({ ...billModal, name: e.target.value })} placeholder="e.g. Rent, Netflix, Electricity" /></Field>
          <div className="form-grid">
            <Field label={`Amount (${currency})`}><input inputMode="numeric" value={groupAmount(billModal.amount.replace(/\D/g,""))} onChange={e => setBillModal({ ...billModal, amount: e.target.value.replace(/\D/g, "") })} placeholder="0" style={{ fontFamily: "monospace", fontWeight: 600 }} /></Field>
            <Field label="Due day (1–28)"><input inputMode="numeric" value={billModal.due_day} onChange={e => setBillModal({ ...billModal, due_day: e.target.value.replace(/\D/g, "") })} placeholder="1" /></Field>
            <Field label="Category"><Select value={billModal.category} onChange={v => setBillModal({ ...billModal, category: v })} options={EXPENSE_CATS.map(c => ({ value: c, label: c }))} /></Field>
            <Field label="Pay from"><Select value={billModal.wallet_id} onChange={v => setBillModal({ ...billModal, wallet_id: v })} options={walletOpts} placeholder="Wallet" /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Small building blocks ──
function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label" style={{ display: "flex", alignItems: "center", gap: 6, color }}>{icon} {label}</div>
      <div className="stat-value" style={{ color, fontSize: 20 }}>{value}</div>
    </div>
  );
}

function Section({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
        <button className="btn btn-ghost btn-sm" onClick={onAdd}><Plus size={12} /> {addLabel}</button>
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", color: "var(--text-muted)" }}>
      <span style={{ opacity: 0.5 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  );
}

function Modal({ title, children, onClose, onSave, saveLabel }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; saveLabel: string }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="form-row"><label>{label}</label>{children}</div>;
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {WALLET_COLORS.map(c => (
        <div key={c} onClick={() => onChange(c)} style={{
          width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
          border: value === c ? "2.5px solid #fff" : "2.5px solid transparent",
          boxShadow: value === c ? `0 0 10px ${c}aa` : "none",
        }} />
      ))}
    </div>
  );
}
