"use client";

import { useState, type ReactNode } from "react";
import { DRAG_TYPE } from "./week-table";

/** A noted recipe in "Diese Woche"/"Nächste Woche" that can be dragged onto a cell of the week. */
export function DraggableIdea({
  id,
  title,
  recipeId,
  enabled,
  children,
}: {
  id: string;
  title: string;
  recipeId: string | null;
  enabled: boolean;
  children: ReactNode;
}) {
  // Hidden right after a successful drop; the reloaded page then no longer lists it.
  const [planned, setPlanned] = useState(false);
  if (planned) return null;
  return (
    <li
      className={enabled ? "draggable" : undefined}
      draggable={enabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: "idea", id, title, recipe_id: recipeId }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={(e) => {
        if (e.dataTransfer.dropEffect === "move") setPlanned(true);
      }}
    >
      {children}
    </li>
  );
}
