// Keep a short in-memory location window for possible backtracks. Save only session summaries.
export function phoneSignals(){
  let fix, bearing, headingTurn, lastMotion=-Infinity;
  let movingSeconds=0, stoppedSeconds=0, motionSamples=0, squaredMotion=0, turns=0;
  let speed=null, accuracy=null, gps=0, gyro=0, rotationPeak=0;
  let quietAt=null, lowMotion=false, rotationSamples=0, rotationChanged=false, backtracks=0;
  const trail=[];
  const distance=(a,b)=>Math.hypot((a.latitude-b.latitude)*111200,(a.longitude-b.longitude)*103000);
  return {
    location({coords,timestamp}){
      const {latitude,longitude,accuracy:precision}=coords;
      accuracy=precision;
      if(Number.isFinite(precision)&&precision<=15)gps++;
      if(!Number.isFinite(precision)||precision>15||![latitude,longitude,timestamp].every(Number.isFinite)){
        fix=undefined;speed=null;trail.length=0;return;
      }
      if(fix){
        const elapsed=(timestamp-fix.timestamp)/1000;
        if(elapsed>=.7&&elapsed<=6){
          const measuredSpeed=coords.speed;
          // Successive positions alone are too coarse for detecting a brief pause.
          speed=Number.isFinite(measuredSpeed)&&measuredSpeed>=0?measuredSpeed:null;
          if(speed!==null){
            if(speed>=.25&&speed<=3.5)movingSeconds+=elapsed;
            if(speed<.25)stoppedSeconds+=elapsed;
          }
        }else speed=null;
      }
      fix={latitude,longitude,timestamp,precision};
      while(trail.length&&(trail.length>=25||timestamp-trail[0].timestamp>60000))trail.shift();
      if(trail.some((start,i)=>distance(start,fix)<=Math.max(8,start.precision+precision)&&
        trail.slice(i+1).some(far=>distance(start,far)>Math.max(25,2*(start.precision+far.precision))&&
          distance(far,fix)>Math.max(25,2*(far.precision+precision))))){
        backtracks++;trail.length=0;
      }
      trail.push(fix);
    },
    motion(event){
      if(event.timeStamp-lastMotion<125)return;
      if(event.timeStamp-lastMotion>800){quietAt=null;rotationSamples=0;}
      lastMotion=event.timeStamp;
      const a=event.acceleration,r=event.rotationRate;
      if(a&&[a.x,a.y,a.z].every(Number.isFinite)){
        const magnitude=Math.hypot(a.x,a.y,a.z);
        motionSamples++;squaredMotion+=magnitude*magnitude;
        if(magnitude<.22){
          quietAt??=event.timeStamp;
          if(event.timeStamp-quietAt>=3000)lowMotion=true;
        }else quietAt=null;
      }
      if(r&&[r.alpha,r.beta,r.gamma].some(Number.isFinite)){
        gyro++;
        const magnitude=Math.hypot(...[r.alpha,r.beta,r.gamma].map(value=>Number.isFinite(value)?value:0));
        rotationPeak=Math.max(rotationPeak,magnitude);
        rotationSamples=magnitude>=30?rotationSamples+1:0;
        if(rotationSamples>=2)rotationChanged=true;
      }
    },
    compass(degrees,stamp){
      if(!Number.isFinite(degrees))return;
      if(!bearing){
        bearing={degrees,stamp};
        return;
      }
      if(stamp-bearing.stamp<300)return;
      const delta=(degrees-bearing.degrees+540)%360-180;
      bearing={degrees,stamp};
      if(Math.abs(delta)<9){
        if(headingTurn&&stamp-headingTurn.stamp>1300)headingTurn=null;
        return;
      }
      if(!headingTurn||stamp-headingTurn.stamp>1300||Math.sign(delta)!==Math.sign(headingTurn.arc)){
        headingTurn={arc:0,stamp};
      }
      headingTurn.arc+=delta;
      headingTurn.stamp=stamp;
      if(Math.abs(headingTurn.arc)>=125){turns++;headingTurn=null;}
    },
    summary(){
      return {speed,accuracy,movingSeconds,stoppedSeconds,turns,gps,accelerometer:motionSamples,gyroscope:gyro,rotationPeak,lowMotion,rotationChanged,backtracks,
        motion:motionSamples?Math.sqrt(squaredMotion/motionSamples):null};
    },
  };
}
