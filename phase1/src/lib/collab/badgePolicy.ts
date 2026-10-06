/** Session-stable participant colours. Names/initials remain visible when colours repeat. */
export const PERSON_LIGHT = [
  "#C2410C",
  "#0F766E",
  "#1D4ED8",
  "#BE185D",
  "#4D7C0F",
  "#0369A1",
  "#A16207",
  "#334155",
];
export const PERSON_DARK = [
  "#FB923C",
  "#2DD4BF",
  "#60A5FA",
  "#F472B6",
  "#A3E635",
  "#38BDF8",
  "#FACC15",
  "#CBD5E1",
];
export type BadgeMode = "activity" | "always" | "never";
export const BADGE_IDLE_MS = 4000;
export function tokenFor(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 8;
}
export function badgeOpacity(mode: BadgeMode, elapsed: number, hover = false) {
  return mode === "never"
    ? 0
    : hover || elapsed < BADGE_IDLE_MS
      ? 1
      : mode === "always"
        ? 0.55
        : 0;
}
export const initialOf = (name: string) =>
  Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
let mode: BadgeMode = "activity";
try {
  const saved = localStorage.getItem("somnia.collab.badges.v1");
  if (saved === "always" || saved === "never") mode = saved;
} catch {
  /* SSR / denied storage */
}
const listeners = new Set<() => void>();
export const getBadgeMode = () => mode;
export const onBadgeMode = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function setBadgeMode(next: BadgeMode) {
  mode = next;
  try {
    localStorage.setItem("somnia.collab.badges.v1", next);
  } catch {
    /* optional preference */
  }
  listeners.forEach((f) => f());
}
