import test from 'node:test';import assert from 'node:assert/strict';
import {manifestUrl,channelOfVersion,shouldInstall} from './updateChannel';
test('stable keeps the releases/latest endpoint, other channels use the fixed manifest release',()=>{
 assert.equal(manifestUrl('stable'),'https://github.com/philppplik/somnia/releases/latest/download/latest.json');
 assert.equal(manifestUrl('beta'),'https://github.com/philppplik/somnia/releases/download/updater-channels/latest-beta.json');
 assert.equal(manifestUrl('alpha'),'https://github.com/philppplik/somnia/releases/download/updater-channels/latest-alpha.json');
});
test('version to channel',()=>{
 assert.deepEqual(['12.0.1','v12.2.0-beta.2','12.2.0-rc.1','12.2.0-alpha.7','12.2.0+b1'].map(channelOfVersion),['stable','beta','beta','alpha','stable']);
});
test('numeric prerelease ordering decides, not string order',()=>{
 assert.equal(shouldInstall('12.2.0-beta.3','12.2.0-beta.10','beta'),true);
 assert.equal(shouldInstall('12.2.0-beta.10','12.2.0-beta.3','beta'),false);
 assert.equal(shouldInstall('12.2.0-alpha.7','12.2.0-beta.1','beta'),true);
});
test('no repeat, no downgrade, final beats its own prerelease',()=>{
 assert.equal(shouldInstall('12.2.0-beta.2','12.2.0-beta.2','beta'),false);
 assert.equal(shouldInstall('12.2.0','12.2.0-beta.9','alpha'),false);
 assert.equal(shouldInstall('12.2.0-beta.9','12.2.0','stable'),true);
 assert.equal(shouldInstall('12.2.0-beta.9','12.2.0','beta'),true);
});
test('channel gate: stable never takes prereleases, beta never takes alphas',()=>{
 assert.equal(shouldInstall('12.0.1','12.2.0-beta.1','stable'),false);
 assert.equal(shouldInstall('12.0.1','12.2.0-alpha.1','beta'),false);
 assert.equal(shouldInstall('12.0.1','12.2.0-alpha.1','alpha'),true);
 assert.equal(shouldInstall('12.0.1','12.1.0','stable'),true);
});
test('garbage versions are rejected',()=>{assert.equal(shouldInstall('x','12.0.0','stable'),false);assert.equal(shouldInstall('12.0.0','nope','alpha'),false);});
