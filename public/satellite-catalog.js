/* STAC metadata, strictly not live satellite occupancy or legality. 
   Supported imagery metadata: OpenAerialMap STAC v0.3.0. */
export const CATALOG_URL='https://api.imagery.hotosm.org/stac/search';
export const SOURCES=['satellite','uav','aircraft','balloon','kite'];
export const ALLOWED_LICENSES=new Set(['CC-BY-4.0','CC-BY-SA-4.0']);
const limit=(n,min,max)=>Math.max(min,Math.min(max,n));
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}/.test(s)&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=Date.now();
export function sceneDate(f){
 const p=f?.properties||{};
 const s=p.datetime||p.start_datetime||null;
 return validDate(s)?s.slice(0,10):null;
}
export function sceneLicense(f){return String(f?.properties?.license||f?.properties?.['oam:license']||'').trim().toUpperCase();}
export function scenePlatform(f){return String(f?.properties?.['oam:platform_type']||'').toLowerCase();}
export function sceneGsd(f){const x=f?.properties?.gsd;return x===null||x===undefined?null:Number(x);}
export function sceneCoversPoint(f,zone){
 const b=f?.bbox;
 return Array.isArray(b)&&b.length>=4&&[b[0],b[1],b[2],b[3]].every(Number.isFinite)
   &&Number.isFinite(zone?.lat)&&Number.isFinite(zone?.lon)
   &&zone.lon>=b[0]&&zone.lon<=b[2]&&zone.lat>=b[1]&&zone.lat<=b[3];
}
export function summarizeScenes(features,zone){
 const touching=(Array.isArray(features)?features:[]).filter(f=>f?.id&&sceneCoversPoint(f,zone));
 const dated=touching.filter(f=>sceneDate(f));
 const licensed=dated.filter(f=>ALLOWED_LICENSES.has(sceneLicense(f)));
 const highRes=licensed.filter(f=>{const g=sceneGsd(f);return Number.isFinite(g)&&g>0&&g<=.5&&SOURCES.includes(scenePlatform(f));});
 const dates=new Set(highRes.map(sceneDate));
 const satellite=highRes.filter(f=>scenePlatform(f)==='satellite');
 return {seen:features?.length||0,covering:touching.length,dated:dated.length,licensed:licensed.length,
  eligible:highRes.length,independentDates:dates.size,satellite:satellite.length,
  scenes:highRes.sort((a,b)=>(scenePlatform(b)==='satellite')-(scenePlatform(a)==='satellite')||sceneDate(b).localeCompare(sceneDate(a))).slice(0,14).map(f=>({
   id:String(f.id),date:sceneDate(f),gsd:sceneGsd(f),platform:scenePlatform(f),
   license:sceneLicense(f),producer:String(f.properties?.['oam:producer_name']||f.providers?.[0]?.name||'Άγνωστος δημιουργός'),
   source:'OAM STAC',
  }))};
}
export function zoneBbox(z,spread=.013){
 const d=limit(spread,.003,.03),latD=d*.72;
 return [z.lon-d,z.lat-latD,z.lon+d,z.lat+latD].map(x=>x.toFixed(5)).join(',');
}
export async function fetchSatelliteCatalog(zone,{signal,fetcher=fetch}={}){
 if(!zone||!Number.isFinite(zone.lat)||!Number.isFinite(zone.lon))throw Error('Επίλεξε έγκυρη περιοχή');
 const uri=CATALOG_URL+'?bbox='+encodeURIComponent(zoneBbox(zone))+'&limit=100';
 const resp=await fetcher(uri,{signal,headers:{Accept:'application/geo+json, application/json'}});
 if(!resp.ok)throw Error('Ο κατάλογος OpenAerialMap επέστρεψε HTTP '+resp.status);
 const body=await resp.json();
 if(!Array.isArray(body?.features))throw Error('Ο κατάλογος δεν επέστρεψε έγκυρη λίστα λήψεων');
 return {...summarizeScenes(body.features,zone),checkedAt:Date.now(),partial:!!body.links?.some(l=>l.rel==='next'),
  catalog:'OpenAerialMap STAC',zone:zone.id};
}
