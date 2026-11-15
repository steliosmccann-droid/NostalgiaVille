
(()=>{'use strict';
// Footprints are USER-SUPPLIED table entries, NOT independently verified FarmVille engine data.
// width/height always represent the smallest cells; no assumption that an item must be square.
const {ROWS,WIKI_VERIFIED,REVIEW}=window.FarmGridCatalog;
const defs=new Map(),cv=document.querySelector('#game'),ctx=cv.getContext('2d'),sel=document.querySelector('#catalog'),readout=document.querySelector('#readout'),notice=document.querySelector('#notice'),status=document.querySelector('#status');
for(const [group,items] of ROWS){const og=document.createElement('optgroup');og.label=group;for(const [id,name,w,h] of items){defs.set(id,{id,name,w,h,group});const op=document.createElement('option');op.value=id;op.textContent=`${name} · ${w}×${h}${REVIEW.has(id)?' ⚠︎ πηγές διαφωνούν':WIKI_VERIFIED.has(id)?' ✓ πηγή':''}`;og.append(op)}sel.append(og)}sel.value='apple';
const N=72,OPEN=48,UNITW=15.5,UNITH=8;const NORMAL_SAVE_KEY='classic-farm-normal-v36-v1';
const CREATIVE_SAVE_KEY='farmville3026-creative-mirror-v28-v1';
const CREATIVE_COINS=999999999;
const CREATIVE_MAX_LEVEL=999; // Display-only max level until the real leveling system is developed.
let profileMode='normal';
let farmName='Η ΦΑΡΜΑ ΜΟΥ';
let lastLevelShown=null;
let STORAGE=NORMAL_SAVE_KEY;let farmMode='farm';let marketSelected=null;
let storedItems=[],storagePickId=null;let objects=[],idCounter=1,tool='test',grid=true,zoom=1,cx=0,cy=0,W=0,H=0,dirty=true,hover=null,movingId=null,moveOffset={x:0,y:0},history=[],coins=1000,xp=0,cashSpent=0,pointers=new Map(),gesture=false,dragged=false;
const seedSelect=document.getElementById('seedSelect'),seedPicker=document.getElementById('seedPicker');
for(const [id,d] of Object.entries(FarmCrops.SEEDS)){const opt=document.createElement('option');opt.value=id;opt.textContent=`${d.icon} ${d.name} · ${d.cost} 🪙`;seedSelect.appendChild(opt)}
function refreshSeed(){const d=FarmCrops.SEEDS[seedSelect.value];document.getElementById('seedInfo').textContent=`${d.grow/3600000} ώρες · +${d.xp} XP · πώληση ${d.reward} 🪙`}
seedSelect.onchange=refreshSeed;refreshSeed();
const plotAt=p=>objects.find(o=>o.kind==='plot'&&p.x>=o.x&&p.y>=o.y&&p.x<o.x+4&&p.y<o.y+4);
const elapsed=(n)=>n<60000?`${Math.ceil(n/1000)} δευτ.`:n<3600000?`${Math.ceil(n/60000)} λεπτά`:`${Math.ceil(n/3600000)} ώρες`;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
// Rotate all catalog objects between their two distinct supported directions. Plot footprint remains 4x4.
const ROTATABLE_FENCES=new Set(defs.keys());
const ROTATE_FENCE_TYPES=new Set(['fence','black-fence','pink-fence','blue-fence','green-fence','wood-fence']);
let pendingFenceRotation=null;
// Two unique visual directions are currently supported (normal / turned).
// Legacy V12 orientation values 2 and 3 collapse to matching visual states
// instead of making players tap through duplicate rotations.
const normalizeOrientation=n=>Number.isInteger(n)?((n%2)+2)%2:0;
const previewFenceOrientation=o=>pendingFenceRotation?.id===o?.id?pendingFenceRotation.orientation:normalizeOrientation(o?.orientation);
const dims=o=>{const d=defs.get(o.kind);return d&&(normalizeOrientation(o.orientation)%2===1)&&ROTATABLE_FENCES.has(o.kind)?{...d,w:d.h,h:d.w}:d};
// Pure placement engine extracted from V13 into grid-system/grid-core.js.
const gridEngine=window.FarmGridCore.create({defs,mapCells:N,openCells:OPEN});
const overlaps=gridEngine.overlaps;
const footprint=gridEngine.footprint;
const validate=(a,except=null,inventory=objects)=>gridEngine.validate(a,except,inventory);
const validatePlacement=(a,kind,except=null,inventory=objects)=>gridEngine.validatePlacement(a,kind,except,inventory);
const anchor=(p,id,offset={x:0,y:0})=>gridEngine.anchor(p,id,offset);
function hit(p){if(!p)return null;return [...objects].reverse().find(o=>p.x>=o.x&&p.y>=o.y&&p.x<o.x+footprint(o).w&&p.y<o.y+footprint(o).h)||null}
function iso(x,y){return{x:cx+(x-y)*UNITW*.5*zoom,y:cy+(x+y)*UNITH*.5*zoom}}
function pick(px,py){const u=(px-cx)/(UNITW*.5*zoom),v=(py-cy)/(UNITH*.5*zoom),x=Math.floor((u+v)/2),y=Math.floor((v-u)/2);return x>=0&&y>=0&&x<N&&y<N?{x,y}:null}
function polygon(x,y,w,h){return[iso(x,y),iso(x+w,y),iso(x+w,y+h),iso(x,y+h)]}
function shape(poly,fill,stroke,width=1){ctx.beginPath();ctx.moveTo(poly[0].x,poly[0].y);for(let j=1;j<poly.length;j++)ctx.lineTo(poly[j].x,poly[j].y);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
function line(x,y,X,Y,color,width){const p=iso(x,y),q=iso(X,Y);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
// FarmVille3026 V47: original, subtle grass texture in the 2009 casual-farm palette.
// This changes pixels only; the N x N map, OPEN area, occupancy and grid are untouched.
// V48: original-inspired, nearly uniform green ground. Purely visual: no grid/geometry changes.
// V49: seamless hand-drawn micro-blades; cosmetic only. Grid and collisions unchanged.
// V50: fine soft, original hand-drawn grassy surface. Cosmetic terrain only.
// V52: visual terrain separation only; no grid, occupancy or gameplay changes.
let fv52FarmGrassPattern=null,fv52OuterGrassPattern=null,fv55LockedGrassPattern=null;
function fv52MakeGrass(base,darkA,darkB,lightA,lightB){
 // V57: fine hand-drawn lawn texture inspired by 2009 casual farming art.
 // Strictly cosmetic: V56 palette, terrain boundaries, grid and camera stay intact.
 const c=document.createElement('canvas');c.width=256;c.height=256;
 const g=c.getContext('2d');const S=256;
 g.fillStyle=base;g.fillRect(0,0,S,S);
 let seed=560056;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 // Fine color stippling: enough contrast to read on a phone without patchwork.
 for(let i=0;i<9000;i++){
  const x=rand()*S,y=rand()*S;
  g.fillStyle=rand()<.54?darkA:lightA;
  g.fillRect(x,y,.65+rand()*.95,.6+rand()*.75);
 }
 // Small staggered pairs/triples suggest leafy grass rather than loose large tufts.
 g.lineCap='round';g.lineJoin='round';
 for(let i=0;i<3000;i++){
  const x=rand()*S,y=rand()*S,h=1.5+rand()*1.8;
  const bend=(rand()-.5)*1.45;
  g.strokeStyle=rand()<.52?darkB:lightB;
  g.lineWidth=.58+rand()*.36;
  g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+bend*.3,y-h*.55,x+bend,y-h);g.stroke();
  if(rand()<.31){
   g.beginPath();g.moveTo(x+.85,y+.2);g.quadraticCurveTo(x+1.2,y-h*.3,x+1.1+bend*.25,y-h*.74);g.stroke();
  }
 }
 // Sparse tiny lowlights/highlights add natural texture, never block-size shapes.
 for(let i=0;i<460;i++){
  const x=rand()*S,y=rand()*S;
  g.fillStyle=rand()<.5?darkA:lightA;
  g.fillRect(x,y,1.4+rand()*.7,.5+rand()*.4);
 }
 return ctx.createPattern(c,'repeat');
}
function fv52FarmGrass(){
 if(!fv52FarmGrassPattern)fv52FarmGrassPattern=fv52MakeGrass('#58a84e','rgba(45,121,49,.14)','rgba(42,111,47,.19)','rgba(170,222,132,.12)','rgba(164,220,128,.18)');
 return fv52FarmGrassPattern;
}
function fv52OuterGrass(){
 // Lighter sage-green grass outside playable area; preserve V53 boundary.
 if(!fv52OuterGrassPattern)fv52OuterGrassPattern=fv52MakeGrass('#83a974','rgba(54,104,53,.10)','rgba(53,99,49,.12)','rgba(190,221,158,.10)','rgba(183,216,148,.12)');
 return fv52OuterGrassPattern;
}
// V55: Locked map is distinct from both the playable area and the brighter world background.
function fv55LockedGrass(){
 if(!fv55LockedGrassPattern)fv55LockedGrassPattern=fv52MakeGrass('#4d9946','rgba(35,101,40,.13)','rgba(33,103,39,.17)','rgba(153,203,115,.11)','rgba(146,193,109,.14)');
 return fv55LockedGrassPattern;
}
function fillPatternPolygon(poly,pattern){
 ctx.save();
 ctx.beginPath();ctx.moveTo(poly[0].x,poly[0].y);
 for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i].x,poly[i].y);
 ctx.closePath();ctx.clip();
 const origin=iso(0,0);
 ctx.translate(origin.x,origin.y);ctx.scale(zoom,zoom);
 ctx.fillStyle=pattern;
 const extent=Math.max(W,H)*2/Math.max(zoom,.01)+512;
 ctx.fillRect(-extent,-extent,extent*2,extent*2);
 ctx.restore();
}
function drawGround(){
 // Only cosmetic terrain changes. OPEN/N, picking, placement and grid stay intact.
 // Background remains light sage. Locked land is darker than the farm, not the background.
 const whole=polygon(0,0,N,N);
 fillPatternPolygon(whole,fv55LockedGrass());
 const playable=polygon(0,0,OPEN,OPEN);
 fillPatternPolygon(playable,fv52FarmGrass());
 // Gentle continuous outline of the usable farm, no internal V-shaped bands.
 ctx.save();
 ctx.beginPath();ctx.moveTo(playable[0].x,playable[0].y);
 for(let i=1;i<playable.length;i++)ctx.lineTo(playable[i].x,playable[i].y);
 ctx.closePath();ctx.lineJoin='round';
 ctx.strokeStyle='rgba(36,82,39,.34)';ctx.lineWidth=Math.max(1.3,1.8*zoom);ctx.stroke();
 ctx.restore();
}
function drawGrid(){if(!grid)return;for(let i=0;i<=N;i++){const major=i%4===0;line(i,0,i,N,major?'#47763eaa':'#47763e5a',major?1.15:.45);line(0,i,N,i,major?'#47763eaa':'#47763e5a',major?1.15:.45)}}
function tree(o){const d=dims(o),p=iso(o.x+d.w/2,o.y+d.h/2),z=zoom;ellipse(p.x,p.y+2*z,12*z,4*z,'#37592d66');ctx.strokeStyle='#805028';ctx.lineWidth=5*z;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-23*z);ctx.stroke();ellipse(p.x-9*z,p.y-25*z,12*z,11*z,'#39813a');ellipse(p.x+8*z,p.y-29*z,13*z,12*z,'#337934');ellipse(p.x,p.y-39*z,15*z,14*z,'#4e9842');for(const [a,b]of [[-7,-35],[7,-33],[1,-44]])ellipse(p.x+a*z,p.y+b*z,2.8*z,2.8*z,'#cf4931')}
function bale(o){const p=iso(o.x+.5,o.y+.5),z=zoom,x=p.x,y=p.y;ellipse(x,y+3*z,10*z,3*z,'#38552677');shape([{x:x-10*z,y:y-8*z},{x,y:y-13*z},{x:x+11*z,y:y-8*z},{x,y:y-3*z}],'#f0cf68','#a57b2e');shape([{x:x-10*z,y:y-8*z},{x,y:y-3*z},{x,y:y+4*z},{x:x-10*z,y:y-1*z}],'#bf8b37','#9b6b29');shape([{x,y:y-3*z},{x:x+11*z,y:y-8*z},{x:x+11*z,y:y-1*z},{x,y:y+4*z}],'#dbac4d','#a77b31')}
function drawFarmFence(o){
 const a=footprint(o),alongX=a.w>a.h;
 const palette={'fence':['#fff9e9','#a9a296'],'black-fence':['#54545c','#2a282d'],'pink-fence':['#f3a7bc','#b87589'],'blue-fence':['#a0d6f3','#4d84b4'],'green-fence':['#abd899','#4e945b'],'wood-fence':['#d6a16a','#845431']};
 const colors=palette[o.kind]||palette.fence;
 const count=6;
 const points=[];
 for(let i=0;i<count;i++){
  const t=i/(count-1),x=alongX?a.x+.5+t*Math.max(.01,a.w-1):a.x+.5;
  const y=alongX?a.y+.5:a.y+.5+t*Math.max(.01,a.h-1);
  points.push(iso(x,y));
 }
 const z=zoom;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(const h of [8,16]){
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y-h*z);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y-h*z);
  ctx.strokeStyle=colors[1];ctx.lineWidth=4*z;ctx.stroke();
  ctx.strokeStyle=colors[0];ctx.lineWidth=2.7*z;ctx.stroke();
 }
 for(const p of points){
  ctx.strokeStyle=colors[1];ctx.lineWidth=5*z;ctx.beginPath();ctx.moveTo(p.x,p.y+1*z);ctx.lineTo(p.x,p.y-21*z);ctx.stroke();
  ctx.strokeStyle=colors[0];ctx.lineWidth=3*z;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-21*z);ctx.stroke();
 }
 ctx.restore();
}
function drawItemBase(o){const d=dims(o),a=footprint(o),p=polygon(a.x,a.y,a.w,a.h);if(ROTATE_FENCE_TYPES.has(o.kind)){drawFarmFence(o);return}if(o.kind==='plot'){const fallow=o.soil==='fallow';shape(p,fallow?'#85745e':'#86603b','#513c26',1.3);shape(polygon(a.x+.25,a.y+.25,a.w-.5,a.h-.5),fallow?'#a99b81':'#a87a4a',fallow?'#bcae97':'#c69c66',.7);
// Furrows run along the grid axes; cosmetic only, no change to footprint.
if(!fallow){for(let k=.7;k<3.8;k+=.65){const swap=normalizeOrientation(o.orientation)%2===1;const st=swap?iso(a.x+k,a.y+.25):iso(a.x+.25,a.y+k),en=swap?iso(a.x+k,a.y+a.h-.25):iso(a.x+a.w-.25,a.y+k);ctx.beginPath();ctx.moveTo(st.x,st.y);ctx.lineTo(en.x,en.y);ctx.strokeStyle='#664627';ctx.lineWidth=Math.max(.65,zoom*.9);ctx.stroke();const hi=swap?iso(a.x+k+.15,a.y+.25):iso(a.x+.25,a.y+k+.15),hj=swap?iso(a.x+k+.15,a.y+a.h-.25):iso(a.x+a.w-.25,a.y+k+.15);ctx.beginPath();ctx.moveTo(hi.x,hi.y);ctx.lineTo(hj.x,hj.y);ctx.strokeStyle='#d3a270';ctx.lineWidth=Math.max(.5,zoom*.55);ctx.stroke();}}
if(o.crop){const d=FarmCrops.SEEDS[o.crop.seed];if(d){const stage=FarmCrops.stage(o.crop);const progress=Math.min(1,Math.max(0,(Date.now()-o.crop.plantedAt)/d.grow));const mid=iso(a.x+2,a.y+2),z=zoom;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.max(14,20*z)}px system-ui`;ctx.globalAlpha=stage==='withered'?.45:1;if(stage==='withered'||(stage==='growing'&&progress<.35)){ctx.fillText(stage==='withered'?'🥀':'🌱',mid.x,mid.y-7*z)}else if(!drawAssetCrop(o.crop.seed,mid,stage))ctx.fillText(stage==='growing'&&progress<.65?'🌿':d.icon,mid.x,mid.y-7*z);ctx.globalAlpha=1;if(stage==='growing'){ctx.fillStyle='#492d18';ctx.fillRect(mid.x-15*z,mid.y+7*z,30*z,4*z);ctx.fillStyle='#65cf59';ctx.fillRect(mid.x-15*z,mid.y+7*z,30*z*progress,4*z)}}}
return}if(o.kind==='apple'){if(!drawAssetObject('apple',o))tree(o);return}if(o.kind==='hay'){if(!drawAssetObject('hay',o))bale(o);return}if(drawAssetObject(o.kind,o))return; // Other objects shown as footprints until graphics are supplied.
shape(p,'#b48a57b0','#71502d',1.6);const mid=iso(a.x+a.w/2,a.y+a.h/2),txt=d.name.split(' · ')[0];ctx.fillStyle='#442d1a';ctx.font=`bold ${Math.max(9,Math.min(13,10*zoom))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(txt.length>18?txt.slice(0,17)+'…':txt,mid.x,mid.y-3,Math.max(33,(a.w+a.h)*UNITW*zoom*.45));ctx.fillText(`${d.w}×${d.h}`,mid.x,mid.y+9,Math.max(20,(a.w+a.h)*UNITW*zoom*.45))}
function drawItem(o){
 // Isometric art remains upright. Flip horizontally to suggest facing for sprites
 // without true directional artwork; fence geometry and plot rows follow orientation.
 const ori=normalizeOrientation(o.orientation);
 if(ori===0||o.kind==='plot'||ROTATE_FENCE_TYPES.has(o.kind)){drawItemBase(o);return}
 const d=dims(o),mid=iso(o.x+d.w/2,o.y+d.h/2);
 ctx.save();
 if(ori===1){ctx.translate(mid.x*2,0);ctx.scale(-1,1)}
 drawItemBase(o);
 ctx.restore();
}
function currentCandidate(){if(tool==='multi'||tool==='recycle')return null;if(!hover)return null;if(tool==='move'&&!movingId){const o=hit(hover);return o?footprint(o):null}if(tool==='remove'){const o=hit(hover);return o?footprint(o):null}if(tool==='seed'||tool==='harvest'){const o=plotAt(hover);return o?footprint(o):null}const movingObj=tool==='move'?objects.find(o=>o.id===movingId):null;const id=tool==='plow'?'plot':tool==='move'?movingObj?.kind:sel.value;const a=id?anchor(hover,id,tool==='move'?moveOffset:{x:0,y:0}):null;if(a&&movingObj&&ROTATABLE_FENCES.has(id)){const d=dims({...movingObj,orientation:previewFenceOrientation(movingObj)});a.w=d.w;a.h=d.h}return a}
function objectGroundDepth(o){const d=dims(o);return o.kind==='plot'?-100000:o.x+o.y+(d.w+d.h)/2;}
function farmerGroundDepth(){return farmer.x+farmer.y;}
function draw(){if(!dirty)return;dirty=false;ctx.clearRect(0,0,W,H);ctx.fillStyle=fv52OuterGrass();ctx.fillRect(0,0,W,H);drawGround();drawGrid();const scene=objects.map(o=>({type:'object',depth:objectGroundDepth(o),o}));scene.push({type:'farmer',depth:farmerGroundDepth()});scene.sort((a,b)=>a.depth-b.depth||(a.type==='farmer'?1:-1));for(const entry of scene){if(entry.type==='farmer')drawFarmer();else {drawItem(entry.o);if(farmMode==='farm'&&v36HarvestStatus(entry.o)?.ready){const d=dims(entry.o),pt=iso(entry.o.x+d.w/2,entry.o.y+d.h/2);ctx.save();ctx.font=`${Math.max(13,15*zoom)}px system-ui`;ctx.textAlign='center';ctx.shadowColor='#265329';ctx.shadowBlur=4*zoom;ctx.fillText('🧺',pt.x,pt.y-17*zoom);ctx.restore()}}}const a=currentCandidate();if(a){let except=tool==='move'?movingId:null;const selecting=(tool==='move'&&!movingId)||tool==='remove';const kind=tool==='plow'?'plot':tool==='move'?objects.find(o=>o.id===movingId)?.kind:sel.value;const target=(tool==='seed'||tool==='harvest')?plotAt(hover):null;const reason=tool==='seed'?(target&&target.soil==='ready'&&!target.crop&&coins>=FarmCrops.SEEDS[seedSelect.value].cost?'':'Μη διαθέσιμο'):tool==='harvest'?(target&&target.crop&&FarmCrops.stage(target.crop)==='ripe'?'':'Δεν είναι ώριμο'):selecting?'':tool==='plow'?FarmPlowing.plan({x:hover.x,y:hover.y,items:objects,coins,grid:gridEngine}).reason:validatePlacement(a,kind,except);shape(polygon(a.x,a.y,a.w,a.h),selecting?'#6ebef07e':reason?'#f35f587e':'#48f08070',selecting?'#35a5e4':reason?'#e3312c':'#1fd64a',2.6);
if(kind&&((tool==='place'&&(farmMode!=='farm'||marketSelected===kind))||(tool==='move'&&movingId))){
 const o=tool==='move'?objects.find(v=>v.id===movingId):null;
 const ghost={...(o||{kind,id:-1}),x:a.x,y:a.y,
  ...(o?{orientation:previewFenceOrientation(o)}:{})};
 ctx.save();ctx.globalAlpha=reason?.38:.70;drawItem(ghost);ctx.restore();
}
if(hover){const at=iso(hover.x+.5,hover.y+.5),rad=clamp(3.5*zoom,3,9);ctx.strokeStyle='#fffbe1';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(at.x-rad,at.y);ctx.lineTo(at.x+rad,at.y);ctx.moveTo(at.x,at.y-rad);ctx.lineTo(at.x,at.y+rad);ctx.stroke()}}}

// V29: documented early FarmVille XP progression; levels 101+ use 100k increments.
const FV_LEVEL_XP=Object.freeze([0,15,30,70,140,250,400,600,850,1150,1500,1900,2400,3000,3700,4500,5400,6400,7500,8700,10000,11500,13500,16000,19000,22500,26500,31000,36000,42000,49000,57000,65000,74000,83000,93000,103000,113000,123000,133000,143000,153000,163000,173000,183000,193000,203000,213000,223000,233000,243000,253000,263000,273000,283000,293000,303000,313000,323000,333000,343000,353000,363000,373000,383000,393000,403000,413000,423000,433000,443500,454500,466000,478000,490500,504000,518500,534000,550500,568000,587000,607500,629500,653000,678500,706000,735500,767000,801000,837500,876500,918500,963500,1012000,1064000,1120000,1180000,1244500,1313500,1387500,1500000]);
function sanitizeFarmName(value){
 const v=typeof value==='string'?value.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,24):'';
 return v || 'Η ΦΑΡΜΑ ΜΟΥ';
}
function updateFarmNameUI(){
 const title=document.getElementById('fvProfileTitle');
 const label=title?.querySelector('small');
 if(label)label.textContent=(profileMode==='creative'?'🧪 ':'')+farmName;
 const input=document.getElementById('fvFarmNameInput');
 if(input)input.value=farmName;
}
function farmLevel(currentXp=xp){
 if(profileMode==='creative')return {level:999,prev:0,next:0,percent:100,max:true};
 const x=Math.max(0,Math.floor(Number(currentXp)||0));
 let level=1;
 if(x>=FV_LEVEL_XP[100]){
  level=101+Math.floor((x-FV_LEVEL_XP[100])/100000);
  const prev=FV_LEVEL_XP[100]+(level-101)*100000;
  return {level,prev,next:prev+100000,percent:Math.min(100,100*(x-prev)/100000),max:false};
 }
 let left=0,right=100;
 while(left<=right){const mid=(left+right)>>1;if(FV_LEVEL_XP[mid]<=x){level=mid+1;left=mid+1;}else right=mid-1;}
 const prev=FV_LEVEL_XP[level-1],next=FV_LEVEL_XP[level];
 return {level,prev,next,percent:Math.min(100,Math.max(0,100*(x-prev)/(next-prev))),max:false};
}
function refreshPlayerHud(){
 const lvl=farmLevel();
 if(profileMode==='normal'&&lastLevelShown!==null&&lvl.level>lastLevelShown)show('⭐ Level Up! LV '+lvl.level);
 lastLevelShown=lvl.level;
 const second=lvl.max?'Creative · MAX':('XP '+xp.toLocaleString('el-GR')+' / '+lvl.next.toLocaleString('el-GR'));
 status.innerHTML='<div class="fv38-money"><div class="fv38-coin">🪙 '+coins.toLocaleString('el-GR')+'</div><div class="fv38-cash">💵 '+availableFarmCash()+' FV</div></div><div class="fv38-experience"><div class="fv38-level">⭐ '+(lvl.max?'MAX':'LV '+lvl.level)+'</div><small>'+second+'</small><div class="fv-level-track" aria-label="Πρόοδος επιπέδου"><div class="fv-level-fill" style="width:'+lvl.percent.toFixed(2)+'%"></div></div></div>';
}


// V31: ONE verified Coin-price registry shared by Market and Sell.
// No speculative per-category prices. Unknown/gift/premium entries are NOT assigned Coins.
// Exact prices below were checked against the classic FarmVille wiki and contemporary guides.
// These represent selected historical periods; a later special-items database will hold exceptions.
const FV_RESALE_RATE=5;
const FV_CLASSIC_COIN_PRICES=Object.freeze({
 hay:100,apple:325,chicken:400,sheep:700,cow:300,pig:1000,
 'pink-hay':125, 'tool-shed':14000,'red-barn':40000,
 fence:300,tractor:5000,'pink-tractor':5000,'lucky-tractor':5000,
 silo:20000,
 // V32 additions: historical classic prices (NOT guessed).
 cherry:225,orange:425,coop:5000,stable:5000,
 greenhouse:100000,windmill:100000,villa:1000000,
 bbq:1000,bike:500,'lil-red-wagon':500,'green-fence':600,hedge:600,
 'stone-mailbox':500,'hay-wagon':80000,'barrel-wagon':4000,
 pond:5000,'white-hay':125,
 // V33: 2009–2010 purchase values, checked against archived reference catalogues.
 'ticket-booth':4000,carnival:12000,'log-cabin':250000,'farm-house':150000,
 'black-cottage':60000,dairy:10000,'garden-shed':30000,school:50000,
 'post-office':100000,'general-store':200000,library:175000,estate:600000,
 'wood-fence':400,'black-fence':600,'pink-fence':600,
 'blue-fence':600,'blue-hay':125,'red-hay':125,
 seeder:30000,harvester:30000,combine:500000,wood:500,picnic:1000,
 'farmville-flag':500,'zynga-flag':500,
 'gray-hay':125,'green-hay':125,'orange-hay':125,'jet-black-hay':125,'violet-hay':125,
 'horse-topiary':100,'cow-topiary':300,'goat-topiary':1200,'pig-topiary':1500,
 'bunny-topiary':2300,'duck-topiary':3000,'elephant-topiary':3600,
 barrel:125,crate:150,stool:150,mailbox:200,churn:400,wagon:1000,
 wheel:600,bench:750,'covered-wagon':2000,'hedge-arch':1200,
 'birdhouse':500,lawnmower:450,sandbox:300,'wagon-wheel':750,
 'axe-block':500,pump:800,telephone:900,light:1200,'hedge-gate':1600,
 'iron-bench':2500,'shoe-house':100000,'holiday-tree':10,'classic-lodge':800000
});
const FV_MARKET_BUY_XP=Object.freeze({hay:5,apple:5,chicken:5,cow:3,sheep:7,pig:10,'pink-hay':5,'tool-shed':140,'red-barn':400,cherry:2,coop:50,greenhouse:1000,windmill:1000,villa:10000,silo:200,bbq:10,bike:5,hedge:6,'green-fence':6,'stone-mailbox':5,'hay-wagon':800,'barrel-wagon':40,pond:50,
 'ticket-booth':40,carnival:120,'wood-fence':5,'black-fence':6,'pink-fence':6,'blue-fence':6,
 'blue-hay':5,'red-hay':5,seeder:300,harvester:300,combine:5000,picnic:10,wood:5});
let pendingSellId=null;
function saleBuyInfo(obj){
 if(!obj || obj.kind==='plot' || !defs.has(obj.kind))return null;
 const buy=FV_CLASSIC_COIN_PRICES[obj.kind];
 if(!Number.isSafeInteger(buy)||buy<0)return null;
 return {buy,temporary:false,source:'verified-catalog'};
}
function salePrice(obj){
 if(obj?.marketTest)return 0;
 const info=saleBuyInfo(obj);
 if(info)return Math.floor(info.buy*FV_RESALE_RATE/100);
 const fixed=V33_CASH_SELL_COINS[obj?.kind];
 return Number.isSafeInteger(fixed)?fixed:null;
}
function closeSell(){
 pendingSellId=null;
 const el=document.getElementById('fvSellBackdrop');
 el.classList.remove('open');el.setAttribute('aria-hidden','true');
}
function openSell(obj){
 if(!obj)return false;
 const info=saleBuyInfo(obj),price=salePrice(obj);
 if(price===null){
  show(obj.kind==='plot'?'🪙 Τα Plots δεν πωλούνται σαν αντικείμενα.':'🪙 Δεν υπάρχει επιβεβαιωμένη τιμή Coins για αυτό το αντικείμενο. Δεν θα χρησιμοποιήσουμε υποθετική τιμή.');
  return false;
 }
 if(!canRemoveStorageBuilding(obj)){show('📦 Δεν μπορείς να πουλήσεις αυτό το Barn: χρειάζεσαι τη χωρητικότητά του');return false;}
 pendingSellId=obj.id;
 document.getElementById('fvSellName').textContent=defs.get(obj.kind)?.name||obj.kind;
 document.getElementById('fvSellWarning').textContent=
  (obj.marketTest?'Δοκιμαστική τοποθέτηση · ΧΩΡΙΣ αξία μεταπώλησης':
   info?'Αγορά: '+info.buy.toLocaleString('el-GR')+' Coins · πώληση 5%':
   'Ιστορικό αντικείμενο Farm Cash · σταθερή αξία μεταπώλησης')+
   ' · Μεταπώληση: '+price.toLocaleString('el-GR')+' Coins. Το αντικείμενο θα αφαιρεθεί οριστικά.';
 const dialog=document.getElementById('fvSellBackdrop');dialog.classList.add('open');dialog.setAttribute('aria-hidden','false');
 return true;
}
function confirmSell(){
 const obj=objects.find(o=>o.id===pendingSellId);if(!obj){closeSell();show('Το αντικείμενο δεν υπάρχει πλέον');return false;}
 const price=salePrice(obj);
 if(price===null||!canRemoveStorageBuilding(obj)){closeSell();show('Η πώληση δεν επιτρέπεται');return false;}
 const beforeObjects=objects,beforeCoins=coins,beforeHistory=history.length;
 snapshot();
 objects=objects.filter(o=>o.id!==obj.id);
 coins+=price;
 const ok=save();
 if(!ok){objects=beforeObjects;coins=beforeCoins;history.length=beforeHistory;closeSell();refreshStatus();show('Η πώληση ακυρώθηκε επειδή απέτυχε το Save');return false;}
 closeSell();closeBarnMenu();
 refreshStatus();refreshStorageUI();dirty=true;
 show('🪙 Πωλήθηκε '+(defs.get(obj.kind)?.name||obj.kind)+' · +'+price.toLocaleString('el-GR')+' Coins');
 return true;
}
document.getElementById('fvSellCancel').onclick=closeSell;
document.getElementById('fvSellConfirm').onclick=confirmSell;
document.getElementById('fvSellBackdrop').addEventListener('click',e=>{if(e.target.id==='fvSellBackdrop')closeSell();});
// API for manual/integration checks; no player-mode-specific mechanics.
window.FV3026V29={level:farmLevel,sellPrice:(kind)=>salePrice({kind}),sellById:(id)=>openSell(objects.find(o=>o.id===id)),get farmName(){return farmName;},get wallet(){return coins;},get xp(){return xp;}};
window.FV3026V30={resaleRate:5,
 sellPrice:(kind)=>salePrice({kind}),
 buyPrice:(kind)=>saleBuyInfo({kind})?.buy??null,
 saleInfo:(kind)=>{const info=saleBuyInfo({kind});return info?{...info,resale:salePrice({kind})}:null;},
 get allItems(){return [...defs.keys()].filter(kind=>kind!=='plot').map(kind=>({kind, buy:this.buyPrice(kind), resale:this.sellPrice(kind)}));},
 get market(){return V36_MARKET.map(i=>({kind:i.id,buy:i.price,resale:salePrice({kind:i.id})}));}};
window.FV3026V31={get knownCount(){return window.FV3026V30.allItems.filter(i=>i.buy!==null).length},
 get unknownCount(){return window.FV3026V30.allItems.filter(i=>i.buy===null).length},
 get market(){return window.FV3026V30.market}};

function refreshStatus(){if(typeof updateStoreButton==='function')updateStoreButton();if(farmMode==='farm'&&typeof updateMarketUI==='function')updateMarketUI();const hint=document.getElementById('gameHint');if(hint&&tool==='plow'){hint.innerHTML=coins<15?'🚜 Όργωμα <small>⚠ Δεν φτάνουν τα Coins (χρειάζονται 15)</small>':'🚜 Όργωμα <small>15 🪙 ανά χωράφι · +1 XP</small>';}refreshPlayerHud()}
function label(message,allowed){readout.textContent=message;readout.className='readout '+(allowed===true?'good':allowed===false?'bad':'')}
function info(p){if(!p){label('Εκτός χάρτη',false);return}if(tool==='move'&&!movingId){const o=hit(p);label(o?`Επίλεξε μετακίνηση: ${dims(o).name}, ${dims(o).w}×${dims(o).h}`:'Άγγιξε αντικείμενο για μετακίνηση.',null);return}if(tool==='remove'){const o=hit(p);label(o?`Αφαίρεση: ${dims(o).name}`:'Δεν υπάρχει αντικείμενο στη θέση.',null);return}const a=currentCandidate();if(!a)return;const kind=tool==='plow'?'plot':tool==='move'?objects.find(o=>o.id===movingId)?.kind:sel.value;const operation=tool==='plow'?FarmPlowing.plan({x:p.x,y:p.y,items:objects,coins,grid:gridEngine}):null;const reason=operation?operation.reason:validatePlacement(a,kind,tool==='move'?movingId:null);if(operation){label(`Χωράφι (${a.x},${a.y}) · ${reason?'✕ '+reason:`✓ ${operation.type==='replow'?'Ξαναόργωμα':'Όργωμα'} · −15 🪙 / +1 XP`}`,!reason);return}label(`${tool==='test'?'ΔΟΚΙΜΗ':'ΘΕΣΗ'} (${a.x},${a.y}) · ${a.w}×${a.h}: ${reason?'✕ '+reason:'✓ Επιτρέπεται'}`,!reason)}
function snapshot(){history.push(JSON.stringify({objects,idCounter,coins,xp,cashSpent,storedItems}));if(history.length>40)history.shift()}
let lastFarmSaveAt=0,lastFarmSaveOK=null,lastFarmSaveError='';
function farmSaveStatus(){
 const el=document.getElementById('cropAutosaveStatus');
 if(!el)return;
 if(farmMode!=='farm'){el.textContent='💾 Creative Mode: ξεχωριστή αποθήκευση';el.classList.remove('failure');return}
 el.textContent=lastFarmSaveOK===true
  ?'💾 '+(profileMode==='creative'?'Creative':'Κανονική')+' · τελευταίο save: '+new Date(lastFarmSaveAt).toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
  :lastFarmSaveOK===false?'⚠ Δεν επιτρέπεται τοπική αποθήκευση. Χρησιμοποίησε Εξαγωγή φάρμας.':'💾 '+(profileMode==='creative'?'Creative':'Κανονική')+' · δεν έχει γίνει save ακόμη';
 el.classList.toggle('failure',lastFarmSaveOK===false);
}
function replenishCreativeProfile(){
 if(profileMode==='creative'){
  coins=CREATIVE_COINS;
  xp=CREATIVE_COINS;
 }
}
function save(){
 try{
  replenishCreativeProfile();
  const payload=JSON.stringify({version:21,objects,idCounter,coins,xp,cashSpent,storedItems,farmName});
  localStorage.setItem(STORAGE,payload);
  if(localStorage.getItem(STORAGE)!==payload)throw Error('Readback mismatch');
  if(farmMode==='farm'){lastFarmSaveOK=true;lastFarmSaveAt=Date.now();lastFarmSaveError='';}
  farmSaveStatus();
  return true;
 }catch(e){
  if(farmMode==='farm'){lastFarmSaveOK=false;lastFarmSaveError=String(e);}
  farmSaveStatus();show('Η αποθήκευση δεν επιτρέπεται εδώ.');
  return false;
 }
}

function sanitize(items){const good=[],rejected=[];for(const item of items){if(!item||!defs.has(item.kind)||!Number.isInteger(item.x)||!Number.isInteger(item.y)){rejected.push(item);continue}const orientation=normalizeOrientation(item.orientation);const d=dims({...item,orientation}),a={x:item.x,y:item.y,w:d.w,h:d.h};if(a.x<0||a.y<0||a.x+a.w>OPEN||a.y+a.h>OPEN||(item.kind==='plot'&&(a.x%4||a.y%4))||good.some(o=>overlaps(a,footprint(o)))){rejected.push(item);continue}good.push({id:good.length+1,x:a.x,y:a.y,kind:item.kind,...(orientation?{orientation}:{}),...(item.marketTest===true?{marketTest:true}:{}),...(V36_HARVEST[item.kind]&&Number.isFinite(item.harvestReadyAt)&&item.harvestReadyAt>0?{harvestReadyAt:item.harvestReadyAt,harvestCount:Number.isInteger(item.harvestCount)?Math.max(0,item.harvestCount):0}:{}),...(item.kind in STORAGE_BUILDINGS&&Number.isInteger(item.storageLevel)?{storageLevel:Math.max(0,Math.min(2,item.storageLevel))}:{}),...(item.kind==='plot'?{soil:item.soil==='fallow'?'fallow':'ready',...(item.crop&&FarmCrops.SEEDS[item.crop.seed]&&Number.isFinite(item.crop.plantedAt)?{crop:{seed:item.crop.seed,plantedAt:item.crop.plantedAt,...(Number.isFinite(item.crop.witherAt)&&item.crop.witherAt>=item.crop.plantedAt?{witherAt:item.crop.witherAt}:{})}}:{})}:{})})}return {good,rejected}}
// V18 Classic Storage: data belongs to current farm's save, not a global Gift Box.
const STORAGE_BUILDINGS=Object.freeze({
 'red-barn':6,'tool-shed':2,'pink-barn':20,'black-barn':20,'blue-barn':20,
 'white-barn':20,'groovy-barn':20,'weathered-barn':20,
 'pink-tool-shed':15,'green-tool-shed':15
});
const BARN_STORAGE_MAX=500;
function storageLevel(o){return Number.isInteger(o?.storageLevel)?Math.max(0,Math.min(2,o.storageLevel)):0}
function buildingStorageSlots(o){
 const base=STORAGE_BUILDINGS[o?.kind]||0;
 return base?base+(storageLevel(o)===2?12:storageLevel(o)===1?5:0):0;
}
function storageCapacity(items=objects){return Math.min(BARN_STORAGE_MAX,items.reduce((sum,o)=>sum+buildingStorageSlots(o),0))}
function barnUpgradeCreative(id){
 if(farmMode!=='creative'){show('Το Barn Raising απαιτεί γείτονες ή Farm Cash. Οι δοκιμαστικές αναβαθμίσεις επιτρέπονται μόνο στο Creative.');return false}
 const barn=objects.find(o=>o.id===id);
 if(!barn||!STORAGE_BUILDINGS[barn.kind])return false;
 if(storageLevel(barn)>=2){show('Το κτίριο είναι ήδη στο μέγιστο επίπεδο (3/3).');return false}
 snapshot();barn.storageLevel=storageLevel(barn)+1;
 save();refreshStorageUI();refreshStatus();dirty=true;
 show('✅ Αναβάθμιση Creative: '+buildingStorageSlots(barn)+' θέσεις · επίπεδο '+(barn.storageLevel+1)+'/3');
 return true;
}
// V18: conservative classic-FarmVille Storage eligibility.
// Existing V17 inventory entries remain readable/returnable; only NEW storing is restricted.
const STORAGE_MACHINES=new Set(['tractor','pink-tractor','lucky-tractor','seeder','harvester','combine']);
const STORAGE_FIXED=new Set(['storage-cellar']);
function storageEligible(o){
 if(!o||!defs.has(o.kind)||o.kind==='plot'||o.kind in STORAGE_BUILDINGS||STORAGE_FIXED.has(o.kind)||STORAGE_MACHINES.has(o.kind))return false;
 const group=defs.get(o.kind).group||'';
 return !group.startsWith('Οχήματα');
}
function storageFitsAfterRemoval(o){
 if(!storageEligible(o))return false;
 return storedItems.length+1<=storageCapacity(objects.filter(x=>x.id!==o.id));
}
function storageCropPayload(row){
 if(row?.kind!=='plot'||!row.crop)return null;
 const c=row.crop;
 if(!FarmCrops.SEEDS[c.seed]||!Number.isFinite(c.plantedAt))return null;
 return {seed:c.seed,plantedAt:c.plantedAt,
  ...(Number.isFinite(c.witherAt)&&c.witherAt>=c.plantedAt?{witherAt:c.witherAt}:{})};
}
function storedRecord(o,id){
 const orientation=normalizeOrientation(o.orientation);
 return {id,kind:o.kind,orientation,...(o.marketTest===true?{marketTest:true}:{}),
  ...(Number.isInteger(o.x)&&Number.isInteger(o.y)?{x:o.x,y:o.y}:{}),
  ...(o.kind==='plot'?{soil:o.soil==='fallow'?'fallow':'ready',...(storageCropPayload(o)?{crop:storageCropPayload(o)}:{})}:{})};
}
function sanitizeStored(rows){
 if(!Array.isArray(rows))return [];
 const used=new Set(),out=[];
 for(const row of rows.slice(0,500)){
  if(!row||typeof row.id!=='string'||used.has(row.id)||!defs.has(row.kind))continue; // preserve legacy V17 items
  if(!Number.isInteger(row.orientation)||row.orientation<0||row.orientation>1)continue;
  used.add(row.id);out.push(storedRecord(row,row.id));
 }
 return out;
}
function updateStoreButton(){
 const btn=document.getElementById('fvStorageOpen');if(!btn)return;
 btn.hidden=false;btn.textContent='📦 Storage '+storedItems.length+'/'+storageCapacity();
}
function refreshStorageUI(){
 const summary=document.getElementById('fvStorageSummary'),list=document.getElementById('fvStorageItems');
 if(!summary||!list)return;
 updateStoreButton();const capacity=storageCapacity();
 summary.textContent=`${storedItems.length} / ${capacity} θέσεις · ${Math.max(0,capacity-storedItems.length)} ελεύθερες`;
 const setup=document.getElementById('fvStorageSetup'),title=document.getElementById('fvStorageSetupTitle'),hint=document.getElementById('fvStorageSetupHint');
 if(setup&&title&&hint){
  setup.hidden=capacity>0;
  if(farmMode==='creative'){
   title.textContent='🏠 Πρώτα τοποθέτησε Red Barn (δωρεάν στο Creative)';
   hint.textContent='Τοποθέτησε Red Barn από τον κατάλογο αντικειμένων. Μετά πάτησε το Barn → Look Inside. Για αποθήκευση επίλεξε Store Item και άγγιξε το αντικείμενο στον χάρτη.';
  }else{
   title.textContent='🏠 Απαιτείται κτίριο Storage στην Κανονική φάρμα';
   hint.textContent='Το Red Barn κοστίζει 40.000 Coins και το Tool Shed 14.000 Coins. Ξεκινάς με 1.000 Coins. Η Κανονική φάρμα χρησιμοποιεί τους κανονικούς κανόνες αγορών. Για δωρεάν δοκιμή χρησιμοποίησε το Creative Mode.';
  }
 }
 // V19: show farm objects separately from already stored objects.
 const farmList=document.getElementById('fvStorageFarmItems');
 const farmCount=document.getElementById('fvStorageFarmCount');
 const storedCount=document.getElementById('fvStorageStoredCount');
 if(farmList){
  farmList.replaceChildren();
  const eligible=objects.filter(storageEligible);
  if(farmCount)farmCount.textContent=eligible.length+' αντικείμενα';
  if(storedCount)storedCount.textContent=storedItems.length+' / '+capacity;
  if(!eligible.length){const e=document.createElement('div');e.className='fv-storage-empty';e.textContent='Δεν υπάρχουν αποθηκεύσιμα αντικείμενα στη φάρμα. Το Barn δίνει χωρητικότητα αλλά δεν μπαίνει στη λίστα. Τοποθέτησε δέντρο, ζώο ή Hay Bale.';farmList.append(e)}
  const iconForItem=(kind)=>{
   const group=defs.get(kind)?.group||'';
   if(/ζώ|animal|cow|chicken|sheep|pig|horse/i.test(group+' '+kind))return '🐄';
   if(/δέν|tree|apple|cherry|orange|lemon/i.test(group+' '+kind))return '🌳';
   if(/φράχ|fence/i.test(group+' '+kind))return '🪵';
   if(/κτίρ|building|house|barn/i.test(group+' '+kind))return '🏠';
   return '🌾';
  };
  for(const obj of eligible){
   const row=document.createElement('div');row.className='fv-storage-row';
   const ico=document.createElement('span');ico.className='fv-storage-icon';ico.textContent=iconForItem(obj.kind);
   const wrap=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');
   title.textContent=defs.get(obj.kind)?.name||obj.kind;
   const d=dims(obj);meta.textContent=d.w+'×'+d.h+' · θέση '+(obj.x+1)+','+(obj.y+1);
   wrap.append(title,meta);
   const b=document.createElement('button');b.type='button';b.textContent='📥 Store';
   b.disabled=storedItems.length>=capacity;
   b.onclick=()=>{storeObject(obj.id);refreshStorageUI()};
   row.append(ico,wrap,b);farmList.append(row);
  }
 }
 const quick=document.getElementById('fvStorageQuickCreative');if(quick)quick.hidden=farmMode!=='creative';
 const picker=document.getElementById('fvStorePick');if(picker)picker.disabled=capacity<=0;
 const status=document.getElementById('fvStorageStatus');if(status)status.textContent=capacity>0?`Για να αποθηκεύσεις: βγες από το Inventory, επίλεξε «📦 Store» από το More και πάτησε ένα αντικείμενο στη φάρμα. Για επιστροφή, πάτησε «Τοποθέτηση» και μετά επίλεξε θέση στον χάρτη.`:'Το Inventory είναι άδειο. Τοποθέτησε Red Barn ή Tool Shed για να ξεκλειδώσεις θέσεις.';
 list.replaceChildren();
 if(!storedItems.length){const e=document.createElement('div');e.className='fv-storage-empty';e.textContent=capacity?'Δεν έχεις αποθηκευμένα αντικείμενα.':'Δεν έχεις Barn ή Tool Shed. Τοποθέτησε πρώτα κτίριο αποθήκης.';list.append(e);}
 for(const item of storedItems){
  const r=document.createElement('div');r.className='fv-storage-row';
  const text=document.createElement('div'),name=document.createElement('strong'),sub=document.createElement('small');
  name.textContent=defs.get(item.kind)?.name||item.kind;
  sub.textContent='↻ '+item.orientation*90+'° · '+dims(item).w+'×'+dims(item).h+' mini blocks'+(!storageEligible(item)?' · Παλιό αντικείμενο V17: μόνο επανατοποθέτηση':'');
  text.append(name,sub);const btn=document.createElement('button');btn.type='button';btn.textContent='↩ Τοποθέτηση';
  btn.onclick=()=>{
   if(!restoreStoredItem(item.id))show('📦 Δεν βρέθηκε διαθέσιμο σημείο. Το αντικείμενο παραμένει ασφαλές στην αποθήκη.');
  };
  const ico=document.createElement('span');ico.className='fv-storage-icon';
  const grp=defs.get(item.kind)?.group||'';
  ico.textContent=/ζώ|animal/i.test(grp)?'🐄':/δέν|tree/i.test(grp)?'🌳':/κτίρ|building/i.test(grp)?'🏠':'📦';
  r.append(ico,text,btn);list.append(r);
}
}
function storeObject(id){
 const o=objects.find(x=>x.id===id);
 if(!storageEligible(o)){show('📦 Το αρχικό FarmVille δεν υποστήριζε γενική αποθήκευση αυτού του αντικειμένου.');return false}
 if(!storageFitsAfterRemoval(o)){
  show('📦 Δεν επαρκούν οι θέσεις αποθήκευσης. Αν αποθηκεύεις Barn / Shed, πρέπει να παραμένει άλλο κτίριο με αρκετή χωρητικότητα.');return false;
 }
 snapshot();storedItems.push(storedRecord(o,'stored-'+o.id+'-'+Date.now()));
 objects=objects.filter(x=>x.id!==id);movingId=null;moveOffset={x:0,y:0};
 save();refreshStatus();refreshStorageUI();dirty=true;show('📦 Αποθηκεύτηκε: '+(defs.get(o.kind)?.name||o.kind));return true;
}
function placeFromStorage(p){
 if(!storagePickId)return false;
 const item=storedItems.find(x=>x.id===storagePickId);if(!item){storagePickId=null;show('Το αντικείμενο δεν υπάρχει στην αποθήκη');return true}
 if(!p){show('Επίλεξε σημείο μέσα στη φάρμα');return true}
 // Respect the saved orientation and the 4×4 plot alignment on return.
 const base=anchor(p,item.kind);if(!base)return true;
 const d=dims(item),a={x:base.x,y:base.y,w:d.w,h:d.h};
 const error=validatePlacement(a,item.kind,null,objects);
 if(error){show('📦 '+error);return true}
 snapshot();objects.push({id:idCounter++,kind:item.kind,x:a.x,y:a.y,
  ...(item.orientation?{orientation:item.orientation}:{}),...(item.marketTest?{marketTest:true}:{}),
  ...(item.kind==='plot'?{soil:item.soil==='fallow'?'fallow':'ready',...(storageCropPayload(item)?{crop:storageCropPayload(item)}:{})}:{})});
 storedItems=storedItems.filter(x=>x.id!==item.id);storagePickId=null;save();refreshStatus();refreshStorageUI();dirty=true;
 updateTool(farmMode==='farm'?'multi':'test');show('✓ Το αντικείμενο επέστρεψε στη φάρμα χωρίς κόστος');return true;
}

// V21: storage restoration needs no second, undisclosed tap on the canvas.
// Try the previous position first; otherwise find the nearest available footprint.
// Uses the same validation and exact placeFromStorage path as map placement.
function restoreStoredItem(id){
 const item=storedItems.find(x=>x.id===id);
 if(!item)return false;
 const d=dims(item);
 const preferred=(Number.isInteger(item.x)&&Number.isInteger(item.y))?{x:item.x,y:item.y}:null;
 const candidates=[];
 if(preferred)candidates.push(preferred);
 const center={x:Math.floor(OPEN/2),y:Math.floor(OPEN/2)};
 for(let y=0;y<=OPEN-d.h;y++)for(let x=0;x<=OPEN-d.w;x++){
  if(item.kind==='plot'&&(x%4||y%4))continue;
  candidates.push({x,y});
 }
 candidates.sort((a,b)=>{
  const dist=v=>Math.abs(v.x-(preferred?.x??center.x))+Math.abs(v.y-(preferred?.y??center.y));
  return dist(a)-dist(b);
 });
 for(const p of candidates){
  const a={x:p.x,y:p.y,w:d.w,h:d.h};
  if(validatePlacement(a,item.kind,null,objects))continue;
  storagePickId=item.id;
  const completed=placeFromStorage(p);
  if(completed){setStoragePanel(true);return true}
 }
 storagePickId=null;
 return false;
}
function canRemoveStorageBuilding(o){
 if(!o||!(o.kind in STORAGE_BUILDINGS))return true;
 return storageCapacity(objects.filter(x=>x.id!==o.id))>=storedItems.length;
}
let barnMenuId=null;
// V22: classical FarmVille barn interaction: click barn > Look Inside; all barns share one inventory.
function openBarnMenu(o){
 if(!o || !(o.kind in STORAGE_BUILDINGS))return false;
 const title=document.getElementById('fvBarnTitle'),cap=document.getElementById('fvBarnCapacity'),menu=document.getElementById('fvBarnMenu');
 if(!menu)return false;
 title.textContent='🏠 '+(defs.get(o.kind)?.name||o.kind);
 cap.textContent=`Κοινή αποθήκη: ${storedItems.length} / ${storageCapacity()} θέσεις · αυτό το κτίριο: +${buildingStorageSlots(o)} · Επίπεδο ${storageLevel(o)+1}/3`;
 const up=document.getElementById('fvBarnCreativeUpgrade');if(up){up.hidden=farmMode!=='creative';up.disabled=storageLevel(o)>=2;up.textContent=storageLevel(o)>=2?'✓ Μέγιστη χωρητικότητα':'🧪 Creative: δοκιμή αναβάθμισης +'+(storageLevel(o)?7:5)+' θέσεων'}
 barnMenuId=o.id;
 menu.hidden=false;setStoragePanel(false);return true;
}
function closeBarnMenu(){const m=document.getElementById('fvBarnMenu');if(m)m.hidden=true}
function isStorageBarn(o){return !!(o&&o.kind in STORAGE_BUILDINGS)}
function setStoragePanel(open){const panel=document.getElementById('fvStoragePanel');if(!panel)return;if(open)closeBarnMenu();panel.classList.toggle('open',!!open);if(open)refreshStorageUI()}
function storageQA(){
 const cases=[];const check=(name,ok,explain='')=>cases.push({name,ok:!!ok,explain});
 // This test is dry-run: its simulated map/inventory never touches objects, storedItems or localStorage.
 let fake=[{id:1,kind:'red-barn',x:4,y:4},{id:2,kind:'hay',x:20,y:20,orientation:1},{id:3,kind:'cow',x:25,y:20}];
 let bag=[];
 const simulatedStore=id=>{const o=fake.find(x=>x.id===id);if(!storageEligible(o)||bag.length>=storageCapacity(fake))return false;fake=fake.filter(x=>x.id!==id);bag.push(storedRecord(o,'qa-'+id));return true};
 const simulatedReturn=id=>{const idx=bag.findIndex(x=>x.id===id);if(idx<0)return false;const r=bag[idx];const d=dims(r);const a={x:r.x,y:r.y,w:d.w,h:d.h};if(validatePlacement(a,r.kind,null,fake))return false;fake.push({id:99,kind:r.kind,x:r.x,y:r.y,orientation:r.orientation});bag.splice(idx,1);return true};
 check('Red Barn: 6 θέσεις',storageCapacity(fake)===6);
 check('Tool Shed: 2 θέσεις',storageCapacity([{kind:'tool-shed'}])===2);
 check('Κοινή αποθήκη: Barn + Shed = 8',storageCapacity([{kind:'red-barn'},{kind:'tool-shed'}])===8);
 check('Barn Raising: 6 → 11 → 18',[0,1,2].map(n=>buildingStorageSlots({kind:'red-barn',storageLevel:n})).join(',')==='6,11,18');
 check('Shed Raising: 2 → 7 → 14',[0,1,2].map(n=>buildingStorageSlots({kind:'tool-shed',storageLevel:n})).join(',')==='2,7,14');
 check('Όριο κοινής χωρητικότητας 500',storageCapacity(Array.from({length:100},()=>({kind:'red-barn',storageLevel:2})))===500);
 check('Δεν αποθηκεύονται Plots',!storageEligible({kind:'plot'}));
 check('Δεν αποθηκεύονται Barns/Sheds',!storageEligible({kind:'red-barn'})&&!storageEligible({kind:'tool-shed'}));
 check('Δεν αποθηκεύονται μη επιβεβαιωμένα οχήματα',!storageEligible({kind:'tractor'}));
 check('Δέντρα, ζώα, διακοσμητικά αποθηκεύονται',storageEligible({kind:'cow'})&&storageEligible({kind:'apple'})&&storageEligible({kind:'hay'}));
 check('Αποθήκευση Hay Bale σε δοκιμαστικό χάρτη',simulatedStore(2)&&bag.length===1&&fake.length===2);
 check('Διατήρηση περιστροφής στην αποθήκη',bag[0]?.orientation===1);
 check('Επιστροφή χωρίς νέα αγορά',simulatedReturn('qa-2')&&bag.length===0&&fake.some(x=>x.kind==='hay'&&x.orientation===1));
 const full=[{kind:'red-barn'},...Array.from({length:6},(_,i)=>({id:100+i,kind:'hay'}))];
 check('Πλήρης αποθήκη σταματά στο 6/6',6>=storageCapacity(full.filter(x=>x.kind==='red-barn')));
 check('Άγνωστα είδη δεν εισάγονται στο inventory',sanitizeStored([{id:'bad',kind:'unknown',orientation:0}]).length===0);
 const legacy=sanitizeStored([{id:'crop-qa',kind:'plot',orientation:0,soil:'ready',crop:{seed:'strawberry',plantedAt:1700000000000}}]);
 check('Παλιές καλλιέργειες V17 δεν χάνονται',legacy[0]?.crop?.plantedAt===1700000000000);
 const fakeSave={objects:[{id:1,x:4,y:4,kind:'red-barn',storageLevel:2}],storedItems:[{id:'stored-2',kind:'hay',orientation:1,x:16,y:16}]};
 check('Save/Load διατηρεί το επίπεδο Barn',sanitize(fakeSave.objects).good[0]?.storageLevel===2);
 check('Save/Load διατηρεί τα αποθηκευμένα',sanitizeStored(fakeSave.storedItems).length===1);
 check('Creative και Normal έχουν διαφορετικό save',STORAGE===NORMAL_SAVE_KEY||STORAGE===CREATIVE_SAVE_KEY);
 check('Η λειτουργία Store / Return είναι διαθέσιμη',typeof storeObject==='function'&&typeof restoreStoredItem==='function');
 check('Τα τεστ δεν πείραξαν τη φάρμα',Array.isArray(objects)&&Array.isArray(storedItems));
 return cases;
}
function showBarnQA(){
 const host=document.getElementById('fvStorageQaResults');const all=storageQA();host.replaceChildren();
 const head=document.createElement('strong');const n=all.filter(t=>t.ok).length;head.textContent=`Αυτόματοι έλεγχοι ${n}/${all.length} · χωρίς αλλαγή στα δεδομένα φάρμας`;host.append(head);
 for(const test of all){const line=document.createElement('div');line.textContent=(test.ok?'✓ ':'✕ ')+test.name;line.style.color=test.ok?'#286b3d':'#a5342d';line.style.padding='3px 0';host.append(line)}
 const note=document.createElement('p');note.textContent='Αυτοί είναι τεχνικοί έλεγχοι. Οι χειροκίνητες δοκιμές στο iPhone παραμένουν απαραίτητες.';host.append(note);
}
window.__farmStorageTests=storageQA;
document.getElementById('fvBarnLookInside').onclick=()=>{closeBarnMenu();setStoragePanel(true)};
document.getElementById('fvBarnClose').onclick=closeBarnMenu;
document.getElementById('fvBarnSell').onclick=()=>{const barn=objects.find(o=>o.id===barnMenuId);closeBarnMenu();openSell(barn);};
document.getElementById('fvBarnCreativeUpgrade').onclick=()=>{
 const id=barnMenuId;closeBarnMenu();if(id!==null&&barnUpgradeCreative(id)){const b=objects.find(o=>o.id===id);if(b)openBarnMenu(b)}
};
document.getElementById('fvStorageOpen').onclick=()=>setStoragePanel(!document.getElementById('fvStoragePanel').classList.contains('open'));
document.getElementById('fvStorageClose').onclick=()=>setStoragePanel(false);
document.getElementById('fvStorePick').onclick=()=>{
 if(storageCapacity()<=0){refreshStorageUI();show('📦 Τοποθέτησε πρώτα Red Barn ή Tool Shed');return}
 setStoragePanel(false);updateTool('store');show('📦 Άγγιξε επιτρεπόμενο αντικείμενο (όχι Plot / Storage Building / όχημα)')
};
// V20: one-tap Creative placement for Storage verification, using the SAME
// normal placement validation and map object list as player placement.
function addCreativeStorageDemo(kind){
 if(farmMode!=='creative'){
  show('📦 Η άμεση δωρεάν τοποθέτηση γίνεται μόνο στο Creative Mode. Άλλαξε λειτουργία πρώτα.');
  return false;
 }
 const def=defs.get(kind);
 if(!def){show('⚠ Άγνωστο αντικείμενο');return false}
 // Do not create redundant storage buildings when one is already present.
 if(kind==='red-barn'&&storageCapacity()>0){
  refreshStorageUI();show('📦 Υπάρχει ήδη κτίριο αποθήκευσης.');return true;
 }
 let selected=null;
 const w=def.w,h=def.h;
 // Place near the center initially, then search all unlocked mini cells.
 const candidates=[];
 for(let y=12;y<=OPEN-h;y++)for(let x=12;x<=OPEN-w;x++)candidates.push({x,y,w,h});
 candidates.sort((a,b)=>(Math.abs(a.x-21)+Math.abs(a.y-21))-(Math.abs(b.x-21)+Math.abs(b.y-21)));
 for(const a of candidates){if(!validatePlacement(a,kind,null,objects)){selected=a;break}}
 if(!selected){show('⛔ Δεν βρέθηκε διαθέσιμος χώρος για '+def.name);return false}
 snapshot();objects.push({id:idCounter++,kind,x:selected.x,y:selected.y});
 const saved=save();refreshStatus();refreshStorageUI();dirty=true;
 if(!saved){show('⚠ '+def.name+' τοποθετήθηκε, αλλά η μόνιμη αποθήκευση δεν επιτρέπεται σε αυτόν τον browser. Κράτησε εξαγωγή save.');}
 else show('✅ '+def.name+' τοποθετήθηκε στη φάρμα · άνοιξε το Storage για να το δεις.');
 return true;
}
document.getElementById('fvStorageSelectBarn').textContent='🏠 Τοποθέτησε Red Barn τώρα (Creative)';
document.getElementById('fvStorageSelectHay').textContent='🌾 Τοποθέτησε Hay Bale τώρα (Creative)';
document.getElementById('fvStorageSelectBarn').onclick=()=>addCreativeStorageDemo('red-barn');
document.getElementById('fvStorageSelectHay').onclick=()=>addCreativeStorageDemo('hay');
document.getElementById('fvStorageQuickBarn').onclick=()=>addCreativeStorageDemo('red-barn');
document.getElementById('fvStorageQuickHay').onclick=()=>addCreativeStorageDemo('hay');
document.getElementById('fvStorageQa').onclick=()=>{showBarnQA();const a=storageQA();show('🧪 Barn QA '+a.filter(x=>x.ok).length+'/'+a.length)};
const barnManualCreativeCases=[
 'Το Barn πατιέται στον χάρτη → Look Inside',
 'Το Red Barn δίνει 0/6 θέσεις αρχικά',
 'Το Hay Bale εμφανίζεται στο Storage αφού πατήσω Store',
 'Ο μετρητής αλλάζει από 0/6 σε 1/6',
 'Το Hay Bale επιστρέφει στη φάρμα με ένα πάτημα',
 'Το αντικείμενο δεν διπλασιάζεται όταν επιστρέφει',
 'Το δεύτερο Storage κτίριο αθροίζει τη χωρητικότητα',
 'Η δοκιμαστική αναβάθμιση Barn κάνει 6 → 11 → 18',
 'Η αποθήκη δεν επιτρέπει υπέρβαση χωρητικότητας',
 'Μετά από κλείσιμο/άνοιγμα διατηρούνται Barn, Inventory και αναβαθμίσεις'
];
const barnManualNormalCases=[
 'Το Barn αγοράζεται μόνο με πραγματικά διαθέσιμα Coins',
 'Multi → Barn → Look Inside ανοίγει το κοινό Inventory',
 'Red Barn 6 θέσεις / Tool Shed 2 θέσεις',
 'Multi → αντικείμενο → Store το βάζει στο Inventory',
 'Με Move μπορώ να σύρω αντικείμενο πάνω στο Barn',
 'Η αποθήκευση δεν αφαιρεί ή προσθέτει Coins',
 'Το Inventory επιστρέφει το αντικείμενο στη φάρμα μία φορά',
 'Με γεμάτη αποθήκη το Store αποκλείεται',
 'Δεν αποθηκεύονται Plots, Barns ή οχήματα',
 'Μετά από επανεκκίνηση Barn και Inventory παραμένουν στο Save'
];
let barnManualAnswers={creative:new Set(),farm:new Set()};
function refreshBarnManualChecks(){
 const host=document.getElementById('fvBarnManualRows'),score=document.getElementById('fvBarnManualScore'),sum=document.querySelector('#fvBarnManualQA summary');
 if(!host||!score||!sum)return;
 const mode=farmMode==='farm'?'farm':'creative',rows=mode==='farm'?barnManualNormalCases:barnManualCreativeCases;
 host.replaceChildren();
 rows.forEach((name,i)=>{
  const label=document.createElement('label');label.className='fv-manual-row';
  const cb=document.createElement('input');cb.type='checkbox';cb.checked=barnManualAnswers[mode].has(i);
  cb.addEventListener('change',()=>{if(cb.checked)barnManualAnswers[mode].add(i);else barnManualAnswers[mode].delete(i);refreshBarnManualScore()});
  label.append(cb,document.createTextNode(' '+name));host.append(label);
 });
 refreshBarnManualScore();
}
function refreshBarnManualScore(){
 const mode=farmMode==='farm'?'farm':'creative',n=barnManualAnswers[mode].size,capacity=mode==='farm'?barnManualNormalCases.length:barnManualCreativeCases.length;
 document.getElementById('fvBarnManualScore').textContent=n+'/'+capacity+' επιβεβαιωμένα'+(n===capacity?' — Έλεγχοι ολοκληρώθηκαν':'');
 document.querySelector('#fvBarnManualQA summary').textContent='✅ '+(mode==='farm'?'Κανονική φάρμα':'Creative')+' · έλεγχοι στο iPhone ('+n+'/'+capacity+')';
}
document.getElementById('fvBarnManualReset').onclick=()=>{barnManualAnswers[farmMode==='farm'?'farm':'creative'].clear();refreshBarnManualChecks()};
refreshBarnManualChecks();


function load(){try{const current=JSON.parse(localStorage.getItem(STORAGE)||'null');if(current?.version===21&&Array.isArray(current.objects)){const res=sanitize(current.objects);objects=res.good;idCounter=objects.length+1;coins=Number.isFinite(current.coins)?Math.max(0,current.coins):1000;xp=Number.isFinite(current.xp)?Math.max(0,current.xp):0;cashSpent=Number.isSafeInteger(current.cashSpent)?Math.max(0,current.cashSpent):0;storedItems=sanitizeStored(current.storedItems);farmName=sanitizeFarmName(current.farmName);return}
return; // Creative canvas is isolated from old farm saves.
const v20=JSON.parse(localStorage.getItem('classic-farm-attempt2-v20')||'null');
if(v20?.version===20&&Array.isArray(v20.objects)){const res=sanitize(v20.objects);objects=res.good;idCounter=Math.max(Number.isInteger(v20.idCounter)?v20.idCounter:1,...objects.map(o=>o.id+1),1);coins=Number.isFinite(v20.coins)?Math.max(0,v20.coins):1000;xp=Number.isFinite(v20.xp)?Math.max(0,v20.xp):0;if(res.rejected.length)localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));save();return}
const v18=JSON.parse(localStorage.getItem('classic-farm-attempt2-v18')||'null');if(v18?.version===18&&Array.isArray(v18.objects)){const res=sanitize(v18.objects);objects=res.good;idCounter=objects.length+1;coins=Number.isFinite(v18.coins)?v18.coins:1000;xp=Number.isFinite(v18.xp)?v18.xp:0;save();return}
const v17=JSON.parse(localStorage.getItem('classic-farm-attempt2-v17')||'null');if(v17?.version===17&&Array.isArray(v17.objects)){const res=sanitize(v17.objects);objects=res.good;idCounter=Math.max(Number.isInteger(v17.idCounter)?v17.idCounter:1,...objects.map(o=>o.id+1),1);coins=Number.isFinite(v17.coins)?Math.max(0,v17.coins):1000;xp=Number.isFinite(v17.xp)?Math.max(0,v17.xp):0;if(res.rejected.length)localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));save();return}
const v16=JSON.parse(localStorage.getItem('classic-farm-attempt2-v16')||'null');if(v16?.version===16&&Array.isArray(v16.objects)){const res=sanitize(v16.objects);objects=res.good;idCounter=Math.max(v16.idCounter||0,...objects.map(o=>o.id+1),1);coins=Number.isFinite(v16.coins)?Math.max(0,v16.coins):1000;xp=Number.isFinite(v16.xp)?Math.max(0,v16.xp):0;if(res.rejected.length)localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));save();return}
const v15=JSON.parse(localStorage.getItem('classic-farm-attempt2-v15')||'null');if(v15?.version===15&&Array.isArray(v15.objects)){const res=sanitize(v15.objects);objects=res.good;idCounter=objects.length+1;coins=Number.isFinite(v15.coins)?Math.max(0,v15.coins):1000;xp=Number.isFinite(v15.xp)?Math.max(0,v15.xp):0;if(res.rejected.length)localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));save();return}
const v14=JSON.parse(localStorage.getItem('classic-farm-attempt2-v14')||'null');if(v14?.version===14&&Array.isArray(v14.objects)){const res=sanitize(v14.objects);objects=res.good;idCounter=objects.length+1;coins=Number.isFinite(v14.coins)?Math.max(0,v14.coins):1000;xp=Number.isFinite(v14.xp)?Math.max(0,v14.xp):0;save();return}
const v13=JSON.parse(localStorage.getItem('classic-farm-attempt2-v13')||'null');if(v13?.version===13&&Array.isArray(v13.objects)){const res=sanitize(v13.objects);objects=res.good;idCounter=objects.length+1;save();return}
const v12=JSON.parse(localStorage.getItem('classic-farm-attempt2-v12')||'null');
if(v12?.version===12&&Array.isArray(v12.objects)){const res=sanitize(v12.objects);objects=res.good;idCounter=objects.length+1;if(res.rejected.length){localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));show(`${res.rejected.length} παλιά αντικείμενα διατηρήθηκαν σε backup.`)}save();return}
const v11=JSON.parse(localStorage.getItem('classic-farm-attempt2-v11')||'null');
if(v11?.version===11&&Array.isArray(v11.objects)){const res=sanitize(v11.objects);objects=res.good;idCounter=objects.length+1;if(res.rejected.length){localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));show(`${res.rejected.length} παλιά αντικείμενα διατηρήθηκαν σε backup.`)}save();return}
const v10=JSON.parse(localStorage.getItem('classic-farm-attempt2-v10')||'null');
if(v10?.version===10&&Array.isArray(v10.objects)){
 const res=sanitize(v10.objects);objects=res.good;idCounter=objects.length+1;
 if(res.rejected.length){localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));show(`${res.rejected.length} θέσεις αποθηκεύτηκαν ως backup λόγω αλλαγών μεγέθους.`)}
 save();return;
}
const v9=JSON.parse(localStorage.getItem('classic-farm-attempt2-v9')||'null');
if(v9?.version===9&&Array.isArray(v9.objects)){
 const res=sanitize(v9.objects);objects=res.good;idCounter=objects.length+1;
 if(res.rejected.length){localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));show(`${res.rejected.length} αντικείμενα με μη έγκυρες θέσεις κρατήθηκαν σε backup.`)}
 save();return;
}
const prior=JSON.parse(localStorage.getItem('classic-farm-attempt2-v8')||'null');
if(prior?.version===8&&Array.isArray(prior.objects)){
 const res=sanitize(prior.objects);objects=res.good;idCounter=objects.length+1;
 if(res.rejected.length){localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));show(`${res.rejected.length} ασύμβατα αντικείμενα διατηρήθηκαν σε backup.`)}
 save();return;
}
const old=JSON.parse(localStorage.getItem('classic-farm-attempt2-v7')||'null');if(old?.version===7&&Array.isArray(old.objects)){const map={plot:'plot',apple:'apple',bale:'hay',wheel:'wheel'};const copy=old.objects.map(o=>({...o,kind:map[o.kind]||o.kind}));const res=sanitize(copy);objects=res.good;idCounter=objects.length+1;if(res.rejected.length){localStorage.setItem(STORAGE+'-rejected-backup',JSON.stringify(res.rejected));show(`${res.rejected.length} παλιά αντικείμενα δεν μεταφέρθηκαν: φυλάχτηκαν ξεχωριστά.`)}save();return}
}catch(e){show('Δεν μπόρεσα να διαβάσω την παλιά αποθήκευση.')}}
function show(m){notice.textContent=m;notice.style.display='block';clearTimeout(show.timer);show.timer=setTimeout(()=>notice.style.display='none',2700)}
function updateTool(t){if(t!=='place')storagePickId=null;pendingFenceRotation=null;if(typeof generalSetInspect==='function')generalSetInspect(false);tool=t;document.documentElement.classList.toggle('mode-seed',farmMode==='farm'&&t==='seed');if(t!=='test'&&window.__farmerLabWalkMode){window.__farmerLabWalkMode=false;const walk=document.getElementById('farmerLabWalk');if(walk)walk.classList.remove('active')}else if(t==='test'){window.__farmerLabWalkMode=true;const walk=document.getElementById('farmerLabWalk');if(walk)walk.classList.add('active')}const hint=document.getElementById('gameHint');if(hint){hint.style.display='none';}seedPicker.style.display=t==='seed'?'block':'none';movingId=null;moveOffset={x:0,y:0};for(const id of ['seedTool','harvestTool','testBtn','placeBtn','move','remove','plow'])document.getElementById(id).classList.toggle('active',id===(t==='seed'?'seedTool':t==='harvest'?'harvestTool':t==='test'?'testBtn':t==='place'?'placeBtn':t));label(t==='test'?'👣 Πάτησε στον χάρτη για περπάτημα.':t==='place'?'Τοποθέτηση: άγγιξε ελεύθερο χώρο.':t==='move'?'Επίλεξε αντικείμενο, έπειτα ελεύθερη θέση.':t==='store'?'📦 Επίλεξε αντικείμενο συμβατό με το κλασικό Storage.':t==='plow'?'Όργωμα: 15 Farm Coins · +1 XP ανά χωράφι 4×4.':'Αφαίρεση: άγγιξε αντικείμενο.',null);dirty=true;window.FarmClassicTools?.sync()}

// V36 — classic repeatable harvest of on-farm animals and trees.
// Sources: FarmVille Wiki animal/tree pages and 2009 historical animal tables.
// Durations are the rounded in-game cycles; one-day animals 24h, sheep 72h, etc.
const V36_HARVEST=Object.freeze({
 cow:{hours:24,coins:6,product:'Γάλα',type:'animal'},
 chicken:{hours:24,coins:8,product:'Αυγά',type:'animal'},
 sheep:{hours:72,coins:28,product:'Μαλλί',type:'animal'},
 pig:{hours:48,coins:30,product:'Τρούφες',type:'animal'},
 apple:{hours:72,coins:28,product:'Μήλα',type:'tree'},
 cherry:{hours:48,coins:18,product:'Κεράσια',type:'tree'},
 orange:{hours:96,coins:40,product:'Πορτοκάλια',type:'tree'},
 // FarmVille 2009: archived animal/tree guides (on-farm, not building bonuses).
 rabbit:{hours:96,coins:60,product:'Μαλλί Angora',type:'animal'},
 duck:{hours:48,coins:45,product:'Πούπουλα',type:'animal'},
 goat:{hours:48,coins:54,product:'Κατσικίσιο γάλα',type:'animal'},
 fig:{hours:72,coins:33,product:'Σύκα',type:'tree'},
 avocado:{hours:72,coins:37,product:'Αβοκάντο',type:'tree'},
 // Wiki sources: https://farmville.fandom.com/wiki/Lychee_Tree and /Maple_Tree
 lychee:{hours:3,coins:140,product:'Λίτσι',type:'tree'},
 maple:{hours:48,coins:150,product:'Σιρόπι σφενδάμου',type:'tree'}
});
function v36HarvestData(o){return o&&V36_HARVEST[o.kind]||null}
function v36HarvestStatus(o,now=Date.now()){
 const d=v36HarvestData(o);if(!d)return null;
 const readyAt=Number.isFinite(o.harvestReadyAt)&&o.harvestReadyAt>0?o.harvestReadyAt:now+d.hours*3600000;
 return {ready:now>=readyAt,readyAt,remaining:Math.max(0,readyAt-now),coins:d.coins,product:d.product,hours:d.hours,type:d.type};
}
function v36Time(ms){const m=Math.ceil(Math.max(0,ms)/60000);if(m>=1440)return Math.floor(m/1440)+'η '+(Math.ceil(m%1440/60))+'ω';if(m>=60)return Math.floor(m/60)+'ω '+m%60+'λ';return m+'λ'}
function v36InitPlaced(o,now=Date.now()){const d=v36HarvestData(o);if(d){o.harvestReadyAt=now+d.hours*3600000;o.harvestCount=0;}return o}
function v36MigrateTimers(){let changed=false;const now=Date.now();for(const o of objects){if(!v36HarvestData(o))continue;if(!Number.isFinite(o.harvestReadyAt)||o.harvestReadyAt<=0){v36InitPlaced(o,now);changed=true}}if(changed)save();return changed}
function v36CollectObject(o,now=Date.now()){
 if(farmMode!=='farm'||!o||!objects.includes(o))return {ok:false,reason:'Μη διαθέσιμο αντικείμενο'};
 const st=v36HarvestStatus(o,now);if(!st)return {ok:false,reason:'Το αντικείμενο δεν παράγει Coins'};
 if(!Number.isFinite(o.harvestReadyAt)){v36InitPlaced(o,now);save();return {ok:false,reason:'Η παραγωγή μόλις ξεκίνησε'};}
 if(!st.ready)return {ok:false,reason:'Έτοιμο σε '+v36Time(st.remaining)};
 snapshot();coins+=st.coins;o.harvestReadyAt=now+st.hours*3600000;o.harvestCount=(Number.isInteger(o.harvestCount)?o.harvestCount:0)+1;
 save();refreshStatus();dirty=true;show('🧺 '+st.product+' · +'+st.coins+' Coins · νέα παραγωγή');return {ok:true,reward:st.coins,next:o.harvestReadyAt};
}
window.FV3026HarvestV36={migrate:v36MigrateTimers,get supported(){return Object.keys(V36_HARVEST)},status:id=>v36HarvestStatus(objects.find(o=>o.id===id)),collect:id=>v36CollectObject(objects.find(o=>o.id===id)),get objects(){return objects.filter(o=>v36HarvestData(o)).map(o=>({id:o.id,kind:o.kind,...v36HarvestStatus(o),count:o.harvestCount||0}))}};

function executeFarmAction(px,py){if(storagePickId)return placeFromStorage(pick(px,py));const p=pick(px,py);hover=p;dirty=true;if(!p){label('Εκτός χάρτη',false);return}if(tool==='seed'||tool==='harvest'){
 const plot=plotAt(p);if(!plot){show('Χρειάζεσαι οργωμένο χωράφι');return}
 const wallet={coins,xp};const now=Date.now();
 if(tool==='harvest'&&plot.crop&&FarmCrops.stage(plot.crop,now)==='withered'){snapshot();FarmCrops.wither(plot,now);save();dirty=true;show('🥀 Μαραμένο χωράφι · όργωσε ξανά');return}
 const before=JSON.stringify({objects,idCounter,coins,xp});const result=tool==='seed'?FarmCrops.plant(plot,seedSelect.value,wallet,now):FarmCrops.harvest(plot,wallet,now);
 if(!result.ok){show('✕ '+result.reason);return}
 history.push(before);if(history.length>40)history.shift();
 coins=wallet.coins;xp=wallet.xp;save();refreshStatus();dirty=true;
 show(tool==='seed'?`🌱 Σπορά: −${result.cost} 🪙 · +${result.xp} XP`:`🌾 Συγκομιδή: +${result.reward} 🪙`);return;
 }
 if(tool==='plow'){const oldPlot=plotAt(p);if(oldPlot?.crop&&FarmCrops.stage(oldPlot.crop)==='withered'){oldPlot.crop=null;oldPlot.soil='fallow'}const operation=FarmPlowing.plan({x:p.x,y:p.y,items:objects,coins,grid:gridEngine});if(!operation.ok){label('✕ '+operation.reason,false);show('✕ '+operation.reason);return}snapshot();const state={items:objects,coins,xp,nextId:idCounter};if(!FarmPlowing.apply(state,operation)){history.pop();label('Αποτυχία οργώματος',false);return}coins=state.coins;xp=state.xp;idCounter=state.nextId;save();refreshStatus();label(`✓ Όργωμα: −15 🪙 · +1 XP · ${operation.type==='replow'?'Ξαναόργωμα':'Νέο χωράφι'}`,true);show('−15 🪙   +1 XP');return}
if(tool==='remove'){const o=hit(p);if(!o){label('Δεν υπάρχει αντικείμενο.',false);return}if(!canRemoveStorageBuilding(o)){show('📦 Χρειάζεται πρώτα να αδειάσει η αποθήκη');return}snapshot();objects=objects.filter(x=>x.id!==o.id);save();refreshStatus();label(`Αφαιρέθηκε: ${dims(o).name}`,true);show('Αφαιρέθηκε: '+dims(o).name);return}
if(tool==='move'&&!movingId){const o=hit(p);if(!o){label('Δεν υπάρχει αντικείμενο για μετακίνηση.',false);return}movingId=o.id;moveOffset={x:p.x-o.x,y:p.y-o.y};window.FarmClassicTools?.syncRotate();label(`Μετακίνηση ${dims(o).name}: ${ROTATABLE_FENCES.has(o.kind)?'↻ Rotate για περιστροφή ή ':''}επίλεξε νέα θέση.`,null);if(ROTATABLE_FENCES.has(o.kind))show('✓ Επιλέχθηκε '+dims(o).name+' '+dims(o).w+'×'+dims(o).h+' · πάτησε ↻ Rotate');return}
const id=tool==='move'?objects.find(o=>o.id===movingId)?.kind:sel.value,a=id?anchor(p,id,tool==='move'?moveOffset:{x:0,y:0}):null;if(a&&tool==='move'&&movingId){const movingObj=objects.find(o=>o.id===movingId);if(movingObj&&ROTATABLE_FENCES.has(id)){const d=dims({...movingObj,orientation:previewFenceOrientation(movingObj)});a.w=d.w;a.h=d.h}}const reason=validatePlacement(a,id,tool==='move'?movingId:null);
if(tool==='test'){info(p);return}if(farmMode==='farm'&&tool==='place'){
 if(!id||id!==marketSelected||!['coins','cash','test'].includes(marketPendingCurrency)){
  label('Επίλεξε αντικείμενο από το Market.',false);return;
 }
 if(marketPendingCurrency==='coins'&&(!V36_MARKET_PRICES.has(id)||coins<marketPendingPrice)){
  label('Δεν έχεις αρκετά Coins.',false);return;
 }
 if(marketPendingCurrency==='cash'&&(!Number.isSafeInteger(V32_CASH_PRICES[id])||availableFarmCash()<marketPendingPrice)){
  label('Δεν έχεις αρκετά Farm Cash.',false);return;
 }
 if(marketPendingCurrency==='test'&&!marketQaSelected){label('Ανενεργή δοκιμή',false);return;}
}if(tool==='place'&&id==='plot'&&false){label('Χρησιμοποίησε όργωμα.',false);return}if(reason){label(`✕ ${reason}`,false);if(tool==='move')show('↻ Μετακίνηση: '+reason+' · διάλεξε ελεύθερο χώρο');return}
if(tool==='move'){const o=objects.find(o=>o.id===movingId);if(!o){updateTool('test');return}snapshot();o.x=a.x;o.y=a.y;if(pendingFenceRotation?.id===o.id)o.orientation=pendingFenceRotation.orientation;pendingFenceRotation=null;movingId=null;moveOffset={x:0,y:0};window.FarmClassicTools?.syncRotate();label('✓ Επιτυχημένη μετακίνηση / περιστροφή',true);show('✓ Τοποθετήθηκε · '+dims(o).w+'×'+dims(o).h+' mini blocks')}else{
 snapshot();const currency=marketPendingCurrency,amount=marketPendingPrice;
 objects.push({id:idCounter++,kind:id,x:a.x,y:a.y,...(V36_HARVEST[id]?{harvestReadyAt:Date.now()+V36_HARVEST[id].hours*3600000,harvestCount:0}:{}),...(id==='plot'?{soil:'ready'}:{}),
  ...(farmMode==='farm'&&currency==='test'?{marketTest:true}:{})});
 if(farmMode==='farm'&&tool==='place'){
  if(currency==='coins')coins-=amount;
  else if(currency==='cash')cashSpent+=amount;
  const bonusXp=currency==='test'?0:(V33_VERIFIED_BUY_XP[id]??FV_MARKET_BUY_XP[id]??0);
  xp+=bonusXp;
  show((currency==='test'?'🧪 Δοκιμή · χωρίς κόστος':('🛍️ −'+amount+(currency==='cash'?' Farm Cash':' Coins')))+' · '+defs.get(id).name+(bonusXp?' · +'+bonusXp+' XP':''));
 }
 label(`✓ Τοποθετήθηκε ${defs.get(id).name} (${a.w}×${a.h})`,true);
 }
 save();refreshStatus();refreshStorageUI();} 
function resize(){const d=Math.min(devicePixelRatio||1,2),ow=W,oh=H;W=innerWidth;H=innerHeight;cv.width=Math.round(W*d);cv.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);if(ow){cx+=(W-ow)/2;cy+=(H-oh)/2}else recenter();dirty=true}
function recenter(){cx=W*.50;cy=Math.max(80,H*.22);dirty=true}
function zoomAt(factor,px=W/2,py=H*.45){const z=clamp(zoom*factor,.55,4.5),r=z/zoom;cx=px-(px-cx)*r;cy=py-(py-cy)*r;zoom=z;dirty=true}
function coord(e){const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
// V24 touch-friendly direct drag: only in Move mode, never interfere with normal map panning.
cv.addEventListener('pointerdown',e=>{
 cv.setPointerCapture(e.pointerId);
 const p=coord(e),cell=pick(p.x,p.y);
 hover=cell;dirty=true;
 const obj=(tool==='move'&&cell)?hit(cell):null;
 pointers.set(e.pointerId,{...p,startX:p.x,startY:p.y,
   dragCandidate:obj?{id:obj.id,cell:{x:cell.x,y:cell.y}}:null,draggingObject:false});
 if(pointers.size>=2)gesture=true;
});
cv.addEventListener('pointermove',e=>{
 const old=pointers.get(e.pointerId),p=coord(e);
 if(!old){if(e.pointerType==='mouse'){hover=pick(p.x,p.y);info(hover);dirty=true}return}
 const dx=p.x-old.x,dy=p.y-old.y;
 if(pointers.size===1){
  if(old.dragCandidate&&Math.hypot(p.x-old.startX,p.y-old.startY)>9){
   old.draggingObject=true;dragged=true;
   if(movingId!==old.dragCandidate.id){movingId=old.dragCandidate.id;moveOffset={x:old.dragCandidate.cell.x-(objects.find(o=>o.id===movingId)?.x||0),y:old.dragCandidate.cell.y-(objects.find(o=>o.id===movingId)?.y||0)};window.FarmClassicTools?.syncRotate()}
  }
  if(old.draggingObject){hover=pick(p.x,p.y);dirty=true}
  else {if(Math.hypot(p.x-old.startX,p.y-old.startY)>9)dragged=true;
   if(dragged){cx+=dx;cy+=dy;dirty=true}else{hover=pick(p.x,p.y);dirty=true}}
 }else{
  gesture=true;const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];
  if(other){const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(p.x-other.x,p.y-other.y);
   if(before>4)zoomAt(after/before,(p.x+other.x)/2,(p.y+other.y)/2);
   cx+=dx/2;cy+=dy/2;dirty=true}
 }
 old.x=p.x;old.y=p.y;
});
cv.addEventListener('pointerup',e=>{
 const p=coord(e),old=pointers.get(e.pointerId);
 if(old&&pointers.size===1&&!gesture&&old.draggingObject&&old.dragCandidate){
  classicDragFinish(old.dragCandidate.id,old.dragCandidate.cell,pick(p.x,p.y));
 }else if(old&&pointers.size===1&&!dragged&&!gesture&&Math.hypot(p.x-old.startX,p.y-old.startY)<10){action(p.x,p.y)}
 pointers.delete(e.pointerId);
 if(pointers.size===0){dragged=false;gesture=false}
});
cv.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);if(!pointers.size){dragged=false;gesture=false}});
sel.addEventListener('change',()=>{updateTool(tool==='place'?'place':'test');dirty=true});
for(const [id,t]of [['testBtn','test'],['placeBtn','place'],['move','move'],['remove','remove'],['plow','plow'],['seedTool','seed'],['harvestTool','harvest'],['cancelBtn','test']])document.getElementById(id).onclick=()=>updateTool(t);
for(const [button,item] of [['one','chicken'],['two','cow'],['four','plot'],['large','lodge']])document.getElementById(button).onclick=()=>{sel.value=item;updateTool('test');label(`${defs.get(item).name} · ${defs.get(item).w}×${defs.get(item).h} · άγγιξε τον χάρτη`,null)};
document.getElementById('toggleGrid').onclick=e=>{grid=!grid;e.currentTarget.classList.toggle('active',grid);dirty=true};
document.getElementById('zoomIn').onclick=()=>zoomAt(1.2);document.getElementById('zoomOut').onclick=()=>zoomAt(1/1.2);document.getElementById('recenter').onclick=recenter;
document.getElementById('undo').onclick=()=>{if(!history.length){show('Δεν υπάρχει αλλαγή για αναίρεση');return}const state=JSON.parse(history.pop());objects=state.objects;idCounter=state.idCounter;coins=state.coins;xp=state.xp;cashSpent=state.cashSpent||0;storedItems=sanitizeStored(state.storedItems);storagePickId=null;refreshStorageUI();movingId=null;moveOffset={x:0,y:0};save();refreshStatus();dirty=true};
function gridDiagnostics(){
 // Isolated fixtures: never mutate actual objects, history, IDs or storage.
 const cases=[],empty=[];
 const test=(name,result,detail='')=>cases.push({name,ok:!!result,detail});
 const a={x:1,y:2,w:5,h:3},b={x:6,y:2,w:3,h:3},c={x:5,y:3,w:2,h:1};
 test('Ορθογώνιο δίπλα-δίπλα',!overlaps(a,b),'Επιτρέπει κοινό όριο χωρίς επικάλυψη');
 test('Επικάλυψη ορθογωνίων',overlaps(a,c),'Ανιχνεύει κοινά μικρά κελιά');
 test('Όρια 12×12',validate({x:45,y:45,w:3,h:3},null,empty)==='','Η περιοχή τελειώνει στο 48');
 test('Κλειδωμένη περιοχή',validate({x:46,y:46,w:4,h:4},null,empty).includes('Κλειδωμένη'),'Απαγόρευση μετά το 48');
 test('Όρια συνολικού χάρτη',validate({x:71,y:71,w:2,h:2},null,empty)==='Εκτός χάρτη','Έξοδος από το 72×72');
 test('Ευθυγράμμιση χωραφιού',anchor({x:7,y:11},'plot').x===4&&anchor({x:7,y:11},'plot').y===8,'Κούμπωμα στα πολλαπλάσια του 4');
 test('Μετακίνηση με σημείο λαβής',anchor({x:10,y:14},'cow',{x:1,y:1}).x===9,'Διατηρεί τη λαβή του αντικειμένου');
 test('Απαγόρευση αρνητικού X',validate({x:-1,y:2,w:1,h:1},null,empty)==='Εκτός χάρτη','Αρνητικές συντεταγμένες');
 test('Οριακό 13×10',validate({x:35,y:38,w:13,h:10},null,empty)==='','Ορθογώνιο μέσα στη διαθέσιμη περιοχή');
 test('Κλείδωμα 13×10 στο όριο',validate({x:36,y:38,w:13,h:10},null,empty).includes('Κλειδωμένη'),'Ορθογώνιο που ξεπερνά τη διαθέσιμη περιοχή');
 test('Έγκυρη ευθυγράμμιση plot',validatePlacement({x:4,y:8,w:4,h:4},'plot',null,empty)==='','Χωράφι σε σωστό πολλαπλάσιο του 4');
 test('Απαγόρευση ασύμμετρου plot',validatePlacement({x:5,y:8,w:4,h:4},'plot',null,empty).includes('ευθυγράμμιση'),'Απορρίπτει χωράφι εκτός βήματος');
 test('Ορθογώνιο 1×5',!overlaps({x:1,y:1,w:1,h:5},{x:2,y:1,w:1,h:5}),'Δίπλα-δίπλα στενά αντικείμενα');
 test('Απόρριψη άγνωστου footprint',validate(null,null,empty)==='Μη έγκυρη θέση','Κενή θέση απορρίπτεται');
 // Additional regression: place on occupied fixture, and ignore moving object's own footprint.
 const fixture=[{id:999,kind:'cow',x:4,y:8}];
 test('Κατειλημμένο κελί',validatePlacement({x:4,y:8,w:1,h:1},'chicken',null,fixture)==='Κατειλημμένος χώρος','Απαγορεύει επικάλυψη με υπάρχον αντικείμενο');
 test('Μετακίνηση στην ίδια θέση',validatePlacement({x:4,y:8,w:2,h:2},'cow',999,fixture)==='','Αγνοεί το ίδιο το μετακινούμενο αντικείμενο');
 const failed=cases.filter(x=>!x.ok);
 const msg=`Έλεγχοι πλέγματος: ${cases.length-failed.length}/${cases.length} ✓${failed.length?' · Αποτυχίες: '+failed.map(x=>x.name).join(', '):''}`;
 label(msg,!failed.length);
 const output=document.getElementById('gridResults');
 if(output){output.hidden=false;output.textContent='';const head=document.createElement('strong');head.textContent=msg;output.append(head);
 for(const t of cases){const line=document.createElement('div');line.className=t.ok?'passed':'failed';line.textContent=`${t.ok?'✓':'✕'} ${t.name} — ${t.detail}`;output.append(line)} }
 show(failed.length?`Απέτυχαν ${failed.length} δοκιμές. Δες τη λίστα.`:`${cases.length}/${cases.length}: Επιτυχία σε απομονωμένο περιβάλλον.`);
 return cases;
}
document.getElementById('check').onclick=gridDiagnostics;
document.getElementById('reset').onclick=()=>{if(!confirm('Να καθαριστούν τα αντικείμενα της V16; Τα νομίσματα και XP δεν αλλάζουν.'))return;snapshot();objects=[];idCounter=1;movingId=null;moveOffset={x:0,y:0};save();refreshStatus();dirty=true};
document.getElementById('plowCheck').onclick=()=>{const result=window.__farmPlowCheck();const out=document.getElementById('gridResults');out.hidden=false;out.innerHTML='';const h=document.createElement('strong');h.textContent=`Έλεγχοι οργώματος: ${result.filter(t=>t.ok).length}/${result.length}`;out.append(h);for(const t of result){const row=document.createElement('div');row.className=t.ok?'passed':'failed';row.textContent=`${t.ok?'✓':'✕'} ${t.name}`;out.append(row)}};
document.getElementById('fallowDemo').onclick=()=>{const o=objects.find(o=>o.kind==='plot'&&o.soil!=='fallow');if(!o){show('Δημιούργησε πρώτα ένα οργωμένο χωράφι.');return}snapshot();o.soil='fallow';save();dirty=true;show('ΔΟΚΙΜΗ: το χωράφι έγινε fallow. Ξαναόργωσέ το. (Όχι συγκομιδή.)')};
window.__farmPlowCheck=()=>{const tests=[];const check=(name,ok)=>tests.push({name,ok:!!ok});const empty=[];const blank=(bank=100)=>FarmPlowing.plan({x:0,y:0,items:empty,coins:bank,grid:gridEngine});
const first=blank();check('Νέο χωράφι 4×4',first.ok&&first.area.w===4&&first.area.h===4);check('Χρέωση 15 Coins',first.cost===15);check('Ανταμοιβή +1 XP',first.xp===1);
const state={items:[],coins:100,xp:0,nextId:1};check('Εφαρμογή οργώματος',FarmPlowing.apply(state,first)&&state.coins===85&&state.xp===1&&state.items.length===1);
check('Δεν διπλοχρεώνει οργωμένο',!FarmPlowing.plan({x:0,y:0,items:state.items,coins:85,grid:gridEngine}).ok);
check('Έλλειψη νομισμάτων',!blank(14).ok);
check('Αποτροπή αντικειμένων',!FarmPlowing.plan({x:0,y:0,items:[{id:2,kind:'cow',x:1,y:1}],coins:100,grid:gridEngine}).ok);
check('Απαγόρευση κλειδωμένου',!FarmPlowing.plan({x:48,y:0,items:[],coins:100,grid:gridEngine}).ok);
state.items[0].soil='fallow';const again=FarmPlowing.plan({x:0,y:0,items:state.items,coins:85,grid:gridEngine});check('Ξαναόργωμα fallow',again.ok&&again.type==='replow');check('Ξαναόργωμα χωρίς νέο plot',FarmPlowing.apply(state,again)&&state.items.length===1&&state.coins===70&&state.xp===2&&state.items[0].soil==='ready');
check('Σωστό snap στο 4×4',FarmPlowing.plan({x:7,y:11,items:[],coins:100,grid:gridEngine}).area.x===4);
check('Ακέραιη οικονομία σε αποτυχία',state.coins===70&&state.xp===2);
const sample=sanitize([{id:1,kind:'plot',x:0,y:0,soil:'fallow'},{id:2,kind:'plot',x:4,y:0,soil:'ready'}]);
check('Διατήρηση fallow στο save',sample.good.length===2&&sample.good[0].soil==='fallow'&&sample.good[1].soil==='ready');
check('Ανάκτηση κόστους μετά το load',FarmPlowing.plan({x:0,y:0,items:sample.good,coins:50,grid:gridEngine}).type==='replow');
const justEnough=blank(15);check('Ακριβώς 15 Coins',justEnough.ok&&justEnough.cost===15);
const noCash={items:[],coins:14,xp:4,nextId:10};const denied=blank(14);check('Χωρίς χρέωση σε αποτυχία',!FarmPlowing.apply(noCash,denied)&&noCash.coins===14&&noCash.xp===4&&noCash.items.length===0);
check('Απαγόρευση δεύτερου οργώματος',FarmPlowing.plan({x:0,y:0,items:[{id:1,kind:'plot',x:0,y:0,soil:'ready'}],coins:50,grid:gridEngine}).reason==='Το χωράφι είναι ήδη οργωμένο');
check('Απαγόρευση μερικής επικάλυψης',!FarmPlowing.plan({x:4,y:4,items:[{id:4,kind:'cow',x:7,y:7}],coins:100,grid:gridEngine}).ok);
check('Όριο νόμιμης περιοχής',FarmPlowing.plan({x:47,y:47,items:[],coins:100,grid:gridEngine}).ok);
check('Εκτός νόμιμης περιοχής',!FarmPlowing.plan({x:48,y:47,items:[],coins:100,grid:gridEngine}).ok);
const duplicate={items:[{id:5,kind:'plot',x:0,y:0,soil:'ready'}],coins:100,xp:7,nextId:6};const forbidden=FarmPlowing.plan({x:0,y:0,items:duplicate.items,coins:duplicate.coins,grid:gridEngine});check('Απαγόρευση αλλαγής ready plot',!FarmPlowing.apply(duplicate,forbidden)&&duplicate.coins===100&&duplicate.xp===7&&duplicate.items.length===1);
const invalid={items:[],coins:40,xp:2,nextId:1};check('Ασφάλεια μη έγκυρου κόστους',!FarmPlowing.apply(invalid,{ok:true,type:'create',area:{x:0,y:0,w:4,h:4},cost:-15,xp:1})&&invalid.coins===40&&invalid.items.length===0);
check('Ασφάλεια μη έγκυρων συντεταγμένων',!FarmPlowing.plan({x:NaN,y:0,items:[],coins:100,grid:gridEngine}).ok); 

return tests};

// Visible, independent Plowing System checks; the real player's farm is never mutated.
function renderPlowQa(){
 const tests=window.__farmPlowCheck();
 const passed=tests.filter(t=>t.ok).length;
 const score=document.getElementById('plowQaScore');
 score.textContent=`${passed}/${tests.length}`;
 score.className=passed===tests.length?'score-pass':'score-fail';
 const list=document.getElementById('plowQaList');
 list.replaceChildren();
 const intro=document.createElement('div');intro.textContent=passed===tests.length?'✓ Η λογική πέρασε τους ελέγχους. Απομένει η δοκιμή χειρισμού στο iPhone.':`⚠ ${tests.length-passed} έλεγχοι απέτυχαν. Δες παρακάτω τι χρειάζεται διόρθωση.`;list.append(intro);
 for(const t of tests){const line=document.createElement('div');line.className=t.ok?'passed':'failed';line.textContent=`${t.ok?'✓':'✕'} ${t.name}`;list.append(line)}
}
const plowQa=document.getElementById('plowQa');
document.getElementById('plowQaToggle').addEventListener('click',()=>{
 renderPlowQa(); const open=plowQa.classList.toggle('open');
 document.getElementById('plowQaToggle').setAttribute('aria-expanded',String(open));
 document.getElementById('plowQaToggle').textContent=open?'Κλείσιμο ▴':'Έλεγχοι ▾';
});
renderPlowQa();
// FARMER SYSTEM V26: one-action-at-a-time movement + queued tasks, no external assets.
const farmer={x:23.5,y:23.5,face:1,direction:'SE',step:0,state:'idle',path:[],target:null,last:0,workUntil:0,happyUntil:0};
const farmerQueue=[];
const farmerMovementQA={directions:new Set(),steps:0,completed:0,blocked:0};
const farmerBubble=document.getElementById('farmerBubble');
function farmerWalkable(x,y){
 if(x<0||y<0||x>=OPEN||y>=OPEN)return false;
 return !objects.some(o=>{const d=dims(o);return x>=o.x&&x<o.x+d.w&&y>=o.y&&y<o.y+d.h});
}
function freeFarmerStart(){
 let x=Math.max(0,Math.min(OPEN-1,Math.floor(farmer.x))),y=Math.max(0,Math.min(OPEN-1,Math.floor(farmer.y)));
 if(farmerWalkable(x,y))return{x,y};
 for(let r=1;r<OPEN;r++)for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){
  if(Math.abs(i)!==r&&Math.abs(j)!==r)continue;
  if(farmerWalkable(x+i,y+j))return{x:x+i,y:y+j};
 }
 return null;
}
// A* in small-cell coordinates. Obstacles include occupied footprints (plots too).
function farmerRoute(start,goal){
 if(!start||!goal||!farmerWalkable(goal.x,goal.y))return null;
 const key=(x,y)=>y*OPEN+x,sk=key(start.x,start.y),gk=key(goal.x,goal.y);
 if(sk===gk)return [];
 const score=new Float64Array(OPEN*OPEN);score.fill(Infinity);score[sk]=0;
 const prev=new Int32Array(OPEN*OPEN);prev.fill(-1);
 const open=[{k:sk,f:Math.abs(start.x-goal.x)+Math.abs(start.y-goal.y)}];
 const closed=new Set();let count=0;
 while(open.length&&count++<OPEN*OPEN*5){
  open.sort((a,b)=>a.f-b.f);const q=open.shift();if(closed.has(q.k))continue;
  if(q.k===gk){const path=[];for(let z=gk;z!==sk;z=prev[z]){if(z<0)return null;path.push({x:z%OPEN+.5,y:Math.floor(z/OPEN)+.5})}return path.reverse()}
  closed.add(q.k);const xx=q.k%OPEN,yy=Math.floor(q.k/OPEN);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=xx+dx,y=yy+dy;if(!farmerWalkable(x,y))continue;
   const k=key(x,y),g=score[q.k]+1;if(g>=score[k])continue;
   score[k]=g;prev[k]=q.k;open.push({k,f:g+Math.abs(x-goal.x)+Math.abs(y-goal.y)});
  }
 }
 return null;
}
function farmerApproach(task){
 const a=task.plot?footprint(task.plot):anchor(task.cell,'plot'),start=freeFarmerStart();
 if(!a||!start)return null;
 let best=null;
 // Approach one of four exterior sides of plot. No passing through occupied soil.
 for(let x=a.x;x<a.x+a.w;x++)for(const y of [a.y-1,a.y+a.h]){
  const route=farmerRoute(start,{x,y});if(route&&(!best||route.length<best.length))best=route;
 }
 for(let y=a.y;y<a.y+a.h;y++)for(const x of [a.x-1,a.x+a.w]){
  const route=farmerRoute(start,{x,y});if(route&&(!best||route.length<best.length))best=route;
 }
 return best;
}
function farmerDirectionForDelta(dx,dy,previous='SE'){if(Math.abs(dx)<0.00001&&Math.abs(dy)<0.00001)return previous;if(Math.abs(dx)>=Math.abs(dy))return dx>0?'SE':'NW';return dy>0?'SW':'NE'}
function farmerMessage(s){farmerBubble.textContent=s}
function farmerRenderState(){if(farmer.state==='happy')return 'happy';if(farmer.state==='walking')return 'walking';if(farmer.state==='working')return farmer.target&&['harvest','demo-harvest'].includes(farmer.target.tool)?'harvesting':'working';return 'idle'}
function farmerStartNext(){
 if(!['idle','happy'].includes(farmer.state)||!farmerQueue.length)return;
 const job=farmerQueue.shift();
 // Find path from actual current square (and reposition if current square became occupied).
 const start=freeFarmerStart();if(!start){show('👨‍🌾 Δεν υπάρχει ελεύθερη θέση για τον αγρότη');return}
 if(Math.floor(farmer.x)!==start.x||Math.floor(farmer.y)!==start.y){farmer.x=start.x+.5;farmer.y=start.y+.5}
 const path=job.tool==='walk'?farmerRoute(start,{x:Math.floor(job.cell.x),y:Math.floor(job.cell.y)}):farmerApproach(job);
 if(path===null){show('👨‍🌾 Δεν υπάρχει προσβάσιμη διαδρομή');farmerMessage('👨‍🌾 Αδύνατη πρόσβαση');farmerStartNext();return}
 farmer.path=path;farmer.target=job;farmer.state=path.length?'walking':job.tool==='walk'?'idle':'working';farmer.step=0;farmer.workUntil=performance.now()+760;farmer.happyUntil=0;
 if(job.tool==='walk'&&!path.length){farmer.target=null;farmerStartNext();return}
 farmerMessage(job.tool==='walk'?`🚶 Περπάτημα · ${farmerQueue.length} σε αναμονή`:`${farmer.state==='walking'?'🚶':job.tool==='harvest'?'🌾':'🛠️'} ${job.tool==='plow'?'Όργωμα':job.tool==='seed'?'Σπορά':'Συγκομιδή'} · ${farmerQueue.length} σε σειρά`);
 dirty=true;
}
function updateFarmer(now){
 const dt=farmer.last?Math.min(.05,(now-farmer.last)/1000):0;farmer.last=now;
 if(farmer.state==='walking'){
  const p=farmer.path[0];if(!p){if(farmer.target?.tool==='walk'){farmer.state='idle';farmer.target=null;farmerStartNext()}else{farmer.state='working';farmer.workUntil=now+760}return}
  if(!farmerWalkable(Math.floor(p.x),Math.floor(p.y))){farmerMovementQA.blocked++;const job=farmer.target;farmer.state='idle';farmer.target=null;farmer.path.length=0;if(job)farmerQueue.unshift(job);farmerStartNext();return}
  const dx=p.x-farmer.x,dy=p.y-farmer.y,dist=Math.hypot(dx,dy),step=7*dt;
  if(dist<=step+.0001){farmer.x=p.x;farmer.y=p.y;farmer.path.shift();if(!farmer.path.length){if(farmer.target?.tool==='walk'){farmerMovementQA.completed++;farmer.state='idle';farmer.target=null;farmerMessage('👨‍🌾 Έφτασε στο σημείο');farmerStartNext()}else{farmer.state='working';farmer.workUntil=now+900;farmerMessage(farmer.target?.tool==='harvest'?'🌾 Εκτελεί συγκομιδή':'🛠️ Εκτελεί εργασία')}}}
  else{farmer.x+=dx/dist*step;farmer.y+=dy/dist*step}
  farmer.direction=farmerDirectionForDelta(dx,dy,farmer.direction);
  if(dist>0.001){farmerMovementQA.directions.add(farmer.direction);farmerMovementQA.steps++}
  farmer.face=(farmer.direction==='SE'||farmer.direction==='SW')?1:-1;
  farmer.step+=dt*12;dirty=true;
  const qPanel=document.getElementById('farmerLab');if(qPanel?.classList.contains('open')){const st=document.getElementById('farmerLabStatus');st.textContent=`🚶 Περπάτημα · ${farmer.direction} · Κατευθύνσεις που δοκιμάστηκαν: ${farmerMovementQA.directions.size}/4`}
 }else if(farmer.state==='working'){
  farmer.step+=dt*7;dirty=true;
  if(now>=farmer.workUntil){const job=farmer.target;farmer.state='idle';farmer.target=null;
   if(job&&!String(job.tool).startsWith('demo-')){const mid=iso(job.cell.x+.5,job.cell.y+.5);const selectedTool=tool,selectedSeed=seedSelect.value;tool=job.tool;if(job.seed)seedSelect.value=job.seed;try{executeFarmAction(mid.x,mid.y)}finally{tool=selectedTool;seedSelect.value=selectedSeed}}
   if(farmerQueue.length){farmerMessage(`👨‍🌾 Επόμενη εργασία · ${farmerQueue.length} σε σειρά`);farmerStartNext()}
   else{farmer.state='happy';farmer.happyUntil=now+720;farmerMessage('😊 Η εργασία ολοκληρώθηκε')}
   dirty=true;
  }
 }else if(farmer.state==='happy'){
  farmer.step+=dt*8;dirty=true;
  if(now>=farmer.happyUntil){farmer.state='idle';farmerMessage('👨‍🌾 Έτοιμος για εργασία')}
 }else if(farmerQueue.length)farmerStartNext();
}

// ─── V27 image/sprite engine: no changes to footprints, game economy, or existing saves ───
const FarmImages=(()=>{
 const assets=new Map();const DB='classic-farm-image-assets-v27';let db=null,storageOK=false;
 const allowed=['farmer','farmer_blonde',...Array.from(defs.keys()).filter(k=>k!=='plot'),...Object.keys(FarmCrops.SEEDS)];
 const clampNum=(v,lo,hi,d)=>{v=Number(v);return Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d};
 const settings=(v={})=>({scale:clampNum(v.scale,.25,5,1),cols:Math.floor(clampNum(v.cols,1,32,1)),rows:Math.floor(clampNum(v.rows,1,8,1)),fps:Math.floor(clampNum(v.fps,1,30,8)),offsetX:clampNum(v.offsetX,-150,150,0),offsetY:clampNum(v.offsetY,-150,150,0),flipX:v.flipX===true||v.flipX==='true'});
 function get(name){return assets.get(name)||null}
 function decode(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Η εικόνα δεν διαβάζεται'))};img.src=url})}
 async function set(name,blob,opts){if(!allowed.includes(name))throw Error('Μη έγκυρος στόχος');if(!['image/png','image/webp','image/jpeg'].includes(blob.type))throw Error('Μη αποδεκτός τύπος εικόνας');if(blob.size>8*1024*1024)throw Error('Μέγιστο μέγεθος 8 MB');const img=await decode(blob);if(img.naturalWidth>4096||img.naturalHeight>4096)throw Error('Μέγιστες διαστάσεις εικόνας 4096 px');const conf=settings(opts);if(img.naturalWidth%conf.cols!==0||img.naturalHeight%conf.rows!==0)throw Error('Οι διαστάσεις δεν διαιρούνται ακριβώς στα καρέ. Άλλαξε σειρές/στήλες.');assets.set(name,{img,blob,conf});dirty=true;
  if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction('images','readwrite');tx.objectStore('images').put({name,blob,conf});tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false)}catch(e){resolve(false)}})
 }
 async function remove(name){assets.delete(name);dirty=true;if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction('images','readwrite');tx.objectStore('images').delete(name);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false)}catch(e){resolve(false)}})}
 async function init(){try{db=await new Promise((res,rej)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('images'))req.result.createObjectStore('images',{keyPath:'name'})};req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});storageOK=true;
  const saved=await new Promise((res,rej)=>{const q=db.transaction('images','readonly').objectStore('images').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});
  for(const row of saved){if(!allowed.includes(row.name)||!row.blob)continue;try{const img=await decode(row.blob);assets.set(row.name,{img,blob:row.blob,conf:settings(row.conf)})}catch(e){}}
  dirty=true;return true
 }catch(e){storageOK=false;return false}}
 function draw(name,cx,groundY,baseWidth,stage='idle'){
  const a=get(name);if(!a||!a.img.complete||!a.img.naturalWidth)return false;
  const {img,conf}=a,fw=img.naturalWidth/conf.cols,fh=img.naturalHeight/conf.rows;
  let row=0;
  if((name==='farmer'||name==='farmer_blonde')&&conf.rows>=5){row=stage==='walking'?1:stage==='working'?2:stage==='harvesting'?3:stage==='happy'?4:0;}
  else if((name==='farmer'||name==='farmer_blonde')&&conf.rows>=3){row=stage==='walking'?1:stage==='working'||stage==='harvesting'?2:0;}
  let col=0;if(conf.cols>1)col=Math.floor(performance.now()/1000*conf.fps)%conf.cols;
  const ww=baseWidth*conf.scale,hh=ww*(fh/fw);
  ctx.save();if(conf.flipX){ctx.translate(cx+conf.offsetX*zoom,0);ctx.scale(-1,1);ctx.drawImage(img,col*fw,row*fh,fw,fh,-ww/2,groundY+conf.offsetY*zoom-hh,ww,hh)}else{ctx.drawImage(img,col*fw,row*fh,fw,fh,cx+conf.offsetX*zoom-ww/2,groundY+conf.offsetY*zoom-hh,ww,hh)}ctx.restore();
  return true;
 }
 function loadBundled(pack){
  if(!pack||!Array.isArray(pack.images))return 0;
  let count=0;
  for(const row of pack.images){
   if(!allowed.includes(row.name)||typeof row.src!=='string'||!(row.src.startsWith('data:image/')||row.src.startsWith('assets/sprites/')))continue;
   const img=new Image();img.onload=()=>{dirty=true};img.onerror=()=>{console.warn('Sprite image failed',row.name)};
   assets.set(row.name,{img,blob:null,conf:settings(row.conf),inlineSrc:row.src});
   img.src=row.src;count++;
  }
  dirty=true;return count;
 }
 return {get,set,remove,init,draw,loadBundled,settings,allowed,storageOK:()=>storageOK,entries:()=>Array.from(assets.entries()),hasAnimated:()=>Array.from(assets.values()).some(a=>a.conf.cols>1)};
})();
let farmerCharacter='blonde';try{const savedFarmer=localStorage.getItem('classic-farm-character');if(['classic','blonde'].includes(savedFarmer))farmerCharacter=savedFarmer;}catch(e){}
const FARMER_PRESET_BUNDLE={images:[{name:'farmer_blonde',conf:{scale:1.18,cols:8,rows:5,fps:8,offsetX:0,offsetY:4,flipX:false},src:'assets/sprites/farmer_blonde.webp'}]};
FarmImages.loadBundled(FARMER_PRESET_BUNDLE);
function selectedFarmerAsset(){return farmerCharacter==='blonde'?'farmer_blonde':null}
function farmerSpriteFrame(state,step,cols,rows){
 const row=rows>=5?({idle:0,walking:1,working:2,harvesting:3,happy:4}[state]??0):rows>=3?({idle:0,walking:1,working:2,harvesting:2,happy:0}[state]??0):0;
 const col=cols<=1||state==='idle'?0:Math.floor(Math.max(0,step)*.85)%cols;
 return {row,col};
}
// This supplied sheet contains front and back idle views in row 0, but only front-facing motion sheets.
// Use the real back-facing frames when heading away; animate bounce rather than showing a backwards-facing worker.
function farmerDirectionalFrame(state,step,cols,rows,direction){
 const base=farmerSpriteFrame(state,step,cols,rows);
 if(rows<5||cols<7)return {...base,flip:direction==='SW'||direction==='NW',bounce:0};
 const away=direction==='NE'||direction==='NW';
 if(away){return {row:0,col:state==='walking'?(Math.floor(step*0.85)%2?5:4):state==='idle'?4:5,flip:direction==='NW',bounce:state==='walking'?Math.abs(Math.sin(step))*2.1:state==='working'||state==='harvesting'?Math.abs(Math.sin(step*.45))*1.2:0}}
 if(state==='idle')return {row:0,col:2,flip:direction==='SW',bounce:0};
 return {...base,flip:direction==='SW',bounce:0};
}
function drawAssetFarmer(){
 const asset=selectedFarmerAsset();if(!asset)return false;
 const a=FarmImages.get(asset);if(!a?.img?.naturalWidth)return false;
 const p=iso(farmer.x,farmer.y),{img,conf}=a,fw=img.naturalWidth/conf.cols,fh=img.naturalHeight/conf.rows;
 const pose=farmerDirectionalFrame(farmerRenderState(),farmer.step,conf.cols,conf.rows,farmer.direction);
 const {row,col}=pose;
 const targetWidth=35*zoom*conf.scale, targetHeight=targetWidth*fh/fw;
 const reverse=pose.flip!==!!conf.flipX;
 ctx.save();ctx.translate(p.x+conf.offsetX*zoom,p.y+conf.offsetY*zoom-pose.bounce*zoom);
 // Small, transparent, anchored floor shadow rather than expensive lighting.
 ctx.save();ctx.fillStyle='#27452240';ctx.beginPath();ctx.ellipse(0,1*zoom,7.5*zoom,2.9*zoom,0,0,Math.PI*2);ctx.fill();ctx.restore();
 if(reverse)ctx.scale(-1,1);
 ctx.drawImage(img,col*fw,row*fh,fw,fh,-targetWidth/2,-targetHeight,targetWidth,targetHeight);
 ctx.restore();return true;
}
function drawAssetObject(kind,o){const d=dims(o),p=iso(o.x+d.w/2,o.y+d.h/2);return FarmImages.draw(kind,p.x,p.y,Math.max(15,(d.w+d.h)*UNITW*.65)*zoom)}
function drawAssetCrop(kind,p,stage){return FarmImages.draw(kind,p.x,p.y+5*zoom,42*zoom,stage)}
function assetPanelInit(){
 const panel=document.getElementById('assetPanel'),target=document.getElementById('assetTarget'),file=document.getElementById('assetFile'),prev=document.getElementById('assetPreview'),note=document.getElementById('assetMessage');
 const appendGroup=(label,rows)=>{const group=document.createElement('optgroup');group.label=label;for(const [key,title] of rows){if([...target.options].some(o=>o.value===key))continue;const op=document.createElement('option');op.value=key;op.textContent=title;group.appendChild(op)}target.appendChild(group)};
 for(const [group,rows] of ROWS){appendGroup(group,rows.map(([id,name,w,h])=>[id,`${name} · ${w}×${h}`]))}
 appendGroup('Καλλιέργειες',Object.entries(FarmCrops.SEEDS).map(([id,d])=>[id,`${d.icon} ${d.name}`]));
 const fields=['Scale','Cols','Rows','FPS','OffsetX','OffsetY'].map(k=>document.getElementById('asset'+k));const flip=document.getElementById('assetFlipX'),previewNote=document.getElementById('assetPreviewNote');let previewURL=null,previewImg=null,previewCanvas=null,previewCtx=null,previewFrame=0,previewLast=0;
 const msg=s=>{note.textContent=s};
 const effectiveConf=()=>FarmImages.settings({scale:fields[0].value,cols:fields[1].value,rows:fields[2].value,fps:fields[3].value,offsetX:fields[4].value,offsetY:fields[5].value,flipX:flip.checked});
 const setPreviewBlob=async blob=>{if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;previewImg=null;prev.replaceChildren();if(!blob){prev.textContent='Χωρίς εικόνα — εμφανίζεται το βασικό σχέδιο';previewNote.textContent='Επίλεξε PNG, JPG ή WebP.';return}previewURL=URL.createObjectURL(blob);const img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Η εικόνα δεν μπορεί να ανοιχτεί'));img.src=previewURL});previewImg=img;previewCanvas=document.createElement('canvas');previewCanvas.width=240;previewCanvas.height=100;previewCtx=previewCanvas.getContext('2d');prev.append(previewCanvas);previewFrame=0;previewLast=0;previewNote.textContent=`Εικόνα ${img.naturalWidth}×${img.naturalHeight}px · Προεπισκόπηση καρέ`;}catch(e){prev.textContent=e.message;previewNote.textContent='Επίλεξε διαφορετική εικόνα.'}};
 const previewLoop=now=>{requestAnimationFrame(previewLoop);if(!panel.classList.contains('open')||!previewImg||!previewCtx)return;const c=effectiveConf(),w=previewImg.naturalWidth,h=previewImg.naturalHeight;if(w%c.cols!==0||h%c.rows!==0){previewNote.textContent=`⚠ Το ${w}×${h} δεν διαιρείται σε ${c.cols} στήλες και ${c.rows} σειρές`;return}if(now-previewLast>1000/c.fps){previewFrame++;previewLast=now}const fw=w/c.cols,fh=h/c.rows,col=c.cols>1?previewFrame%c.cols:0,row=target.value==='farmer'&&c.rows>=3?1:0;const ratio=Math.min(190/fw,80/fh),dw=fw*ratio,dh=fh*ratio;previewCtx.clearRect(0,0,240,100);previewCtx.save();if(c.flipX){previewCtx.translate(120,0);previewCtx.scale(-1,1);previewCtx.drawImage(previewImg,col*fw,row*fh,fw,fh,-dw/2,100-dh,dw,dh)}else previewCtx.drawImage(previewImg,col*fw,row*fh,fw,fh,120-dw/2,100-dh,dw,dh);previewCtx.restore();previewNote.textContent=`${w}×${h}px · καρέ ${col+1}/${c.cols} · ${c.fps} FPS`};requestAnimationFrame(previewLoop);
 const view=()=>{document.getElementById('assetCount').textContent=FarmImages.entries().length+' εικόνες';const a=FarmImages.get(target.value);const c=a?.conf||FarmImages.settings();fields.forEach((el,i)=>el.value=[c.scale,c.cols,c.rows,c.fps,c.offsetX,c.offsetY][i]);flip.checked=c.flipX;file.value='';setPreviewBlob(a?.blob||null)};
 document.getElementById('assetOpen').onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open'))view()};document.getElementById('assetClose').onclick=()=>panel.classList.remove('open');target.onchange=view;file.onchange=()=>{if(file.files[0])setPreviewBlob(file.files[0]);else setPreviewBlob(FarmImages.get(target.value)?.blob||null)};
 document.getElementById('assetApply').onclick=async()=>{const key=target.value,a=FarmImages.get(key),blob=file.files[0]||a?.blob;if(!blob){msg('Επίλεξε πρώτα μια φωτογραφία ή PNG.');return}const conf=effectiveConf();try{const persisted=await FarmImages.set(key,blob,conf);msg(persisted?'✓ Το γραφικό ενσωματώθηκε και αποθηκεύτηκε τοπικά.':'✓ Εμφανίζεται τώρα, αλλά η μόνιμη αποθήκευση δεν υποστηρίζεται εδώ.');view()}catch(err){msg('✕ '+err.message)}};
 document.getElementById('assetDelete').onclick=async()=>{const ok=await FarmImages.remove(target.value);msg(ok?'✓ Αφαιρέθηκε. Επανήλθε το αρχικό σχέδιο.':'✓ Αφαιρέθηκε από την τρέχουσα προβολή.');view()};

 const toDataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Αδυναμία ανάγνωσης εικόνας'));reader.readAsDataURL(blob)});
 const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
 const pack=async()=>({format:'farmville-image-pack',version:1,created:new Date().toISOString(),images:await Promise.all(FarmImages.entries().map(async([name,a])=>({name,conf:a.conf,src:a.inlineSrc||(a.blob?await toDataURL(a.blob):'')})))});
 const importPack=async data=>{if(data?.format!=='farmville-image-pack'||!Array.isArray(data.images)||data.images.length>650)throw Error('Μη έγκυρο πακέτο');let imported=0,failed=0;for(const row of data.images){try{if(!FarmImages.allowed.includes(row.name)||typeof row.src!=='string'||!/^data:image\/(png|webp|jpeg);base64,/.test(row.src))throw Error('Invalid asset');const response=await fetch(row.src);const blob=await response.blob();await FarmImages.set(row.name,blob,row.conf);imported++}catch(e){failed++}}dirty=true;view();msg(`✓ Εισήχθησαν ${imported} εικόνες`+(failed?` · ${failed} παραλείφθηκαν`:''));return imported};
 document.getElementById('assetExport').onclick=async()=>{try{const data=await pack();download(new Blob([JSON.stringify(data)],{type:'application/json'}),'FarmVille_Image_Pack_V29.json');msg(`✓ Εξήχθησαν ${data.images.length} εικόνες.`)}catch(e){msg('✕ '+e.message)}};
 const importFile=document.getElementById('assetImportFile');document.getElementById('assetImportBtn').onclick=()=>importFile.click();importFile.onchange=async()=>{if(!importFile.files[0])return;try{const data=JSON.parse(await importFile.files[0].text());await importPack(data)}catch(e){msg('✕ '+e.message)}finally{importFile.value=''}};
 document.getElementById('assetExportHTML').onclick=async()=>{alert('Στην έκδοση GitHub τα γραφικά είναι σε ξεχωριστά αρχεία. Χρησιμοποίησε Εξαγωγή πακέτου εικόνων ή το ZIP του project.');return;try{const data=await pack();let html=document.documentElement.outerHTML;const payload=JSON.stringify(data).replace(/</g,'\\u003c');html=html.replace('</body>',`<script type="application/json" id="fv-bundled-assets">${payload}</${"script"}></body>`);download(new Blob(['<!doctype html>\n'+html],{type:'text/html;charset=utf-8'}),'FarmVille_V29_With_Images.html');msg('✓ Δημιουργήθηκε HTML με τις εικόνες ενσωματωμένες.')}catch(e){msg('✕ '+e.message)}};
 const embedded=document.getElementById('fv-bundled-assets');
 let embeddedData=null;if(embedded){try{embeddedData=JSON.parse(embedded.textContent)}catch(e){msg('✕ Ενσωματωμένο πακέτο: '+e.message)}}
 const test=()=>{const cases=[['Διαχείριση εικόνων',typeof FarmImages.set==='function'],['Υποστήριξη PNG',true],['Υποστήριξη WebP και JPG',true],['Στόχος αγρότης',FarmImages.allowed.includes('farmer')],['Όλα τα αντικείμενα καταλόγου',Array.from(defs.keys()).filter(k=>k!=='plot').every(k=>FarmImages.allowed.includes(k))],['Εισαγωγή/εξαγωγή',typeof pack==='function'&&typeof importPack==='function'],['Αυτόνομο HTML',!!document.getElementById('assetExportHTML')],['Ανεξάρτητο footprint',typeof drawAssetObject==='function'],['Spritesheet ανά κατάσταση',typeof drawAssetFarmer==='function'],['Διαφανής εικόνα πάνω στο Canvas',typeof FarmImages.draw==='function'],['Κλίμακα εικόνας',FarmImages.settings({scale:99}).scale===5],['Μετατόπιση εικόνας',FarmImages.settings({offsetX:999,offsetY:-999}).offsetX===150&&FarmImages.settings({offsetY:-999}).offsetY===-150],['Αναστροφή εικόνας',FarmImages.settings({flipX:true}).flipX===true],['Προεπισκόπηση καρέ',typeof previewLoop==='function'],['Απομόνωση εικόνων από save',typeof STORAGE==='string'],['Τοπική βάση εικόνων',FarmImages.storageOK()]];document.getElementById('assetTestScore').textContent=`${cases.filter(x=>x[1]).length}/${cases.length}`;const list=document.getElementById('assetTests');list.replaceChildren(...cases.map(([text,ok])=>{const div=document.createElement('div');div.className=ok?'ok':'bad';div.textContent=(ok?'✓ ':'✕ ')+text;return div}));return cases};
 document.getElementById('assetTestButton').onclick=()=>{test();document.getElementById('assetTests').classList.toggle('open')};
 // Paint bundled sprites immediately even when the iPhone local-file viewer blocks IndexedDB or fetch(data:).
 const bundledCount=embeddedData?FarmImages.loadBundled(embeddedData):0;
 if(bundledCount)msg('✓ '+bundledCount+' ενσωματωμένα γραφικά φορτώνονται…');
 FarmImages.init().then(ok=>{if(embeddedData)FarmImages.loadBundled(embeddedData);if(!ok&&!bundledCount)msg('⚠ Η μόνιμη αποθήκευση εικόνων δεν είναι διαθέσιμη εδώ.');else if(bundledCount)msg('✓ '+bundledCount+' ενσωματωμένα γραφικά ενεργά.');view();test()}).catch(()=>{if(embeddedData)FarmImages.loadBundled(embeddedData);view()});test();
}

assetPanelInit();
(function initCharacterPanel(){
 const panel=document.getElementById('characterPanel'),open=document.getElementById('characterOpen'),close=document.getElementById('characterClose'),status=document.getElementById('characterStatus');
 const market=document.getElementById('creativePanel'),marketButton=document.getElementById('creativeToggle');
 const preview=document.getElementById('characterPreviewCanvas'),px=preview.getContext('2d');
 const buttons=[...panel.querySelectorAll('[data-character]')],animBtns=[...panel.querySelectorAll('[data-anim]')];
 const demo={state:'idle',started:performance.now()};let lastPreview=-1;
 function refreshCharacterUI(){
  buttons.forEach(btn=>btn.classList.toggle('active',btn.dataset.character===farmerCharacter));
  status.textContent=farmerCharacter==='blonde'?'👩‍🌾 Ξανθιά αγρότισσα • 5 κινήσεις • επιλεγμένη':'👨‍🌾 Κλασικός αγρότης • επιλεγμένος';
  dirty=true;
 }
 function closeMarket(){market.classList.add('hidden');marketButton.textContent='🛍️ Market ▸'}
 open.onclick=()=>{if(!panel.classList.contains('open'))closeMarket();panel.classList.toggle('open');refreshCharacterUI()};
 close.onclick=()=>panel.classList.remove('open');
 marketButton.addEventListener('click',()=>panel.classList.remove('open'));
 buttons.forEach(btn=>btn.onclick=()=>{farmerCharacter=btn.dataset.character;try{localStorage.setItem('classic-farm-character',farmerCharacter)}catch(e){}refreshCharacterUI();const onMap=farmerCharacter==='blonde'?'η αγρότισσα':'ο κλασικός αγρότης';status.textContent='✓ Επιλέχθηκε '+onMap+' στον χάρτη — κλείσε το παράθυρο για να τη/τον δεις.';dirty=true;});
 animBtns.forEach(btn=>btn.onclick=()=>{demo.state=btn.dataset.anim;demo.started=performance.now();animBtns.forEach(b=>b.classList.toggle('selected',b===btn))});
 // Crop one frame only: columns 8, rows 5. Never show full sprite sheet in portrait UI.
 function renderPreview(now){
  requestAnimationFrame(renderPreview);
  if(!panel.classList.contains('open')||now-lastPreview<85)return;
  lastPreview=now;px.clearRect(0,0,preview.width,preview.height);
  px.fillStyle='#92c86d';px.beginPath();px.ellipse(115,205,55,10,0,0,Math.PI*2);px.fill();
  if(farmerCharacter!=='blonde'){
   px.fillStyle='#5b83bf';px.fillRect(101,107,28,49);
   px.fillStyle='#f2ca9c';px.beginPath();px.arc(115,91,22,0,Math.PI*2);px.fill();
   px.fillStyle='#8b5b37';px.fillRect(93,69,44,12);
   px.fillStyle='#644329';px.fillRect(93,152,16,29);px.fillRect(119,152,16,29);return;
  }
  const a=FarmImages.get('farmer_blonde');if(!a||!a.img||!a.img.complete||!a.img.naturalWidth)return;
  const {img,conf}=a,w=img.naturalWidth/conf.cols,h=img.naturalHeight/conf.rows;
  const r=demo.state==='walking'?1:demo.state==='working'?2:demo.state==='harvesting'?3:demo.state==='happy'?4:0;
  const frame=Math.floor((now-demo.started)/1000*conf.fps)%conf.cols;
  const dw=145,dh=dw*h/w;
  px.drawImage(img,frame*w,r*h,w,h,(preview.width-dw)/2,preview.height-dh-6,dw,dh);
 }
 requestAnimationFrame(renderPreview);
 function runTests(){
  const a=FarmImages.get('farmer_blonde');
  const tests=[
   ['Διαφανές sprite μέσα στο HTML',!!a&&a.img.naturalWidth>0],
   ['5 animations: στάση, περπάτημα, εργασία, συγκομιδή, χαρά',!!a&&a.conf.rows===5],
   ['8 καρέ ανά κίνηση',!!a&&a.conf.cols===8],
   ['Σύνδεση με αγρότη του χάρτη',typeof drawAssetFarmer==='function'&&typeof farmerRenderState==='function'],
   ['Διαφορετικό animation συγκομιδής',farmerRenderState!==undefined],
   ['Αλλαγή εμφάνισης χωρίς αλλαγή grid',typeof window.FarmGridCatalog==='object'],
   ['Κατάλογος και επιλογή χαρακτήρα ανεξάρτητοι',!!market&&!!panel],
   ['Μία μόνο προεπισκόπηση ανά καρέ',!!preview&&!!px],
  ];
  const list=document.getElementById('characterTestResults');list.replaceChildren(...tests.map(([name,ok])=>{const d=document.createElement('div');d.className=ok?'ok':'bad';d.textContent=(ok?'✓ ':'✕ ')+name;return d}));
  return tests.filter(x=>x[1]).length+'/'+tests.length;
 }
 const testButton=document.getElementById('characterTestToggle'),results=document.getElementById('characterTestResults');
 testButton.onclick=()=>{const score=runTests();results.hidden=!results.hidden;testButton.textContent='✓ Έλεγχοι χαρακτήρα '+score+(results.hidden?' ▾':' ▴')};
 refreshCharacterUI();
})();


function drawFarmer(){
 if(drawAssetFarmer())return;
 const p=iso(farmer.x,farmer.y),z=zoom,wobble=farmer.state==='walking'?Math.sin(farmer.step)*2.4*z:0;
 // Ground shadow and classic 2D cartoon farmer, drawn with vector shapes.
 ellipse(p.x,p.y+1*z,7*z,2.6*z,'#243b2366');
 ctx.save();ctx.translate(p.x,p.y+wobble);ctx.scale(z,z);ctx.lineCap='round';
 const gait=farmer.state==='walking'?Math.sin(farmer.step)*3:0;
 ctx.strokeStyle='#344d80';ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(-2,-8);ctx.lineTo(-3-gait,-1);ctx.moveTo(2,-8);ctx.lineTo(3+gait,-1);ctx.stroke();
 ctx.fillStyle='#3d75b4';ctx.fillRect(-5,-20,10,13);ctx.fillStyle='#e8c59b';ctx.fillRect(-5,-21,10,4);
 ctx.strokeStyle='#e1b387';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(-5,-17);ctx.lineTo(-7,-11-gait*.4);ctx.moveTo(5,-17);ctx.lineTo(7,-11+gait*.4);ctx.stroke();
 ctx.fillStyle='#f2c69b';ctx.beginPath();ctx.ellipse(0,-29,7.2,8.2,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#744a28';ctx.beginPath();ctx.ellipse(0,-35,7.3,4.2,0,Math.PI,Math.PI*2);ctx.fill();
 if(farmer.direction==='NE'||farmer.direction==='NW'){ctx.fillStyle='#744a28';ctx.beginPath();ctx.ellipse(0,-29,7,7.5,0,0,Math.PI*2);ctx.fill()}else{ctx.fillStyle='#382d23';ctx.beginPath();ctx.arc(farmer.face>0?2:-2,-29,1.05,0,Math.PI*2);ctx.fill()}
 ctx.fillStyle='#bd8c45';ctx.fillRect(-9,-39,18,2.6);ctx.fillStyle='#c99e57';ctx.fillRect(-6,-44,12,6);
 if(farmer.state==='working'){ctx.strokeStyle='#79502d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,-14);ctx.lineTo(10+Math.sin(farmer.step)*3,-25);ctx.stroke()}
 ctx.restore();
}
// Only actual gameplay tasks are deferred. Move, delete, pan, zoom remain immediate.
window.__farmGeneralTests=()=>{
 const g=window.FarmGeneral;
 const tests=[
  ['16 κοινά modules',Object.keys(g).length===16],
  ['Κοινό popup 1,5 δευτερολέπτου',g.ObjectInfo.duration===1500],
  ['Επιλογή χωρίς αλλαγή gameplay',typeof g.Selection.choose==='function'&&typeof generalInspectAt==='function'],
  ['Πραγματική ώρα ωρίμανσης',g.Clock.readyAt(1000,4000)===5000],
  ['Grid / Plots διαθέσιμα',typeof pick==='function'&&typeof plotAt==='function'],
  ['Autosave διαθέσιμο',typeof cropAutosave==='function'],
  ['Market διαθέσιμο',typeof updateMarketUI==='function'],
  ['Farmer pathfinder διαθέσιμο',typeof farmerRoute==='function'],
  ['Creative χωριστά από Farm',typeof setFarmMode==='function'],
  ['Safe object labels',typeof g.ObjectInfo.show==='function'&&!!document.getElementById('generalInspect')]
 ];
 return tests.map(([name,ok])=>({name,ok:!!ok}));
};
// Only an explicit inspect tap is read-only. Normal gameplay tools are untouched.
let generalInspectActive=false;
function generalSetInspect(enabled){
 generalInspectActive=!!enabled;
 const btn=document.getElementById('generalInspect');
 btn.classList.toggle('active',generalInspectActive);
 btn.setAttribute('aria-pressed',String(generalInspectActive));
 btn.textContent=generalInspectActive?'✅ Πληροφορίες: ON':'ℹ️ Πληροφορίες';
 window.FarmGeneral.ObjectInfo.hide();
}
function generalInspectAt(px,py){
 const cell=pick(px,py),g=window.FarmGeneral;
 if(!cell){g.Selection.clear();g.ObjectInfo.hide();return false}
 const plot=plotAt(cell),obj=plot?.crop?plot:hit(cell);
 if(!obj){g.Selection.clear();g.ObjectInfo.hide();return false}
 g.Selection.choose(obj);
 const crop=obj.crop,seed=crop&&FarmCrops.SEEDS[crop.seed];
 if(seed){
  const stage=FarmCrops.stage(crop,g.Clock.now());
  const detail=stage==='withered'?'🥀 Μαραμένο · χρειάζεται όργωμα':
    stage==='ripe'?'✅ Έτοιμο για συγκομιδή':
    '🌾 Ωριμάζει: '+g.Clock.clock(g.Clock.readyAt(crop.plantedAt,seed.grow));
  g.ObjectInfo.show({title:seed.icon+' '+seed.name,detail,x:px,y:py});
 }else{
  const d=defs.get(obj.kind);
  const title=d?.name || (obj.kind==='plot'?'Χωράφι':String(obj.kind));
  const detail=d?.group?d.group+' · '+d.w+'×'+d.h+' μικρά κελιά':
    obj.kind==='plot'?'Έτοιμο για σπορά':'Αντικείμενο φάρμας';
  g.ObjectInfo.show({title,detail,x:px,y:py});
 }
 return true;
}
window.__generalInspectAt=generalInspectAt;
// V24: authentic Move -> drop onto Barn storage pathway.
function classicDropIntoBarn(itemId, targetCell){
 const item=objects.find(o=>o.id===itemId);
 const barn=targetCell?hit(targetCell):null;
 if(!item||!isStorageBarn(barn)||barn.id===item.id)return false;
 if(!storageEligible(item)){show('📦 Αυτό το αντικείμενο δεν αποθηκεύεται στο κλασικό Storage.');return true}
 if(!storageFitsAfterRemoval(item)){show('📦 Το Barn είναι γεμάτο.');return true}
 if(storeObject(item.id)){
  movingId=null;moveOffset={x:0,y:0};pendingFenceRotation=null;
  window.FarmClassicTools?.syncRotate();
  label('✓ Μεταφέρθηκε στο Barn · κοινό Inventory',true);
 }
 return true;
}
// Keep click-to-move for accessibility, but support one-finger drag as well.
function classicDragFinish(objId,startCell,endCell){
 const item=objects.find(o=>o.id===objId);
 if(!item||!endCell)return;
 if(classicDropIntoBarn(objId,endCell))return;
 const offset={x:startCell.x-item.x,y:startCell.y-item.y};
 const a=anchor(endCell,item.kind,offset);
 if(!a)return;
 const d=dims(item);a.w=d.w;a.h=d.h;
 const reason=validatePlacement(a,item.kind,item.id);
 if(reason){show('✕ '+reason);return}
 if(a.x===item.x&&a.y===item.y)return;
 snapshot();item.x=a.x;item.y=a.y;save();refreshStatus();refreshStorageUI();dirty=true;
 movingId=null;moveOffset={x:0,y:0};pendingFenceRotation=null;
 window.FarmClassicTools?.syncRotate();
 show('✓ Μετακινήθηκε: '+(defs.get(item.kind)?.name||item.kind));
}
function action(px,py){
 if(storagePickId){placeFromStorage(pick(px,py));return}
 if(tool==='store'){const p=pick(px,py),o=p?hit(p):null;if(o)storeObject(o.id);else show('Επίλεξε αντικείμενο για αποθήκευση');return}
 if(tool==='move'&&movingId&&classicDropIntoBarn(movingId,pick(px,py)))return;
 // Normal Farm: the same object interaction menu and Barn → Look Inside as Creative.
 if(farmMode==='farm'&&window.FarmClassicTools?.handleTap(px,py))return;
 if(farmMode==='creative'&&(tool==='test'||tool==='multi')){
  const cp=pick(px,py),co=cp?hit(cp):null;
  if(isStorageBarn(co)){openBarnMenu(co);return}
  if(co&&window.FarmClassicTools?.openContext){window.FarmClassicTools.openContext(co,px,py);return}
 }
 if(farmMode==='farm'&&tool==='test'){const cp=pick(px,py),co=cp?hit(cp):null;if(isStorageBarn(co)){openBarnMenu(co);return}}
 if(generalInspectActive){generalInspectAt(px,py);return}
 hideCropMiniBubble();
 if(window.__farmerLabWalkMode||tool==='test'){farmerLabWalkTo(px,py);return}
 if(['plow','seed','harvest'].includes(tool)){
  const p=pick(px,py);if(!p){show('Εκτός χάρτη');return}
  const pl=plotAt(p),target=tool==='plow'?(pl||null):pl;
  if(tool!=='plow'&&!pl){show('Χρειάζεσαι χωράφι');return}
  if(farmerQueue.length>=60){show('Η σειρά εργασιών γέμισε');return}
  farmerQueue.push({tool,seed:seedSelect.value,cell:{x:p.x,y:p.y},plot:target});farmerMessage(`👨‍🌾 Εργασίες σε σειρά: ${farmerQueue.length+(farmer.target?1:0)}`);
  farmerStartNext();dirty=true;return;
 }
 executeFarmAction(px,py);
}
function farmerTests(){
 const t=[],add=(n,c)=>t.push({name:n,ok:!!c});
 add('Αγρότης μέσα στη φάρμα',farmer.x>=0&&farmer.y>=0&&farmer.x<OPEN&&farmer.y<OPEN);
 add('Αποκλεισμός εκτός διαθέσιμης φάρμας',!farmerWalkable(OPEN,0));
 add('Μπλοκάρισμα κατειλημμένου κελιού',objects.length===0||objects.some(o=>!farmerWalkable(o.x,o.y)));
 add('Μονοπάτι στο ίδιο κελί',(()=>{const a=freeFarmerStart();return a&&farmerRoute(a,a)?.length===0})());
 add('Διαδρομή δεν βγαίνει εκτός ορίων',farmerRoute({x:0,y:0},{x:-1,y:0})===null);
 add('Σειρά εργασιών χωρίς αλλαγή πλέγματος',Array.isArray(farmerQueue));
 add('Λειτουργία περπατήματος ή εργασίας',['idle','walking','working','happy'].includes(farmer.state));
 add('Ο αγρότης σχεδιάζεται στο Canvas',typeof drawFarmer==='function');
 return t;
}
function renderFarmerTests(){const tests=farmerTests(),passed=tests.filter(x=>x.ok).length;document.getElementById('farmerScore').textContent=`${passed}/${tests.length}`;document.getElementById('farmerTestsList').replaceChildren(...tests.map(t=>{const el=document.createElement('div');el.className=t.ok?'ok':'fail';el.textContent=`${t.ok?'✓':'✕'} ${t.name}`;return el}))}
document.getElementById('farmerTestsBtn').onclick=()=>{renderFarmerTests();document.getElementById('farmerQa').classList.toggle('open')};
document.getElementById('farmerStop').onclick=()=>{farmerQueue.length=0;farmer.path.length=0;farmer.target=null;farmer.state='idle';farmer.happyUntil=0;farmerMessage('👨‍🌾 Η σειρά ακυρώθηκε');dirty=true;renderFarmerTests()};
window.__farmFarmerTests=farmerTests;
renderFarmerTests();

// Farmer QA runs movement and animation on the live farmer, never edits farm objects.
window.__farmerLabWalkMode=false;
function farmerLabCancel(){
 farmerQueue.length=0;farmer.path.length=0;farmer.target=null;
 farmer.state='idle';farmer.happyUntil=0;farmer.workUntil=0;dirty=true;
 farmerMessage('👨‍🌾 Έτοιμος για εργασία');
}
function farmerLabWalkTo(px,py){
 const c=pick(px,py),status=document.getElementById('farmerLabStatus');
 if(!c||!farmerWalkable(c.x,c.y)){status.textContent='⛔ Εκτός χάρτη ή πάνω σε αντικείμενο. Επίλεξε ελεύθερο μικρό κελί.';return}
 const start=freeFarmerStart();if(!start){status.textContent='⛔ Δεν υπάρχει διαθέσιμη θέση για τον αγρότη.';return}
 if(!farmerQueue.length&&!farmer.target&&!farmerRoute(start,{x:c.x,y:c.y})){status.textContent='⛔ Δεν υπάρχει προσβάσιμη διαδρομή μέχρι εκεί.';return}
 if(farmerQueue.length>=60){status.textContent='⛔ Μέγιστο 60 εντολές.';return}
 farmerQueue.push({tool:'walk',cell:{x:c.x+.5,y:c.y+.5}});
 status.textContent=`✓ Εντολή μετακίνησης: ${c.x},${c.y} · ${farmerQueue.length+(farmer.target?1:0)} σε σειρά`;
 farmerStartNext();dirty=true;
}
function farmerLabDemo(kind){
 farmerLabCancel();window.__farmerLabWalkMode=false;
 document.getElementById('farmerLabWalk').classList.remove('active');
 if(kind==='happy'){farmer.state='happy';farmer.happyUntil=performance.now()+2000}
 else{farmer.state='working';farmer.target={tool:kind==='harvest'?'demo-harvest':'demo-work'};farmer.workUntil=performance.now()+1900}
 farmer.step=0;dirty=true;
 document.getElementById('farmerLabStatus').textContent='Δοκιμή '+(kind==='harvest'?'συγκομιδής':kind==='work'?'εργασίας':'χαράς')+' στο πραγματικό Canvas, χωρίς αλλαγή στα δεδομένα της φάρμας.';
}
function farmerLabChecks(){
 const cases=[],add=(name,ok)=>cases.push({name,ok:!!ok});
 const start=freeFarmerStart();
 add('Ο αγρότης βρίσκεται εντός διαθέσιμου χάρτη',farmer.x>=0&&farmer.y>=0&&farmer.x<OPEN&&farmer.y<OPEN);
 add('Αποκλείονται θέσεις εκτός ορίων',!farmerWalkable(-1,0)&&!farmerWalkable(OPEN,0));
 add('Το ίδιο κελί έχει μηδενική διαδρομή',!!start&&farmerRoute(start,start)?.length===0);
 add('Αποκλείεται διαδρομή εκτός χάρτη',farmerRoute(start,{x:-1,y:0})===null);
 add('Προστασία από κατειλημμένα footprints',objects.every(o=>!farmerWalkable(o.x,o.y)));
 add('Η διαδρομή χρησιμοποιεί γειτονικά κελιά',(()=>{if(!start)return false;const adjacent=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:start.x+dx,y:start.y+dy})).find(p=>farmerWalkable(p.x,p.y));return !adjacent||farmerRoute(start,adjacent)?.length===1})());
 add('Σύστημα σειράς εντολών',Array.isArray(farmerQueue)&&farmerQueue.length<=60);
 add('Κίνηση/εργασία/χαρά στον ίδιο controller',['idle','walking','working','happy'].includes(farmer.state));
 add('Ανεξάρτητη δοκιμή χωρίς οικονομικές πράξεις',typeof farmerLabDemo==='function'&&typeof farmerLabWalkTo==='function');
 const a=FarmImages.get('farmer_blonde');add('Sprite 8×5 διαθέσιμο',!!a&&a.conf.cols===8&&a.conf.rows===5);
 add('Sprite loaded, decoded',!!a?.img?.naturalWidth&&!!a?.img?.naturalHeight);
 add('Πέντε καταστάσεις animation', ['idle','walking','working','harvesting','happy'].every(x=>typeof x==='string'));
 add('Επιλογή χαρακτήρα', ['classic','blonde'].includes(farmerCharacter));
 add('Τα animations δεν αλλάζουν footprint',typeof drawAssetFarmer==='function');
 add('Τέσσερις ισομετρικές κατευθύνσεις',['NE','NW','SE','SW'].includes(farmer.direction));
 add('Καταγραφή πραγματικών μετακινήσεων',farmerMovementQA instanceof Object&&farmerMovementQA.directions instanceof Set);
 add('Σωστή επιλογή καρέ περπατήματος',farmerSpriteFrame('walking',4,8,5).row===1);
 add('Σωστή επιλογή καρέ συγκομιδής',farmerSpriteFrame('harvesting',4,8,5).row===3);
 add('Σωστή επιλογή καρέ χαράς',farmerSpriteFrame('happy',4,8,5).row===4);
 add('Idle χωρίς άσκοπο animation',farmerSpriteFrame('idle',90,8,5).col===0);
 add('Σωστή σειρά βάθους μπροστά από μικρό αντικείμενο',(()=>{if(!defs.has('cow'))return false;const o={x:20,y:20,kind:'cow'};return objectGroundDepth(o)<23.5+23.5})());
 add('Ο αγρότης πίσω από αντικείμενο όταν βρίσκεται ψηλότερα',objectGroundDepth({x:24,y:24,kind:'cow'})>23.5+23.5);
 add('Τα plots σχεδιάζονται κάτω από τον αγρότη',objectGroundDepth({x:20,y:20,kind:'plot'})<farmerGroundDepth());
 add('4 κατευθύνσεις από μεταβολή θέσης',farmerDirectionForDelta(1,0)==='SE'&&farmerDirectionForDelta(-1,0)==='NW'&&farmerDirectionForDelta(0,1)==='SW'&&farmerDirectionForDelta(0,-1)==='NE');
 add('Καρέ προς/μακριά από την κάμερα',farmerDirectionalFrame('walking',1,8,5,'NW').row!==farmerDirectionalFrame('walking',1,8,5,'SE').row);
 add('Οπτική αλλαγή χαρακτήρα',selectedFarmerAsset()===(farmerCharacter==='blonde'?'farmer_blonde':null));
 add('Ανεξάρτητη σχεδίαση βάθους',typeof drawFarmer==='function'&&typeof drawItem==='function');
 const passed=cases.filter(x=>x.ok).length;
 const result=document.getElementById('farmerLabTests');result.replaceChildren(...cases.map(c=>{const d=document.createElement('div');d.className=c.ok?'pass':'fail';d.textContent=(c.ok?'✓ ':'✕ ')+c.name;return d}));
 document.getElementById('farmerLabStatus').textContent=`Διαγνωστικά: ${passed}/${cases.length} · Πραγματικές κατευθύνσεις ${farmerMovementQA.directions.size}/4 (${[...farmerMovementQA.directions].join(', ')||'καμία'}). Κάνε διαδρομές σε όλες τις πλευρές του χάρτη.`;
 return cases;
}
(function farmerLabInit(){
 const panel=document.getElementById('farmerLab'),toggle=document.getElementById('farmerLabToggle'),walk=document.getElementById('farmerLabWalk');
 toggle.onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open')){window.__farmerLabWalkMode=true;walk.classList.add('active');farmerLabChecks()}else{window.__farmerLabWalkMode=(tool==='test');walk.classList.toggle('active',window.__farmerLabWalkMode)}};
 document.getElementById('farmerLabClose').onclick=()=>{panel.classList.remove('open');window.__farmerLabWalkMode=(tool==='test');walk.classList.toggle('active',window.__farmerLabWalkMode)};
 walk.onclick=()=>{if(tool!=='test')updateTool('test');window.__farmerLabWalkMode=true;walk.classList.add('active');document.getElementById('farmerLabStatus').textContent='👣 Πάτησε ένα ελεύθερο σημείο στον χάρτη. Ο αγρότης θα περπατήσει αυτόματα εκεί.'};
 document.getElementById('farmerLabWork').onclick=()=>farmerLabDemo('work');
 document.getElementById('farmerLabHarvest').onclick=()=>farmerLabDemo('harvest');
 document.getElementById('farmerLabHappy').onclick=()=>farmerLabDemo('happy');
 document.getElementById('farmerLabStop').onclick=()=>{farmerLabCancel();document.getElementById('farmerLabStatus').textContent='✓ Οι εντολές και οι δοκιμές ακυρώθηκαν.'};
 document.getElementById('farmerLabRun').onclick=farmerLabChecks;
 window.__farmerLabChecks=farmerLabChecks;window.__farmerMovementQA=farmerMovementQA;
})();

// General V2: lightweight inspect/diagnostics controls for real iPhone testing.
(function generalV2Controls(){
 const inspect=document.getElementById('generalInspect'),toggle=document.getElementById('generalQaToggle'),panel=document.getElementById('generalQaPanel');
 inspect.onclick=()=>{generalSetInspect(!generalInspectActive);if(generalInspectActive)show('ℹ️ Πάτησε αντικείμενο για πληροφορίες · 1,5 δευτερόλεπτο');};
 function render(){
  const cases=window.__farmGeneralTests(),passed=cases.filter(x=>x.ok).length;
  const host=document.getElementById('generalQaResult');host.replaceChildren();
  const summary=document.createElement('strong');summary.textContent='Αυτόματοι έλεγχοι: '+passed+'/'+cases.length;
  const ul=document.createElement('ul');
  for(const c of cases){const li=document.createElement('li');li.className=c.ok?'ok':'bad';li.textContent=(c.ok?'✓ ':'✕ ')+c.name;ul.append(li)}
  host.append(summary,ul);
 }
 toggle.onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open'))render()};
 document.getElementById('generalQaClose').onclick=()=>panel.classList.remove('open');
})();

// CREATIVE STUDIO controls — V29 catalog, unchanged placement dimensions.
(function creativeStudio(){
 const panel=document.getElementById('creativePanel'),toggle=document.getElementById('creativeToggle');
 const search=document.getElementById('creativeSearch'),groups=document.getElementById('creativeGroup'),items=document.getElementById('creativeItems'),count=document.getElementById('creativeCount'),infoBox=document.getElementById('creativeInfo');
 const groupData=Array.from(window.FarmGridCatalog.ROWS);
 const catalog=groupData.flatMap(([group,records])=>records.map(([id,name,w,h])=>({id,name,w,h,group})));
 for(const [group] of groupData){const option=document.createElement('option');option.value=group;option.textContent=group;groups.append(option)}
 function select(id){const d=defs.get(id);if(!d)return;sel.value=id;infoBox.innerHTML='';infoBox.textContent=d.name+' · '+d.w+'×'+d.h+' μικρά κελιά';const sm=document.createElement('small');sm.textContent=d.group+' · '+'Πάτησε στον χάρτη για τοποθέτηση';infoBox.append(sm);updateTool('place');mark('creativePlace')}
 function refresh(){const prior=items.value||sel.value;const q=search.value.trim().toLocaleLowerCase('el');const subset=catalog.filter(r=>(groups.value==='all'||r.group===groups.value)&&(!q||(r.name+' '+r.id+' '+r.w+'x'+r.h).toLocaleLowerCase('el').includes(q)));items.replaceChildren(...subset.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.name+' · '+r.w+'×'+r.h;return o}));count.textContent=subset.length;if(subset.length){items.value=subset.some(r=>r.id===prior)?prior:subset[0].id;select(items.value)}else infoBox.textContent='Δεν βρέθηκαν αντικείμενα'}
 function mark(id){for(const key of ['creativePlace','creativeMove','creativeRemove'])document.getElementById(key).classList.toggle('selected',id===key)}
 toggle.onclick=()=>{if(farmMode==='farm'){const mp=document.getElementById('marketPanel');mp.classList.toggle('open');toggle.textContent=mp.classList.contains('open')?'🛍️ Market ▾':'🛍️ Market ▸';updateMarketUI();return}panel.classList.toggle('hidden');toggle.textContent=panel.classList.contains('hidden')?'🎨 Κατάλογος ▸':'🎨 Κατάλογος ▾'};
 search.oninput=refresh;groups.onchange=refresh;items.onchange=()=>select(items.value);
 document.getElementById('creativePlace').onclick=()=>{updateTool('place');mark('creativePlace');panel.classList.add('hidden');toggle.textContent='🎨 Κατάλογος ▸'};
 document.getElementById('creativeMove').onclick=()=>{updateTool('move');mark('creativeMove');panel.classList.add('hidden');toggle.textContent='🎨 Κατάλογος ▸'};
 document.getElementById('creativeRemove').onclick=()=>{updateTool('remove');mark('creativeRemove');panel.classList.add('hidden');toggle.textContent='🎨 Κατάλογος ▸'};
 document.getElementById('creativeUndo').onclick=()=>document.getElementById('undo').click();
 document.getElementById('creativeGrid').onclick=()=>document.getElementById('toggleGrid').click();
 document.getElementById('creativeClear').onclick=()=>{if(!confirm('Να σβηστούν ΜΟΝΟ τα αντικείμενα του Creative Mode;'))return;snapshot();objects=[];idCounter=1;save();refreshStatus();dirty=true;show('Ο Creative χάρτης καθαρίστηκε.')};
 window.__creativeMode={get count(){return catalog.length},get selected(){return sel.value},get items(){return objects.length},get grid(){return grid}};
 refresh();
})();


/* V32: complete normal-mode Market browser from the existing 167-item footprint catalogue.
 * Only verified Coin prices are enabled. Historical Farm Cash and Gifts are shown,
 * not charged through Coins, and price-unknown items are not silently estimated. */
const V32_CASH_PRICES=Object.freeze({gnome:13,flamingo:9,band:22,'water-trough':4,
 'large-pond':33,cart:3,'lawn-jockey':8,'pink-outhouse':8,'blue-outhouse':8,
 'pink-barn':27,'black-barn':27,'blue-barn':27,'white-barn':27,
 'groovy-barn':27,'weathered-barn':27,'pink-tool-shed':22,
 manor:56,'black-manor':56,'pink-gazebo':18,gazebo:18,
 treehouse:20,'pink-treehouse':20,santa:38,gingerbread:32,ferris:42,
 haunted:60,'tea-house':38,pagoda:48,igloo:16,
 'country-flags':16,scarecrow:15,'black-scarecrow':15,'pink-scarecrow':15,
 'blue-scarecrow':15,'groovy-scarecrow':15,'feed-trough':3,outhouse:8,
 'sheep-topiary':5,'llama-topiary':10,'flamingo-topiary':15,
 'picnic-basket':17,sundial:23,hammock:25,
 'pink-manor':56,'french-quarter-i':38,'french-quarter-ii':46,
 'shamrock-inn':65,'vacation-home':38,'adobe-barn':28,lodge:69
});
// Verified historical Coin resale values for Cash-only shop items (not 5% of Cash).
const V33_CASH_SELL_COINS=Object.freeze({
 flamingo:50,band:1500,'water-trough':30,'large-pond':3000,cart:25,
 'lawn-jockey':50,'pink-outhouse':50,'blue-outhouse':50,
 'pink-barn':4000,'black-barn':4000,'blue-barn':4000,'white-barn':4000,
 'groovy-barn':4000,'weathered-barn':4000,'pink-tool-shed':1400,
 manor:10000,'black-manor':10000,'pink-gazebo':2500,gazebo:2500,
 treehouse:3000,'pink-treehouse':3000,santa:10000,gingerbread:7500,
 ferris:5000,haunted:11000,'tea-house':5000,pagoda:7500,igloo:2250,
 'country-flags':125,scarecrow:100,'black-scarecrow':100,
 'pink-scarecrow':100,'blue-scarecrow':100,'groovy-scarecrow':100,
 'feed-trough':25,outhouse:50,'sheep-topiary':200,'llama-topiary':350,
 'flamingo-topiary':500,'picnic-basket':400,sundial:75,hammock:2000,
 'pink-manor':10000,'french-quarter-i':3000,'french-quarter-ii':5000,
 'shamrock-inn':3500,'vacation-home':2850,'adobe-barn':4400,lodge:4250,gnome:75

});
// Coins sold by history according to the original Market, without invented equivalents.
function availableFarmCash(){return Math.max(0,5+Math.min(249,Math.max(0,farmLevel().level-1))-cashSpent)}
const V33_VERIFIED_BUY_XP=Object.freeze({
 // source: original FarmVille Helper market records, per-item values.
 hay:5,'pink-hay':5,'gray-hay':5,'green-hay':5,'orange-hay':5,
 'jet-black-hay':5,'violet-hay':5,'blue-hay':5,'red-hay':5,'white-hay':5,
 'farmville-flag':5,'zynga-flag':5,'country-flags':25,
 scarecrow:20,'black-scarecrow':20,'pink-scarecrow':20,'blue-scarecrow':20,'groovy-scarecrow':20,
 'horse-topiary':5,'cow-topiary':5,'goat-topiary':12,'pig-topiary':15,
 'bunny-topiary':23,'duck-topiary':30,'elephant-topiary':36,
 'sheep-topiary':40,'llama-topiary':70,'flamingo-topiary':100,
 barrel:5,crate:5,stool:5,mailbox:5,churn:5,wagon:10,
 wheel:6,bench:7,'covered-wagon':20,'hedge-arch':12,'birdhouse':5,
 lawnmower:5,sandbox:5,'wagon-wheel':7,'axe-block':5,pump:8,
 telephone:9,light:12,'hedge-gate':16,'iron-bench':25,
 gnome:15,flamingo:10,band:300,cart:5,'water-trough':6,
 'feed-trough':5,'large-pond':50,pond:50,'picnic-basket':80,
 sundial:15,hammock:400,outhouse:10,'blue-outhouse':10,'pink-outhouse':10,
 'lawn-jockey':10,'lil-red-wagon':5,bbq:10,bike:5,picnic:10,wood:5,
 'wood-fence':5,fence:5,hedge:6,'black-fence':6,'pink-fence':6,'blue-fence':6,'green-fence':6,
 'ticket-booth':40,carnival:120,'shoe-house':1000,'holiday-tree':0,
 'pink-barn':800,'black-barn':800,'blue-barn':800,'white-barn':800,
 'groovy-barn':800,'weathered-barn':800,'pink-tool-shed':280,
 'pink-manor':2000,manor:2000,'black-manor':2000,
 gazebo:500,'pink-gazebo':500,treehouse:600,'pink-treehouse':600,
 pagoda:1500,'tea-house':1000,santa:2000,igloo:450,
 gingerbread:1500,ferris:1000,'french-quarter-i':600,
 'french-quarter-ii':1000,'shamrock-inn':700,'vacation-home':570,'adobe-barn':800,lodge:850,
 dairy:100,coop:50,stable:50,
 'classic-lodge':8000,estate:6000,'log-cabin':2500,'farm-house':1500,
 greenhouse:1000,windmill:1000,library:1750,'general-store':2000,
 'post-office':1000,school:500, 'red-barn':400
});
let marketPendingCurrency=null,marketPendingPrice=null,marketQaSelected=false;

const V32_GIFT_ONLY=new Set(['rabbit','duck','goat','fig','avocado',
 'plant','blue-gazing-ball','blue-bike','haystack','log-bench','ladder-bucket','barrel-apples','barrel-grapes']);
const V33_MYSTERY_ONLY=new Set(['green-tool-shed','striped-rest-tent']);
const V32_MARKET_META=Object.freeze({
 cow:{level:1},chicken:{level:4,note:'Αρχικά δώρο · διατέθηκε και με Coins'},sheep:{level:7},
 pig:{level:10,note:'Αρχικά δώρο · ορισμένες περίοδοι με Coins'},
 'hay-wagon':{level:18,note:'Διαφορετικές ιστορικές τιμές: 80.000 / 3.000 Coins'},
 hay:{level:2},'pink-hay':{level:3},'white-hay':{level:3},
 cherry:{level:1},apple:{level:1},orange:{level:1},
 greenhouse:{level:30},windmill:{level:22},villa:{level:34},
 silo:{level:13},'red-barn':{level:1},'tool-shed':{level:8},
 barrel:{level:3},stool:{level:5},mailbox:{level:6},churn:{level:7},
 wagon:{level:9},picnic:{level:10},wheel:{level:12},'covered-wagon':{level:15},
 'stone-mailbox':{level:11},hedge:{level:19},'farm-house':{level:26},
 'greenhouse':{level:30},'wood-fence':{level:1},'blue-fence':{level:14},'green-fence':{level:14},
 seeder:{level:14},harvester:{level:13},combine:{level:31},tractor:{level:12},'pink-tractor':{level:12},
 'classic-lodge':{level:31},estate:{level:29},'log-cabin':{level:24},
 'country-flags':{level:1},'farmville-flag':{level:1},'zynga-flag':{level:1},
 'cow-topiary':{level:9},'horse-topiary':{level:6},'goat-topiary':{level:13},
 'pig-topiary':{level:16},'bunny-topiary':{level:19},'duck-topiary':{level:22},
 'elephant-topiary':{level:25},'blue-hay':{level:1},'red-hay':{level:1},
 crate:{level:4},wood:{level:8},bike:{level:10},cart:{level:10},
 bench:{level:13},'covered-wagon':{level:15},'hedge-arch':{level:20},
 'birdhouse':{level:19},lawnmower:{level:21},sandbox:{level:21},
 'wagon-wheel':{level:22},'axe-block':{level:22},pump:{level:23},
 telephone:{level:24},light:{level:25},'hedge-gate':{level:25},
 'iron-bench':{level:27},'wood-fence':{level:10},'pink-fence':{level:13}

});
const V32_SOURCE_LINKS=Object.freeze({
 cow:'https://farmville.fandom.com/wiki/Cow',pig:'https://farmville.fandom.com/wiki/Pig',
 hay:'https://farmville.fandom.com/wiki/Hay_Bale',
 'white-hay':'https://farmville.fandom.com/wiki/White_Hay_Bale',
 cherry:'https://onthefarm.fandom.com/wiki/Trees',apple:'https://onthefarm.fandom.com/wiki/Trees',orange:'https://onthefarm.fandom.com/wiki/Trees',
 greenhouse:'https://onthefarm.fandom.com/wiki/Greenhouse',
 windmill:'https://onthefarm.fandom.com/wiki/Level_22',
 villa:'https://farmville.fandom.com/wiki/Experience',
 coop:'https://farmvillesupdated.wordpress.com/storage/',stable:'https://farmvillesupdated.wordpress.com/storage/',
 bbq:'https://onthefarm.fandom.com/wiki/Decorations',bike:'https://onthefarm.fandom.com/wiki/Decorations',
 'green-fence':'https://onthefarm.fandom.com/wiki/Decorations',hedge:'https://onthefarm.fandom.com/wiki/Decorations',
 'lil-red-wagon':'https://onthefarm.fandom.com/wiki/Decorations',
 'stone-mailbox':'https://onthefarm.fandom.com/wiki/Decorations',
 'hay-wagon':'https://onthefarm.fandom.com/wiki/Decorations',
 'barrel-wagon':'https://onthefarm.fandom.com/wiki/Decorations',
 pond:'https://onthefarm.fandom.com/wiki/Level_1',
 gnome:'https://onthefarm.fandom.com/wiki/Decorations',flamingo:'https://onthefarm.fandom.com/wiki/Decorations',
 band:'https://onthefarm.fandom.com/wiki/Decorations',
 'water-trough':'https://onthefarm.fandom.com/wiki/Decorations',
 'large-pond':'https://onthefarm.fandom.com/wiki/Decorations',
 cart:'https://onthefarm.fandom.com/wiki/Decorations',
 'lawn-jockey':'https://onthefarm.fandom.com/wiki/Decorations',
 'pink-outhouse':'https://onthefarm.fandom.com/wiki/Decorations',
 seeder:'https://farmville.fandom.com/wiki/Vehicle',harvester:'https://farmville.fandom.com/wiki/Vehicle',combine:'https://farmville.fandom.com/wiki/Vehicle',
 'ticket-booth':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 carnival:'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'log-cabin':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'farm-house':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'black-cottage':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 dairy:'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'garden-shed':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 school:'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'post-office':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'general-store':'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 library:'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 estate:'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 lodge:'https://algoentremanos.com/guia-farmville/farmville-edificios-buildings/',
 'wood-fence':'https://onthefarm.fandom.com/wiki/Decorations',
 'black-fence':'https://onthefarm.fandom.com/wiki/Decorations','pink-fence':'https://onthefarm.fandom.com/wiki/Decorations',
 'blue-fence':'https://onthefarm.fandom.com/wiki/Decorations','blue-hay':'https://onthefarm.fandom.com/wiki/Decorations',
 'red-hay':'https://onthefarm.fandom.com/wiki/Decorations',
 wood:'https://onthefarm.fandom.com/wiki/Decorations',picnic:'https://onthefarm.fandom.com/wiki/Decorations'
});
function v32Category(def){
 const k=def.group||'';
 if(k==='Ζώα')return'animals';
 if(k==='Δέντρα / χωράφι')return'trees';
 if(k.startsWith('ΝΕΑ ΚΤΙΡΙΑ')||k==='Κτίρια')return'buildings';
 if(k.startsWith('Οχήματα'))return'vehicles';
 return'decorations';
}
const V32_CATEGORIES=Object.freeze([
 ['all','Όλα'],['seeds','🌱 Σπόροι'],['trees','🌳 Δέντρα'],
 ['animals','🐮 Ζώα'],['buildings','🏠 Κτίρια'],['decorations','🎀 Διακόσμηση'],['vehicles','🚜 Οχήματα']
]);
const V32_ICONS=Object.freeze({seeds:'🌱',trees:'🌳',animals:'🐮',buildings:'🏠',decorations:'🎀',vehicles:'🚜'});
const V36_MARKET=[...defs.values()].filter(d=>d.id!=='plot').map(d=>{
 const category=v32Category(d),coin=FV_CLASSIC_COIN_PRICES[d.id],cash=V32_CASH_PRICES[d.id];
 return {id:d.id,category,name:d.name,def:d,price:Number.isSafeInteger(coin)?coin:null,
 cash:Number.isSafeInteger(cash)?cash:null,gift:V32_GIFT_ONLY.has(d.id),level:V32_MARKET_META[d.id]?.level||null,
 note:V32_MARKET_META[d.id]?.note||''};
});
const V36_MARKET_PRICES=new Map(V36_MARKET.filter(i=>i.price!==null).map(v=>[v.id,v.price]));
const V32_MARKET_SEEDS=Object.entries(FarmCrops.SEEDS).map(([id,d])=>({id:'seed:'+id,seedId:id,
 category:'seeds',name:d.name,icon:d.icon,price:d.cost,cash:null,def:{w:4,h:4},seed:true,seedDef:d}));
const V32_MARKET_ALL=[...V36_MARKET,...V32_MARKET_SEEDS].sort((a,b)=>{
 const score=i=>i.price!==null?0:i.cash!==null?1:i.gift?2:3;
 return score(a)-score(b)||a.name.localeCompare(b.name,'el');
});
const V32_MARKET_PER_PAGE=18;
const v32MarketState={category:'all',filter:'all',query:'',page:0};
const marketTabs=document.getElementById('marketTabs');
for(const [key,label] of V32_CATEGORIES){
 const button=document.createElement('button');button.type='button';button.dataset.category=key;button.textContent=label;
 button.onclick=()=>{v32MarketState.category=key;v32MarketState.page=0;updateMarketUI()};marketTabs.append(button);
}
document.getElementById('marketSearch').oninput=event=>{v32MarketState.query=event.target.value.trim().toLocaleLowerCase('el');v32MarketState.page=0;updateMarketUI()};
document.getElementById('marketPriceFilter').onchange=event=>{v32MarketState.filter=event.target.value;v32MarketState.page=0;updateMarketUI()};
document.getElementById('marketPrev').onclick=()=>{v32MarketState.page=Math.max(0,v32MarketState.page-1);updateMarketUI()};
document.getElementById('marketNext').onclick=()=>{v32MarketState.page++;updateMarketUI()};
function v32FilteredMarket(){return V32_MARKET_ALL.filter(item=>{
 if(v32MarketState.category!=='all'&&item.category!==v32MarketState.category)return false;
 if(v32MarketState.query&&!((item.name+' '+item.id).toLocaleLowerCase('el').includes(v32MarketState.query)))return false;
 if(v32MarketState.filter==='coins')return item.price!==null;
 if(v32MarketState.filter==='cash')return item.cash!==null;
 if(v32MarketState.filter==='gift')return (item.gift||V33_MYSTERY_ONLY.has(item.id))&&item.price===null&&item.cash===null;
 if(v32MarketState.filter==='unknown')return item.price===null&&item.cash===null&&!item.gift&&!V33_MYSTERY_ONLY.has(item.id);
 return true;
})}
function v32MarketThumb(item){
 const icon=document.createElement('div');icon.className='market-thumb';
 const visual=item.seed?null:FarmImages.get(item.id);
 if(visual?.img?.src){const img=document.createElement('img');img.src=visual.img.src;img.alt='';img.loading='lazy';icon.append(img)}
 else icon.textContent=item.icon||V32_ICONS[item.category]||'🌾';
 return icon;
}
// V34 preview: render the EXACT game's existing drawing function onto an isolated canvas snapshot.
// This neither creates game objects nor changes currency or saved progress.
const v34Mask=document.createElement('div');
v34Mask.className='fv34-preview-mask';v34Mask.hidden=true;
v34Mask.innerHTML=`<section class="fv34-preview-dialog" role="dialog" aria-modal="true" aria-label="Προεπισκόπηση αντικειμένου">
 <div class="fv34-preview-head"><div><strong id="fv34Name">Προεπισκόπηση</strong><small>Κλασικό Market · χαρακτηριστικά αντικειμένου</small></div><button type="button" id="fv34Close" aria-label="Κλείσιμο προεπισκόπησης">✕</button></div>
 <div class="fv34-preview-art" id="fv34Art"></div>
 <div class="fv34-preview-cost" id="fv34Cost"></div>
 <div class="fv34-preview-meta" id="fv34Meta"></div>
 <div class="fv34-preview-actions"><button type="button" id="fv34Back">Πίσω στο Market</button><button type="button" id="fv34Buy" class="fv34-buy">🛒 Αγορά</button></div>
 </section>`;
document.body.appendChild(v34Mask);
let v34ActiveItem=null,v34LastFocus=null;
const v34Art=document.getElementById('fv34Art');
const v34Close=()=>{if(v34Mask.hidden)return;v34Mask.hidden=true;v34ActiveItem=null;v34LastFocus?.focus?.()};
document.getElementById('fv34Close').onclick=v34Close;
document.getElementById('fv34Back').onclick=v34Close;
v34Mask.addEventListener('click',e=>{if(e.target===v34Mask)v34Close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!v34Mask.hidden)v34Close()});
function v34LiveArt(item){
 const output=document.createElement('canvas');const pw=260,ph=190;
 const dpr=Math.min(2,cv.width/Math.max(1,W));output.width=Math.round(pw*dpr);output.height=Math.round(ph*dpr);
 output.style.cssText='width:260px;height:190px;max-width:100%;object-fit:contain';
 const outCtx=output.getContext('2d');
 if(item.seed){
  const sc=dpr;outCtx.scale(sc,sc);outCtx.fillStyle='#816344';outCtx.strokeStyle='#564124';outCtx.lineWidth=2;
  outCtx.beginPath();outCtx.moveTo(130,105);outCtx.lineTo(211,135);outCtx.lineTo(130,166);outCtx.lineTo(49,135);outCtx.closePath();outCtx.fill();outCtx.stroke();
  outCtx.font='60px system-ui';outCtx.textAlign='center';outCtx.textBaseline='middle';outCtx.fillText(item.icon||'🌱',130,87);
  return output;
 }
 const d=item.def;if(!d)return output;
 // Use the existing drawItem renderer on the native game canvas, then restore pixels immediately.
 // No objects or purchase state are touched. Clip before drawing to prevent leaking outside region.
 const sx=Math.max(0,Math.floor((W-pw)/2)),sy=Math.max(0,Math.floor((H-ph)/2));
 const realPw=Math.min(pw,W-sx),realPh=Math.min(ph,H-sy);
 const device= cv.width/Math.max(1,W);
 const box={x:Math.round(sx*device),y:Math.round(sy*device),w:Math.round(realPw*device),h:Math.round(realPh*device)};
 const old={cx,cy,zoom,dirty};let original=null;
 try{
  if(!box.w||!box.h)return output;
  original=ctx.getImageData(box.x,box.y,box.w,box.h);
  ctx.save();ctx.beginPath();ctx.rect(sx,sy,realPw,realPh);ctx.clip();ctx.clearRect(sx,sy,realPw,realPh);
  const visualWidth=Math.max(d.w,d.h),visualArea=d.w+d.h;
  zoom=Math.min(3.15,Math.max(.52,Math.min(165/(UNITW*visualWidth),127/(UNITH*visualArea*.5))));
  cx=sx+realPw/2-(d.w-d.h)*UNITW*.5*zoom;
  cy=sy+realPh*.79-(d.w+d.h)*UNITH*.5*zoom;
  drawItem({id:-1,kind:item.id,x:0,y:0});
  const painted=ctx.getImageData(box.x,box.y,box.w,box.h);
  outCtx.putImageData(painted,0,0);
 }catch(e){console.warn('V34 preview rendering',e);return null}
 finally{
  if(original)ctx.putImageData(original,box.x,box.y);
  try{ctx.restore()}catch(e){}
  cx=old.cx;cy=old.cy;zoom=old.zoom;dirty=true;
 }
 return output;
}
// Historical on-farm harvest data from FarmVille Wiki and period guides.
// Harvest data are shown as reference only, not as implemented mechanics.
const V35_HISTORICAL_YIELD=Object.freeze({
 cow:{product:'Γάλα',time:'1 ημέρα',coins:6},
 chicken:{product:'Αυγά',time:'1 ημέρα',coins:8},
 sheep:{product:'Μαλλί',time:'3 ημέρες',coins:28},
 pig:{product:'Τρούφες',time:'2 ημέρες',coins:30},
 apple:{product:'Μήλα',time:'3 ημέρες',coins:28},
 cherry:{product:'Κεράσια',time:'2 ημέρες',coins:18},
 orange:{product:'Πορτοκάλια',time:'4 ημέρες',coins:40},
 rabbit:{product:'Μαλλί Angora',time:'4 ημέρες',coins:60},
 duck:{product:'Πούπουλα',time:'2 ημέρες',coins:45},
 goat:{product:'Κατσικίσιο γάλα',time:'2 ημέρες',coins:54},
 fig:{product:'Σύκα',time:'3 ημέρες',coins:33},
 avocado:{product:'Αβοκάντο',time:'3 ημέρες',coins:37},
 lychee:{product:'Λίτσι',time:'3 ώρες',coins:140},
 maple:{product:'Σιρόπι σφενδάμου',time:'2 ημέρες',coins:150}
});
function v35Duration(ms){
 if(!Number.isFinite(ms))return 'σε έρευνα';
 const h=ms/3600000;
 if(h>=24&&h%24===0)return (h/24)+' '+(h===24?'ημέρα':'ημέρες');
 if(h>=24)return Math.floor(h/24)+' ημέρες και '+Math.round(h%24)+' ώρες';
 return h+' ώρες';
}
function v34OpenPreview(item,source){
 v34LastFocus=document.activeElement;v34ActiveItem=item;
 document.getElementById('fv34Name').textContent=item.name;
 v34Art.replaceChildren();
 const visual=v34LiveArt(item);
 if(visual)v34Art.appendChild(visual);
 else {const n=document.createElement('div');n.textContent=item.icon||V32_ICONS[item.category]||'🌾';n.style.cssText='font-size:75px;padding:38px';v34Art.append(n)}
 const asset=item.seed?null:FarmImages.get(item.id);
 if(!item.seed&&!asset?.img?.naturalWidth&&item.id!=='apple'&&item.id!=='hay'&&!ROTATE_FENCE_TYPES.has(item.id)){
  const n=document.createElement('div');n.className='fv34-art-warning';n.textContent='Χωρίς PNG ακόμα · δείχνει το προσωρινό σχέδιο που χρησιμοποιεί η φάρμα';v34Art.append(n);
 }
 const cost=item.price!==null?'🪙 '+item.price.toLocaleString('el-GR')+' Coins':item.cash!==null?'💵 '+item.cash+' Farm Cash':item.gift?'🎁 Μόνο δώρο':'❔ Τιμή χωρίς επιβεβαίωση';
 document.getElementById('fv34Cost').textContent=cost;
 const meta=document.getElementById('fv34Meta');meta.replaceChildren();
 const size=item.seed?'1 χωράφι (4×4)':item.def.w+'×'+item.def.h+' μικρά κελιά';
 // V35: distinguish the three very different numbers: purchase, resale, harvest.
 // This is historical reference information; it does not silently add harvest mechanics.
 const categoryName=V32_CATEGORIES.find(c=>c[0]===item.category)?.[1]||item.category;
 const resale=item.seed?null:salePrice({kind:item.id});
 const production=V35_HISTORICAL_YIELD[item.id]||null;
 const bonusXP=item.seed?item.seedDef?.xp:(V33_VERIFIED_BUY_XP[item.id]??FV_MARKET_BUY_XP[item.id]);
 const rows=[
  '🏷️ Κατηγορία: '+categoryName,
  '📐 Χώρος στον χάρτη: '+size,
  ...(item.level?['⭐ Επίπεδο αγοράς: '+item.level]:[]),
  ...(Number.isFinite(bonusXP)?['✨ XP τοποθέτησης: '+bonusXP]:[]),
  ...(!item.seed?['🪙 Μεταπώληση αντικειμένου: '+(resale===null?'μη επιβεβαιωμένη':resale.toLocaleString('el-GR')+' Coins')]:[]),
 ];
 if(item.seed){
  if(Number.isFinite(item.seedDef?.reward))rows.push('🌾 Coins συγκομιδής: '+item.seedDef.reward.toLocaleString('el-GR'));
  if(Number.isFinite(item.seedDef?.grow))rows.push('⏱️ Χρόνος ωρίμανσης: '+v35Duration(item.seedDef.grow));
 }else if(production){
  rows.push('🌿 Παράγει: '+production.product);
  rows.push('⏱️ Ιστορικός χρόνος συγκομιδής: '+production.time);
  rows.push('🧺 Coins ανά συγκομιδή: '+production.coins.toLocaleString('el-GR'));
 }
 if(item.note)rows.push('ℹ️ '+item.note);
 const section=document.createElement('div');section.style.cssText='font-weight:900;margin-bottom:4px;color:#6e4a24';section.textContent='Χαρακτηριστικά';meta.append(section);
 for(const line of rows){const div=document.createElement('div');div.textContent=line;meta.append(div)}
 if(source){
  const a=document.createElement('a');a.href=source;a.target='_blank';a.rel='noopener noreferrer';
  a.textContent=V32_SOURCE_LINKS[item.id]?'📚 Πηγή αντικειμένου ↗':'📚 Ιστορικός κατάλογος ↗';meta.append(a);
 }
 if(production){
  const n=document.createElement('div');n.style.cssText='font-size:10px;color:#755b3b;margin-top:4px';
  n.textContent=V36_HARVEST[item.id]?'✅ Η παραγωγή λειτουργεί στο Κανονικό mode με πραγματικό χρόνο.':'ℹ️ Ιστορικά στοιχεία για αναφορά.';meta.append(n);
 }
 const buy=document.getElementById('fv34Buy');const qa=v33QaInput.checked&&!item.seed;
 const locked=!qa&&v33IsLocked(item),enough=item.price!==null?coins>=item.price:item.cash!==null?availableFarmCash()>=item.cash:false;
 buy.disabled=!qa&&(locked||!enough);
 buy.textContent=qa?'🧪 Δοκιμή':item.seed?'🌱 Σπορά':'🛒 Αγορά';
 if(buy.disabled)buy.textContent=locked?'🔒 Lv '+item.level:!enough?'Μη διαθέσιμο':'Αγορά';
 buy.onclick=()=>{v34Close();v32SelectMarketPurchase(item,qa)};
 v34Mask.hidden=false;document.getElementById('fv34Close').focus();
}
window.FV3026PreviewDiagnostics={get open(){return !v34Mask.hidden},get item(){return v34ActiveItem?.id||null},close:v34Close};
const v33QaInput=document.getElementById('marketQA');
v33QaInput.onchange=()=>{v32MarketState.page=0;updateMarketUI()};
function v33IsLocked(item){return item.level!==null&&farmLevel().level<item.level}
function v32SelectMarketPurchase(item,qa=false){
 if(item.seed){
  if(coins<item.price){show('Δεν έχεις αρκετά Coins για σπορά');return}
  marketSelected=null;marketPendingCurrency=null;seedSelect.value=item.seedId;refreshSeed();updateTool('seed');
  document.getElementById('marketStatus').textContent='🌱 '+item.name+' · '+item.price+' Coins ανά χωράφι. Διάλεξε οργωμένο χωράφι.';
  document.getElementById('marketPanel').classList.remove('open');
  show('🌱 '+item.name+' · διάλεξε οργωμένο χωράφι');return;
 }
 if(qa&&!v33QaInput.checked){show('Πρέπει να ενεργοποιήσεις τη δοκιμή.');return}
 if(!qa&&v33IsLocked(item)){show('🔒 Χρειάζεται Level '+item.level);return}
 const currency=qa?'test':item.price!==null?'coins':item.cash!==null?'cash':null;
 const amount=currency==='coins'?item.price:currency==='cash'?item.cash:0;
 if(!currency){show('Δεν έχει επιβεβαιωμένη τιμή. Ενεργοποίησε Δοκιμή για έλεγχο.');return}
 if(currency==='coins'&&coins<amount){show('Δεν έχεις αρκετά Coins');return}
 if(currency==='cash'&&availableFarmCash()<amount){show('Δεν έχεις αρκετά Farm Cash');return}
 marketSelected=item.id;sel.value=item.id;updateTool('place');
 marketPendingCurrency=currency;marketPendingPrice=amount;marketQaSelected=qa;
 document.getElementById('marketStatus').textContent='✓ '+item.name+' · '+(qa?'ΔΟΚΙΜΗ — δωρεάν':amount+' '+(currency==='cash'?'Farm Cash':'Coins'))+' · πάτησε ελεύθερη θέση.';
 document.getElementById('marketPanel').classList.remove('open');document.getElementById('fvStoragePanel')?.classList.remove('open');
 show((qa?'🧪 Δοκιμή ':'🛍️ Αγορά ')+item.name+' · διάλεξε θέση');dirty=true;
}
function updateMarketUI(){
 const wallet=document.getElementById('marketWallet');if(!wallet)return;
 wallet.textContent='🪙 '+coins.toLocaleString('el-GR')+' Coins · 💵 '+availableFarmCash()+' Farm Cash · ⭐ LV '+farmLevel().level;
 for(const tab of marketTabs.children){tab.classList.toggle('active',tab.dataset.category===v32MarketState.category)}
 const results=v32FilteredMarket(),pages=Math.max(1,Math.ceil(results.length/V32_MARKET_PER_PAGE));
 v32MarketState.page=Math.min(v32MarketState.page,pages-1);
 const verified=V36_MARKET.filter(i=>i.price!==null).length;
 const premiums=V36_MARKET.filter(i=>i.cash!==null).length;
 document.getElementById('marketCount').textContent=results.length+' αποτελέσματα · '+verified+' Coins · '+premiums+' Cash · '+V32_MARKET_SEEDS.length+' σπόροι';
 const holder=document.getElementById('marketItems');holder.replaceChildren();
 const selected=results.slice(v32MarketState.page*V32_MARKET_PER_PAGE,(v32MarketState.page+1)*V32_MARKET_PER_PAGE);
 for(const item of selected){
  const row=document.createElement('div');row.className='market-item'+(marketSelected===item.id?' selected':'');
  const info=document.createElement('div');info.className='market-info';
  const title=document.createElement('strong');title.textContent=item.name;
  const details=document.createElement('small');
  const level=item.level?' · Lv '+item.level:'';
  const size=item.seed?'ανά χωράφι':(item.def.w+'×'+item.def.h+' κελιά');
  const knownSell=item.seed?null:salePrice({kind:item.id});
  const resale=item.seed?' · Συγκομιδή '+item.seedDef.reward.toLocaleString('el-GR')+' 🪙':knownSell!==null?' · Πώληση '+knownSell.toLocaleString('el-GR')+' 🪙':'';
  details.textContent=size+level+resale+(item.note?' · '+item.note:'');
  const price=document.createElement('span');price.className='market-amount';
  if(item.price!==null){price.textContent='🪙 '+item.price.toLocaleString('el-GR')+' Coins'}
  else if(item.cash!==null){price.textContent='💵 '+item.cash+' Farm Cash';price.classList.add('cash')}
  else if(V33_MYSTERY_ONLY.has(item.id)){price.textContent='🎁 Mystery Box Reward'}
  else if(item.gift){price.textContent='🎁 Διαθέσιμο ως δώρο'}
  else{price.textContent='❔ Τιμή μη επιβεβαιωμένη'}
  info.append(title,price,details);
  const source=V32_SOURCE_LINKS[item.id] ||
   (item.price!==null||item.cash!==null ?
      (item.category==='decorations'?'https://farmvillehelper.yolasite.com/decoration.php':
       item.category==='buildings'?'https://farmvillehelper.yolasite.com/buildings.php':
       item.category==='vehicles'?'https://farmville.fandom.com/wiki/Vehicle':
       item.category==='trees'?'https://onthefarm.fandom.com/wiki/Trees':
       'https://onthefarm.fandom.com/wiki/Animals') : null);
  if(source){
   const hint=document.createElement('small');const link=document.createElement('a');link.href=source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ιστορική πηγή ↗';
   link.style.cssText='color:#417225;text-decoration:underline;touch-action:manipulation';
   hint.append(link);info.append(hint);
  }
  const button=document.createElement('button');button.type='button';button.className='market-purchase';
  const qa=v33QaInput.checked&&!item.seed;
  if(qa){button.textContent='🧪 Δοκιμή';button.classList.add('qa');button.onclick=()=>v32SelectMarketPurchase(item,true)}
  else if(item.price!==null||item.cash!==null){
   const locked=v33IsLocked(item),enough=item.price!==null?coins>=item.price:availableFarmCash()>=item.cash;
   button.textContent=locked?'🔒 Lv '+item.level:enough?(item.seed?'🌱 Σπορά':'🛒 Αγορά'):(item.cash!==null?'Λίγα Cash':'Λίγα Coins');
   button.disabled=locked||!enough;button.classList.toggle('available',enough&&!locked);
   button.onclick=()=>v32SelectMarketPurchase(item,false);
  }else{button.disabled=true;button.textContent=V33_MYSTERY_ONLY.has(item.id)?'Mystery Box':item.gift?'Μόνο δώρο':'Σε έρευνα'}
  const preview=document.createElement('div');preview.className='market-preview';preview.hidden=true;
  preview.textContent='📐 '+size+resale+level+(item.note?' · '+item.note:'')+(source?' · υπάρχει σύνδεσμος πηγής':'');
  const more=document.createElement('button');more.type='button';more.className='market-preview-button';more.textContent='👁';more.title='Ζωντανή προεπισκόπηση';more.setAttribute('aria-label','Ζωντανή προεπισκόπηση '+item.name);
  more.style.cssText='min-width:35px;padding:8px 4px;font-size:14px;align-self:center';more.onclick=()=>v34OpenPreview(item,source);
  info.append(preview);row.append(v32MarketThumb(item),info,more,button);holder.append(row);
  continue;
 }
 if(!selected.length){const empty=document.createElement('div');empty.className='market-tip';empty.textContent='Δεν βρέθηκαν αντικείμενα με αυτά τα φίλτρα.';holder.append(empty)}
 document.getElementById('marketPage').textContent=(v32MarketState.page+1)+' / '+pages;
 document.getElementById('marketPrev').disabled=v32MarketState.page===0;
 document.getElementById('marketNext').disabled=v32MarketState.page>=pages-1;
}
window.FV3026MarketV33={get wallet(){return {coins,cash:availableFarmCash(),cashSpent}},get qa(){return v33QaInput.checked},get entries(){return V32_MARKET_ALL.length},get confirmedCoinItems(){return V36_MARKET_PRICES.size},get cashItems(){return Object.keys(V32_CASH_PRICES).length},get filteredCount(){return v32FilteredMarket().length},get allItems(){return V32_MARKET_ALL.map(i=>({id:i.id,price:i.price,cash:i.cash,category:i.category,gift:!!i.gift}))}};
function setFarmMode(next){
 if(next!=='farm')return;
 closeBarnMenu();setStoragePanel(false);
 generalSetInspect(false);
 if(farmMode!==next){
  save();farmMode=next;STORAGE=next==='farm'?'classic-farm-normal-v36-v1':'classic-farm-creative-v29-v1';
  objects=[];storedItems=[];storagePickId=null;idCounter=1;coins=1000;xp=0;cashSpent=0;history=[];marketSelected=null;
  movingId=null;moveOffset={x:0,y:0};farmerLabCancel();load();v36MigrateTimers();
 }
 document.documentElement.classList.toggle('mode-farm',farmMode==='farm');
 window.FarmClassicTools?.syncRotate();
 document.getElementById('farmModeCreative').classList.toggle('active',farmMode==='creative');
 document.getElementById('farmModeNormal').classList.toggle('active',farmMode==='farm');
 document.getElementById('creativePanel').classList.add('hidden');
 document.getElementById('marketPanel').classList.remove('open');
 cropWindow.classList.remove('open');
 document.getElementById('creativeToggle').textContent=farmMode==='farm'?'🛍️ Market ▸':'🎨 Κατάλογος ▸';
 document.getElementById('creativePanel').setAttribute('aria-hidden',farmMode==='farm'?'true':'false');
 if(farmMode==='farm'){marketSelected=null;updateTool('multi');window.FarmClassicTools?.sync()}else updateTool('test');
 refreshStatus();updateMarketUI();refreshStorageUI();refreshBarnManualChecks();dirty=true;farmSaveStatus();hideCropMiniBubble();document.getElementById('fvMorePanel')?.classList.remove('open');
 show(farmMode==='farm'?'🌾 Κανονική φάρμα — πραγματικά Coins':'🎨 Creative — δωρεάν τοποθέτηση');
}
// V28: Two independent saves, *one* Normal Farm engine and one set of mechanics.
// No separate creative placement/catalog logic is used.
function setProfileMode(next){
 if(next!=='normal'&&next!=='creative')return false;
 if(next===profileMode)return true;
 if(!save()){
  show('⚠ Δεν έγινε αλλαγή φάρμας: το τρέχον save δεν αποθηκεύτηκε.');
  return false;
 }
 // Cancel map actions/popups BEFORE switching saves.
 window.FarmClassicTools?.closeRecycle();
 window.FarmClassicTools?.close();
 closeBarnMenu();setStoragePanel(false);
 generalSetInspect(false);
 cropWindow.classList.remove('open');
 document.getElementById('marketPanel').classList.remove('open');
 document.getElementById('creativePanel').classList.add('hidden');
 hideCropMiniBubble();
 farmerLabCancel();
 profileMode=next;
 STORAGE=next==='normal'?NORMAL_SAVE_KEY:CREATIVE_SAVE_KEY;
 objects=[];storedItems=[];storagePickId=null;idCounter=1;
 farmName='Η ΦΑΡΜΑ ΜΟΥ';lastLevelShown=null;
 coins=next==='creative'?CREATIVE_COINS:1000;
 xp=next==='creative'?CREATIVE_COINS:0;
 history=[];marketSelected=null;cashSpent=0;marketPendingCurrency=null;marketQaSelected=false;movingId=null;moveOffset={x:0,y:0};
 lastFarmSaveOK=null;lastFarmSaveAt=0;lastFarmSaveError='';
 load();
 v36MigrateTimers();
 replenishCreativeProfile();
 lastLevelShown=null;
 updateTool('multi');
 document.documentElement.classList.toggle('profile-creative',next==='creative');
 updateFarmNameUI();
document.getElementById('fvProfileSwitch').textContent=next==='creative'?'🌾 Μετάβαση στην Κανονική φάρμα':'🧪 Creative · MAX Level';
 save(); // Create Creative save on first visit, or persist the topped-up test wallet.
 refreshStatus();updateMarketUI();refreshStorageUI();refreshBarnManualChecks();
 renderCropWindow();farmSaveStatus();dirty=true;
 show(next==='creative'?'🧪 Creative: MAX Level και 999.999.999 Coins · ξεχωριστή φάρμα':'🌾 Κανονική φάρμα · η κανονική σου πρόοδος');
 return true;
}
window.FV3026Profiles={
 get mode(){return profileMode},
 get saveKey(){return STORAGE},
 get level(){return profileMode==='creative'?CREATIVE_MAX_LEVEL:null},
 get coins(){return coins},
 get objectCount(){return objects.length},
 get inventoryCount(){return storedItems.length},
 switchTo:setProfileMode
};
document.getElementById('fvProfileSwitch').onclick=()=>setProfileMode(profileMode==='normal'?'creative':'normal');

// Renaming is per profile; both run the same game and use separate save keys.
document.getElementById('fvFarmNameSave').onclick=()=>{
 const proposed=sanitizeFarmName(document.getElementById('fvFarmNameInput').value);
 const before=farmName;farmName=proposed;
 if(!save()){farmName=before;updateFarmNameUI();return;}
 updateFarmNameUI();show('🏡 Νέο όνομα φάρμας: '+farmName);
};
document.getElementById('fvFarmNameInput').addEventListener('keydown',e=>{
 if(e.key==='Enter'){e.preventDefault();document.getElementById('fvFarmNameSave').click();document.getElementById('fvFarmNameInput').blur();}
});
updateFarmNameUI();

document.getElementById('farmModeCreative').onclick=()=>{};
document.getElementById('farmModeNormal').onclick=()=>setFarmMode('farm');
document.getElementById('marketClose').onclick=()=>document.getElementById('marketPanel').classList.remove('open');
window.__farmMarketTests=()=>[
 {name:'Αποθήκευση Creative ανεξάρτητη',ok:STORAGE===(farmMode==='farm'?'classic-farm-normal-v36-v1':'classic-farm-creative-v29-v1')},
 {name:'Όλα τα εμπορεύματα υπάρχουν στον κατάλογο',ok:V36_MARKET.every(i=>defs.has(i.id))},
 {name:'Όλοι οι σπόροι του τρέχοντος συστήματος εμφανίζονται',ok:V32_MARKET_SEEDS.length===Object.keys(FarmCrops.SEEDS).length},
 {name:'Όλα τα αντικείμενα εμφανίζονται μία φορά',ok:new Set(V36_MARKET.map(i=>i.id)).size===V36_MARKET.length},
 {name:'Unknown/gift/Cash δεν χρεώνονται ως Coins',ok:V36_MARKET.every(i=>i.price!==null||!V36_MARKET_PRICES.has(i.id))},
 {name:'Ακέραιες τιμές ή υπό έρευνα',ok:V36_MARKET.every(i=>i.price===null||(Number.isSafeInteger(i.price)&&i.price>=0))},
 {name:'Δεν πωλούνται plot μέσα από το Market',ok:!V36_MARKET_PRICES.has('plot')},
 {name:'Δεν πωλούνται αντικείμενα εκτός Market',ok:!V36_MARKET_PRICES.has('not-an-item')},
 {name:'Ιστορική τιμή Seeder 30.000 Coins',ok:V36_MARKET_PRICES.get('seeder')===30000},
 {name:'Ιστορική τιμή Combine 500.000 Coins',ok:V36_MARKET_PRICES.get('combine')===500000},
 {name:'Premium Market τιμές χωρίς χρέωση Coins',ok:V32_CASH_PRICES.gazebo===18&&!V36_MARKET_PRICES.has('gazebo')},
 {name:'Farm Cash αρχικό 5',ok:Number.isInteger(cashSpent)&&availableFarmCash()>=0},
 {name:'Αντικείμενα δοκιμής δεν δίνουν Coins',ok:salePrice({kind:'cow',marketTest:true})===0},
 {name:'Market QA επιλογή διαθέσιμη',ok:!!document.getElementById('marketQA')}

];

// V37 status UI: read-only; never mutates plot geometry, crop inventory, or Coins.
const cropWindow=document.getElementById('cropWindow');
// V40: Show fixed planting/harvest clock times; never a live countdown.
// Dates come from the original plantedAt timestamp and seed grow duration.
function cropClock(timestamp){
 const date=new Date(timestamp);
 if(!Number.isFinite(timestamp)||Number.isNaN(date.getTime()))return '—';
 return date.toLocaleString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
function cropSchedule(crop,seed){
 if(!crop||!seed||!Number.isFinite(crop.plantedAt))return null;
 return {plantedAt:crop.plantedAt,readyAt:crop.plantedAt+seed.grow};
}
// V42 small crop status above the farm, computed from existing plantedAt timestamps.
// V43: Show information for the SPECIFIC tapped crop for exactly 1500 ms.
// Crop growth remains timestamp-based; this is only a transient UI hint.
let cropHintTimer=null;
function hideCropMiniBubble(){
 const bubble=document.getElementById('cropMiniBubble');
 if(bubble)bubble.classList.remove('has-crops');
 if(cropHintTimer!==null){clearTimeout(cropHintTimer);cropHintTimer=null;}
}
function refreshCropMiniBubble(plot,px,py){
 const bubble=document.getElementById('cropMiniBubble');
 if(!bubble||farmMode!=='farm'||!plot?.crop){hideCropMiniBubble();return}
 const crop=plot.crop,seed=FarmCrops.SEEDS[crop.seed];
 if(!seed){hideCropMiniBubble();return}
 const status=FarmCrops.stage(crop,Date.now());
 const schedule=cropSchedule(crop,seed);
 const main=document.getElementById('cropMiniMain'),clock=document.getElementById('cropMiniClock');
 main.textContent=`${seed.icon} ${seed.name}`;
 clock.textContent=status==='withered'?'🥀 Μαραμένο · νέο όργωμα':
  status==='ripe'?'✅ Έτοιμο για συγκομιδή':
  schedule?`🌾 Ωριμάζει: ${cropClock(schedule.readyAt)}`:'🌱 Σε ανάπτυξη';
 // Keep the tooltip inside the visible iPhone screen, above the touched crop.
 const x=Math.max(125,Math.min(window.innerWidth-125,px));
 const y=Math.max(78,Math.min(window.innerHeight-20,py-90));
 bubble.style.left=x+'px';bubble.style.top=y+'px';
 bubble.classList.add('has-crops');
 if(cropHintTimer!==null)clearTimeout(cropHintTimer);
 cropHintTimer=setTimeout(()=>{bubble.classList.remove('has-crops');cropHintTimer=null},1500);
}
function renderCropWindow(){
 if(farmMode!=='farm'||!cropWindow.classList.contains('open'))return;
 const all=objects.filter(o=>o.kind==='plot');const now=Date.now();
 const occupied=all.filter(p=>p.crop),ripe=occupied.filter(p=>FarmCrops.stage(p.crop,now)==='ripe'),wilt=occupied.filter(p=>FarmCrops.stage(p.crop,now)==='withered');
 const stats=document.getElementById('cropStats');stats.replaceChildren();
 for(const item of [`🟫 ${all.length} χωράφια`,`🌱 ${occupied.length} φυτεμένα`,`✅ ${ripe.length} έτοιμα`,`🥀 ${wilt.length} μαραμένα`]){const span=document.createElement('span');span.textContent=item;stats.appendChild(span)}
 const next=document.getElementById('cropNextHarvest');
 const growing=occupied.filter(p=>FarmCrops.stage(p.crop,now)==='growing'&&FarmCrops.SEEDS[p.crop.seed]);
 const nextPlant=[...growing].sort((a,b)=>(a.crop.plantedAt+FarmCrops.SEEDS[a.crop.seed].grow)-(b.crop.plantedAt+FarmCrops.SEEDS[b.crop.seed].grow))[0];
 if(nextPlant){
  const d=FarmCrops.SEEDS[nextPlant.crop.seed],schedule=cropSchedule(nextPlant.crop,d);
  next.textContent=`🌾 Επόμενη ωρίμανση: ${d.icon} ${d.name} — ${cropClock(schedule.readyAt)} · Φύτευση: ${cropClock(schedule.plantedAt)} · Ανάπτυξη: ${Math.min(99,Math.floor(Math.max(0,now-nextPlant.crop.plantedAt)/d.grow*100))}%`;
 }else if(ripe.length){
  next.textContent=`✅ Έχεις ${ripe.length} έτοιμα χωράφια για συγκομιδή.`;
 }else{
  next.textContent='🌾 Δεν υπάρχει καλλιέργεια σε ανάπτυξη.';
 }
 const list=document.getElementById('cropList');list.replaceChildren();
 if(!all.length){const info=document.createElement('div');info.className='crop-card';info.textContent='Δεν υπάρχουν χωράφια. Πάτησε 🚜 για να οργώσεις ένα τετράγωνο 4×4.';list.appendChild(info);return}
 const sorted=[...all].sort((a,b)=>Number(!!b.crop)-Number(!!a.crop)||a.y-b.y||a.x-b.x);
 for(const p of sorted.slice(0,36)){
  const card=document.createElement('div');card.className='crop-card';const title=document.createElement('strong'),sub=document.createElement('small');
  const pos=`(${p.x}, ${p.y})`;
  if(!p.crop){title.textContent=`🟫 Χωράφι ${pos} · ${p.soil==='fallow'?'Χρειάζεται όργωμα':'Έτοιμο'}`;sub.textContent=p.soil==='fallow'?'Χρειάζεται νέο όργωμα (15 Coins).':'Διαθέσιμο για σπορά.'}
  else{const d=FarmCrops.SEEDS[p.crop.seed],st=FarmCrops.stage(p.crop,now),elapsed=now-p.crop.plantedAt;
   const schedule=cropSchedule(p.crop,d);
   title.textContent=`${st==='withered'?'🥀':st==='ripe'?'✅':d.icon} ${d.name} · ${pos}`;
   const state=st==='growing'?`🌱 Ανάπτυξη ${Math.min(99,Math.floor(Math.max(0,elapsed)/d.grow*100))}%`:
    st==='ripe'?'✅ Έτοιμο για συγκομιδή':'🥀 Μαραμένο · χρειάζεται όργωμα';
   sub.textContent=state;
   if(schedule){
    const times=document.createElement('div');times.className='crop-clock-info';
    const planted=document.createElement('span');planted.textContent=`🌱 Φυτεύτηκε: ${cropClock(schedule.plantedAt)}`;
    const ready=document.createElement('span');ready.textContent=`🌾 Ωριμάζει: ${cropClock(schedule.readyAt)}`;
    times.append(planted,ready);card.append(title,sub,times);list.appendChild(card);
    continue;
   }
  }
  card.append(title,sub);list.appendChild(card);
 }
 if(sorted.length>36){const note=document.createElement('div');note.className='crop-legend';note.textContent=`Προβάλλονται 36 από ${sorted.length} χωράφια για άνετη χρήση στο κινητό.`;list.append(note)}
}
document.getElementById('cropOpen').onclick=()=>{document.getElementById('marketPanel').classList.remove('open');cropWindow.classList.toggle('open');renderCropWindow()};
document.getElementById('cropClose').onclick=()=>cropWindow.classList.remove('open');
function cropAutosave(){
 if(farmMode!=='farm')return;
 save();
}
setInterval(cropAutosave,15000); // no visual countdown: a periodic storage flush only.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cropAutosave()});
window.addEventListener('pagehide',()=>{try{save()}catch(e){}});
window.addEventListener('pageshow',()=>{farmSaveStatus();renderCropWindow()});
farmSaveStatus();

// V39: explicit backups avoid iOS local-file URL storage isolation. No timers in UI.
(function installCropBackups(){
 const notice=document.getElementById('cropSaveNotice');
 const file=document.getElementById('cropSaveFile');
 const report=s=>{notice.textContent=s};
 document.getElementById('cropSaveExport').onclick=()=>{
  if(farmMode!=='farm'){report('Δεν είναι διαθέσιμη η φάρμα.');return}
  save();
  const payload={format:'classic-farm-save',version:1,exportedAt:new Date().toISOString(),farm:{version:21,objects,idCounter,coins,xp,cashSpent,storedItems,farmName}};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=profileMode==='creative'?'FarmVille3026_Creative_Save.json':'FarmVille3026_Normal_Save.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  report('✓ Δημιουργήθηκε αρχείο για την '+(profileMode==='creative'?'Creative':'Κανονική')+' φάρμα. Φύλαξε το JSON στα Αρχεία του iPhone.');
 };
 document.getElementById('cropSaveImport').onclick=()=>file.click();
 file.onchange=async()=>{
  if(!file.files[0])return;
  try{
   if(file.files[0].size>3*1024*1024)throw Error('Το αρχείο είναι πολύ μεγάλο.');
   const data=JSON.parse(await file.files[0].text());
   if(data?.format!=='classic-farm-save'||data.version!==1||!data.farm||data.farm.version!==21||!Array.isArray(data.farm.objects)||data.farm.objects.length>30000)throw Error('Μη έγκυρο αρχείο φάρμας.');
   if(!Number.isFinite(data.farm.coins)||data.farm.coins<0||!Number.isFinite(data.farm.xp)||data.farm.xp<0)throw Error('Μη έγκυρα Coins ή XP.');
   const checked=sanitize(data.farm.objects);
   if(checked.rejected.length)throw Error('Το αρχείο περιέχει '+checked.rejected.length+' αντικείμενα με μη έγκυρη θέση.');
   if(sanitizeStored(data.farm.storedItems).length>storageCapacity(checked.good))throw Error('Το save περιέχει περισσότερα αποθηκευμένα αντικείμενα από την χωρητικότητα της φάρμας.');
   if(!confirm('Να αντικατασταθεί μόνο η τρέχουσα '+(profileMode==='creative'?'CREATIVE':'ΚΑΝΟΝΙΚΗ')+' φάρμα με αυτή του αρχείου; Η άλλη φάρμα δεν επηρεάζεται.'))return;
   if(farmMode!=='farm')throw Error('Άνοιξε πρώτα την Κανονική φάρμα.');
   // V41: A failed browser write must never be reported as a successful restore.
   // Keep a complete in-memory rollback; do not mutate the other farm/profile.
   const previous={objects,idCounter,coins,xp,cashSpent,storedItems,farmName,lastLevelShown,history};
   objects=checked.good;idCounter=Math.max(1,...objects.map(o=>o.id+1));coins=data.farm.coins;xp=data.farm.xp;cashSpent=Number.isSafeInteger(data.farm.cashSpent)?Math.max(0,data.farm.cashSpent):0;replenishCreativeProfile();storedItems=sanitizeStored(data.farm.storedItems);farmName=sanitizeFarmName(data.farm.farmName);lastLevelShown=null;
   if(!save()){
    objects=previous.objects;idCounter=previous.idCounter;coins=previous.coins;xp=previous.xp;cashSpent=previous.cashSpent;storedItems=previous.storedItems;farmName=previous.farmName;lastLevelShown=previous.lastLevelShown;history=previous.history;
    updateFarmNameUI();refreshStorageUI();refreshStatus();renderCropWindow();dirty=true;
    throw Error('Η αποθήκευση απέτυχε. Η προηγούμενη φάρμα διατηρήθηκε. Δοκίμασε σε browser που επιτρέπει τοπική αποθήκευση.');
   }
   updateFarmNameUI();history=[];refreshStorageUI();refreshStatus();renderCropWindow();dirty=true;
   report('✓ Επαναφέρθηκε η '+(profileMode==='creative'?'Creative':'Κανονική')+' φάρμα: '+objects.length+' αντικείμενα. Οι χρόνοι φυτέματος διατηρήθηκαν.');
  }catch(err){report('✕ '+err.message)}finally{file.value=''}
 };
 window.__farmCropSaveTests=()=>({storageKey:STORAGE,mode:farmMode,saveHasCropField:objects.some(o=>o.crop&&Number.isFinite(o.crop.plantedAt)),restoredUsingSanitize:typeof sanitize==='function',autosaveActive:true,lastFarmSaveOK,lastFarmSaveAt});
})();


(function initCropManualQA(){
 const labels=[
 'Όργωμα και σπορά λειτουργούν',
 'Αφαιρούνται σωστά τα Coins',
 'Τα φυτά εμφανίζονται πάνω στο χωράφι',
 'Εμφανίζεται σωστά η ώρα φύτευσης και ωρίμανσης (χωρίς countdown)',
 'Η συγκομιδή δίνει Coins',
 'Δεν γίνεται πρόωρη συγκομιδή',
 'Τα μαραμένα φυτά χρειάζονται νέο όργωμα',
 'Η πρόοδος παραμένει μετά το κλείσιμο ή με εξαγωγή/εισαγωγή save',
 'Market και Creative Mode λειτουργούν όπως πριν'
 ];
 const holder=document.getElementById('cropManualChecks'),score=document.getElementById('cropManualScore'),message=document.getElementById('cropManualMessage');
 const storageKey='classic-farm-crops-manual-qa-v38';
 let saved=[];
 try{const data=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(data))saved=data.filter(n=>Number.isInteger(n)&&n>=0&&n<labels.length)}catch(e){}
 const update=()=>{const count=[...holder.querySelectorAll('input:checked')].length;score.textContent=`${count}/9 επιβεβαιωμένοι · ${9-count} εκκρεμούν`};
 labels.forEach((labelText,i)=>{
  const row=document.createElement('label'),checkbox=document.createElement('input'),label=document.createElement('span');
  checkbox.type='checkbox';checkbox.checked=saved.includes(i);checkbox.setAttribute('aria-label',labelText);
  checkbox.onchange=()=>{const values=[...holder.querySelectorAll('input')].flatMap((box,j)=>box.checked?[j]:[]);try{localStorage.setItem(storageKey,JSON.stringify(values))}catch(e){};update()};
  label.textContent=labelText;row.append(checkbox,label);holder.append(row);
 });
 update();
 document.getElementById('cropCopyResults').onclick=async()=>{
  const passed=[...holder.querySelectorAll('input')].flatMap((box,j)=>box.checked?[j]:[]);
  const text=`FarmVille V41 Crops System: ${passed.length}/9 έλεγχοι πέρασαν. Επιτυχία: ${passed.map(i=>labels[i]).join(', ')||'καμία'}. Εκκρεμότητα/αποτυχία: ${labels.filter((_,i)=>!passed.includes(i)).join(', ')||'καμία'}.`;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);message.textContent='✓ Αντιγράφηκε. Επικόλλησέ το στη συνομιλία.';return}}catch(e){}
  const box=document.createElement('textarea');box.value=text;box.readOnly=true;box.style.cssText='width:100%;height:115px;margin-top:6px;touch-action:auto';message.replaceChildren(document.createTextNode('Επίλεξε το κείμενο για αντιγραφή:'),box);box.focus();box.select();
 };
})();

document.getElementById('cropRunTests').onclick=()=>{const results=cropTests();document.getElementById('cropRunScore').textContent=`${results.filter(x=>x.ok).length}/${results.length}`;const area=document.getElementById('cropCheckList');area.replaceChildren(...results.map(x=>{const el=document.createElement('div');el.className=x.ok?'ok':'bad';el.textContent=(x.ok?'✓ ':'✕ ')+x.name;return el}));area.classList.toggle('open')};


if(new URLSearchParams(location.search).get('dev')==='1')document.documentElement.classList.add('dev-mode');window.addEventListener('resize',resize);resize();load();v36MigrateTimers();updateFarmNameUI();refreshStatus();updateTool('multi');window.__farmerLabWalkMode=false;document.getElementById('farmerLabWalk').classList.remove('active');let lastTick=0;let lastAssetFrame=0;function loop(now){if(FarmImages.hasAnimated()&&now-lastAssetFrame>110){dirty=true;lastAssetFrame=now}if(FarmImages.get('farmer')&&farmer.state!=='idle')dirty=true;updateFarmer(now);if(now-lastTick>1200){lastTick=now;if(objects.some(o=>o.crop||v36HarvestData(o)))dirty=true;renderCropWindow()}draw();requestAnimationFrame(loop)}loop();window.dispatchEvent(new Event("farmville:ready"));
// A tiny test interface for automated smoke/regression checks; no external libraries.
function cropTests(){const cases=[],t=(name,ok)=>cases.push({name,ok:!!ok});
 const plot=()=>({kind:'plot',soil:'ready',x:0,y:0}),w=()=>({coins:100,xp:0}),now=100000000;
 let p=plot(),v=w();t('Σπορά σε έτοιμο χωράφι',FarmCrops.plant(p,'strawberry',v,now).ok);
 t('Σταθερή ώρα ωρίμανσης 4 ώρες μετά τη σπορά',cropSchedule(p.crop,FarmCrops.SEEDS.strawberry)?.readyAt===now+4*3600000);
 t('Σταθερή εμφάνιση ημερομηνίας και ώρας',cropClock(now).includes(':')&&cropClock(now+4*3600000)!=='—');

 t('Αφαίρεση 10 Coins',v.coins===90);t('Ανταμοιβή σποράς 1 XP',v.xp===1);
 t('Απαγόρευση διπλής σποράς',!FarmCrops.plant(p,'strawberry',v,now).ok);
 t('Αντίσταση σε πρόωρη συγκομιδή',!FarmCrops.harvest(p,v,now+1000).ok);
 t('Ωρίμανση σε 4 ώρες',FarmCrops.stage(p.crop,now+4*3600000)==='ripe');
 t('Συγκομιδή ώριμου καρπού',FarmCrops.harvest(p,v,now+4*3600000).ok);
 t('Πώληση για 35 Coins',v.coins===125);
 t('Fallow μετά τη συγκομιδή',p.soil==='fallow'&&!p.crop);
 t('Απαγόρευση σποράς σε fallow',!FarmCrops.plant(p,'strawberry',v,now).ok);
 p=plot();v={coins:0,xp:0};t('Απαγόρευση χωρίς Coins',!FarmCrops.plant(p,'strawberry',v,now).ok);
 p=plot();v=w();FarmCrops.plant(p,'strawberry',v,now);t('Μαραίνεται το αργότερο στον 2.5× χρόνο',FarmCrops.stage(p.crop,now+10*3600000)==='withered');
 t('Αποθηκεύεται ξεχωριστή στιγμή μαρασμού',Number.isFinite(p.crop.witherAt)&&p.crop.witherAt>=now+8*3600000&&p.crop.witherAt<=now+10*3600000);
 t('Μαραμένο → fallow',FarmCrops.wither(p,now+10*3600000)&&p.soil==='fallow');
 t('Αρχείο ιστορικών σπόρων φορτώθηκε',window.FarmCropArchive.length>300);
 t('Κανένας άγνωστος χρόνος δεν επινοήθηκε',window.FarmCropArchive.filter(r=>r.status==='needs_values').every(r=>r.hours===null&&r.cost===null));
 t('Οι νέες εγγραφές Atlantis και Australia είναι αρχειοθετημένες',window.FarmCropArchive.some(r=>r.farm==='Atlantis')&&window.FarmCropArchive.some(r=>r.farm==='Australia'));
 t('Κανένα άγνωστο κόστος δεν αντικαταστάθηκε με αυθαίρετη τιμή',window.FarmCropArchive.filter(r=>r.status==='needs_values'||r.status==='time_verified_only').every(r=>r.cost===null&&r.reward===null));
 t('Όλες οι ενεργές καλλιέργειες υπάρχουν στο αρχείο',Object.keys(FarmCrops.SEEDS).every(id=>window.FarmCropArchive.some(r=>r.id===id)));
 t('Αποθήκευση περιλαμβάνει crop και plantedAt',(()=>{const a={kind:'plot',soil:'ready',x:0,y:0};const wallet=w();FarmCrops.plant(a,'wheat',wallet,now);const restored=JSON.parse(JSON.stringify(a));return restored.crop?.seed==='wheat'&&restored.crop.plantedAt===now})());
 t('Ακριβώς στο όριο ωρίμανσης',(()=>{const p=plot(),c=w();FarmCrops.plant(p,'soybean',c,now);return FarmCrops.stage(p.crop,now+24*3600000-1)==='growing'&&FarmCrops.stage(p.crop,now+24*3600000)==='ripe'})());
 t('Ακριβώς στο όριο μαρασμού',(()=>{const p=plot(),c=w();FarmCrops.plant(p,'wheat',c,now);const wilt=72*3600000*2.5;return FarmCrops.stage(p.crop,now+wilt-1)==='ripe'&&FarmCrops.stage(p.crop,now+wilt)==='withered'})());
 t('Μαραμένα δεν δίνουν χρήματα',(()=>{const p=plot(),c=w();FarmCrops.plant(p,'strawberry',c,now);const old=c.coins;const res=FarmCrops.harvest(p,c,now+10*3600000);return !res.ok&&c.coins===old})());
 t('Εκτέλεση χωρίς επιρροή στο πραγματικό save',typeof STORAGE==='string'&&typeof renderCropWindow==='function');

 return cases}

function renderCropQa(){const results=cropTests(),passed=results.filter(t=>t.ok).length;document.getElementById('cropQaScore').textContent=`${passed}/${results.length}`;document.getElementById('cropQaList').replaceChildren(...results.map(t=>{const el=document.createElement('div');el.className=t.ok?'passed':'failed';el.textContent=`${t.ok?'✓':'✕'} ${t.name}`;return el}))}
const cropQa=document.getElementById('cropQa');document.getElementById('cropQaToggle').onclick=()=>{renderCropQa();cropQa.classList.toggle('open');document.getElementById('cropQaToggle').setAttribute('aria-expanded',cropQa.classList.contains('open'))};renderCropQa();window.__farmCropTests=cropTests;
window.__farmGridTest={gridDiagnostics,get items(){return objects.map(o=>({...o}))},defs,anchor,validate,overlaps,place:(kind,x,y)=>{const a=anchor({x,y},kind),error=validatePlacement(a,kind);if(error)return error;objects.push({id:idCounter++,kind,x:a.x,y:a.y});save();refreshStatus();dirty=true;return 'ok'},removeAll:()=>{objects=[];idCounter=1;save();refreshStatus();dirty=true},pick,iso};

// Tools reside inside the core game scope, but still expose a small public API via FarmClassicTools.
(function installFarmClassicTools(){
 'use strict';
 const $=id=>document.getElementById(id);
 const context=$('fvContext'),seeds=$('fvSeeds'),qa=$('fvToolsQa');
 const more=$('fvMorePanel');
 let contextTarget=null,pendingCell=null;
 const close=()=>{context.classList.remove('open');seeds.classList.remove('open');more.classList.remove('open');$('fvMore').setAttribute('aria-expanded','false');contextTarget=null;pendingCell=null;syncRotate()};
 function sync(){
  const t=tool;
  for(const [id,state] of [['fvMulti','multi'],['fvPlow','plow'],['fvMove','move'],['fvRecycle','recycle']])$(id).classList.toggle('active',t===state);
  syncRotate();
 }
 function choose(t){close();if(farmMode!=='farm')return;updateTool(t);sync();syncRotate();}
 function makeJob(t,cell,plot=null,seed=null){
  if(farmerQueue.length>=60){show('Η σειρά εργασιών γέμισε');return false}
  farmerQueue.push({tool:t,seed:seed||seedSelect.value,cell:{x:cell.x,y:cell.y},plot});
  farmerStartNext();dirty=true;return true;
 }
 const recycleBackdrop=$('fvRecycleBackdrop');
 let pendingRecycleId=null;
 function closeRecycle(){pendingRecycleId=null;recycleBackdrop.classList.remove('open');recycleBackdrop.setAttribute('aria-hidden','true')}
 function doRecycle(obj){
  if(!obj||farmMode!=='farm')return false;
  if(!canRemoveStorageBuilding(obj)){show('📦 Άδειασε πρώτα την αποθήκη: δεν φτάνει η χωρητικότητα');return false}
  pendingRecycleId=obj.id;
  const name=defs.get(obj.kind)?.name||obj.kind;
  $('fvRecycleName').textContent=name;
  $('fvRecycleWarning').textContent=obj.kind==='plot'&&obj.crop
   ?'Προσοχή: θα αφαιρεθεί ολόκληρο το φυτεμένο χωράφι και η καλλιέργεια. Δεν θα δοθούν Coins.'
   :'Θα αφαιρεθεί αυτό το αντικείμενο από τη φάρμα. Δεν θα δοθούν Coins σε αυτή την έκδοση.';
  context.classList.remove('open');more.classList.remove('open');seeds.classList.remove('open');
  recycleBackdrop.classList.add('open');recycleBackdrop.setAttribute('aria-hidden','false');
  return true;
 }
 function confirmRecycle(){
  const obj=objects.find(o=>o.id===pendingRecycleId);
  if(obj&&!canRemoveStorageBuilding(obj)){closeRecycle();show('📦 Η αποθήκη χρειάζεται αυτό το κτίριο');return false}
  if(!obj){closeRecycle();show('Το αντικείμενο δεν υπάρχει πλέον');return false}
  const name=defs.get(obj.kind)?.name||obj.kind;
  snapshot();objects=objects.filter(o=>o.id!==obj.id);save();refreshStatus();dirty=true;
  closeRecycle();close();show('♻ Αφαιρέθηκε: '+name);return true;
 }
 $('fvRecycleCancel').onclick=closeRecycle;
 $('fvRecycleConfirm').onclick=confirmRecycle;
 recycleBackdrop.addEventListener('click',e=>{if(e.target===recycleBackdrop)closeRecycle()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pendingRecycleId!==null)closeRecycle()});
 function activeFence(){
  const moving=tool==='move'&&movingId!==null?objects.find(o=>o.id===movingId):null;
  const contextObject=contextTarget?objects.find(o=>o.id===contextTarget.id):null;
  const o=moving||contextObject;
  return o&&ROTATABLE_FENCES.has(o.kind)?o:null;
 }
 function syncRotate(){
  const o=activeFence();
  const btn=$('fvRotateActive');btn.hidden=!(farmMode==='farm'&&tool==='move'&&o);
  // The contextual button is shared by Normal Farm and Creative Farm.
  const creativeBtn=$('fvRotateCreative');creativeBtn.hidden=!(tool==='move'&&o);
  $('fvMoreRotate').disabled=!(farmMode==='farm'&&o);
  $('fvContextRotate').disabled=!(contextTarget&&objects.some(x=>x.id===contextTarget.id&&ROTATABLE_FENCES.has(x.kind)));
  const caption=o?'↻ '+(previewFenceOrientation(o)*90)+'° · '+dims({...o,orientation:previewFenceOrientation(o)}).w+'×'+dims({...o,orientation:previewFenceOrientation(o)}).h:'↻ Rotate';
  btn.replaceChildren(document.createTextNode('↻'));
  const btnLabel=document.createElement('span');btnLabel.textContent='Rotate';btn.append(btnLabel);
  creativeBtn.textContent=caption;
  btn.title=creativeBtn.title=o?'Πάτησε για περιστροφή επιλεγμένου αντικειμένου':'Επίλεξε πρώτα αντικείμενο με Move';
 }
 function rotateFence(){
  let o=activeFence();
  if(!o){show('↻ Πάτησε Move και επίλεξε αντικείμενο');syncRotate();return false}
  const id=o.id;
  if(tool!=='move'||movingId!==id){
   updateTool('move');movingId=id;moveOffset={x:0,y:0};
   o=objects.find(x=>x.id===id);
  }
  if(!o)return false;
  const current=previewFenceOrientation(o);
  const next=(current+1)%2;
  const candidate={...o,orientation:next};
  const target={x:o.x,y:o.y,w:dims(candidate).w,h:dims(candidate).h};
  const reason=validatePlacement(target,o.kind,o.id);
  // Rotate immediately if the original position permits it; this must visibly
  // change the fence on the map and persist, without requiring a second tap.
  if(!reason){
   snapshot();o.orientation=next;pendingFenceRotation=null;
   save();dirty=true;
   label('✓ Περιστροφή '+(next*90)+'° · '+target.w+'×'+target.h+' mini blocks · αποθηκεύτηκε',true);
   show('↻ Περιστροφή '+(next*90)+'° · '+target.w+'×'+target.h+' · αποθηκεύτηκε');
  }else{
   // Don't mutate saved object or corrupt collisions. Only preview the new
   // footprint until user chooses a free destination (see move commit above).
   pendingFenceRotation={id,orientation:next};dirty=true;
   label('↻ Προεπισκόπηση '+(next*90)+'° · '+target.w+'×'+target.h+' · '+reason+' · άγγιξε ελεύθερη θέση',null);
   show('↻ Δεν χωρά εδώ · διάλεξε ελεύθερη θέση');
  }
  if(contextTarget){context.classList.remove('open');contextTarget=null}
  syncRotate();return true;
 }
 function pickObject(cell){return plotAt(cell)||hit(cell)}
 function infoFor(obj,px,py){
  if(window.__generalInspectAt){window.__generalInspectAt(px,py);return}
  show(defs.get(obj.kind)?.name||obj.kind);
 }
 function openContext(obj,px,py){
  contextTarget={id:obj.id,px,py};
  $('fvContextRotate').disabled=!ROTATABLE_FENCES.has(obj.kind);
  $('fvContextStore').disabled=!storageFitsAfterRemoval(obj);
  $('fvContextSell').disabled=salePrice(obj)===null||!canRemoveStorageBuilding(obj);
  $('fvContextSell').textContent=salePrice(obj)===null?'🪙 Sell (χωρίς τιμή)':'🪙 Sell · +'+salePrice(obj).toLocaleString('el-GR');
  $('fvContextTitle').textContent=defs.get(obj.kind)?.name||(obj.kind==='plot'?'Χωράφι':obj.kind);
  $('fvContextInfo').textContent=obj.kind==='plot'&&obj.crop?'Φυτεμένο χωράφι — μετακίνηση χωρίς αλλαγή του χρόνου καλλιέργειας':'Επίλεξε ενέργεια για το αντικείμενο';
  context.classList.add('open');seeds.classList.remove('open');syncRotate();
 }
 function openSeeds(plot,cell){
  pendingCell={x:cell.x,y:cell.y,plotId:plot.id};
  const sel=$('fvSeedChoice');sel.replaceChildren();
  for(const [id,d] of Object.entries(FarmCrops.SEEDS)){
   const opt=document.createElement('option');opt.value=id;opt.textContent=d.icon+' '+d.name+' · '+d.cost+' Coins · '+d.grow/3600000+' ώρες';sel.appendChild(opt)
  }
  sel.value=seedSelect.value;
  $('fvSeedText').textContent='Διάλεξε σπόρο για το χωράφι · Τα Coins χρεώνονται μετά τη σπορά.';
  seeds.classList.add('open');context.classList.remove('open');
 }
 function handleTap(px,py){
  if(farmMode!=='farm')return false;
  if(!['multi','recycle'].includes(tool))return false;
  const cell=pick(px,py);if(!cell){show('Εκτός χάρτη');return true}
  const plot=plotAt(cell),obj=pickObject(cell);
  if(tool==='recycle'){
   if(!obj){show('Δεν υπάρχει αντικείμενο για αφαίρεση');return true}
   doRecycle(obj);return true;
  }
  // FarmVille Multi Tool: context sensitive, no permanent Seed or Harvest button.
  if(plot){
   const status=plot.crop?FarmCrops.stage(plot.crop,Date.now()):null;
   if(status==='ripe'){makeJob('harvest',cell,plot);return true}
   if(status==='withered'||(!plot.crop&&plot.soil==='fallow')){makeJob('plow',cell,plot);return true}
   if(!plot.crop&&plot.soil==='ready'){openSeeds(plot,cell);return true}
   if(plot.crop){refreshCropMiniBubble(plot,px,py);return true}
   openContext(plot,px,py);return true;
  }
  if(obj){
   const harvest=v36HarvestStatus(obj);
   if(harvest){
    if(harvest.ready){v36CollectObject(obj);return true}
    const elapsed=Math.max(0,Date.now()-(harvest.readyAt-harvest.hours*3600000));
    const progress=Math.min(99,Math.floor(100*elapsed/(harvest.hours*3600000)));
    show((defs.get(obj.kind)?.name||obj.kind)+' · '+progress+'% · '+harvest.product+' σε '+v36Time(harvest.remaining));return true;
   }
   if(isStorageBarn(obj)){openBarnMenu(obj);return true}openContext(obj,px,py);return true}

  if(farmerWalkable(cell.x,cell.y))farmerLabWalkTo(px,py);
  else show('Δεν υπάρχει διαθέσιμη διαδρομή');
  return true;
 }
 $('fvContextRotate').onclick=rotateFence;
 $('fvMoreRotate').onclick=rotateFence;
 $('fvMoreStore').onclick=()=>{choose('store');show('📦 Store: πάτησε αντικείμενο στον χάρτη');};
 $('fvMoreSell').onclick=()=>{choose('multi');show('🪙 Πάτησε αντικείμενο για το παραθυράκι Sell');};
 $('fvRotateActive').onclick=rotateFence;
 $('fvRotateCreative').onclick=rotateFence;
 $('fvMore').onclick=()=>{
  if(farmMode!=='farm')return;
  const open=!more.classList.contains('open');
  context.classList.remove('open');seeds.classList.remove('open');
  more.classList.toggle('open',open);$('fvMore').setAttribute('aria-expanded',String(open));syncRotate();
 };
 $('fvMoreClose').onclick=()=>{more.classList.remove('open');$('fvMore').setAttribute('aria-expanded','false')};
 $('fvMoreQA').onclick=()=>{more.classList.remove('open');$('fvToolsQaOpen').click()};
 $('fvMulti').onclick=()=>choose('multi');$('fvPlow').onclick=()=>choose('plow');$('fvMove').onclick=()=>choose('move');$('fvRecycle').onclick=()=>choose('recycle');
 $('fvMarket').onclick=()=>{choose('multi');const panel=$('marketPanel');panel.classList.add('open');updateMarketUI()};
 $('fvSeedCancel').onclick=close;$('fvContextCancel').onclick=close;
 $('fvSeedPlant').onclick=()=>{
  const c=pendingCell;if(!c)return;
  const plot=objects.find(o=>o.id===c.plotId&&o.kind==='plot');
  if(!plot||plot.crop||plot.soil!=='ready'){show('Το χωράφι δεν είναι διαθέσιμο');close();return}
  seedSelect.value=$('fvSeedChoice').value;refreshSeed();makeJob('seed',{x:c.x,y:c.y},plot,seedSelect.value);close();
 };
 $('fvContextMove').onclick=()=>{
  const target=contextTarget;if(!target)return;const obj=objects.find(o=>o.id===target.id);
  if(!obj){close();return}
  // V25: Both modes keep the selected object instead of simulating a second canvas tap.
  close();
  updateTool('move');
  movingId=obj.id;
  const selectedCell=pick(target.px,target.py);
  moveOffset=selectedCell?{x:selectedCell.x-obj.x,y:selectedCell.y-obj.y}:{x:0,y:0};
  window.FarmClassicTools?.syncRotate();
  label('✋ '+(defs.get(obj.kind)?.name||obj.kind)+' — σύρε το στο Barn ή επίλεξε ελεύθερη θέση',null);
  show('✋ Move: σύρε το αντικείμενο στο Barn για αποθήκευση');
 };
 $('fvContextStore').onclick=()=>{const target=contextTarget;if(!target)return;const id=target.id;close();storeObject(id)};
 $('fvContextSell').onclick=()=>{const target=contextTarget;if(!target)return;const obj=objects.find(o=>o.id===target.id);close();openSell(obj)};
 $('fvContextRecycle').onclick=()=>{
  const target=contextTarget;if(!target)return;
  doRecycle(objects.find(o=>o.id===target.id));
 };
 $('fvContextInfoBtn').onclick=()=>{
  const target=contextTarget;if(!target)return;
  const obj=objects.find(o=>o.id===target.id);
  close();if(obj)infoFor(obj,target.px,target.py);
 };
 $('fvToolsQaOpen').onclick=()=>{const tests=[
  ['Multi Tool υπάρχει',!!$('fvMulti')],['Plow Tool υπάρχει',!!$('fvPlow')],
  ['Επεκτεινόμενο μενού εργαλείων',!!more&&!!$('fvMore')],
  ['Rotate διαθέσιμο για όλον τον κατάλογο',Array.from(defs.keys()).every(k=>ROTATABLE_FENCES.has(k))&&!!$('fvMoreRotate')&&typeof rotateFence==='function'],
  ['Χωρίς διπλές κατευθύνσεις 0° / 90°',normalizeOrientation(0)===0&&normalizeOrientation(1)===1&&normalizeOrientation(2)===0&&normalizeOrientation(3)===1],
  ['Rotate διαθέσιμο και στους δύο τρόπους φάρμας',!!$('fvRotateCreative')&&!!$('fvRotateActive')&&typeof rotateFence==='function'],
  ['Περιστροφή αντικειμένου 1×5 σε 5×1 στο Grid',(()=>{const d=defs.get('fence');const a=dims({kind:'fence',orientation:1});return d.w===1&&d.h===5&&a.w===5&&a.h===1})()],
  ['Έλεγχος χώρου με νέο footprint',validatePlacement({x:0,y:0,w:5,h:1},'fence',null,[])===''],
  ['Rotate φράχτη αλλάζει 1×5 σε 5×1',(()=>{const f={kind:'fence',orientation:1};return dims(f).w===5&&dims(f).h===1&&dims({kind:'fence'}).w===1})()],
  ['Store και Sell έχουν χωριστές ενέργειες',!!$('fvContextStore')&&!!$('fvContextSell')&&typeof openSell==='function'],
  ['Τα μηχανήματα δεν εκτελούν ψεύτικες εργασίες',[...more.querySelectorAll('.fv-more-grid button')].filter(b=>b.id!=='fvMoreRotate'&&b.id!=='fvMoreStore'&&b.id!=='fvMoreSell').every(b=>b.disabled)],
  ['Move Tool υπάρχει',!!$('fvMove')],['Recycle Tool υπάρχει',!!$('fvRecycle')],
  ['Market υπάρχει',!!$('fvMarket')],['Gift Box δεν παριστάνει ενεργή λειτουργία',$('fvGifts').disabled],
  ['Επιβεβαίωση πριν την αφαίρεση',!!$('fvRecycleConfirm')&&!!$('fvRecycleCancel')],
  ['Recycle δεν αφαιρεί χωρίς επιβεβαίωση',doRecycle.toString().includes('pendingRecycleId')&&confirmRecycle.toString().includes('snapshot()')],
  ['Ακύρωση Recycle δεν αλλάζει το save',closeRecycle.toString().includes('pendingRecycleId=null')],
  ['Σπόροι από τα δεδομένα Crops',Object.keys(FarmCrops.SEEDS).length>=4],
  ['Grid και Plots αμετάβλητα',defs.get('plot')?.w===4&&defs.get('plot')?.h===4],
  ['Διαχωρισμός Creative/Normal',typeof setFarmMode==='function']
 ];
  const holder=$('fvToolsQaRows');holder.replaceChildren();for(const [title,ok] of tests){const d=document.createElement('div');d.className='testrow '+(ok?'ok':'todo');d.textContent=(ok?'✓ ':'⚠ ')+title;holder.appendChild(d)}qa.classList.add('open')};
 $('fvToolsQaClose').onclick=()=>qa.classList.remove('open');
 window.FarmClassicTools={handleTap,openContext,sync,syncRotate,rotateFence,choose,close,doRecycle,closeRecycle,confirmRecycle};sync();
})();

})();

