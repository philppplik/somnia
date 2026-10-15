import test from 'node:test';
import assert from 'node:assert/strict';
import {addToCollection,collectionNames,collectionMembers,removeFromCollection,deleteCollection,renameCollection,isInCollection} from './collections.ts';
test('collections: add, dedupe, remove, rename, delete',()=>{
 assert.equal(addToCollection('Favs',['a.png','b.png']),2);
 assert.equal(addToCollection('Favs',['b.png','c.png']),1); // b already in
 assert.deepEqual(collectionMembers('Favs'),['a.png','b.png','c.png']);
 assert.equal(isInCollection('Favs','b.png'),true);
 assert.equal(addToCollection('  ',['x.png']),0); // empty name refused
 assert.equal(addToCollection('Picks',['z.png']),1);
 assert.deepEqual(collectionNames(),['Favs','Picks']); // sorted, stable
 assert.equal(collectionNames(),collectionNames()); // stable reference
 assert.equal(collectionMembers('Favs'),collectionMembers('Favs'));
 removeFromCollection('Favs',['a.png']);
 assert.deepEqual(collectionMembers('Favs'),['b.png','c.png']);
 assert.equal(renameCollection('Favs','Best'),true);
 assert.deepEqual(collectionNames(),['Best','Picks']);
 assert.equal(renameCollection('Best','Picks'),false); // no clobbering
 assert.equal(renameCollection('Best',''),false);
 removeFromCollection('Best',['b.png','c.png']);
 assert.deepEqual(collectionNames(),['Picks']); // emptied collection dropped
 deleteCollection('Picks');
 assert.deepEqual(collectionNames(),[]);
});
