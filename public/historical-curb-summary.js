/* Snapshot evidence from independently-validated visual curb classifier.
 * Not a legal curb-parking inventory and never live occupancy. */
export function historicalVisualSignals(scans,zoneId){
 const relevant=(Array.isArray(scans)?scans:[])
  .filter(s=>s?.zone===zoneId&&typeof s.date==='string'&&Array.isArray(s.items));
 const seen=new Set(),rows=new Map(),dates=new Set();
 let inspected=0,highConfidence=0;
 for(const snapshot of relevant){
  dates.add(snapshot.date);
  for(const x of snapshot.items){
   if(!Number.isFinite(x.lat)||!Number.isFinite(x.lon)||!Number.isFinite(x.probabilityClear))continue;
   const key=[snapshot.scene,snapshot.date,x.roadId,Math.round(x.lat*100000),Math.round(x.lon*100000)].join(':');
   if(seen.has(key))continue;seen.add(key);
   const name=String(x.roadName||'Ανώνυμη οδός'),g=rows.get(name)||{name,inspected:0,clear:0,dates:new Set()};
   g.inspected++;g.dates.add(snapshot.date);inspected++;
   if(x.probabilityClear>=.8){g.clear++;highConfidence++;}
   rows.set(name,g);
  }
 }
 return {scenes:new Set(relevant.map(s=>s.scene)).size,dates:dates.size,inspected,visuallyClear:highConfidence,
  latestDate:[...dates].sort().at(-1)||null,
  roads:[...rows.values()].map(r=>({name:r.name,inspected:r.inspected,visuallyClear:r.clear,dates:r.dates.size}))
   .sort((a,b)=>b.visuallyClear-a.visuallyClear||b.dates-a.dates)};
}
