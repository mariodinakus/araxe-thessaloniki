/* Official EOxCloudless Sentinel-2 historical mosaics.
 * 2018-2025: CC BY-NC-SA 4.0 (only non-commercial use).
 * 2016: CC BY 4.0. Spatial resolution ~10m, NOT street-car detection. */
export const SENTINEL_YEARS=Object.freeze([2025,2024,2023,2022,2021,2020,2019,2018,2016]);
export const YEAR_MIN=2016;
export function satelliteWmtsUrl(year){
 const n=Number(year);
 if(!SENTINEL_YEARS.includes(n))throw Error('Μη διαθέσιμη ετήσια δορυφορική σύνθεση');
 return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${n}_3857/default/g/{z}/{y}/{x}.jpg`;
}
export function satelliteCredit(year){
 const n=Number(year);
 if(!SENTINEL_YEARS.includes(n))throw Error('Μη διαθέσιμο έτος');
 return `EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${n}) · ${n===2016?'CC BY 4.0':'CC BY-NC-SA 4.0 · μόνο μη εμπορικά'}`;
}
export function satelliteResolutionAtZoom(zoom){
 return zoom<=14?'sentinel-10m':'high-zoom-reference';
}
