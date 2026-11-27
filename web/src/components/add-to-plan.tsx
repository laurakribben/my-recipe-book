import { addEntry } from "@/app/plans/actions";

type Props = {
  recipeId: string;
  plans: { id: string; name: string }[];
  defaultDay: string;
  defaultServings: number | null;
};

/** "Zum Wochenplan hinzufügen" on the recipe page. */
export function AddToPlan({ recipeId, plans, defaultDay, defaultServings }: Props) {
  if (plans.length === 0) return null;
  return (
    <details className="add-to-plan">
      <summary>Zum Wochenplan hinzufügen</summary>
      <form action={async (formData: FormData) => {
        "use server";
        const planId = String(formData.get("plan_id") ?? "");
        if (!plans.some((p) => p.id === planId)) return;
        await addEntry(planId, formData);
      }}>
        <input type="hidden" name="recipe_id" value={recipeId} />
        <input type="hidden" name="back" value={`/recipes/${recipeId}`} />
        <div className="grid-2">
          {plans.length > 1 ? (
            <label className="field">
              <span>Plan</span>
              <select name="plan_id" defaultValue={plans[0].id}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="plan_id" value={plans[0].id} />
          )}
          <label className="field">
            <span>Tag</span>
            <input type="date" name="day" defaultValue={defaultDay} required />
          </label>
          <label className="field">
            <span>Portionen</span>
            <input type="number" name="servings" min={1} max={100} step="any" defaultValue={defaultServings ?? ""} placeholder="wie im Rezept" />
          </label>
        </div>
        <button type="submit" className="secondary">
          Einplanen
        </button>
      </form>
    </details>
  );
}
