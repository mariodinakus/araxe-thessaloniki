import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {wazeEmbedUrl,wazeFullMapUrl} from './public/live-traffic.js';
test('official live traffic map is centered on the real selected area',()=>{
 const url=new URL(wazeEmbedUrl({lat:40.658,lon:22.899},15));
 assert.equal(url.origin,'https://embed.waze.com');assert.equal(url.pathname,'/iframe');
 assert.equal(url.searchParams.get('lat'),'40.658000');assert.equal(url.searchParams.get('lon'),'22.899000');assert.equal(url.searchParams.get('zoom'),'15');
 assert.equal(new URL(wazeFullMapUrl({lat:40.632,lon:22.947})).hostname,'www.waze.com');
});
test('Waze map parameters reject missing coordinates and constrain zoom',()=>{
 assert.throws(()=>wazeEmbedUrl({lat:undefined,lon:22.9}));assert.throws(()=>wazeEmbedUrl({lat:140,lon:22.9}));
 assert.ok(wazeEmbedUrl({lat:40.6,lon:23},100).includes('zoom=17'));
});
test('traffic mode supplies a visible embedded map with source and fallback links',async()=>{
 const html=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
 const js=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('./public/intelligence.css',import.meta.url),'utf8');
 assert.ok(html.includes('id="wazeTrafficFrame"'));
 assert.ok(html.includes('id="wazeTrafficPanel"'));
 assert.ok(html.includes('https://trafficthess.imet.gr/'));
 assert.ok(js.includes("setLiveTrafficVisibility(mode==='traffic')"));
 assert.ok(js.includes('updateWazeTraffic(selected)'));
 assert.ok(css.includes('.map-panel.traffic-live #map'));
});
