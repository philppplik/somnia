import { logWarn } from "./log";

export const PROFILE_KEY = "somnia.account.profile.v1";
export const ACTIVITY_KEY = "somnia.account.activity.v1";
export interface LocalProfile {
  nickname: string;
  avatar: string;
}
export type Activity = Record<string, number>;
const listeners = new Set<() => void>();
let profile: LocalProfile | undefined;
let activity: Activity | undefined;
let lastEdit = -Infinity;

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function cleanProfile(value: unknown): LocalProfile {
  const p = value as Partial<LocalProfile> | null;
  return {
    nickname: typeof p?.nickname === "string" ? p.nickname.slice(0, 40) : "",
    avatar:
      typeof p?.avatar === "string" &&
      p.avatar.length <= 400_000 &&
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.avatar)
        ? p.avatar
        : "",
  };
}
export function cleanActivity(value: unknown, now = new Date()): Activity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 399,
  );
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([day, count]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          day >= localDay(cutoff) &&
          day <= localDay(now) &&
          typeof count === "number" &&
          Number.isSafeInteger(count) &&
          count > 0,
      )
      .map(([day, count]) => [day, Math.min(count as number, 100_000)]),
  );
}
function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export const getProfile = () => (profile ??= cleanProfile(read(PROFILE_KEY)));
export const getActivity = () =>
  (activity ??= cleanActivity(read(ACTIVITY_KEY)));
export const subscribeAccount = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const emit = () => listeners.forEach((fn) => fn());
/** Persist before changing the visible profile, so storage errors never claim success. */
export function updateProfile(patch: Partial<LocalProfile>): boolean {
  const next = cleanProfile({ ...getProfile(), ...patch });
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    profile = next;
    emit();
    return true;
  } catch {
    logWarn("account.profile", "Local profile storage is unavailable.");
    return false;
  }
}
/** One contribution per edit burst (30 s), plus each successful save. No document content is recorded. */
export function recordActivity(kind: "edit" | "save", now = new Date()): void {
  if (kind === "edit" && now.getTime() - lastEdit < 30_000) return;
  if (kind === "edit") lastEdit = now.getTime();
  const day = localDay(now),
    next = cleanActivity(
      { ...getActivity(), [day]: (getActivity()[day] || 0) + 1 },
      now,
    );
  activity = next;
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
  } catch {
    logWarn(
      "account.activity",
      "Activity remains in this session because local storage is unavailable.",
    );
  }
  emit();
}
/** 365 local calendar days, grouped Sunday-first into full weeks. Padding is not activity. */
export function activityWeeks(now = new Date()): (Date | null)[][] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const weeks: (Date | null)[][] = [];
  while (cursor <= end) {
    const week: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor < start || cursor > end ? null : new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
export const activityLevel = (count: number) =>
  count === 0 ? 0 : count < 3 ? 1 : count < 8 ? 2 : count < 16 ? 3 : 4;
/** Decode only raster images, crop and resize them, then store a bounded local JPEG. */
export async function avatarFromFile(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("invalid-image");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("invalid-image");
    const size = Math.min(bitmap.width, bitmap.height);
    if (!size) throw new Error("invalid-image");
    ctx.drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
