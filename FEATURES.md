# Alex Tracker — Feature Overview

A local-first desktop app for notes, tasks, habits, finances, projects and goals.
Everything is stored **on your device** in a single SQLite database — no account, no cloud, no internet required.

**Built with:** Tauri 2 (Rust shell) · React + TypeScript · SQLite · custom UI (no UI framework)

---

## 🖥️ The app shell

- **Native desktop window** — custom dark title bar (no browser chrome), minimize / maximize / close, draggable.
- **Custom app icon** across window, taskbar, tray and installer.
- **System tray** — left-click toggles the window; right-click menu (Show / Hide / Quit).
- **Single instance** — launching again focuses the existing window instead of opening a duplicate.
- **Live clock** in the title bar (time + date).
- **Active timer pill** in the title bar when a focus session is running.
- **Window position & size remembered** between launches.
- **Feels like an app, not a web page** — right-click context menus, no browser shortcuts (F5/Ctrl+P/etc. disabled), no text-selection on chrome, themed scrollbars, custom date/time/select pickers.

## ⌨️ Global shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ + K` | Global search (notes, tasks, transactions, logs, projects) |
| `Ctrl/⌘ + N` | Quick capture (in-app) |
| `Ctrl/⌘ + Shift + Space` | Quick capture **system-wide** (works even when hidden) |
| `Esc` | Close any modal / menu |

---

## 📊 Dashboard

- Personalized greeting + today's date.
- **Today's Progress** bar (tasks completed today vs. remaining) with quick-add task box.
- Stat cards: tasks due, notes, monthly net, daily-log streak.
- **This Week** bar chart of tasks completed per day.
- **Mood picker** for today.
- **Up Next** task list, **Habits Today** (check off inline), and recent notes.

## 📝 Notes

- **Board (sticky-note)** and **List** views.
- 8 colors, pin to top, tags, link a note to a project.
- **Markdown** support with a formatting toolbar (headings, bold, italic, lists, task lists, quote, code, link, divider) and a live **Preview** toggle.
- **Paste images directly** — saved to disk (not bloating the database) and rendered in preview.
- **Templates**: Meeting Notes, Daily Journal, Weekly Review, Project Brief, Idea Capture.
- Auto-save, full-text search, right-click menu (open / pin / duplicate / delete).

## ✅ To-Dos

- Priorities (high / medium / low), due dates, projects, reminders.
- Grouped by **Overdue / Due Today / Upcoming / No Date**.
- Filter by status and priority.
- **Bulk actions** — multi-select to mark done/pending, move to project, or delete.
- Project picker that lets you choose an existing project or create a new one inline.

## 📅 Calendar

- Month grid showing tasks as **color-coded event pills** (by priority), mood emoji, and a daily-log indicator.
- **Right-click any day** → add task, set reminder, write daily log, jump to date.
- Side panel with the selected day's log and tasks (tick them off in place).

## 🎯 Habits

- Track daily habits with emoji + color.
- 14-day check grid, current **streak**, and monthly completion count.

## 🔔 Daily Log

- One journal entry per day with a **mood** selector.
- Sidebar of recent entries (shows mood + whether a log exists).
- Word/character count. Builds your journaling **streak**.

## 🏆 Goals

- Quarterly / yearly objectives with description, color, target date.
- Progress slider + quick `+10% / −10% / Done` controls.
- Status: Active / Paused / Achieved. Deadline countdown.

## 📁 Projects (Focus Mode)

- Card per project: status, description, **task progress bar**, P&L (income / expense / net), deadline countdown.
- **Pin** important projects + **drag to reorder**.
- Toggle **"track finances"** — projects that don't need money tracking stay out of the Finance page.
- **Open Project** → focus view with tabs: **Overview · Tasks · Notes · Finances · Time**.
  - Add tasks & notes scoped to the project.
  - Start/stop a **focus timer** that logs time to the project.

## 💰 Finance

- **Available Balance** hero card with trend sparkline and month-over-month change.
- **Today's P&L** strip — net today, vs. yesterday, "better/worse than yesterday".
- Monthly income / expenses / **savings rate**.
- **Income vs Expenses** 6-month bar chart.
- **Spending Breakdown** and **Income Sources** donut charts.
- **Project Performance** — per-project P&L.
- Transactions table (filter by project, scrollable).
- Multi-currency display ($, Rp, €, £, ¥, ₹, A$, C$) with locale-correct thousands separators (e.g. `Rp1.000.000`).

## ⏱️ Time tracking

- Start a focus session from any project; a live timer shows in the title bar.
- Survives restarts; sessions logged per project with totals.

## ⏰ Reminders (alarm style)

- Set a reminder on a task or from the calendar at an **exact time**.
- When due: rings a **looping alarm**, pops a prominent alarm window (brings app to front even from the tray), plus a native OS notification.
- **Snooze 10 min** / **Done** / **Silence** / **Dismiss all**.

## ⚙️ Settings

- **Accent color** (7 themes) — applied instantly app-wide.
- **Currency** symbol.
- **Sound effects** toggle with previews.
- **Auto-backup** — pick a folder + interval (1–30 days); writes a JSON backup automatically.
- **Export backup** (JSON) on demand and **Erase all data** (type-to-confirm).
- Data counts, keyboard-shortcut reference, about.

---

## 🔊 Sound

Subtle synthesized sounds on actions (complete, add, delete) — no audio files shipped. Toggle in Settings. Reminder alarm rings even if UI sounds are muted.

## 🔐 Privacy

100% local. Data lives in your app-data folder (notes, tasks, finances, etc. in `tracker.db`; pasted images in an `images/` folder). Back it up with Auto-backup or manual Export.
