import Image from "next/image";
import Link from "next/link";
import { CookIcon, PlusIcon } from "@/components/icons";
import { IconPopover } from "@/components/more-menu";
import { RecipeSlideshow, type Slide } from "@/components/recipe-slideshow";
import { imageUrl } from "@/lib/images";
import { getProfile } from "@/lib/profile";
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
  const [{ data }, plans] = await Promise.all([
    supabase
      .from("book_members")
      .select("role, books (id, name, owner_id, created_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    getMyPlans(user.id),
  ]);

  const books = (data ?? [])
    .filter((m) => m.books)
    .map((m) => ({
      ...(m.books as unknown as Book),
      role: m.role as BookRole,
    }));

  // "Heute": dishes planned for today in all of the user's plans, and this week's noted recipes.
  const todayDate = today();
  const ownPlan = plans.find((p) => p.role === "owner") ?? plans[0];
  const nextWeek = ownPlan ? addDays(weekStartOf(todayDate, ownPlan.week_start), 7) : null;
  const [{ data: todayRows }, { data: ideaRows }, { data: recipeRows }, profile] = await Promise.all([
    plans.length
      ? supabase
          .from("meal_plan_entries")
          .select("id, plan_id, meal, recipe_id, title, servings, note")
          .in(
            "plan_id",
            plans.map((p) => p.id),
          )
          .eq("day", todayDate)
          .order("position")
          .order("created_at")
      : { data: [] },
    ownPlan && nextWeek
      ? supabase
          .from("meal_plan_ideas")
          .select("id, recipe_id, title")
          .eq("plan_id", ownPlan.id)
          .lt("week", nextWeek)
          .order("created_at")
          .limit(6)
      : { data: [] },
    // For the slideshow and the book covers (newest first).
    books.length
      ? supabase
          .from("recipes")
          .select("id, title, image_path, book_id")
          .in(
            "book_id",
            books.map((b) => b.id),
          )
          .order("created_at", { ascending: false })
          .limit(500)
      : { data: [] },
    getProfile(),
  ]);
  const recipes = recipeRows ?? [];
  const bookName = new Map(books.map((b) => [b.id, b.name]));
  const slides: Slide[] = pickRandom(
    recipes.filter((r) => r.image_path),
    SLIDES,
  ).map((r) => ({ id: r.id, title: r.title, image: imageUrl(r.image_path), book: bookName.get(r.book_id) ?? "" }));
  const covers = new Map<string, { image: string | null; count: number }>();
  for (const r of recipes) {
    const c = covers.get(r.book_id) ?? { image: null, count: 0 };
    covers.set(r.book_id, { image: c.image ?? imageUrl(r.image_path), count: c.count + 1 });
  }
  const mealOrder = (meal: string) => MEALS.findIndex((m) => m.id === meal);
  const todayEntries = (
    (todayRows ?? []) as Pick<PlanEntry, "id" | "plan_id" | "meal" | "recipe_id" | "title" | "servings" | "note">[]
  ).sort((a, b) => mealOrder(a.meal) - mealOrder(b.meal));
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
              <input
                type="text"
                name="name"
                required
                maxLength={100}
                placeholder="Name des Rezeptbuchs"
                style={{ flex: "1 1 14rem" }}
                aria-label="Name des Rezeptbuchs"
              />
              <button type="submit">Anlegen</button>
            </form>
          </li>
          <li>
            <strong>Rezepte hinzufügen</strong> – Link zu einer Rezeptseite einfügen, Text oder Screenshots hochladen.
            Die KI macht daraus ein Rezept auf Deutsch.
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
      <div className="home-hello">
        <h1>
          {greeting()}, {profile?.shownName ?? "schön, dass du da bist"}!
        </h1>
        <p className="muted">Worauf hast du heute Lust?</p>
      </div>
      {error && <p className="notice error">{error}</p>}
      <RecipeSlideshow slides={slides} />

      <div className="home-grid">
        <div>
          <section className="home-section">
            <h2>Heute</h2>
            {todayEntries.length === 0 ? (
              <p className="empty">
                Für heute ist noch nichts geplant. <Link href="/plans">Zum Wochenplan</Link>
              </p>
            ) : (
              <ul className="today-list">
                {todayEntries.map((e) => (
                  <li key={e.id}>
                    <div>
                      <span className="meal-pill">{mealLabel(e.meal)}</span>
                      {e.recipe_id ? (
                        <Link href={`/recipes/${e.recipe_id}${e.servings ? `?portionen=${e.servings}` : ""}`}>
                          {e.title}
                        </Link>
                      ) : (
                        <span>{e.title}</span>
                      )}
                      {e.servings && <span className="badge">für {e.servings.toLocaleString("de-DE")}</span>}
                      {e.note && <p className="entry-note">{e.note}</p>}
                    </div>
                    {e.recipe_id && (
                      <Link
                        href={`/recipes/${e.recipe_id}/cook${e.servings ? `?portionen=${e.servings}` : ""}`}
                        className="button icon-button"
                        aria-label={`Kochmodus: ${e.title}`}
                        title="Kochmodus"
                      >
                        <CookIcon />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ideas.length > 0 && (
            <section className="home-section">
              <h2>Diese Woche vorgemerkt</h2>
              <ul className="chip-list">
                {ideas.map((i) => (
                  <li key={i.id}>
                    {i.recipe_id ? <Link href={`/recipes/${i.recipe_id}`}>{i.title}</Link> : <span>{i.title}</span>}
                  </li>
                ))}
              </ul>
              <p className="small">
                <Link href="/plans#ideen">Im Wochenplan einplanen</Link>
              </p>
            </section>
          )}

          <RecentRecipes />
        </div>
        <section>
          <div className="title-row section-head">
            <h2>Meine Rezeptbücher</h2>
            <IconPopover icon={<PlusIcon />} label="Neues Rezeptbuch">
              <p className="popover-title">Neues Rezeptbuch</p>
              <form action={createBook} className="row">
                <input
                  type="text"
                  name="name"
                  required
                  maxLength={100}
                  placeholder="z. B. Backen"
                  style={{ flex: "1 1 10rem" }}
                  aria-label="Name des Rezeptbuchs"
                />
                <button type="submit">Anlegen</button>
              </form>
            </IconPopover>
          </div>
          <ul className="book-grid">
            {books.map((b) => {
              const cover = covers.get(b.id);
              return (
                <li key={b.id}>
                  <Link href={`/books/${b.id}`} className="book-card">
                    <span className="book-cover">
                      {cover?.image ? (
                        <Image src={cover.image} alt="" fill sizes="(max-width: 720px) 50vw, 240px" />
                      ) : (
                        <span aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="book-name">{b.name}</span>
                    <span className="list-tags">
                      {cover?.count ?? 0} {cover?.count === 1 ? "Rezept" : "Rezepte"}
                      {b.role !== "owner" && <> · geteilt ({ROLE_LABELS[b.role]})</>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

const SLIDES = 8;

/** Up to n random items (a fresh pick on every visit). */
function pickRandom<T>(items: T[], n: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** "Guten Morgen" / "Hallo" / "Guten Abend" by the time in Germany. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(
      new Date(),
    ),
  );
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 17 || hour < 5) return "Guten Abend";
  return "Hallo";
}
