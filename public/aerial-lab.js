import {zones} from './model.js';
import {extractImageFeatures,trainVisualModel,predictPatch,webMercatorTile,acquisitionDate,validSamples} from './aerial-ml.js';

const $=id=>document.getElementById(id);
const KEY='araxe-aerial-training-v1', WATCH='araxe-aerial-watch', LAST='araxe-aerial-last';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function store(key,value){localStorage.setItem(key,JSON.stringify(value));}
let samples=validSamples(read(KEY,[])),photo=null,mode=1,marks=[],model=trainVisualModel(samples),lastDiscovered=null,scanBusy=false;
const source=document.createElement('canvas'),view=$('aerialCanvas'),ctx=view.getContext('2d',{willReadFrequently:true}),raw=source.getContext('2d',{willReadFrequently:true});
function notice(msg){$('aerialMessage').textContent=msg;}
function status(){
 model=trainVisualModel(samples);
 const v=model.validation;
 $('aerialStats').textContent=`${model.n} επισημάνσεις · ${model.scenes} εικόνες · ${model.positive} οχήματα · ${model.negative} χωρίς όχημα`;
 $('aerialValidation').textContent=v?`Έλεγχος σε άλλη εικόνα (${v.n} δείγματα): Brier ${v.brier.toFixed(3)} · απλό baseline ${v.baseline.toFixed(3)} · ${v.passes?'καλύτερα από baseline':'δεν ξεπερνά baseline'}.`:'Δεν έχει ολοκληρωθεί ανεξάρτητος έλεγχος σε διαφορετική εικόνα.';
 $('aerialModelStatus').textContent=(model.ready?'Πειραματικό μοντέλο διαθέσιμο. ':'Μη επαληθευμένο μοντέλο. ')+model.reason;
 $('aerialPredict').disabled=!photo||!model.ready;
}
function redraw(){
 if(!photo)return;
 view.width=source.width;view.height=source.height;ctx.drawImage(source,0,0);
 for(const m of marks){ctx.beginPath();ctx.arc(m.x,m.y,Math.max(3,source.width/150),0,Math.PI*2);ctx.lineWidth=2;ctx.fillStyle=m.label===1?'#ed6551':m.label===0?'#4ea9d0':m.color;ctx.strokeStyle='#fff';ctx.fill();ctx.stroke();}
}
function setImage(img,meta){
 let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
 if(!w||!h)throw Error('Η εικόνα δεν διαβάζεται.');
 const scale=Math.min(1,1100/Math.max(w,h));w=Math.round(w*scale);h=Math.round(h*scale);
 if(w<64||h<64)throw Error('Η εικόνα έχει πολύ μικρή ανάλυση.');
 source.width=w;source.height=h;raw.clearRect(0,0,w,h);raw.drawImage(img,0,0,w,h);
 photo=meta;marks=[];view.hidden=false;
 $('aerialImageInfo').textContent=`${meta.provider} · ${meta.date||'άγνωστη ημερομηνία λήψης'} · ${w}×${h}px · ${meta.gsd?meta.gsd+' m/pixel':'χωρίς τεκμηριωμένη ανάλυση'}`;
 redraw();status();
}
function patch(x,y){
 const size=Math.min(40,source.width,source.height);
 const cx=Math.max(0,Math.min(source.width-size,Math.round(x-size/2)));
 const cy=Math.max(0,Math.min(source.height-size,Math.round(y-size/2)));
 return extractImageFeatures(raw.getImageData(cx,cy,size,size));
}
function labelAt(x,y){
 if(!photo)return;
 const features=patch(x,y),example={scene:photo.id,zone:photo.zone,date:photo.date,y:mode,x:features};
 const next=[...samples,example].slice(-1800);
 try{store(KEY,next);}catch{notice('Δεν αποθηκεύτηκε το δείγμα· η μνήμη της συσκευής είναι γεμάτη.');return;}
 samples=next;marks.push({x,y,label:mode});redraw();status();notice('Το πραγματικό τμήμα εικόνας προστέθηκε στα παραδείγματα του οπτικού μοντέλου.');
}
function analyze(show=true){
 if(!photo||!model.ready)return null;
 const cols=Math.max(3,Math.min(15,Math.floor(source.width/34))),rows=Math.max(3,Math.min(15,Math.floor(source.height/34)));
 const result=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const px=(x+.5)*source.width/cols,py=(y+.5)*source.height/rows,p=predictPatch(model.model,patch(px,py));
  result.push({x:px,y:py,p});
 }
 if(show){
  marks=[];redraw();
  for(const a of result){if(a.p<.65)continue;ctx.fillStyle=`rgba(231,85,69,${Math.min(.65,(a.p-.6)*1.1)})`;ctx.fillRect(a.x-source.width/cols/2,a.y-source.height/rows/2,source.width/cols,source.height/rows);}
  $('aerialImageInfo').textContent+= ' · χρωματισμένες περιοχές = υποψία οχήματος, όχι κενές θέσεις';
  notice('Η οπτική ταξινόμηση ολοκληρώθηκε. Τα χρώματα είναι πειραματικές ενδείξεις παρουσίας οχημάτων στην παλιά εικόνα, όχι σημερινή διαθεσιμότητα στάθμευσης.');
 }
 return {total:result.length,high:result.filter(x=>x.p>=.65).length,mean:result.reduce((s,x)=>s+x.p,0)/result.length};
}
async function chooseFile(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12_000_000)throw Error('Δέχομαι PNG, JPG ή WEBP έως 12 MB.');
 if(!$('aerialRights').checked)throw Error('Επιβεβαίωσε ότι επιτρέπεται η χρήση της εικόνας για εκπαίδευση.');
 const date=$('aerialDate').value;if(!date||date>new Date().toISOString().slice(0,10))throw Error('Συμπλήρωσε πραγματική ημερομηνία λήψης.');
 const sourceName=$('aerialSource').value.trim();if(sourceName.length<3)throw Error('Συμπλήρωσε πηγή/δημιουργό εικόνας.');
 const img=await createImageBitmap(file);
 try{setImage(img,{id:`file:${file.name}:${file.size}:${file.lastModified}`,provider:sourceName,date,zone:$('aerialZone').value,gsd:Number($('aerialGsd').value)||null});}
 finally{img.close();}
 notice('Κάνε κλικ στο κέντρο οχημάτων ή σε τμήματα χωρίς όχημα. Σήμανση δεν σημαίνει νόμιμη θέση.');
}
function intersects(feature,lat,lon){const b=feature?.bbox;return Array.isArray(b)&&b.length>=4&&lon>=b[0]&&lon<=b[2]&&lat>=b[1]&&lat<=b[3];}
async function discover(zoneId,quiet=false){
 const z=zones.find(x=>x.id===zoneId);if(!z)throw Error('Άγνωστη περιοχή');
 const bbox=[z.lon-.013,z.lat-.009,z.lon+.013,z.lat+.009].join(',');
 const url='https://api.imagery.hotosm.org/stac/search?bbox='+encodeURIComponent(bbox)+'&limit=30';
 const response=await fetch(url,{signal:AbortSignal.timeout(13000),headers:{Accept:'application/geo+json, application/json'}});
 if(!response.ok)throw Error('Ο κατάλογος OpenAerialMap δεν ανταποκρίνεται ('+response.status+').');
 const body=await response.json();const items=(Array.isArray(body.features)?body.features:[]).filter(f=>f.id&&intersects(f,z.lat,z.lon)&&acquisitionDate(f));
 items.sort((a,b)=>acquisitionDate(b).localeCompare(acquisitionDate(a)));
 const eligible=items.filter(f=>{const g=Number(f.properties?.gsd);return !Number.isFinite(g)||g<=.8;});
 if(!eligible.length){if(!quiet)notice('Δεν βρέθηκε επιβεβαιωμένα κατάλληλη ανοικτή αεροφωτογραφία που να καλύπτει το κέντρο αυτής της περιοχής. Ανέβασε εικόνα με δικαιώματα.');return null;}
 const latest=eligible[0];lastDiscovered={feature:latest,zone:z};
 if(!quiet)notice('Βρέθηκε εικόνα OpenAerialMap: '+acquisitionDate(latest)+'. Η ύπαρξή της δεν σημαίνει πραγματικό χρόνο.');
 return lastDiscovered;
}
async function loadOam(record,display=true){
 if(!record)return;
 const {feature,zone}=record,gsd=Number(feature.properties?.gsd);
 if(Number.isFinite(gsd)&&gsd>.8)throw Error('Η χωρική ανάλυση δεν αρκεί για μικρά οχήματα.');
 const {z,x,y}=webMercatorTile(zone.lat,zone.lon,19);
 const link=`https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/${encodeURIComponent(feature.id)}/tiles/WebMercatorQuad/${z}/${x}/${y}?assets=visual&nodata=0`;
 const img=new Image();img.crossOrigin='anonymous';img.src=link;
 await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Η συγκεκριμένη ορθοφωτογραφία δεν μπορεί να φορτωθεί στο κέντρο της περιοχής.'));});
 if(display)setImage(img,{id:'oam:'+feature.id+':'+z+'/'+x+'/'+y,provider:'OpenAerialMap · '+(feature.properties?.providers?.[0]?.name||'OIN'),date:acquisitionDate(feature),zone:zone.id,gsd:Number.isFinite(gsd)&&gsd>0?gsd:null});
 return {id:feature.id,date:acquisitionDate(feature)};
}
async function autoCheck(){
 if(!read(WATCH,false)||scanBusy||!model.ready)return;
 scanBusy=true;try{
  const zoneId=$('aerialZone').value||'menemeni',found=await discover(zoneId,true);if(!found)return;
  const stamp=zoneId+':'+found.feature.id,previous=read(LAST,null);
  if(previous?.stamp===stamp)return;
  await loadOam(found,true);const visual=analyze(false);
  store(LAST,{stamp,zone:zoneId,date:acquisitionDate(found.feature),at:Date.now(),visual});
  notice('Νέα αρχειακή αεροφωτογραφία αναλύθηκε κατά την παραμονή σου στην εφαρμογή. Η ένδειξη αφορά την ημερομηνία λήψης.');
 }catch(e){notice('Αυτόματος οπτικός έλεγχος: '+e.message);}
 finally{scanBusy=false;displayLast();}
}
function displayLast(){const latest=read(LAST,null);$('aerialLast').textContent=latest?`Τελευταία αυτόματη ανάλυση: ${latest.date||'χωρίς ημερομηνία'} · περιοχή ${latest.zone} · ${latest.visual?.high||0} από ${latest.visual?.total||0} τμήματα με πιθανή παρουσία οχήματος (μη επαληθευμένο).`:'Δεν έχει πραγματοποιηθεί αυτόματη ανάλυση νέας εικόνας.';}
export function openAerialLab(zoneId=null){
 if(!$('aerialLab'))return;
 $('aerialZone').value=zones.some(z=>z.id===(window.araxeSelectedArea||''))?window.araxeSelectedArea:'menemeni';
 displayLast();status();$('aerialLab').showModal();
}
export function setupAerialLab(){
 const z=$('aerialZone');z.innerHTML=zones.map(v=>`<option value="${safe(v.id)}">${safe(v.name)}</option>`).join('');
 $('aerialDate').max=new Date().toISOString().slice(0,10);
 $('aerialPositive').onclick=()=>{mode=1;$('aerialPositive').classList.add('chosen');$('aerialNegative').classList.remove('chosen');};
 $('aerialNegative').onclick=()=>{mode=0;$('aerialNegative').classList.add('chosen');$('aerialPositive').classList.remove('chosen');};
 view.onclick=ev=>{const rect=view.getBoundingClientRect(),x=(ev.clientX-rect.left)*view.width/rect.width,y=(ev.clientY-rect.top)*view.height/rect.height;labelAt(x,y);};
 $('aerialUpload').onchange=async ev=>{try{await chooseFile(ev.target.files[0]);}catch(e){notice(e.message);}};
 $('aerialDiscover').onclick=async()=>{try{notice('Αναζήτηση εικόνων OpenAerialMap…');const found=await discover(z.value);if(found)await loadOam(found);}catch(e){notice(e.message);}};
 $('aerialPredict').onclick=()=>analyze(true);
 $('aerialWatch').checked=read(WATCH,false);
 $('aerialWatch').onchange=e=>{store(WATCH,e.target.checked);notice(e.target.checked?'Ο έλεγχος γίνεται ανά 6 ώρες όσο η εφαρμογή παραμένει ανοιχτή. Δεν εκτελείται όταν κλείσεις τον browser.':'Ο περιοδικός έλεγχος απενεργοποιήθηκε.');if(e.target.checked)autoCheck();};
 $('aerialExport').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,samples},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='araxe-aerial-training.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('aerialImport').onchange=async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>5_000_000)throw Error('Το αντίγραφο είναι πολύ μεγάλο.');const obj=JSON.parse(await f.text());if(obj.version!==1||!Array.isArray(obj.samples)||obj.samples.length>2000||validSamples(obj.samples).length!==obj.samples.length)throw Error('Μη έγκυρο αρχείο εκπαίδευσης.');samples=[...samples,...obj.samples].slice(-1800);store(KEY,samples);status();notice('Εισήχθησαν δείγματα οπτικής εκπαίδευσης, χωρίς να μεταφορτωθούν εικόνες.');}catch(err){notice(err.message);}};
 displayLast();status();
 // A background watcher only runs while this page is open, never as a server job.
 setInterval(()=>{if(read(WATCH,false))autoCheck();},6*3600000);
 if(read(WATCH,false))setTimeout(autoCheck,12000);
}
