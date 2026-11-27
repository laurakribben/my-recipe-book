"use server";

import { recordAiUsage } from "@/lib/ai-usage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canEdit, isUuid } from "@/lib/books";
import { addDays, formatDay, getPlanForUser, isIsoDate, isMeal, today, weekStartOf, type Meal } from "@/lib/plans";
import type { Recipe } from "@/lib/recipe";
import { parseServings, scaleIngredient } from "@/lib/servings";
import { assignAisles } from "@/lib/aisles";
import { shareWithEmail } from "@/lib/sharing";
import { createClient } from "@/lib/supabase/server";

const ShareRole = z.enum(["editor", "viewer"]);
const PlanName = z.string().trim().min(1).max(100);

/** The plan page normalises any day to the first day of its week. */
function weekUrl(planId: string, day: string) {
  return `/plans/${planId}?woche=${day}`;
}

function settingsUrl(planId: string, msg: string, kind: "ok" | "error" = "ok") {
  return `/plans/${planId}/settings?${kind}=${encodeURIComponent(msg)}`;
}

function shoppingUrl(planId: string, msg: string, kind: "ok" | "error" = "ok") {
  return `/plans/${planId}/einkauf?${kind}=${encodeURIComponent(msg)}`;
}

async function requireEditor(planId: string) {
  const access = await getPlanForUser(planId);
  if (!access || !canEdit(access.role)) redirect("/plans");
  return access;
}

async function requireOwner(planId: string) {
  const access = await getPlanForUser(planId);
  if (!access || access.role !== "owner") redirect("/plans");
  return access;
}

function parseMeal(value: FormDataEntryValue | null): Meal {
  return isMeal(value) ? value : "abends";
}

/** Typed-in ingredients: one per line, at most 50, bullets and blank lines dropped. */
function parseIngredientLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s+/, "").slice(0, 200))
    .filter(Boolean)
    .slice(0, 50);
}

function parseServingsField(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

// ---------------------------------------------------------------- entries

/** Adds a recipe or a free entry ("Reste") to a day. Used by the week view and the recipe page. */
export async function addEntry(planId: string, formData: FormData) {
  const { user } = await requireEditor(planId);
  const day = String(formData.get("day") ?? "");
  if (!isIsoDate(day)) redirect(`/plans/${planId}`);

  const recipeId = String(formData.get("recipe_id") ?? "");
  let title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const supabase = await createClient();

  if (isUuid(recipeId)) {
    // RLS: only recipes the user can see can be planned.
    const { data: recipe } = await supabase.from("recipes").select("title").eq("id", recipeId).maybeSingle();
    if (!recipe) redirect(weekUrl(planId, day));
    title = recipe.title;
  }
  if (!title) redirect(weekUrl(planId, day));

  const { error } = await supabase.from("meal_plan_entries").insert({
    plan_id: planId,
    day,
    meal: parseMeal(formData.get("meal")),
    recipe_id: isUuid(recipeId) ? recipeId : null,
    title,
    servings: parseServingsField(formData.get("servings")),
    note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
    ingredients: parseIngredientLines(formData.get("ingredients")),
    created_by: user.id,
  });
  if (error) console.error("Adding a plan entry failed", { code: error.code, message: error.message });

  revalidatePath(`/plans/${planId}`);
  const back = String(formData.get("back") ?? "");
  redirect(back.startsWith("/recipes/") ? `${back}?geplant=${day}` : `${weekUrl(planId, day)}#tag-${day}`);
}

export async function updateEntry(planId: string, entryId: string, formData: FormData) {
  await requireEditor(planId);
  const day = String(formData.get("day") ?? "");
  if (!isUuid(entryId) || !isIsoDate(day)) redirect(`/plans/${planId}`);
  const supabase = await createClient();
  await supabase
    .from("meal_plan_entries")
    .update({
      day,
      meal: parseMeal(formData.get("meal")),
      servings: parseServingsField(formData.get("servings")),
      note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
      ingredients: parseIngredientLines(formData.get("ingredients")),
    })
    .eq("id", entryId)
    .eq("plan_id", planId);
  revalidatePath(`/plans/${planId}`);
  redirect(`${weekUrl(planId, day)}#tag-${day}`);
}

export type EntrySnapshot = {
  id: string;
  day: string;
  meal: string;
  position: number;
  ingredients: string[];
  recipe_id: string | null;
  title: string;
  servings: number | null;
  note: string | null;
};

/** Removes a plan entry and returns it, so the "Rückgängig" toast can put it back. */
export async function deleteEntry(planId: string, entryId: string): Promise<EntrySnapshot | null> {
  await requireEditor(planId);
  if (!isUuid(entryId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId)
    .eq("plan_id", planId)
    .select("id, day, meal, position, recipe_id, title, servings, note, ingredients")
    .maybeSingle();
  revalidatePath(`/plans/${planId}`);
  return (data as EntrySnapshot | null) ?? null;
}

export async function restoreEntry(planId: string, snapshot: EntrySnapshot) {
  const { user } = await requireEditor(planId);
  if (!isUuid(snapshot.id) || !isIsoDate(snapshot.day) || (snapshot.recipe_id && !isUuid(snapshot.recipe_id))) return;
  const supabase = await createClient();
  await supabase.from("meal_plan_entries").insert({
    id: snapshot.id,
    plan_id: planId,
    day: snapshot.day,
    meal: isMeal(snapshot.meal) ? snapshot.meal : "abends",
    ...(Number.isFinite(snapshot.position) ? { position: snapshot.position } : {}),
    recipe_id: snapshot.recipe_id,
    title: String(snapshot.title).slice(0, 200),
    servings: parseServingsField(String(snapshot.servings ?? "")),
    note: snapshot.note ? String(snapshot.note).slice(0, 500) : null,
    ingredients: Array.isArray(snapshot.ingredients)
      ? snapshot.ingredients.map((i) => String(i).slice(0, 200)).slice(0, 50)
      : [],
    created_by: user.id,
  });
  revalidatePath(`/plans/${planId}`);
}

// ---------------------------------------------------------------- shopping list

/**
 * Adds the ingredients of all recipes planned in a week to the shopping list, scaled
 * to each entry's servings. Entries already on the list are skipped, so it can be
 * pressed again after planning more dishes.
 */
export async function addWeekToShopping(planId: string, weekStart: string) {
  const { user } = await requireEditor(planId);
  if (!isIsoDate(weekStart)) redirect(`/plans/${planId}`);
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("meal_plan_entries")
    .select("id, day, recipe_id, title, servings, ingredients")
    .eq("plan_id", planId)
    .gte("day", weekStart)
    .lte("day", addDays(weekStart, 6))
    .order("day");
  const { data: existing } = await supabase.from("shopping_items").select("entry_id").eq("plan_id", planId);
  const done = new Set((existing ?? []).map((i) => i.entry_id).filter(Boolean));
  // Entries with something to buy: a recipe and/or typed-in ingredients.
  const withItems = (entries ?? []).filter((e) => e.recipe_id || (e.ingredients ?? []).length > 0);
  const todo = withItems.filter((e) => !done.has(e.id));

  if (todo.length === 0) {
    redirect(
      shoppingUrl(
        planId,
        withItems.length
          ? "Die Gerichte dieser Woche stehen schon auf der Liste."
          : "In dieser Woche sind keine Rezepte oder Zutaten geplant.",
      ),
    );
  }

  // RLS: recipes the user can't see (e.g. in a book that isn't shared with them) are skipped.
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, servings, ingredients")
    .in("id", todo.map((e) => e.recipe_id).filter(Boolean));
  const byId = new Map((recipes ?? []).map((r) => [r.id, r as Pick<Recipe, "id" | "title" | "servings" | "ingredients">]));

  const rows = [];
  let skipped = 0;
  for (const entry of todo) {
    const weekday = formatDay(entry.day).split(",")[0];
    // Typed-in ingredients go on the list as written.
    for (const item of (entry.ingredients ?? []) as string[]) {
      rows.push({
        plan_id: planId,
        text: item.slice(0, 300),
        entry_id: entry.id,
        source: `${entry.title} (${weekday})`.slice(0, 200),
        created_by: user.id,
      });
    }
    if (!entry.recipe_id) continue;
    const recipe = byId.get(entry.recipe_id);
    if (!recipe) {
      skipped++;
      continue;
    }
    const base = parseServings(recipe.servings);
    const factor = base && entry.servings ? entry.servings / base : 1;
    for (const group of recipe.ingredients) {
      for (const item of group.items) {
        rows.push({
          plan_id: planId,
          text: scaleIngredient(item, factor).slice(0, 300),
          entry_id: entry.id,
          source: `${recipe.title} (${weekday})`.slice(0, 200),
          created_by: user.id,
        });
      }
    }
  }

  if (rows.length > 0) {
    const sorted = await withAisles(user.id, rows);
    const { error } = await supabase.from("shopping_items").insert(sorted);
    if (error) {
      console.error("Adding to the shopping list failed", { code: error.code, message: error.message });
      redirect(shoppingUrl(planId, "Die Zutaten konnten nicht übernommen werden.", "error"));
    }
  }
  revalidatePath(`/plans/${planId}/einkauf`);
  const dishesAdded = todo.length - skipped;
  redirect(
    shoppingUrl(
      planId,
      `${rows.length} Zutaten aus ${dishesAdded} ${dishesAdded === 1 ? "Gericht" : "Gerichten"} übernommen.` +
        (skipped ? ` ${skipped} Rezept(e) übersprungen, weil du keinen Zugriff darauf hast.` : ""),
    ),
  );
}

/** Lets the AI sort new shopping items into supermarket aisles (falls back to "Sonstiges"). */
async function withAisles<T extends { text: string }>(userId: string, rows: T[]): Promise<(T & { aisle: string })[]> {
  const { aisles, usage } = await assignAisles(rows.map((r) => r.text));
  if (usage) await recordAiUsage(userId, "complete", usage);
  return rows.map((r, i) => ({ ...r, aisle: aisles[i] }));
}

/** Adds own items; several lines become several items. */
export async function addShoppingItems(planId: string, formData: FormData) {
  const { user } = await requireEditor(planId);
  const lines = String(formData.get("text") ?? "")
    .split("\n")
    .map((l) => l.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 50);
  if (lines.length > 0) {
    const supabase = await createClient();
    const rows = await withAisles(
      user.id,
      lines.map((text) => ({ plan_id: planId, text, created_by: user.id })),
    );
    await supabase.from("shopping_items").insert(rows);
  }
  revalidatePath(`/plans/${planId}/einkauf`);
}

/** Ticks an item off (or back on). Everyone in the plan may do this. */
export async function setItemChecked(planId: string, itemId: string, checked: boolean) {
  const access = await getPlanForUser(planId);
  if (!access || !isUuid(itemId)) return;
  const supabase = await createClient();
  await supabase.from("shopping_items").update({ checked }).eq("id", itemId).eq("plan_id", planId);
  revalidatePath(`/plans/${planId}/einkauf`);
}

export type ShoppingSnapshot = {
  id: string;
  text: string;
  checked: boolean;
  entry_id: string | null;
  source: string | null;
  aisle: string | null;
};

/** Removes a shopping item and returns it, so the "Rückgängig" toast can put it back. */
export async function deleteShoppingItem(planId: string, itemId: string): Promise<ShoppingSnapshot | null> {
  await requireEditor(planId);
  if (!isUuid(itemId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopping_items")
    .delete()
    .eq("id", itemId)
    .eq("plan_id", planId)
    .select("id, text, checked, entry_id, source, aisle")
    .maybeSingle();
  revalidatePath(`/plans/${planId}/einkauf`);
  return (data as ShoppingSnapshot | null) ?? null;
}

export async function restoreShoppingItem(planId: string, snapshot: ShoppingSnapshot) {
  const { user } = await requireEditor(planId);
  if (!isUuid(snapshot.id) || (snapshot.entry_id && !isUuid(snapshot.entry_id))) return;
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_items").insert({
    id: snapshot.id,
    plan_id: planId,
    text: String(snapshot.text).slice(0, 300),
    checked: Boolean(snapshot.checked),
    entry_id: snapshot.entry_id,
    source: snapshot.source ? String(snapshot.source).slice(0, 200) : null,
    aisle: snapshot.aisle ? String(snapshot.aisle).slice(0, 50) : null,
    created_by: user.id,
  });
  // The plan entry it came from may be gone by now: restore without the link then.
  if (error?.code === "23503") {
    await supabase.from("shopping_items").insert({
      id: snapshot.id,
      plan_id: planId,
      text: String(snapshot.text).slice(0, 300),
      checked: Boolean(snapshot.checked),
      source: snapshot.source ? String(snapshot.source).slice(0, 200) : null,
      aisle: snapshot.aisle ? String(snapshot.aisle).slice(0, 50) : null,
      created_by: user.id,
    });
  }
  revalidatePath(`/plans/${planId}/einkauf`);
}

export async function clearShoppingItems(planId: string, onlyChecked: boolean) {
  await requireEditor(planId);
  const supabase = await createClient();
  let query = supabase.from("shopping_items").delete().eq("plan_id", planId);
  if (onlyChecked) query = query.eq("checked", true);
  await query;
  revalidatePath(`/plans/${planId}/einkauf`);
  redirect(shoppingUrl(planId, onlyChecked ? "Erledigte Einträge entfernt." : "Liste geleert."));
}

// ---------------------------------------------------------------- sharing and settings

export async function sharePlan(planId: string, formData: FormData) {
  const { user } = await requireOwner(planId);
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  const role = ShareRole.safeParse(formData.get("role"));
  if (!email.success || !role.success) redirect(settingsUrl(planId, "Bitte eine gültige E-Mail-Adresse angeben.", "error"));
  if (email.data === user.email?.toLowerCase()) redirect(settingsUrl(planId, "Das ist dein eigener Plan.", "error"));

  const result = await shareWithEmail("plan", planId, email.data, role.data, user.id);
  revalidatePath(`/plans/${planId}/settings`);
  redirect(settingsUrl(planId, result.message, result.ok ? "ok" : "error"));
}

export async function changePlanMemberRole(planId: string, userId: string, formData: FormData) {
  await requireOwner(planId);
  const role = ShareRole.safeParse(formData.get("role"));
  if (!role.success || !isUuid(userId)) redirect(settingsUrl(planId, "Ungültige Rolle.", "error"));
  const supabase = await createClient();
  await supabase.from("meal_plan_members").update({ role: role.data }).eq("plan_id", planId).eq("user_id", userId);
  redirect(settingsUrl(planId, "Rolle geändert."));
}

export async function removePlanMember(planId: string, userId: string) {
  await requireOwner(planId);
  if (!isUuid(userId)) redirect(settingsUrl(planId, "Ungültige Person.", "error"));
  const supabase = await createClient();
  await supabase.from("meal_plan_members").delete().eq("plan_id", planId).eq("user_id", userId);
  redirect(settingsUrl(planId, "Zugriff entfernt."));
}

export async function withdrawPlanInvite(planId: string, inviteId: string) {
  await requireOwner(planId);
  if (!isUuid(inviteId)) redirect(settingsUrl(planId, "Ungültige Einladung.", "error"));
  const supabase = await createClient();
  await supabase.from("meal_plan_invites").delete().eq("id", inviteId).eq("plan_id", planId);
  redirect(settingsUrl(planId, "Einladung zurückgezogen."));
}

export async function renamePlan(planId: string, formData: FormData) {
  await requireOwner(planId);
  const name = PlanName.safeParse(formData.get("name"));
  if (!name.success) redirect(settingsUrl(planId, "Bitte einen Namen angeben.", "error"));
  const supabase = await createClient();
  await supabase.from("meal_plans").update({ name: name.data }).eq("id", planId);
  revalidatePath(`/plans/${planId}`, "layout");
  redirect(settingsUrl(planId, "Name gespeichert."));
}

export async function leavePlan(planId: string) {
  const access = await getPlanForUser(planId);
  if (!access || access.role === "owner") redirect("/plans");
  const supabase = await createClient();
  await supabase.from("meal_plan_members").delete().eq("plan_id", planId).eq("user_id", access.user.id);
  redirect("/plans");
}

// ---------------------------------------------------------------- idea lists ("Diese Woche" / "Nächste Woche")

export type IdeaList = "this" | "next";

/** Notes a recipe for this or next week, without a day yet. */
export async function addIdea(planId: string, recipeId: string, list: IdeaList, back: string) {
  const { user, plan } = await requireEditor(planId);
  if (!isUuid(recipeId)) redirect(`/plans/${planId}`);
  const supabase = await createClient();
  // RLS: only recipes the user can see.
  const { data: recipe } = await supabase.from("recipes").select("title").eq("id", recipeId).maybeSingle();
  if (!recipe) redirect(`/plans/${planId}`);

  const thisWeek = weekStartOf(today(), plan.week_start);
  const week = list === "this" ? thisWeek : addDays(thisWeek, 7);
  // Don't note the same recipe twice in the same list.
  let existing = supabase.from("meal_plan_ideas").select("id").eq("plan_id", planId).eq("recipe_id", recipeId);
  existing = list === "this" ? existing.lt("week", addDays(thisWeek, 7)) : existing.gte("week", addDays(thisWeek, 7));
  const { data: dupes } = await existing.limit(1);
  if (!dupes?.length) {
    const { error } = await supabase
      .from("meal_plan_ideas")
      .insert({ plan_id: planId, recipe_id: recipeId, title: recipe.title, week, created_by: user.id });
    if (error) console.error("Noting a recipe failed", { code: error.code, message: error.message });
  }
  revalidatePath(`/plans/${planId}`);
  redirect(back.startsWith("/recipes/") ? `${back}?gemerkt=${list}` : `/plans/${planId}`);
}

export async function moveIdea(planId: string, ideaId: string, list: IdeaList) {
  const { plan } = await requireEditor(planId);
  if (!isUuid(ideaId)) redirect(`/plans/${planId}`);
  const thisWeek = weekStartOf(today(), plan.week_start);
  const supabase = await createClient();
  await supabase
    .from("meal_plan_ideas")
    .update({ week: list === "this" ? thisWeek : addDays(thisWeek, 7) })
    .eq("id", ideaId)
    .eq("plan_id", planId);
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}#ideen`);
}

export type IdeaSnapshot = { id: string; recipe_id: string | null; title: string; week: string };

/** Removes a noted recipe and returns it, so the "Rückgängig" toast can put it back. */
export async function deleteIdea(planId: string, ideaId: string): Promise<IdeaSnapshot | null> {
  await requireEditor(planId);
  if (!isUuid(ideaId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("meal_plan_ideas")
    .delete()
    .eq("id", ideaId)
    .eq("plan_id", planId)
    .select("id, recipe_id, title, week")
    .maybeSingle();
  revalidatePath(`/plans/${planId}`);
  return (data as IdeaSnapshot | null) ?? null;
}

export async function restoreIdea(planId: string, snapshot: IdeaSnapshot) {
  const { user } = await requireEditor(planId);
  if (!isUuid(snapshot.id) || !isIsoDate(snapshot.week) || (snapshot.recipe_id && !isUuid(snapshot.recipe_id))) return;
  const supabase = await createClient();
  await supabase.from("meal_plan_ideas").insert({
    id: snapshot.id,
    plan_id: planId,
    recipe_id: snapshot.recipe_id,
    title: String(snapshot.title).slice(0, 200),
    week: snapshot.week,
    created_by: user.id,
  });
  revalidatePath(`/plans/${planId}`);
}

/** Puts a noted recipe on a day: creates the plan entry and removes it from the list. */
export async function planIdea(planId: string, ideaId: string, formData: FormData) {
  const { user } = await requireEditor(planId);
  const day = String(formData.get("day") ?? "");
  if (!isUuid(ideaId) || !isIsoDate(day)) redirect(`/plans/${planId}`);
  const supabase = await createClient();
  const { data: idea } = await supabase
    .from("meal_plan_ideas")
    .select("recipe_id, title")
    .eq("id", ideaId)
    .eq("plan_id", planId)
    .maybeSingle();
  if (!idea) redirect(`/plans/${planId}`);

  const { error } = await supabase.from("meal_plan_entries").insert({
    plan_id: planId,
    day,
    meal: parseMeal(formData.get("meal")),
    recipe_id: idea.recipe_id,
    title: idea.title,
    servings: parseServingsField(formData.get("servings")),
    note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
    created_by: user.id,
  });
  if (error) {
    console.error("Planning an idea failed", { code: error.code, message: error.message });
    redirect(`/plans/${planId}#ideen`);
  }
  await supabase.from("meal_plan_ideas").delete().eq("id", ideaId);
  revalidatePath(`/plans/${planId}`);
  redirect(`${weekUrl(planId, day)}#tag-${day}`);
}

/** Personal setting (each member decides): show the nutrition balance in the meal plan. */
export async function setNutritionBalance(planId: string, formData: FormData) {
  const { user } = (await getPlanForUser(planId)) ?? redirect("/plans");
  const show = formData.get("show_nutrition_balance") === "on";
  const supabase = await createClient();
  await supabase.from("profiles").update({ show_nutrition_balance: show }).eq("id", user.id);
  revalidatePath("/plans", "layout");
  redirect(settingsUrl(planId, show ? "Nährwert-Bilanz wird angezeigt." : "Nährwert-Bilanz ausgeblendet."));
}

export async function setWeekStart(planId: string, formData: FormData) {
  await requireOwner(planId);
  const value = Number(formData.get("week_start"));
  if (!Number.isInteger(value) || value < 1 || value > 7) redirect(settingsUrl(planId, "Ungültiger Wochentag.", "error"));
  const supabase = await createClient();
  await supabase.from("meal_plans").update({ week_start: value }).eq("id", planId);
  revalidatePath(`/plans/${planId}`, "layout");
  redirect(settingsUrl(planId, "Wochenbeginn gespeichert."));
}

// ---------------------------------------------------------------- drag and drop in the week table

/**
 * Puts an entry into a cell at a given place: `orderedIds` is the cell's complete new order
 * (including the moved entry). Returns false if it didn't work.
 */
export async function placeEntry(
  planId: string,
  entryId: string,
  day: string,
  meal: string,
  orderedIds: string[],
): Promise<boolean> {
  await requireEditor(planId);
  if (
    !isUuid(entryId) ||
    !isIsoDate(day) ||
    !isMeal(meal) ||
    !Array.isArray(orderedIds) ||
    orderedIds.length > 100 ||
    !orderedIds.every((id) => typeof id === "string" && isUuid(id)) ||
    !orderedIds.includes(entryId)
  ) {
    return false;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ day, meal })
    .eq("id", entryId)
    .eq("plan_id", planId);
  if (error) return false;
  // Only entries that really are in this cell are renumbered.
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase
        .from("meal_plan_entries")
        .update({ position })
        .eq("id", id)
        .eq("plan_id", planId)
        .eq("day", day)
        .eq("meal", meal),
    ),
  );
  revalidatePath(`/plans/${planId}`);
  return results.every((r) => !r.error);
}

/** Moves everything in one cell to another cell (added to what's there). */
export async function moveCell(planId: string, fromDay: string, fromMeal: string, toDay: string, toMeal: string): Promise<boolean> {
  await requireEditor(planId);
  if (!isIsoDate(fromDay) || !isIsoDate(toDay) || !isMeal(fromMeal) || !isMeal(toMeal)) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ day: toDay, meal: toMeal })
    .eq("plan_id", planId)
    .eq("day", fromDay)
    .eq("meal", fromMeal);
  revalidatePath(`/plans/${planId}`);
  return !error;
}

/** Drops a noted recipe ("Diese Woche"/"Nächste Woche") onto a cell: plans it and removes it from the list. */
export async function planIdeaAt(planId: string, ideaId: string, day: string, meal: string): Promise<boolean> {
  const { user } = await requireEditor(planId);
  if (!isUuid(ideaId) || !isIsoDate(day) || !isMeal(meal)) return false;
  const supabase = await createClient();
  const { data: idea } = await supabase
    .from("meal_plan_ideas")
    .select("recipe_id, title")
    .eq("id", ideaId)
    .eq("plan_id", planId)
    .maybeSingle();
  if (!idea) return false;
  const { error } = await supabase.from("meal_plan_entries").insert({
    plan_id: planId,
    day,
    meal,
    recipe_id: idea.recipe_id,
    title: idea.title,
    created_by: user.id,
  });
  if (error) {
    console.error("Planning an idea by drag and drop failed", { code: error.code, message: error.message });
    return false;
  }
  await supabase.from("meal_plan_ideas").delete().eq("id", ideaId);
  revalidatePath(`/plans/${planId}`);
  return true;
}
