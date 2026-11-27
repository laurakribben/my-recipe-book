"use client";

import { useState } from "react";

type Props = {
  /** Label of the first button, e.g. "Rezept löschen". */
  label: string;
  /** The question shown after the first click, e.g. "Rezept wirklich löschen?". */
  question: string;
  /** Label of the confirming button, e.g. "Ja, löschen". */
  confirmLabel: string;
  className?: string;
};

/**
 * A submit button that asks first: the first click shows the question with
 * "Ja, …" (submits the surrounding form) and "Abbrechen". Use inside a <form>.
 */
export function ConfirmButton({ label, question, confirmLabel, className = "danger" }: Props) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span>{question}</span>
      <button type="submit" className="danger" autoFocus>
        {confirmLabel}
      </button>
      <button type="button" className="secondary" onClick={() => setAsking(false)}>
        Abbrechen
      </button>
    </span>
  );
}
