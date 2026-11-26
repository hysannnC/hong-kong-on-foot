import {addFieldEvidence,arReplayEvidence,evidenceNames,evidenceTime,phoneObservation,trackPeople} from './field-evidence.mjs?v=54';
import {photos} from './street-photos.mjs';
import {centralCases} from './central-camera.mjs?v=54';
import {getDetector} from './vision.mjs';
import {phoneSignals} from './phone-signals.mjs?v=23';
import {nearestStreet} from './street-model.mjs';
import {addTrip} from './street-store.mjs?v=54';
import {arContext,replayEvents} from './trip-journey.mjs?v=54';
import {buildItinerary,distanceBetween,updateGuidance} from '../navigation.js';


export function mountFieldStudy({pause,complete}) {
  const $=id=>document.getElementById(id);
  const put=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  const video=$('field-video'),boxes=$('field-boxes');
  let zh=false,active=false,generation=0,stream,timer,watch,refresh,stats=phoneSignals(),matches={},crowd=0,scans=0,detections=[];
  let source='sample',done=false,status='',shownSecond=0,startedAt=0,share=false,events=[],trace=[],guidance={},gap=true,lastFix=null;
  let people=trackPeople(),flowWindows=new Map(),liveNotices=new Map(),lastMotionFrame,ocr,ocrPending=false,lastOCR=0,replayToken=0;
  const legs=new URLSearchParams(location.search).get('map')==='1'?(arContext()?.legs||[]):[];
  const track=legs.length?buildItinerary(legs):null;
  const t=(en,tc)=>zh?tc:en;
  function labels(lang){
    zh=lang==='zh';
    put('field-title',t('What your phone is sensing','手機感測觀察'));
    put('field-privacy',t('Sensors run during live guidance. The replay uses simulated observations.','即時導航期間會使用感測器。重播使用模擬觀察。'));
    put('field-consent-label',t('Save timed observations and approximate locations on this browser','在此瀏覽器儲存觀察時間及約略位置'));
    put('field-central-replay',t('Replay Central street observations','重播中環街道觀察'));
    put('field-start',t('Start live AR','開始即時 AR'));
    put('field-stop',t('Finish trip','完成行程'));
    render();
  }
  function note(id){
    if(!events.some(event=>event.id===id))events.push({id,at:Math.round((performance.now()-startedAt)/1000)});
  }
  function collectMotion(){
    const m=stats.summary();
    if(m.lowMotion)note('pause');
    if(m.rotationChanged)note('rotation');
    if(m.backtracks)note('backtrack');
  }
  const motion=e=>{
    stats.motion(e);
    const vectors=[e.acceleration?.x,e.acceleration?.y,e.acceleration?.z,e.rotationRate?.alpha,e.rotationRate?.beta,e.rotationRate?.gamma];
    if(vectors.every(Number.isFinite)){
      lastMotionFrame={at:performance.now(),steady:Math.hypot(...vectors.slice(0,3))<.45&&Math.hypot(...vectors.slice(3))<10};
    }
  };
  function timedFlow(){
    const now=performance.now(),stamp=Date.now();
    const steady=Boolean(!gap&&lastFix&&stamp-lastFix.time<6000&&lastMotionFrame?.steady&&now-lastMotionFrame.at<800&&stats.summary().speed<.25&&stats.summary().speed!==null);
    const counts=people.frame(detections,video.videoWidth,video.videoHeight,now,steady);
    if(steady){
      const at=Math.floor(stamp/300000)*300000;
      const point=lastFix.point;
      const id=Math.round(point[0]*1e4)+'-'+Math.round(point[1]*1e4)+'-'+at;
      const previous=flowWindows.get(id)||{point,at,toward:0,away:0,last:stamp,frames:0,milliseconds:0};
      if(stamp-previous.last<=3500)previous.milliseconds+=stamp-previous.last;
      previous.toward+=counts.toward;previous.away+=counts.away;previous.last=stamp;previous.frames++;
      flowWindows.set(id,previous);
    }
    const point=lastFix?.point;
    if(!ocr||ocrPending||!point||gap||stamp-lastFix.time>6000||stamp-lastOCR<3500)return;
    ocrPending=true;lastOCR=stamp;
    const token=generation;
    ocr.detect(video).then(notices=>{
      if(token!==generation)return;
      const text=notices.map(notice=>notice.rawValue).join(' ');
      if(!/\b(?:LIFT|ELEVATOR|ESCALATOR|TRAVELATOR)\b.{0,36}\bOUT OF SERVICE\b|(?:升降機|扶手電梯|輸送帶).{0,18}(?:暫停服務|停止服務)/is.test(text.toUpperCase()))return;
      if(!liveNotices.has('facility')){
        liveNotices.set('facility',{at:stamp,point});
        note('closure');
      }
    }).catch(()=>{}).finally(()=>{if(token===generation)ocrPending=false;});
  }

  function orientation(e){
    const heading=e.webkitCompassHeading??(e.absolute&&Number.isFinite(e.alpha)?360-e.alpha:null);
    stats.compass(heading,e.timeStamp);
  }
  function locationSample(position){
    stats.location(position);
    const c=position.coords;
    if(!Number.isFinite(c.accuracy)||c.accuracy>15){gap=true;render();return;}
    const point=[c.latitude,c.longitude];
    if(!point.every(Number.isFinite))return;
    const id=nearestStreet(...point);
    if(id)matches[id]=(matches[id]||0)+1;
    const line=trace.at(-1);
    const elapsed=lastFix?(position.timestamp-lastFix.time)/1000:0;
    if(lastFix&&elapsed<=0)return;
    if(gap||!line||elapsed>12||(lastFix&&distanceBetween(lastFix.point,point)>Math.max(20,elapsed*4))){
      if(trace.length>=300)trace.shift();
      trace.push([point]);gap=false;
    }else if(distanceBetween(line.at(-1),point)>=7){
      if(line.length>=600)trace.push([line.at(-1),point]);
      else line.push(point);
    }
    lastFix={point,time:position.timestamp};
    collectMotion();
    if(track){
      guidance=updateGuidance(track,guidance,{coords:point,accuracy:c.accuracy,time:position.timestamp});
      if(guidance.status==='arrived'){finishPhone();return;}
    }
    render();
  }
  function segment(){
    const best=Object.entries(matches).sort((a,b)=>b[1]-a[1])[0];
    return best?.[1]>=2?best[0]:null;
  }
  function stop(){
    active=false;generation++;
    document.body.classList.remove('live-trip');
    clearTimeout(timer);clearInterval(refresh);
    if(watch!==undefined)navigator.geolocation.clearWatch(watch);
    watch=undefined;
    window.removeEventListener('devicemotion',motion);
    window.removeEventListener('deviceorientation',orientation);
    window.removeEventListener('deviceorientationabsolute',orientation);
    stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;
    video.hidden=boxes.hidden=$('field-camera-label').hidden=true;
    $('view').hidden=false;
    for(const id of ['play','restart','seek','record'])$(id).disabled=false;
    $('field-direction').hidden=true;
    render();
  }
  async function start(){
    pause();replayToken++;$('field-central-captures').hidden=true;
    const token=++generation;
    active=true;done=false;document.body.classList.add('live-trip');$('view').hidden=true;source='phone';status='starting';stats=phoneSignals();matches={};crowd=0;scans=0;detections=[];
    people=trackPeople();flowWindows=new Map();liveNotices=new Map();lastMotionFrame=null;ocr=null;ocrPending=false;lastOCR=0;
    try{if(window.TextDetector)ocr=new window.TextDetector();}catch{}
    startedAt=performance.now();share=$('field-consent').checked;events=[];trace=[];guidance={};gap=true;lastFix=null;
    for(const id of ['play','restart','seek','record'])$(id).disabled=true;
    render();
    for(const [api,event,listener] of [[window.DeviceMotionEvent,'devicemotion',motion],[window.DeviceOrientationEvent,'deviceorientation',orientation]]){
      if(!api)continue;
      try{
        const grant=api.requestPermission?.();
        if(grant)grant.then(value=>{if(value==='granted'&&token===generation)window.addEventListener(event,listener);}).catch(()=>{});
        else window.addEventListener(event,listener);
      }catch{}
    }
    window.addEventListener('deviceorientationabsolute',orientation);
    if(navigator.geolocation)watch=navigator.geolocation.watchPosition(locationSample,()=>{},
      {enableHighAccuracy:true,maximumAge:1500,timeout:15000});
    refresh=setInterval(()=>{collectMotion();render();},1000);
    try{
      const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}}});
      if(token!==generation){camera.getTracks().forEach(track=>track.stop());return;}
      stream=camera;video.srcObject=camera;
      await video.play();
      if(token!==generation)return;
      video.hidden=boxes.hidden=$('field-camera-label').hidden=false;
      $('view').hidden=true;status='loading';render();
      const model=await getDetector();
      if(token!==generation)return;
      status='camera';
      async function scan(){
        try{
          if(video.readyState>=2){
            const found=await model.detect(video,30,.55);
            if(token!==generation)return;
            scans++;
            detections=found.filter(d=>d.class==='person');
            if(detections.length>=4){crowd++;note('people');}
            timedFlow();draw();render();
          }
          if(token===generation)timer=setTimeout(scan,1100);
        }catch{if(token===generation){status='noModel';render();}}
      }
      scan();
    }catch{if(token===generation){status=stream?'noModel':'noCamera';render();}}
  }
  function draw(){
    if(!video.videoWidth)return;
    boxes.width=video.videoWidth;boxes.height=video.videoHeight;
    const ctx=boxes.getContext('2d');
    ctx.strokeStyle='#83ffc4';ctx.lineWidth=3;
    ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(0,boxes.height*.65);ctx.lineTo(boxes.width,boxes.height*.65);ctx.stroke();ctx.setLineDash([]);
    for(const {bbox:[x,y,w,h]} of detections)ctx.strokeRect(x,y,w,h);
  }
  function replay(time){
    if(active)return;
    source='sample';
    if(shownSecond===Math.floor(time)&&done===(time>=29))return;
    shownSecond=Math.floor(time);done=time>=29;render();
  }
  function readings(){
    if(source==='phone')return stats.summary();
    const paused=Math.max(0,Math.min(2,shownSecond-14));
    return {gps:Math.floor(shownSecond/2),accelerometer:shownSecond*8,gyroscope:shownSecond*8,
      movingSeconds:shownSecond-paused,stoppedSeconds:paused,turns:shownSecond>=20?1:0,
      lowMotion:paused>=2,rotationChanged:shownSecond>=17,backtracks:shownSecond>=25?1:0};

  }
  function render(){
    const m=readings();
    const messages={
      starting:t('Requesting camera, motion and GPS permissions.','正在要求相機、動作及 GPS 權限。'),
      loading:t('Loading on-device person detection.','正在載入裝置內行人辨識。'),
      camera:t('Person detection running on this device.','正在此裝置辨識行人。'),
      noModel:t('Person detection unavailable. Phone sensors can continue.','行人辨識暫不可用。手機感測器仍可運作。'),
      noCamera:t('Camera unavailable. Phone sensors can continue.','相機暫不可用。手機感測器仍可運作。'),
    };
    put('field-status',source==='sample'?t('Simulated observations · IFC replay','模擬觀察 · 國際金融中心重播'):messages[status]||'');
    put('field-camera-label',t('LIVE CAMERA · PERSON DETECTION','即時相機 · 行人辨識'));
    const waiting=done?t('No usable reading','沒有可用讀數'):t('Waiting for a reading','等候讀數');
    const values=[
      [t('Accelerometer','加速度計'),!m.accelerometer?waiting:m.lowMotion?
        (m.stoppedSeconds>=2?t('Low movement during a possible pause','可能停頓期間動作較少'):t('Low phone movement detected','偵測到手機動作較少')):
        t('Phone movement detected','偵測到手機動作')],
      [t('Gyroscope','陀螺儀'),!m.gyroscope?waiting:m.rotationChanged?
        t('Phone rotation changed','手機旋轉有變化'):t('No sustained rotation change detected','未偵測到持續旋轉變化')],
      [t('GPS','GPS 定位'),m.backtracks?t('Possible backtrack','可能折返'):!m.gps?waiting:
        m.accuracy>15?t('Location signal is currently weak','目前定位訊號較弱'):t('Location available','已取得定位')],
      [t('Camera','相機'),(source==='sample'?shownSecond>=replayEvents[0].at:crowd>0)?
        t('Crowding observed in the camera view','相機畫面中觀察到擠迫'):
        source==='phone'&&scans?t('No crowding observed','未觀察到擠迫'):
        source==='phone'&&['noModel','noCamera'].includes(status)?t('Detection unavailable','辨識暫不可用'):waiting],
    ];
    const next=track?.cues[guidance.cueIndex]?.kind;
    const directions={
      sharpLeft:t('Turn left ahead','前方左轉'),sharpRight:t('Turn right ahead','前方右轉'),
      lift:t('Continue to the lift','繼續前往升降機'),ramp:t('Follow the ramp','沿斜道前進'),
      tunnel:t('Continue through the subway','繼續經行人隧道'),footbridge:t('Follow the footbridge','沿天橋前進'),
      stairsDown:t('Go down the stairs','沿樓梯向下'),stairsUp:t('Go up the stairs','沿樓梯向上'),
      stairMove:t('Use the stairs ahead','使用前方樓梯'),arrive:t('Destination ahead','目的地在前方'),
    };
    const instruction=!track?t('Observing this walk','正在觀察此行程'):
      guidance.status==='off'?t('You may be off route · check the map','可能已偏離路線，請查看地圖'):
      guidance.status==='following'?(directions[next]||t('Continue along the route','沿路線繼續')):
      t('Waiting for a reliable location','等待可靠定位');
    $('field-direction').hidden=!active;
    put('field-direction',instruction+(detections.length>=4?t(' · People ahead',' · 前方有人群'):''));
    $('field-readings').replaceChildren(...values.map(([label,value])=>{
      const row=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');
      term.textContent=label;detail.textContent=value;row.append(term,detail);return row;
    }));
    const totals=[...flowWindows.values()].reduce((sum,row)=>sum+row.toward+row.away,0);
    put('field-conditions',source==='sample'?t('The IFC replay includes a timed crowd observation and a lift notice. The Central street replay adds water and crossing checks.',
      '國際金融中心重播包括附時間的人流觀察及升降機告示。中環街道重播另有積水及過路檢查。'):
      (totals?t(totals+' estimated camera-line crossings. ', '估計有 '+totals+' 次穿越相機計數線。'):t('Hold the phone still to sample directional flow. ','請保持手機穩定以估算方向流量。'))+
      (liveNotices.size?t('Possible interruption notice recorded. ','已記錄可能的服務中斷告示。'):
        ocr?t('Checking visible interruption notices. ','正在檢查可見服務中斷告示。'):t('Live notice recognition is unavailable here. ','此裝置暫無即時告示辨識。'))+
      t('Water and crossing checks are shown in the replay.','積水及過路檢查在重播展示。'));
    $('field-central-replay').disabled=active;
    $('field-start').disabled=active;$('field-stop').hidden=!active;$('field-consent').disabled=active;
  }
  function result(kind){
    const sample=kind==='sample';
    const m=sample?{...readings(),lowMotion:true,rotationChanged:true,backtracks:1}:readings();
    const street=sample?'link':segment();
    const id=sample?'ifc-bridge-sample-1':crypto.randomUUID();
    const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const planned=[];
    for(const [a,b] of legs){
      const last=planned.at(-1);
      if(last&&distanceBetween(last.at(-1),a)<1)last.push(b);
      else planned.push([a,b]);
    }
    const timeline=sample?replayEvents:events;
    const evidence={id,source:kind,day,segment:street,report:'unsure',moves:Math.round(m.movingSeconds),
      pauses:Math.round(m.stoppedSeconds),turns:m.turns,accelerometer:m.accelerometer,gyroscope:m.gyroscope,
      gps:m.gps,crowd:sample?3:crowd,scans:sample?18:scans,
      cues:{lowMotion:m.lowMotion,rotationChanged:m.rotationChanged,backtracks:m.backtracks},
      timeline:timeline.map(({id,at})=>({id,at}))};
    const requested=sample?$('field-consent').checked:share;
    const saved=Boolean(requested&&addTrip(evidence));
    if(requested){
      const flow=[...flowWindows.values()].filter(row=>row.frames>=3&&row.milliseconds>=2000).map((row,index)=>
        phoneObservation(id+'-flow-'+index,row.point,row.at,'flow',{
          observedSeconds:Math.round(row.milliseconds/1000),toward:row.toward,away:row.away,
        }));
      const notices=[...liveNotices].map(([kind,row])=>phoneObservation(id+'-'+kind,row.point,row.at,kind));
      addFieldEvidence(sample?arReplayEvidence:[...flow,...notices]);
    }
    complete({id,source:kind,saved,requested,segment:street,events:timeline,
      point:sample?replayEvents.at(-1).point:lastFix?.point,...(sample?{preview:evidence}:{planned,actual:trace,hasReadings:Boolean(m.accelerometer||m.gyroscope||m.gps||scans)})});
  }
  function finishPhone(){
    if(!active)return;
    collectMotion();done=true;stop();result('phone');
  }
  $('field-central-replay').onclick=async()=>{
    if(active)return;
    pause();
    const token=++replayToken, panel=$('field-central-captures');
    panel.hidden=false;panel.replaceChildren();panel.scrollIntoView({block:'nearest'});
    const record=id=>arReplayEvidence.find(row=>row.id===id);
    const shots=[
      ['flow',{image:photos.bridge.file,place:photos.bridge.name},record('ar-ifc-bridge-flow')],
      ['facility',centralCases.facility,record('ar-central-5t')],
      ['water',centralCases.water,record('ar-central-water')],
      ['crossing',centralCases.crossing,record('ar-central-crossing')],
    ];
    for(const [kind,entry,record] of shots){
      if(token!==replayToken)return;
      const row=document.createElement('article'), heading=document.createElement('strong'), photo=document.createElement('img'), text=document.createElement('p');
      heading.textContent=evidenceTime(record.at)+' HKT · '+t(...evidenceNames[kind]);
      photo.src=entry.image;photo.alt=t(...entry.place);photo.referrerPolicy='no-referrer';
      text.textContent=kind==='flow'?t('Archived crowd reference. Scenario counts are stored as a timed sample.',
        '存檔人群參考。情境人流以附時間的樣本儲存。'):t(...entry.cue);
      row.append(heading,photo,text);panel.replaceChildren(row);
      await new Promise(resolve=>setTimeout(resolve,2100));
    }
    if(token!==replayToken)return;
    const stored=addFieldEvidence(arReplayEvidence);
    const status=document.createElement('p');
    status.textContent=stored?t('Replay observations added to Street Study.','重播觀察已加入街道研究。'):
      t('Browser storage is unavailable.','無法使用瀏覽器儲存。');
    const action=document.createElement('a');
    action.textContent=t('Compare the routes','比較路線');
    action.href='../?fieldLoop=1&routeCase=pier#mode=public&view=directions&lang='+(zh?'zh':'en');
    action.target='_top';panel.append(status,action);
  };
  $('field-start').onclick=start;
  $('field-stop').onclick=finishPhone;
  window.addEventListener('pagehide',()=>{if(active)stop();});
  return {labels,replay,finishReplay:()=>result('sample')};
}
