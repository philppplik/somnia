/** Native OS drops are granted by Rust. This flag chooses the UI recipient, never filesystem authority.
 * Tauri positions are physical pixels; DOM rectangles are CSS pixels.
 */
let over = false;
export const nativeDropIsChat = () => over;
export function trackNativeDrop(
  type: string,
  position?: { x: number; y: number },
) {
  if (type === "leave") {
    over = false;
    return;
  }
  if (!position || typeof document === "undefined") return;
  const panel = document.querySelector(".sc-panel");
  if (!panel) {
    over = false;
    return;
  }
  const r = panel.getBoundingClientRect(),
    scale = window.devicePixelRatio || 1;
  const x = position.x / scale,
    y = position.y / scale;
  over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
export function consumeNativeChatDrop() {
  const current = over;
  over = false;
  return current;
}
