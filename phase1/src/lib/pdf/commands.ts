import {
  applyPdfEditCommand,
  PdfEditError,
  type PdfEditCommand,
  type PdfEditDocument,
} from "./model";
/** Attach these tokens to the existing PdfSession, not a second store. */
export interface PdfEditRevision {
  documentId: string;
  sourceHash: string;
  revision: number;
}
export interface PdfEditCapabilities {
  annotate: boolean;
  organize: boolean;
  fillForms: boolean;
  reason: string | null;
}
export interface PdfEditCommandRequest {
  token: PdfEditRevision;
  command: PdfEditCommand;
}
export function assertPdfEditRevision(
  expected: PdfEditRevision,
  received: PdfEditRevision,
): void {
  if (
    !expected.documentId ||
    !expected.sourceHash ||
    !Number.isSafeInteger(expected.revision) ||
    expected.revision < 0 ||
    expected.documentId !== received.documentId ||
    expected.sourceHash !== received.sourceHash ||
    expected.revision !== received.revision
  )
    throw new PdfEditError("Stale PDF edit request.");
}
/** Existing session can use this boundary for user, AI and worker-origin commands alike. */
export function applyRevisionedPdfCommand(
  document: PdfEditDocument,
  token: PdfEditRevision,
  capabilities: PdfEditCapabilities,
  request: PdfEditCommandRequest,
) {
  assertPdfEditRevision(token, request.token);
  const kind = request.command.kind;
  const permitted =
    kind === "rotate" || kind === "delete" || kind === "reorder"
      ? capabilities.organize
      : kind === "annotation.add" || kind === "annotation.remove"
        ? capabilities.annotate
        : kind === "field.set" || kind === "field.reset"
          ? capabilities.fillForms
          : false;
  if (!permitted)
    throw new PdfEditError(
      capabilities.reason ?? "This PDF edit is unavailable.",
    );
  if (token.revision >= Number.MAX_SAFE_INTEGER)
    throw new PdfEditError("PDF revision limit reached.");
  return {
    document: applyPdfEditCommand(document, request.command),
    token: { ...token, revision: token.revision + 1 },
  };
}
