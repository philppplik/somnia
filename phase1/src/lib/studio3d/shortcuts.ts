/**
 * The 3D studio keyboard shortcuts shown in the help overlay. Pure data, no three.js: key glyphs are
 * layout-neutral, the labels are locale keys resolved by the component. Keep in sync with the viewport key handler.
 */
export interface ShortcutHint{keys:string;labelKey:string;}
export const SHORTCUT_HINTS:readonly ShortcutHint[]=[
 {keys:'W / E / R',labelKey:'studio3d.keys.gizmo'},
 {keys:'F',labelKey:'studio3d.keys.frame'},
 {keys:'S',labelKey:'studio3d.keys.snap'},
 {keys:'M',labelKey:'studio3d.keys.measure'},
 {keys:'1 - 9',labelKey:'studio3d.keys.viewApply'},
 {keys:'Shift + 1 - 9',labelKey:'studio3d.keys.viewSave'},
 {keys:'↑ ↓ ← →',labelKey:'studio3d.keys.orbit'},
 {keys:'+ / -',labelKey:'studio3d.keys.zoom'},
 {keys:'Home',labelKey:'studio3d.keys.reset'},
 {keys:'Esc',labelKey:'studio3d.keys.escape'},
 {keys:'?',labelKey:'studio3d.keys.help'},
];
