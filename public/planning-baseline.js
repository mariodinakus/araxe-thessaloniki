/* Transparent cold-start trip planning heuristics.
 * This is NOT fitted to user reports, NOT satellite vacancy and NOT live traffic.
 * Interprets hour/weekday land-use context + count of mapped eligible OSM roads. */
import {context} from './model.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function pressureRule(zone,at){
 const {hour,weekend}=context(at);
 const type=zone?.type||'mixed';
 let value=type==='center'?48:type==='nightlife'?43:type==='residential'?36:39;
 const factors=[];
 if(type==='center'){
  if(!weekend&&hour>=9&&hour<18){value+=27;factors.push('Ώρες εργασίας στο κέντρο');}
  else if(weekend&&hour>=11&&hour<19){value+=13;factors.push('Επισκέψεις Σαββατοκύριακου');}
  else if(hour>=19&&hour<23){value+=12;factors.push('Βραδινή δραστηριότητα');}
  else if(hour>=0&&hour<7){value-=15;factors.push('Νυχτερινή ώρα');}
 }else if(type==='residential'){
  if(hour>=19||hour<8){value+=28;factors.push('Βραδινή επιστροφή κατοίκων');}
  else if(!weekend&&hour>=9&&hour<17){value-=8;factors.push('Ημερήσια εργάσιμη ώρα');}
 }else if(type==='nightlife'){
  if(hour>=20||hour<3){value+=35;factors.push('Νυχτερινή διασκέδαση');}
  else if(hour>=8&&hour<16){value-=10;factors.push('Πρωινές/μεσημεριανές ώρες');}
 }else{
  if(!weekend&&hour>=8&&hour<10){value+=18;factors.push('Πρωινή αιχμή (γενικός κανόνας)');}
  else if(!weekend&&hour>=17&&hour<20){value+=20;factors.push('Απογευματινή αιχμή (γενικός κανόνας)');}
  else if(hour<7){value-=10;factors.push('Νυχτερινή ώρα');}
 }
 if(!factors.length)factors.push('Τυπική ώρα για την κατηγορία περιοχής');
 return {index:Math.round(clamp(value,10,90)),hour,weekend,factors};
}
export function planningBaseline(zone,at=Date.now(),roadOverview=null){
 if(!zone)return {ready:false,reason:'Επίλεξε περιοχή'};
 const timing=pressureRule(zone,at);
 const mapped=roadOverview&&Number.isFinite(roadOverview.total)?roadOverview.total:null;
 const tiers=roadOverview?.tiers||null;
 const viable=mapped!==null&&mapped>0;
 const candidates=viable&&Array.isArray(roadOverview.rows)?roadOverview.rows.slice(0,4).map(x=>({
  name:x.r.name,score:x.score,tier:x.tier
 })):[];
 const level=timing.index>=65?'Αυξημένη':timing.index>=43?'Μέτρια':'Ηπιότερη';
 return {ready:true,kind:'untrained-planning-rule',pressureIndex:timing.index,level,factors:timing.factors,
  mappedRoadNames:mapped,tiers:tiers||{A:0,B:0,C:0,D:0},candidates,
  sources:viable?['Χρόνος/κατηγορία περιοχής','OpenStreetMap · γεωμετρία δρόμων']:['Χρόνος/κατηγορία περιοχής'],
  confidence:'Μη επικυρωμένη ένδειξη',probabilityOfSpace:null,liveOccupancy:false,hasOSM:viable,
  caveat:'Προσωρινός κανόνας σχεδιασμού: όχι πιθανότητα κενής θέσης, όχι πραγματική κίνηση και όχι εγγυημένα νόμιμο παρκάρισμα'};
}
export function planningTimeline(zone,at=Date.now()){
 return [0,1,2,4,6,8].map(hours=>({hours,...planningBaseline(zone,at+hours*3600000)}));
}
