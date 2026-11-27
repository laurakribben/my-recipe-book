import { BASIS_LABELS, formatNutrient, NUTRIENTS, SOURCE_LABELS, type Nutrition } from "@/lib/nutrition";

/** Nutrition table on the recipe page; always says where the values come from. */
export function NutritionFacts({ nutrition }: { nutrition: Nutrition }) {
  const rows = NUTRIENTS.filter((n) => nutrition[n.key] !== null);
  return (
    <section className="nutrition" aria-labelledby="naehrwerte">
      <h2 id="naehrwerte">Nährwerte</h2>
      <p className="hint nutrition-basis">{BASIS_LABELS[nutrition.basis]}</p>
      <table>
        <tbody>
          {rows.map((n) => (
            <tr key={n.key} className={n.key === "sugar" ? "sub" : undefined}>
              <th scope="row">{n.label}</th>
              <td>
                {formatNutrient(nutrition[n.key]!, n.key)} {n.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`nutrition-source ${nutrition.source}`}>
        {SOURCE_LABELS[nutrition.source]}
        {nutrition.source === "geschaetzt" && " – Richtwerte, keine exakten Angaben"}
      </p>
    </section>
  );
}
