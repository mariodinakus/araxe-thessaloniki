import {test} from 'node:test';import assert from 'node:assert/strict';
import {historicalVisualSignals} from './public/historical-curb-summary.js';
test('historical classifier evidence de-duplicates positions per image and never calls them live availability',()=>{
 const scans=[
  {zone:'menemeni',scene:'image2022',date:'2022-01-01',items:[{lat:40.658,lon:22.899,roadId:'1',roadName:'Δρόμος',probabilityClear:.85}]},
  {zone:'menemeni',scene:'image2022',date:'2022-01-01',items:[{lat:40.658,lon:22.899,roadId:'1',roadName:'Δρόμος',probabilityClear:.85}]},
  {zone:'menemeni',scene:'image2023',date:'2023-03-01',items:[{lat:40.658,lon:22.899,roadId:'1',roadName:'Δρόμος',probabilityClear:.15},{lat:40.658,lon:22.8991,roadId:'1',roadName:'Δρόμος',probabilityClear:.93}]},
  {zone:'evosmos',scene:'wrong',date:'2023-01-01',items:[{lat:40.658,lon:22.899,roadName:'Δρόμος',probabilityClear:1}]}
 ];
 const s=historicalVisualSignals(scans,'menemeni');
 assert.equal(s.dates,2);assert.equal(s.scenes,2);assert.equal(s.inspected,3);assert.equal(s.visuallyClear,2);
 assert.equal(s.roads.length,1);assert.equal(s.roads[0].inspected,3);assert.equal(s.roads[0].dates,2);
 assert.equal(s.latestDate,'2023-03-01');
 assert.deepEqual(Object.keys(historicalVisualSignals([], 'menemeni')).includes('live'),false);
});
test('no dated scan returns empty evidence',()=>{const s=historicalVisualSignals([], 'menemeni');assert.equal(s.scenes,0);assert.equal(s.inspected,0);assert.equal(s.visuallyClear,0);assert.equal(s.latestDate,null);});
