import "server-only";
import { cache } from "react";
import { isUuid } from "@/lib/books";
import type { BookRole } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";

/** week_start: first day of the week, 1 = Monday ... 7 = Sunday. */
export type Plan = { id: string; name: string; owner_id: string; created_at: string; week_start: number };

export type PlanIdea = { id: string; recipe_id: string | null; title: string; week: string; created_at: string };

export const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export type PlanEntry = {
  id: string;
  plan_id: string;
  day: string;
  recipe_id: string | null;
  title: string;
  servings: number | null;
  note: string | null;
  created_at: string;
};

export type ShoppingItem = {
  id: string;
  text: string;
  checked: boolean;
  entry_id: string | null;
  source: string | null;
  aisle: string | null;
  created_at: string;
};

/** The plan and the current user's role in it, or null if the user isn't a member. */
export const getPlanForUser = cache(async (planId: string) => {
  const user = await getUser();
  if (!user || !isUuid(planId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("meal_plan_members")
    .select("role, meal_plans (id, name, owner_id, created_at, week_start)")
    .eq("plan_id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.meal_plans) return null;
  return { plan: data.meal_plans as unknown as Plan, role: data.role as BookRole, user };
});

/** All plans the user belongs to, own plans first. */
export async function getMyPlans(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meal_plan_members")
    .select("role, meal_plans (id, name, owner_id, created_at, week_start)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? [])
    .filter((m) => m.meal_plans)
    .map((m) => ({ ...(m.meal_plans as unknown as Plan), role: m.role as BookRole }))
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

/** Creates the user's personal plan. The id is made here: reading the row back would fail RLS. */
export async function createPlan(userId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("meal_plans").insert({ id, name, owner_id: userId });
  if (error) {
    console.error("Creating a meal plan failed", { code: error.code, message: error.message });
    throw new Error("Der Wochenplan konnte nicht angelegt werden.");
  }
  return id;
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
