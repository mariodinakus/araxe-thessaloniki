import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('./'+path,import.meta.url),'utf8');
test('runtime API exposes the actual Render SHA, not a source-code version guess',async()=>{
 const server=await read('server.mjs');
 assert.ok(server.includes("url.pathname==='/api/version'"));
 assert.ok(server.includes("process.env.RENDER_GIT_COMMIT"));
 assert.ok(server.includes("satellite-history-map-v2"));
 assert.ok(server.includes("req.method==='GET'"));
});
test('satellite map is directly discoverable above the fold with a version check',async()=>{
 const html=await read('public/index.html');
 const app=await read('public/app.js');
 assert.ok(html.includes('id="mapQuick"'));
 assert.ok(html.indexOf('id="mapQuick"')<html.indexOf('id="satelliteHQ"'));
 for(const id of ['mapArea','mapDeployVersion','mapCheckVersion','mapWhyNoDots'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(app.includes("$('mapQuick').onclick=focusMap"));
 assert.ok(app.includes("setRoadMode('historical')"));
 assert.ok(app.includes("fetch('/api/version?ts='"));
 assert.ok(app.includes("target?.scrollIntoView")||app.includes("panel?.scrollIntoView"));
});
test('unavailable satellite sample evidence is explicitly diagnosed on the map',async()=>{
 const history=await read('public/historical-map.js');
 assert.ok(history.includes("$('mapWhyNoDots').textContent="));
 assert.ok(history.includes('Δεν εμφανίζονται ιστορικά σημεία'));
 assert.ok(history.includes('Δεν υπάρχουν ακόμη αναλυμένες'));
});
test('new PWA cache and map styles follow runtime diagnostics release',async()=>{
 const sw=await read('public/sw.js'),css=await read('public/satellite-hq.css');
 assert.ok(sw.includes('araxe-v18'));
 assert.ok(css.includes('.quick-map'));
 assert.ok(css.includes('.map-build-row'));
});
