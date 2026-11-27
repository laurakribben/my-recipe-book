import { addEntry, addIdea, type IdeaList } from "@/app/plans/actions";
import { MEALS } from "@/lib/plans";
import { IconPopover } from "@/components/more-menu";
import { CalendarPlusIcon } from "@/components/icons";

type Props = {
  recipeId: string;
  plans: { id: string; name: string }[];
  defaultDay: string;
  defaultServings: number | null;
};

/**
 * On the recipe page: note the recipe for "Diese Woche" / "Nächste Woche" (in the user's
 * own plan, or the first plan they can edit), or put it on a specific day.
 */
export function AddToPlan({ recipeId, plans, defaultDay, defaultServings }: Props) {
  if (plans.length === 0) return null;
  const notePlan = plans[0];
  const note = (list: IdeaList) => async () => {
    "use server";
    await addIdea(notePlan.id, recipeId, list, `/recipes/${recipeId}`);
  };
  return (
    <IconPopover icon={<CalendarPlusIcon />} label="Zum Wochenplan">
      <p className="popover-title">Merken für</p>
      <div className="toolbar">
        <form action={note("this")}>
          <button type="submit" className="secondary btn-small">
            Diese Woche
          </button>
        </form>
        <form action={note("next")}>
          <button type="submit" className="secondary btn-small">
            Nächste Woche
          </button>
        </form>
      </div>
      <p className="popover-title">Oder an einem Tag einplanen</p>
      <form
        action={async (formData: FormData) => {
          "use server";
          const planId = String(formData.get("plan_id") ?? "");
          if (!plans.some((p) => p.id === planId)) return;
          await addEntry(planId, formData);
        }}
      >
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
            <span>Mahlzeit</span>
            <select name="meal" defaultValue="abends">
              {MEALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Portionen</span>
            <input
              type="number"
              name="servings"
              min={1}
              max={100}
              step="any"
              defaultValue={defaultServings ?? ""}
              placeholder="wie im Rezept"
            />
          </label>
        </div>
        <label className="field">
          <span>Notiz (optional, nur im Wochenplan sichtbar)</span>
          <input type="text" name="note" maxLength={500} placeholder="z. B. Tofu statt Hähnchen" />
        </label>
        <button type="submit">Einplanen</button>
      </form>
    </IconPopover>
  );
}
