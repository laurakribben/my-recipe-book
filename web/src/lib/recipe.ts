import { z } from "zod";
import { imageUrl } from "@/lib/images";

export const SOURCE_TYPES = ["instagram", "website", "youtube", "tiktok", "photo", "text", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  instagram: "Instagram",
  website: "Website",
  youtube: "YouTube",
  tiktok: "TikTok",
  photo: "Foto",
  text: "Text",
  other: "Sonstiges",
};

export type BookRole = "owner" | "editor" | "viewer";

export const ROLE_LABELS: Record<BookRole, string> = {
  owner: "Eigentümer:in",
  editor: "Kann bearbeiten",
  viewer: "Kann lesen",
};

export const IngredientGroup = z.object({
  name: z.string().nullable(),
  items: z.array(z.string()),
});
export type IngredientGroup = z.infer<typeof IngredientGroup>;

/** A recipe as stored in the `recipes` table. */
export type Recipe = {
  id: string;
  book_id: string;
  title: string;
  source_url: string | null;
  source_type: SourceType;
  source_author: string | null;
  status: "complete" | "incomplete";
  missing: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  tags: string[];
  ingredients: IngredientGroup[];
  steps: string[];
  notes: string | null;
  visibility: "private" | "public";
  /** Path in the "recipe-images" storage bucket, see lib/images.ts. */
  image_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The editable fields of a recipe, validated before every insert/update. */
export const RecipeInput = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(200),
  source_url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Die Quelle muss mit http:// oder https:// beginnen.")
    .transform((v) => v || null),
  source_type: z.enum(SOURCE_TYPES),
  source_author: z.string().trim().max(200).transform((v) => v || null),
  status: z.enum(["complete", "incomplete"]),
  missing: z.string().trim().max(2000).transform((v) => v || null),
  servings: z.string().trim().max(50).transform((v) => v || null),
  prep_time: z.string().trim().max(50).transform((v) => v || null),
  cook_time: z.string().trim().max(50).transform((v) => v || null),
  total_time: z.string().trim().max(50).transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  ingredients: z.array(IngredientGroup).max(30),
  steps: z.array(z.string().trim().min(1).max(3000)).max(100),
  notes: z.string().trim().max(10000).transform((v) => v || null),
  visibility: z.enum(["private", "public"]),
});
export type RecipeInput = z.input<typeof RecipeInput>;

/** Recipe fields as plain strings/arrays for the edit form. */
export type RecipeDraft = {
  title: string;
  source_url: string;
  source_type: SourceType;
  source_author: string;
  status: "complete" | "incomplete";
  missing: string;
  servings: string;
  prep_time: string;
  cook_time: string;
  total_time: string;
  tags: string[];
  ingredients: IngredientGroup[];
  steps: string[];
  notes: string;
  visibility: "private" | "public";
  /** Address of the recipe's current picture (when editing), or "". */
  image_url: string;
  /** A picture found on the source web page, offered when the AI fills in a recipe. */
  suggested_image_url: string;
};

export const EMPTY_DRAFT: RecipeDraft = {
  title: "",
  source_url: "",
  source_type: "other",
  source_author: "",
  status: "complete",
  missing: "",
  servings: "",
  prep_time: "",
  cook_time: "",
  total_time: "",
  tags: [],
  ingredients: [],
  steps: [],
  notes: "",
  visibility: "private",
  image_url: "",
  suggested_image_url: "",
};

export function recipeToDraft(r: Recipe): RecipeDraft {
  return {
    title: r.title,
    source_url: r.source_url ?? "",
    source_type: r.source_type,
    source_author: r.source_author ?? "",
    status: r.status,
    missing: r.missing ?? "",
    servings: r.servings ?? "",
    prep_time: r.prep_time ?? "",
    cook_time: r.cook_time ?? "",
    total_time: r.total_time ?? "",
    tags: r.tags,
    ingredients: r.ingredients,
    steps: r.steps,
    notes: r.notes ?? "",
    visibility: r.visibility,
    image_url: imageUrl(r.image_path) ?? "",
    suggested_image_url: "",
  };
}

/**
 * Ingredients are edited as text: one ingredient per line, and a line starting
 * with "#" starts a named group (e.g. "# Teig").
 */
export function ingredientsToText(groups: IngredientGroup[]): string {
  return groups
    .map((g) => [g.name ? `# ${g.name}` : null, ...g.items].filter((l) => l !== null).join("\n"))
    .join("\n\n");
}

export function textToIngredients(text: string): IngredientGroup[] {
  const groups: IngredientGroup[] = [];
  let current: IngredientGroup | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      current = { name: line.replace(/^#+\s*/, "") || null, items: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { name: null, items: [] };
        groups.push(current);
      }
      current.items.push(line.replace(/^[-*•]\s+/, ""));
    }
  }
  return groups.filter((g) => g.items.length > 0 || g.name);
}

/** Steps are edited as text, one step per line. */
export function textToSteps(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^\d+[.)]\s+/, ""))
    .filter(Boolean);
}

export function textToTags(text: string): string[] {
  return [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))];
}
