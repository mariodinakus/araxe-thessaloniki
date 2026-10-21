import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predict,metrics,mergeEvents,context} from './public/model.js';
const now=Date.parse('2026-10-21T10:00:00Z');
function sample(n,outcome=1){return Array.from({length:n},(_,i)=>({id:String(i),zone:'center',outcome,at:now-(i+1)*7*86400000}));}
test('cold start does not claim trained probability',()=>{const p=predict('center',[],now,now);assert.equal(p.ready,false);assert.equal(p.n,0);});
test('contextual evidence trains and old observations decay',()=>{const recent=Array.from({length:20},(_,i)=>({id:String(i),zone:'center',outcome:1,at:now-1000-i*1000}));const p=predict('center',recent,now,now);assert.equal(p.ready,true);assert.ok(p.p>.9);assert.equal(predict('toumba',recent,now,now).ready,false);assert.ok(predict('center',sample(20),now,now).effective<p.effective);});
test('opposite outcomes change predictions and future data is excluded',()=>{const a=sample(8),b=a.map(e=>({...e,outcome:0}));assert.ok(predict('center',a,now,now).p>predict('center',b,now,now).p);assert.equal(predict('center',[{id:'f',zone:'center',outcome:1,at:now+1000}],now,now).n,0);});
test('Athens daylight saving and weekend context',()=>{assert.equal(context(now).hour,13);assert.equal(context(Date.parse('2026-10-24T10:00Z')).weekend,true);assert.equal(context(Date.parse('2026-11-02T10:00Z')).hour,12);});
test('prequential evaluation never trains on current/future labels',()=>{assert.deepEqual(metrics(sample(1)),{evaluated:0,brier:null,baseline:null});const e=Array.from({length:35},(_,i)=>({id:String(i),zone:'center',outcome:i%2,at:now-100000+i*1000}));const m=metrics(e);assert.ok(m.evaluated>0);assert.ok(m.brier>=0&&m.brier<=1);assert.equal(m.baseline,.25);assert.deepEqual(metrics([...e].reverse()),m);});
test('merging personal and shared observations does not double count',()=>{const a=sample(3);assert.equal(mergeEvents(a,a).length,3);});
