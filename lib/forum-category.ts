import type { ForumCategory } from "@/types/database";

export const FORUM_CATEGORIES: ForumCategory[] = ["general", "scripts", "tech_support", "wins"];

export const FORUM_CATEGORY_LABELS: Record<ForumCategory, string> = {
  general: "General",
  scripts: "Scripts & Objections",
  tech_support: "Tech Support",
  wins: "Wins",
};

/** Dot color per category — shown next to the category label on a topic row, same idea as the colored dot in a status badge. */
export const FORUM_CATEGORY_DOT: Record<ForumCategory, string> = {
  general: "bg-violet-500",
  scripts: "bg-emerald-500",
  tech_support: "bg-amber-500",
  wins: "bg-pink-500",
};
