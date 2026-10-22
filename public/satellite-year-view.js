import {satelliteWmtsUrl,satelliteCredit,satelliteResolutionAtZoom} from './satellite-years.js';
const $=id=>document.getElementById(id);
/* Real year-stamped Sentinel-2 mosaics; NOT per-car imagery or current vacancies.
   The ESRI layer under the year imagery is only a high-zoom orientation aid. */
export function createSatelliteYearMap(map){
 let layer=null,year=2025,active=false,received=false,errors=0,compare=false;
 const status=(message,warning=false)=>{
  $('satelliteYearStatus').textContent=message;
  $('satelliteYearStatus').classList.toggle('warn',warning);
 };
 function zoomStatus(){
  if(!active)return;
  const scale=satelliteResolutionAtZoom(map.getZoom());
  if(layer)layer.setOpacity(scale==='sentinel-10m'?1:0);
  if(scale==='high-zoom-reference'){
   status('Μεγέθυνση δρόμου: φαίνεται Esri ως υπόβαθρο (χωρίς γνωστή ημερομηνία). Sentinel-2 '+year+' μόνο έως zoom 14 · ανάλυση 10m/px.');
  }else if(!received){
   status('Φόρτωση πραγματικού Sentinel-2 '+year+' · ετήσια σύνθεση, όχι φωτογραφία σημερινής ημέρας…');
  }else{
   status('Sentinel-2 '+year+' · ετήσια σύνθεση 10m/px · όχι ορατά μεμονωμένα οχήματα.');
  }
 }
 function selectYear(input){
  const n=Number(input);
  let url,credit;
  try{url=satelliteWmtsUrl(n);credit=satelliteCredit(n);}catch(e){status(e.message,true);return;}
  if(layer){map.removeLayer(layer);layer=null;}
  year=n;received=false;errors=0;
  $('satelliteYear').value=String(year);
  if(active&&map.getZoom()>14)map.setZoom(14);
  if(!active)return;
  layer=L.tileLayer(url,{maxNativeZoom:14,maxZoom:21,minZoom:0,attribution:credit,crossOrigin:'anonymous',opacity:1});
  layer.on('tileload',()=>{
   if(!active||!layer)return;
   received=true;zoomStatus();
  });
  layer.on('tileerror',()=>{
   if(!active||received||++errors<3)return;
   status('Η δορυφορική υπηρεσία του '+year+' δεν απαντά. Παραμένει το υπόβαθρο Esri, χωρίς στοιχεία ιστορικής πληρότητας.',true);
   if(layer){map.removeLayer(layer);layer=null;}
  });
  layer.addTo(map);zoomStatus();
 }
 function activate(show){
  active=Boolean(show);
  $('satelliteYearBar').hidden=!active;
  if(active){
   if(!layer)selectYear(year);
   zoomStatus();
  }else if(layer){map.removeLayer(layer);layer=null;}
 }
 $('satelliteYear').onchange=()=>{compare=false;selectYear($('satelliteYear').value);};
 $('satelliteCompare').onclick=()=>{
  compare=!compare;selectYear(compare?2023:2025);
  $('satelliteCompare').textContent=compare?'⇆ Επιστροφή στο 2025':'⇆ Σύγκρινε με 2023';
 };
 $('satelliteYearDisable').onclick=()=>{
  if(layer){map.removeLayer(layer);layer=null;}
  $('satelliteYear').value=String(year);
  status('Υπόβαθρο Esri · η ημερομηνία λήψης δεν είναι διαθέσιμη. Πάτησε έτος για Sentinel-2.',true);
 };
 map.on('zoomend',zoomStatus);
 return {activate,selectYear,year:()=>year};
}
