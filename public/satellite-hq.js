/* Satellite-first UI: all displayed counts come from STAC or on-device, dated image observations. */
import {fetchSatelliteCatalog} from './satellite-catalog.js';
import {APPEARANCE_KEY,SCAN_KEY,compareDatedAppearance} from './satellite-slots.js';
import {historicalVisualSignals} from './historical-curb-summary.js';
import {forecastSatelliteScenes,satelliteModelLabels} from './satellite-forecast.js';
const $=id=>document.getElementById(id);
const local=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const CACHE_TTL=30*60*1000;
const zoneCache=new Map();
let active=null,controller=null,serial=0;
function detail(zone){
 const captures=local(APPEARANCE_KEY,[]).filter(x=>x?.zone===zone.id&&typeof x.date==='string'&&Array.isArray(x.patches));
 const visual=forecastSatelliteScenes(captures,zone.id);
 const changes=compareDatedAppearance(captures).filter(x=>x.zone===zone.id);
 return {captures,visual,changes};
}
function setStatus(msg,warning=false){const e=$('satHQStatus');e.textContent=msg;e.classList.toggle('warn',warning);}
function timelineRows(rows,fromLocal=false){
 return rows.map(scene=>'<div class="sat-hq-scene"><strong>'+esc(scene.date)+'</strong><span>'
 +(fromLocal?'Αναλύθηκε στη συσκευή':esc(scene.platform==='satellite'?'Δορυφορική':scene.platform==='uav'?'Drone':scene.platform||'Εναέρια'))+'</span><small>'
 +(fromLocal?(scene.patches?.length||0)+' σημεία':Number(scene.gsd).toFixed(2)+' m/px')+'</small></div>').join('');
}
function paint(zone){
 if(!zone){
  $('satHQScenes').textContent=$('satHQPoints').textContent='0';
  $('satHQEligible').textContent='—';
  $('satHQTimeline').innerHTML='<div class="sat-hq-empty">Επίλεξε περιοχή για να ελεγχθεί το αρχείο δορυφορικών λήψεων.</div>';
  $('satHQModelBars').innerHTML='';
  setStatus('Επίλεξε περιοχή');return;
 }
 const saved=detail(zone),catalog=zoneCache.get(zone.id),visual=saved.visual;
 const records=[...new Map(saved.captures.map(x=>[x.date,x])).values()].sort((a,b)=>b.date.localeCompare(a.date));
 $('satHQScenes').textContent=records.length;
 $('satHQPoints').textContent=saved.changes.length;
 $('satHQEligible').textContent=catalog?.summary?catalog.summary.eligible:'—';
 $('satHQCoverage').textContent=catalog?.summary?
  catalog.summary.satellite+' πραγματικά δορυφορικές · '+catalog.summary.independentDates+' ημερομηνίες'+(catalog.summary.partial?' · μερική καταγραφή':'')
  :catalog?.error?'Πρόβλημα πηγής':'Κατάλογος OAM';
 $('satHQLast').textContent=catalog?.summary?
  'Κατάλογος · '+new Date(catalog.summary.checkedAt).toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'})
  :catalog?.error?'Σφάλμα αναζήτησης':'Δεν έχει ελεγχθεί';
 if(catalog?.loading)setStatus('Αναζήτηση OAM…');
 else if(catalog?.error)setStatus('Μη διαθέσιμος κατάλογος',true);
 else if(catalog?.summary?.eligible)setStatus('Βρέθηκαν '+catalog.summary.eligible+' λήψεις');
 else if(catalog?.summary)setStatus('Δεν βρέθηκαν κατάλληλες λήψεις',true);
 else setStatus('Αναμονή καταλόγου');
 const available=(catalog?.summary?.scenes||[]).slice(0,4);
 const shown=records.length?records.slice(0,4):available;
 $('satHQTimeline').innerHTML=shown.length?
  timelineRows(shown,Boolean(records.length))+
   (!records.length?'<div class="sat-hq-empty">Οι παραπάνω λήψεις είναι μόνο καταχωρίσεις του καταλόγου. Πάτησε εκπαίδευση για να αναλυθούν τα pixels τους.</div>':'')
  :'<div class="sat-hq-empty">'+(catalog?.error?'Αποτυχία ανάγνωσης καταλόγου: '+esc(catalog.error)+'.':catalog?.summary?(catalog.summary.partial?'Δεν βρέθηκαν κατάλληλες λήψεις στις πρώτες 100 καταχωρίσεις του καταλόγου.':'Δεν βρέθηκαν λήψεις ≤0,5 m/pixel με ανοικτή άδεια που καλύπτουν το κέντρο της περιοχής. Δεν επινοούμε δορυφορικά δεδομένα.'):'Ελέγχεται αν υπάρχουν ιστορικές λήψεις υψηλής ανάλυσης στην περιοχή.')+'</div>';
 const groups=new Map();
 for(const c of saved.changes){
  const key=c.roadName||'Ανώνυμη οδός',g=groups.get(key)||{name:key,n:0,total:0};
  g.n++;g.total+=c.visualDifference;groups.set(key,g);
 }
 const rank=[...groups.values()].map(x=>({...x,change:x.total/x.n})).sort((a,b)=>b.change-a.change).slice(0,5);
 $('satHQRoadCount').textContent=groups.size?groups.size+' δρόμοι με ιστορικά στοιχεία':'Αναμονή διαφορετικών ημερομηνιών';
 $('satHQRoads').innerHTML=rank.length?rank.map(x=>{
  const index=Math.round(Math.min(1,Math.max(0,x.change))*100);
  return '<div class="sat-hq-road-row"><div><strong>'+esc(x.name)+'</strong><small>'+x.n+' κοινά ιστορικά σημεία</small></div><div class="sat-hq-road-bar"><i style="width:'+index+'%"></i></div><b>'+index+'/100</b></div>';
 }).join(''):'<div class="sat-hq-empty">Χρειάζονται πραγματικές λήψεις από διαφορετικές ημερομηνίες για να εμφανιστούν μεταβολές ανά δρόμο. Δεν υπολογίζονται κενές θέσεις χωρίς εκπαιδευμένο ανιχνευτή.</div>';
 const signals=historicalVisualSignals(local(SCAN_KEY,[]),zone.id);
 $('satHQVisualDates').textContent=signals.dates?signals.dates+' ημερομηνίες εικόνων':'Χωρίς ιστορικές ταξινομήσεις';
 $('satHQVisualContent').innerHTML=signals.inspected?
 '<div class="sat-hq-signal-stats"><div><strong>'+signals.visuallyClear+'</strong><small>Υψηλές ενδείξεις οπτικού κενού</small></div><div><strong>'+signals.inspected+'</strong><small>Σημεία εικόνων που εξετάστηκαν</small></div><div><strong>'+signals.scenes+'</strong><small>Διαφορετικές λήψεις</small></div></div>'
 +signals.roads.slice(0,3).map(r=>'<div class="sat-hq-visual-road"><span>'+esc(r.name)+'</span><b>'+r.visuallyClear+' / '+r.inspected+' σημεία</b></div>').join('')
 +'<div class="sat-hq-explain">Μόνο ταξινομήσεις ιστορικών λήψεων από το επαληθευμένο οπτικό μοντέλο. Δεν είναι σημερινές κενές ή πιστοποιημένα νόμιμες θέσεις.</div>'
 :'<div class="sat-hq-empty">Δεν υπάρχουν ακόμη ταξινομημένες ιστορικές εικόνες με επαρκώς εκπαιδευμένο μοντέλο. Η σύγκριση οπτικών μεταβολών μπορεί να γίνει χωρίς αυτές.</div>';
 const keys=['last','average','momentum'],briers=visual.models;
 $('satHQValidated').textContent=visual.ready?visual.validationSamples+' χρονολογικές αξιολογήσεις':'Χρειάζονται ≥3 λήψεις';
 $('satHQModelBars').innerHTML=keys.map(k=>'<div class="sat-hq-model-row"><span>'+esc(satelliteModelLabels[k])+'</span><div class="sat-hq-track"><i style="width:'+(visual.ready?Math.round(visual.weights[k]*100):0)+'%"></i></div><b>'+(visual.ready?Math.round(visual.weights[k]*100)+'%':'—')+'</b></div>').join('');
 $('satHQExplanation').textContent=visual.ready?
 'Οπτική μεταβολή '+visual.changeIndex+'/100 · ανεξάρτητος έλεγχος MSE σε '+visual.validationSamples+' συγκρίσεις. Πρόβλεψη εμφάνισης επόμενης λήψης, όχι πραγματικής πληρότητας.':
 records.length+' ιστορικές ημερομηνίες αναλύθηκαν · '+saved.changes.length+' αντιστοιχισμένα τμήματα. Για αξιόπιστη σύγκριση χρειάζονται 3 διαφορετικές εικόνες και ≥15 αξιολογήσιμα σημεία.';
}
async function loadZone(zone,force=false){
 const previous=zoneCache.get(zone.id);
 if(!force&&previous&&((previous.summary&&Date.now()-previous.summary.checkedAt<CACHE_TTL)||(previous.error&&Date.now()-previous.checkedAt<5*60*1000)))return;
 if(!force&&previous?.loading)return;
 controller?.abort();controller=new AbortController();const seq=++serial;
 zoneCache.set(zone.id,{loading:true});paint(zone);
 try{
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(16000)]);
  const summary=await fetchSatelliteCatalog(zone,{signal});
  if(seq!==serial)return;
  zoneCache.set(zone.id,{summary,loading:false});
 }catch(e){
  if(seq!==serial)return;
  zoneCache.set(zone.id,{error:e.name==='AbortError'?'Ακυρώθηκε η αναζήτηση':e.message,loading:false,checkedAt:Date.now()});
 }
 if(active?.id===zone.id)paint(zone);
 window.dispatchEvent(new CustomEvent('araxe:satellite-catalog',{detail:{zoneId:zone.id}}));
}
export function renderSatelliteHQ(zone,{refresh=false}={}){
 active=zone||null;
 paint(active);
 if(active)void loadZone(active,refresh);
}
export function setupSatelliteHQ({onTrain,onMap}){
 $('satHQTrain').onclick=()=>onTrain?.(active?.id||'center');
 $('satHQRefresh').onclick=()=>active&&renderSatelliteHQ(active,{refresh:true});
 $('satHQMap').onclick=()=>onMap?.(active?.id||'center');
 window.addEventListener('araxe:satellite-update',()=>active&&paint(active));
}
export function satelliteCatalogSnapshot(zoneId){return zoneCache.get(zoneId)?.summary||null;}
