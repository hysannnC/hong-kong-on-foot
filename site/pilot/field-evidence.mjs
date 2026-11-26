import {distanceBetween} from '../navigation.js';
import {centralCases} from './central-camera.mjs?v=54';
import {approach,exampleDetour,exampleRamp} from './bridge-geography.mjs';
import {replayEvents,tripPaths} from './trip-journey.mjs?v=54';

const key='hk-on-foot.field-observations.v1';
const types=['flow','facility','water','crossing','blockage'];
const sources=['phone','ar-replay','cctv-replay'];
const bridge=replayEvents[0].point;
const lift=replayEvents[1].point;
const ramp=replayEvents[2].point;
const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'});
export const evidenceTime=stamp=>hour.format(stamp);
export const evidenceDate=stamp=>day.format(stamp);
export const evidenceNames={
  flow:['Pedestrian flow','行人流量'],facility:['Facility interruption','設施服務中斷'],
  water:['Water on an access route','通道積水'],crossing:['Possible crossing conflict','可能的過路衝突'],
  blockage:centralCases.blockage.name,
};
const valid=row=>row&&typeof row.id==='string'&&row.id.length<90&&types.includes(row.kind)&&sources.includes(row.source)&&
  Number.isFinite(row.at)&&row.at>=0&&Array.isArray(row.point)&&row.point.length===2&&row.point.every(Number.isFinite)&&
  row.point[0]>=22.13&&row.point[0]<=22.58&&row.point[1]>=113.81&&row.point[1]<=114.5;
export function fieldEvidence(){
  try{
    const rows=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(rows)?rows.filter(valid):[];
  }catch{return [];}
}
export function addFieldEvidence(records){
  try{
    const rows=new Map(fieldEvidence().map(row=>[row.id,row]));
    for(const row of records.filter(valid))rows.set(row.id,row);
    localStorage.setItem(key,JSON.stringify([...rows.values()].sort((a,b)=>a.at-b.at).slice(-350)));
    window.dispatchEvent(new Event('field-evidence-change'));
    return true;
  }catch{return false;}
}
const clock=Date.UTC(2026,10,26,9);
const localPoint=point=>point.map(value=>Math.round(value*1e4)/1e4);
export const arReplayEvidence=[
  {id:'ar-ifc-bridge-flow',kind:'flow',point:bridge,at:clock+2000,observedSeconds:20,toward:14,away:7,route:'original'},
  {id:'ar-ifc-waterfront-flow',kind:'flow',point:exampleDetour[5],at:clock+20000,observedSeconds:20,toward:4,away:3,route:'alternative'},
  {id:'ar-ifc-lift',kind:'facility',point:lift,at:clock+13000,route:'original'},
  {id:'ar-central-market-flow',kind:'flow',point:[22.28401,114.15522],at:clock+23500,observedSeconds:20,toward:15,away:9},
  {id:'ar-central-5t',kind:'facility',point:centralCases.facility.where,at:clock+27000},
  {id:'ar-central-water',kind:'water',point:centralCases.water.where,at:clock+31000},
  {id:'ar-central-crossing',kind:'crossing',point:centralCases.crossing.where,at:clock+37000},
].map(row=>({...row,source:'ar-replay'}));

const approaches={
  facility:[[22.28353,114.15484],[22.28651,114.161002]],
  water:[[22.28484,114.15618],[22.28501,114.1566]],
  crossing:[[22.28427,114.1562],[22.28409,114.15598]],
};
export function cameraEvidence(results){
  return results.filter(row=>row.flagged).flatMap(row=>{
    if(row.id==='blockage')return row.samples.filter(sample=>sample.clear_width_m<row.widthThreshold).map((sample,index)=>({
      id:'cctv-central-blockage-'+index,kind:row.id,point:row.where,source:'cctv-replay',
      at:Date.parse(sample.date+'T'+sample.time+':00+08:00'),scenario:'reference',clearWidthM:sample.clear_width_m,
    }));
    return [row.where,...approaches[row.id]].map((point,index)=>({
      id:'cctv-central-'+row.id+'-'+index,kind:row.id,point,
      source:'cctv-replay',at:clock+index*9000+(row.id==='water'?5000:row.id==='crossing'?8000:0),
      scenario:index===2&&row.id==='facility'?'terminal':index?'approach':'reference',
    }));
  });
}

function nearRoute(point,line){
  return line.slice(1).some((end,index)=>{
    const start=line[index],dy=end[0]-start[0],dx=end[1]-start[1];
    const u=Math.max(0,Math.min(1,((point[0]-start[0])*dy+(point[1]-start[1])*dx)/(dy*dy+dx*dx||1)));
    return distanceBetween(point,[start[0]+dy*u,start[1]+dx*u])<=22;
  });
}

export function routeComparison(records){
  const rows=records.filter(row=>row.source==='ar-replay'||row.source==='cctv-replay');
  const original=tripPaths({source:'sample'}).planned[0];
  const alternative=[...approach,ramp,...exampleRamp,...exampleDetour];
  const stats=id=>{
    const observations=rows.filter(row=>row.source==='ar-replay'&&row.route===id);
    const flow=observations.find(row=>row.kind==='flow');
    return {flow:flow?flow.toward+flow.away:null,seconds:flow?.observedSeconds,facility:observations.some(row=>row.kind==='facility')};
  };
  const baseline=stats('original'),updated=stats('alternative');
  const cctv=rows.filter(row=>row.source==='cctv-replay');
  const along=line=>cctv.filter(row=>nearRoute(row.point,line));
  const originalCautions=along(original),alternativeCautions=along(alternative);
  const lowerFlow=baseline.flow!==null&&updated.flow!==null&&baseline.seconds===updated.seconds&&updated.flow<baseline.flow;
  const removesFlag=baseline.facility||originalCautions.length>alternativeCautions.length;
  const hasReplay=baseline.flow!==null||baseline.facility;
  const recommend=hasReplay&&(removesFlag||lowerFlow)&&!alternativeCautions.some(row=>row.kind==='facility'||row.kind==='water')&&
    alternativeCautions.length<=originalCautions.length;
  return {original,alternative,baseline,updated,cctv,originalCautions,alternativeCautions,recommend,lowerFlow,hasReplay,facilityPoint:lift};
}

export function trackPeople(){
  let tracks=[],lastMs=-Infinity;
  return {
    frame(detections,width,height,now,stable){
      const filtered=detections.map(({bbox:[x,y,w,h]})=>({x:(x+w/2)/width,y:(y+h)/height,h:h/height}))
        .filter(point=>point.h>.09&&point.x>.02&&point.x<.98);
      const counts={toward:0,away:0};
      if(!stable){tracks=[];lastMs=-Infinity;return counts;}
      if(now-lastMs>3500)tracks=[];
      lastMs=now;
      const unmatched=new Set(tracks);
      tracks=filtered.map(point=>{
        let nearest,dist=.16;
        for(const previous of unmatched){
          const delta=Math.hypot(point.x-previous.x,point.y-previous.y);
          if(delta<dist){dist=delta;nearest=previous;}
        }
        const side=point.y>.69?1:point.y<.60?-1:0;
        if(!nearest)return {...point,side,counted:false};
        unmatched.delete(nearest);
        const cross=side&&nearest.side&&side!==nearest.side&&!nearest.counted;
        if(cross)counts[side>0?'toward':'away']++;
        return {...point,side:side||nearest.side,counted:nearest.counted||Boolean(cross)};
      });
      return counts;
    },
  };
}
export function phoneObservation(id,point,at,kind,fields={}){
  return {id,kind,source:'phone',point:localPoint(point),at,...fields};
}
