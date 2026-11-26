import {countGate,benchmark} from './street-model.mjs';

const office=[.12,.09,.07,.06,.07,.11,.23,.49,.83,.77,.62,.59,.76,.82,.64,.61,.74,.89,.85,.68,.49,.35,.24,.17];
const waterfront=[.14,.09,.06,.06,.08,.12,.18,.26,.37,.45,.49,.54,.61,.65,.68,.76,.88,.95,.97,.79,.60,.42,.28,.20];
const anchors=[
  [[22.2848,114.1584],.30,210],[[22.2819,114.1572],.25,175],[[22.2812,114.1602],.25,190],
  [[22.2865,114.1611],.26,215],[[22.2799,114.1547],.15,180],[[22.2791,114.1656],.24,185],
];
const metres=(a,b)=>Math.hypot((a[0]-b[0])*111200,(a[1]-b[1])*103000);
const average=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const bins=new Map();
const grid=.001;
const bin=(y,x)=>Math.floor(y/grid)+'_'+Math.floor(x/grid);

export async function loadCentralNetwork(){
  const response=await fetch(new URL('central-network.json',import.meta.url));
  if(!response.ok)throw new Error('Central network unavailable');
  const {boundary,segments}=await response.json();
  const edges=segments.map(([id,part,y,x,Y,X,length,flags])=>{
    const a=[y/1e6,x/1e6],b=[Y/1e6,X/1e6],mid=average(a,b);
    const local=Math.max(...anchors.map(([point,weight,radius])=>weight*Math.exp(-((metres(point,mid)/radius)**2))));
    const shore=Math.min(1,Math.max(0,(mid[0]-22.284)/.0023));
    const width=flags&1?1.5:flags&256?3:flags&128?3.2:2.3;
    const scale=.47+local*2.05+((flags&384)?.05:0);
    const capacity=flags&32?480:width*benchmark*60;
    return {id:String(id)+(part?'-'+part:''),line:[a,b],length,flags,width,shore,scale,capacity,mid};
  });
  bins.clear();
  for(const edge of edges){
    const [a,b]=edge.line;
    for(let y=Math.floor(Math.min(a[0],b[0])/grid);y<=Math.floor(Math.max(a[0],b[0])/grid);y++){
      for(let x=Math.floor(Math.min(a[1],b[1])/grid);x<=Math.floor(Math.max(a[1],b[1])/grid);x++){
        const key=y+'_'+x;
        if(!bins.has(key))bins.set(key,[]);
        bins.get(key).push(edge);
      }
    }
  }
  return {boundary,edges,length:edges.reduce((sum,edge)=>sum+edge.length,0)};
}

function distanceToEdge(point,edge){
  const [a,b]=edge.line;
  const dy=(b[0]-a[0])*111200,dx=(b[1]-a[1])*103000;
  const y=(point[0]-a[0])*111200,x=(point[1]-a[1])*103000;
  const at=Math.max(0,Math.min(1,(dy*y+dx*x)/(dy*dy+dx*dx||1)));
  return Math.hypot(y-at*dy,x-at*dx);
}
export function nearestFlowEdge(point){
  const keys=new Set();
  for(const dy of [-.00015,0,.00015])for(const dx of [-.00015,0,.00015])keys.add(bin(point[0]+dy,point[1]+dx));
  let best=null,distance=15;
  for(const key of keys)for(const edge of bins.get(key)||[]){
    const candidate=distanceToEdge(point,edge);
    if(candidate<distance){best=edge;distance=candidate;}
  }
  return best;
}

export function edgeFlow(edge,hour,simulateTracks=false){
  const demand=office[hour]*(1-edge.shore)+waterfront[hour]*edge.shore;
  const count=Math.round(edge.capacity*demand*edge.scale/12);
  const share=hour>=7&&hour<10?.63:hour>=16&&hour<20?.41:.52;
  const toward=Math.round(count*share);
  const detections=simulateTracks?countGate(Array.from({length:count},(_,index)=>{
    const direction=index<toward?1:-1;
    return [-.5,-.1,.1,.5].map(offset=>({offset:offset*direction}));
  })):{toward,away:count-toward};
  return {count,ratio:count*12/edge.capacity,toward:detections.toward*12,away:detections.away*12};
}
