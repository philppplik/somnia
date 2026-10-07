import test from 'node:test';
import { sharedConformance } from './conformance.shared';

sharedConformance('pdfannotate');

test.todo('pdf-annot-highlight: adds a /Highlight annotation with QuadPoints on the given page');
test.todo('pdf-annot-note: adds a /Text annotation with contents');
test.todo('pdf-annot-ink: adds an /Ink annotation from point lists');
test.todo('pdf-annot-remove: removes only the annotation with the given id');
test.todo('pdf-annot-*: existing page content stream is byte-identical after adding an annotation');
test.todo('pdf-annot-*: round trip (apply, save, reload with pdf-lib) keeps annotation count');
