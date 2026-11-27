import { formatAmount, LEADING, METRIC_UNITS, parseAmount } from "@/lib/servings";

/** Supermarket aisles in the order you usually walk through a shop. The AI picks one per item. */
export const AISLES = [
  "Obst & Gemüse",
  "Brot & Backwaren",
  "Kühlregal",
  "Fleisch & Fisch",
  "Tiefkühl",
  "Vorrat",
  "Backen & Gewürze",
  "Getränke",
  "Drogerie & Haushalt",
  "Sonstiges",
] as const;
export type Aisle = (typeof AISLES)[number];

export function aisleOrder(aisle: string | null | undefined): number {
  const i = AISLES.indexOf((aisle ?? "Sonstiges") as Aisle);
  return i === -1 ? AISLES.length - 1 : i;
}

const UNITS = new Set([
  "g", "gr", "kg", "mg", "ml", "cl", "dl", "l", "liter",
  "el", "tl", "msp", "msp.", "tasse", "tassen", "becher", "prise", "prisen", "pck", "pck.", "päckchen",
  "dose", "dosen", "bund", "stück", "stk", "stk.", "zehe", "zehen", "scheibe", "scheiben", "zweig", "zweige",
  "glas", "gläser", "handvoll", "flasche", "flaschen",
]);

export type ParsedItem = {
  /** Amount at the start, or null (e.g. "Salz und Pfeffer"). For ranges ("6–7") the lower value. */
  amount: number | null;
  /** Upper value of a range ("6–7" → 7), otherwise the same as amount. */
  amountMax: number | null;
  /** The amount as written, e.g. "6–7" or "½". */
  amountText: string;
  unit: string | null;
  /** The ingredient as written, without amount and unit, e.g. "ungesalzene Butter, weich". */
  name: string;
  /** What merging compares: name before any comma/bracket, lower case. */
  key: string;
};

export function parseItem(text: string): ParsedItem {
  const m = text.match(LEADING);
  let rest = text;
  let amount: number | null = null;
  let amountMax: number | null = null;
  let amountText = "";
  if (m) {
    const [match, , from, , to] = m;
    amountText = match.trim();
    amount = parseAmount(from);
    amountMax = to ? parseAmount(to) : amount;
    if (amount === null || amountMax === null) amount = amountMax = null;
    rest = text.slice(match.length);
  }
  rest = rest.trim();
  let unit: string | null = null;
  const first = rest.split(/\s+/)[0] ?? "";
  if (amountText && UNITS.has(first.toLowerCase())) {
    unit = first;
    rest = rest.slice(first.length).trim();
  }
  const glued = amountText.match(/^(.*?\d)\s*(g|kg|ml|l)$/i);
  if (!unit && glued) {
    unit = glued[2];
  }
  const key = rest
    .split(/[,(]/)[0]
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return { amount, amountMax, amountText, unit, name: rest, key };
}

export type ShoppingRow<T> = {
  /** All items merged into this row (one for most rows). */
  items: T[];
  /** Text to show, e.g. "300 g Butter" or "120 g Butter + 1 TL Butter". */
  text: string;
  /** For merged rows: each source with its amount, e.g. "Apfelkuchen (Dienstag): 100 g". */
  parts: string[];
  aisle: string;
};

type Item = { text: string; source: string | null; aisle?: string | null };

/**
 * Groups the list for display: same ingredient (same name before any comma) → one row with
 * the amounts added up per unit, plus which recipe needs how much. Rows are sorted by aisle.
 */
export function groupShoppingItems<T extends Item>(items: T[]): ShoppingRow<T>[] {
  const groups = new Map<string, { items: T[]; parsed: ParsedItem[] }>();
  for (const item of items) {
    const parsed = parseItem(item.text);
    const key = parsed.key || item.text.toLowerCase();
    if (!groups.has(key)) groups.set(key, { items: [], parsed: [] });
    groups.get(key)!.items.push(item);
    groups.get(key)!.parsed.push(parsed);
  }

  const rows: ShoppingRow<T>[] = [];
  for (const { items: list, parsed } of groups.values()) {
    const aisle = list.find((i) => i.aisle)?.aisle ?? "Sonstiges";
    if (list.length === 1) {
      rows.push({ items: list, text: list[0].text, parts: [], aisle });
      continue;
    }
    // Add up amounts per unit (ranges as from–to); lines without an amount add "+ etwas".
    const sums = new Map<string, { min: number; max: number; unit: string | null }>();
    let withoutAmount = false;
    for (const p of parsed) {
      if (p.amount === null || p.amountMax === null) {
        withoutAmount = true;
        continue;
      }
      const unitKey = (p.unit ?? "").toLowerCase();
      const entry = sums.get(unitKey) ?? { min: 0, max: 0, unit: p.unit };
      entry.min += p.amount;
      entry.max += p.amountMax;
      sums.set(unitKey, entry);
    }
    const quantities = [...sums.values()].map(({ min, max, unit }) => {
      const metric = unit ? METRIC_UNITS.test(unit) : false;
      const amount = Math.abs(max - min) < 1e-9 ? formatAmount(min, metric) : `${formatAmount(min, metric)}–${formatAmount(max, metric)}`;
      return `${amount}${unit ? ` ${unit}` : ""}`;
    });
    const name = parsed[0].name.split(/[,(]/)[0].trim() || list[0].text;
    const text = quantities.length ? `${quantities.join(" + ")} ${name}${withoutAmount ? " (+ etwas)" : ""}` : name;
    const parts = list.map((item, i) => {
      const p = parsed[i];
      const qty = p.amountText ? `${p.amountText}${p.unit && !p.amountText.endsWith(p.unit) ? ` ${p.unit}` : ""}` : "etwas";
      return `${item.source ?? "Eigener Eintrag"}: ${qty}`;
    });
    rows.push({ items: list, text, parts, aisle });
  }
  return rows.sort((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle));
}
