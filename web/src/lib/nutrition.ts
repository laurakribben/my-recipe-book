import { z } from "zod";

/** Nutrition values, the fields shown in the recipe and edited in the form. */
export const NUTRIENTS = [
  { key: "kcal", label: "Energie", unit: "kcal" },
  { key: "protein", label: "Eiweiß", unit: "g" },
  { key: "fat", label: "Fett", unit: "g" },
  { key: "carbs", label: "Kohlenhydrate", unit: "g" },
  { key: "sugar", label: "davon Zucker", unit: "g" },
  { key: "fiber", label: "Ballaststoffe", unit: "g" },
  { key: "salt", label: "Salz", unit: "g" },
] as const;
export type NutrientKey = (typeof NUTRIENTS)[number]["key"];

export const NUTRITION_BASES = ["portion", "rezept", "100g"] as const;
export const BASIS_LABELS: Record<(typeof NUTRITION_BASES)[number], string> = {
  portion: "pro Portion",
  rezept: "für das ganze Rezept",
  "100g": "pro 100 g",
};

/** Where the values come from; always shown, so estimates are never mistaken for facts. */
export const NUTRITION_SOURCES = ["quelle", "geschaetzt", "eigene"] as const;
export const SOURCE_LABELS: Record<(typeof NUTRITION_SOURCES)[number], string> = {
  quelle: "laut Quelle",
  geschaetzt: "von der KI geschätzt",
  eigene: "eigene Angabe",
};

const amount = z.number().min(0).max(100000).nullable();

export const Nutrition = z.object({
  basis: z.enum(NUTRITION_BASES),
  source: z.enum(NUTRITION_SOURCES),
  kcal: amount,
  protein: amount,
  fat: amount,
  carbs: amount,
  sugar: amount,
  fiber: amount,
  salt: amount,
});
export type Nutrition = z.infer<typeof Nutrition>;

/** Stored JSON → Nutrition, or null if it isn't valid or has no values at all. */
export function readNutrition(value: unknown): Nutrition | null {
  const parsed = Nutrition.safeParse(value);
  if (!parsed.success) return null;
  return NUTRIENTS.some((n) => parsed.data[n.key] !== null) ? parsed.data : null;
}

/** 12.345 → "12"; 2.35 → "2,4"; 0.75 → "0,75"; kcal without decimals. */
export function formatNutrient(value: number, key: NutrientKey): string {
  const digits = key === "kcal" ? 0 : value < 1 ? 2 : value < 10 ? 1 : 0;
  return value.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

/** Reads the "Nährwerte" section of the recipe form; null when every value is empty. */
export function nutritionFromForm(formData: FormData): Nutrition | null {
  const num = (key: string) => {
    const raw = String(formData.get(`nutrition_${key}`) ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
  };
  const basis = String(formData.get("nutrition_basis") ?? "");
  const source = String(formData.get("nutrition_source") ?? "");
  const candidate = {
    basis: (NUTRITION_BASES as readonly string[]).includes(basis) ? basis : "portion",
    source: (NUTRITION_SOURCES as readonly string[]).includes(source) ? source : "eigene",
    ...Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(n.key)])),
  };
  return readNutrition(candidate);
}
