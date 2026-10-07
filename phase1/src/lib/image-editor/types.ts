/** Serializable edit intent. Source bytes and decoded GPU/DOM objects live outside the document. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export interface ImageOperation {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly params: Readonly<Record<string, JsonValue>>;
}
export interface ImageSourceInfo { readonly id: string; readonly name: string; readonly mime: string; readonly width: number; readonly height: number }
export interface ImageEditDocument { readonly schemaVersion: 1; readonly source: ImageSourceInfo; readonly operations: readonly ImageOperation[]; readonly revision: number }
export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface Viewport extends Point { zoom: number }
export type ExportFormat = 'png' | 'jpg' | 'webp';
export interface ExportOptions { format: ExportFormat; quality?: number; background?: string }
