"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canEdit, getBookForUser, isUuid } from "@/lib/books";
import { env } from "@/lib/env";
import { extractRecipe, ExtractionError, type ExtractionInput } from "@/lib/extract";
import { fetchPage, FetchPageError, isLoginWalled } from "@/lib/fetch-page";
import { RecipeInput, SOURCE_TYPES, textToIngredients, textToSteps, textToTags, type RecipeDraft } from "@/lib/recipe";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------- AI extraction

export type ExtractState = { ok: true; draft: RecipeDraft } | { ok: false; error: string } | null;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 3_500_000;

export async function extractAction(bookId: string, _prev: ExtractState, formData: FormData): Promise<ExtractState> {
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) return { ok: false, error: "Du darfst in diesem Buch keine Rezepte anlegen." };

  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ai_extractions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", access.user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= env.aiDailyLimit()) {
    return { ok: false, error: `Tageslimit von ${env.aiDailyLimit()} KI-Rezepten erreicht. Morgen geht es weiter – oder trag das Rezept von Hand ein.` };
  }

  let input: ExtractionInput;
  const mode = formData.get("mode");
  try {
    if (mode === "link") {
      const url = String(formData.get("url") ?? "").trim();
      if (!url) return { ok: false, error: "Bitte einen Link einfügen." };
      if (isLoginWalled(url)) {
        return {
          ok: false,
          error: "Diese Seite erfordert eine Anmeldung und kann nicht direkt gelesen werden. Nutze „Text“ (Beschreibung einfügen) oder „Fotos“ (Screenshots hochladen).",
        };
      }
      input = { kind: "page", page: await fetchPage(url) };
    } else if (mode === "text") {
      const text = String(formData.get("text") ?? "").trim();
      if (text.length < 20) return { ok: false, error: "Bitte den Rezepttext einfügen." };
      if (text.length > 30_000) return { ok: false, error: "Der Text ist zu lang (max. 30.000 Zeichen)." };
      const sourceUrl = String(formData.get("source_url") ?? "").trim();
      input = { kind: "text", text, sourceUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : undefined };
    } else if (mode === "images") {
      const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length === 0) return { ok: false, error: "Bitte mindestens ein Bild auswählen." };
      if (files.length > MAX_IMAGES) return { ok: false, error: `Höchstens ${MAX_IMAGES} Bilder auf einmal.` };
      const images = [];
      for (const file of files) {
        const mediaType = IMAGE_TYPES.find((t) => t === file.type);
        if (!mediaType) return { ok: false, error: "Nur JPG-, PNG-, WebP- oder GIF-Bilder." };
        if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Ein Bild ist zu groß." };
        images.push({ mediaType, base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
      }
      const hint = String(formData.get("hint") ?? "").trim().slice(0, 500);
      input = { kind: "images", images, hint: hint || undefined };
    } else {
      return { ok: false, error: "Unbekannte Eingabe." };
    }

    const result = await extractRecipe(input);
    await supabase.from("ai_extractions").insert({ user_id: access.user.id, ...result.usage });

    const sourceUrl = String(formData.get("source_url") ?? "").trim();
    if (mode === "images" && /^https?:\/\//i.test(sourceUrl)) {
      result.draft.source_url = sourceUrl;
      if (/instagram\.com/.test(sourceUrl)) result.draft.source_type = "instagram";
      else if (/tiktok\.com/.test(sourceUrl)) result.draft.source_type = "tiktok";
    }
    return { ok: true, draft: result.draft };
  } catch (error) {
    if (error instanceof FetchPageError || error instanceof ExtractionError) return { ok: false, error: error.message };
    console.error("Recipe extraction failed", error);
    return { ok: false, error: "Etwas ist schiefgelaufen. Bitte nochmal versuchen." };
  }
}

// ---------------------------------------------------------------- save / delete

export type SaveState = { error: string } | null;

function parseRecipeForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  const sourceType = get("source_type");
  return RecipeInput.safeParse({
    title: get("title"),
    source_url: get("source_url"),
    source_type: (SOURCE_TYPES as readonly string[]).includes(sourceType) ? sourceType : "other",
    source_author: get("source_author"),
    status: formData.get("incomplete") ? "incomplete" : "complete",
    missing: formData.get("incomplete") ? get("missing") : "",
    servings: get("servings"),
    prep_time: get("prep_time"),
    cook_time: get("cook_time"),
    total_time: get("total_time"),
    tags: textToTags(get("tags")),
    ingredients: textToIngredients(get("ingredients")),
    steps: textToSteps(get("steps")),
    notes: get("notes"),
    visibility: get("visibility") === "public" ? "public" : "private",
  });
}

export async function createRecipe(bookId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) return { error: "Du darfst in diesem Buch keine Rezepte anlegen." };
  const parsed = parseRecipeForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ ...parsed.data, book_id: bookId, created_by: access.user.id })
    .select("id")
    .single();
  if (error) return { error: "Das Rezept konnte nicht gespeichert werden." };

  revalidatePath(`/books/${bookId}`);
  redirect(`/recipes/${data.id}`);
}

export async function updateRecipe(recipeId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  if (!isUuid(recipeId)) return { error: "Unbekanntes Rezept." };
  const parsed = parseRecipeForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };

  // RLS only lets owners and editors of the recipe's book update it.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .update(parsed.data)
    .eq("id", recipeId)
    .select("id, book_id")
    .maybeSingle();
  if (error || !data) return { error: "Das Rezept konnte nicht gespeichert werden." };

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath(`/books/${data.book_id}`);
  redirect(`/recipes/${recipeId}`);
}

export async function deleteRecipe(recipeId: string, bookId: string) {
  if (!isUuid(recipeId) || !isUuid(bookId)) redirect("/");
  const supabase = await createClient();
  await supabase.from("recipes").delete().eq("id", recipeId);
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}`);
}
