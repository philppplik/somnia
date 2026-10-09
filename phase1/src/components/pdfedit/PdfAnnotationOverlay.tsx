import { useEffect, useRef, useState } from "react";
import {
  usePdfSession,
  editPdf,
  placePdfAnnotation,
} from "../../lib/pdfedit/session";
import {
  unproject,
  screenRect,
  type Point,
  type Rect,
} from "../../lib/pdfedit/fieldGeometry";
interface Geometry {
  page: number;
  transform: number[];
  bounds: number[];
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function PdfAnnotationOverlay({
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
      t: number[];
      client: Point;
    } | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  useEffect(cancel, [s?.bytes, s?.annotationPlacement]);
  if (!s?.editing || !s.annotationPlacement) return null;
  const a = s.annotationPlacement;
  const point = (e: React.PointerEvent, t = g.transform) => {
    const box = ref.current!.getBoundingClientRect();
    return unproject({ x: e.clientX - box.left, y: e.clientY - box.top }, t);
  };
  const rectangle = (e: React.PointerEvent): Rect | null => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return null;
    if (g.transform.some((n, i) => n !== d.t[i])) {
      cancel();
      return null;
    }
    const p = point(e, d.t),
      b = g.bounds;
    if (a.kind === "note")
      return {
        x: clamp(p.x, b[0], b[2] - 20),
        y: clamp(p.y - 20, b[1], b[3] - 20),
        width: 20,
        height: 20,
      };
    const x = clamp(Math.min(d.start.x, p.x), b[0], b[2] - 2),
      y = clamp(Math.min(d.start.y, p.y), b[1], b[3] - 2);
    return {
      x,
      y,
      width: clamp(Math.abs(p.x - d.start.x), 2, b[2] - x),
      height: clamp(Math.abs(p.y - d.start.y), 2, b[3] - y),
    };
  };
  const rgb = `rgb(${a.color.map((n) => Math.round(n * 255)).join(",")})`;
  return (
    <div
      ref={ref}
      aria-label="PDF annotation placement"
      tabIndex={0}
      className="absolute inset-0 touch-none"
      style={{ zIndex: 6, cursor: "crosshair" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          placePdfAnnotation(name, null);
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || s.busy) return;
        e.preventDefault();
        e.stopPropagation();
        ref.current!.focus({ preventScroll: true });
        ref.current!.setPointerCapture(e.pointerId);
        drag.current = {
          id: e.pointerId,
          start: point(e),
          t: [...g.transform],
          client: { x: e.clientX, y: e.clientY },
        };
        setPreview(rectangle(e));
      }}
      onPointerMove={(e) => {
        if (drag.current) {
          e.stopPropagation();
          setPreview(rectangle(e));
        }
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        const r = rectangle(e);
        cancel();
        if (!r) return;
        if (
          a.kind !== "note" &&
          Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < 4
        )
          return;
        placePdfAnnotation(name, null);
        const annotation =
          a.kind === "note"
            ? { ...a, position: { x: r.x, y: r.y + 20 } }
            : { ...a, rects: [r] };
        void editPdf(name, {
          kind: "annotation",
          annotation: { ...annotation, page: g.page - 1 },
        });
      }}
    >
      {preview &&
        (() => {
          const r = screenRect(preview, g.transform);
          return (
            <div
              className="pointer-events-none absolute border-2 border-blue-600"
              style={{
                left: r.x,
                top: r.y,
                width: r.width,
                height: r.height,
                background: rgb,
                opacity: a.kind === "highlight" ? a.opacity : 0.35,
              }}
            />
          );
        })()}
    </div>
  );
}
