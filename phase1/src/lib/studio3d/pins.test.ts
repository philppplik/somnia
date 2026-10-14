import test from 'node:test';import assert from 'node:assert/strict';
import {readPin,pinText,pinUserData,MAX_PIN_TEXT,PinError} from './pins';
test('readPin finds the label only on pin nodes',()=>{
 assert.equal(readPin(pinUserData('Check this')), 'Check this');
 assert.equal(readPin({}),null);
 assert.equal(readPin({somniaPin:'no'}),null);
 assert.equal(readPin({somniaPin:{text:5}}),null);
 assert.equal(readPin(undefined),null);
});
test('pinText normalizes whitespace and caps the length',()=>{
 assert.equal(pinText('  hello   world  '),'hello world');
 assert.equal(pinText('a\nb\tc'),'a b c');
 assert.equal(pinText(''),'');
 assert.equal(pinText('x'.repeat(MAX_PIN_TEXT)),'x'.repeat(MAX_PIN_TEXT));
 assert.throws(()=>pinText('x'.repeat(MAX_PIN_TEXT+1)),PinError);
});
