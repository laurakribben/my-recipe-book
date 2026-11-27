/**
 * Imports the Markdown recipes from the old site (../_recipes/*.md) into a recipe book.
 *
 *   npm run import-recipes -- <book-id> [--visibility public|private] [--dry-run]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).
 * Recipes whose source_url already exists in the book are skipped, so it is safe to run twice.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import matter from "gray-matter";
import { RecipeInput, SOURCE_TYPES, type SourceType } from "../src/lib/recipe";

const here = path.dirname(fileURLToPath(import.meta.url));
const recipesDir = path.resolve(here, "../../_recipes");

const args = process.argv.slice(2);
const bookId = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--visibility");
const visibility = args.includes("--visibility") ? args[args.indexOf("--visibility") + 1] : "public";
const dryRun = args.includes("--dry-run");

if (!bookId || !["public", "private"].includes(visibility)) {
  console.error("Usage: npm run import-recipes -- <book-id> [--visibility public|private] [--dry-run]");
  process.exit(1);
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Markdown links in notes become "text (url)", since notes are plain text in the app. */
const plainNotes = (md: string) => md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").trim();

function toRow(file: string) {
  const { data: fm, content } = matter(readFileSync(path.join(recipesDir, file), "utf8"));
  const sourceType = SOURCE_TYPES.includes(fm.source_type) ? (fm.source_type as SourceType) : "other";
  const parsed = RecipeInput.parse({
    title: str(fm.title),
    source_url: str(fm.source_url),
    source_type: sourceType,
    source_author: str(fm.source_author),
    status: fm.status === "incomplete" ? "incomplete" : "complete",
    missing: str(fm.missing),
    servings: str(fm.servings),
    prep_time: str(fm.prep_time),
    cook_time: str(fm.cook_time),
    total_time: str(fm.total_time),
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    ingredients: (Array.isArray(fm.ingredients) ? fm.ingredients : []).map((g: { name?: string; items?: unknown[] }) => ({
      name: g.name ? String(g.name) : null,
      items: (g.items ?? []).map(String),
    })),
    steps: Array.isArray(fm.steps) ? fm.steps.map(String) : [],
    notes: plainNotes(content),
    visibility,
  });
  const added = fm.added instanceof Date ? fm.added.toISOString() : fm.added ? new Date(String(fm.added)).toISOString() : undefined;
  return { ...parsed, created_at: added, updated_at: added };
}

async function main() {
  const files = readdirSync(recipesDir).filter((f) => f.endsWith(".md"));
  const rows = files.map(toRow);
  console.log(`Found ${rows.length} recipe(s) in ${recipesDir}`);
  if (dryRun) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: book, error: bookError } = await supabase.from("books").select("id, owner_id").eq("id", bookId).single();
  if (bookError || !book) throw new Error(`Book ${bookId} not found.`);

  const { data: existing } = await supabase.from("recipes").select("source_url").eq("book_id", bookId);
  const known = new Set((existing ?? []).map((r) => r.source_url).filter(Boolean));

  for (const row of rows) {
    if (row.source_url && known.has(row.source_url)) {
      console.log(`skip (already imported): ${row.title}`);
      continue;
    }
    const { error } = await supabase.from("recipes").insert({ ...row, book_id: bookId, created_by: book.owner_id });
    if (error) throw new Error(`Import of "${row.title}" failed: ${error.message}`);
    console.log(`imported: ${row.title}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
