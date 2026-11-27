import { readNutrition } from "@/lib/nutrition";
import { parseServings } from "@/lib/servings";

/**
 * Nutrition balance of a day or week in the meal plan: the share of energy from carbs,
 * fat and protein (and sugar, part of the carbs), compared with common recommendations
 * (DGE/WHO). Only ratios – no calorie totals.
 */
export const TARGETS = {
  carbs: { label: "Kohlenhydrate", min: 45, max: 60 },
  fat: { label: "Fett", min: 20, max: 35 },
  // Shown range 10–20 %; a bit more protein isn't a problem for adults, so warn only above 25 %.
  protein: { label: "Eiweiß", min: 10, max: 20, warnAbove: 25 },
  sugar: { label: "Zucker", min: 0, max: 10 },
} as const;
export type Macro = keyof typeof TARGETS;

export type Balance = {
  /** Dishes with usable nutrition facts / dishes in total. */
  counted: number;
  total: number;
  /** True if any counted dish has AI-estimated values. */
  estimated: boolean;
  /** Share of energy in percent; sugar is null when no dish states it. */
  shares: { carbs: number; fat: number; protein: number; sugar: number | null } | null;
  /** Deviations from the targets, most important first, e.g. "viel Fett". */
  findings: string[];
};

type Item = { nutrition: unknown; servings: string | null };

/**
 * One planned dish counts as one portion. Values given for the whole recipe are divided by
 * its servings when known; the ratios themselves don't depend on the amount.
 */
export function computeBalance(items: Item[]): Balance {
  let carbs = 0;
  let fat = 0;
  let protein = 0;
  let sugar = 0;
  let sugarKnown = false;
  let counted = 0;
  let estimated = false;

  for (const item of items) {
    const n = readNutrition(item.nutrition);
    if (!n || n.carbs === null || n.fat === null || n.protein === null) continue;
    const servings = n.basis === "rezept" ? parseServings(item.servings) : null;
    const per = servings && servings > 0 ? 1 / servings : 1;
    carbs += n.carbs * per;
    fat += n.fat * per;
    protein += n.protein * per;
    if (n.sugar !== null) {
      sugar += n.sugar * per;
      sugarKnown = true;
    }
    counted++;
    if (n.source === "geschaetzt") estimated = true;
  }

  // Energy: 4 kcal per gram of carbs/protein/sugar, 9 per gram of fat.
  const energy = carbs * 4 + fat * 9 + protein * 4;
  if (counted === 0 || energy <= 0) {
    return { counted, total: items.length, estimated, shares: null, findings: [] };
  }
  // Whole percent: what is shown is exactly what is judged.
  const pct = (kcal: number) => Math.round((kcal / energy) * 100);
  const shares = {
    carbs: pct(carbs * 4),
    fat: pct(fat * 9),
    protein: pct(protein * 4),
    sugar: sugarKnown ? pct(sugar * 4) : null,
  };

  // Most important deviations first.
  const findings: string[] = [];
  if (shares.sugar !== null && shares.sugar > TARGETS.sugar.max) findings.push("viel Zucker");
  if (shares.fat > TARGETS.fat.max) findings.push("viel Fett");
  if (shares.carbs < TARGETS.carbs.min) findings.push("wenig Kohlenhydrate");
  if (shares.protein < TARGETS.protein.min) findings.push("wenig Eiweiß");
  if (shares.carbs > TARGETS.carbs.max) findings.push("viel Kohlenhydrate");
  if (shares.protein > TARGETS.protein.warnAbove) findings.push("viel Eiweiß");
  if (shares.fat < TARGETS.fat.min) findings.push("wenig Fett");

  return { counted, total: items.length, estimated, shares, findings };
}

/** Whether one share is fine (inside its range; protein may go up to its warning limit). */
export function inTarget(macro: Macro, value: number): boolean {
  const t = TARGETS[macro];
  return value >= t.min && value <= ("warnAbove" in t ? t.warnAbove : t.max);
}

/** "Kohlenhydrate 52 % (davon Zucker 8 %) · Fett 30 % · Eiweiß 18 %" */
export function describeShares(shares: NonNullable<Balance["shares"]>): string {
  const f = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;
  return (
    `Kohlenhydrate ${f(shares.carbs)}` +
    (shares.sugar !== null ? ` (davon Zucker ${f(shares.sugar)})` : "") +
    ` · Fett ${f(shares.fat)} · Eiweiß ${f(shares.protein)}`
  );
}
