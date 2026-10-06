import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityWeeks,
  activityLevel,
  cleanProfile,
  cleanActivity,
  localDay,
  getActivity,
  recordActivity,
  PROFILE_KEY,
  updateProfile,
  getProfile,
} from "./account";

test("local calendar dates and 365-day grid including leap year, week padding and DST", () => {
  for (const now of [
    new Date(2026, 9, 6),
    new Date(2024, 2, 1),
    new Date(2026, 2, 29),
    new Date(2026, 9, 25),
    new Date(2026, 0, 1),
  ]) {
    const weeks = activityWeeks(now),
      days = weeks.flat().filter((d): d is Date => !!d);
    assert.equal(days.length, 365);
    assert.equal(new Set(days.map(localDay)).size, 365);
    assert.equal(localDay(days.at(-1)!), localDay(now));
    weeks.forEach((w) =>
      w.forEach((d, i) => {
        if (d) assert.equal(d.getDay(), i);
      }),
    );
  }
});
test("profile strips unsafe image sources and limits nickname length", () => {
  assert.deepEqual(cleanProfile(null), { nickname: "", avatar: "" });
  assert.equal(
    cleanProfile({
      nickname: "x".repeat(80),
      avatar: "https://tracking.invalid/avatar",
    }).nickname.length,
    40,
  );
  for (const avatar of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64,%%%%",
  ])
    assert.equal(cleanProfile({ avatar }).avatar, "");
  assert.equal(
    cleanProfile({ avatar: "data:image/jpeg;base64,AAAA" }).avatar,
    "data:image/jpeg;base64,AAAA",
  );
});
test("activity validates, bounds and prunes values", () => {
  assert.deepEqual(
    cleanActivity(
      {
        "2026-10-06": 2,
        "2026-10-07": 3,
        "2020-01-01": 9,
        wat: 3,
        "2026-10-05": -2,
        "2026-10-04": "3",
      },
      new Date(2026, 9, 6),
    ),
    { "2026-10-06": 2 },
  );
  assert.deepEqual(
    [0, 1, 2, 3, 7, 8, 15, 16, 900].map(activityLevel),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
});
test("profile persists before changing UI and successful saves count, edit bursts deduplicate", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
  });
  assert.equal(updateProfile({ nickname: "Philipp" }), true);
  assert.equal(getProfile().nickname, "Philipp");
  assert.ok(values.has(PROFILE_KEY));
  recordActivity("edit", new Date(2026, 9, 6, 12));
  recordActivity("edit", new Date(2026, 9, 6, 12, 0, 29));
  recordActivity("edit", new Date(2026, 9, 6, 12, 0, 30));
  recordActivity("save", new Date(2026, 9, 6, 12, 0, 31));
  assert.equal(getActivity()["2026-10-06"], 3);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: () => {
        throw new Error("quota");
      },
    },
  });
  assert.equal(updateProfile({ nickname: "Not saved" }), false);
  assert.equal(getProfile().nickname, "Philipp");
});
