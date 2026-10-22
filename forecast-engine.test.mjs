import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reliableEvents,weeklyHabit,backtestModels,parkingForecast,forecastHorizon} from './public/forecast-engine.js';
const base=Date.parse('2026-10-20T12:00:00Z');
const day=86400000;
const records=Array.from({length:130},(_,i)=>({id:String(i),zone:'menemeni',outcome:i%4===0?0:1,at:base-(130-i)*day/3}));
test('cold start provides no made-up probability or calibrated confidence',()=>{
 const f=parkingForecast('menemeni',[],base,{now:base});assert.equal(f.ready,false);assert.equal(f.p,null);assert.equal(f.confidence,'insufficient');assert.equal(f.satelliteRealTime,false);
 assert.deepEqual(Object.keys(f.weights).sort(),['bayesian','logistic','neighbors','weekly']);
});
test('training ignores future labels and invalid reports',()=>{
 const future={id:'future',zone:'menemeni',outcome:0,at:base+day};
 const invalid={id:'bad',zone:'menemeni',outcome:5,at:base};
 const valid=reliableEvents([...records,future,invalid],base);
 assert.equal(valid.length,records.length);
 const p=parkingForecast('menemeni',records,base,{now:base});
 const p2=parkingForecast('menemeni',[...records,future,invalid],base,{now:base});
 assert.equal(p.p,p2.p);
});
test('chronological backtest supplies interpretable per-model reliability and weights',()=>{
 const q=backtestModels(records,'menemeni',{now:base});
 assert.ok(q.evaluated>0);
 for(const x of Object.values(q.models))assert.ok(x>=0&&x<=1);
 assert.ok(Math.abs(Object.values(q.weights).reduce((a,b)=>a+b,0)-1)<1e-8);
 assert.ok(q.ensembleBrier>=0&&q.ensembleBrier<=1);
});
test('different arrival hours create evidence-gated forecast series',()=>{
 const line=forecastHorizon('menemeni',records,base,{now:base});assert.deepEqual(line.map(x=>x.hours),[0,1,2,4,6,8]);
 assert.ok(line.every(x=>x.p===null||(x.p>0&&x.p<1)));
 const cold=forecastHorizon('menemeni',[],base,{now:base});
 assert.ok(cold.every(x=>x.p===null));
});
test('night and day habit uses actual observations and no invented satellite signals',()=>{
 const h=weeklyHabit(records,'menemeni',base,base);
 assert.ok(h.p>0&&h.p<1);assert.ok(h.n>0);
 const f=parkingForecast('menemeni',records,base,{now:base});
 assert.equal(f.satelliteRealTime,false);
 assert.ok(['low','medium'].includes(f.confidence));
});