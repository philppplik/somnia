import {defineConformanceSuite} from './conformance';
import {referenceSubject} from './testSupport/referenceSubject';
// Validates the suite itself against a small known-good client. Replace/extend with the real module in realSubject.test.ts.
defineConformanceSuite('reference',d=>referenceSubject(d));
