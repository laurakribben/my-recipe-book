import "server-only";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Two separate daily budgets per person: "extract" for reading recipes with AI, "complete" for
 * the small calls that fill in what a recipe is missing (and sort shopping items into aisles).
 */
export type AiKind = "extract" | "complete";
export type AiUsage = { input_tokens: number; output_tokens: number };

export function aiLimit(kind: AiKind): number {
  return kind === "extract" ? env.aiDailyLimit() : env.aiCompletionDailyLimit();
}

/** AI calls of this kind the user has left in the last 24 hours. */
export async function aiCallsLeft(userId: string, kind: AiKind): Promise<number> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ai_extractions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  return aiLimit(kind) - (count ?? 0);
}

export async function recordAiUsage(userId: string, kind: AiKind, usage: AiUsage) {
  const supabase = await createClient();
  await supabase.from("ai_extractions").insert({ user_id: userId, kind, ...usage });
}
