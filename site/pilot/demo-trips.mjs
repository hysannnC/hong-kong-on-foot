import {demoDetection} from './demo-detections.mjs?v=54';
import {demoRoutes} from './demo-routes.mjs?v=54';
import {distanceBetween} from '../navigation.js';

export const movementColors={normal:'#29865b',slow:'#df9136',stopped:'#c7514d'};

function buildExample(route,visit){
  const routeIndex=demoRoutes.indexOf(route),reverse=visit===1;
  const points=reverse?route.line.slice().reverse():route.line;
  const line=points.filter((point,index)=>index===0||distanceBetween(point,points[index-1])>.001);
  const stopIndex=Math.max(1,Math.floor((line.length-1)*.6));
  const pause=visit===0?18+routeIndex*5:routeIndex%2?0:12;
  const motion=[];
  const events=[];
  let elapsed=0;
  for(let index=1;index<line.length;index++){
    const slow=index/(line.length-1)>.3&&index/(line.length-1)<.55;
    const speed=slow?.55:1.2,metres=distanceBetween(line[index-1],line[index]);
    const seconds=metres/speed;
    motion.push({from:line[index-1],to:line[index],state:slow?'slow':'normal',speed_m_s:speed,
      distance_m:metres,start_seconds:elapsed,duration_seconds:seconds});
    elapsed+=seconds;
    if(index===stopIndex&&pause){
      motion.push({from:line[index],to:line[index],state:'stopped',speed_m_s:0,distance_m:0,
        start_seconds:elapsed,duration_seconds:pause});
      events.push({id:'pause',at:Math.round(elapsed),point:line[index]});
      elapsed+=pause;
    }
  }
  const seconds=state=>Math.round(motion.filter(row=>row.state===state).reduce((total,row)=>total+row.duration_seconds,0));
  const moving=seconds('normal')+seconds('slow');
  const scans=Math.round(elapsed/3),crowd=Math.round(scans*(visit===0?.26:.08));
  events.push({id:'people',at:Math.round(elapsed*.33),point:line[Math.floor(line.length*.4)]});
  events.sort((a,b)=>a.at-b.at);
  const trip={
    id:'central-demo-'+route.id+'-'+(visit+1),source:'sample',day:'2026-11-'+(visit===0?20+routeIndex:26),
    segment:route.id,report:'unsure',moves:moving,pauses:pause,turns:0,
    accelerometer:Math.round(elapsed)*8,gyroscope:Math.round(elapsed)*7,gps:Math.round(elapsed/3),
    scans,crowd,cues:{lowMotion:pause>=5,rotationChanged:false,backtracks:0},
    timeline:events.map(({id,at})=>({id,at})),
  };
  return {trip,direction:reverse?'reverse':'forward',paths:{planned:[line],actual:[line],ramp:[]},events,motion,observations:[demoDetection({trip,line,motion,routeIndex,visit,site:route.name})],
    normalSeconds:seconds('normal'),slowSeconds:seconds('slow'),distance:Math.round(motion.reduce((sum,row)=>sum+row.distance_m,0))};
}
export const demoTrips=demoRoutes.flatMap(route=>[buildExample(route,0),buildExample(route,1)]);
export const demoTripById=new Map(demoTrips.map(example=>[example.trip.id,example]));

function movementColor(speed){
  const anchors=[[0,[199,81,77]],[.55,[223,145,54]],[1.2,[41,134,91]]];
  const index=speed<=.55?0:1;
  const [low,a]=anchors[index],[high,b]=anchors[index+1];
  const fraction=Math.max(0,Math.min(1,(speed-low)/(high-low)));
  return 'rgb('+a.map((value,i)=>Math.round(value+(b[i]-value)*fraction)).join(',')+')';
}

// A stop occupies a short visual stretch centred on its location. Its recorded
// distance stays zero, and the adjacent colours blend over the approach/departure.
export function movementSections(example){
  let distance=0;
  const stops=[];
  const legs=[];
  for(const row of example.motion){
    if(row.state==='stopped')stops.push({at:distance,seconds:row.duration_seconds});
    else{
      legs.push({...row,start:distance});
      distance+=row.distance_m;
    }
  }
  const sections=[];
  for(let index=0;index<legs.length;index++){
    const leg=legs[index];
    const count=Math.max(1,Math.ceil(leg.distance_m/2));
    for(let part=0;part<count;part++){
      const fraction=(part+.5)/count,along=leg.start+fraction*leg.distance_m;
      let weightedSpeed=0,covered=0;
      for(const neighbour of legs){
        const overlap=Math.max(0,Math.min(along+12,neighbour.start+neighbour.distance_m)-Math.max(along-12,neighbour.start));
        weightedSpeed+=overlap*neighbour.speed_m_s;
        covered+=overlap;
      }
      let speed=weightedSpeed/covered;
      let stopSeconds=0;
      for(const stop of stops){
        const gap=Math.abs(stop.at-along);
        const influence=Math.max(0,Math.min(1,(15-gap)/11));
        speed*=1-influence;
        if(influence>0)stopSeconds=stop.seconds;
      }
      const point=f=>leg.from.map((coordinate,axis)=>coordinate+(leg.to[axis]-coordinate)*f);
      sections.push({line:[point(part/count),point((part+1)/count)],color:movementColor(speed),speed,stopSeconds});
    }
  }
  return sections;
}

export function drawDemoTrip(layer,example,{lang='en',select}={}){
  const t=(en,zh)=>lang==='zh'?zh:en;
  L.polyline(example.paths.actual,{color:'#fff',weight:8,interactive:false}).addTo(layer);
  for(const section of movementSections(example)){
    const path=L.polyline(section.line,{color:section.color,weight:5,opacity:select?.85:1,
      bubblingMouseEvents:false});
    path.bindTooltip(t('Simulated trip','模擬行程')+' · '+example.trip.day+' · '+
      (section.stopSeconds?t('Stop nearby · '+section.stopSeconds+' s','附近停頓 · '+section.stopSeconds+' 秒'):
        t('Movement speed varies along this trip','行程速度沿路變化')));
    if(select)path.on('click',select);
    path.addTo(layer);
  }
  for(const [index,point] of [example.paths.actual[0][0],example.paths.actual[0].at(-1)].entries()){
    const label=index?t('End','終點'):t('Start','起點');
    const marker=L.circleMarker(point,{radius:7,color:'#fff',weight:2,
      fillColor:index?movementColors.stopped:movementColors.normal,fillOpacity:1,bubblingMouseEvents:false});
    marker.bindTooltip(label);
    if(select)marker.on('click',select);
    marker.addTo(layer);
  }
}
