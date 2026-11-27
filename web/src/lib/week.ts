/** Week, date and meal helpers (no server code, usable in the browser). Dates are YYYY-MM-DD. */

export const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/** Rows of the week table, in order. */
export const MEALS = [
  { id: "morgens", label: "Morgens" },
  { id: "mittags", label: "Mittags" },
  { id: "abends", label: "Abends" },
  { id: "snack", label: "Snack" },
] as const;
export type Meal = (typeof MEALS)[number]["id"];

export function isMeal(value: unknown): value is Meal {
  return MEALS.some((m) => m.id === value);
}

export function mealLabel(meal: string): string {
  return MEALS.find((m) => m.id === meal)?.label ?? "Abends";
}

// ---------------------------------------------------------------- dates (YYYY-MM-DD, Europe/Berlin)

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First day of the week containing `date`, for weeks starting on `weekStart` (1 = Monday ... 7 = Sunday). */
export function weekStartOf(date: string, weekStart = 1): string {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return addDays(date, -((isoDay - weekStart + 7) % 7));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const dayFormat = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Montag, 30. November" */
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

/** "30. Nov. – 6. Dez." */
export function formatWeek(start: string): string {
  return `${shortFormat.format(new Date(`${start}T00:00:00Z`))} – ${shortFormat.format(new Date(`${addDays(start, 6)}T00:00:00Z`))}`;
}
