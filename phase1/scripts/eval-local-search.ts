import {evaluateFixture} from '../test/retrieval-eval/evaluate';
/** Dev-only offline report to stdout. No download, inference, app storage or network. */
const report=await evaluateFixture(!process.argv.includes('--original'));
console.log(JSON.stringify(report,null,2));
