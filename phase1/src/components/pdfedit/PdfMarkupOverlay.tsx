import { useEffect, useRef, useState } from "react";
import {
  usePdfSession,
  editPdf,
  selectPdfMarkup,
} from "../../lib/pdfedit/session";
import {
  project,
  unproject,
  screenRect,
  moveRect,
  type Rect,
  type Point,
} from "../../lib/pdfedit/fieldGeometry";
interface Geometry {
  page: number;
  transform: number[];
  bounds: number[];
}
export function PdfMarkupOverlay({
  name,
  geometry: g,
}: {
  name: string;
  geometry: Geometry;
}) {
  const s = usePdfSession(name),
    ref = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: number;
      start: Point;
      rect: Rect;
      resize: boolean;
      t: number[];
    } | null>(null),
    [preview, setPreview] = useState<Rect | null>(null);
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  useEffect(cancel, [s?.bytes, s?.markupSelected]);
  const c = s?.info?.comments.find(
      (c) =>
        c.target.object === s.markupSelected && c.target.page === g.page - 1,
    ),
    p = c?.markup?.properties;
  if (!s?.editing || !c || !p) return null;
  const point = (e: React.PointerEvent, t = g.transform) => {
    const r = ref.current!.getBoundingClientRect();
    return unproject({ x: e.clientX - r.left, y: e.clientY - r.top }, t);
  };
  const start = (e: React.PointerEvent, resize = false) => {
    if (e.button !== 0 || s.busy) return;
    e.stopPropagation();
    e.preventDefault();
    ref.current!.focus({ preventScroll: true });
    ref.current!.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      start: point(e),
      rect: p.rect,
      resize,
      t: [...g.transform],
    };
  };
  const update = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return null;
    if (g.transform.some((n, i) => n !== d.t[i])) {
      cancel();
      return null;
    }
    const z = point(e, d.t),
      delta = { x: z.x - d.start.x, y: z.y - d.start.y };
    const r = d.resize
      ? {
          ...d.rect,
          width: Math.max(
            2,
            Math.min(g.bounds[2] - d.rect.x, d.rect.width + delta.x),
          ),
          height: Math.max(
            2,
            Math.min(g.bounds[3] - d.rect.y, d.rect.height + delta.y),
          ),
        }
      : moveRect(d.rect, delta, g.bounds);
    setPreview(r);
    return r;
  };
  const rect = preview ?? p.rect,
    r = screenRect(rect, g.transform),
    corner = project(
      { x: rect.x + rect.width, y: rect.y + rect.height },
      g.transform,
    );
  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none"
      aria-label="PDF markup layout"
      tabIndex={0}
      style={{ zIndex: 5, pointerEvents: "none" }}
      onPointerMove={(e) => {
        if (drag.current) {
          e.stopPropagation();
          update(e);
        }
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          selectPdfMarkup(name, null);
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        const raw = update(e);
        const r = raw
          ? {
              x: Math.round(raw.x * 100) / 100,
              y: Math.round(raw.y * 100) / 100,
              width: Math.round(raw.width * 100) / 100,
              height: Math.round(raw.height * 100) / 100,
            }
          : null;
        cancel();
        if (
          r &&
          Math.abs(r.x - d.rect.x) +
            Math.abs(r.y - d.rect.y) +
            Math.abs(r.width - d.rect.width) +
            Math.abs(r.height - d.rect.height) >
            0.01
        )
          void editPdf(name, {
            kind: "comment.properties",
            target: c.target,
            properties: { ...p, rect: r },
          });
      }}
    >
      <button
        aria-label="Move selected markup"
        onPointerDown={(e) => start(e)}
        disabled={s.busy}
        className="absolute border-2 border-blue-600 bg-blue-500/10"
        style={{
          left: r.x,
          top: r.y,
          width: r.width,
          height: r.height,
          cursor: "move",
          pointerEvents: "auto",
        }}
      />
      {c.subtype !== "Text" && (
        <button
          aria-label="Resize selected markup"
          onPointerDown={(e) => start(e, true)}
          disabled={s.busy}
          className="absolute h-3 w-3 border border-white bg-blue-600"
          style={{
            left: corner.x - 6,
            top: corner.y - 6,
            cursor: "nwse-resize",
            pointerEvents: "auto",
          }}
        />
      )}
    </div>
  );
}
