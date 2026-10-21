import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tileXY,pixelForCoordinate,sampleCurbCandidates,validCurbLabels,classifyHistoricalCurb,compareDatedAppearance,groupCurbHistory,newestHistoricalMarkers} from './public/satellite-slots.js';
const center={lat:40.658,lon:22.899},tile=tileXY(center.lat,center.lon,19),geo={z:19,tileX:Math.floor(tile.x)-1,tileY:Math.floor(tile.y)-1};
const roads=[
{id:'r1',name:'Ηρεμία',highway:'residential',geometry:[[40.658,22.8982],[40.658,22.8998]]},
{id:'r2',name:'Απαγορευμένη',highway:'residential',parking:'no',geometry:[[40.658,22.8998],[40.658,22.9005]]},
{id:'r3',name:'Λεωφόρος',highway:'primary',geometry:[[40.658,22.899],[40.658,22.901]]}
];
const candidates=sampleCurbCandidates(roads,geo);
test('geographic projection positions historical image annotations correctly',()=>{
 const p=pixelForCoordinate(center.lat,center.lon,geo);assert.ok(p.x>256&&p.x<512&&p.y>256&&p.y<512);
 assert.ok(candidates.length>8);assert.ok(candidates.every(x=>x.legalStatus==='unknown'));
 assert.ok(candidates.every(x=>x.roadName==='Ηρεμία'));
 assert.ok(candidates.every(x=>x.x>=22&&x.x<746&&x.y>=22&&x.y<746));
 assert.throws(()=>tileXY(NaN,22.899));
});
test('model cannot output historical gaps without verified licensed imagery and independent training',()=>{
 const extracted=()=>Array(84).fill(.5),model={ready:true,model:{},predict:()=>.9};
 for(const invalid of [{...model,ready:false},{...model,model:null}]){
  assert.equal(classifyHistoricalCurb(candidates,extracted,invalid,{scene:'a',zone:'menemeni',date:'2026-01-01',gsd:.2,licensesVerified:true}).enabled,false);
 }
 assert.equal(classifyHistoricalCurb(candidates,extracted,model,{scene:'a',zone:'menemeni',date:'2026-01-01',gsd:10,licensesVerified:true}).enabled,false);
 assert.equal(classifyHistoricalCurb(candidates,extracted,model,{scene:'a',zone:'menemeni',date:'2026-01-01',gsd:.2,licensesVerified:false}).enabled,false);
 const ok=classifyHistoricalCurb(candidates,extracted,model,{scene:'a',zone:'menemeni',date:'2026-01-01',gsd:.2,licensesVerified:true});
 assert.equal(ok.enabled,true);assert.equal(ok.clearCandidates,candidates.length);
 assert.ok(ok.items.every(x=>x.quality==='model-estimate-unverified'&&x.legalStatus==='unknown'&&x.date==='2026-01-01'));
});
test('only historical dated scans create map markers, never current vacancy',()=>{
 const items=[{lat:40.658,lon:22.899,roadId:'r1',roadName:'Ηρεμία',probabilityClear:.86},{lat:40.658,lon:22.8993,roadName:'Ηρεμία',roadId:'r1',probabilityClear:.43}];
 const scans=[{zone:'menemeni',date:'2020-10-10',scene:'a',items},{zone:'menemeni',date:'2024-10-11',scene:'b',items}];
 const markers=newestHistoricalMarkers(scans,'menemeni');
 assert.equal(markers.length,1);assert.equal(markers[0].date,'2024-10-11');
 assert.equal(markers[0].observationType,'historical-visual-candidate-not-live');
 assert.equal(groupCurbHistory(scans).filter(x=>x.n===2).length,2);
});
test('different image dates reveal appearance change without pseudo-labelling free/occupied',()=>{
 const f=Array(84).fill(.2),g=Array(84).fill(.8),p={roadId:'r1',roadName:'Ηρεμία',lat:40.658,lon:22.899};
 const hist=[{zone:'menemeni',date:'2020-01-01',patches:[{...p,features:f}]},{zone:'menemeni',date:'2024-01-01',patches:[{...p,features:g}]}];
 const changes=compareDatedAppearance(hist);
 assert.equal(changes.length,1);assert.ok(changes[0].visualDifference>.5);
 assert.equal(changes[0].evidence,'appearance-change-only-not-free-space');
 assert.equal(compareDatedAppearance([hist[0],hist[0]]).length,0);
 assert.equal(validCurbLabels([{scene:'s',zone:'menemeni',date:'2024-01-01',lat:40.658,lon:22.899,y:1,x:f}]).length,1);
 assert.equal(validCurbLabels([{scene:'s',zone:'menemeni',date:'2024-01-01',lat:40.658,lon:22.899,y:5,x:f}]).length,0);
});