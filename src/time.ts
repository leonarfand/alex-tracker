// Centralised time helpers — everything the user sees or compares is in
// WIB (Asia/Jakarta, UTC+7), regardless of the machine's timezone setting.
//
// Why: `new Date().toISOString()` returns the UTC date, so before 07:00 WIB the
// app would think it's still "yesterday". These helpers always resolve the
// Jakarta wall-clock date/time so "today", reminders, streaks and per-day
// grouping are correct.

const TZ = "Asia/Jakarta";

const dtf = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

function wibParts(d: Date) {
  const o: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  // Some engines emit "24" for midnight — normalise to "00".
  const hour = o.hour === "24" ? "00" : o.hour;
  return { y: o.year, mo: o.month, da: o.day, h: hour, mi: o.minute, s: o.second };
}

/** Today's date in WIB, "YYYY-MM-DD". */
export function todayStr(): string {
  const p = wibParts(new Date());
  return `${p.y}-${p.mo}-${p.da}`;
}

/** A specific instant's WIB date, "YYYY-MM-DD". */
export function dateStrWIB(d: Date): string {
  const p = wibParts(d);
  return `${p.y}-${p.mo}-${p.da}`;
}

/** Current WIB wall-clock stamp, "YYYY-MM-DDTHH:MM:SS". */
export function nowStamp(): string {
  const p = wibParts(new Date());
  return `${p.y}-${p.mo}-${p.da}T${p.h}:${p.mi}:${p.s}`;
}

/** A specific instant as a WIB wall-clock stamp, "YYYY-MM-DDTHH:MM:SS". */
export function stampWIB(d: Date): string {
  const p = wibParts(d);
  return `${p.y}-${p.mo}-${p.da}T${p.h}:${p.mi}:${p.s}`;
}

/** Current WIB month, "YYYY-MM". */
export function monthStrWIB(): string {
  const p = wibParts(new Date());
  return `${p.y}-${p.mo}`;
}

/** Add/subtract whole days from a "YYYY-MM-DD" string (no timezone round-trip). */
export function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
