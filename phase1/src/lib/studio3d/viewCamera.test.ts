import test from 'node:test';
import assert from 'node:assert/strict';
import {fovToFocal,focalToFov,orthoHalfHeight,SENSOR_HEIGHT_MM} from './viewPresets';

test('fovToFocal maps the viewport default to a wide 35mm-equivalent lens',()=>{
 assert.ok(Math.abs(fovToFocal(45)-28.98)<0.01);
 assert.ok(Math.abs(fovToFocal(90)-SENSOR_HEIGHT_MM/2)<1e-9);
});
test('focalToFov inverts fovToFocal across the working range',()=>{
 for(const f of [1,20,45,90,120])assert.ok(Math.abs(focalToFov(fovToFocal(f))-f)<1e-6,`fov ${f}`);
});
test('focal length and fov clamp to the camera limits',()=>{
 assert.equal(fovToFocal(0.5),fovToFocal(1));
 assert.equal(fovToFocal(200),fovToFocal(120));
 assert.equal(focalToFov(1),120);
 assert.equal(focalToFov(5000),focalToFov(1400));
 assert.ok(focalToFov(50)>26&&focalToFov(50)<28);
});
test('orthoHalfHeight matches the perspective view height at the target distance',()=>{
 assert.ok(Math.abs(orthoHalfHeight(45,10)-10*Math.tan(22.5*Math.PI/180))<1e-9);
 assert.ok(orthoHalfHeight(45,0)>0,'zero distance still yields a usable frustum');
 assert.ok(orthoHalfHeight(90,5)>orthoHalfHeight(45,5),'wider fov frames larger at the same distance');
});
