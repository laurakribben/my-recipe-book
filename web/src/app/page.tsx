import Link from "next/link";
import type { Book } from "@/lib/books";
import { ROLE_LABELS, type BookRole } from "@/lib/recipe";
import { createClient, getUser } from "@/lib/supabase/server";
import { RecentRecipes } from "@/components/recent";
import { addDays, getMyPlans, MEALS, mealLabel, today, weekStartOf, type PlanEntry } from "@/lib/plans";
import { createBook } from "./books/actions";

export default async function HomePage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const user = await getUser();

  if (!user) {
    return (
      <>
        <h1>Mein Rezeptbuch</h1>
        <p>
          Rezepte aus Instagram, Websites, Videos und Fotos sammeln – die KI macht daraus ein sauberes Rezept auf
          Deutsch. Rezeptbücher lassen sich mit anderen teilen.
        </p>
        <p>
          <Link href="/login" className="button">
            Anmelden
          </Link>
        </p>
        <p className="muted small">Die Nutzung ist nur auf Einladung möglich.</p>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("book_members")
    .select("role, books (id, name, owner_id, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const books = (data ?? [])
    .filter((m) => m.books)
    .map((m) => ({ ...(m.books as unknown as Book), role: m.role as BookRole }));

  // "Heute": dishes planned for today in all of the user's plans, and this week's noted recipes.
  const plans = await getMyPlans(user.id);
  const todayDate = today();
  const { data: todayRows } = plans.length
    ? await supabase
        .from("meal_plan_entries")
        .select("id, plan_id, meal, recipe_id, title, servings, note")
        .in("plan_id", plans.map((p) => p.id))
        .eq("day", todayDate)
        .order("created_at")
    : { data: [] };
  const mealOrder = (meal: string) => MEALS.findIndex((m) => m.id === meal);
  const todayEntries = ((todayRows ?? []) as Pick<PlanEntry, "id" | "plan_id" | "meal" | "recipe_id" | "title" | "servings" | "note">[]).sort(
    (a, b) => mealOrder(a.meal) - mealOrder(b.meal),
  );
  const ownPlan = plans.find((p) => p.role === "owner") ?? plans[0];
  const nextWeek = ownPlan ? addDays(weekStartOf(todayDate, ownPlan.week_start), 7) : null;
  const { data: ideaRows } =
    ownPlan && nextWeek
      ? await supabase
          .from("meal_plan_ideas")
          .select("id, recipe_id, title")
          .eq("plan_id", ownPlan.id)
          .lt("week", nextWeek)
          .order("created_at")
          .limit(6)
      : { data: [] };
  const ideas = ideaRows ?? [];

  if (books.length === 0) {
    return (
      <>
        <h1>Willkommen!</h1>
        {error && <p className="notice error">{error}</p>}
        <p>So legst du los:</p>
        <ol className="onboarding">
          <li>
            <strong>Rezeptbuch anlegen</strong> – z. B. „Backen“ oder „Familie“. Du kannst es später mit anderen teilen.
            <form action={createBook} className="row" style={{ marginTop: "0.5rem" }}>
              <input type="text" name="name" required maxLength={100} placeholder="Name des Rezeptbuchs" style={{ flex: "1 1 14rem" }} aria-label="Name des Rezeptbuchs" />
              <button type="submit">Anlegen</button>
            </form>
          </li>
          <li>
            <strong>Rezepte hinzufügen</strong> – Link zu einer Rezeptseite einfügen, Text oder Screenshots hochladen. Die
            KI macht daraus ein Rezept auf Deutsch.
          </li>
          <li>
            <strong>Woche planen</strong> – Rezepte im Wochenplan auf Tage legen und daraus die Einkaufsliste erstellen.
          </li>
        </ol>
      </>
    );
  }

  return (
    <>
      <h1>Heute</h1>
      {error && <p className="notice error">{error}</p>}
      {todayEntries.length === 0 ? (
        <p className="empty">
          Für heute ist nichts geplant. <Link href="/plans">Zum Wochenplan</Link>
        </p>
      ) : (
        <ul className="today-list">
          {todayEntries.map((e) => (
            <li key={e.id} className="card">
              <div>
                <span className="muted small today-meal">{mealLabel(e.meal)}</span>
                {e.recipe_id ? (
                  <Link href={`/recipes/${e.recipe_id}${e.servings ? `?portionen=${e.servings}` : ""}`}>{e.title}</Link>
                ) : (
                  <span>{e.title}</span>
                )}
                {e.servings && <span className="badge">für {e.servings.toLocaleString("de-DE")}</span>}
                {e.note && <p className="entry-note">{e.note}</p>}
              </div>
              {e.recipe_id && (
                <Link href={`/recipes/${e.recipe_id}/cook${e.servings ? `?portionen=${e.servings}` : ""}`} className="button">
                  Kochmodus
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {ideas.length > 0 && (
        <section>
          <h2>Diese Woche vorgemerkt</h2>
          <ul className="plain-list">
            {ideas.map((i) => (
              <li key={i.id}>
                {i.recipe_id ? <Link href={`/recipes/${i.recipe_id}`}>{i.title}</Link> : i.title}
              </li>
            ))}
          </ul>
          <p className="small">
            <Link href="/plans#ideen">Im Wochenplan einplanen</Link>
          </p>
        </section>
      )}

      <RecentRecipes />

      <h2>Meine Rezeptbücher</h2>
      <ul className="plain-list">
        {books.map((b) => (
          <li key={b.id}>
            <Link href={`/books/${b.id}`}>{b.name}</Link>
            {b.role !== "owner" && <span className="list-tags">Geteilt mit dir · {ROLE_LABELS[b.role]}</span>}
          </li>
        ))}
      </ul>

      <details className="disclosure">
        <summary>Neues Rezeptbuch</summary>
        <form action={createBook} className="row">
          <input type="text" name="name" required maxLength={100} placeholder="z. B. Backen" style={{ flex: "1 1 14rem" }} aria-label="Name des Rezeptbuchs" />
          <button type="submit">Anlegen</button>
        </form>
      </details>
    </>
  );
}
