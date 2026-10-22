/* Dedicated Leaflet view for REAL archived imagery, dated curb image changes, and
 * human-validated historical visual inferences. No synthetic/live vacancy data. */
import {historicalMapEvidence,supportedSceneFootprints,perImageTileUrl,visualLevel} from './map-history.js';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function createHistoricalMap({map,getCatalog,onTrain}){
 const outlines=L.layerGroup().addTo(map),changes=L.layerGroup().addTo(map),vacancies=L.layerGroup().addTo(map);
 let image=null,imageId=null,region=null,active=false,onceFor=null,data=null,scenes=[];
 const clearImage=()=>{if(image){map.removeLayer(image);image=null;}imageId=null;};
 const roadInfo=name=>{
  const key=String(name||'').trim().normalize('NFC').toLocaleLowerCase('el-GR');
  return data?.byStreet.get(key)||null;
 };
 const mapRoadColor=name=>{
  const record=roadInfo(name);
  if(!record)return '#899991';
  const level=visualLevel(record.total/record.n);
  return level==='high'?'#efa56b':level==='medium'?'#f0cf78':'#6dcaa1';
 };
 const mapRoadTooltip=name=>{
  const r=roadInfo(name);
  return r?'Ιστορική μεταβολή εικόνας '+Math.round(Math.min(1,r.total/r.n)*100)+'/100 · '+r.dates.size+' διαφορετικές ημερομηνίες (όχι ελεύθερες θέσεις)':'Καμία επαληθευμένη ιστορική σύγκριση · διαθεσιμότητα άγνωστη';
 };
 function showImage(scene){
  if(!active||!scene)return;
  clearImage();
  let received=false,errors=0;
  const layer=L.tileLayer(perImageTileUrl(scene.id),{maxZoom:21,maxNativeZoom:20,opacity:.94,
   attribution:'Historic © OpenAerialMap contributors · '+scene.license+' · '+scene.date});
  layer.on('tileload',()=>{
   if(image!==layer||received)return;
   received=true;
   $('historyMapStatus').textContent='Φορτώθηκε πραγματική ιστορική λήψη '+scene.date+' · '+scene.gsd+'m/pixel. Δεν είναι live.';
  });
  layer.on('tileerror',()=>{
   if(image!==layer||received||++errors<3)return;
   $('historyMapStatus').textContent='Τα tiles αυτής της λήψης δεν φορτώνουν. Τα περιγράμματα OAM και οι παλιές μεταβολές παραμένουν ορατά.';
   clearImage();
  });
  image=layer;imageId=scene.id;
  $('historyMapStatus').textContent='Φόρτωση δορυφορικής/εναέριας λήψης '+scene.date+'…';
  image.addTo(map);image.bringToFront();
  outlines.eachLayer(x=>x.bringToFront());changes.eachLayer(x=>x.bringToFront());vacancies.eachLayer(x=>x.bringToFront());
 }
 function render(zone,visible=true){
  active=visible;region=zone||region;
  $('historyMapPanel').hidden=!active;
  for(const group of [outlines,changes,vacancies]){
   group.clearLayers();
   if(active){if(!map.hasLayer(group))group.addTo(map);}
   else if(map.hasLayer(group))map.removeLayer(group);
  }
  if(!active){clearImage();return;}
  if(!region)return;
  data=historicalMapEvidence(region.id);
  scenes=supportedSceneFootprints(getCatalog(region.id));
  const summary=getCatalog(region.id);
  $('historyMapScenes').textContent=summary?scenes.length+' καταχωρισμένες ιστορικές λήψεις':'Έλεγχος καταλόγου OAM…';
  $('historyMapChanges').textContent=data.visual.length+' πραγματικές οπτικές μεταβολές';
  const picker=$('historyMapScene'),previous=picker.value;
  picker.innerHTML=scenes.length?scenes.map(s=>'<option value="'+escape(s.id)+'">'+escape(s.date)+' · '+escape(s.platform)+' · '+s.gsd+'m/px</option>').join('')
   :'<option value="">Δεν υπάρχουν κατάλληλες λήψεις</option>';
  if(scenes.some(s=>s.id===previous))picker.value=previous;
  $('historyMapShowImage').disabled=!scenes.length;
  for(const s of scenes){
   const b=s.bbox,frame=L.rectangle([[b[1],b[0]],[b[3],b[2]]],{color:'#75e3ee',weight:2,fillColor:'#40b7ca',fillOpacity:.06,dashArray:'6 5'});
   frame.bindPopup('<strong>Περίγραμμα δορυφορικής / εναέριας λήψης</strong><p>'+escape(s.date)+' · '+escape(s.platform)+' · '+s.gsd+' m/px</p><p>Πραγματικό STAC metadata. Δεν δείχνει ελεύθερες θέσεις.</p>');
   frame.addTo(outlines);
  }
  for(const p of data.visual){
   const lvl=visualLevel(p.visualDifference),color=lvl==='high'?'#eeb275':lvl==='medium'?'#f1d282':'#69bf9b';
   const marker=L.circleMarker([p.lat,p.lon],{radius:5,color:'#fff',weight:1,fillColor:color,fillOpacity:.95});
   marker.bindPopup('<strong>Ιστορική μεταβολή εικόνας</strong><p>'+escape(p.roadName)+' · '+escape(p.dates.join(', '))+'</p><p>Οπτικός δείκτης '+p.visualDifference.toFixed(3)+'. Δεν σημαίνει κενή θέση.</p>');
   marker.addTo(changes);
  }
  for(const p of data.classified){
   const marker=L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:2,fillColor:'#22aa77',fillOpacity:.93});
   marker.bindPopup('<strong>Πιθανό κενό στην ιστορική λήψη</strong><p>'+escape(p.roadName)+' · '+escape(p.date)+'</p><p>Μη βαθμονομημένη ένδειξη οπτικού μοντέλου '+Math.round(100*p.probabilityClear)+'%. Δεν είναι ζωντανή ή επιβεβαιωμένα νόμιμη θέση.</p>');
   marker.addTo(vacancies);
  }
  if(data.visual.length){
   $('historyMapStatus').textContent=data.visual.length+' χρονολογημένα σημεία οπτικής μεταβολής · '+data.streets+' δρόμοι · '+data.dates.length+' διαφορετικές ημερομηνίες.';
  }else if(data.classified.length){
   $('historyMapStatus').textContent=data.classified.length+' πιθανές οπτικά κενές θέσεις σε παλιές φωτογραφίες · όχι σημερινή πληρότητα.';
  }else if(!summary){
   $('historyMapStatus').textContent='Έλεγχος OpenAerialMap για αυτή την περιοχή. Γκρι δρόμοι = άγνωστη πληρότητα, όχι ελεύθερες ή γεμάτες θέσεις.';
  }else if(!scenes.length){
   $('historyMapStatus').textContent='Δεν υπάρχουν κατάλληλες παλιές λήψεις υψηλής ανάλυσης στον κατάλογο για την περιοχή. Δεν υπάρχουν πραγματικά σημεία για σχεδίαση.';
  }else{
   $('historyMapStatus').textContent='Βρέθηκαν πραγματικές ιστορικές λήψεις. Προβολή εικόνας και εκπαίδευση διαθέσιμες εδώ.';
  }
  if(image&&(!scenes.length||!scenes.some(s=>s.id===imageId)))clearImage();
  if(scenes.length&&!image&&onceFor!==region.id){
   onceFor=region.id;
   showImage(scenes[0]); // Display only a real catalogued dated image, never a generic substitute.
  }
 }
 $('historyMapHide').onclick=()=>window.dispatchEvent(new Event('araxe:hide-historical-map'));
 $('historyMapTrain').onclick=()=>onTrain(region?.id||'center');
 $('historyMapShowImage').onclick=()=>{const s=scenes.find(s=>s.id===$('historyMapScene').value);if(s)showImage(s);};
 $('historyMapScene').onchange=()=>{const s=scenes.find(s=>s.id===$('historyMapScene').value);if(s)showImage(s);};
 return {render,roadColor:mapRoadColor,roadTooltip:mapRoadTooltip,clearImage};
}
