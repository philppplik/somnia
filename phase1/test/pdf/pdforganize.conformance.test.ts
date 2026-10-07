import test from 'node:test';
import { sharedConformance } from './conformance.shared';

sharedConformance('pdforganize');

// Fixture: makeMultiPagePdf(5) has "Page N of 5" on page N.
test.todo('pdf-page-delete: deleting index 1 leaves 4 pages, order 1,3,4,5');
test.todo('pdf-page-reorder: permutation [4,3,2,1,0] reverses pages');
test.todo('pdf-page-reorder: non-permutation (duplicates, missing index) throws');
test.todo('pdf-page-rotate: sets /Rotate to a multiple of 90, adds to existing rotation');
test.todo('pdf-page-extract: returns a new document with only the selected pages');
test.todo('pdf-page-merge: concatenates two fixtures, page count is the sum');
test.todo('pdf-page-delete: refuses to delete the last remaining page');
