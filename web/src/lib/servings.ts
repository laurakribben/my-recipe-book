/**
 * Recalculating ingredient amounts for a different number of servings.
 * Only the amount at the start of an ingredient line is scaled ("80 g Butter",
 * "½ TL Salz", "6–7 Äpfel"); other numbers ("Mehl Type 405") stay as they are.
 */

const FRACTIONS: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125 };
const FRACTION_CHARS = Object.keys(FRACTIONS).join("");

// One amount: "80", "1,5", "1.5", "1/2", "1 1/2", "½", "1½", "1 ½"
const AMOUNT = `(?:\\d+(?:[.,]\\d+)?(?:\\s*(?:\\d+\\/\\d+|[${FRACTION_CHARS}]))?|\\d+\\/\\d+|[${FRACTION_CHARS}])`;
export const LEADING = new RegExp(`^(\\s*(?:ca\\.?|etwa|circa|ungefähr)?\\s*)(${AMOUNT})(?:(\\s*(?:-|–|bis)\\s*)(${AMOUNT}))?(?=\\s|[a-zäöüß]|$)`, "i");

export const METRIC_UNITS = /^\s*(g|gr|kg|mg|ml|cl|dl|l|liter)\b/i;

export function parseAmount(text: string): number | null {
  const t = text.trim();
  let total = 0;
  let rest = t;
  const whole = rest.match(/^(\d+(?:[.,]\d+)?)/);
  if (whole && !rest.match(/^\d+\/\d+/)) {
    total += Number(whole[1].replace(",", "."));
    rest = rest.slice(whole[0].length).trim();
  }
  if (rest) {
    const frac = rest.match(/^(\d+)\/(\d+)$/);
    if (frac && Number(frac[2]) !== 0) total += Number(frac[1]) / Number(frac[2]);
    else if (rest in FRACTIONS) total += FRACTIONS[rest];
    else return null;
  }
  return Number.isFinite(total) ? total : null;
}

/** "4", "4 Portionen", "für 4–6 Personen", "12 Stück" -> 4 / 4 / 4 / 12; nothing usable -> null. */
export function parseServings(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(new RegExp(AMOUNT));
  if (!m) return null;
  const n = parseAmount(m[0]);
  return n && n > 0 ? n : null;
}

const NICE_FRACTIONS: [number, string][] = [
  [0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"], [1, ""],
];

function formatDecimal(n: number, digits: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

/** Formats a scaled amount: metric units as rounded numbers, everything else with ½, ¼, ⅓ … */
export function formatAmount(n: number, metric: boolean): string {
  if (metric) {
    if (n >= 100) return formatDecimal(Math.round(n / 5) * 5, 0);
    if (n >= 10) return formatDecimal(Math.round(n), 0);
    return formatDecimal(Math.round(n * 10) / 10, 1);
  }
  const whole = Math.floor(n);
  const rest = n - whole;
  let best = NICE_FRACTIONS[0];
  for (const f of NICE_FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  if (Math.abs(best[0] - rest) > 0.07) return formatDecimal(Math.round(n * 10) / 10, 1);
  const w = best[0] === 1 ? whole + 1 : whole;
  if (w === 0 && best[1]) return best[1];
  return `${w}${best[1]}`;
}

/** Scales the amount at the start of an ingredient line; lines without one are returned unchanged. */
export function scaleIngredient(item: string, factor: number): string {
  if (factor === 1) return item;
  const m = item.match(LEADING);
  if (!m) return item;
  const [match, prefix, from, rangeSep, to] = m;
  const rest = item.slice(match.length);
  const metric = METRIC_UNITS.test(rest);
  const a = parseAmount(from);
  if (a === null) return item;
  let amount = formatAmount(a * factor, metric);
  if (to) {
    const b = parseAmount(to);
    if (b === null) return item;
    amount += `${rangeSep}${formatAmount(b * factor, metric)}`;
  }
  return `${prefix}${amount}${rest}`;
}

/** For recipes without a known number of servings: steps of the "−/+" control. */
export const FACTOR_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
