/** A cooking time found in a recipe step, e.g. "10 Minuten" → 600 seconds. */
export type FoundDuration = { text: string; seconds: number };

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einer: 1, einen: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, "zwölf": 12, "fünfzehn": 15, zwanzig: 20, "dreißig": 30, vierzig: 40, "fünfzig": 50,
  halbe: 0.5, halben: 0.5, "dreiviertel": 0.75,
};

const NUM = `(\\d+(?:[.,]\\d+)?|½|${Object.keys(NUMBER_WORDS).join("|")})`;
const UNIT = "(stunden|stunde|std\\.?|minuten|minute|min\\.?|sekunden|sekunde|sek\\.?)";
const NOT_LETTER = "(?![a-zäöüß])";

// "10 Minuten", "35–40 Min.", "1 Std. 15 Min.", "1 Stunde und 15 Minuten", "halbe Stunde"
const PATTERN = new RegExp(
  `(?<![a-zäöüß\\d])${NUM}(?:\\s*(?:-|–|bis)\\s*${NUM})?\\s*${UNIT}${NOT_LETTER}` +
    `(?:\\s*(?:und\\s*)?${NUM}\\s*(minuten|minute|min\\.?)${NOT_LETTER})?`,
  "giu",
);

function toNumber(token: string): number {
  const t = token.toLowerCase();
  if (t === "½") return 0.5;
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  return Number(t.replace(",", "."));
}

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("st")) return 3600;
  if (u.startsWith("se")) return 1;
  return 60;
}

/**
 * Finds cooking times in a German step text. For ranges ("35–40 Minuten") the lower
 * value is used, so you check a little early rather than too late.
 */
export function findDurations(text: string): FoundDuration[] {
  const found: FoundDuration[] = [];
  for (const m of text.matchAll(PATTERN)) {
    const [match, from, , unit, extraMinutes] = m;
    let seconds = toNumber(from) * unitSeconds(unit);
    if (extraMinutes) seconds += toNumber(extraMinutes) * 60;
    seconds = Math.round(seconds);
    if (seconds >= 5 && seconds <= 24 * 3600 && !found.some((f) => f.seconds === seconds)) {
      found.push({ text: match.trim(), seconds });
    }
  }
  return found;
}

/** 600 → "10:00", 4500 → "1:15:00". */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.ceil(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}
