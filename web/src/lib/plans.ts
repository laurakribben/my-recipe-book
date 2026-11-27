import "server-only";
import { cache } from "react";
import { isUuid } from "@/lib/books";
import type { BookRole } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Meal } from "@/lib/week";

// Dates, weeks and meals are plain helpers usable in the browser too; re-exported here.
export * from "@/lib/week";

/** week_start: first day of the week, 1 = Monday ... 7 = Sunday. */
export type Plan = { id: string; name: string; owner_id: string; created_at: string; week_start: number };

export type PlanIdea = { id: string; recipe_id: string | null; title: string; week: string; created_at: string };


export type PlanEntry = {
  id: string;
  plan_id: string;
  day: string;
  meal: Meal;
  /** Order within the cell (smaller first). */
  position: number;
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
