import {forecastHorizon,modelLabels} from './forecast-engine.js';
import {APPEARANCE_KEY,SLOT_KEY,compareDatedAppearance} from './satellite-slots.js';
import {forecastSatelliteScenes,satelliteModelLabels} from './satellite-forecast.js';
const el=id=>document.getElementById(id);
const nfmt=x=>Number.isFinite(x)?x.toFixed(3):'—';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const labels=['bayesian','logistic','neighbors','weekly'];
export function renderForecastLab(zone,events,at=Date.now(),now=Date.now()){
 if(!el('forecastLab'))return;
 if(!zone){
  el('forecastMainProbability').textContent='—';
  el('forecastMainLabel').textContent='Διάλεξε περιοχή στον χάρτη';
  el('forecastSampleStatus').textContent='Το μοντέλο χρειάζεται πραγματικές αναφορές.';
  el('forecastConfidence').textContent='Χωρίς μέτρηση';
  el('forecastModelBars').innerHTML=el('forecastFuture').innerHTML='';
 if(el('satelliteModelStats'))el('satelliteModelStats').textContent='Επίλεξε περιοχή για έλεγχο δορυφορικής μάθησης.';
  el('forecastReliability').textContent='Δεν υπάρχουν δεδομένα για ανεξάρτητο χρονικό έλεγχο.';
  return;
 }
 const series=forecastHorizon(zone.id,events,at,{now});
 const prediction=series[0],v=prediction.validation;
 el('forecastMainProbability').textContent=prediction.ready?prediction.probability+'%':'—';
 el('forecastMainLabel').textContent=prediction.ready?'Εκτίμηση επιτυχίας αναζήτησης ≤10′':'Δεν υπάρχει επαρκές δείγμα';
 el('forecastConfidence').textContent='Εμπιστοσύνη: '+prediction.confidenceLabel;
 el('forecastSampleStatus').textContent=prediction.ready?
  prediction.n+' συγκρίσιμες αναφορές · '+prediction.effective.toFixed(1)+' σταθμισμένο δείγμα · '+(prediction.scope==='street'?'δρόμος':'περιοχή'):
  'Αναφορές στην ίδια ημέρα/ώρα: '+prediction.n+' · χρειάζονται περισσότερα στοιχεία.';
 el('forecastModelBars').innerHTML=labels.map((key,i)=>{
  const p=prediction.models[key],w=prediction.weights[key],width=prediction.ready?Math.max(1,Math.round(p*100)):0;
  return '<div class="forecast-model-row"><span>'+modelLabels[key]+'</span><div class="forecast-model-track"><div style="width:'+width+'%"></div></div><strong>'+(prediction.ready?Math.round(p*100)+'%':'—')+'</strong><small>βάρος '+Math.round(w*100)+'%</small></div>';
 }).join('');
 const values=v.evaluated>=15?Object.entries(v.models).map(([key,value])=>'<span>'+modelLabels[key]+': '+nfmt(value)+'</span>').join(' · '):'Χρειάζονται ≥15 προηγούμενες αξιολογήσιμες αναφορές για αξιολόγηση σφάλματος.';
 el('forecastReliability').innerHTML='<strong>Backtest με μόνο παλαιότερα δεδομένα</strong> · '+v.evaluated+' αξιολογήσεις'
  +'<div class="forecast-backtest"><span>Brier συνδυασμού: <b>'+nfmt(v.ensembleBrier)+'</b></span><span>Ιστορικό baseline: <b>'+nfmt(v.baseline)+'</b></span></div>'
  +'<small>'+values+'</small><p>'+(v.validated?'Τα ιστορικά σφάλματα είναι χαμηλότερα από το βασικό μοντέλο.':'Δεν έχει αποδειχθεί ακόμη ότι ο συνδυασμός ξεπερνά το απλό baseline.')+'</p>';
 el('forecastFuture').innerHTML='<strong>Ώρα άφιξης · εκτίμηση επιτυχίας</strong><div class="forecast-horizon">'
  +series.map(x=>'<div class="forecast-hour"><b>+'+x.hours+'ω</b><div><i style="height:'+(x.ready?Math.max(2,x.probability):0)+'%"></i></div><span>'+(x.ready?x.probability+'%':'—')+'</span></div>').join('')+'</div>';
 const history=read(APPEARANCE_KEY,[]).filter(x=>x.zone===zone.id),
 comparisons=compareDatedAppearance(history).filter(x=>x.zone===zone.id),
 annotations=read(SLOT_KEY,[]).filter(x=>x.zone===zone.id);
 const satelliteForecast=forecastSatelliteScenes(history,zone.id),satBox=el('satelliteModelStats');
 if(satBox){
  const vals=satelliteForecast.models;
  satBox.innerHTML='<strong>Satellite Visual Models · '+satelliteForecast.scenes+' λήψεις</strong>'
    +'<div class="sat-model-kpis"><span>'+satelliteForecast.points+' κοινά σημεία δρόμων</span><span>'+satelliteForecast.validationSamples+' δοκιμές σε επόμενες εικόνες</span><span>Δείκτης μεταβολής: '+(satelliteForecast.changeIndex??'—')+'/100</span></div>'
    +Object.keys(satelliteModelLabels).map(name=>'<div class="sat-model-row"><span>'+satelliteModelLabels[name]+'</span><b>MSE '+(Number.isFinite(vals[name])?vals[name].toFixed(4):'—')+'</b><small>βάρος '+Math.round(satelliteForecast.weights[name]*100)+'%</small></div>').join('')
    +'<small>'+(satelliteForecast.ready?'Έγινε χρονικός έλεγχος των μοντέλων με εικόνες που δεν είχαν δει στη στιγμή της πρόβλεψης.':'Αναμονή τουλάχιστον 3 διαφορετικών ημερομηνιών και 15 αξιολογήσιμων σημείων.')+' <b>Προβλέπει εμφάνιση εικόνας, όχι ελεύθερες θέσεις.</b></small>';
 }
 const satelliteDetail=el('intelSatelliteInfo');
 if(satelliteDetail){
  satelliteDetail.textContent=history.length+' χρονολογημένες οπτικές λήψεις αυτής της συσκευής · '
    +comparisons.length+' συγκρίσιμα σημεία ανάμεσα σε παλιές φωτογραφίες · '
    +annotations.length+' ανθρώπινες ετικέτες οπτικής πληρότητας. '
    +'Οι δορυφορικές εικόνες δεν εισάγονται ως live πληρότητα στο προβλεπτικό μοντέλο.';
 }
}
