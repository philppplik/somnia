import test from 'node:test';
import { sharedConformance } from './conformance.shared';

sharedConformance('pdfforms');

// Fixture: makeAcroFormPdf() has full_name (text), accept_terms (checkbox),
// country (dropdown: Germany/France/Spain), plan (radio: free/pro).
test.todo('pdf-form-list: lists the four fields with types and current values');
test.todo('pdf-form-fill: sets text field and regenerates its appearance stream');
test.todo('pdf-form-fill: checkbox on/off and radio option select');
test.todo('pdf-form-fill: dropdown value not in options is rejected');
test.todo('pdf-form-flatten: result has no fields and no /AcroForm, page count unchanged');
test.todo('pdf-form-*: document without AcroForm returns an empty list, not an error');
