"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BackIcon, ForwardIcon, PauseIcon, PlayIcon } from "@/components/icons";

export type Slide = { id: string; title: string; image: string | null; book: string };

const INTERVAL_MS = 6000;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia(MOTION_QUERY).matches;

/**
 * Random recipes as a slideshow at the top of the start page. Swipe or use the arrows; it
 * moves on by itself every few seconds unless paused, hovered or focused, or the person
 * prefers reduced motion.
 */
export function RecipeSlideshow({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => true);

  const goTo = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const next = (i + slides.length) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [slides.length, reducedMotion],
  );

  const autoplay = !paused && !holding && !reducedMotion && slides.length > 1;
  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") goTo(index + 1);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoplay, index, goTo]);

  if (slides.length === 0) return null;

  return (
    <section
      className="slideshow"
      aria-roledescription="Karussell"
      aria-label="Rezeptideen"
      onMouseEnter={() => setHolding(true)}
      onMouseLeave={() => setHolding(false)}
      onFocus={() => setHolding(true)}
      onBlur={() => setHolding(false)}
    >
      <div
        className="slides"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
        }}
      >
        {slides.map((s, i) => (
          <Link
            key={s.id}
            href={`/recipes/${s.id}`}
            className="slide"
            aria-roledescription="Folie"
            aria-label={`${s.title} (${i + 1} von ${slides.length})`}
            tabIndex={i === index ? 0 : -1}
          >
            {s.image ? (
              <Image src={s.image} alt="" fill sizes="(max-width: 1536px) 100vw, 1536px" priority={i === 0} />
            ) : (
              <span className="slide-initial" aria-hidden="true">
                {s.title.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="slide-caption">
              <span className="slide-book">{s.book}</span>
              <span className="slide-title">{s.title}</span>
            </span>
          </Link>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="slide-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Vorheriges Rezept"
            title="Vorheriges Rezept"
            onClick={() => goTo(index - 1)}
          >
            <BackIcon />
          </button>
          <div className="slide-dots" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.id} className={i === index ? "active" : undefined} />
            ))}
          </div>
          {!reducedMotion && (
            <button
              type="button"
              className="icon-button"
              aria-label={paused ? "Abspielen" : "Anhalten"}
              title={paused ? "Abspielen" : "Anhalten"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Nächstes Rezept"
            title="Nächstes Rezept"
            onClick={() => goTo(index + 1)}
          >
            <ForwardIcon />
          </button>
        </div>
      )}
    </section>
  );
}
