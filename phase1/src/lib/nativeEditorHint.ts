import type {Domain} from './uiContext';
/** PDF has a live inline workspace; other native-mode routes keep their existing guidance. */
export function nativeEditorHintKey(domain:Domain){return domain==='pdf'?'ctx.pdfInlineHint':'ctx.nativeUnavailable';}
