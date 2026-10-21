import {roadIntelligence,roadTierLookup,tierColors,trafficSummary,hourlyForecast,imageryAvailability} from './road-intelligence.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const fmt=n=>n===null?'—':String(n);
const labels={A:'A · πρώτη εξερεύνηση',B:'B · εναλλακτική',C:'C · χαμηλότερη προτεραιότητα',D:'D · τελευταία επιλογή'};
export function colorOfMappedRoad(road,overview){
 const key=road?.name?.trim().normalize('NFC').toLocaleLowerCase('el-GR');
 const selected=overview?.lookup?.get(key);
 return selected?tierColors[selected.tier]:'#98a4a0';
}
export function paintRoadIntelligence(input){
 const {zone,roads,parkingEvents,trafficEvents,arrival,now=Date.now(),include}=input;
 const el=$('intelligence');if(!el)return null;
 if(!zone){
  $('intelStamp').textContent='Επίλεξε περιοχή';
  $('intelCount').textContent=$('intelTopCount').textContent=$('intelEvidence').textContent=$('intelTrafficCount').textContent='—';
  $('intelDistribution').textContent=$('intelTrafficBars').textContent=$('intelTrafficChart').textContent=$('intelRoadTable').textContent='Επίλεξε περιοχή στον χάρτη.';
  $('intelSatelliteDate').textContent='Χωρίς επαληθευμένη λήψη';
  $('intelSatelliteInfo').textContent='Οι εικόνες αρχείου δεν είναι live παρακολούθηση.';
  return null;
 }
 const overview=roadIntelligence(roads||[],zone,include),lookup=roadTierLookup(overview.rows);
 $('intelStamp').textContent='OSM · γεωμετρία / όχι διαθεσιμότητα';
 $('intelCount').textContent=overview.total;
 $('intelTopCount').textContent=overview.tiers.A;
 const pCount=parkingEvents.filter(e=>e.zone===zone.id).length;
 $('intelEvidence').textContent=pCount;
 const t=trafficSummary(zone.id,trafficEvents,arrival,now);
 $('intelTrafficCount').textContent=t.n;
 $('intelDistribution').innerHTML=['A','B','C','D'].map(level=>{
  const n=overview.tiers[level],fraction=overview.total?100*n/overview.total:0;
  return `<div class="intel-bar-row"><span class="tier-pill tier-${level}">${level}</span><div class="intel-bar-track"><div style="width:${fraction.toFixed(2)}%;background:${tierColors[level]}"></div></div><b>${n}</b><small>${Math.round(fraction)}%</small></div>`;
 }).join('');
 const trafficKinds=['Κανονική','Αργή','Συμφόρηση'],trafficColors=['#2b956e','#efb449','#dc7465'];
 $('intelTrafficLabel').textContent=t.ready?'Εκτίμηση από αναφορές · '+t.severity+'/100':'Ανεπαρκές δείγμα · '+t.matched+' σχετικές';
 $('intelTrafficBars').innerHTML=t.counts.reduce((acc,n,i)=>acc+`<div class="intel-bar-row"><span class="traffic-label">${trafficKinds[i]}</span><div class="intel-bar-track"><div style="width:${t.n?(100*n/t.n).toFixed(2):0}%;background:${trafficColors[i]}"></div></div><b>${n}</b></div>`,'');
 const horizon=hourlyForecast(zone.id,parkingEvents,trafficEvents,arrival,now);
 $('intelTrafficChart').innerHTML='<h5>Πρόβλεψη ανά ώρα άφιξης</h5><div class="intel-forecast">'+horizon.map(d=>{
  const traffic=pct(d.traffic),park=pct(d.parking);
  return `<div class="intel-forecast-item"><b>+${d.hours}ω</b><div class="intel-forecast-graph"><i style="height:${traffic===null?'0':Math.max(3,traffic)}%;background:${traffic===null?'transparent':'#dc7465'}"></i><i style="height:${park===null?'0':Math.max(3,park)}%;background:${park===null?'transparent':'#2b956e'}"></i></div><small>${fmt(traffic)} / ${fmt(park)}</small></div>`;
 }).join('')+'</div><small>Κόκκινο: εκτιμώμενη επιβάρυνση κίνησης 0–100 · Πράσινο: μοντέλο αναζήτησης στάθμευσης (%) · — σημαίνει ανεπαρκές δείγμα.</small>';
 const last=read('araxe-aerial-last',null),profile=read('araxe-aerial-scenes-v1',{})?.[zone.id];
 const imagery=imageryAvailability(last?.zone===zone.id?last:null);
 $('intelSatelliteDate').textContent=imagery.date||'Δεν έχει επιβεβαιωθεί νέα λήψη';
 $('intelSatelliteInfo').textContent=`${profile?.n||0} διαφορετικές εικόνες στο οπτικό μοντέλο αυτής της συσκευής. ${imagery.date?'Τελευταία τοπική αυτόματη ανάλυση αρχείου: '+imagery.date+'.':'Δεν υπάρχει χρονολογημένη αυτόματη ανάλυση για αυτή την περιοχή.'} Δεν υπάρχει επιβεβαιωμένη ανίχνευση ελεύθερων θέσεων ανά δρόμο.`;
 const top=overview.rows.slice(0,18);
 $('intelRoadCount').textContent=overview.total?'Εμφάνιση '+top.length+' / '+overview.total:'Χωρίς κατάλληλους δρόμους';
 $('intelRoadTable').innerHTML=top.length?top.map((item,i)=>`<button type="button" class="intel-road-item" data-intel-road="${esc(String(item.r.id))}"><span class="tier-pill tier-${item.tier}">${item.tier}</span><span class="intel-road-name"><strong>${esc(item.r.name)}</strong><small>${Math.round(item.d*1000)} μ. μέχρι το πλησιέστερο τμήμα · ${Math.round(item.length)} μ. χαρτογραφημένου μήκους</small></span><span class="intel-score"><b>${item.score}</b><small>/100</small></span></button>`).join(''):'<p class="intel-note">Δεν υπάρχουν χαρτογραφημένες κατάλληλες οδοί για κατάταξη. Δεν δημιουργούμε πλασματικές ζώνες.</p>';
 return {...overview,lookup};
}
export function tierDetail(road,overview){
 if(!road)return '';
 const key=road.name?.trim().normalize('NFC').toLocaleLowerCase('el-GR'),item=overview?.lookup?.get(key);
 return item?`<div class="intel-detail-tier"><span class="tier-pill tier-${item.tier}">${item.tier}</span><div><strong>Ζώνη εξερεύνησης ${item.tier} · Δείκτης ${item.score}/100</strong><small>${labels[item.tier]} · βάση: γεωμετρία OpenStreetMap. Δεν σημαίνει ελεύθερη ή νόμιμη θέση.</small></div></div>`:
 '<p class="intel-note">Δεν υπάρχουν αρκετά χαρτογραφικά στοιχεία για κατάταξη αυτού του δρόμου.</p>';
}
