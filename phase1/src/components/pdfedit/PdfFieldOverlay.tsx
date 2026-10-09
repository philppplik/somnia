import { useEffect, useRef, useState } from "react";
import {
  usePdfSession,
  editPdf,
  selectPdfField,
  placePdfField,
  layoutPdfFields,
} from "../../lib/pdfedit/session";
import {
  project,
  unproject,
  screenRect,
  moveRect,
  resizeRect,
  drawRect,
  type Point,
  type Rect,
} from "../../lib/pdfedit/fieldGeometry";
import type { DesignField } from "../../lib/pdfedit/formDesign";
interface Geometry {
  page: number;
  transform: number[];
  bounds: number[];
  width: number;
  height: number;
}
interface Gesture {
  id: number;
  start: Point;
  rect: Rect;
  entry?: DesignField;
  mode: "create" | "move" | "resize";
  transform: number[];
  bounds: number[];
  client: Point;
}
export function PdfFieldOverlay({
  name,
  geometry: g,
}: {
  name: string;
  geometry: Geometry;
}) {
  const s = usePdfSession(name),
    ref = useRef<HTMLDivElement>(null),
    drag = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  useEffect(() => {
    const cancel = () => {
      drag.current = null;
      setPreview(null);
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  useEffect(() => {
    drag.current = null;
    setPreview(null);
  }, [s?.formLayout, s?.bytes]);
  if (!s?.editing || !s.formLayout) return null;
  const fields = (s.info?.designFields ?? []).filter(
    (f) => f.properties.page === g.page - 1,
  );
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  const point = (e: React.PointerEvent, t = g.transform) => {
    const r = ref.current!.getBoundingClientRect();
    return unproject({ x: e.clientX - r.left, y: e.clientY - r.top }, t);
  };
  const start = (
    e: React.PointerEvent,
    entry?: DesignField,
    resize = false,
  ) => {
    if (
      e.button !== 0 ||
      s.busy ||
      (!entry && !s.formPlacement) ||
      (entry && !entry.editable)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    ref.current!.focus({ preventScroll: true });
    ref.current!.setPointerCapture(e.pointerId);
    if (entry) selectPdfField(name, entry.name);
    if (
      entry &&
      (entry.properties.width > g.bounds[2] - g.bounds[0] ||
        entry.properties.height > g.bounds[3] - g.bounds[1])
    )
      return;
    const p = point(e);
    const r = entry?.properties ?? s.formPlacement!.properties;
    drag.current = {
      id: e.pointerId,
      start: p,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      entry,
      mode: entry ? (resize ? "resize" : "move") : "create",
      transform: [...g.transform],
      bounds: [...g.bounds],
      client: { x: e.clientX, y: e.clientY },
    };
  };
  const update = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return null;
    if (g.transform.some((n, i) => n !== d.transform[i])) {
      cancel();
      return null;
    }
    const p = point(e, d.transform),
      delta = { x: p.x - d.start.x, y: p.y - d.start.y };
    let rect: Rect;
    if (d.mode === "move") rect = moveRect(d.rect, delta, d.bounds);
    else if (d.mode === "resize") rect = resizeRect(d.rect, delta, d.bounds);
    else if (Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < 4)
      rect = moveRect(
        {
          ...d.rect,
          width: Math.min(d.rect.width, d.bounds[2] - d.bounds[0]),
          height: Math.min(d.rect.height, d.bounds[3] - d.bounds[1]),
          x: p.x,
          y: p.y,
        },
        { x: 0, y: 0 },
        d.bounds,
      );
    else rect = drawRect(d.start, p, d.bounds);
    setPreview(rect);
    return rect;
  };
  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none"
      aria-label="PDF field layout"
      tabIndex={0}
      style={{ cursor: s.formPlacement ? "crosshair" : "default", zIndex: 5 }}
      onPointerDown={(e) => start(e)}
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
          placePdfField(name, null);
          layoutPdfFields(name, false);
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        const raw = update(e);
        const rect = raw
          ? (Object.fromEntries(
              Object.entries(raw).map(([key, value]) => [
                key,
                Math.round(value * 100) / 100,
              ]),
            ) as unknown as Rect)
          : null;
        cancel();
        if (!rect) return;
        if (d.entry) {
          if (
            JSON.stringify(rect) !==
            JSON.stringify({
              x: d.rect.x,
              y: d.rect.y,
              width: d.rect.width,
              height: d.rect.height,
            })
          )
            void editPdf(name, {
              kind: "field.properties",
              name: d.entry.name,
              expected: d.entry.expected,
              properties: { ...d.entry.properties, ...rect },
            });
        } else if (s.formPlacement) {
          const op = s.formPlacement;
          placePdfField(name, null);
          void editPdf(name, {
            ...op,
            properties: { ...op.properties, ...rect, page: g.page - 1 },
          }).then(() => selectPdfField(name, op.name));
        }
      }}
    >
      {fields.map((f) => {
        const r = screenRect(
            drag.current?.entry?.name === f.name && preview
              ? preview
              : f.properties,
            g.transform,
          ),
          selected = s.formSelected === f.name;
        const activeRect =
          drag.current?.entry?.name === f.name && preview
            ? preview
            : f.properties;
        const corner = project(
          {
            x: activeRect.x + activeRect.width,
            y: activeRect.y + activeRect.height,
          },
          g.transform,
        );
        return (
          <div key={f.name}>
            <button
              aria-label={`Move field ${f.name}`}
              disabled={s.busy || !f.editable}
              title={f.reason ?? "Drag to move field"}
              onPointerDown={(e) => start(e, f)}
              onClick={() => selectPdfField(name, f.name)}
              className="absolute border-2 bg-blue-500/10"
              style={{
                left: r.x,
                top: r.y,
                width: r.width,
                height: r.height,
                borderColor: selected ? "#2563eb" : "#60a5fa",
                cursor: f.editable ? "move" : "not-allowed",
                pointerEvents: s.formPlacement ? "none" : "auto",
              }}
            />
            {selected && f.editable && !s.formPlacement && (
              <button
                aria-label={`Resize field ${f.name}`}
                onPointerDown={(e) => start(e, f, true)}
                disabled={s.busy}
                className="absolute h-3 w-3 border border-white bg-blue-600"
                style={{
                  left: corner.x - 6,
                  top: corner.y - 6,
                  cursor: "nwse-resize",
                }}
              />
            )}
          </div>
        );
      })}
      {preview &&
        drag.current?.mode === "create" &&
        (() => {
          const r = screenRect(preview, g.transform);
          return (
            <div
              className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/15"
              style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
            />
          );
        })()}
    </div>
  );
}
