import { test } from "node:test";
import assert from "node:assert/strict";
import {
  project,
  unproject,
  screenRect,
  moveRect,
  resizeRect,
  drawRect,
} from "./fieldGeometry";
test("PDF viewport matrix roundtrips crop origin, zoom and all page/view rotations", () => {
  for (const t of [
    [2, 0, 0, -2, -40, 660],
    [0, 2, 2, 0, -60, -40],
    [-2, 0, 0, 2, 640, -60],
    [0, -2, -2, 0, 660, 640],
  ]) {
    const p = { x: 60, y: 120 };
    assert.deepEqual(unproject(project(p, t), t), p);
    const r = screenRect({ x: 60, y: 120, width: 70, height: 20 }, t);
    assert.ok(r.width > 0 && r.height > 0);
    assert.equal(r.width * r.height, 70 * 20 * 4);
  }
  assert.throws(() => unproject({ x: 1, y: 2 }, [0, 0, 0, 0, 0, 0]), /Invalid/);
});
test("draw, move and resize stay inside crop bounds with an 8 pt minimum", () => {
  const b = [20, 30, 320, 430],
    r = { x: 30, y: 50, width: 180, height: 30 };
  assert.deepEqual(moveRect(r, { x: 999, y: -999 }, b), {
    ...r,
    x: 140,
    y: 30,
  });
  assert.deepEqual(resizeRect(r, { x: 999, y: -999 }, b), {
    ...r,
    width: 290,
    height: 8,
  });
  assert.deepEqual(drawRect({ x: 100, y: 150 }, { x: 40, y: 70 }, b), {
    x: 40,
    y: 70,
    width: 60,
    height: 80,
  });
  assert.deepEqual(drawRect({ x: 999, y: 999 }, { x: 999, y: 999 }, b), {
    x: 312,
    y: 422,
    width: 8,
    height: 8,
  });
});
