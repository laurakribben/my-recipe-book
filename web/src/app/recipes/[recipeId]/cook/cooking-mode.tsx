"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { findDurations, formatSeconds } from "@/lib/durations";
import type { IngredientGroup } from "@/lib/recipe";
import { scaleIngredient } from "@/lib/servings";
import { scaleGroups, ServingsControl, useServingsFactor } from "@/components/servings";
import type { AssignState } from "@/app/recipes/actions";

type Props = {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  ingredients: IngredientGroup[];
  /** Number of servings the amounts are written for, if known. */
  servingsBase: number | null;
  /** Servings planned in the meal plan (?portionen=): applied once when cooking mode opens. */
  initialServings?: number | null;
  steps: string[];
  /** Ingredients with amounts for each step, or null if not assigned yet. */
  stepIngredients: string[][] | null;
  /** Lets editors have the AI assign ingredients to steps; absent for everyone else. */
  assign?: (prev: AssignState) => Promise<AssignState>;
};

type Timer = { id: string; label: string; stepNo: number; endsAt: number; done: boolean };

type Saved = { pos: number; checked: string[]; timers: Timer[]; savedAt: number };

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const subscribeNothing = () => () => {};

/**
 * Cooking mode: keeps the screen on and shows the recipe one step at a time.
 * Rendered only in the browser, because progress and timers are kept in localStorage.
 */
export function CookingMode(props: Props) {
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!inBrowser) return <div className="cook" aria-busy="true" />;
  return <CookingModeClient {...props} />;
}

function storageKey(recipeId: string) {
  return `cook:v1:${recipeId}`;
}

function loadSaved(recipeId: string): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(recipeId)) ?? "null") as Saved | null;
    if (!saved || Date.now() - saved.savedAt > MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

/** Called from the "Timer" button's click handler. */
function createTimer(seconds: number, label: string, stepNo: number): Timer {
  return { id: crypto.randomUUID(), label, stepNo, endsAt: Date.now() + seconds * 1000, done: false };
}

// ---------------------------------------------------------------- sound

function playBeeps(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    for (let i = 0; i < 3; i++) {
      const start = ctx.currentTime + i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  } catch {
    // Sound is a bonus; the timer is still shown as finished.
  }
}

// ---------------------------------------------------------------- component

function CookingModeClient({
  recipeId,
  title,
  imageUrl,
  ingredients: originalIngredients,
  servingsBase,
  initialServings,
  steps,
  stepIngredients,
  assign,
}: Props) {
  const [factor, setFactor] = useServingsFactor(recipeId);
  useEffect(() => {
    if (servingsBase && initialServings) setFactor(initialServings / servingsBase);
    // Only when opening cooking mode, not on every change of the control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, servingsBase, initialServings]);
  const ingredients = scaleGroups(originalIngredients, factor);
  const total = steps.length + 1; // position 0 = ingredients, then one position per step
  const [saved] = useState(() => loadSaved(recipeId));
  const [pos, setPos] = useState(() => Math.min(saved?.pos ?? 0, total - 1));
  const [finished, setFinished] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(saved?.checked ?? []));
  const [timers, setTimers] = useState<Timer[]>(() => saved?.timers ?? []);
  const [showIngredients, setShowIngredients] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [wakeLock, setWakeLock] = useState<"pending" | "active" | "failed" | "unsupported">(() =>
    "wakeLock" in navigator ? "pending" : "unsupported",
  );
  const audio = useRef<AudioContext | null>(null);
  const lastBeep = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const timersRef = useRef(timers);

  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  // Keep progress, ticked ingredients and timers when the page is left or reloaded.
  useEffect(() => {
    try {
      const data: Saved = { pos, checked: [...checked], timers, savedAt: Date.now() };
      localStorage.setItem(storageKey(recipeId), JSON.stringify(data));
    } catch {
      // Private mode or storage blocked: cooking mode still works, it just won't remember.
    }
  }, [recipeId, pos, checked, timers]);

  // Keep the screen on. Browsers drop the lock when the tab is hidden, so take it again on return.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        setWakeLock("active");
        lock.addEventListener("release", () => {
          if (!cancelled) setWakeLock("failed");
        });
      } catch {
        if (!cancelled) setWakeLock("failed");
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, []);

  // Timer clock: marks finished timers and keeps beeping until they're dismissed.
  const hasTimers = timers.length > 0;
  useEffect(() => {
    if (!hasTimers) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const list = timersRef.current;
      if (list.some((x) => x.done || x.endsAt <= t) && t - lastBeep.current > 4000) {
        lastBeep.current = t;
        playBeeps(audio.current);
        navigator.vibrate?.([400, 200, 400]);
      }
      if (list.some((x) => !x.done && x.endsAt <= t)) {
        setTimers((current) => current.map((x) => (!x.done && x.endsAt <= t ? { ...x, done: true } : x)));
      }
    };
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [hasTimers]);

  const go = useCallback(
    (delta: number) => {
      if (finished) return;
      const next = pos + delta;
      if (next >= total) setFinished(true);
      else setPos(Math.max(0, next));
    },
    [pos, total, finished],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setShowIngredients(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  function startTimer(seconds: number, label: string, stepNo: number) {
    // Creating/resuming audio inside the click lets the browser play the alarm later.
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      audio.current = null;
    }
    const timer = createTimer(seconds, label, stepNo);
    setNow(timer.endsAt - seconds * 1000);
    setTimers((list) => [...list, timer]);
  }

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function restart() {
    setPos(0);
    setChecked(new Set());
    setTimers([]);
    setFinished(false);
  }

  const ingredientList = (
    <IngredientChecklist ingredients={ingredients} checked={checked} onToggle={toggle} />
  );
  const step = pos > 0 ? steps[pos - 1] : null;
  const durations = step ? findDurations(step) : [];

  return (
    <div
      className="cook"
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || showIngredients || finished) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className="cook-top">
        <div className="cook-title">
          <span>{title}</span>
          <span className="cook-wake small">
            {wakeLock === "active"
              ? "Bildschirm bleibt an"
              : wakeLock === "unsupported"
                ? "Dieser Browser kann den Bildschirm nicht anlassen"
                : wakeLock === "failed"
                  ? "Bildschirm kann ausgehen"
                  : ""}
          </span>
        </div>
        <div className="row">
          {ingredients.length > 0 && pos > 0 && !finished && (
            <button type="button" className="secondary" onClick={() => setShowIngredients(true)}>
              Zutaten
            </button>
          )}
          <Link href={`/recipes/${recipeId}`} className="button secondary">
            Beenden
          </Link>
        </div>
      </header>

      {timers.length > 0 && (
        <div className="cook-timers" aria-live="polite">
          {timers.map((t) => (
            <div key={t.id} className={t.done ? "cook-timer done" : "cook-timer"}>
              <span>
                {t.done ? "Fertig!" : formatSeconds((t.endsAt - now) / 1000)}{" "}
                <span className="small">Schritt {t.stepNo}</span>
              </span>
              <button
                type="button"
                className={t.done ? "icon-button" : "secondary icon-button"}
                onClick={() => setTimers((list) => list.filter((x) => x.id !== t.id))}
                aria-label={t.done ? `Timer von Schritt ${t.stepNo} ausschalten` : `Timer von Schritt ${t.stepNo} abbrechen`}
              >
                {t.done ? "✓" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!finished && (
        <nav className="cook-progress" aria-label="Schritte">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={i === 0 ? "Zu den Zutaten springen" : `Zu Schritt ${i} springen`}
              aria-current={i === pos ? "step" : undefined}
              className={i < pos ? "seen" : i === pos ? "current" : ""}
              onClick={() => setPos(i)}
            />
          ))}
        </nav>
      )}
      {!finished && total > 2 && pos === 0 && (
        <p className="cook-progress-hint">Tippe auf einen Abschnitt der Leiste, um zu einem Schritt zu springen.</p>
      )}

      <main className="cook-main" aria-live="polite">
        {finished ? (
          <div className="cook-done">
            <p className="cook-step-label">Geschafft!</p>
            <p className="cook-text">Guten Appetit!</p>
            <div className="row">
              <Link href={`/recipes/${recipeId}`} className="button">
                Zurück zum Rezept
              </Link>
              <button type="button" className="secondary" onClick={restart}>
                Von vorn
              </button>
            </div>
          </div>
        ) : pos === 0 ? (
          <>
            {imageUrl && (
              <div className="cook-image">
                <Image src={imageUrl} alt="" fill sizes="(max-width: 720px) 100vw, 680px" />
              </div>
            )}
            <p className="cook-step-label">Zutaten bereitlegen</p>
            {ingredients.length > 0 && <ServingsControl base={servingsBase} factor={factor} onChange={setFactor} />}
            {ingredients.length > 0 ? ingredientList : <p className="empty">Keine Zutaten eingetragen.</p>}
            {steps.length === 0 && <p className="empty">Für dieses Rezept sind keine Schritte eingetragen.</p>}
          </>
        ) : (
          <>
            <p className="cook-step-label">
              Schritt {pos} von {steps.length}
            </p>
            <p className="cook-text">{step}</p>
            {stepIngredients && stepIngredients[pos - 1]?.length > 0 && (
              <ul className="cook-step-ingredients" aria-label="Zutaten für diesen Schritt">
                {stepIngredients[pos - 1].map((item, i) => (
                  <li key={i}>{scaleIngredient(item, factor)}</li>
                ))}
              </ul>
            )}
            {factor !== 1 && (
              <p className="hint">Mengen umgerechnet – Angaben im Text gelten für die Originalmenge.</p>
            )}
            {!stepIngredients && assign && ingredients.length > 0 && <AssignButton assign={assign} />}
            {durations.length > 0 && (
              <div className="row">
                {durations.map((d) => (
                  <button key={d.seconds} type="button" onClick={() => startTimer(d.seconds, d.text, pos)}>
                    Timer {formatSeconds(d.seconds)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {!finished && (
        <footer className="cook-nav">
          <button type="button" className="secondary" onClick={() => go(-1)} disabled={pos === 0}>
            Zurück
          </button>
          <button type="button" onClick={() => go(1)} disabled={steps.length === 0}>
            {pos === 0 ? "Los geht’s" : pos === steps.length ? "Fertig" : "Weiter"}
          </button>
        </footer>
      )}

      {showIngredients && (
        <div className="cook-sheet" role="dialog" aria-modal="true" aria-label="Zutaten">
          <div className="cook-sheet-inner">
            <div className="row spread">
              <p className="cook-step-label">Zutaten</p>
              <button type="button" className="secondary" onClick={() => setShowIngredients(false)}>
                Schließen
              </button>
            </div>
            {ingredientList}
          </div>
        </div>
      )}
    </div>
  );
}

function IngredientChecklist({
  ingredients,
  checked,
  onToggle,
}: {
  ingredients: IngredientGroup[];
  checked: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="cook-ingredients">
      {ingredients.map((group, g) => (
        <div key={g}>
          {group.name && <h3>{group.name}</h3>}
          <ul>
            {group.items.map((item, i) => {
              const key = `${g}-${i}`;
              return (
                <li key={key}>
                  <label className={checked.has(key) ? "checked" : ""}>
                    <input type="checkbox" checked={checked.has(key)} onChange={() => onToggle(key)} />
                    <span>{item}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AssignButton({ assign }: { assign: (prev: AssignState) => Promise<AssignState> }) {
  const [state, action, pending] = useActionState(assign, null);
  return (
    <form action={action} className="cook-assign">
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? "KI ordnet zu…" : "Zutaten den Schritten zuordnen"}
      </button>
      <span className="hint">Zeigt dann unter jedem Schritt die benötigten Zutaten mit Mengen.</span>
      {state?.error && <p className="notice error">{state.error}</p>}
    </form>
  );
}
