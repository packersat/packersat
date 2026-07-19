// The Bridge — side-view continuous scroll build. Deterministic from p∈[0,1].
(function(){
'use strict';
const cv=document.getElementById('stage'),ctx=cv.getContext('2d');
const W=1600,H=900;
let vw=0,vh=0,dpr=1,fit=1,ox=0,oy=0;
function resize(){dpr=Math.min(2,window.devicePixelRatio||1);vw=innerWidth;vh=innerHeight;cv.width=vw*dpr;cv.height=vh*dpr;const s=Math.max(vw/W,vh/H);fit=s;ox=(vw-W*s)/2;oy=(vh-H*s)/2;}
resize();
const lerp=(a,b,t)=>a+(b-a)*t,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),c01=v=>cl(v,0,1);
const eo=t=>1-Math.pow(1-c01(t),3),ei=t=>{t=c01(t);return t*t*(3-2*t)};
function kf(p,st){if(p<=st[0][0])return st[0][1];for(let i=1;i<st.length;i++){if(p<=st[i][0]){const t=ei((p-st[i-1][0])/(st[i][0]-st[i-1][0]));const a=st[i-1][1],b=st[i][1];if(Array.isArray(a))return a.map((v,j)=>lerp(v,b[j],t));return lerp(a,b,t);}}return st[st.length-1][1];}
const rgb=c=>`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`,rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
function rnd(s){const x=Math.sin(s*127.1+311.7)*43758.5453;return x-Math.floor(x);}

// geometry
const WATER=620,DECKY=540,DECKH=22,X0=310,X1=1290,TXL=560,TXR=1040,TTOP=270,TW=64;
const ANCL={x:250,y:530},ANCR={x:1350,y:530};
function cableY(x){
  if(x>=TXL&&x<=TXR){const t=(x-TXL)/(TXR-TXL);return (1-t)*(1-t)*TTOP+2*(1-t)*t*640+t*t*TTOP;}
  if(x<TXL){const t=(x-ANCL.x)/(TXL-ANCL.x);return (1-t)*(1-t)*ANCL.y+2*(1-t)*t*500+t*t*TTOP;}
  const t=(x-TXR)/(ANCR.x-TXR);return (1-t)*(1-t)*TTOP+2*(1-t)*t*500+t*t*ANCR.y;
}
const SEGN=8,SEGW=(X1-X0)/SEGN;
const WORDS=[['EQUIVALENT EXPRESSIONS','GRAMMAR & USAGE'],['SYSTEMS OF EQUATIONS','TRANSITIONS'],['LINEAR FUNCTIONS','PUNCTUATION'],['QUADRATICS','VOCAB IN CONTEXT'],['RATIOS & RATES','RHETORICAL SYNTHESIS'],['DESMOS SKILLS','COMMAND OF EVIDENCE'],['GEOMETRY & TRIG','READING COMPREHENSION'],['DATA ANALYSIS','CENTRAL IDEAS']];
const pierWin=[0.06,0.14],towerWin=(s,i)=>{const a=0.14+i*0.045+(s?0.02:0);return[a,a+0.055];};
const segWin=i=>{const a=0.36+i*0.033;return[a,a+0.06];};
const CABLE0=0.64,CABLE1=0.80,WALK0=0.83;

function light(p){return{
  skyT:kf(p,[[0,[15,22,36]],[0.3,[46,62,88]],[0.6,[126,166,198]],[1,[92,106,146]]]),
  skyB:kf(p,[[0,[62,78,96]],[0.3,[204,136,108]],[0.6,[224,228,224]],[1,[234,150,106]]]),
  sunX:kf(p,[[0,1330],[0.6,1170],[1,1280]]),
  sunY:kf(p,[[0,700],[0.3,470],[0.6,220],[1,450]]),
  sunA:kf(p,[[0,0],[0.18,0.4],[0.6,0.9],[1,1]]),
  haze:kf(p,[[0,0.7],[0.4,0.42],[0.8,0.2],[1,0.1]]),
  warm:kf(p,[[0,0],[0.6,0.12],[0.85,0.6],[1,1]]),
  ink:kf(p,[[0,[10,12,16]],[0.6,[44,46,50]],[1,[54,44,42]]]),
  steel:kf(p,[[0,[66,72,82]],[0.6,[124,130,138]],[1,[152,130,110]]]),
  hi:kf(p,[[0,[112,122,136]],[0.6,[180,188,196]],[1,[216,180,144]]]),
  conc:kf(p,[[0,[88,86,82]],[0.6,[152,146,132]],[1,[178,154,128]]]),
};}
const noise=document.createElement('canvas');noise.width=noise.height=160;
{const nx=noise.getContext('2d'),id=nx.createImageData(160,160);for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255|0;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=255;}nx.putImageData(id,0,0);}

function walkerX(p){return lerp(X0-40,X1+60,ei(c01((p-WALK0)/(0.985-WALK0))));}
function camera(p){ // stays wide: whole bridge always in frame
  let cx=kf(p,[[0,760],[0.3,800],[0.8,800],[1,830]]);
  let cy=kf(p,[[0,470],[0.5,455],[1,462]]);
  let s=kf(p,[[0,0.99],[0.35,1.06],[0.7,1.0],[1,1.05]]);
  return{cx,cy,s};
}

function segment(i,q,L){
  const x=X0+i*SEGW,y=DECKY-DECKH/2;
  ctx.save();
  if(q<1){const e=eo(q);
    const sy=y-(1-e)*(260+rnd(i*7)*120);const sx=x+(1-e)*(120+rnd(i*3)*100);
    ctx.translate(sx+SEGW/2,sy+DECKH/2);ctx.rotate((1-e)*(rnd(i*5)-0.5)*0.3);ctx.translate(-SEGW/2,-DECKH/2);
    ctx.globalAlpha=c01(q*2.5);
    ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=18;ctx.shadowOffsetY=12;
  }else ctx.translate(x,y);
  const g=ctx.createLinearGradient(0,0,0,DECKH);
  g.addColorStop(0,rgba(L.hi,1));g.addColorStop(0.22,rgba(L.steel,1));g.addColorStop(1,rgba(L.ink,0.92));
  ctx.fillStyle=g;ctx.fillRect(0,0,SEGW-1.5,DECKH);
  ctx.fillStyle=rgba(L.hi,0.85);ctx.fillRect(0,0,SEGW-1.5,1.3);
  ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(SEGW-2.8,0,1.4,DECKH);
  ctx.fillStyle='rgba(0,0,0,0.35)';
  for(let rx=6;rx<SEGW-6;rx+=18){ctx.beginPath();ctx.arc(rx,3.4,1,0,7);ctx.arc(rx,DECKH-3.4,1,0,7);ctx.fill();}
  const paint=(txt,ly)=>{const fs=Math.min(7.6,(SEGW-10)/(txt.length*0.63));
    ctx.font=`600 ${fs}px "JetBrains Mono",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillText(txt,SEGW/2,ly+0.8);
    ctx.fillStyle='rgba(255,248,236,0.72)';ctx.fillText(txt,SEGW/2,ly);};
  paint(WORDS[i][0],DECKH*0.3);paint(WORDS[i][1],DECKH*0.72);
  ctx.restore();
  if(q>0.84&&q<1){const f=1-(q-0.84)/0.16;ctx.save();ctx.globalAlpha=f*0.9;
    for(let k=0;k<5;k++){const a=rnd(i*11+k)*6.28,r=(1-f)*22+3;
      ctx.fillStyle=k%2?'#ffd9a0':'#ff9c5a';ctx.fillRect(x+SEGW/2+Math.cos(a)*r,y+DECKH/2+Math.sin(a)*r,2,2);}ctx.restore();}
}

function drawScene(p){
  const L=light(p);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vw,vh);
  ctx.translate(ox,oy);ctx.scale(fit,fit);
  const cam=camera(p);
  ctx.translate(W/2,H/2);ctx.scale(cam.s,cam.s);ctx.translate(-cam.cx,-cam.cy);
  // sky
  let g=ctx.createLinearGradient(0,-200,0,WATER);
  g.addColorStop(0,rgb(L.skyT));g.addColorStop(1,rgb(L.skyB));
  ctx.fillStyle=g;ctx.fillRect(-400,-300,W+800,WATER+300);
  if(p<0.3){const sa=(0.3-p)/0.3*0.8;for(let i=0;i<46;i++){ctx.fillStyle=`rgba(235,240,255,${(0.25+rnd(i+7)*0.5)*sa})`;ctx.fillRect(rnd(i)*2200-300,rnd(i+99)*360-200,1.5,1.5);}}
  if(L.sunA>0.01){const sg=ctx.createRadialGradient(L.sunX,L.sunY,0,L.sunX,L.sunY,330);
    sg.addColorStop(0,`rgba(255,232,190,${0.85*L.sunA})`);sg.addColorStop(0.12,`rgba(255,210,150,${0.5*L.sunA})`);sg.addColorStop(1,'rgba(255,200,140,0)');
    ctx.fillStyle=sg;ctx.fillRect(L.sunX-350,L.sunY-350,700,700);
    ctx.fillStyle=`rgba(255,244,214,${0.95*L.sunA})`;ctx.beginPath();ctx.arc(L.sunX,L.sunY,24,0,7);ctx.fill();}
  // far shore — CITY B waterfront (right)
  const hz=a=>rgba([lerp(L.skyB[0],30,a),lerp(L.skyB[1],28,a),lerp(L.skyB[2],30,a)],1);
  // distant skyline haze layer
  ctx.fillStyle=hz(0.4);
  const cityB=[[1300,120],[1332,190],[1368,150],[1402,230],[1444,170],[1482,260],[1524,140],[1560,200],[1600,160],[1650,220]];
  cityB.forEach((b,i)=>{const bw=26+((i*7)%16);ctx.fillRect(b[0],WATER-70-b[1],bw,b[1]+70);});
  // nearer block
  ctx.fillStyle=hz(0.68);
  const cityB2=[[1310,90],[1352,140],[1396,110],[1440,180],[1490,120],[1540,90],[1586,150]];
  cityB2.forEach((b,i)=>{const bw=30+((i*9)%18);ctx.fillRect(b[0],WATER-48-b[1],bw,b[1]+48);
    ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fillRect(b[0],WATER-48-b[1],bw,2);ctx.fillStyle=hz(0.68);});
  if(L.warm>0.35){ctx.fillStyle=`rgba(255,196,110,${(L.warm-0.35)*0.9})`;
    for(let i=0;i<60;i++){const b=cityB2[i%cityB2.length];
      ctx.fillRect(b[0]+3+rnd(i*3)*24,WATER-56-rnd(i*7)*b[1],2.2,3.2);}}
  // CITY A waterfront (left) — the port the walker starts from
  ctx.fillStyle=hz(0.5);
  const cityA=[[-400,150,80],[-310,220,60],[-240,120,70],[-160,260,54],[-96,170,64],[-26,210,48],[30,130,60],[96,180,50],[152,110,46]];
  cityA.forEach(b=>ctx.fillRect(b[0],WATER-60-b[1],b[2],b[1]+60));
  ctx.fillStyle=hz(0.78);
  const cityA2=[[-360,100,70],[-260,160,56],[-180,90,64],[-100,140,52],[-30,80,56],[40,120,44],[110,70,52]];
  cityA2.forEach(b=>{ctx.fillRect(b[0],WATER-40-b[1],b[2],b[1]+40);
    ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fillRect(b[0],WATER-40-b[1],b[2],2);ctx.fillStyle=hz(0.78);});
  if(L.warm>0.35){ctx.fillStyle=`rgba(255,196,110,${(L.warm-0.35)*0.85})`;
    for(let i=0;i<44;i++){const b=cityA2[i%cityA2.length];
      ctx.fillRect(b[0]+4+rnd(i*5)*(b[2]-8),WATER-48-rnd(i*11)*b[1],2.2,3.2);}}
  // port gantry cranes on City A quay
  [[36,0],[128,1]].forEach(([gx,gi])=>{ctx.save();ctx.translate(gx,WATER-38);
    ctx.strokeStyle=hz(0.85);ctx.lineWidth=4;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-92);ctx.stroke();
    ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-16,-92);ctx.lineTo(58,-78);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(40,-81);ctx.lineTo(40,-52+gi*10);ctx.stroke();
    ctx.fillStyle=hz(0.85);ctx.fillRect(36,-52+gi*10,8,7);
    ctx.restore();});
  // stacked shipping containers near the quay
  for(let i=0;i<8;i++){const cx2=-60+((i*46)%220), cy2=WATER-40-(i%2)*9;
    ctx.fillStyle=['#7a3a34','#3e5a68','#6e6844','#5a4a58'][i%4];ctx.fillRect(cx2,cy2,34,8);
    ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fillRect(cx2,cy2,34,1.5);}
  // start quay (City A) — deck-level platform on pilings
  const platTop=DECKY-DECKH/2;
  const pg=ctx.createLinearGradient(0,platTop,0,platTop+DECKH+6);
  pg.addColorStop(0,rgba(L.hi,0.9));pg.addColorStop(0.3,rgba(L.conc,1));pg.addColorStop(1,rgba(L.ink,0.9));
  ctx.fillStyle=pg;ctx.fillRect(-400,platTop,X0+402,DECKH+6);
  ctx.fillStyle='rgba(255,255,255,0.3)';ctx.fillRect(-400,platTop,X0+402,1.5);
  ctx.fillStyle=rgba(L.ink,0.95);
  [70,140,212,258,304].forEach(px=>ctx.fillRect(px,platTop+DECKH+6,9,WATER-platTop-DECKH+30));
  // arrival quay (City B) — mirrored platform
  ctx.fillStyle=pg;ctx.fillRect(X1-2,platTop,W-X1+402,DECKH+6);
  ctx.fillStyle='rgba(255,255,255,0.3)';ctx.fillRect(X1-2,platTop,W-X1+402,1.5);
  ctx.fillStyle=rgba(L.ink,0.95);
  [1320,1380,1450,1520].forEach(px=>ctx.fillRect(px,platTop+DECKH+6,9,WATER-platTop-DECKH+30));
  // quay bollards
  ctx.fillStyle=rgba(L.ink,0.9);
  [-330,-250,-170,-90,-10,80,160,240,1330,1410,1490,1570].forEach(px=>ctx.fillRect(px,platTop-5,4,5));
  // water
  g=ctx.createLinearGradient(0,WATER,0,H+120);
  g.addColorStop(0,rgba([L.skyB[0]*0.8,L.skyB[1]*0.8,L.skyB[2]*0.85],1));
  g.addColorStop(1,rgba([L.skyT[0]*0.55,L.skyT[1]*0.55,L.skyT[2]*0.6],1));
  ctx.fillStyle=g;ctx.fillRect(-400,WATER,W+800,H-WATER+300);
  if(L.sunA>0.05){ctx.save();ctx.globalAlpha=0.32*L.sunA;
    for(let i=0;i<20;i++){const wy=WATER+8+i*9,ww=56-i*1.6+rnd(i)*26;
      ctx.fillStyle='rgba(255,220,160,0.5)';ctx.fillRect(L.sunX-ww/2+(rnd(i+40)-0.5)*24,wy,ww,2);}ctx.restore();}
  ctx.save();ctx.globalAlpha=0.13;
  for(let i=0;i<26;i++){ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillRect(((i*173)%1500)-200,WATER+6+i*8.6,60+rnd(i)*80,1);}ctx.restore();
  // blueprint ghost
  const gh=c01((0.3-p)/0.3)*0.32;
  if(gh>0.01){ctx.save();ctx.globalAlpha=gh;ctx.strokeStyle='#d46a72';ctx.setLineDash([7,7]);ctx.lineWidth=1.3;
    ctx.strokeRect(TXL-TW/2,TTOP,TW,DECKY-TTOP);ctx.strokeRect(TXR-TW/2,TTOP,TW,DECKY-TTOP);
    ctx.beginPath();ctx.moveTo(X0,DECKY);ctx.lineTo(X1,DECKY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ANCL.x,ANCL.y);for(let x=ANCL.x;x<=ANCR.x;x+=14)ctx.lineTo(x,cableY(x));ctx.stroke();
    ctx.setLineDash([]);ctx.font='10px "JetBrains Mono",monospace';ctx.fillStyle='#d46a72';ctx.textAlign='center';
    ctx.fillText('SPAN STUDY — SHEET 01',800,242);ctx.restore();}
  // piers
  const pq=c01((p-pierWin[0])/(pierWin[1]-pierWin[0]));
  if(pq>0){[TXL,TXR].forEach((tx,i)=>{const q=eo(c01(pq*1.4-i*0.2));if(q<=0)return;
    const h=q*(WATER-DECKY+70);
    const gg=ctx.createLinearGradient(tx-30,0,tx+30,0);
    gg.addColorStop(0,rgba(L.hi,0.9));gg.addColorStop(0.5,rgba(L.conc,1));gg.addColorStop(1,rgba(L.ink,0.85));
    ctx.fillStyle=gg;ctx.fillRect(tx-30,WATER+70-h,60,h);
    ctx.strokeStyle=`rgba(255,255,255,${0.25*q})`;ctx.lineWidth=1.3;
    ctx.beginPath();ctx.ellipse(tx,WATER+10,42+7*Math.sin(pq*9),6,0,0,7);ctx.stroke();});}
  // towers (concrete courses rising)
  const courseH=(DECKY-TTOP)/4;
  [[TXL,0],[TXR,1]].forEach(([tx,side])=>{
    for(let i=0;i<4;i++){const w0=towerWin(side,i),q=c01((p-w0[0])/(w0[1]-w0[0]));if(q<=0)continue;
      const w=TW-i*7,y=DECKY-(i+1)*courseH,e=eo(q);
      ctx.save();
      if(q<1){ctx.translate(tx,y+courseH/2-(1-e)*300);ctx.globalAlpha=c01(q*2.4);
        ctx.shadowColor='rgba(0,0,0,0.45)';ctx.shadowBlur=16;ctx.shadowOffsetY=10;}
      else ctx.translate(tx,y+courseH/2);
      const gg=ctx.createLinearGradient(-w/2,0,w/2,0);
      gg.addColorStop(0,rgba(L.hi,0.95));gg.addColorStop(0.5,rgba(L.conc,1));gg.addColorStop(1,rgba(L.ink,0.8));
      ctx.fillStyle=gg;ctx.fillRect(-w/2,-courseH/2,w,courseH-2);
      ctx.fillStyle='rgba(255,255,255,0.3)';ctx.fillRect(-w/2,-courseH/2,w,1.4);
      ctx.restore();}
    const capQ=c01((p-towerWin(side,3)[1])/0.03);
    if(capQ>0){ctx.globalAlpha=capQ;ctx.fillStyle=rgba(L.ink,0.95);
      ctx.fillRect(tx-(TW-21)/2-5,TTOP-9,TW-21+10,9);ctx.globalAlpha=1;}
  });
  // deck segments (words as materials)
  for(let i=0;i<SEGN;i++){const w0=segWin(i),q=c01((p-w0[0])/(w0[1]-w0[0]));if(q>0)segment(i,q,L);}
  // cables
  const cq=c01((p-CABLE0)/(CABLE1-CABLE0));
  if(cq>0){ctx.save();
    ctx.strokeStyle=rgba(L.ink,0.95);ctx.lineWidth=3.6;ctx.lineCap='round';
    ctx.setLineDash([1300*eo(cq),9999]);
    ctx.beginPath();ctx.moveTo(ANCL.x,ANCL.y);
    for(let x=ANCL.x;x<=ANCR.x;x+=10)ctx.lineTo(x,cableY(x));
    ctx.stroke();ctx.setLineDash([]);
    const frontX=lerp(ANCL.x,ANCR.x,eo(cq));
    ctx.lineWidth=1.2;ctx.strokeStyle=rgba(L.ink,0.75);
    for(let x=330;x<=1270;x+=38){if(x>frontX)break;const cy2=cableY(x);
      if(cy2<DECKY-14){ctx.beginPath();ctx.moveTo(x,cy2);ctx.lineTo(x,DECKY-DECKH/2);ctx.stroke();}}
    if(L.warm>0.3){ctx.globalAlpha=(L.warm-0.3)*0.7;ctx.strokeStyle='rgba(255,206,150,0.8)';ctx.lineWidth=1.3;
      ctx.setLineDash([1300*eo(cq),9999]);ctx.beginPath();ctx.moveTo(ANCL.x,ANCL.y-2);
      for(let x=ANCL.x;x<=ANCR.x;x+=10)ctx.lineTo(x,cableY(x)-2);ctx.stroke();ctx.setLineDash([]);}
    ctx.restore();}
  // railing
  const rq=c01((p-0.8)/0.08);
  if(rq>0){ctx.save();ctx.globalAlpha=rq;ctx.strokeStyle=rgba(L.ink,0.85);ctx.lineWidth=1.1;
    ctx.beginPath();ctx.moveTo(X0,DECKY-DECKH/2-10);ctx.lineTo(X0+(X1-X0)*rq,DECKY-DECKH/2-10);ctx.stroke();
    for(let x=X0+8;x<X0+(X1-X0)*rq;x+=22){ctx.beginPath();ctx.moveTo(x,DECKY-DECKH/2);ctx.lineTo(x,DECKY-DECKH/2-10);ctx.stroke();}
    ctx.restore();}
  // gate + 1600
  const gq=c01((p-0.82)/0.1);
  if(gq>0){ctx.save();ctx.globalAlpha=gq;
    ctx.fillStyle=rgba(L.ink,1);
    ctx.fillRect(X1-4,DECKY-104,8,104-DECKH/2);ctx.fillRect(X1+58,DECKY-104,8,104-DECKH/2);
    ctx.fillRect(X1-10,DECKY-116,84,12);
    const puls=0.65+0.35*Math.sin(p*40);
    ctx.font='600 20px "Fraunces",serif';ctx.textAlign='center';
    ctx.shadowColor=`rgba(196,37,58,${0.8*gq})`;ctx.shadowBlur=12*puls;
    ctx.fillStyle='#e8caa0';ctx.fillText('1600',X1+31,DECKY-124);
    ctx.shadowBlur=0;ctx.font='500 7px "JetBrains Mono",monospace';
    ctx.fillStyle='rgba(232,202,160,0.85)';ctx.fillText('C O L L E G E',X1+31,DECKY-108);
    ctx.restore();}
  // reflections
  ctx.save();ctx.globalAlpha=0.15;
  [TXL,TXR].forEach(tx=>{const built=c01((p-pierWin[0])/(towerWin(0,3)[1]-pierWin[0]));
    if(built>0){const rh=(DECKY-TTOP)*built*0.75;
      const rg2=ctx.createLinearGradient(0,WATER,0,WATER+rh);
      rg2.addColorStop(0,rgba(L.ink,0.9));rg2.addColorStop(1,rgba(L.ink,0));
      ctx.fillStyle=rg2;ctx.fillRect(tx-26,WATER,52,rh);}});
  const dq=c01((p-0.36)/(0.62-0.36));
  if(dq>0){ctx.fillStyle=rgba(L.ink,0.5);ctx.fillRect(X0,WATER+4,(X1-X0)*dq,4);}
  ctx.restore();
  // walker: waits on cliff, then crosses the FULL span
  const wk=c01((p-WALK0)/(0.985-WALK0));
  if(wk>0){const wx=walkerX(p),bob=Math.sin(wk*70)*1;
    ctx.save();ctx.translate(wx,DECKY-DECKH/2+bob);
    ctx.fillStyle=rgba(L.ink,1);
    ctx.beginPath();ctx.arc(0,-24,3.6,0,7);ctx.fill();
    ctx.beginPath();ctx.moveTo(-3.4,-20);ctx.quadraticCurveTo(-4.4,-9,-2.8,-1);ctx.lineTo(2.8,-1);ctx.quadraticCurveTo(4.4,-9,3.4,-20);ctx.closePath();ctx.fill();
    ctx.fillRect(-5.6,-19,2.8,11);
    const sw2=Math.sin(wk*70)*4;
    ctx.strokeStyle=rgba(L.ink,1);ctx.lineWidth=2.6;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-1,-1);ctx.lineTo(-1-sw2,12);ctx.moveTo(1,-1);ctx.lineTo(1+sw2,12);ctx.stroke();
    ctx.strokeStyle='rgba(255,220,170,0.55)';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(0,-24,3.6,-2.4,-0.6);ctx.stroke();
    ctx.restore();
  }else if(p>0.08){
    ctx.save();ctx.translate(X0-40,DECKY-DECKH/2);ctx.fillStyle=rgba(L.ink,1);
    ctx.beginPath();ctx.arc(0,-24,3.6,0,7);ctx.fill();
    ctx.beginPath();ctx.moveTo(-3.4,-20);ctx.quadraticCurveTo(-4.4,-9,-2.8,-1);ctx.lineTo(2.8,-1);ctx.quadraticCurveTo(4.4,-9,3.4,-20);ctx.closePath();ctx.fill();
    ctx.fillRect(-5.6,-19,2.8,11);
    ctx.strokeStyle=rgba(L.ink,1);ctx.lineWidth=2.6;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-1.4,-1);ctx.lineTo(-2,12);ctx.moveTo(1.4,-1);ctx.lineTo(2.2,12);ctx.stroke();
    ctx.restore();}
  // mist
  if(L.haze>0.02){ctx.save();
    for(let i=0;i<4;i++){const my=498+i*42,ma=L.haze*(0.5-i*0.09);
      const mg=ctx.createLinearGradient(0,my-28,0,my+32);
      mg.addColorStop(0,'rgba(210,216,224,0)');mg.addColorStop(0.5,`rgba(214,220,228,${ma})`);mg.addColorStop(1,'rgba(210,216,224,0)');
      ctx.fillStyle=mg;ctx.fillRect(-400+((i*260+p*600)%500),my-28,W+800,60);}ctx.restore();}
  // ── post ──
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(L.warm>0.05){ctx.save();ctx.globalCompositeOperation='overlay';
    ctx.fillStyle=`rgba(255,168,96,${L.warm*0.17})`;ctx.fillRect(0,0,vw,vh);ctx.restore();}
  const vg=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*0.42,vw/2,vh/2,Math.max(vw,vh)*0.76);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.4)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,vw,vh);
  ctx.save();ctx.globalAlpha=0.045;
  const goff=(Math.floor(p*400)*37)%160;
  for(let x=-goff;x<vw;x+=160)for(let y=-((goff*3)%160);y<vh;y+=160)ctx.drawImage(noise,x,y);
  ctx.restore();
  const bar=Math.round(vh*0.055);
  ctx.fillStyle='#050403';ctx.fillRect(0,0,vw,bar);ctx.fillRect(0,vh-bar,vw,bar);
}

// scroll drive
let target=0,shown=-1,raf=null;
function onScroll(){
  const max=document.body.scrollHeight-innerHeight;
  target=max>0?cl(scrollY/max,0,1):0;
  try{localStorage.setItem('bridgeScrollPos',String(scrollY));}catch(e){}
  const h=document.getElementById('hint');if(h)h.classList.toggle('gone',scrollY>40);
  tick();
}
function tick(){
  if(raf)return;
  const step=()=>{raf=null;
    const cur=shown<0?target:shown,d=target-cur;
    shown=Math.abs(d)<0.0004?target:cur+d*0.16;
    drawScene(shown);
    if(shown!==target)raf=requestAnimationFrame(step);};
  raf=requestAnimationFrame(step);
}
addEventListener('scroll',onScroll,{passive:true});
addEventListener('resize',()=>{resize();shown=-1;tick();});
try{const sp=parseFloat(localStorage.getItem('bridgeScrollPos'));if(sp>0)scrollTo(0,sp);}catch(e){}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(onScroll);
onScroll();
})();
