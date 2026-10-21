// Parking exploration tiers are map-derived priorities, never measured vacancy
// or a claim about legal, accessible curbside spaces.
import {rankExplorationRoads} from './road-ranking.js';
import {predict,predictTraffic} from './model.js';
const colors={A:'#2b956e',B:'#8bb654',C:'#efb449',D:'#dc7465'};
export const tierColors=Object.freeze(colors);
export const trafficLevels=Object.freeze({normal:'#2b956e',slow:'#efb449',congested:'#dc7465',unknown:'#9ba4a0'});
export function tierForScore(value){
 if(!Number.isFinite(value))return null;
 return value>=75?'A':value>=60?'B':value>=45?'C':'D';
}
export function roadIntelligence(roads,zone,include=()=>true){
 if(!zone||!Array.isArray(roads))return {total:0,tiers:{A:0,B:0,C:0,D:0},rows:[],mapped:roads?.length||0,discarded:roads?.length||0};
 const rows=rankExplorationRoads(roads,zone,include).map(item=>{
  // Geometric ranking score, not learned probability or satellite classification.
  const score=Math.min(100,Math.max(0,Math.round(item.score*100)));
  return {...item,score,tier:tierForScore(score),basis:'OSM geometry / mapped class'};
 });
 const tiers={A:0,B:0,C:0,D:0};for(const r of rows)tiers[r.tier]++;
 return {total:rows.length,mapped:roads.length,discarded:Math.max(0,roads.length-rows.reduce((n,r)=>n+r.segments,0)),tiers,rows};
}
export function roadTierLookup(rows){
 const result=new Map();
 for(const item of rows||[])result.set(item.r.name.trim().normalize('NFC').toLocaleLowerCase('el-GR'),item);
 return result;
}
export function trafficSummary(zone,events,at=Date.now(),now=Date.now()){
 const t=predictTraffic(zone,events,at,now);
 const counts=[0,0,0];
 for(const e of events){if(e.zone===zone&&e.at<=now&&e.at>=now-90*86400000&&[0,1,2].includes(e.outcome))counts[e.outcome]++;}
 const level=!t.ready?'unknown':t.score>.65?'congested':t.score>.35?'slow':'normal';
 return {level,color:trafficLevels[level],counts,n:counts.reduce((a,b)=>a+b,0),matched:t.n,effective:t.effective,
  ready:t.ready,severity:t.ready?Math.round(100*t.score):null,
  probabilities:t.ready?t.probabilities.map(p=>Math.round(100*p)):null};
}
export function hourlyForecast(zone,parkingEvents,trafficEvents,at=Date.now(),now=Date.now()){
 return [0,1,2,4].map(hours=>{
  const instant=at+hours*3600000;
  const park=predict(zone,parkingEvents,instant,now),traffic=trafficSummary(zone,trafficEvents,instant,now);
  return {hours,at:instant,parking:park.ready?Math.round(100*park.p):null,parkingEffective:park.effective,traffic:traffic.severity,trafficMatched:traffic.matched};
 });
}
export function imageryAvailability(sceneRecord){
 const date=typeof sceneRecord?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(sceneRecord.date)?sceneRecord.date:null;
 const dated=date&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&Date.parse(date+'T00:00:00Z')<=Date.now()?date:null;
 return {date:dated,checked:dated!==null,source:dated?'OpenAerialMap / τοπική επιβεβαιωμένη λήψη':'Δεν έχει επιβεβαιωθεί λήψη',perRoadOccupancy:null};
}
