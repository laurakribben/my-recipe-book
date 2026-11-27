"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { canEdit, getBookForUser, isUuid } from "@/lib/books";
import { aiCallsLeft, aiLimit, recordAiUsage } from "@/lib/ai-usage";
import { extractRecipe, ExtractionError, type ExtractionInput } from "@/lib/extract";
import { fetchImage, fetchPage, FetchPageError, isLoginWalled } from "@/lib/fetch-page";
import { deleteRecipeImages, storeRecipeImage } from "@/lib/image-storage";
import { isImageType } from "@/lib/images";
import {
  isStepIngredients,
  RecipeInput,
  SOURCE_TYPES,
  stepBasis,
  textToIngredients,
  textToSteps,
  textToTags,
  type IngredientGroup,
  type Recipe,
  type RecipeDraft,
} from "@/lib/recipe";
import { completeRecipe } from "@/lib/complete-recipe";
import { findDishImage, ingredientHints } from "@/lib/image-search";
import { CompletionError, findWebImage } from "@/lib/recipe-completion";
import { nutritionFromForm } from "@/lib/nutrition";
import { assignStepIngredients } from "@/lib/step-ingredients";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------- AI extraction

export type ExtractState = { ok: true; draft: RecipeDraft } | { ok: false; error: string } | null;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 3_500_000;

export async function extractAction(bookId: string, _prev: ExtractState, formData: FormData): Promise<ExtractState> {
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) return { ok: false, error: "Du darfst in diesem Buch keine Rezepte anlegen." };

  if ((await aiCallsLeft(access.user.id, "extract")) <= 0) {
    return { ok: false, error: `Tageslimit von ${aiLimit("extract")} KI-Rezepten erreicht. Morgen geht es weiter – oder trag das Rezept von Hand ein.` };
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

    const servingsValue = Number(formData.get("target_servings") ?? "");
    const targetServings =
      Number.isInteger(servingsValue) && servingsValue >= 1 && servingsValue <= 50 ? servingsValue : undefined;
    const result = await extractRecipe(input, { targetServings });
    await recordAiUsage(access.user.id, "extract", result.usage);

    // No picture from the page (or text/photos): suggest a free photo of the dish.
    if (!result.draft.suggested_image_url && (await aiCallsLeft(access.user.id, "complete")) > 0) {
      const found = await findDishImage(result.draft.title, ingredientHints(result.draft.ingredients));
      await recordAiUsage(access.user.id, "complete", found.usage);
      if (found.image) {
        result.draft.suggested_image_url = found.image.url;
        result.draft.image_credit = found.image.credit;
        result.draft.image_source_url = found.image.sourceUrl;
      }
    }

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
    nutrition: nutritionFromForm(formData),
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

/**
 * The per-step ingredient lists for cooking mode. Reuses `reuse` when the ingredients and
 * steps haven't changed since it was made (`reuseBasis`), otherwise asks the AI again.
 * Returns null when it can't be assigned; cooking mode then simply shows no lists.
 */
async function stepIngredientsFor(
  userId: string,
  ingredients: IngredientGroup[],
  steps: string[],
  reuse: unknown,
  reuseBasis: string | null,
): Promise<string[][] | null> {
  if (steps.length === 0) return [];
  if (reuseBasis === stepBasis(ingredients, steps) && isStepIngredients(reuse, steps.length)) {
    return reuse.map((list) => list.slice(0, 50).map((i) => i.slice(0, 300)));
  }
  if (ingredients.length === 0) return steps.map(() => []);

  if ((await aiCallsLeft(userId, "complete")) <= 0) return null;

  try {
    const { lists, usage } = await assignStepIngredients(ingredients, steps);
    await recordAiUsage(userId, "complete", usage);
    return lists;
  } catch (error) {
    console.error("Assigning ingredients to steps failed", error instanceof Error ? error.message : error);
    return null;
  }
}

function parseJson(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? "null"));
  } catch {
    return null;
  }
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
  const stepIngredients = await stepIngredientsFor(
    access.user.id,
    parsed.data.ingredients,
    parsed.data.steps,
    parseJson(formData.get("step_ingredients")),
    String(formData.get("step_basis") ?? "") || null,
  );
  const { error } = await supabase.from("recipes").insert({
    ...withImage(parsed.data, imagePath),
    step_ingredients: stepIngredients,
    id,
    book_id: bookId,
    created_by: access.user.id,
  });
  if (error) {
    if (image.kind === "new") await deleteRecipeImages([image.path]);
    console.error("Creating a recipe failed", { code: error.code, message: error.message });
    return { error: "Das Rezept konnte nicht gespeichert werden." };
  }

  if (!imagePath && !declinedPicture(formData)) {
    findImageLater(access.user.id, { id, book_id: bookId, title: parsed.data.title, ingredients: parsed.data.ingredients });
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
    .select("book_id, image_path, ingredients, steps, step_ingredients")
    .eq("id", recipeId)
    .maybeSingle();
  const access = current ? await getBookForUser(current.book_id) : null;
  if (!current || !access || !canEdit(access.role)) return { error: "Du darfst dieses Rezept nicht bearbeiten." };

  const image = await resolveImage(formData, current.book_id, recipeId);
  if ("error" in image) return image;
  const imagePath = image.kind === "new" ? image.path : image.kind === "remove" ? null : current.image_path;

  const stepIngredients = await stepIngredientsFor(
    access.user.id,
    parsed.data.ingredients,
    parsed.data.steps,
    current.step_ingredients,
    stepBasis(current.ingredients, current.steps),
  );

  // RLS also checks that only owners and editors of the recipe's book can update it.
  const { error } = await supabase
    .from("recipes")
    .update({ ...withImage(parsed.data, imagePath), step_ingredients: stepIngredients })
    .eq("id", recipeId);
  if (error) {
    if (image.kind === "new") await deleteRecipeImages([image.path]);
    console.error("Updating a recipe failed", { code: error.code, message: error.message });
    return { error: "Das Rezept konnte nicht gespeichert werden." };
  }
  if (image.kind !== "keep") await deleteRecipeImages([current.image_path]);
  if (!imagePath && image.kind !== "remove" && !declinedPicture(formData)) {
    findImageLater(access.user.id, {
      id: recipeId,
      book_id: current.book_id,
      title: parsed.data.title,
      ingredients: parsed.data.ingredients,
    });
  }

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

export type AssignState = { error: string } | null;

/** Cooking mode button for existing recipes: lets the AI assign ingredients to the steps. */
export async function assignStepIngredientsAction(recipeId: string): Promise<AssignState> {
  if (!isUuid(recipeId)) return { error: "Unbekanntes Rezept." };
  const supabase = await createClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select("book_id, ingredients, steps")
    .eq("id", recipeId)
    .maybeSingle();
  const access = recipe ? await getBookForUser(recipe.book_id) : null;
  if (!recipe || !access || !canEdit(access.role)) return { error: "Du darfst dieses Rezept nicht bearbeiten." };

  const lists = await stepIngredientsFor(access.user.id, recipe.ingredients, recipe.steps, null, null);
  if (!lists) return { error: "Das hat gerade nicht geklappt (KI nicht erreichbar oder Tageslimit erreicht)." };

  const { error } = await supabase.from("recipes").update({ step_ingredients: lists }).eq("id", recipeId);
  if (error) return { error: "Speichern hat nicht geklappt." };
  revalidatePath(`/recipes/${recipeId}/cook`);
  return null;
}

// ---------------------------------------------------------------- pictures for recipes without one

/** True if the form offered a picture and the user unticked it, or removed the picture. */
function declinedPicture(formData: FormData): boolean {
  if (formData.get("remove_image")) return true;
  return Boolean(formData.get("suggested_image_url")) && !formData.get("use_suggested_image");
}

/**
 * Saved without a picture (e.g. typed in by hand): looks for a free photo of the dish after
 * answering, so saving stays quick. It shows up on the next visit of the recipe.
 */
function findImageLater(userId: string, recipe: Pick<Recipe, "id" | "book_id" | "title" | "ingredients">) {
  after(async () => {
    if ((await aiCallsLeft(userId, "complete")) <= 0) return;
    try {
      const found = await findWebImage(recipe);
      await recordAiUsage(userId, "complete", found.usage);
      const supabase = await createClient();
      // Only if no picture was added in the meantime.
      const { data, error } = await supabase
        .from("recipes")
        .update(found.update)
        .eq("id", recipe.id)
        .is("image_path", null)
        .select("id");
      if ((error || !data?.length) && found.update.image_path) await deleteRecipeImages([found.update.image_path]);
      revalidatePath(`/recipes/${recipe.id}`, "layout");
      revalidatePath(`/books/${recipe.book_id}`);
    } catch (error) {
      if (error instanceof CompletionError && error.usage) await recordAiUsage(userId, "complete", error.usage);
      else console.error("Finding a picture failed", error instanceof Error ? error.message : error);
    }
  });
}

// ---------------------------------------------------------------- several links at once

export type ImportResult = { ok: true; id: string; title: string; incomplete: boolean } | { ok: false; error: string };

/**
 * "Mehrere Links": reads one link with the AI and saves the recipe right away (with the
 * website's picture), without the review step. The page calls this once per link.
 */
export async function importLinkAction(bookId: string, url: string, targetServings: number | null): Promise<ImportResult> {
  const access = await getBookForUser(bookId);
  if (!access || !canEdit(access.role)) return { ok: false, error: "Du darfst in diesem Buch keine Rezepte anlegen." };
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return { ok: false, error: "Kein gültiger Link." };
  if (isLoginWalled(url)) {
    return { ok: false, error: "Braucht eine Anmeldung (z. B. Instagram) – bitte einzeln über „Text“ oder „Fotos“." };
  }
  if ((await aiCallsLeft(access.user.id, "extract")) <= 0) {
    return { ok: false, error: `Tageslimit von ${aiLimit("extract")} KI-Rezepten erreicht.` };
  }

  try {
    const servings =
      targetServings !== null && Number.isInteger(targetServings) && targetServings >= 1 && targetServings <= 50
        ? targetServings
        : undefined;
    const { draft, usage } = await extractRecipe({ kind: "page", page: await fetchPage(url) }, { targetServings: servings });
    await recordAiUsage(access.user.id, "extract", usage);

    const parsed = RecipeInput.safeParse({
      ...draft,
      source_url: draft.source_url || url,
      visibility: "private",
    });
    if (!parsed.success) return { ok: false, error: "Auf der Seite wurde kein vollständiges Rezept gefunden." };

    const id = crypto.randomUUID();
    let imagePath: string | null = null;
    let credit = { image_credit: parsed.data.image_credit, image_source_url: parsed.data.image_source_url };
    if (/^https?:\/\//i.test(draft.suggested_image_url)) {
      try {
        const { bytes, type } = await fetchImage(draft.suggested_image_url);
        if (isImageType(type)) imagePath = await storeRecipeImage(bookId, id, bytes, type);
      } catch (error) {
        console.error("Imported image could not be stored", error instanceof Error ? error.message : error);
      }
    }
    // No picture on the page: a free photo of the dish instead.
    if (!imagePath && (await aiCallsLeft(access.user.id, "complete")) > 0) {
      try {
        const found = await findWebImage({ id, book_id: bookId, title: parsed.data.title, ingredients: parsed.data.ingredients });
        await recordAiUsage(access.user.id, "complete", found.usage);
        imagePath = found.update.image_path ?? null;
        credit = { image_credit: found.update.image_credit ?? null, image_source_url: found.update.image_source_url ?? null };
      } catch (error) {
        if (error instanceof CompletionError && error.usage) await recordAiUsage(access.user.id, "complete", error.usage);
      }
    }

    const supabase = await createClient();
    const { error } = await supabase.from("recipes").insert({
      ...withImage({ ...parsed.data, ...credit }, imagePath),
      step_ingredients: isStepIngredients(draft.step_ingredients, parsed.data.steps.length) ? draft.step_ingredients : null,
      id,
      book_id: bookId,
      created_by: access.user.id,
    });
    if (error) {
      if (imagePath) await deleteRecipeImages([imagePath]);
      console.error("Importing a recipe failed", { code: error.code, message: error.message });
      return { ok: false, error: "Das Rezept konnte nicht gespeichert werden." };
    }
    revalidatePath(`/books/${bookId}`);
    return { ok: true, id, title: parsed.data.title, incomplete: parsed.data.status === "incomplete" };
  } catch (error) {
    if (error instanceof FetchPageError || error instanceof ExtractionError) return { ok: false, error: error.message };
    console.error("Importing a link failed", error);
    return { ok: false, error: "Etwas ist schiefgelaufen." };
  }
}

// ---------------------------------------------------------------- fill in what's missing

export type CompleteState = { done: string[]; failed: string[] } | { error: string } | null;

/**
 * "Fehlendes ergänzen" in the edit view: fills in what the recipe is missing (see
 * lib/recipe-completion.ts). With `redo` set to a check's id, runs that check even if
 * the recipe already has it (e.g. to reassign the ingredients per step).
 */
export async function completeRecipeAction(recipeId: string, _prev: CompleteState, formData: FormData): Promise<CompleteState> {
  if (!isUuid(recipeId)) return { error: "Unbekanntes Rezept." };
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", recipeId).maybeSingle();
  const recipe = data as Recipe | null;
  const access = recipe ? await getBookForUser(recipe.book_id) : null;
  if (!recipe || !access || !canEdit(access.role)) return { error: "Du darfst dieses Rezept nicht bearbeiten." };

  const redo = String(formData.get("redo") ?? "");
  const budget = { left: await aiCallsLeft(access.user.id, "complete") };
  const result = await completeRecipe(access.user.id, recipe, budget, redo);
  if ("error" in result) return result;

  revalidatePath(`/recipes/${recipeId}`, "layout");
  revalidatePath(`/books/${recipe.book_id}`);
  return result;
}

/** Share panel on the recipe page: switch between private and public. */
export async function setRecipeVisibility(recipeId: string, visibility: "private" | "public") {
  if (!isUuid(recipeId) || (visibility !== "private" && visibility !== "public")) return;
  // RLS only lets owners and editors of the recipe's book change it.
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").update({ visibility }).eq("id", recipeId).select("book_id").maybeSingle();
  revalidatePath(`/recipes/${recipeId}`);
  if (data) revalidatePath(`/books/${data.book_id}`);
}
