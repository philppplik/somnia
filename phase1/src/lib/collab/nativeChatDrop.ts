/** Native OS drops are granted by Rust. This flag chooses the UI recipient, never filesystem authority.
 * Tauri positions are physical pixels; DOM rectangles are CSS pixels.
 * Recipients: the session chat panel (.sc-panel) and the file converter drop zone (.cv-drop).
 */
type Recipient = "chat" | "convert" | null;
let over: Recipient = null;
const inside = (selector: string, x: number, y: number) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
/** True while the pointer is over the chat panel. */
export const nativeDropIsChat = () => over === "chat";
/** True while the pointer is over any in-app drop target, so the project-import overlay stays hidden. */
export const nativeDropIsInApp = () => over !== null;
export function trackNativeDrop(
  type: string,
  position?: { x: number; y: number },
) {
  if (type === "leave") {
    over = null;
    return;
  }
  if (!position || typeof document === "undefined") return;
  const scale = window.devicePixelRatio || 1;
  const x = position.x / scale,
    y = position.y / scale;
  over = inside(".sc-panel", x, y)
    ? "chat"
    : inside(".cv-drop", x, y)
      ? "convert"
      : null;
}
export function consumeNativeChatDrop() {
  const current = over === "chat";
  if (current) over = null;
  return current;
}
/** True once when the last drop landed on the converter drop zone. */
export function consumeNativeConvertDrop() {
  const current = over === "convert";
  if (current) over = null;
  return current;
}
