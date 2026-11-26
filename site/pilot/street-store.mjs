import {streets} from './street-model.mjs';
import {publishedTrips} from './published-trips.mjs?v=55';

const key='hk-on-foot.street-studies.v1';
export const reports=['sign','barrier','personal','unsure'];
function read(){
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'{}');
    const list=Array.isArray(saved.trips)?saved.trips:[];
    const trips=new Map(publishedTrips.filter(validTrip).map(row=>[row.id,row]));
    for(const row of list.filter(validTrip))trips.set(row.id,row);
    return {trips:[...trips.values()]};
  }catch{return {trips:publishedTrips.filter(validTrip)};}
}
export const studyState=read;
const metric=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max;
function validTrip(row){
  const cues=row?.cues;
  if(cues!==undefined&&(!cues||typeof cues.lowMotion!=='boolean'||typeof cues.rotationChanged!=='boolean'||!metric(cues.backtracks,18000)))return false;
  if(row?.scans!==undefined&&(!metric(row.scans,18000)||row.crowd>row.scans))return false;
  if(row?.timeline!==undefined&&(!Array.isArray(row.timeline)||row.timeline.length>12||
    !row.timeline.every(event=>event&&['crowd','closure','ramp','pause','rotation','backtrack','people'].includes(event.id)&&metric(event.at,18000))))return false;
  return row&&typeof row.id==='string'&&/^[\w-]{8,60}$/.test(row.id)&&
    ['sample','phone'].includes(row.source)&&(row.segment===null||streets.some(s=>s.id===row.segment))&&
    typeof row.day==='string'&&/^\d{4}-\d\d-\d\d$/.test(row.day)&&reports.includes(row.report)&&
    metric(row.moves,18000)&&metric(row.pauses,18000)&&metric(row.turns,500)&&metric(row.accelerometer,100000)&&
    metric(row.gyroscope,100000)&&metric(row.gps,18000)&&metric(row.crowd,18000);
}
function save(state){
  try{
    localStorage.setItem(key,JSON.stringify(state));
    window.dispatchEvent(new Event('street-study-change'));
    return true;
  }catch{return false;}
}
function sanitized({id,source,segment,day,report,moves,pauses,turns,accelerometer,gyroscope,gps,crowd,cues,scans,timeline}){
  return {id,source,segment,day,report,moves,pauses,turns,accelerometer,gyroscope,gps,crowd,...(scans!==undefined?{scans}:{}),...(timeline?{timeline:timeline.map(({id,at})=>({id,at}))}:{}),...(cues?{cues:{lowMotion:cues.lowMotion,rotationChanged:cues.rotationChanged,backtracks:cues.backtracks}}:{})};
}
export function addTrip(row){
  if(!validTrip(row))return false;
  return mergeTrips([row]).saved;
}
export function mergeTrips(records){
  if(!Array.isArray(records)||records.length>300||!records.every(validTrip))return {saved:false,added:0};
  const state=read(), rows=new Map(state.trips.map(row=>[row.id,row]));
  const previous=rows.size;
  for(const row of records)if(!rows.has(row.id)||(rows.get(row.id).source==='sample'&&row.source==='sample'&&((!rows.get(row.id).cues&&row.cues)||(!rows.get(row.id).timeline&&row.timeline))))rows.set(row.id,sanitized(row));
  return {saved:save({...state,trips:[...rows.values()].slice(-300)}),added:rows.size-previous};
}
