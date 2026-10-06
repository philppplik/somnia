import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentReview} from './AgentReview';

test('renders hunks, escapes HTML and disables everything while streaming', () => {
  const cs = {id: 'x', complete: false, files: [{path: 'a.html', kind: 'edit' as const, baseText: '<b>\n', proposedText: '<script>alert(1)</script>\n'}]};
  const html = renderToStaticMarkup(<AgentReview changeSet={cs} readCurrent={() => '<b>\n'} onApply={() => {}} onDiscard={() => {}}/>);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Agent is still working'));
  assert.match(html, /<button[^>]*disabled[^>]*>Accept<\/button>/);
});
