import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAppRelease} from './appRelease';
test('release pill labels alpha, beta and stable releases from the product version',()=>{
 for(const [version,label] of [
  ['11.0.0','Somnia Stable v11.0.0'],
  ['11.0.0-alpha','Somnia Alpha v11.0.0-alpha'],
  ['v11.1.0-alpha.2','Somnia Alpha v11.1.0-alpha.2'],
  ['11.0.0-beta.3+build.42','Somnia Beta v11.0.0-beta.3+build.42'],
  ['11.0.0-BETA','Somnia Beta v11.0.0-BETA'],
  ['11.0.0+beta','Somnia Stable v11.0.0+beta'],
 ])assert.equal(formatAppRelease(version),label);
});
