import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roadIntelligence,roadTierLookup,tierForScore,tierColors,trafficSummary,hourlyForecast,imageryAvailability} from './public/road-intelligence.js';
const place={id:'menemeni',lat:40.658,lon:22.899};
const roads=[
 {id:'1',name:'Οδός Κήπου',highway:'residential',geometry:[[40.658,22.899],[40.658,22.901]]},
 {id:'2',name:'Οδός Κήπου',highway:'residential',geometry:[[40.658,22.901],[40.658,22.903]]},
 {id:'3',name:'Στενό',highway:'unclassified',geometry:[[40.659,22.899],[40.659,22.8998]]},
 {id:'4',name:'Λεωφόρος',highway:'primary',geometry:[[40.658,22.899],[40.658,22.901]]},
 {id:'5',name:'Πεζόδρομος',highway:'pedestrian',geometry:[[40.658,22.899],[40.658,22.901]]}
];
test('road tiers reflect mapped roads without inventing legal spaces',()=>{
 const r=roadIntelligence(roads,place);
 assert.equal(r.total,2);
 assert.equal(Object.values(r.tiers).reduce((a,b)=>a+b,0),2);
 assert.equal(r.rows.length,2);
 assert.ok(r.rows.every(x=>x.score>=0&&x.score<=100));
 assert.equal(r.rows.find(x=>x.r.name==='Οδός Κήπου').segments,2);
 assert.ok(roadTierLookup(r.rows).has('οδός κήπου'));
 assert.equal(tierForScore(100),'A');
 assert.equal(tierForScore(61),'B');
 assert.equal(tierForScore(46),'C');
 assert.equal(tierForScore(20),'D');
 assert.ok(tierColors.A);
});
test('without measured traffic show unknown and no made-up hourly forecast',()=>{
 const now=Date.parse('2026-10-21T15:00:00Z');
 const traffic=trafficSummary('menemeni',[],now,now);
 assert.equal(traffic.level,'unknown');
 assert.equal(traffic.severity,null);
 assert.equal(traffic.ready,false);
 assert.deepEqual(traffic.counts,[0,0,0]);
 const forecast=hourlyForecast('menemeni',[],[],now,now);
 assert.equal(forecast.length,4);
 assert.ok(forecast.every(x=>x.traffic===null&&x.parking===null));
});
test('area traffic reports never become direct road live telemetry',()=>{
 const now=Date.parse('2026-10-21T15:00:00Z');
 const events=Array.from({length:20},(_,i)=>({zone:'menemeni',outcome:2,at:now-i*1000,road:null}));
 const all=trafficSummary('menemeni',events,now,now);
 const road=trafficSummary('menemeni',events.filter(x=>x.road==='street:menemeni:abc'),now,now);
 assert.equal(all.n,20);
 assert.equal(road.level,'unknown');
 assert.equal(road.n,0);
});
test('imagery records need an explicit valid acquisition date',()=>{
 assert.equal(imageryAvailability({date:'2026-10-18'}).date,'2026-10-18');
 assert.equal(imageryAvailability({date:'not-a-date'}).date,null);
 assert.equal(imageryAvailability(null).perRoadOccupancy,null);
});
