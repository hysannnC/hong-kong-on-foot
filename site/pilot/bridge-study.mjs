import {duration,notice,position,readNotice,sensorTimeline} from './bridge-model.mjs';

import {approach,terminalLink,pierAccess} from './bridge-geography.mjs';

export const reviewId='ifc-footbridge';
const origin=approach[0];
export const reviewHash=(lang,view='public')=>'#'+new URLSearchParams({
  mode:view,reviewView:view,profile:'wheelchair',lang,lat:origin[0],lng:origin[1],review:reviewId,z:17,area:0,
});

const scans=sensorTimeline();
const confirmedAt=scans.find(v=>v.confirmed).time;
// Pin the short replay to the mapped elevated terminal link. Along-track movement
// captures the turnback. Lane shifts and the fictional lift/ramp are not geocoded.
const [south,north]=terminalLink;
const toMap=({s})=>{
  const u=Math.min(1,Math.max(0,(s-9)/(notice.s-9)));
  return south.map((value,i)=>value+(north[i]-value)*u);
};
const at=(time,detour=true)=>toMap(position(time,detour));
const ramp=at(duration);
const lift=toMap(notice);
export const studyPaths={
  planned:[...approach,...terminalLink.slice(1),...pierAccess.slice(1)],
  recorded:Array.from({length:117},(_,i)=>at(i/4,i/4>=confirmedAt)),
};

// The replay fixtures stand in for fused, segment-matched sensor readings.
const bridgePass={
  id:'bridge-edge',segment:'osm-way-1481059299',confidence:'corroborated',location:at(6.8),cameraPeople:[6,7,6],
  approachSpeeds:[1.1,1.04,.99],passingSpeeds:[.55,.46,.58],lateralShift:2.2,
};
const liftApproach={
  id:'lift-a',segment:'osm-way-1481059299',confidence:'scenario-only',location:lift,noticeReads:[notice.text,notice.text],
  headingSweep:176,stoppedSeconds:2,matchedToAsset:true,
};
const rampDecision={
  id:'ramp-entry',segment:'osm-way-1481059299',confidence:'tentative',location:ramp,stoppedSeconds:2,headingSweep:43,confirmedLevelChange:false,
};

const metadata=event=>({segment:event.segment,confidence:event.confidence,source:'simulation'});
export function inferObservations(){
  const crowdedScans=bridgePass.cameraPeople.filter(count=>count>=4).length;
  const slowed=mean(bridgePass.passingSpeeds)<mean(bridgePass.approachSpeeds)*.7;
  const detoured=bridgePass.lateralShift>=1;
  const closure=liftApproach.matchedToAsset&&liftApproach.noticeReads[0]===liftApproach.noticeReads[1]
    ?readNotice(liftApproach.noticeReads[0]):null;
  return {
    crowd:{...metadata(bridgePass),location:bridgePass.location,confirmed:crowdedScans>=3&&slowed&&detoured,crowdedScans,slowed,detoured},
    lift:{...metadata(liftApproach),location:liftApproach.location,closure,turnedBack:liftApproach.headingSweep>=150&&liftApproach.stoppedSeconds>=2},
    ramp:{...metadata(rampDecision),location:rampDecision.location,hesitation:rampDecision.stoppedSeconds>=2&&rampDecision.headingSweep>=35,
      levelChange:rampDecision.confirmedLevelChange},
  };
}

const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
export const profileNames={
  wheelchair:['Wheelchair','輪椅使用者'],aid:['Walking aid','使用助行輔具'],walk:['Walking without an aid','步行（不使用輔具）'],
};
// Each trip contributes one quality-checked bridge traversal, including its waits.
// During calibration, repeat traversals by the same device would need deduplication.
const batches=[
  [
    ['w1','wheelchair','busy',68,true],['w2','wheelchair','busy',76,true],
    ['w3','wheelchair','quiet',47,false],['a1','aid','busy',63,true],
    ['a2','aid','quiet',52,false],['p1','walk','busy',49,false],['p2','walk','quiet',37,false],
  ],
  [
    ['w4','wheelchair','busy',90,true],['w5','wheelchair','quiet',50,false],
    ['a3','aid','busy',79,true],['a4','aid','quiet',55,false],
    ['p3','walk','busy',53,true],['p4','walk','quiet',41,false],
  ],
];
const secondsByProfile={
  wheelchair:{bridge:44,lift:344,ramp:394,stairs:310},
  aid:{bridge:46,lift:348,ramp:399,stairs:317},
  walk:{bridge:35,lift:289,ramp:330,stairs:295},
};
export const learningRounds=batches.length;
const observations=inferObservations();

export function reviewEstimate({profile,period,round,withEvidence,date,requireStepFree}){
  const baseline=secondsByProfile[profile];
  const records=withEvidence?batches.slice(0,round).flat().filter(r=>r[1]===profile&&r[2]===period):[];
  const observed=records.map(r=>r[3]);
  const learned=observed.length?mean([baseline.bridge,baseline.bridge,...observed]):baseline.bridge;
  const closure=withEvidence?observations.lift.closure:null;
  const within=Boolean(closure&&date>=closure.from&&date<=closure.through);
  const verify=Boolean(closure&&date>closure.through);
  const choices=[
    {id:'lift',seconds:baseline.lift,exclusion:within?'closed':verify?'verify':null},
    {id:'ramp',seconds:baseline.ramp,exclusion:null},
    {id:'stairs',seconds:baseline.stairs,exclusion:requireStepFree?'steps':null},
  ].map(route=>({...route,seconds:Math.round(route.seconds+learned-baseline.bridge)}));
  const best=choices.filter(route=>!route.exclusion).sort((a,b)=>a.seconds-b.seconds)[0];
  return {best,choices,samples:records.length,delayed:records.filter(r=>r[4]).length,
    baseline:baseline.bridge,learned:Math.round(learned),within,verify};
}
