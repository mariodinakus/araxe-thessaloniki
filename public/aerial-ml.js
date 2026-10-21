/* Browser-compatible, dependency-free experimental aerial image patch classifier.
   Labels mean "visible vehicle in the labelled patch", NOT legal parking spaces.
   Images/annotations remain on the user's device. No imagery is scraped from basemaps. */
const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const sigmoid=x=>1/(1+Math.exp(-clip(x,-30,30)));
export function extractImageFeatures(img){
 const {width:w,height:h,data}=img;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<12||h<12||!data||data.length<w*h*4)throw Error('Invalid image patch');
 const sums=new Float64Array(4*4*5),count=new Uint16Array(16);
 let allR=0,allG=0,allB=0,allEdge=0;
 // Aggregate RGB, brightness, gradients in a fixed 4x4 spatial grid.
 for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){
  const k=(y*w+x)*4,r=data[k]/255,g=data[k+1]/255,b=data[k+2]/255;
  const right=k+4,below=k+w*4;
  const lum=(r+g+b)/3,lumR=(data[right]+data[right+1]+data[right+2])/765,lumD=(data[below]+data[below+1]+data[below+2])/765;
  const edge=clip((Math.abs(lum-lumR)+Math.abs(lum-lumD))*2,0,1);
  const cell=Math.min(3,Math.floor(y/h*4))*4+Math.min(3,Math.floor(x/w*4)),base=cell*5;
  sums[base]+=r;sums[base+1]+=g;sums[base+2]+=b;sums[base+3]+=lum;sums[base+4]+=edge;
  count[cell]++;allR+=r;allG+=g;allB+=b;allEdge+=edge;
 }
 const features=[];
 for(let cell=0;cell<16;cell++){const n=count[cell]||1;for(let c=0;c<5;c++)features.push(sums[cell*5+c]/n);}
 const n=count.reduce((a,b)=>a+b,0)||1;features.push(allR/n,allG/n,allB/n,allEdge/n);
 return features;
}
export function validSamples(samples){return (Array.isArray(samples)?samples:[]).filter(x=>x&&typeof x.scene==='string'&&x.scene.length<=150&&[0,1].includes(x.y)&&Array.isArray(x.x)&&x.x.length===84&&x.x.every(v=>Number.isFinite(v)&&v>=0&&v<=1));}
function trainCore(samples,epochs=90){
 const d=84,w=new Float64Array(d+1),means=new Float64Array(d),std=new Float64Array(d);
 for(const s of samples)for(let j=0;j<d;j++)means[j]+=s.x[j]/samples.length;
 for(const s of samples)for(let j=0;j<d;j++)std[j]+=(s.x[j]-means[j])**2/samples.length;
 for(let j=0;j<d;j++)std[j]=Math.max(.12,Math.sqrt(std[j]));
 const positives=samples.reduce((s,a)=>s+a.y,0),negatives=samples.length-positives;
 for(let epoch=0;epoch<epochs;epoch++){
  const rate=.08/(1+epoch/42);
  // Fully deterministic ordering; never accidentally train on validation observations.
  for(let i=0;i<samples.length;i++){const s=samples[(i*17+epoch*31)%samples.length],vec=s.x;let z=w[d];
   for(let j=0;j<d;j++)z+=w[j]*(vec[j]-means[j])/std[j];
   const p=sigmoid(z),balance=s.y?Math.min(3,samples.length/(2*positives)):Math.min(3,samples.length/(2*negatives));
   const error=clip((s.y-p)*balance,-3,3);
   for(let j=0;j<d;j++)w[j]+=rate*(error*(vec[j]-means[j])/std[j]-.025*w[j]);
   w[d]+=rate*error;
  }
 }
 return {weights:Array.from(w),means:Array.from(means),std:Array.from(std)};
}
export function predictPatch(model,features){
 if(!model||!Array.isArray(features)||features.length!==84)return null;
 let score=model.weights[84];for(let j=0;j<84;j++)score+=model.weights[j]*(features[j]-model.means[j])/model.std[j];
 return sigmoid(score);
}
export function trainVisualModel(input){
 const samples=validSamples(input).slice(-2000),scenes=[...new Set(samples.map(x=>x.scene))];
 const pos=samples.filter(x=>x.y===1).length,neg=samples.length-pos;
 if(samples.length<30||pos<10||neg<10||scenes.length<2)return {ready:false,reason:'Χρειάζονται τουλάχιστον 30 επισημάνσεις (10 ανά κατηγορία) σε 2 διαφορετικές λήψεις.',n:samples.length,scenes:scenes.length,positive:pos,negative:neg,validation:null};
 // Hold out all labels from the last scene, never random patches of the SAME photograph.
 const held=scenes.at(-1),train=samples.filter(x=>x.scene!==held),test=samples.filter(x=>x.scene===held);
 const trPos=train.filter(x=>x.y===1).length,trNeg=train.length-trPos,tePos=test.filter(x=>x.y===1).length,teNeg=test.length-tePos;
 const canValidate=scenes.length>=3&&train.length>=25&&test.length>=10&&trPos>=8&&trNeg>=8&&tePos>=3&&teNeg>=3;
 const model=trainCore(canValidate?train:samples);
 let validation=null;
 if(canValidate){
  const brier=test.reduce((s,x)=>s+(predictPatch(model,x.x)-x.y)**2,0)/test.length;
  const baselineRate=trPos/train.length,baseline=test.reduce((s,x)=>s+(baselineRate-x.y)**2,0)/test.length;
  validation={scene:held,n:test.length,brier,baseline,passes:brier<baseline-.01};
 }
 // Train final model on all observations only AFTER true out-of-scene evaluation.
 const final=canValidate?trainCore(samples):model;
 return {ready:Boolean(validation?.passes),reason:!canValidate?'Ανεπαρκής ανεξάρτητη επαλήθευση: απαιτούνται 3 λήψεις, με θετικά και αρνητικά δείγματα σε διαφορετικές εικόνες.':!validation.passes?'Το μοντέλο δεν ξεπερνά ακόμη την απλή βασική πρόβλεψη σε νέα εικόνα.':'Επιτυχής δοκιμή σε διαφορετική λήψη. Πειραματική οπτική ταξινόμηση.',n:samples.length,scenes:scenes.length,positive:pos,negative:neg,validation,model:final};
}
export function webMercatorTile(lat,lon,z=19){
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isInteger(z)||z<0||z>22)throw Error('Invalid map position');
 const n=2**z,x=Math.floor((lon+180)/360*n),rad=clip(lat,-85.0511,85.0511)*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(rad))/Math.PI)/2*n);
 return {z,x:clip(x,0,n-1),y:clip(y,0,n-1)};
}
export function acquisitionDate(feature){
 const s=feature?.properties?.datetime||feature?.properties?.start_datetime||feature?.properties?.['dct:date']||null;
 const date=s?Date.parse(s):NaN;return Number.isFinite(date)&&date<=Date.now()?new Date(date).toISOString().slice(0,10):null;
}
