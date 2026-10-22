import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sceneCoversPoint,sceneDate,sceneGsd,sceneLicense,summarizeScenes,fetchSatelliteCatalog} from './public/satellite-catalog.js';
const zone={id:'menemeni',name:'Μενεμένη',lat:40.658,lon:22.899};
function item(id,date,{gsd=.3,license='CC-BY-4.0',platform='satellite',bbox=[22.89,40.65,22.91,40.67]}={}){
 return {id,bbox,properties:{datetime:date,gsd,license,'oam:platform_type':platform,'oam:producer_name':'Test'}}
}
test('OAM STAC scenes must be dated, geo-covered, legally reusable and resolvable',()=>{
 const inputs=[
 item('s1','2023-04-09T00:00:00Z'),item('s2','2024-05-10T00:00:00Z',{platform:'uav'}),
 item('s3','2023-08-11T00:00:00Z',{gsd:10}),
 item('s4','2025-01-01T00:00:00Z',{license:'CC-BY-NC-4.0'}),
 item('s5','2023-08-11T00:00:00Z',{bbox:[23.5,41.5,23.7,41.7]}),
 item('s6','2099-01-01T00:00:00Z'),
 item('s7','2024-05-10T00:00:00Z',{platform:'satellite'})
 ];
 const result=summarizeScenes(inputs,zone);
 assert.equal(result.eligible,3);
 assert.equal(result.independentDates,2);
 assert.equal(result.satellite,2);
 assert.equal(result.covering,6);
 assert.equal(result.scenes[0].platform,'satellite');
 assert.equal(result.scenes[0].license,'CC-BY-4.0');
 assert.equal(sceneDate(inputs[5]),null);
 assert.equal(sceneLicense(inputs[3]),'CC-BY-NC-4.0');
 assert.equal(sceneGsd({properties:{gsd:null}}),null);
 assert.equal(sceneCoversPoint(inputs[4],zone),false);
});
test('STAC search is real source bounded by Thessaloniki coordinates and status is not simulated',async()=>{
 let url;
 const result=await fetchSatelliteCatalog(zone,{fetcher:async u=>{
  url=u;return {ok:true,json:async()=>({features:[item('x','2023-04-09T00:00:00Z')]})};
 }});
 assert.ok(url.startsWith('https://api.imagery.hotosm.org/stac/search?bbox='));
 assert.ok(decodeURIComponent(url).includes('22.899')||decodeURIComponent(url).includes('22.886'));
 assert.equal(result.eligible,1);
 assert.ok(result.checkedAt>0);
 await assert.rejects(()=>fetchSatelliteCatalog(zone,{fetcher:async()=>({ok:false,status:503})}),/503/);
});
test('satellite historical evidence is foremost in home UI with direct auto-training controls',async()=>{
 const html=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 const aerial=await readFile(new URL('./public/aerial-lab.js',import.meta.url),'utf8');
 const hq=await readFile(new URL('./public/satellite-hq.js',import.meta.url),'utf8');
 for(const id of ['satelliteHQ','satHQTrain','satHQRefresh','satHQMap','satHQScenes','satHQPoints','satHQTimeline','satHQModelBars','satHQStatus','satHQRoads','satHQRoadCount','satHQVisualEvidence','satHQVisualContent'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.indexOf('id="satelliteHQ"')<html.indexOf('id="forecastLab"'));
 assert.ok(html.includes('data-view="satellite"'));
 assert.ok(app.includes('renderSatelliteHQ(selected)'));
 assert.ok(app.includes('setupSatelliteHQ({'));
 assert.ok(hq.includes('fetchSatelliteCatalog'));
 assert.ok(aerial.includes('openSatelliteTraining'));
 assert.ok(aerial.includes('compareHistoricArchive()'));
 assert.ok(aerial.includes("window.dispatchEvent(new Event('araxe:satellite-update'))"));
 assert.ok(!aerial.includes('await loadCurbCandidates(photo);loaded++'));
 assert.ok(!aerial.includes('await loadCurbCandidates(photo);scanned++'));
});
test('no archived scenes means dashboard explains missing real coverage, never simulates vacancies',async()=>{
 const src=await readFile(new URL('./public/satellite-hq.js',import.meta.url),'utf8');
 assert.ok(src.includes('Δεν επινοούμε δορυφορικά δεδομένα'));
 assert.ok(src.includes('όχι πραγματικής πληρότητας'));
 assert.ok(src.includes('visualDifference'));
 assert.ok(src.includes('κοινά ιστορικά σημεία'));
 const css=await readFile(new URL('./public/satellite-hq.css',import.meta.url),'utf8');
 assert.ok(css.includes('.sat-hq-kpis'));assert.ok(css.includes('@media(max-width:700px)'));
});
