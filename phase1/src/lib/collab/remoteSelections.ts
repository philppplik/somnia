/** Remote selection widget adapted to Somnia from y-codemirror.next 0.3.6 (MIT).
 * Uses the same ySyncFacet / relative positions, but carries participant ID on the widget.
 * Name equality must never be used to identify two people with the same display name.
 */
import * as Y from "yjs";
import { ySyncFacet } from "y-codemirror.next";
import {
  ViewPlugin,
  Decoration,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { getBadgeMode, badgeOpacity, initialOf, tokenFor } from "./badgePolicy";
class RemoteCaret extends WidgetType {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly token: number,
    readonly opacity: number,
  ) {
    super();
  }
  eq(other: RemoteCaret) {
    return (
      this.id === other.id &&
      this.name === other.name &&
      this.token === other.token
    );
  }
  toDOM() {
    const caret = document.createElement("span");
    caret.className = "cm-ySelectionCaret";
    caret.dataset.personToken = String(this.token);
    caret.dataset.participantId = this.id;
    caret.append(document.createTextNode("\u2060"));
    const label = document.createElement("span");
    label.className = "cm-ySelectionInfo";
    label.dataset.personToken = String(this.token);
    label.dataset.id = this.id;
    label.title = this.name;
    label.setAttribute("aria-hidden", "true");
    label.style.opacity = String(this.opacity);
    label.textContent = initialOf(this.name) + " · " + this.name;
    caret.append(label, document.createTextNode("\u2060"));
    return caret;
  }
  ignoreEvent() {
    return true;
  }
}
export const remoteSelections = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    private conf;
    private queued = false;
    private dead = false;
    private listener = () => {
      if (this.queued || this.dead) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        if (!this.dead) this.view.dispatch({});
      });
    };
    constructor(private view: EditorView) {
      this.conf = view.state.facet(ySyncFacet);
      this.conf.awareness.on("change", this.listener);
      this.build();
    }
    update(update: ViewUpdate) {
      const aw = this.conf.awareness,
        state = aw.getLocalState();
      if (
        state &&
        update.view.hasFocus &&
        (update.selectionSet || update.docChanged || update.focusChanged)
      ) {
        const sel = update.state.selection.main;
        aw.setLocalStateField("cursor", {
          anchor: Y.createRelativePositionFromTypeIndex(
            this.conf.ytext,
            sel.anchor,
          ),
          head: Y.createRelativePositionFromTypeIndex(
            this.conf.ytext,
            sel.head,
          ),
        });
      }
      this.build();
    }
    private build() {
      const conf = this.conf,
        doc = conf.ytext.doc;
      if (!doc) return;
      const ranges: ReturnType<Decoration["range"]>[] = [];
      // Sorting by stable participant ID makes equal-position badge stacking deterministic.
      const states = [...conf.awareness.getStates()].sort(([a, x], [b, y]) =>
        String(x.user?.participantId ?? a).localeCompare(
          String(y.user?.participantId ?? b),
        ),
      );
      for (const [id, state] of states) {
        if (id === conf.awareness.clientID || !state.cursor) continue;
        try {
          const anchor = Y.createAbsolutePositionFromRelativePosition(
              state.cursor.anchor,
              doc,
            ),
            head = Y.createAbsolutePositionFromRelativePosition(
              state.cursor.head,
              doc,
            );
          if (
            !anchor ||
            !head ||
            anchor.type !== conf.ytext ||
            head.type !== conf.ytext
          )
            continue;
          const from = Math.min(anchor.index, head.index),
            to = Math.max(anchor.index, head.index);
          if (from < 0 || to > this.view.state.doc.length) continue;
          const u = state.user ?? {},
            participant = String(u.participantId ?? id),
            token =
              typeof u.token === "number" ? u.token : tokenFor(participant);
          if (from < to)
            ranges.push(
              Decoration.mark({
                class: "cm-ySelection",
                attributes: { style: `background-color:${u.colorLight}` },
              }).range(from, to),
            );
          ranges.push(
            Decoration.widget({
              widget: new RemoteCaret(
                participant,
                u.name ?? "Guest",
                token,
                badgeOpacity(getBadgeMode(), 0),
              ),
              side: head.index - anchor.index > 0 ? -1 : 1,
            }).range(head.index),
          );
        } catch {
          /* Reject bad relative positions from untrusted presence. */
        }
      }
      this.decorations = Decoration.set(ranges, true);
    }
    destroy() {
      this.dead = true;
      this.conf.awareness.off("change", this.listener);
    }
  },
  { decorations: (v) => v.decorations },
);
