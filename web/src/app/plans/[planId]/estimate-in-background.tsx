"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks the server once to estimate nutrition for this week's free entries, then refreshes the
 * page so the balance includes them. Renders nothing; the balance stays usable meanwhile.
 */
export function EstimateInBackground({ run }: { run: () => Promise<number> }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    run()
      .then((estimated) => {
        if (!cancelled && estimated > 0) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Once per mount: the page remounts this (key) when the number of open estimates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
