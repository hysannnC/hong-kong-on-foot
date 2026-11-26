export const duration=29;
export const crowd={s:23,left:-3.4,right:-.65};
export const clearWidth=3.4-crowd.right;
export const notice={x:-6.2,s:47.6,text:'LIFT OUT OF SERVICE 26 NOV – 02 DEC 2026', zh:'升降機暫停服務 · 2026年11月26日至12月2日'};
export function readNotice(text){
  const match=/LIFT OUT OF SERVICE (\d{2}) (NOV)\s*[–-]\s*(\d{2}) (DEC) (\d{4})/.exec(text);
  if(!match)return null;
  return {asset:'pier-7-primary-lift',from:match[5]+'-11-'+match[1],through:match[5]+'-12-'+match[3]};
}
export function departurePlan(date,needsStepFree,closure){
  if(!closure||date<closure.from)return 'primary';
  if(date<=closure.through)return 'alternate';
  return needsStepFree?'verify-use-alternate':'verify';
}
const graph=[
  ['approach','edge',8,0],['edge','rejoin',7,0],
  ['approach','middle',8.4,clearWidth],['middle','rejoin',7.4,clearWidth],
  ['rejoin','pier',16,0],
];
export function plan(blocked,minimumWidth=1.2){
  const queue=[{node:'approach',cost:0,via:[]}],visited=new Set();
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost);
    const choice=queue.shift();
    if(choice.node==='pier')return choice;
    if(visited.has(choice.node))continue;
    visited.add(choice.node);
    for(const [from,to,length,width] of graph){
      if(from!==choice.node||(blocked&&to==='edge')||(width>0&&width<minimumWidth))continue;
      queue.push({node:to,cost:choice.cost+length,via:[...choice.via,to]});
    }
  }
  return null;
}
export const alternative={name:['Harbourfront ramp','海濱斜道'],demoGradient:'1:20'};
function easeBetween(value,a,b){
  const u=Math.min(1,Math.max(0,(value-a)/(b-a)));
  return u*u*(3-2*u);
}
export const turnStart=16, turnEnd=20;
const landing={x:-6.20,s:46.22};
const rampS=32.62;
const outerX=19.40, innerX=5.75, radius=2.05;
const rampParts=[];
let distance=0, floorY=0;
function flight(from,to,s){
  const length=Math.abs(to-from), start=distance, y=floorY;
  rampParts.push({end:start+length, sample(d){
    const dir=Math.sign(to-from), offset=d-start;
    return {x:from+dir*offset,s,y:y-offset/20,heading:dir*Math.PI/2};
  }});
  distance+=length;
  floorY-=length/20;
}
function turn(x,s,dir){
  const start=distance, y=floorY;
  distance+=Math.PI*radius;
  rampParts.push({end:distance,sample(d){
    const angle=(d-start)/radius;
    return {x:x+dir*radius*Math.sin(angle),s:s-radius*(1-Math.cos(angle)),y,heading:dir*Math.PI/2+dir*angle};
  }});
}
flight(3.4,outerX,rampS);
turn(outerX,rampS,1);
flight(outerX,innerX,rampS-2*radius);
turn(innerX,rampS-2*radius,-1);
flight(innerX,outerX,rampS-4*radius);
turn(outerX,rampS-4*radius,1);
flight(outerX,innerX,rampS-6*radius);
export const rampLength=distance;
export const rampFloor=floorY;
export const rampExit={x:innerX,s:rampS-6*radius,y:rampFloor};
export function rampPose(metres){
  const d=Math.min(rampLength,Math.max(0,metres));
  return rampParts.find(part=>d<=part.end).sample(d);
}

export function position(t,detour){
  if(t>=turnEnd){
    const elapsed=t-turnEnd;
    const s=landing.s-1.60*(elapsed<1?elapsed*elapsed/2:elapsed-.5);
    const x=alternateX(elapsed);
    const dx=alternateX(elapsed+.01)-alternateX(elapsed-.01);
    const heading=Math.PI-Math.atan2(dx,.032);
    return {s,x,y:0,heading:heading+(Math.PI/2-heading)*easeBetween(elapsed,8.2,9)};
  }
  if(t>=turnStart){
    const angle=Math.PI*easeBetween(t,turnStart,turnEnd);
    return {s:landing.s+.85*Math.sin(angle),x:landing.x+.85*(1-Math.cos(angle)),y:0,heading:angle};
  }
  const elapsed=Math.min(20,t+5*easeBetween(t,7,12)), brake=Math.max(0,elapsed-18);
  const s=9+1.98*elapsed-.495*brake*brake-.40*easeBetween(elapsed,18,20);
  const x=-2.02+(detour?2.22*easeBetween(s,16,21):0)-6.40*easeBetween(s,36,45.3);
  const d=s+.11;
  const aheadX=-2.02+(detour?2.22*easeBetween(d,16,21):0)-6.40*easeBetween(d,36,45.3);
  return {s,x,y:0,heading:Math.atan2(aheadX-x,.11)};
}
function alternateX(elapsed){
  return -4.50+4.72*easeBetween(elapsed,1.4,6.8)+3.18*easeBetween(elapsed,6.8,9);
}
export function sensorTimeline(){
  let streak=0,confirmed=false,noticeStreak=0,read=false;
  return Array.from({length:Math.floor(duration/.4)+1},(_,index)=>{
    const time=index*.4;
    const {s,x}=position(time,confirmed);
    const ahead=crowd.s-s;
    const offset=(crowd.left+crowd.right)/2-x;
    const inView=ahead>2&&ahead<12&&Math.abs(offset/ahead)<.53;
    streak=inView?streak+1:0;
    confirmed=confirmed||streak>=3;
    const signAhead=notice.s-s;
    noticeStreak=signAhead>.5&&signAhead<3.5&&Math.abs(x-notice.x)<1.6?noticeStreak+1:0;
    read=read||noticeStreak>=2;
    return {time,streak,confirmed,read};
  });
}

export const pedestrianPlan=[
  [1.70,12,true,1],[2.494,16.377,true,-1],[1.32,19,true,1],[2.30,24,true,1],
  [.506,23.729,true,-1],[.664,50.354,true,-1],[-.65,16,true,-1],[-1.65,40,true,1],[-.54,51,true,1],
  [-3.02,23.45,false],[2.89,17,false],[-2.8,21.7,false],[-2.05,22.3,false],
  [-1.3,22.8,false],[-1.5,24.15,false],[-2.35,24.5,false],
];
export const walkingSpeed=index=>[1.04,1.13,1.19,1.26][index%4];

export function pedestrianPose(index,time){
  const [baseX,start,walking,direction]=pedestrianPlan[index];
  if(!walking)return {x:baseX,s:start};
  const speed=walkingSpeed(index);
  const phase=.62*time+index*1.8;
  const x=baseX+.072*Math.sin(phase);
  return {x,s:start+time*speed*direction,heading:Math.atan2(.04464*Math.cos(phase),-direction*speed)};
}
