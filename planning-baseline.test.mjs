import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planningBaseline,planningTimeline} from './public/planning-baseline.js';
import {parkingForecast} from './public/forecast-engine.js';
const now=Date.parse('2026-10-22T19:00:00Z');
const zone={id:'menemeni',name:'Μενεμένη',type:'residential',lat:40.658,lon:22.899};
test('cold start shows a time-dependent planning rule, never an invented vacancy probability',()=>{
 const f=planningBaseline(zone,now);
 assert.equal(f.ready,true);
 assert.equal(f.kind,'untrained-planning-rule');
 assert.equal(f.probabilityOfSpace,null);
 assert.equal(f.liveOccupancy,false);
 assert.ok(f.pressureIndex>=10&&f.pressureIndex<=90);
 assert.ok(f.sources.includes('Χρόνος/κατηγορία περιοχής'));
 const model=parkingForecast(zone.id,[],now,{now});
 assert.equal(model.p,null);
 assert.equal(model.ready,false);
});
test('actual mapped OSM road candidates surface independently from live occupancy',()=>{
 const r=planningBaseline(zone,now,{total:2,tiers:{A:1,B:1,C:0,D:0},rows:[
  {r:{name:'Κώστα Γεωργάκη'},score:78,tier:'A'},
  {r:{name:'Λεωφόρος & Δοκιμή'},score:62,tier:'B'}]});
 assert.equal(r.mappedRoadNames,2);assert.equal(r.candidates.length,2);
 assert.ok(r.sources.some(x=>x.includes('OpenStreetMap')));
 assert.equal(r.probabilityOfSpace,null);
});
test('daypart changes planning index without pretending to validate forecasting accuracy',()=>{
 const overnight=planningBaseline(zone,Date.parse('2026-10-21T22:00:00Z'));
 const daytime=planningBaseline(zone,Date.parse('2026-10-22T11:00:00Z'));
 assert.ok(overnight.pressureIndex>daytime.pressureIndex);
 const timeline=planningTimeline(zone,now);
 assert.deepEqual(timeline.map(x=>x.hours),[0,1,2,4,6,8]);
 assert.ok(timeline.every(x=>x.probabilityOfSpace===null&&Number.isFinite(x.pressureIndex)));
});
test('forecast box is explicitly labeled rule-based and wired to driver reporting',async()=>{
 const html=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
 const view=await readFile(new URL('./public/forecast-view.js',import.meta.url),'utf8');
 const app=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="forecastColdStart"'));
 assert.ok(html.includes('id="forecastReport"'));
 assert.ok(view.includes('Ωριαία πίεση'));
 assert.ok(view.includes('κανόνας, ΟΧΙ πιθανότητα'));
 assert.ok(app.includes("$('forecastReport').onclick="));
 assert.ok(app.includes('roadOverview);'));
});