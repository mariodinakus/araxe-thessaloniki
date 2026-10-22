import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SENTINEL_YEARS,satelliteWmtsUrl,satelliteCredit,satelliteResolutionAtZoom} from './public/satellite-years.js';
const read=path=>readFile(new URL('./'+path,import.meta.url),'utf8');

test('public annual Sentinel-2 raster endpoint is mapped to actual year and WMTS source',()=>{
 assert.ok(SENTINEL_YEARS.includes(2025));
 assert.ok(SENTINEL_YEARS.includes(2023));
 assert.ok(SENTINEL_YEARS.includes(2016));
 assert.equal(satelliteWmtsUrl(2025),'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg');
 assert.ok(satelliteCredit(2025).includes('CC BY-NC-SA 4.0'));
 assert.ok(satelliteCredit(2025).includes('μη εμπορικά'));
 assert.ok(satelliteCredit(2016).includes('CC BY 4.0'));
 assert.throws(()=>satelliteWmtsUrl(2027));
 assert.throws(()=>satelliteWmtsUrl('../unsafe'));
 assert.equal(satelliteResolutionAtZoom(14),'sentinel-10m');
 assert.equal(satelliteResolutionAtZoom(17),'high-zoom-reference');
});
test('satellite image appears by default instead of just empty absent archival points',async()=>{
 const [html,app,yearController]=await Promise.all([read('public/index.html'),read('public/app.js'),read('public/satellite-year-view.js')]);
 for(const id of ['satelliteYearBar','satelliteYear','satelliteYearStatus','satelliteCompare','satelliteYearDisable'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('<option value="2025">2025</option>'));
 assert.ok(app.includes('createSatelliteYearMap(map)'));
 assert.ok(app.includes("yearController?.activate(true)"));
 assert.ok(app.includes("roadMode==='historical'?14:15"));
 assert.ok(app.includes("yearController?.activate(mode==='historical')"));
 assert.ok(yearController.includes('L.tileLayer(url'));
 assert.ok(yearController.includes("maxNativeZoom:14"));
 assert.ok(yearController.includes('Ετήσια')||yearController.includes('ετήσια'));
});
test('mobile map is actually first, ahead of long sidebar and has visible year control',async()=>{
 const css=await read('public/satellite-hq.css'),app=await read('public/app.js');
 assert.ok(css.includes('main>.map-panel{order:0'));
 assert.ok(css.includes('main>aside{order:1'));
 assert.ok(css.includes('.sat-year-bar{top:119px'));
 assert.ok(app.includes("map?.flyTo([selected.lat,selected.lon],roadMode==='historical'?14:15)"));
});
test('service worker precaches annual raster UI on updated release',async()=>{
 const sw=await read('public/sw.js');
 assert.ok(sw.includes('araxe-v19'));
 assert.ok(sw.includes("'/satellite-years.js'"));
 assert.ok(sw.includes("'/satellite-year-view.js'"));
});
