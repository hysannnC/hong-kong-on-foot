import {demoTripById} from './demo-trips.mjs?v=54';
import {distanceBetween} from '../navigation.js';
import {inferObservations,studyPaths} from './bridge-study.mjs';
import {approach,exampleDetour,exampleRamp} from './bridge-geography.mjs';
import {duration,sensorTimeline} from './bridge-model.mjs';

const snapshotKey='hk-on-foot.trip-summary';
const contextKey='hk-on-foot.ar-context';

function read(key){
  try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}
}
function write(key,value){
  try{sessionStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}
export const tripSnapshot=()=>read(snapshotKey);
export const rememberTrip=trip=>write(snapshotKey,trip);
export const arContext=()=>read(contextKey);
export const rememberARContext=context=>write(contextKey,context);

export function tripMapURL(lang,planner=false,compare=false){
  const stored=arContext()?.hash;
  const hash=new URLSearchParams(typeof stored==='string'?stored.slice(1):'');
  hash.delete('map');
  hash.set('mode',planner?'planner':'public');
  hash.set('view',planner?'trips':'directions');
  hash.set('lang',lang);
  return './?shell=54&journey='+(planner?'analysis':'summary')+(compare?'&compare=1':'')+'#'+hash;
}

const labels={
  crowd:['People gathered along the bridge edge','天橋邊有人群聚集'],
  closure:['Lift closed · route changed toward the ramp','升降機暫停服務，改道前往斜道'],
  ramp:['Reached the ramp entrance','已到達斜道入口'],
  signage:['Unclear directions at the IFC junction','國際金融中心交匯處指示不清'],
  surface:['Uneven surface near the ramp landing','斜道平台附近路面不平'],
  queue:['Queue narrows the waterfront path','排隊人群令海濱通道收窄'],
  pause:['Phone movement dropped','手機動作減少'],
  rotation:['Phone rotation changed','手機旋轉有變化'],
  backtrack:['Possible backtrack','可能折返'],
  people:['Several people in the camera view','相機畫面中出現多人'],
};
export const observationLabel=(id,lang)=>labels[id]?.[lang==='zh'?1:0]||'';
const replay=inferObservations(), scans=sensorTimeline();
export const replayEvents=[
  {id:'crowd',at:Math.round(scans.find(scan=>scan.confirmed).time),point:replay.crowd.location},
  {id:'closure',at:Math.round(scans.find(scan=>scan.read).time),point:replay.lift.location},
  {id:'ramp',at:duration,point:replay.ramp.location},
];
const exampleTravelled=[...approach,...studyPaths.recorded.slice(1),...exampleRamp,...exampleDetour];
export const tripMapIncidents=trip=>trip.source==='sample'
  ?demoTripById.get(trip.id)?.events??[
    {id:'signage',point:approach[7]},
    ...replayEvents.filter(event=>event.id!=='ramp'),
    {id:'surface',point:exampleRamp.at(-1)},
    {id:'queue',point:exampleDetour[5]},
  ]
  :trip.events.filter(event=>event.point);
export const tripPaths=trip=>trip.source==='sample'
  ?demoTripById.get(trip.id)?.paths??{planned:[studyPaths.planned],actual:[exampleTravelled],ramp:[exampleRamp]}
  :{planned:trip.planned||[],actual:(trip.actual||[]).filter(line=>line.length>=2),ramp:[]};

export function exampleRouteDistances(){
  const paths=tripPaths({source:'sample'});
  const length=lines=>lines.reduce((total,line)=>
    total+line.slice(1).reduce((metres,point,i)=>metres+distanceBetween(line[i],point),0),0);
  const planned=length(paths.planned),actual=length(paths.actual);
  const round=value=>Math.round(value/10)*10;
  return {planned:round(planned),actual:round(actual),extra:round(actual-planned)};
}
