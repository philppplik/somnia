import test from 'node:test';
import { sharedConformance } from './conformance.shared';

sharedConformance('pdftext');

// Skeleton: fill in once pdftext ops exist. Names are the proposed convention.
test.todo('pdf-text-extract: returns per-page text items with page index and bbox for the Standard-14 fixture');
test.todo('pdf-text-extract: finds "Hello PDF world" on page 0 of makeTextPdf()');
test.todo('pdf-text-replace: same-length replacement keeps page count and other text intact');
test.todo('pdf-text-replace: text outside Standard-14 WinAnsi range fails with a typed error, not corrupt output');
test.todo('pdf-text-add: adds a text run at page coordinates (origin bottom-left, points)');
test.todo('pdf-text-*: out-of-range page index throws RangeError');
test.todo('pdf-text-*: honours AbortSignal');
