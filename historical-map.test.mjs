import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalMapEvidence,supportedSceneFootprints,perImageTileUrl,visualLevel} from './public/map-history.js';
const f=Array(84).fill(.25),g=Array(84).fill(.5);
const first={scene:'scene-2020',date:'2020-04-01',zone:'menemeni',patches:[{roadId:'100',roadName:'Οδός Δοκιμής',lat:40.658,lon:22.899,features:f}]};
const next={scene:'scene-2022',date:'2022-04-01',zone:'menemeni',patches:[{roadId:'100',roadName:'Οδός Δοκιμής',lat:40.658,lon:22.899,features:g}]};
const scan={scene:'oam-real',zone:'menemeni',date:'2022-04-01',items:[{roadId:'100',roadName:'Οδός Δοκιμής',lat:40.658,lon:22.899,probabilityClear:.83}]};
test('historic image change positions project into map without pretending to be vacancy',()=>{
 const r=historicalMapEvidence('menemeni',[first,next],[scan]);
 assert.equal(r.visual.length,1);assert.equal(r.classified.length,1);
 assert.equal(r.streets,1);assert.deepEqual(r.dates,['2020-04-01','2022-04-01']);
 assert.ok(r.byStreet.get('οδός δοκιμής').total>0);
 assert.equal(r.status,'historical-comparison');
 assert.equal(historicalMapEvidence('evosmos',[first,next],[scan]).status,'no-visual-evidence');
});
test('coverage outlines must be grounded in actual STAC bbox, dates and GSD',()=>{
 const summary={scenes:[{id:'real-1',date:'2022-03-01',gsd:.3,bbox:[22.89,40.65,22.91,40.67]},
 {id:'bad-resolution',date:'2022-03-01',gsd:10,bbox:[22.89,40.65,22.91,40.67]},
 {id:'no-footprint',date:'2022-03-01',gsd:.2},
 {id:'broken',date:'2022-03-01',gsd:.2,bbox:[22.91,40.67,22.89,40.65]}]};
 const r=supportedSceneFootprints(summary);
 assert.deepEqual(r.map(x=>x.id),['real-1']);
 assert.deepEqual(supportedSceneFootprints(null),[]);
});
test('tile images are real OAM per-item raster requests, not recycled basemap imagery',()=>{
 const url=perImageTileUrl('2024_open_img_11');
 assert.ok(url.startsWith('https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/'));
 assert.ok(url.endsWith('/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0'));
 assert.throws(()=>perImageTileUrl('../unsafe'));
 assert.throws(()=>perImageTileUrl(''));
 assert.equal(visualLevel(.25),'high');assert.equal(visualLevel(.09),'medium');
});
test('the default map visibly shows dated satellite history, even before model labels exist',async()=>{
 const [html,app,controller,style,catalog,sw]=await Promise.all(
 ['index.html','app.js','historical-map.js','satellite-hq.css','satellite-catalog.js','sw.js']
 .map(x=>readFile(new URL('./public/'+x,import.meta.url),'utf8')));
 assert.ok(html.includes('id="historyMapPanel"'));
 assert.ok(html.includes('id="historyMapScene"'));
 assert.ok(html.includes('id="historyMapTrain"'));
 assert.ok(html.includes('id="historicalSlots" class="chosen"'));
 assert.ok(app.includes("roadMode='historical'"));
 assert.ok(app.includes('createHistoricalMap({map'));
 assert.ok(app.includes("araxe:satellite-catalog"));
 assert.ok(controller.includes('L.rectangle('));
 assert.ok(controller.includes('L.circleMarker('));
 assert.ok(controller.includes('showImage(scenes[0])'));
 assert.ok(style.includes('.history-map-panel'));
 assert.ok(catalog.includes('bbox:f.bbox.slice(0,4).map(Number)'));
 assert.ok(sw.includes('araxe-v19'));
});
