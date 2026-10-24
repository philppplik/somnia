import test from 'node:test';import assert from 'node:assert/strict';import {channelAllows,sanitizeUpdatePrefs,DEFAULT_UPDATE_PREFS} from './updatePrefs';
test('update channels exclude unselected prereleases',()=>{assert.equal(channelAllows('v10.0',false,'stable'),true);assert.equal(channelAllows('v10-beta',true,'stable'),false);assert.equal(channelAllows('v10-beta',true,'beta'),true);assert.equal(channelAllows('v10-alpha',true,'beta'),false);assert.equal(channelAllows('v10-nightly',true,'alpha'),true);});
test('update cadence sanitizes to supported intervals',()=>{assert.deepEqual(sanitizeUpdatePrefs({}),DEFAULT_UPDATE_PREFS);assert.deepEqual(sanitizeUpdatePrefs({channel:'bogus',intervalMinutes:10}),DEFAULT_UPDATE_PREFS);assert.equal(sanitizeUpdatePrefs({intervalMinutes:60,channel:'beta'}).intervalMinutes,60);});
test('a prerelease tag cannot bypass the channel via an incorrect GitHub flag',()=>{
 assert.equal(channelAllows('v12.2.0-alpha.7',false,'stable'),false);
 assert.equal(channelAllows('v12.2.0-alpha.7',false,'beta'),false);
 assert.equal(channelAllows('v12.2.0-beta.3',false,'beta'),true);
 assert.equal(channelAllows('v12.2.0+build-1',false,'stable'),true);
});
