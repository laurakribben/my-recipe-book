import { describeShares, inTarget, TARGETS, type Balance, type Macro } from "@/lib/balance";

const pct = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;

function basisText(b: Balance) {
  return `aus ${b.counted} von ${b.total} ${b.total === 1 ? "Gericht" : "Gerichten"}${b.estimated ? ", teils KI-geschätzt" : ""}`;
}

/** Status with icon and words, never colour alone. */
function Status({ findings }: { findings: string[] }) {
  const ok = findings.length === 0;
  return (
    <span className={ok ? "balance-status good" : "balance-status warn"}>
      <span aria-hidden="true">{ok ? "✓" : "!"}</span>
      {ok ? "ausgewogen" : findings[0]}
      {findings.length > 1 && <span className="balance-more"> +{findings.length - 1}</span>}
    </span>
  );
}

/** Under a day's date: status and a thin bar with the energy split (details on hover). */
export function DayBalance({ balance }: { balance: Balance }) {
  if (!balance.shares) return null;
  const { carbs, fat, protein } = balance.shares;
  const tip = `${describeShares(balance.shares)} – ${basisText(balance)}${
    balance.findings.length ? `\n${balance.findings.join(", ")}` : ""
  }`;
  return (
    <span className="day-balance" title={tip}>
      <Status findings={balance.findings} />
      <span className="balance-bar" aria-hidden="true">
        <span className="seg carbs" style={{ flexGrow: carbs }} />
        <span className="seg fat" style={{ flexGrow: fat }} />
        <span className="seg protein" style={{ flexGrow: protein }} />
      </span>
      <span className="visually-hidden">{tip}</span>
    </span>
  );
}

const ROWS: { key: Macro; swatch?: string }[] = [
  { key: "carbs", swatch: "carbs" },
  // Part of the carbs, so directly underneath them.
  { key: "sugar" },
  { key: "fat", swatch: "fat" },
  { key: "protein", swatch: "protein" },
];

/** Above the week table: one meter per nutrient with its target range marked. */
export function WeekBalance({ balance }: { balance: Balance }) {
  if (!balance.shares) {
    return (
      <section className="week-balance card" aria-label="Nährwert-Bilanz der Woche">
        <h2>Bilanz der Woche</h2>
        <p className="hint" style={{ margin: 0 }}>
          {balance.total === 0
            ? "Noch keine Gerichte geplant."
            : "Für die geplanten Gerichte sind keine Nährwerte hinterlegt. „Fehlendes mit KI ergänzen“ im Rezept kann sie schätzen."}
        </p>
      </section>
    );
  }
  const shares = balance.shares;
  return (
    <section className="week-balance card" aria-label="Nährwert-Bilanz der Woche">
      <div className="week-balance-head">
        <h2>Bilanz der Woche</h2>
        <Status findings={balance.findings} />
      </div>
      <ul className="meters">
        {ROWS.map(({ key, swatch }) => {
          const value = key === "sugar" ? shares.sugar : shares[key];
          const t = TARGETS[key];
          return (
            <li key={key}>
              <span className={key === "sugar" ? "meter-name sub" : "meter-name"}>
                <span className={`swatch ${swatch ?? "sugar"}`} aria-hidden="true" />
                {key === "sugar" ? "davon Zucker" : t.label}
              </span>
              <span className="meter" aria-hidden="true">
                <span className="meter-target" style={{ left: `${t.min}%`, width: `${t.max - t.min}%` }} />
                {value !== null && (
                  <span className={`meter-value ${swatch ?? "sugar"}`} style={{ width: `${Math.min(100, value)}%` }} />
                )}
              </span>
              <span className="meter-figure" title={`Ziel ${key === "sugar" ? `unter ${t.max} %` : `${t.min}–${t.max} %`}`}>
                {value === null ? "–" : pct(value)}
                {value !== null && (
                  <span className={inTarget(key, value) ? "meter-ok" : "meter-off"}>
                    {inTarget(key, value) ? " ✓" : " !"}
                  </span>
                )}
              </span>
              <span className="meter-range">
                Ziel {key === "sugar" ? `unter ${t.max} %` : `${t.min}–${t.max} %`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint" style={{ margin: "0.5rem 0 0" }}>
        Anteil an der Energie, {basisText(balance)}. Richtwerte nach DGE/WHO; jedes Gericht zählt als eine Portion.
      </p>
    </section>
  );
}
