import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecoveryEvidencePanel } from './RecoveryEvidencePanel';
import { IncidentDetail } from './IncidentDetail';
import { setLocale } from '../../lib/i18n';
import { ERROR_IDS } from '../../lib/../generated/errorIds';
import type { IncidentId } from '../../lib/diagnostics/ids';
test('current draft evidence is never an incident checkpoint and exposes no restore button', () => {
 setLocale('de');
 const html = renderToStaticMarkup(<RecoveryEvidencePanel evidence={[{ kind: 'draft-present', count: 2, newestAgeSec: 120, verified: true }]}/>);
 assert.ok(html.includes('Aktuell verfügbare lokale Recovery-Drafts')); assert.ok(html.includes('Kein Beleg für diesen Vorfall')); assert.ok(html.includes('konnte nicht geprüft werden')); assert.ok(!html.includes('<button'));
});
test('incident-scoped producer proof visibly limits checkpoint by session, scope, and time', () => {
 setLocale('en');
 const html = renderToStaticMarkup(<RecoveryEvidencePanel evidence={[{ kind: 'incident-scoped', scope: 'code-text', session: 'session-proof', checkpointAt: '2026-10-10T12:00:00Z', snapshotCorrelated: true }]}/>);
 assert.ok(html.includes('session-proof')); assert.ok(html.includes('code-text')); assert.ok(html.includes('Changes after that time may be missing')); assert.ok(!html.includes('<button'));
});
test('unclean-exit copy does not claim a native crash; incident references are selectable', () => {
 setLocale('en');
 const html = renderToStaticMarkup(<IncidentDetail incident={{incidentId:'incident-ref' as IncidentId,kind:'unclean-exit',occurredAt:'2026-10-10T12:00:00Z',errorId:ERROR_IDS.APP_010,reviewedAt:null,build:{release:'12.0.1',sha:'abc',channel:'beta',arch:'x64',frontend_build:'test'},recovery:[],artifacts:[]}}/>);
 assert.ok(html.includes('This alone does not confirm a crash')); assert.ok(html.includes('data-copyable')); assert.ok(!html.includes('Your project is safe'));
});
