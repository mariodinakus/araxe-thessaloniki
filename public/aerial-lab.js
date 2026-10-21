import {zones} from './model.js';
import {SLOT_KEY,SCAN_KEY,APPEARANCE_KEY,sampleCurbCandidates,validCurbLabels,classifyHistoricalCurb,groupCurbHistory,compareDatedAppearance,pixelForCoordinate} from './satellite-slots.js';
import {extractImageFeatures,trainVisualModel,predictPatch,webMercatorTile,acquisitionDate,validSamples,updateSceneProfile} from './aerial-ml.js';

const $=id=>document.getElementById(id);
const KEY='araxe-aerial-training-v1', WATCH='araxe-aerial-watch', LAST='araxe-aerial-last', SCENE='araxe-aerial-scenes-v1';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function store(key,value){localStorage.setItem(key,JSON.stringify(value));}
let samples=validSamples(read(KEY,[])),photo=null,mode=1,marks=[],model=trainVisualModel(samples),lastDiscovered=null,scanBusy=false;
let curbLabels=validCurbLabels(read(SLOT_KEY,[])),curbModel=trainVisualModel(curbLabels),curbScans=read(SCAN_KEY,[]),
curbCandidates=[],curbMode=1,curbTraining=true,archive=[],imageRequest=0;
const source=document.createElement('canvas'),view=$('aerialCanvas'),ctx=view.getContext('2d',{willReadFrequently:true}),raw=source.getContext('2d',{willReadFrequently:true});
function notice(msg){$('aerialMessage').textContent=msg;}
function status(){
 model=trainVisualModel(samples);
 const v=model.validation;
 $('aerialStats').textContent=`${model.n} επισημάνσεις · ${model.scenes} εικόνες · ${model.positive} οχήματα · ${model.negative} χωρίς όχημα`;
 $('aerialValidation').textContent=v?`Έλεγχος σε άλλη εικόνα (${v.n} δείγματα): Brier ${v.brier.toFixed(3)} · απλό baseline ${v.baseline.toFixed(3)} · ${v.passes?'καλύτερα από baseline':'δεν ξεπερνά baseline'}.`:'Δεν έχει ολοκληρωθεί ανεξάρτητος έλεγχος σε διαφορετική εικόνα.';
 $('aerialModelStatus').textContent=(model.ready?'Πειραματικό μοντέλο διαθέσιμο. ':'Μη επαληθευμένο μοντέλο. ')+model.reason;
 $('aerialPredict').disabled=!photo||!model.ready;
 curbStatus();
}
function redraw(){
 if(!photo)return;
 view.width=source.width;view.height=source.height;ctx.drawImage(source,0,0);
 for(const p of curbCandidates){
  ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);
  ctx.fillStyle=p.label===1?'rgba(41,166,101,.95)':p.label===0?'rgba(218,77,76,.95)':'rgba(247,219,74,.75)';
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();
 }
 for(const m of marks){ctx.beginPath();ctx.arc(m.x,m.y,Math.max(3,source.width/150),0,Math.PI*2);ctx.lineWidth=2;ctx.fillStyle=m.label===1?'#ed6551':m.label===0?'#4ea9d0':m.color;ctx.strokeStyle='#fff';ctx.fill();ctx.stroke();}
}
function observeScene(meta){
 try{
  const all=read(SCENE,{}),previous=all[meta.zone]||null;
  const features=extractImageFeatures(raw.getImageData(0,0,source.width,source.height));
  const result=updateSceneProfile(previous,features,meta.id);
  if(result.observed){all[meta.zone]=result.profile;store(SCENE,all);}
  const count=result.profile?.n||0;
  $('aerialSceneStatus').textContent='Αυτοεκπαίδευση οπτικού υποβάθρου: '+count+' διαφορετικές λήψεις στην περιοχή'+(Number.isFinite(result.novelty)?' · δείκτης οπτικής διαφοράς '+result.novelty.toFixed(3):'')+'. Δεν υπολογίζει κενές θέσεις.';
 }catch(err){$('aerialSceneStatus').textContent='Η ανάλυση οπτικού υποβάθρου δεν ήταν δυνατή: '+err.message;}
}
function setImage(img,meta){
 let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
 if(!w||!h)throw Error('Η εικόνα δεν διαβάζεται.');
 const scale=Math.min(1,1100/Math.max(w,h));w=Math.round(w*scale);h=Math.round(h*scale);
 if(w<64||h<64)throw Error('Η εικόνα έχει πολύ μικρή ανάλυση.');
 source.width=w;source.height=h;raw.clearRect(0,0,w,h);raw.drawImage(img,0,0,w,h);
 photo=meta;marks=[];curbCandidates=[];view.hidden=false;
 $('aerialImageInfo').textContent=`${meta.provider} · ${meta.date||'άγνωστη ημερομηνία λήψης'} · ${w}×${h}px · ${meta.gsd?meta.gsd+' m/pixel':'χωρίς τεκμηριωμένη ανάλυση'}`;
 redraw();status();observeScene(meta);
 if(meta.geo)loadCurbCandidates(meta).catch(e=>notice('Γεωμετρία δρόμων: '+e.message));
}
function patch(x,y){
 const size=Math.min(40,source.width,source.height);
 const cx=Math.max(0,Math.min(source.width-size,Math.round(x-size/2)));
 const cy=Math.max(0,Math.min(source.height-size,Math.round(y-size/2)));
 return extractImageFeatures(raw.getImageData(cx,cy,size,size));
}
function curbStatus(){
 curbModel=trainVisualModel(curbLabels);
 const unique=[...new Set(curbLabels.map(x=>x.scene))].length;
 const scanned=Array.isArray(curbScans)?curbScans:[],historic=groupCurbHistory(scanned),appearance=compareDatedAppearance(read(APPEARANCE_KEY,[]));
 $('curbStats').textContent=`${curbCandidates.length} υποψήφια σημεία κοντά σε δρόμους · ${curbLabels.length} επισημάνσεις σε ${unique} ιστορικές λήψεις · ${scanned.length} σαρωμένες λήψεις · ${historic.filter(x=>x.changeEvidence!==null).length} συγκρίσιμες ταξινομήσεις · ${appearance.length} σημεία με οπτική σύγκριση διαφορετικών παλιών ημερομηνιών. ${curbModel.ready?'Το εκπαιδευμένο μοντέλο ξεπέρασε το baseline σε ανεξάρτητη λήψη.':'Χρειάζεται εκπαίδευση από ≥3 διαφορετικές εικόνες με οχήματα και οπτικά κενά.'}`;
 $('curbScan').disabled=!curbModel.ready||!photo?.geo||!curbCandidates.length;
 $('curbScanArchive').disabled=!curbModel.ready||archive.length<2;
}
async function loadCurbCandidates(meta){
 const seq=++imageRequest,resp=await fetch('/api/streets?zone='+encodeURIComponent(meta.zone));
 if(!resp.ok)throw Error('Δεν φόρτωσαν οι δρόμοι');
 const body=await resp.json();
 if(seq!==imageRequest||photo?.id!==meta.id)return;
 curbCandidates=sampleCurbCandidates(body.roads||[],meta.geo,{width:source.width,height:source.height,limit:220})
   .filter(p=>!meta.availableTiles||meta.availableTiles.has(Math.floor(p.x/256)+':'+Math.floor(p.y/256)));
 recordHistoricAppearance(meta);
 redraw();curbStatus();
 notice(curbCandidates.length?`Βρέθηκαν ${curbCandidates.length} γεωαναφερμένα υποψήφια τμήματα δίπλα σε δρόμους. Κάνε κλικ σε κίτρινο σημείο για πραγματική ετικέτα σε ιστορική λήψη.`:'Δεν εντοπίστηκαν διαθέσιμα τμήματα δρόμων μέσα στα εικονοστοιχεία αυτής της λήψης.');
}
function recordHistoricAppearance(meta){
 if(!meta?.geo||!meta.licenseVerified||!meta.date||!curbCandidates.length)return;
 try{
  const current=read(APPEARANCE_KEY,[]),patches=curbCandidates.slice(0,120).map(p=>{
   const features=extractCurbFeatures(p);
   return features?{roadId:p.roadId,roadName:p.roadName,lat:p.lat,lon:p.lon,features:features.map(x=>+x.toFixed(3))}:null;
  }).filter(Boolean);
  if(!patches.length)return;
  const revised=[...current.filter(x=>x.scene!==meta.id),{scene:meta.id,date:meta.date,zone:meta.zone,patches}].slice(-8);
  store(APPEARANCE_KEY,revised);
 }catch(e){notice('Τοπική αποθήκευση ιστορικής σύγκρισης: '+e.message);}
}
function labelCurbAt(x,y){
 if(!photo?.geo||!photo.date)return notice('Η εκπαίδευση θέσεων απαιτεί ιστορική γεωαναφερμένη εικόνα με ημερομηνία.');
 const choice=curbCandidates.map(p=>({p,d:Math.hypot(p.x-x,p.y-y)})).sort((a,b)=>a.d-b.d)[0];
 if(!choice||choice.d>18)return notice('Πάτησε σε κίτρινο κύκλο δίπλα στον δρόμο, όχι σε τυχαίο σημείο της φωτογραφίας.');
 const p=choice.p,pixels=patch(p.x,p.y);
 const item={scene:photo.id,date:photo.date,zone:photo.zone,y:curbMode,x:pixels,lat:p.lat,lon:p.lon};
 curbLabels=[...curbLabels.filter(x=>!(x.scene===item.scene&&Math.hypot((x.lat-p.lat)*111195,(x.lon-p.lon)*85000)<2)),item].slice(-1800);
 try{store(SLOT_KEY,curbLabels);}catch(e){notice('Δεν αποθηκεύτηκαν τα δεδομένα: '+e.message);return;}
 p.label=curbMode;redraw();curbStatus();
 notice(curbMode?'Επισημάνθηκε οπτικά κενό δίπλα στον δρόμο, χωρίς επιβεβαίωση νομιμότητας.':'Επισημάνθηκε παρκαρισμένο όχημα στην ιστορική λήψη.');
}
function extractCurbFeatures(p){
 const size=40,cx=Math.max(0,Math.min(source.width-size,Math.round(p.x-size/2))),
 cy=Math.max(0,Math.min(source.height-size,Math.round(p.y-size/2)));
 const pixels=raw.getImageData(cx,cy,size,size);
 let opaque=0;
 for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]>=245)opaque++;
 return opaque>=size*size*.96?extractImageFeatures(pixels):null;
}
function analyzeCurbs(){
 if(!photo?.geo||!curbCandidates.length)return notice('Δεν υπάρχουν γεωαναφερμένα δείγματα δρόμων σε αυτή την εικόνα.');
 const result=classifyHistoricalCurb(curbCandidates,extractCurbFeatures,
  {...curbModel,predict:vec=>predictPatch(curbModel.model,vec)},
  {scene:photo.id,zone:photo.zone,date:photo.date,gsd:photo.gsd,licensesVerified:photo.licenseVerified});
 if(!result.enabled)return notice(result.reason);
 const others=(Array.isArray(curbScans)?curbScans:[]).filter(s=>s.zone!==photo.zone||s.scene!==photo.id);
 curbScans=[...others,{zone:photo.zone,date:photo.date,scene:photo.id,provider:photo.provider,items:result.items}].slice(-12);
 try{store(SCAN_KEY,curbScans);}catch(e){return notice('Δεν αποθηκεύτηκε η ανάλυση: '+e.message);}
 redraw();
 for(const item of result.items){
  const p=pixelForCoordinate(item.lat,item.lon,photo.geo);
  if(!p)continue;
  ctx.beginPath();ctx.arc(p.x,p.y,5.4,0,Math.PI*2);
  ctx.fillStyle=item.probabilityClear>=.8?'#27a76b':item.probabilityClear<=.2?'#ce5a4a':'#d9b14b';
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();
 }
 const byRoad=new Map();
 for(const it of result.items){const g=byRoad.get(it.roadName)||{n:0,clear:0};g.n++;if(it.probabilityClear>=.8)g.clear++;byRoad.set(it.roadName,g);}
 const roadRows=[...byRoad].sort((a,b)=>b[1].clear-a[1].clear).slice(0,7);
 $('curbResult').innerHTML='<strong>Ιστορική λήψη '+safe(photo.date)+' · '+result.clearCandidates+' πιθανά οπτικά κενά / '+result.items.length+' σημεία</strong><p>Όχι ζωντανή διαθεσιμότητα. Όχι επαλήθευση νόμιμων θέσεων.</p>'
  +roadRows.map(([name,v])=>'<div>'+safe(name)+' · '+v.clear+'/'+v.n+' οπτικά πιθανά κενά</div>').join('');
 curbStatus();
 notice('Η γεωαναφερμένη εικόνα εξετάστηκε. Πράσινοι κύκλοι = μοντέλο πιθανού οπτικού κενού στην ΗΜΕΡΟΜΗΝΙΑ ΛΗΨΗΣ, όχι σήμερα.');
}
async function scanHistoricArchive(){
 if(!curbModel.ready)return notice('Πρώτα απαιτείται επαληθευμένη εκπαίδευση σε ανεξάρτητες ιστορικές λήψεις.');
 const scenes=archive.slice(0,5),initial=$('curbScanArchive');
 initial.disabled=true;let total=0,completed=0;
 try{
  for(const f of scenes){
   notice('Σύγκριση ιστορικών λήψεων: '+(completed+1)+'/'+scenes.length);
   try{await loadOam({feature:f,zone:zones.find(x=>x.id===$('aerialZone').value)},true);
    if(!photo?.geo)continue;
    await loadCurbCandidates(photo);analyzeCurbs();completed++;total+=curbScans.at(-1)?.items?.length||0;
   }catch(e){notice('Παράλειψη λήψης: '+e.message);}
  }
  notice('Εξετάστηκαν '+completed+' ιστορικές λήψεις. Η σύγκριση αφορά παλιές εικόνες, όχι ελεύθερες θέσεις τώρα.');
 }finally{curbStatus();}
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
 const eligible=items.filter(f=>{
  const g=Number(f.properties?.gsd),license=String(f.properties?.license||f.properties?.['oam:license']||'CC-BY-4.0').toUpperCase();
  return Number.isFinite(g)&&g>0&&g<=.5&&['CC-BY-4.0','CC-BY-SA-4.0','CC-BY'].includes(license);
 });
 archive=eligible.sort((a,b)=>{
  const plat=x=>x.properties?.['oam:platform_type']==='satellite'?1:0;
  return plat(b)-plat(a)||acquisitionDate(b).localeCompare(acquisitionDate(a));
 }).slice(0,12);
 $('curbScenes').innerHTML=archive.length?archive.map((f,i)=>'<option value="'+i+'">'+safe(acquisitionDate(f))+' · '+safe(String(f.properties?.gsd))+' m/pixel · '+safe(f.properties?.['oam:platform_type']==='satellite'?'ΔΟΡΥΦΟΡΟΣ':'εναέρια λήψη')+' · '+safe(f.id)+'</option>').join(''):'<option value="">Καμία επαρκώς λεπτομερής και αδειοδοτημένη λήψη</option>';
 curbStatus();
 if(!eligible.length){if(!quiet)notice('Δεν βρέθηκε διαθέσιμη παλιά δορυφορική ή εναέρια λήψη με ανάλυση ≤0,5 m/pixel και άδεια χρήσης για αυτή την περιοχή. Δεν μπορούν να υπολογιστούν κενά από τα συνήθη δημόσια δορυφορικά δεδομένα.');return null;}
 const latest=eligible[0];lastDiscovered={feature:latest,zone:z};
 if(!quiet)notice('Βρέθηκε εικόνα OpenAerialMap: '+acquisitionDate(latest)+'. Η ύπαρξή της δεν σημαίνει πραγματικό χρόνο.');
 return lastDiscovered;
}
async function loadOam(record,display=true){
 if(!record)return null;
 const {feature,zone}=record;
 if(!feature||!zone)throw Error('Άγνωστη λήψη / περιοχή');
 const gsd=Number(feature.properties?.gsd);
 if(!Number.isFinite(gsd)||gsd<=0||gsd>.5)throw Error('Δεν επαρκεί η τεκμηριωμένη χωρική ανάλυση για υποψήφια κενά');
 const date=acquisitionDate(feature);
 if(!date)throw Error('Δεν είναι γνωστή η ημερομηνία λήψης');
 const center=webMercatorTile(zone.lat,zone.lon,19),tileX=center.x-1,tileY=center.y-1;
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;
 const context=canvas.getContext('2d',{willReadFrequently:true}),loaded=new Set();
 const jobs=[];
 for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
  const url=`https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/${encodeURIComponent(feature.id)}/tiles/WebMercatorQuad/19/${tileX+dx}/${tileY+dy}?assets=visual&nodata=0`;
  jobs.push(new Promise(resolve=>{
   const im=new Image();im.crossOrigin='anonymous';
   im.onload=()=>resolve({dx,dy,im});im.onerror=()=>resolve(null);im.src=url;
  }));
 }
 const results=await Promise.all(jobs);
 for(const r of results)if(r){context.drawImage(r.im,r.dx*256,r.dy*256,256,256);loaded.add(r.dx+':'+r.dy);}
 if(!loaded.has('1:1'))throw Error('Δεν καλύπτεται με πραγματική εικόνα το κέντρο της περιοχής.');
 if(display){
  setImage(canvas,{id:'oam:'+feature.id+':19/'+center.x+'/'+center.y,provider:'OpenAerialMap · '+(feature.properties?.['oam:platform_type']==='satellite'?'Δορυφορική':'Εναέρια')+' · '+(feature.properties?.['oam:producer_name']||feature.providers?.[0]?.name||'Open Imagery Network')+' · '+(feature.properties?.license||'CC-BY-4.0'),
   date,zone:zone.id,gsd,geo:{z:19,tileX,tileY},availableTiles:loaded,licenseVerified:true});
 }
 return {id:feature.id,date,tiles:loaded.size};
}
async function autoCheck(){
 if(!read(WATCH,false)||scanBusy||!(model.ready||curbModel.ready))return;
 scanBusy=true;try{
  const zoneId=$('aerialZone').value||'menemeni',found=await discover(zoneId,true);if(!found)return;
  const stamp=zoneId+':'+found.feature.id,previous=read(LAST,null);
  if(previous?.stamp===stamp)return;
  await loadOam(found,true);if(photo?.geo&&curbModel.ready){await loadCurbCandidates(photo);analyzeCurbs();}const visual=model.ready?analyze(false):null;
  store(LAST,{stamp,zone:zoneId,date:acquisitionDate(found.feature),at:Date.now(),visual});
  notice('Νέα αρχειακή αεροφωτογραφία αναλύθηκε κατά την παραμονή σου στην εφαρμογή. Η ένδειξη αφορά την ημερομηνία λήψης.');
 }catch(e){notice('Αυτόματος οπτικός έλεγχος: '+e.message);}
 finally{scanBusy=false;displayLast();}
}
function displayLast(){const latest=read(LAST,null);$('aerialLast').textContent=latest?`Τελευταία αυτόματη ανάλυση: ${latest.date||'χωρίς ημερομηνία'} · περιοχή ${latest.zone} · ${latest.visual?.high||0} από ${latest.visual?.total||0} τμήματα με πιθανή παρουσία οχήματος (μη επαληθευμένο).`:'Δεν έχει πραγματοποιηθεί αυτόματη ανάλυση νέας εικόνας.';}
export function openAerialLab(zoneId=null){
 if(!$('aerialLab'))return;
 $('aerialZone').value=zones.some(z=>z.id===zoneId)?zoneId:'menemeni';
 displayLast();status();$('aerialSceneStatus').textContent='Η αυτοεκπαίδευση οπτικού υποβάθρου ξεκινά όταν φορτώσεις εικόνα.';$('aerialLab').showModal();
 const activeZone=$('aerialZone').value;
 notice('Αναζητώ αυτόματα κατάλληλες δορυφορικές / εναέριες λήψεις OpenAerialMap για '+zones.find(z=>z.id===activeZone)?.name+'…');
 discover(activeZone).then(result=>{
  if(result&&$('aerialLab').open&&$('aerialZone').value===activeZone)return loadOam(result);
 }).catch(e=>notice('Δεν φορτώθηκε αυτόματα εξωτερική λήψη: '+e.message+'. Ο ανοικτός χάρτης εξακολουθεί να είναι διαθέσιμος.'));
}
export function setupAerialLab(){
 const z=$('aerialZone');z.innerHTML=zones.map(v=>`<option value="${safe(v.id)}">${safe(v.name)}</option>`).join('');
 $('aerialDate').max=new Date().toISOString().slice(0,10);
 $('aerialPositive').onclick=()=>{curbTraining=false;mode=1;$('aerialPositive').classList.add('chosen');$('aerialNegative').classList.remove('chosen');};
 $('aerialNegative').onclick=()=>{curbTraining=false;mode=0;$('aerialNegative').classList.add('chosen');$('aerialPositive').classList.remove('chosen');};
 view.onclick=ev=>{const rect=view.getBoundingClientRect(),x=(ev.clientX-rect.left)*view.width/rect.width,y=(ev.clientY-rect.top)*view.height/rect.height;if(curbTraining)labelCurbAt(x,y);else labelAt(x,y);};
 $('aerialUpload').onchange=async ev=>{try{await chooseFile(ev.target.files[0]);}catch(e){notice(e.message);}};
 $('aerialDiscover').onclick=async()=>{try{notice('Αναζήτηση εικόνων OpenAerialMap…');const found=await discover(z.value);if(found)await loadOam(found);}catch(e){notice(e.message);}};
 $('aerialPredict').onclick=()=>analyze(true);
 $('curbClear').onclick=()=>{curbTraining=true;curbMode=1;$('curbClear').classList.add('chosen');$('curbOccupied').classList.remove('chosen');};
 $('curbOccupied').onclick=()=>{curbTraining=true;curbMode=0;$('curbOccupied').classList.add('chosen');$('curbClear').classList.remove('chosen');};
 $('curbLoad').onclick=async()=>{const i=Number($('curbScenes').value);if(!archive[i])return notice('Δεν υπάρχει διαθέσιμη λήψη.');try{await loadOam({feature:archive[i],zone:zones.find(a=>a.id===z.value)});}catch(e){notice(e.message);}};
 $('curbScan').onclick=analyzeCurbs;
 $('curbScanArchive').onclick=scanHistoricArchive;

 $('aerialWatch').checked=read(WATCH,false);
 $('aerialWatch').onchange=e=>{store(WATCH,e.target.checked);notice(e.target.checked?'Ο έλεγχος γίνεται ανά 6 ώρες όσο η εφαρμογή παραμένει ανοιχτή. Δεν εκτελείται όταν κλείσεις τον browser.':'Ο περιοδικός έλεγχος απενεργοποιήθηκε.');if(e.target.checked)autoCheck();};
 $('aerialExport').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,samples},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='araxe-aerial-training.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('aerialImport').onchange=async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>5_000_000)throw Error('Το αντίγραφο είναι πολύ μεγάλο.');const obj=JSON.parse(await f.text());if(obj.version!==1||!Array.isArray(obj.samples)||obj.samples.length>2000||validSamples(obj.samples).length!==obj.samples.length)throw Error('Μη έγκυρο αρχείο εκπαίδευσης.');samples=[...samples,...obj.samples].slice(-1800);store(KEY,samples);status();notice('Εισήχθησαν δείγματα οπτικής εκπαίδευσης, χωρίς να μεταφορτωθούν εικόνες.');}catch(err){notice(err.message);}};
 displayLast();status();
 // A background watcher only runs while this page is open, never as a server job.
 setInterval(()=>{if(read(WATCH,false))autoCheck();},6*3600000);
 if(read(WATCH,false))setTimeout(autoCheck,12000);
}
