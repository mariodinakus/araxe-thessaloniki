import {test} from 'node:test';import assert from 'node:assert/strict';import {tileIndex,tilePoint} from './vector.mjs';
test('tile projections round trip Thessaloniki and keep coordinates in correct order',()=>{const {z,x,y}=tileIndex(40.634,22.944);const nw=tilePoint(0,0,z,x,y),se=tilePoint(4096,4096,z,x,y);assert.ok(nw[0]>40.634&&se[0]<40.634);assert.ok(nw[1]<22.944&&se[1]>22.944);});
