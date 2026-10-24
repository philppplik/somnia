import test from 'node:test';
import assert from 'node:assert/strict';
import {saveSnapshot,snapshotsFor,snapshotSettings,deleteSnapshot,renameSnapshot} from './snapshots.ts';
import {neutralPhotoSettings} from './studioSettings.ts';
test('snapshots: save, read back, rename and delete per photo',()=>{
 const a={...neutralPhotoSettings,temp:6512};
 const b={...neutralPhotoSettings,temp:6492};
 assert.equal(saveSnapshot('p.png','base',a),true);
 assert.equal(saveSnapshot('p.png','warmer',b),true);
 assert.equal(saveSnapshot('q.png','base',b),true);
 assert.deepEqual(snapshotsFor('p.png'),['base','warmer']);
 assert.equal(snapshotSettings('p.png','warmer')?.temp,6492); // validated decode
 assert.equal(snapshotSettings('p.png','missing'),null);
 assert.equal(snapshotsFor('p.png'),snapshotsFor('p.png')); // stable reference for useSyncExternalStore
 assert.equal(saveSnapshot('p.png','',a),false);
 assert.equal(renameSnapshot('p.png','warmer','warm'),true);
 assert.deepEqual(snapshotsFor('p.png'),['base','warm']); // order kept
 assert.equal(renameSnapshot('p.png','warm',''),false);
 deleteSnapshot('p.png','base');
 assert.deepEqual(snapshotsFor('p.png'),['warm']);
 deleteSnapshot('p.png','warm');
 assert.deepEqual(snapshotsFor('p.png'),[]);
 assert.deepEqual(snapshotsFor('q.png'),['base']); // other photo untouched
 deleteSnapshot('q.png','base');
});
