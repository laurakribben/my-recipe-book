"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { IngredientGroup } from "@/lib/recipe";
import { FACTOR_STEPS, formatAmount, scaleIngredient } from "@/lib/servings";

// The chosen factor per recipe lives in sessionStorage: it applies for this browser
// session (recipe page and cooking mode alike) and is never saved to the recipe.

const listeners = new Set<() => void>();
const memory = new Map<string, number>();
const key = (recipeId: string) => `servings-factor:${recipeId}`;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readFactor(recipeId: string): number {
  try {
    const n = Number(sessionStorage.getItem(key(recipeId)));
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

function writeFactor(recipeId: string, factor: number) {
  try {
    if (factor === 1) sessionStorage.removeItem(key(recipeId));
    else sessionStorage.setItem(key(recipeId), String(factor));
  } catch {
    // Storage blocked: the change still applies until the page is left.
    memory.set(recipeId, factor);
  }
  listeners.forEach((l) => l());
}

/** The factor chosen for this recipe in this session (1 = as written). */
export function useServingsFactor(recipeId: string): [number, (f: number) => void] {
  const factor = useSyncExternalStore(
    subscribe,
    () => memory.get(recipeId) ?? readFactor(recipeId),
    () => 1,
  );
  return [factor, (f: number) => writeFactor(recipeId, f)];
}

/** "− 4 Portionen +" control; for recipes without a number of servings it changes a factor (×1½). */
export function ServingsControl({
  base,
  factor,
  onChange,
}: {
  base: number | null;
  factor: number;
  onChange: (f: number) => void;
}) {
  let label: string;
  let minus: number | null;
  let plus: number | null;

  if (base) {
    const servings = Math.round(base * factor * 100) / 100;
    label = `${formatAmount(servings, false)} ${servings === 1 ? "Portion" : "Portionen"}`;
    // Whole servings from 1 to 50; from a fractional value, step to the next whole number.
    const down = Number.isInteger(servings) ? servings - 1 : Math.floor(servings);
    const up = Number.isInteger(servings) ? servings + 1 : Math.ceil(servings);
    minus = down >= 1 ? down / base : null;
    plus = up <= 50 ? up / base : null;
  } else {
    label = factor === 1 ? "Originalmenge" : `${formatAmount(factor, false)}-fache Menge`;
    minus = [...FACTOR_STEPS].reverse().find((f) => f < factor - 1e-9) ?? null;
    plus = FACTOR_STEPS.find((f) => f > factor + 1e-9) ?? null;
  }

  return (
    <div className="servings">
      <button type="button" className="secondary" onClick={() => minus && onChange(minus)} disabled={!minus} aria-label="Weniger">
        −
      </button>
      <span aria-live="polite">{label}</span>
      <button type="button" className="secondary" onClick={() => plus && onChange(plus)} disabled={!plus} aria-label="Mehr">
        +
      </button>
      {factor !== 1 && (
        <button type="button" className="link-button" onClick={() => onChange(1)}>
          Original
        </button>
      )}
    </div>
  );
}

export function scaleGroups(groups: IngredientGroup[], factor: number): IngredientGroup[] {
  if (factor === 1) return groups;
  return groups.map((g) => ({ ...g, items: g.items.map((i) => scaleIngredient(i, factor)) }));
}

/** Ingredients on the recipe page, with the servings control above them. */
export function RecipeIngredients({
  recipeId,
  base,
  ingredients,
  initialServings,
}: {
  recipeId: string;
  base: number | null;
  ingredients: IngredientGroup[];
  /** Servings planned in the meal plan (?portionen=): applied once when the page opens. */
  initialServings?: number | null;
}) {
  const [factor, setFactor] = useServingsFactor(recipeId);

  useEffect(() => {
    if (base && initialServings) writeFactor(recipeId, initialServings / base);
  }, [recipeId, base, initialServings]);
  const scaled = scaleGroups(ingredients, factor);

  return (
    <>
      {ingredients.length > 0 && <ServingsControl base={base} factor={factor} onChange={setFactor} />}
      {factor !== 1 && <p className="hint">Mengen umgerechnet. Angaben in der Zubereitung gelten für die Originalmenge.</p>}
      {ingredients.length === 0 && <p className="empty">Keine Zutaten eingetragen.</p>}
      {scaled.map((group, i) => (
        <div key={i}>
          {group.name && <h3>{group.name}</h3>}
          <ul>
            {group.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
