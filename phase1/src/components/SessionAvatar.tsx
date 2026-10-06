import { useEffect, useState } from "react";
import { initialOf } from "../lib/collab/badgePolicy";
/** 26px person circle. Initials are always rendered; a validated thumbnail covers them once it has loaded, so a missing or broken image never changes layout. */
export function SessionAvatar({ name, token, src, title }: { name: string; token: number; src?: string; title?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "bad">("idle");
  useEffect(() => setState("idle"), [src]);
  return (
    <span className="sc-avatar" data-person-token={token} title={title} data-avatar={src && state !== "bad" ? "image" : "initials"}>
      <span aria-hidden>{initialOf(name)}</span>
      {src && state !== "bad" && (
        <img alt="" src={src} width={26} height={26} draggable={false} referrerPolicy="no-referrer" onLoad={() => setState("ok")} onError={() => setState("bad")} style={{ opacity: state === "ok" ? 1 : 0 }} />
      )}
    </span>
  );
}
