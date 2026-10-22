/* Evidence-based multi-model parking forecasts: no invented vacancy/satellite telemetry.
   Prediction target: driver reports successful legal on-street search within <=10 min. */
import {context,predict} from './model.js';
import {trainOnline,logistic,nearestCases} from './ensemble.js';
const DAY=86400000;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const NAMES=['bayesian','logistic','neighbors','weekly'];
export const modelLabels={bayesian:'Bayesian',logistic:'Online ML',neighbors:'Παρόμοια περιστατικά',weekly:'Ωριαία συνήθεια'};
export const defaultWeights={bayesian:.45,logistic:.25,neighbors:.2,weekly:.1};
export function reliableEvents(events,now=Date.now()){
 return (Array.isArray(events)?events:[]).filter(e=>e&&typeof e.zone==='string'&&[0,1].includes(e.outcome)
 &&Number.isFinite(e.at)&&e.at<=now&&e.at>now-180*DAY)
 .sort((a,b)=>a.at-b.at);
}
export function weeklyHabit(events,zone,at,now=Date.now()){
 const c=context(at);let total=0,success=0,n=0;
 for(const e of events){
  if(e.zone!==zone||e.at>now||e.at<now-180*DAY)continue;
  const ec=context(e.at);if(ec.weekend!==c.weekend)continue;
  const h=Math.min(Math.abs(c.hour-ec.hour),24-Math.abs(c.hour-ec.hour));
  if(h>3)continue;
  const w=Math.exp(-h*.8)*Math.pow(.5,(now-e.at)/(60*DAY));
  total+=w;success+=w*e.outcome;n++;
 }
 return {p:(2+success)/(4+total),n,effective:total}; // shrink to .5
}
function allModels(zone,events,at,road,now,trained=null){
 const local=road?events.filter(e=>e.zone===zone&&e.road===road):[];
 const street=road?predict(zone,local,at,now):null;
 const base=street?.ready?street:predict(zone,events,at,now);
 const lr=trained||trainOnline(events,now);
 const knn=nearestCases(events,zone,at,road,now);
 return {base,scope:street?.ready?'street':'area',
  values:{bayesian:base.p,logistic:logistic(lr,zone,at,road),neighbors:knn.p,weekly:weeklyHabit(events,zone,at,now).p}};
}
function normalizedWeights(scores,completed){
 if(completed<15)return {...defaultWeights};
 const strengths=NAMES.map(name=>clamp(1/(.035+scores[name]/completed),1,25));
 const sum=strengths.reduce((a,b)=>a+b,0);
 return Object.fromEntries(NAMES.map((n,i)=>[n,strengths[i]/sum]));
}
/** Chronological prequential backtesting. Earlier reports only. Never evaluate on training labels. */
export function backtestModels(events,zone,{now=Date.now(),maxEvaluations=35}={}){
 const valid=reliableEvents(events,now).filter(e=>e.zone===zone);
 const scores=Object.fromEntries(NAMES.map(n=>[n,0]));
 let evaluated=0,baseline=0;const snapshots=[],last=Math.max(0,valid.length-maxEvaluations);
 // Re-estimate after every previous record. No lookahead, no timestamps > current label.
 for(let i=last;i<valid.length;i++){
  const sample=valid[i],past=valid.slice(0,i).filter(e=>e.at<sample.at);
  if(past.length<25)continue;
  const estimate=allModels(zone,past,sample.at,null,sample.at-1);
  if(!estimate.base.ready)continue;
  const freq=past.reduce((s,e)=>s+e.outcome,0)/past.length;
  baseline+=(freq-sample.outcome)**2;
  const probs={};
  for(const n of NAMES){const v=clamp(estimate.values[n],.001,.999);scores[n]+=(v-sample.outcome)**2;probs[n]=v;}
  snapshots.push({at:sample.at,actual:sample.outcome,predictions:probs});
  evaluated++;
 }
 const averages=Object.fromEntries(NAMES.map(n=>[n,evaluated?scores[n]/evaluated:null]));
 const weights=normalizedWeights(scores,evaluated);
 const weighted=Object.values(snapshots).reduce((a,row)=>{
  const p=NAMES.reduce((s,n)=>s+row.predictions[n]*weights[n],0);
  return a+(p-row.actual)**2;
 },0);
 const weightedBrier=evaluated?weighted/evaluated:null;
 return {evaluated,weights,models:averages,baseline:evaluated?baseline/evaluated:null,
  ensembleBrier:weightedBrier,validated:evaluated>=15&&weightedBrier<=baseline/evaluated,
  // Scores are a visible rolling reliability comparison, not a performance guarantee.
  validationLabel:evaluated>=15?'Προοδευτική αξιολόγηση σε παλαιότερες αναφορές':'Ανεπαρκές δείγμα αξιολόγησης'};
}
export function parkingForecast(zone,events,at=Date.now(),{road=null,now=Date.now(),backtest=null,trained=null}={}){
 const valid=reliableEvents(events,now);
 const local=valid.filter(e=>e.zone===zone);
 const stats=allModels(zone,valid,at,road,now,trained);
 const validation=backtest||backtestModels(local,zone,{now});
 const w=validation.weights;
 const p=clamp(NAMES.reduce((s,n)=>s+w[n]*stats.values[n],0),.01,.99);
 const disagreement=Math.max(...Object.values(stats.values))-Math.min(...Object.values(stats.values));
 const reliable=stats.base.ready;
 const evidence=stats.base.effective;
 const confidence=!reliable?'insufficient':evidence>=45&&validation.validated&&disagreement<.2?'medium': 'low';
 return {ready:reliable,p:reliable?p:null,probability:reliable?Math.round(p*100):null,
  confidence,confidenceLabel:{insufficient:'Ανεπαρκή δεδομένα',low:'Χαμηλή',medium:'Μέτρια'}[confidence],
  n:stats.base.n,effective:evidence,scope:stats.scope,models:stats.values,
  weights:w,validation,disagreement,low:stats.base.low,high:stats.base.high,
  target:'Αναφερόμενη επιτυχία αναζήτησης νόμιμης θέσης μέσα σε 10 λεπτά',
  satelliteRealTime:false};
}
export function forecastHorizon(zone,events,at=Date.now(),opts={}){
 const now=opts.now||Date.now(),valid=reliableEvents(events,now),backtest=backtestModels(valid,zone,{now}),trained=trainOnline(valid,now);
 return [0,1,2,4,6,8].map(hours=>({
  hours,...parkingForecast(zone,valid,at+hours*3600000,{...opts,backtest,trained,now})
 }));
}
