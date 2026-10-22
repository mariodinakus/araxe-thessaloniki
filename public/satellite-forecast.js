/* Satellite-only self-supervised forecasting of next-scene visual appearance.
 * No parking/vehicle labels are inferred from unlabeled photos.
 * Each capture is an independent dated scene; forecast errors are measured out of scene. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const METHODS=['last','average','momentum'];
const labels={last:'Τελευταία εικόνα',average:'Ιστορικός μέσος',momentum:'Οπτική τάση'};
function validVector(x){return Array.isArray(x)&&x.length===84&&x.every(v=>Number.isFinite(v)&&v>=0&&v<=1);}
const squared=(a,b)=>a.reduce((t,x,i)=>t+(x-b[i])**2,0)/84;
const difference=(a,b)=>Math.sqrt(squared(a,b));
function candidates(prior){
 const last=prior.at(-1),prev=prior.at(-2);
 const avg=Array.from({length:84},(_,i)=>prior.reduce((s,v)=>s+v[i],0)/prior.length);
 const move=last.map((v,i)=>clamp(v+clamp(v-prev[i],-.1,.1),0,1));
 return {last,average:avg,momentum:move};
}
export function forecastSatelliteScenes(scenes,zone){
 const selected=(Array.isArray(scenes)?scenes:[])
  .filter(s=>s?.zone===zone&&typeof s.date==='string'&&Array.isArray(s.patches))
  .sort((a,b)=>a.date.localeCompare(b.date));
 const capturedDates=[...new Set(selected.map(s=>s.date))];
 const byPoint=new Map();
 for(const scene of selected){
  for(const p of scene.patches){
   if(!validVector(p.features)||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
   const key=(p.roadId||'')+':'+Math.round(p.lat*100000)+':'+Math.round(p.lon*100000);
   const seq=byPoint.get(key)||new Map();
   // Never train multiple times on the same photo date.
   if(!seq.has(scene.date))seq.set(scene.date,p.features);
   byPoint.set(key,seq);
  }
 }
 const loss={last:0,average:0,momentum:0};
 let samples=0,points=0,sumChange=0,changeCount=0;
 for(const value of byPoint.values()){
  const history=[...value.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,x])=>x);
  if(history.length<2)continue;
  points++;
  for(let j=1;j<history.length;j++){sumChange+=difference(history[j],history[j-1]);changeCount++;}
  for(let i=2;i<history.length;i++){
   const forecast=candidates(history.slice(0,i));
   for(const name of METHODS)loss[name]+=squared(forecast[name],history[i]);
   samples++;
  }
 }
 const mse=Object.fromEntries(METHODS.map(k=>[k,samples?loss[k]/samples:null]));
 let weights={last:.34,average:.33,momentum:.33};
 if(samples>=15&&capturedDates.length>=3){
  const raw=METHODS.map(k=>1/(.004+mse[k])),sum=raw.reduce((a,b)=>a+b,0);
  weights=Object.fromEntries(METHODS.map((k,i)=>[k,raw[i]/sum])); // corrected by build-time tests
 }
 const meanChange=changeCount?sumChange/changeCount:null;
 return {zone,scenes:capturedDates.length,points,validationSamples:samples,
  models:mse,weights,meanChange,changeIndex:meanChange===null?null:Math.round(clamp(meanChange*200,0,100)),
  ready:capturedDates.length>=3&&samples>=15,
  target:'Πρόβλεψη μεταβολής οπτικών χαρακτηριστικών μεταξύ ιστορικών λήψεων, όχι πληρότητα στάθμευσης',
  vacancyForecast:null,live:false};
}
export const satelliteModelLabels=labels;
