/* Map-ready historical evidence. This never fabricates live vacancies or satellite pixels. */
import {APPEARANCE_KEY,SCAN_KEY,compareDatedAppearance,newestHistoricalMarkers} from './satellite-slots.js';
const read=(key)=>{try{return JSON.parse(localStorage.getItem(key))||[];}catch{return [];}};
export function historicalMapEvidence(zoneId,appearance=read(APPEARANCE_KEY),scans=read(SCAN_KEY)){
 const matches=compareDatedAppearance((Array.isArray(appearance)?appearance:[]).filter(s=>s?.zone===zoneId));
 const visual=matches.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.visualDifference)&&Array.isArray(p.dates)&&p.dates.length>=2);
 const classified=newestHistoricalMarkers(scans,zoneId,120);
 const byStreet=new Map();
 for(const p of visual){
  const name=String(p.roadName||'').trim().normalize('NFC').toLocaleLowerCase('el-GR');
  if(!name)continue;
  const row=byStreet.get(name)||{total:0,n:0,dates:new Set()};
  row.total+=p.visualDifference;row.n++;
  p.dates.forEach(x=>row.dates.add(x));
  byStreet.set(name,row);
 }
 return {visual:visual.slice(0,180),classified:classified.slice(0,120),
  streets:byStreet.size,byStreet,dates:[...new Set(visual.flatMap(x=>x.dates))].sort(),
  status:visual.length?'historical-comparison':classified.length?'historical-classification':'no-visual-evidence'};
}
export function supportedSceneFootprints(summary){
 return (Array.isArray(summary?.scenes)?summary.scenes:[]).filter(x=>x&&typeof x.id==='string'&&/^\d{4}-\d\d-\d\d$/.test(x.date||'')
 &&Array.isArray(x.bbox)&&x.bbox.length===4&&x.bbox.every(Number.isFinite)
 &&x.bbox[0]>=-180&&x.bbox[1]>=-90&&x.bbox[2]<=180&&x.bbox[3]<=90&&x.bbox[0]<x.bbox[2]&&x.bbox[1]<x.bbox[3]
 &&Number.isFinite(x.gsd)&&x.gsd>0&&x.gsd<=.5);
}
export function perImageTileUrl(id){
 const v=String(id||'');
 if(!v||v.length>130||!/^[-A-Za-z0-9_:.]+$/.test(v))throw Error('Μη έγκυρος κωδικός ιστορικής λήψης');
 return 'https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/'+encodeURIComponent(v)+'/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0';
}
export function visualLevel(diff){
 const v=Number(diff);
 if(!Number.isFinite(v)||v<0)return 'unknown';
 return v>=.22?'high':v>=.08?'medium':'low'; // Visual feature drift only; NOT spot occupancy
}
