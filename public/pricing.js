// Published operator tariffs, not availability or guaranteed final prices.
// Verify official pages before travel. Date is last manual verification.
export const tariffs=[
 {id:'thesi',name:'THESi · δημοτικές θέσεις επισκεπτών',type:'municipal',address:'Επιλεγμένοι τομείς ελεγχόμενης στάθμευσης, Θεσσαλονίκη',source:'https://thesi.gr/',verified:'2026-10-21',note:'Μόνο θέσεις επισκεπτών με λευκή διαγράμμιση THESi. Δευ–Παρ 08:00–21:00, Σάβ 09:00–16:00. Κυριακές και επίσημες αργίες χωρίς χρέωση. Μέγιστο 4 ώρες ανά τομέα.'},
 {id:'helexpo-aggelaki',name:'ΔΕΘ · Αγγελάκη',type:'garage',address:'Αγγελάκη και Αλ. Σβώλου, Θεσσαλονίκη',source:'https://helexpo.gr/services/parking-spaces/',verified:'2026-10-21',note:'Επίσημος νέος τιμοκατάλογος ΔΕΘ · υπαίθριο πάρκινγκ.'},
 {id:'helexpo-vellidis',name:'ΔΕΘ · Ιωάννης Βελλίδης',type:'garage',address:'3ης Σεπτεμβρίου και Λεωφόρος Στρατού, Θεσσαλονίκη',source:'https://helexpo.gr/services/parking-spaces/',verified:'2026-10-21',note:'Επίσημος νέος τιμοκατάλογος ΔΕΘ · στεγασμένο πάρκινγκ.'},
 {id:'vikas',name:'Parking Βίκας · Αγίου Δημητρίου',type:'garage',address:'Αγίου Δημητρίου 141, Θεσσαλονίκη',source:'https://parkingvikas.gr/',verified:'2026-10-21',note:'Τιμές απλού αυτοκινήτου από την ιστοσελίδα του παρόχου. Δεν τεκμηριώνεται ενδιάμεση χρέωση 3–23 ωρών.'}
];
export function quotedCost(id,durationHours){
 const h=Number(durationHours);
 if(!Number.isFinite(h)||h<=0||h>24)return null;
 if(id==='thesi')return h<=4?Math.round(170*h)/100:null;
 if(id==='helexpo-aggelaki'||id==='helexpo-vellidis'){
   if(h<=1)return 5;
   if(h<=2)return 8;
   if(h<=3)return 9;
   if(h<=4)return 10;
   if(h<=5)return 11;
   if(h<=6)return 12;
   if(h<=7)return 12.5;
   if(h<=8)return 13;
   if(h<=9)return 13.5;
   if(h<=10)return 14;
   if(h<=11)return 14.5;
   if(h<=12)return 15;
   if(h===24)return 21;
   // The published operator's extra-hour rule uses discrete, begun hourly periods.
   return Math.round((15+.5*Math.ceil(h-12))*100)/100;
 }
 if(id==='vikas'){if(h<=1)return 4;if(h<=2)return 6;if(h===24)return 20;}
 return null;
}
export function quoteLabel(id,durationHours){
 const cost=quotedCost(id,durationHours);
 return cost===null?'Δεν υπάρχει τεκμηριωμένη τιμή για αυτή τη διάρκεια':cost.toLocaleString('el-GR',{style:'currency',currency:'EUR'});
}
