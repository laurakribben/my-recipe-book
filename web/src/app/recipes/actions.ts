"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canEdit, getBookForUser, isUuid } from "@/lib/books";
import { env } from "@/lib/env";
import { extractRecipe, ExtractionError, type ExtractionInput } from "@/lib/extract";
import { fetchImage, fetchPage, FetchPageError, isLoginWalled } from "@/lib/fetch-page";
import { deleteRecipeImages, storeRecipeImage } from "@/lib/image-storage";
import { isImageType } from "@/lib/images";
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
    image_credit: get("image_credit"),
    image_source_url: get("image_source_url"),
  });
}

type ImageChange = { kind: "keep" } | { kind: "remove" } | { kind: "new"; path: string };

const MAX_UPLOAD_BYTES = 4_000_000;

/**
 * Works out what happens to the recipe's picture: a newly uploaded file, the picture
 * suggested from the source web page, removal, or no change. Only call this after
 * checking that the user may edit recipes in the book.
 */
async function resolveImage(formData: FormData, bookId: string, recipeId: string): Promise<ImageChange | { error: string }> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!isImageType(file.type)) return { error: "Bitte ein JPG-, PNG-, WebP- oder GIF-Bild wählen." };
    if (file.size > MAX_UPLOAD_BYTES) return { error: "Das Bild ist zu groß." };
    const path = await storeRecipeImage(bookId, recipeId, new Uint8Array(await file.arrayBuffer()), file.type);
    return { kind: "new", path };
  }
  if (formData.get("remove_image")) return { kind: "remove" };

  const suggested = String(formData.get("suggested_image_url") ?? "");
  if (formData.get("use_suggested_image") && /^https?:\/\//i.test(suggested)) {
    try {
      const { bytes, type } = await fetchImage(suggested);
      if (isImageType(type)) return { kind: "new", path: await storeRecipeImage(bookId, recipeId, bytes, type) };
      console.error("Suggested image has an unsupported type", { type });
    } catch (error) {
      // The recipe is still saved, just without the picture; it can be added later.
      console.error("Suggested image could not be stored", error instanceof Error ? error.message : error);
    }
  }
  return { kind: "keep" };
}

/** Adds the picture path; without a picture there is no picture source either. */
function withImage<T extends { image_credit: string | null; image_source_url: string | null }>(data: T, imagePath: string | null) {
  return imagePath
    ? { ...data, image_path: imagePath }
    : { ...data, image_path: null, image_credit: null, image_source_url: null };
}

export async function createRecipe(bookId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) return { error: "Du darfst in diesem Buch keine Rezepte anlegen." };
  const parsed = parseRecipeForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };

  const id = crypto.randomUUID();
  const image = await resolveImage(formData, bookId, id);
  if ("error" in image) return image;

  const supabase = await createClient();
  const imagePath = image.kind === "new" ? image.path : null;
  const { error } = await supabase.from("recipes").insert({
    ...withImage(parsed.data, imagePath),
    id,
    book_id: bookId,
    created_by: access.user.id,
  });
  if (error) {
    if (image.kind === "new") await deleteRecipeImages([image.path]);
    console.error("Creating a recipe failed", { code: error.code, message: error.message });
    return { error: "Das Rezept konnte nicht gespeichert werden." };
  }

  revalidatePath(`/books/${bookId}`);
  redirect(`/recipes/${id}`);
}

export async function updateRecipe(recipeId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  if (!isUuid(recipeId)) return { error: "Unbekanntes Rezept." };
  const parsed = parseRecipeForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("recipes")
    .select("book_id, image_path")
    .eq("id", recipeId)
    .maybeSingle();
  const access = current ? await getBookForUser(current.book_id) : null;
  if (!current || !access || !canEdit(access.role)) return { error: "Du darfst dieses Rezept nicht bearbeiten." };

  const image = await resolveImage(formData, current.book_id, recipeId);
  if ("error" in image) return image;
  const imagePath = image.kind === "new" ? image.path : image.kind === "remove" ? null : current.image_path;

  // RLS also checks that only owners and editors of the recipe's book can update it.
  const { error } = await supabase
    .from("recipes")
    .update(withImage(parsed.data, imagePath))
    .eq("id", recipeId);
  if (error) {
    if (image.kind === "new") await deleteRecipeImages([image.path]);
    console.error("Updating a recipe failed", { code: error.code, message: error.message });
    return { error: "Das Rezept konnte nicht gespeichert werden." };
  }
  if (image.kind !== "keep") await deleteRecipeImages([current.image_path]);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath(`/books/${current.book_id}`);
  redirect(`/recipes/${recipeId}`);
}

export async function deleteRecipe(recipeId: string, bookId: string) {
  if (!isUuid(recipeId) || !isUuid(bookId)) redirect("/");
  const supabase = await createClient();
  const { data: deleted } = await supabase.from("recipes").delete().eq("id", recipeId).select("image_path");
  await deleteRecipeImages((deleted ?? []).map((r) => r.image_path));
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}`);
}
