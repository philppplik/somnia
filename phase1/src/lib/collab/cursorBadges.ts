import { ySyncAnnotation } from "y-codemirror.next";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Awareness } from "y-protocols/awareness";
import {
  BADGE_IDLE_MS,
  badgeOpacity,
  getBadgeMode,
  onBadgeMode,
  initialOf,
  tokenFor,
} from "./badgePolicy";
import { getChatSession } from "./chatSession";
/** Enhance the existing y-codemirror.next widget. No second cursor/selection renderer. */
export function cursorBadges(awareness: Awareness) {
  return ViewPlugin.fromClass(
    class {
      private activity = new Map<number, { signature: string; at: number }>();
      private timer: ReturnType<typeof setInterval>;
      private frame = 0;
      private off: () => void;
      private focusAt = -Infinity;
      constructor(private view: EditorView) {
        this.timer = setInterval(() => this.paint(), 120);
        this.off = onBadgeMode(() => this.paint());
        this.frame = requestAnimationFrame(() => this.paint());
      }
      update(update: ViewUpdate) {
        if (update.focusChanged && this.view.hasFocus)
          this.focusAt = performance.now();
        if (
          (update.selectionSet || update.docChanged) &&
          !update.transactions.some((tr) => tr.annotation(ySyncAnnotation))
        ) {
          const state = awareness.getLocalState();
          awareness.setLocalStateField(
            "activity",
            (Number(state?.activity) || 0) + 1,
          );
        }
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.paint());
      }
      private paint() {
        const now = performance.now(),
          states = awareness.getStates();
        const remote = [...states].filter(
          ([id, s]) => id !== awareness.clientID && s.cursor,
        );
        remote.forEach(([id, s]) => {
          const signature = JSON.stringify([s.cursor, s.activity]);
          const prev = this.activity.get(id);
          if (!prev || prev.signature !== signature)
            this.activity.set(id, { signature, at: now });
        });
        for (const id of this.activity.keys())
          if (!states.has(id)) this.activity.delete(id);
        const placed: DOMRect[] = [];
        const editorRect = this.view.scrollDOM.getBoundingClientRect();
        for (const label of this.view.dom.querySelectorAll<HTMLElement>(
          ".cm-ySelectionInfo",
        )) {
          const entry = remote.find(
            ([id, s]) =>
              String(s.user?.participantId ?? id) === label.dataset.id,
          );
          if (!entry) continue;
          const [id, s] = entry;
          const participantId = s.user?.participantId ?? String(id);
          const token =
            getChatSession()?.colour(participantId) ?? tokenFor(participantId);
          const caret = label.parentElement!;
          caret.dataset.personToken = String(token);
          label.dataset.personToken = String(token);
          label.dataset.initial = initialOf(s.user.name);
          label.title = s.user.name;
          label.setAttribute("aria-hidden", "true");
          label.dataset.id = participantId;
          label.dataset.mode = getBadgeMode();
          const elapsed = now - (this.activity.get(id)?.at ?? now);
          label.style.opacity = String(
            badgeOpacity(
              getBadgeMode(),
              elapsed,
              now - this.focusAt < BADGE_IDLE_MS ||
                caret.matches(":hover") ||
                (this.view.hasFocus && caret.matches(":focus-within")),
            ),
          );
          label.style.setProperty("--badge-stack", "0px");
          label.dataset.flip = "false";
          label.dataset.right = "false";
          const rect = label.getBoundingClientRect();
          if (rect.top < editorRect.top + 4) label.dataset.flip = "true";
          if (rect.right > editorRect.right - 8) label.dataset.right = "true";
          let offset = 0;
          const down = label.dataset.flip === "true";
          while (
            placed.some(
              (p) =>
                Math.abs(p.left - rect.left) < Math.max(p.width, rect.width) &&
                Math.abs(p.top - (rect.top + offset)) < 22,
            )
          )
            offset += down ? 23 : -23;
          if (offset) label.style.setProperty("--badge-stack", `${offset}px`);
          placed.push(
            new DOMRect(rect.x, rect.y + offset, rect.width, rect.height),
          );
          // Only labels fade, never carets/selections. Heartbeats do not reset activity.
          label.dataset.inactive = String(elapsed >= BADGE_IDLE_MS);
        }
      }
      destroy() {
        clearInterval(this.timer);
        cancelAnimationFrame(this.frame);
        this.off();
        this.activity.clear();
      }
    },
  );
}
