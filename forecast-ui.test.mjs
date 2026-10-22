import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('Forecast Lab is first priority in home sidebar rather than buried in analysis',async()=>{
 const html=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
 const ai=html.indexOf('id="forecastLab"'),results=html.indexOf('id="resultsTitle"'),analytics=html.indexOf('id="intelligence"');
 assert.ok(ai>0&&results>0&&analytics>0);assert.ok(ai<results&&ai<analytics);
 assert.equal(html.split('id="forecastLab"').length,2);
 assert.ok(html.includes('id="forecastQuick"'));
 assert.ok(html.includes('data-view="forecast"'));
});
test('AI navigation scrolls to forecast and starts with a selected real area',async()=>{
 const js=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 assert.ok(js.includes("$('forecastQuick').onclick=focusForecast;"));
 assert.ok(js.includes("else if(b.dataset.view==='forecast'){focusForecast();}"));
 assert.ok(js.includes("pickZone('center',false);sync();loadParking()"));
 assert.ok(js.includes("target?.scrollIntoView({behavior:'smooth',block:'start'})"));
});
test('new PWA assets are invalidated for both installed and browser users',async()=>{
 const sw=await readFile(new URL('./public/sw.js',import.meta.url),'utf8');
 assert.ok(sw.includes("araxe-v19"));
 assert.ok(sw.includes("'/forecast-view.js'"));
});
