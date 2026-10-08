export type CraftRequest =
  | { id: number; kind: 'init'; wasmUrl: string }
  | { id: number; kind: 'blur'; bytes: ArrayBuffer; width: number; height: number; radius: number };
export type CraftResponse =
  | { id: number; ok: true; kind: 'ready'; initMs: number }
  | { id: number; ok: true; kind: 'result'; bytes: ArrayBuffer; jobMs: number }
  | { id: number; ok: false; error: string };
