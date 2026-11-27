import { env } from "@/lib/env";

export const IMAGE_BUCKET = "recipe-images";

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

export function isImageType(type: string): type is ImageType {
  return type in IMAGE_TYPES;
}

/** Public address of a stored recipe picture. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${env.supabaseUrl()}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
}
