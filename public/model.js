// Model v1: contextual Beta-Binomial with 45-day evidence half-life.
export const zones = [
 ['valaoritou','Βαλαωρίτου · Συγγρού',40.6391,22.9396,'nightlife'],['dioikitirio','Διοικητήριο',40.6420,22.9454,'center'],['romanforum','Ρωμαϊκή Αγορά',40.6389,22.9475,'center'],['agiasofias','Αγίας Σοφίας',40.6329,22.9479,'center'],['navarinou','Ναυαρίνου',40.6301,22.9498,'center'],['agdim','Αγίου Δημητρίου',40.6405,22.9495,'center'],['port','Λιμάνι · Προβλήτα',40.6330,22.9344,'mixed'],['emporiou','Πλατεία Εμπορίου',40.6364,22.9372,'center'],['venizelou','Βενιζέλου · Εγνατία',40.6386,22.9424,'center'],['tsimiski','Τσιμισκή',40.6318,22.9460,'center'],['aggelaki','Αγγελάκη · Σιντριβάνι',40.6303,22.9565,'mixed'],['museum','Αρχαιολογικό Μουσείο',40.6250,22.9544,'mixed'],['ladadika-east','Μητροπόλεως · Πλατεία Ελευθερίας',40.6340,22.9398,'center'],
 ['menemeni','Μενεμένη',40.658,22.899,'residential'],['evosmos','Εύοσμος',40.670,22.908,'residential'],['kordelio','Κορδελιό',40.669,22.894,'residential'],['ampelokipoi','Αμπελόκηποι',40.655,22.921,'residential'],['stavroupoli','Σταυρούπολη',40.669,22.938,'residential'],['polichni','Πολίχνη',40.667,22.950,'residential'],['neapoli','Νεάπολη',40.654,22.943,'residential'],['sykies','Συκιές',40.651,22.956,'residential'],['efkarpia','Ευκαρπία',40.689,22.954,'residential'],['oreokastro','Ωραιόκαστρο',40.730,22.917,'residential'],['sindos','Σίνδος',40.671,22.807,'residential'],['diavata','Διαβατά',40.688,22.857,'residential'],['station','Νέος Σιδηροδρομικός Σταθμός',40.644,22.930,'mixed'],['vardaris','Βαρδάρης',40.640,22.936,'mixed'],['ladadika','Λαδάδικα',40.635,22.936,'nightlife'],['center','Αριστοτέλους · Κέντρο',40.634,22.944,'center'],['rotonta','Ροτόντα · Καμάρα',40.634,22.953,'center'],['anopoli','Άνω Πόλη',40.642,22.956,'residential'],['universities','Πανεπιστήμια · ΔΕΘ',40.628,22.960,'mixed'],['white','Λευκός Πύργος',40.626,22.948,'center'],['faliro','Φάληρο',40.614,22.959,'residential'],['toumba','Τούμπα',40.613,22.977,'residential'],['charilaou','Χαριλάου',40.600,22.976,'residential'],['depo','Ντεπώ',40.597,22.963,'residential'],['kalamaria','Καλαμαριά',40.582,22.952,'mixed'],['pylaia','Πυλαία',40.600,22.999,'residential'],['panorama','Πανόραμα',40.587,23.034,'residential'],['thermi','Θέρμη',40.547,23.020,'residential'],['perea','Περαία',40.499,22.929,'mixed']
].map(([id,name,lat,lon,type])=>({id,name,lat,lon,type}));
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',weekday:'short',hour:'numeric',hourCycle:'h23'});
const contexts=new Map();
export function context(at=Date.now()) { const key=Math.floor(at/3600000);if(contexts.has(key))return contexts.get(key);const p=Object.fromEntries(formatter.formatToParts(new Date(at)).map(x=>[x.type,x.value]));const c={hour:+p.hour,weekend:['Sat','Sun'].includes(p.weekday)};if(contexts.size>10000)contexts.clear();contexts.set(key,c);return c; }
export function distance(a,b) { const r=Math.PI/180,dlat=(a.lat-b.lat)*r,dlon=(a.lon-b.lon)*r; return 6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2)); }
export function nearest(point) { return [...zones].sort((a,b)=>distance(a,point)-distance(b,point))[0]; }
export function predict(zoneId,events,at=Date.now(),now=Date.now()) {
 const zone=zones.find(z=>z.id===zoneId); if(!zone) throw Error('Unknown zone');
 const c=context(at); let success=0,weight=0,count=0;
 for(const e of events) {if(e.zone!==zoneId || e.at>now || e.at<now-180*86400000 || ![0,1].includes(e.outcome))continue; const ec=context(e.at); let delta=Math.abs(c.hour-ec.hour);delta=Math.min(delta,24-delta);if(ec.weekend!==c.weekend || delta>2)continue;const w=Math.pow(0.5,(now-e.at)/(45*86400000))*(delta===0?1:delta===1?.65:.3);weight+=w;success+=w*e.outcome;count++;}
 const p=(1+success)/(2+weight), sd=Math.sqrt(p*(1-p)/(3+weight));
 // Heuristic is deliberately a separate non-probabilistic cold-start indicator.
 const busy=(zone.type==='center'&&c.hour>=9&&c.hour<21)||(zone.type==='nightlife'&&c.hour>=19)||(zone.type==='residential'&&(c.hour>=19||c.hour<8));
 return {p,n:count,effective:weight,ready:weight>=12,low:Math.max(0,p-1.96*sd),high:Math.min(1,p+1.96*sd),difficulty:busy?'Αυξημένη':'Μέτρια',context:c};
}
export function metrics(events) {
 let sum=0,n=0;const buckets=new Map(),queue=[];
 function decay(bin,at){const f=Math.pow(.5,(at-bin.at)/(45*86400000));bin.w*=f;bin.s*=f;bin.at=at;}
 for(const e of [...events].sort((a,b)=>a.at-b.at)){
  const c=context(e.at);const prefix=e.zone+':'+c.weekend+':';
  while(queue.length&&queue[0].at<e.at-180*86400000){const old=queue.shift(),oc=context(old.at),key=old.zone+':'+oc.weekend+':'+oc.hour,bin=buckets.get(key);if(bin){decay(bin,e.at);const w=Math.pow(.5,(e.at-old.at)/(45*86400000));bin.w=Math.max(0,bin.w-w);bin.s=Math.max(0,bin.s-w*old.outcome);}}
  let weight=0,success=0;
  for(let d=-2;d<=2;d++){const hour=(c.hour+d+24)%24,bin=buckets.get(prefix+hour);if(!bin)continue;decay(bin,e.at);const hw=d===0?1:Math.abs(d)===1?.65:.3;weight+=hw*bin.w;success+=hw*bin.s;}
  if(weight>=12){const p=(1+success)/(2+weight);sum+=(p-e.outcome)**2;n++;}
  const key=prefix+c.hour;let bin=buckets.get(key);if(!bin){bin={at:e.at,w:0,s:0};buckets.set(key,bin);}else decay(bin,e.at);bin.w++;bin.s+=e.outcome;queue.push(e);
 }
 return {evaluated:n,brier:n?sum/n:null,baseline:n?.25:null};
}
export function mergeEvents(...groups){return [...new Map(groups.flat().map(e=>[e.id,e])).values()].sort((a,b)=>a.at-b.at).slice(-10000);}
export function predictTraffic(zoneId,events,at=Date.now(),now=Date.now()) {
 const c=context(at);const bins=[1,1,1];let weight=0,n=0;
 for(const e of events){if(e.zone!==zoneId||e.at>now||e.at<now-90*86400000||![0,1,2].includes(e.outcome))continue;const ec=context(e.at);let delta=Math.abs(c.hour-ec.hour);delta=Math.min(delta,24-delta);if(ec.weekend!==c.weekend||delta>2)continue;const w=Math.pow(.5,(now-e.at)/(14*86400000))*(delta===0?1:delta===1?.65:.3);bins[e.outcome]+=w;weight+=w;n++;}
 const probabilities=bins.map(v=>v/(3+weight));return {probabilities,n,effective:weight,ready:weight>=12,score:(probabilities[1]+2*probabilities[2])/2};
}
