import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {zones,context} from './public/model.js';
const root=path.dirname(fileURLToPath(import.meta.url));const data=process.env.DATA_DIR||path.join(root,'data');await mkdir(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'learning.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, zone TEXT NOT NULL, outcome INTEGER NOT NULL, at INTEGER NOT NULL, client TEXT NOT NULL); CREATE INDEX IF NOT EXISTS by_time ON observations(at);');
db.exec('CREATE TABLE IF NOT EXISTS traffic (id TEXT PRIMARY KEY, zone TEXT NOT NULL, outcome INTEGER NOT NULL, at INTEGER NOT NULL, client TEXT NOT NULL)');
const roadCache=new Map();
async function streets(zone){const z=zones.find(x=>x.id===zone);if(!z)throw Error('Unknown zone');const cached=roadCache.get(zone);if(cached&&Date.now()-cached.at<86400000)return cached;const box=[z.lat-.009,z.lon-.013,z.lat+.009,z.lon+.013].join(',');const query='[out:json][timeout:30];way[highway~"^(residential|tertiary|secondary|primary|unclassified|living_street)$"]('+box+');out geom tags;';for(const host of ['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.osm.jp/api/interpreter']){try{const res=await fetch(host,{method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(35000)});if(!res.ok)continue;const raw=await res.json();const result={at:Date.now(),roads:raw.elements.filter(e=>e.geometry?.length>1).map(e=>({id:e.id,name:e.tags?.name||'Οδός χωρίς καταγεγραμμένο όνομα',highway:e.tags.highway,geometry:e.geometry.map(p=>[p.lat,p.lon]),parking:e.tags?.['parking:both']||e.tags?.['parking:both:restriction']||null}))};roadCache.set(zone,result);return result;}catch{}}return {at:null,roads:[],status:'unavailable'};}
let parking={items:[],fetchedAt:null,status:'unavailable'},inflight;
try{parking=JSON.parse(await readFile(path.join(data,'parking.json'),'utf8'));}catch{}
async function refreshParking(){if(inflight)return inflight;inflight=(async()=>{let last;for(const host of ['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.osm.jp/api/interpreter']){try{const query='[out:json][timeout:45];nwr[amenity=parking](40.48,22.78,40.76,23.15);out center tags;';const res=await fetch(host,{method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(55000),headers:{'User-Agent':'AraxeThessaloniki/1.0'}});if(!res.ok)throw Error('upstream '+res.status);const json=await res.json();if(!Array.isArray(json.elements))throw Error('invalid source');parking={items:json.elements.map(e=>({id:e.type+'/'+e.id,lat:e.lat??e.center?.lat,lon:e.lon??e.center?.lon,name:e.tags?.name||'Χώρος στάθμευσης',access:e.tags?.access||'unknown',fee:e.tags?.fee||'unknown',capacity:e.tags?.capacity||null,wheelchair:e.tags?.['capacity:disabled']||null,kind:e.tags?.parking||'unknown',hours:e.tags?.opening_hours||null})).filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)),fetchedAt:Date.now(),status:'ok'};await writeFile(path.join(data,'parking.json'),JSON.stringify(parking));return;}catch(e){last=e.message;console.error('Parking source unavailable',host,e.message,e.cause?.code||'');}}parking={...parking,status:parking.items.length?'stale':'unavailable',error:last};})().finally(()=>inflight=null);return inflight;}
function reply(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
const limits=new Map();
export const server=http.createServer(async(req,res)=>{try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','geolocation=(self), camera=(), microphone=()');
const url=new URL(req.url,'http://localhost');
if(url.pathname==='/api/health')return reply(res,200,{ok:true});
if(url.pathname==='/api/parking'&&req.method==='GET'){if(!parking.fetchedAt||Date.now()-parking.fetchedAt>6*3600000)refreshParking();return reply(res,200,parking);}
if(url.pathname==='/api/streets'&&req.method==='GET'){const zone=url.searchParams.get('zone');if(!zones.some(z=>z.id===zone))return reply(res,400,{error:'Unknown area'});return reply(res,200,await streets(zone));}
if(url.pathname==='/api/model'&&req.method==='GET'){const events=db.prepare('SELECT id,zone,outcome,at FROM observations WHERE at>? ORDER BY at LIMIT 10000').all(Date.now()-180*86400000);const traffic=db.prepare('SELECT id,zone,outcome,at FROM traffic WHERE at>? ORDER BY at LIMIT 10000').all(Date.now()-180*86400000);return reply(res,200,{events,traffic,persistent:Boolean(process.env.DATA_DIR),version:'contextual-beta-v1',updatedAt:events.at(-1)?.at||null});}
if(url.pathname==='/api/feedback'&&req.method==='POST'){
 if(req.headers['sec-fetch-site']==='cross-site')return reply(res,403,{error:'Cross-site request rejected'});
 const address=req.socket.remoteAddress||'local';const now=Date.now();const entry=limits.get(address)||{count:0,until:now+60000};if(entry.until<now){entry.count=0;entry.until=now+60000;}if(++entry.count>20)return reply(res,429,{error:'Πολλές αναφορές. Δοκίμασε σε ένα λεπτό.'});limits.set(address,entry);if(limits.size>10000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);
 let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return reply(res,413,{error:'Too large'});}let b;try{b=JSON.parse(body);}catch{return reply(res,400,{error:'Invalid JSON'});}
 const table=b.kind==='traffic'?'traffic':'observations';
 if(!zones.some(z=>z.id===b.zone)||!(table==='traffic'?[0,1,2]:[0,1]).includes(b.outcome)||typeof b.client!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(b.client))return reply(res,400,{error:'Invalid observation'});
 const client=createHash('sha256').update(b.client).digest('hex');if(db.prepare('SELECT id FROM '+table+' WHERE client=? AND at>?').get(client,now-10*60000))return reply(res,429,{error:'Μία αναφορά ανά 10 λεπτά.'});
 const event={id:randomUUID(),zone:b.zone,outcome:b.outcome,at:now};db.prepare('INSERT INTO '+table+' VALUES (?,?,?,?,?)').run(event.id,event.zone,event.outcome,event.at,client);db.prepare('DELETE FROM '+table+' WHERE at<?').run(now-180*86400000);return reply(res,201,event);
}
if(url.pathname.startsWith('/api/'))return reply(res,404,{error:'Not found'});
if(req.method!=='GET'&&req.method!=='HEAD')return reply(res,405,{error:'Method not allowed'});
const pathname=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);const file=path.resolve(root,'public',pathname);if(!file.startsWith(path.join(root,'public')+path.sep))return reply(res,403,{error:'Forbidden'});
try{const content=await readFile(file);const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':pathname==='sw.js'?'no-cache':'public, max-age=60'});res.end(req.method==='HEAD'?undefined:content);}catch{return reply(res,404,{error:'Not found'});}
}catch(e){console.error(e.message);if(!res.headersSent)reply(res,500,{error:'Server error'});else res.end();}});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('ARAXE listening'));
if(process.env.NODE_ENV!=='test'){refreshParking();setInterval(refreshParking,6*3600000).unref();}
