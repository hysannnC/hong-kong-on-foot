import {demoRoutes} from './demo-routes.mjs?v=55';
import {approach,terminalLink,pierAccess} from './bridge-geography.mjs';
import {centralCorridors} from './central-corridors.mjs';

export const streets=[
  {id:'approach',name:['IFC approach','國際金融中心接駁段'],line:approach.slice(10,25),width:3.3,scale:.84},
  {id:'link',name:['Terminal footbridge','碼頭行人天橋'],line:terminalLink,width:2.8,scale:1},
  {id:'pier',name:['Pier 7 entrance','七號碼頭入口'],line:pierAccess,width:4,scale:.76},
  ...demoRoutes,
];
export const flowStreets=[...centralCorridors,...streets.map(street=>({...street,profile:'water',direction:'harbour'}))];
export const benchmark=23;
const officeDemand=[.11,.08,.06,.05,.05,.10,.19,.55,.88,.76,.54,.52,.75,.82,.62,.60,.72,.92,.91,.72,.54,.40,.26,.16];

const profiles={
  office:officeDemand,
  water:[.11,.08,.06,.05,.05,.10,.19,.55,.88,.76,.54,.52,.75,.82,.62,.60,.72,.92,.91,.72,.54,.40,.26,.16],
  market:[.11,.07,.04,.04,.05,.09,.18,.40,.59,.64,.71,.79,.94,1.02,.88,.79,.77,.81,.86,.72,.59,.40,.27,.17],
  evening:[.34,.21,.14,.09,.06,.07,.12,.22,.35,.41,.47,.53,.65,.68,.61,.56,.62,.69,.77,.91,.99,1.02,.86,.61],
};
const flowCache=new Map();

export function countGate(tracks){
  const counts={toward:0,away:0};
  for(const track of tracks){
    let from=0;
    for(const point of track){
      const side=point.offset>.15?1:point.offset<-.15?-1:0;
      if(!side)continue;
      if(from&&side!==from){counts[side>0?'toward':'away']++;break;}
      from=side;
    }
  }
  return counts;
}

export function hourlyFlow(street,hour){
  const key=street.id+':'+hour;
  if(flowCache.has(key))return flowCache.get(key);
  const minutes=5;
  const capacity=street.width*benchmark*60;
  const volume=Math.round(capacity*profiles[street.profile||'water'][hour]*street.scale*minutes/60);
  const tidal=street.profile!=='evening'&&street.profile!=='market';
  const forwardShare=tidal&&hour>=7&&hour<10?.65:tidal&&hour>=16&&hour<20?.39:.53;
  const tracks=Array.from({length:volume},(_,i)=>{
    const direction=i<Math.round(volume*forwardShare)?1:-1;
    return [-.52,-.09,.08,.49].map((offset,frame)=>({offset:offset*direction,time:frame*.5}));
  });
  const result=countGate(tracks);
  const factor=60/minutes;
  const estimate={counted:result.toward+result.away,minutes,toward:result.toward*factor,away:result.away*factor,capacity,
    utilization:(result.toward+result.away)*factor/capacity};
  flowCache.set(key,estimate);
  return estimate;
}

export function behaviorSummary(trips,segment,source='phone'){
  const records=trips.filter(row=>row.segment===segment&&row.source===source);
  const secondsPaused=records.reduce((value,trip)=>value+trip.pauses,0);
  const turns=records.reduce((value,trip)=>value+trip.turns,0);
  const possibleWayfinding=records.filter(row=>row.report==='sign'||(row.report!=='personal'&&row.pauses>=5&&row.turns>0));
  const wayfindingDays=new Set(possibleWayfinding.map(row=>row.day)).size;
  return {sessions:records.length,secondsPaused,turns,wayfindingTrips:possibleWayfinding.length,
    wayfindingDays,audit:possibleWayfinding.length>=3&&wayfindingDays>=2};
}

export function nearestStreet(lat,lng){
  let best={metres:Infinity,id:null};
  for(const street of streets){
    for(let i=1;i<street.line.length;i++){
      const [a,b]=street.line.slice(i-1,i+1);
      const dx=(b[1]-a[1])*103000,dy=(b[0]-a[0])*111200;
      const x=(lng-a[1])*103000,y=(lat-a[0])*111200;
      const u=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));
      const metres=Math.hypot(x-u*dx,y-u*dy);
      if(metres<best.metres)best={metres,id:street.id};
    }
  }
  return best.metres<=30?best.id:null;
}
