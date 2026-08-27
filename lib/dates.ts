/* ---------------------------------------------------------------------------
 * Dates are handled in the LIFTER'S timezone, not the server's.
 *
 * `toISOString()` formats in UTC. On a laptop in Dallas that's the same day for
 * most of it — but from 7pm local, UTC has already rolled over, so the app
 * would show tomorrow's session while you're still in the gym doing today's.
 * That bug only ever appears in the evening, which is exactly when this app is
 * used.
 *
 * Vercel reserves the TZ variable, so the zone can't be set at the process
 * level. Formatting explicitly is better anyway: it behaves the same locally
 * and deployed, and doesn't depend on how the host is configured.
 *
 * "en-CA" is the trick — its short date format is already YYYY-MM-DD.
 * ------------------------------------------------------------------------- */
export const APP_TIMEZONE =
  process.env.APP_TIMEZONE?.trim() || "America/Chicago";

const ISO_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function iso(d: Date): string {
  return ISO_FORMATTER.format(d);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday of the week containing `d`. Weeks run Monday to Sunday. */
export function mondayOf(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(out, diff);
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Always derive the weekday from the date rather than assuming it. An
 * off-by-one weekday label is the kind of small wrongness that makes a lifter
 * distrust everything else in the plan.
 */
export function dayName(isoDate: string): string {
  return DAY_NAMES[new Date(isoDate + "T12:00:00").getDay()];
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function prettyDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function prettyRange(startIso: string, endIso: string): string {
  const s = new Date(startIso + "T12:00:00");
  const e = new Date(endIso + "T12:00:00");
  if (s.getMonth() === e.getMonth()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
  }
  return `${prettyDate(startIso)} – ${prettyDate(endIso)}`;
}

export function today(): string {
  return iso(new Date());
}
