// Official Waze Live Map iframe. No scraping or access to Waze's internal traffic data.
// https://developers.google.com/waze/iframe/
export function wazeEmbedUrl(point,zoom=13){
 const lat=Number(point?.lat),lon=Number(point?.lon),z=Number(zoom);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -85||lat>85||lon< -180||lon>180)throw new Error('Invalid map coordinates');
 const level=Math.max(3,Math.min(17,Math.round(Number.isFinite(z)?z:13)));
 return 'https://embed.waze.com/iframe?zoom='+level+'&lat='+lat.toFixed(6)+'&lon='+lon.toFixed(6);
}
export function wazeFullMapUrl(point,zoom=13){
 const lat=Number(point?.lat),lon=Number(point?.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -85||lat>85||lon< -180||lon>180)throw new Error('Invalid map coordinates');
 return 'https://www.waze.com/live-map?zoom='+Math.max(3,Math.min(17,Math.round(zoom)))+'&lat='+lat.toFixed(6)+'&lon='+lon.toFixed(6);
}
