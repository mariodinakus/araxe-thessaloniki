import {test} from 'node:test';import assert from 'node:assert/strict';
import {forecastSatelliteScenes} from './public/satellite-forecast.js';
const scene=(date,value)=>({zone:'menemeni',date,patches:Array.from({length:20},(_,i)=>({
 roadId:'s1',roadName:'Δρόμος',lat:40.658+i*.00001,lon:22.899,
 features:Array(84).fill(value+i*.001)
}))});
test('independent dated photos train temporal image models without occupancy claims',()=>{
 const v=forecastSatelliteScenes([scene('2023-01-01',.2),scene('2024-01-01',.3),scene('2025-01-01',.4)],'menemeni');
 assert.equal(v.ready,true);assert.equal(v.scenes,3);assert.equal(v.points,20);assert.equal(v.validationSamples,20);
 assert.ok(v.changeIndex>0);assert.equal(v.vacancyForecast,null);assert.equal(v.live,false);
 assert.ok(Math.abs(Object.values(v.weights).reduce((s,n)=>s+n,0)-1)<.00001);
 assert.ok(v.models.momentum<v.models.last);
});
test('two captures cannot be called independently validated forecasting',()=>{
 const v=forecastSatelliteScenes([scene('2023-01-01',.2),scene('2024-01-01',.3)],'menemeni');
 assert.equal(v.ready,false);assert.equal(v.validationSamples,0);assert.equal(v.models.last,null);
});
test('duplicated same-day satellite scene never inflates independent validation',()=>{
 const a=scene('2023-01-01',.2),b=scene('2024-01-01',.3),c=scene('2025-01-01',.4);
 const v=forecastSatelliteScenes([a,a,b,b,c,c],'menemeni');
 assert.equal(v.validationSamples,20);assert.equal(v.scenes,3);
});
test('satellite model ignores wrong zones and invalid pixel vectors',()=>{
 const s=scene('2023-01-01',.2);s.patches[0].features=Array(8).fill(.4);
 const v=forecastSatelliteScenes([s,scene('2024-01-01',.4)],'menemeni');
 assert.equal(v.points,19);
 assert.equal(forecastSatelliteScenes([s],'evosmos').scenes,0);
});
