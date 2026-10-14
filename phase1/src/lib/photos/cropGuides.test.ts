import test from 'node:test';
import assert from 'node:assert/strict';
import {cropGuideLines} from './cropGuides';
test('full-frame crop yields exact thirds',()=>{
 const g=cropGuideLines({x0:0,y0:0,x1:1,y1:1});
 assert.deepEqual(g.vertical,[1/3,2/3]);assert.deepEqual(g.horizontal,[1/3,2/3]);
});
test('guides sit inside a clamped sub-rect',()=>{
 const crop={x0:0.1,y0:0.2,x1:0.7,y1:0.8},g=cropGuideLines(crop);
 for(const x of g.vertical){assert.ok(x>crop.x0&&x<crop.x1);}
 for(const y of g.horizontal){assert.ok(y>crop.y0&&y<crop.y1);}
 assert.ok(Math.abs(g.vertical[0]-(crop.x0+(crop.x1-crop.x0)/3))<1e-12);
 assert.ok(Math.abs(g.horizontal[1]-(crop.y0+(2*(crop.y1-crop.y0))/3))<1e-12);
});
test('guides are evenly spaced',()=>{
 const g=cropGuideLines({x0:0.25,y0:0.25,x1:0.85,y1:0.55});
 assert.ok(Math.abs((g.vertical[1]-g.vertical[0])-(g.vertical[0]-0.25))<1e-12);
 assert.ok(Math.abs((g.horizontal[1]-g.horizontal[0])-(g.horizontal[0]-0.25))<1e-12);
});
test('inverted rects are normalized to their bounds',()=>{
 const g=cropGuideLines({x0:0.9,y0:0.6,x1:0.3,y1:0.3});
 for(const x of g.vertical){assert.ok(x>0.3&&x<0.9);}
 for(const y of g.horizontal){assert.ok(y>0.3&&y<0.6);}
});
