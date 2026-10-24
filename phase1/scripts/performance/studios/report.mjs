// No guessed budgets: phase 0 collects runner-local distributions before any gate.
export function summarize(samples) {
 if (!Array.isArray(samples) || !samples.length || samples.some(x => !Number.isFinite(x) || x < 0)) throw Error('Invalid samples');
 const sorted = [...samples].sort((a,b) => a-b);
 const at = q => sorted[Math.ceil(q*sorted.length)-1];
 return {count:samples.length,min:sorted[0],p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)};
}
export function sampleCount(value) {
 const n=Number(value);if(!Number.isInteger(n)||n<3||n>100)throw Error('Samples must be an integer from 3 to 100');return n;
}
export function validateScenarios(scenarios) {
 if(!Array.isArray(scenarios)||!scenarios.length)throw Error('No scenarios');
 const ids=new Set();
 for(const s of scenarios){if(!s.id||ids.has(s.id)||!s.label||!s.readySelector)throw Error('Invalid or duplicate scenario');ids.add(s.id);}
 return scenarios;
}
export function markdown(report) {
 return ['# Studio browser baseline','',`SHA: ${report.sha}. ${report.environment.platform}/${report.environment.arch}, Node ${report.environment.node}, Chromium ${report.environment.browser}.`,
  `Build: ${report.buildMode}. Fixture: ${report.fixture}. Samples per metric: ${report.sampleRuns}.`,
  '', '| Scenario | Metric | p50 ms | p95 ms | p99 ms | Trials |','| --- | --- | ---: | ---: | ---: | ---: |',
  ...report.timings.map(x=>`| ${x.scenario} | ${x.metric} | ${x.summary.p50.toFixed(2)} | ${x.summary.p95.toFixed(2)} | ${x.summary.p99.toFixed(2)} | ${x.summary.count} |`),
  '', 'Return activation is not certified suspended resume: no lifecycle suspension API exists in this baseline.',
  'Memory observations are whole Chromium renderer JS heap and Linux process-tree RSS, not exclusive studio bytes, native Somnia memory or GPU residency.',
  'Startup excludes browser process launch and is navigation-to-usable-shell, not native process launch-to-window.',
  'These are diagnostics, with no pass/fail performance threshold. Real retention failures are separate blocking correctness tests.',''].join('\n');
}
