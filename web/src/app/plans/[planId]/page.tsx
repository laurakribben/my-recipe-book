import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit } from "@/lib/books";
import {
  addDays,
  formatDay,
  formatWeek,
  getMyPlans,
  getPlanForUser,
  isIsoDate,
  weekStartOf,
  today,
  weekDays,
  MEALS,
  type PlanEntry,
  type PlanIdea,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { UndoableRemove } from "@/components/toast";
import { BackIcon, CalendarPlusIcon, CartIcon, ForwardIcon, SettingsIcon, ShareIcon } from "@/components/icons";
import { IconPopover, MoreMenu } from "@/components/more-menu";
import { AddEntryDialog } from "@/components/plan-dialogs";
import { EstimateInBackground } from "./estimate-in-background";
import { DraggableIdea } from "./draggable-idea";
import { WeekTable } from "./week-table";
import { WeekBalance } from "@/components/balance-view";
import { computeBalance } from "@/lib/balance";
import { getProfile } from "@/lib/profile";
import {
  addEntry,
  loadPlannableRecipes,
  estimateEntryNutrition,
  addWeekToShopping,
  deleteIdea,
  moveIdea,
  planIdea,
  restoreIdea,
  type IdeaList,
} from "../actions";

type Props = { params: Promise<{ planId: string }>; searchParams: Promise<{ woche?: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { planId } = await props.params;
  const access = await getPlanForUser(planId);
  return { title: access?.plan.name ?? "Wochenplan" };
}

export default async function PlanWeekPage(props: Props) {
  const { planId } = await props.params;
  const { woche } = await props.searchParams;
  const access = await getPlanForUser(planId);
  if (!access) notFound();
  const { plan, role, user } = access;
  const editable = canEdit(role);

  const todayDate = today();
  const thisWeek = weekStartOf(todayDate, plan.week_start);
  const weekStart = weekStartOf(isIsoDate(woche) ? woche : todayDate, plan.week_start);
  const days = weekDays(weekStart);

  const supabase = await createClient();

  // Independent queries run at the same time: each one is a round trip to the database.
  const [{ data: entryRows }, profile, { data: ideaRows }, plans] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("id, plan_id, day, meal, position, recipe_id, title, servings, note, ingredients, nutrition, nutrition_checked, created_at")
      .eq("plan_id", plan.id)
      .gte("day", days[0])
      .lte("day", days[6])
      .order("position")
      .order("created_at"),
    getProfile(),
    supabase.from("meal_plan_ideas").select("id, recipe_id, title, week, created_at").eq("plan_id", plan.id).order("created_at"),
    getMyPlans(user.id),
  ]);
  const entries = (entryRows ?? []) as PlanEntry[];
  const hasShoppingItems = entries.some((e) => e.recipe_id || (e.ingredients ?? []).length > 0);

  // Nutrition balance per day and for the week (personal setting, on by default).
  const showBalance = profile?.showNutritionBalance ?? true;
  const recipeIds = [...new Set(entries.map((e) => e.recipe_id).filter((id): id is string => Boolean(id)))];
  const { data: nutritionRows } =
    showBalance && recipeIds.length > 0
      ? await supabase.from("recipes").select("id, nutrition, servings").in("id", recipeIds)
      : { data: [] };
  const nutritionById = new Map((nutritionRows ?? []).map((r) => [r.id, r]));
  const balanceItems = (list: PlanEntry[]) =>
    list.map((e) => {
      // Free entries carry their own estimate for one portion.
      if (!e.recipe_id) return { nutrition: e.nutrition ?? null, servings: null };
      const r = nutritionById.get(e.recipe_id);
      return { nutrition: r?.nutrition ?? null, servings: r?.servings ?? null };
    });
  const dayBalances = showBalance
    ? Object.fromEntries(days.map((d) => [d, computeBalance(balanceItems(entries.filter((e) => e.day === d)))]))
    : null;
  const weekBalance = showBalance ? computeBalance(balanceItems(entries)) : null;
  // Free entries of this week without an estimate yet; the page estimates them in the background.
  const unestimated = entries.filter((e) => !e.recipe_id && !e.nutrition_checked).length;

  // Idea lists: everything up to this week is "Diese Woche" (left-overs included), later is "Nächste Woche".
  const nextWeek = addDays(thisWeek, 7);
  const ideas = (ideaRows ?? []) as PlanIdea[];
  const ideaLists: { list: IdeaList; title: string; start: string; items: PlanIdea[] }[] = [
    { list: "this", title: "Diese Woche", start: thisWeek, items: ideas.filter((i) => i.week < nextWeek) },
    { list: "next", title: "Nächste Woche", start: nextWeek, items: ideas.filter((i) => i.week >= nextWeek) },
  ];


  return (
    <>
      <div className="title-row">
        <h1>{plan.name}</h1>
        <div className="title-actions">
          <MoreMenu>
            {editable && hasShoppingItems && (
              <form action={addWeekToShopping.bind(null, plan.id, weekStart)}>
                <button type="submit" role="menuitem">
                  <CartIcon /> Einkaufsliste für diese Woche
                </button>
              </form>
            )}
            <Link href={`/plans/${plan.id}/settings#teilen`} role="menuitem">
              <ShareIcon /> {role === "owner" ? "Teilen" : "Mitglieder"}
            </Link>
            {role === "owner" && (
              <Link href={`/plans/${plan.id}/settings#einstellungen`} role="menuitem">
                <SettingsIcon /> Einstellungen
              </Link>
            )}
          </MoreMenu>
        </div>
      </div>
      {plans.length > 1 && (
        <p className="small">
          Weitere Pläne:{" "}
          {plans
            .filter((p) => p.id !== plan.id)
            .map((p, i) => (
              <span key={p.id}>
                {i > 0 && " · "}
                <Link href={`/plans/${p.id}`}>{p.name}</Link>
              </span>
            ))}
        </p>
      )}

      <section id="ideen" className="ideas" aria-label="Ideen">
        {ideaLists.map(({ list, title, start, items }) => (
          <div key={list} className="idea-list">
            <h2>
              {title} <span className="muted small">({items.length})</span>
            </h2>
            {items.length === 0 && (
              <p className="empty small">Merke Rezepte auf der Rezeptseite mit „{title}“ vor.</p>
            )}
            <ul className="plain-list">
              {items.map((idea) => (
                <DraggableIdea key={idea.id} id={idea.id} title={idea.title} recipeId={idea.recipe_id} enabled={editable}>
                  {idea.recipe_id ? <Link href={`/recipes/${idea.recipe_id}`}>{idea.title}</Link> : <span>{idea.title}</span>}
                  {editable && (
                    <span className="idea-actions">
                      <IconPopover icon={<CalendarPlusIcon />} label="Einplanen">
                        <form action={planIdea.bind(null, plan.id, idea.id)} className="grid-2">
                          <label className="field">
                            <span>Tag</span>
                            <select name="day" defaultValue={list === "this" && todayDate >= start ? todayDate : start}>
                              {weekDays(start).map((d) => (
                                <option key={d} value={d}>
                                  {formatDay(d)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Mahlzeit</span>
                            <select name="meal" defaultValue="abends">
                              {MEALS.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Portionen</span>
                            <input type="number" name="servings" min={1} max={100} step="any" placeholder="wie im Rezept" />
                          </label>
                          <label className="field">
                            <span>Notiz (optional)</span>
                            <input type="text" name="note" maxLength={500} />
                          </label>
                          <div className="row">
                            <button type="submit">Einplanen</button>
                          </div>
                        </form>
                      </IconPopover>
                      <form action={moveIdea.bind(null, plan.id, idea.id, list === "this" ? "next" : "this")}>
                        <button
                          type="submit"
                          className="secondary icon-button"
                          aria-label={list === "this" ? "In „Nächste Woche“ verschieben" : "In „Diese Woche“ verschieben"}
                          title={list === "this" ? "In „Nächste Woche“ verschieben" : "In „Diese Woche“ verschieben"}
                        >
                          {list === "this" ? <ForwardIcon /> : <BackIcon />}
                        </button>
                      </form>
                      <UndoableRemove
                        remove={deleteIdea.bind(null, plan.id, idea.id)}
                        restore={restoreIdea.bind(null, plan.id)}
                        message={`„${idea.title}“ entfernt.`}
                      />
                    </span>
                  )}
                </DraggableIdea>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <nav className="week-nav" aria-label="Woche">
        <Link
          href={`/plans/${plan.id}?woche=${addDays(weekStart, -7)}`}
          aria-label="Vorherige Woche"
          className="button secondary icon-button"
        >
          ←
        </Link>
        <span>
          <strong>{formatWeek(weekStart)}</strong>
          {weekStart !== thisWeek && (
            <>
              {" "}
              · <Link href={`/plans/${plan.id}`}>Diese Woche</Link>
            </>
          )}
        </span>
        <Link
          href={`/plans/${plan.id}?woche=${addDays(weekStart, 7)}`}
          aria-label="Nächste Woche"
          className="button secondary icon-button"
        >
          →
        </Link>
      </nav>


      {entries.length === 0 && editable && (
        <div className="card empty-state">
          <p style={{ marginTop: 0 }}>
            <strong>Diese Woche ist noch leer.</strong>
          </p>
          <p className="hint" style={{ marginBottom: 0 }}>
            Tippe auf <strong>+</strong> bei einer Mahlzeit, oder merke Rezepte auf der Rezeptseite mit „Merken für: Diese
            Woche“ vor und plane sie oben ein. Aus den geplanten Rezepten entsteht mit einem Tipp die Einkaufsliste.
          </p>
        </div>
      )}

      {editable && (
        <AddEntryDialog
          action={addEntry.bind(null, plan.id)}
          loadRecipes={loadPlannableRecipes}
        />
      )}

      {editable && (
        <p className="hint drag-hint">
          Tipp: Rezepte, ganze Zellen und vorgemerkte Rezepte lassen sich mit der Maus auf einen anderen Tag oder eine
          andere Mahlzeit ziehen.
        </p>
      )}
      <WeekTable
        planId={plan.id}
        days={days}
        todayDate={todayDate}
        entries={entries}
        editable={editable}
        dayBalances={dayBalances}
      />

      {editable && showBalance && unestimated > 0 && (
        <EstimateInBackground key={unestimated} run={estimateEntryNutrition.bind(null, plan.id, days)} />
      )}
      {/* Below the table: the week's summary and what to do with it. */}
      {weekBalance && <WeekBalance balance={weekBalance} />}
    </>
  );
}
