const METRES_LAT=111200;
const METRES_LNG=103000;

export function distanceBetween(a,b) {
  return Math.hypot((a[0]-b[0])*METRES_LAT,(a[1]-b[1])*METRES_LNG);
}

function headingBetween(a,b) {
  return Math.atan2((b[1]-a[1])*METRES_LNG,(b[0]-a[0])*METRES_LAT)*180/Math.PI;
}

function pointAlong(track,at) {
  const segment=track.segments.find(s=>at<=s.start+s.length)||track.segments.at(-1);
  if(!segment)return track.end;
  const t=Math.min(1,Math.max(0,(at-segment.start)/segment.length));
  return segment.a.map((coord,i)=>coord+(segment.b[i]-coord)*t);
}

export function navigationFrame(track,progress=0) {
  const origin=pointAlong(track,progress);
  const ahead=pointAlong(track,progress+22);
  if(!origin||!ahead||distanceBetween(origin,ahead)<2)return null;
  return {bearing:headingBetween(origin,ahead)};
}

export function guidanceGlyph(kind) {
  return {sharpLeft:'↰',sharpRight:'↱',left:'↖',right:'↗',lift:'↕',stairsUp:'↗',stairsDown:'↘',arrive:'◆'}[kind]||'↑';
}

function specialAction(flags,grade) {
  if(flags&32)return 'lift';
  if(flags&1)return grade<-.06?'stairsDown':grade>.06?'stairsUp':'stairMove';
  if(flags&128)return 'tunnel';
  if(flags&256)return 'footbridge';
  if(flags&64)return 'ramp';
  return '';
}

export function buildItinerary(legs) {
  const segments=[], cues=[];
  let at=0, heading=null, lastSpecial='', lastTurn=-Infinity;
  for(const [a,b,flags,metres,grade] of legs) {
    if(metres<.15)continue;
    const length=distanceBetween(a,b);
    const action=specialAction(flags,grade);
    const nextHeading=length>=4.5?headingBetween(a,b):null;
    const angle=heading===null||nextHeading===null?0:(nextHeading-heading+540)%360-180;
    const turn=Math.abs(angle)>=43 && at-lastTurn>=18;
    if(action&&action!==lastSpecial){
      cues.push({kind:action,at,coords:a});
      lastTurn=at;
    }else if(!action&&turn){
      const kind=Math.abs(angle)>=62?(angle<0?'sharpLeft':'sharpRight'):(angle<0?'left':'right');
      cues.push({kind,at,coords:a});
      lastTurn=at;
    }else if(!cues.length){
      cues.push({kind:'follow',at,coords:a});
      lastTurn=at;
    }
    if(nextHeading!==null)heading=nextHeading;
    if(length>.1)segments.push({a,b,start:at,length});
    at+=length;
    lastSpecial=action;
  }
  const end=legs.at(-1)?.[1];
  if(end)cues.push({kind:'arrive',at,coords:end});
  return {segments,cues,total:at,end};
}

function matchSegment(coords,segment,min,max) {
  const {a,b,start,length}=segment;
  const vy=(b[0]-a[0])*METRES_LAT, vx=(b[1]-a[1])*METRES_LNG;
  const y=(coords[0]-a[0])*METRES_LAT, x=(coords[1]-a[1])*METRES_LNG;
  const t=Math.max(0,(min-start)/length,Math.min(1,(max-start)/length,(x*vx+y*vy)/(length*length)));
  return {progress:start+t*length,error:Math.hypot(x-t*vx,y-t*vy)};
}

export function updateGuidance(track,previous,{coords,accuracy,time}) {
  if(!track.end||!Number.isFinite(accuracy)||accuracy>65) {
    return {...previous,status:'weak',off:0,arrivals:0};
  }
  const past=previous.progress;
  const elapsed=Math.max(0,(time-(previous.time??time))/1000);
  const min=past==null?0:Math.max(0,past-32);
  const max=past==null?track.total:Math.min(track.total,past+Math.max(42,elapsed*3.2+accuracy));
  let closest=null;
  for(const segment of track.segments) {
    if(segment.start>max||segment.start+segment.length<min)continue;
    const candidate=matchSegment(coords,segment,min,max);
    if(!closest||candidate.error<closest.error)closest=candidate;
  }
  const endpoint=distanceBetween(coords,track.end);
  const allowed=Math.max(22,Math.min(45,accuracy*1.3));
  if(!closest && track.total<=1)closest={progress:0,error:endpoint};
  if(!closest||closest.error>allowed) {
    return {...previous,status:'off',off:(previous.off||0)+1,arrivals:0};
  }
  const progress=Math.max(past??0,closest.progress);
  const remaining=Math.max(0,track.total-progress);
  const arrivals=remaining<=20&&endpoint<=22&&accuracy<=32?(previous.arrivals||0)+1:0;
  const precise=remaining<=12&&endpoint<=12&&accuracy<=18;
  const cueIndex=track.cues.findIndex(cue=>cue.kind!=='follow'&&cue.at>=progress-7);
  return {progress,time,status:precise||arrivals>=2?'arrived':'following',remaining,
    off:0,arrivals,cueIndex:cueIndex<0?track.cues.length-1:cueIndex};
}
