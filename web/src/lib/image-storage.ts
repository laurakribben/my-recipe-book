import "server-only";
import { IMAGE_BUCKET, IMAGE_TYPES, type ImageType } from "@/lib/images";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stores a recipe picture and returns its path. Only call this after checking that the
 * user may edit recipes in the book: the admin client bypasses all access rules.
 */
export async function storeRecipeImage(
  bookId: string,
  recipeId: string,
  bytes: Uint8Array,
  type: ImageType,
): Promise<string> {
  const path = `${bookId}/${recipeId}/${crypto.randomUUID()}.${IMAGE_TYPES[type]}`;
  const { error } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return path;
}

/** Deletes stored pictures; failures are logged, not thrown (a leftover file is harmless). */
export async function deleteRecipeImages(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length === 0) return;
  const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).remove(list);
  if (error) console.error("Deleting recipe images failed", { message: error.message, count: list.length });
}
