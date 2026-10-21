/* Experimental curb-side image analysis, not a detector of legal/live spaces.
   Positions are sampled alongside actual OSM street centerlines. Image source
   MUST be licensed, dated and geo-referenced before predictions are shown. */
export const SLOT_KEY='araxe-visual-curb-labels-v1';
export const SCAN_KEY='araxe-historical-curb-scans-v1';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const RAD=Math.PI/180;
export function tileXY(lat,lon,z=19){
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isInteger(z)||z<0||z>22)throw Error('Invalid coordinate');
 const n=2**z,clamped=clamp(lat,-85.0511,85.0511)*RAD;
 return {x:(lon+180)/360*n,y:(1-Math.asinh(Math.tan(clamped))/Math.PI)/2*n,z};
}
export function pixelForCoordinate(lat,lon,geo){
 if(!geo||!Number.isInteger(geo.z)||!Number.isInteger(geo.tileX)||!Number.isInteger(geo.tileY))return null;
 const {x,y}=tileXY(lat,lon,geo.z);
 return {x:(x-geo.tileX)*256,y:(y-geo.tileY)*256};
}
export function pointInsideImage(p,width,height,margin=24){return p&&p.x>=margin&&p.y>=margin&&p.x<width-margin&&p.y<height-margin;}
export function metersBetween(a,b){
 const lat1=a[0]*RAD,lat2=b[0]*RAD,dLat=(b[0]-a[0])*RAD,dLon=(b[1]-a[1])*RAD;
 return 12742000*Math.asin(Math.sqrt(Math.min(1,Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2)));
}
const ROADS=new Set(['residential','living_street','unclassified','tertiary','service']);
const FORBIDDEN=new Set(['no','no_parking','no_stopping','private','customers','permit']);
export function sampleCurbCandidates(roads,geo,{width=768,height=768,stepMeters=6,offsetMeters=2.8,limit=240}={}){
 if(!Array.isArray(roads)||!geo)return [];
 const result=[],seen=new Set();
 for(const road of roads){
  if(result.length>=limit)break;
  if(!ROADS.has(road.highway)||FORBIDDEN.has(road.parking)||!Array.isArray(road.geometry))continue;
  for(let i=1;i<road.geometry.length&&result.length<limit;i++){
   const a=road.geometry[i-1],b=road.geometry[i];
   if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||b.length<2||![...a,...b].every(Number.isFinite))continue;
   const len=metersBetween(a,b);if(len<13||len>2000)continue;
   const phi=(a[0]+b[0])/2*RAD,cos=Math.max(.05,Math.cos(phi));
   const north=(b[0]-a[0])*111195,east=(b[1]-a[1])*111195*cos;
   const nx=-east/len,ex=north/len; // perpendicular unit vector
   for(let m=6;m<len-4&&result.length<limit;m+=stepMeters){
    const frac=m/len,baseLat=a[0]+frac*(b[0]-a[0]),baseLon=a[1]+frac*(b[1]-a[1]);
    for(const side of [-1,1]){
     const lat=baseLat+nx*offsetMeters*side/111195,lon=baseLon+ex*offsetMeters*side/(111195*cos);
     const pix=pixelForCoordinate(lat,lon,geo);
     if(!pointInsideImage(pix,width,height,22))continue;
     const key=Math.round(lat*100000/5)+':'+Math.round(lon*100000/5);
     if(seen.has(key))continue;seen.add(key);
     result.push({lat,lon,x:pix.x,y:pix.y,side,roadId:String(road.id??''),roadName:String(road.name||'Ανώνυμη οδός').slice(0,90),
      source:'OSM curbside geometric sampling',legalStatus:'unknown'});
     if(result.length>=limit)break;
    }
   }
  }
 }
 return result;
}
export function validCurbLabels(input){
 return (Array.isArray(input)?input:[]).filter(x=>x&&typeof x.scene==='string'&&x.scene.length<180
 &&typeof x.zone==='string'&&x.zone.length<70&&typeof x.date==='string'&&/^\d{4}-\d\d-\d\d$/.test(x.date)
 &&[0,1].includes(x.y)&&Array.isArray(x.x)&&x.x.length===84&&x.x.every(v=>Number.isFinite(v)&&v>=0&&v<=1)
 &&Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&x.lat>=40.4&&x.lat<=40.9&&x.lon>=22.65&&x.lon<=23.35);
}
export function classifyHistoricalCurb(candidates,extractFeatures,model,{scene,zone,date,gsd,licensesVerified=false}={}){
 // NEVER present guessed vacant segments when the trained model or calibrated imagery is absent.
 if(!model?.ready||!model?.model||typeof extractFeatures!=='function'||!scene||!zone||!date||!licensesVerified
   ||!Number.isFinite(gsd)||gsd<=0||gsd>0.5)return {enabled:false,reason:'Απαιτείται εκπαιδευμένο μοντέλο, άδεια, χρονολογημένη λήψη και ανάλυση ≤0,5 m/pixel.',items:[]};
 const items=[];
 for(const c of candidates){
  const features=extractFeatures(c);
  if(!Array.isArray(features)||features.length!==84)continue;
  const p=model.predict(features);
  if(!Number.isFinite(p))continue;
  items.push({zone,scene,date,lat:c.lat,lon:c.lon,roadName:c.roadName,roadId:c.roadId,
   probabilityClear:+clamp(p,0,1).toFixed(3),quality:'model-estimate-unverified',legalStatus:'unknown',gsd});
 }
 return {enabled:true,items,clearCandidates:items.filter(x=>x.probabilityClear>=.8).length,occupiedCandidates:items.filter(x=>x.probabilityClear<=.2).length,
  ambiguousCandidates:items.filter(x=>x.probabilityClear>.2&&x.probabilityClear<.8).length};
}
export function groupCurbHistory(scans){
 const groups=new Map();
 for(const scan of scans||[]){
  if(!scan||!Array.isArray(scan.items)||typeof scan.date!=='string')continue;
  for(const s of scan.items){
   if(!Number.isFinite(s.probabilityClear)||!Number.isFinite(s.lat)||!Number.isFinite(s.lon))continue;
   const key=[scan.zone,s.roadId,Math.round(s.lat*10000),Math.round(s.lon*10000)].join(':');
   const g=groups.get(key)||{zone:scan.zone,roadName:s.roadName,roadId:s.roadId,lat:s.lat,lon:s.lon,dates:new Set(),history:[]};
   if(g.dates.has(scan.date))continue;
   g.dates.add(scan.date);g.history.push({date:scan.date,p:s.probabilityClear});
   groups.set(key,g);
  }
 }
 return [...groups.values()].map(g=>({zone:g.zone,roadName:g.roadName,roadId:g.roadId,lat:g.lat,lon:g.lon,n:g.history.length,
  observedDates:g.history.map(x=>x.date).sort(),historicalMean:g.history.reduce((acc,x)=>acc+x.p,0)/g.history.length,
  // Comparisons require separate historical dates, not re-scanning one unchanged image.
  changeEvidence:g.history.length>=2?Math.max(...g.history.map(x=>x.p))-Math.min(...g.history.map(x=>x.p)):null}));
}
export function newestHistoricalMarkers(scans,zone,limit=100){
 const valid=(Array.isArray(scans)?scans:[]).filter(s=>s?.zone===zone&&/^\d{4}-\d\d-\d\d$/.test(s.date)&&Array.isArray(s.items))
  .sort((a,b)=>b.date.localeCompare(a.date));
 if(!valid.length)return [];
 const scene=valid[0];
 return scene.items.filter(x=>Number.isFinite(x.probabilityClear)&&x.probabilityClear>=.8&&Number.isFinite(x.lat)&&Number.isFinite(x.lon)).slice(0,limit)
 .map(x=>({...x,date:scene.date,observationType:'historical-visual-candidate-not-live'}));
}
