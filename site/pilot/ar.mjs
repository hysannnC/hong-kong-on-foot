import {getDetector} from './vision.mjs';
import {selectRoute,cameraSignals} from './ar-model.mjs';
import {phoneSignals} from './phone-signals.mjs';
const $=id=>document.getElementById(id);
const video=$('camera'), canvas=$('boxes');
const key='hkonfoot.camera-demo.v1';
let zh=new URLSearchParams(location.search).get('lang')==='zh';
const t=(en,tc)=>zh?tc:en;
let history={}, storageOK=true;
try{const saved=JSON.parse(localStorage.getItem(key)||'{}');history={lift:Number(saved?.lift)||0,covered:Number(saved?.covered)||0};}catch{storageOK=false;}
let mode='ready', stage=0, timer, stream, watch, generation=0;
let heading, fix, active=selectRoute(history), observed=active, alternative, detections=[], signals, scans=0, streak=0;
let telemetry=phoneSignals();
let windows={busy:0,traffic:0,obstacles:0}, modelState='starting';
const name=route=>route.name[zh?1:0];
const put=(id,value)=>{$(id).textContent=value;};
function save(){
  try{localStorage.setItem(key,JSON.stringify(history));storageOK=true;}catch{storageOK=false;}
}
function stop(next='ready'){
  generation++;
  clearTimeout(timer);
  if(watch!==undefined)navigator.geolocation.clearWatch(watch);
  watch=undefined;
  stream?.getTracks().forEach(track=>track.stop());stream=undefined;
  video.srcObject=null;
  window.removeEventListener('deviceorientation',orientation);
  window.removeEventListener('deviceorientationabsolute',orientation);
  window.removeEventListener('devicemotion', motion);
  telemetry=phoneSignals();
  fix=undefined;heading=undefined;detections=[];signals=undefined;
  mode=next;
}
function play(){
  stop('demo');stage=0;
  observed=active=selectRoute(history);
  alternative=undefined;
  render();
  timer=setTimeout(()=>{stage=1;render();
    timer=setTimeout(()=>{
      stage=2;alternative=selectRoute(history,observed.id);
      history[observed.id]=(history[observed.id]||0)+1;save();render();
      timer=setTimeout(()=>{stage=3;render();},3300);
    },2900);
  },3000);
}
function orientation(e){
  if(Number.isFinite(e.webkitCompassHeading)&&e.webkitCompassHeading>=0)heading=e.webkitCompassHeading;
  else if(e.absolute&&Number.isFinite(e.alpha))heading=(360-e.alpha)%360;
  telemetry.compass(heading,e.timeStamp);
}
function motion(event){telemetry.motion(event);}
async function live(){
  stop('opening');
  const token=generation;
  scans=0;streak=0;signals=undefined;heading=undefined;fix=undefined;detections=[];
  windows={busy:0,traffic:0,obstacles:0};modelState='starting';
  active=selectRoute({});
  render();
  const orientationType=window.DeviceOrientationEvent;
  const motionType=window.DeviceMotionEvent;
  try{
    try{orientationType?.requestPermission?.()?.catch(()=>{});}catch{}
    try{motionType?.requestPermission?.()?.catch(()=>{});}catch{}
    window.addEventListener('devicemotion',motion);
    window.addEventListener('deviceorientation',orientation);
    window.addEventListener('deviceorientationabsolute',orientation);
    const input=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}}});
    if(token!==generation){input.getTracks().forEach(t=>t.stop());return;}
    stream=input;video.hidden=false;video.srcObject=input;
    await video.play();
    if(token!==generation)return;
    mode='live';
    if(navigator.geolocation)watch=navigator.geolocation.watchPosition(position=>{fix=position.coords;telemetry.location(position);render();},()=>{}, {enableHighAccuracy:true,maximumAge:2500});
    render();
  }catch{
    if(token===generation){stop('error');render();}
    return;
  }
  try{
    const model=await getDetector();
    if(token!==generation)return;
    modelState='ready';
    async function scan(){
      if(token!==generation)return;
      try{
        if(video.readyState>=2){
          const found=await model.detect(video,25,.53);
          if(token!==generation)return;
          detections=found;signals=cameraSignals(found,video.videoWidth,video.videoHeight);
          scans++;streak=signals.obstacle?streak+1:0;
          windows.busy+=Number(signals.people>=4);
          windows.traffic+=Number(signals.vehicles>0);
          windows.obstacles+=Number(streak>=3);
          render();
        }
        timer=setTimeout(scan,1000);
      }catch{if(token===generation){modelState='error';render();}}
    }
    scan();
  }catch{if(token===generation){modelState='error';render();}}
}
function drawBoxes(){
  if(!video.videoWidth)return;
  const rect=canvas.getBoundingClientRect();
  canvas.width=rect.width;canvas.height=rect.height;
  const scale=Math.max(rect.width/video.videoWidth,rect.height/video.videoHeight);
  const left=(rect.width-video.videoWidth*scale)/2, top=(rect.height-video.videoHeight*scale)/2;
  const ctx=canvas.getContext('2d');
  ctx.strokeStyle='#c6ffbb';ctx.fillStyle='#10291f';ctx.lineWidth=2;ctx.font='13px system-ui';
  for(const {bbox:[x,y,w,h],class:kind} of detections){
    const px=left+x*scale,py=top+y*scale;
    ctx.strokeRect(px,py,w*scale,h*scale);
    ctx.fillStyle='#10291f';ctx.fillRect(px,py,ctx.measureText(kind).width+10,19);
    ctx.fillStyle='#e0ffde';ctx.fillText(kind,px+5,py+14);
  }
}
function liveBearing(){
  if(!fix||fix.accuracy>30||heading===undefined)return;
  const distance=([lat,lng])=> Math.hypot((lat-fix.latitude)*111195,(lng-fix.longitude)*103000);
  const nearest=active.coords.reduce((best,p,i)=>distance(p)<distance(active.coords[best])?i:best,0);
  if(distance(active.coords[nearest])>55)return;
  const waypoint=active.coords[Math.min(nearest+1,active.coords.length-1)];
  if(distance(waypoint)<8)return;
  const target=Math.atan2((waypoint[1]-fix.longitude)*103000,(waypoint[0]-fix.latitude)*111195)*180/Math.PI;
  return (target-heading+540)%360-180;
}
function rows(entries){
  const nodes=entries.flatMap(([a,b])=>['dt','dd'].map((tag,i)=>{const node=document.createElement(tag);node.textContent=i?b:a;return node;}));
  $('observations').replaceChildren(...nodes);
}
function render(){
  document.documentElement.lang=zh?'zh-Hant':'en';$('back').href='./?lang='+(zh?'zh':'en');
  put('language',t('繁體中文','English'));put('title',t('Camera walking pilot','相機步行試驗'));
  put('subtitle',t('Central MTR to IFC · Camera guidance and automatic route observations','中環站至國際金融中心 · 相機導航及自動路線觀察'));
  $('ferry').href='ferry.html?lang='+(zh?'zh':'en');
  put('ferry',t('Star Ferry AR walkthrough','天星碼頭 AR 導覽'));
  put('demo',t('Replay the field scenario','播放實地情境'));put('live',t('Try live camera','試用即時相機'));put('stop',t('Stop camera','停止相機'));
  put('observationTitle',t('Camera observations','相機觀察'));put('learnTitle',t('Next walk','下一次步行'));
  put('reset',t('Reset sample learning','重設示範學習'));
  put('privacy',t('Try live camera to opt in for this session. The browser may ask for camera, location and motion access. Frames and movement summaries are processed on this device and discarded when you stop.',
    '試用即時相機即同意本次感測。瀏覽器可能要求相機、定位及動作權限。影像及移動摘要在此裝置處理，停止後清除。'));
  const isLive=mode==='live', isDemo=mode==='demo', opening=mode==='opening';
  $('live').disabled=isLive||opening;$('stop').hidden=!(isLive||opening);
  video.hidden=!isLive;$('scene').hidden=isLive;canvas.hidden=!isLive;
  $('barrier').hidden=!(isDemo&&stage===1);
  put('mode',isLive?t('Live camera','即時相機'):isDemo?t('Simulated field scenario','模擬實地情境'):t('Central route preview','中環路線預覽'));
  put('scan',isLive?(modelState==='ready'?t('AI scanning','AI 掃描中'):modelState==='error'?t('AI unavailable','AI 暫不可用'):t('Loading AI','載入 AI')):isDemo?t('Automatic playback','自動播放'):'');
  const angle=isLive&&streak<3?liveBearing():undefined;
  $('guide').hidden=!(isDemo||angle!==undefined);
  $('guide').style.transform='rotate('+(isDemo?(stage>=2?-55:0):angle||0)+'deg)';
  if(isDemo){
    put('direction',stage<2?t('Continue toward ','繼續前往 ')+name(observed):t('Detour via ','改道經 ')+name(alternative));
    put('directionDetail',stage===0?t('Follow the arrow toward the connection.','跟隨箭嘴前往接駁處。'):stage===1?t('Barrier detected in the route corridor. Checking the alternate path.','路線前方發現障礙，正在檢查替代路線。'):t('Avoiding the blocked connection in this scenario.','在此情境中避開受阻接駁處。'));
    rows([
      [t('Crowding','擠迫情況'),stage===1?t('5 people in view','畫面內有 5 人'):t('2 people in view','畫面內有 2 人')],
      [t('Width and obstruction','通道寬度與障礙'),stage===1?t('Barrier across the path · insufficient clearance','障礙橫跨通道 · 淨空不足'):t('Open corridor','通道暢通')],
      [t('Traffic exposure','車流暴露'),t('Separated from moving traffic in this scene','此情境與行駛車流分隔')],
      [t('Wheelchair access','輪椅通行'),stage===1?t('Step-free connection blocked','無梯級接駁受阻'):t('Step-free candidate in this example','此例中的無梯級候選路線')],
    ]);
    put('note',stage>=2?t('The blockage was added automatically to the sample learning history.','阻塞已自動加入示範學習紀錄。'):t('Simulated scene observations.','模擬情境觀察。'));
  }else if(isLive){
    put('direction',streak>=3?t('Possible obstruction ahead','前方可能有障礙'):angle!==undefined?t('Reference direction toward IFC','前往國際金融中心的參考方向'):t('Point the rear camera ahead','將後置相機朝向前方'));
    put('directionDetail',streak>=3?t('Check the path. Illustrative alternative: ','請檢查通道。示意替代路線：')+name(selectRoute({},active.id)):angle!==undefined?t('Compass overlay on an illustrative path. Check signs and conditions around you.','示意路線的指南針提示。請查看現場指示及通行情況。'):t('The reference arrow needs a compass and a good location fix near the Central pilot route.','參考箭嘴需要指南針及中環試驗路線附近的良好定位。'));
    const movement=telemetry.summary();
    rows([
      [t('Crowding signal','擠迫訊號'),signals?signals.people+t(' detected people in this frame',' 名畫面中偵測到的人'):t('Waiting for detections','等候辨識')],
      [t('Traffic signal','車流訊號'),signals?signals.vehicles+t(' detected vehicles or bicycles',' 輛偵測到的汽車或單車'):t('Waiting for detections','等候辨識')],
      [t('Obstruction signal','障礙訊號'),streak>=3?t('Repeated object detection in centre foreground','在畫面前方中央重複偵測到物件'):t('No persistent object signal','尚無持續物件訊號')],
      [t('Position and pace','位置與速度'),movement.speed===null?t('Waiting for a reliable speed fix','等候可靠速度定位'):movement.speed.toFixed(2)+' m/s'],
      [t('Movement and pauses','移動與停頓'),movement.movingSeconds+movement.stoppedSeconds>0
        ?Math.round(movement.movingSeconds)+t(' s moving · ',' 秒移動 · ')+Math.round(movement.stoppedSeconds)+t(' s paused',' 秒停頓')
        :t('Waiting for speed samples','等候速度樣本')],
      [t('Phone movement','手機動作'),movement.motion===null?t('Motion signal unavailable or pending','尚無動作訊號'):movement.motion.toFixed(1)+t(' m/s² · phone acceleration',' 米／秒² · 手機加速度')],
      [t('Large heading changes','大幅方向變化'),heading===undefined?t('Compass signal unavailable or pending','尚無指南針訊號'):movement.turns+t(' possible turns',' 次可能轉向')],
      [t('Width and wheelchair access','寬度與輪椅通行'),t('Unmeasured · needs calibrated depth and path data','尚未量測 · 需要校準深度及通道資料')],
    ]);
    put('note',scans?t('Session scans ','本次掃描 ')+scans+' · '+t('busy frames ','擠迫畫面 ')+windows.busy+' · '+t('vehicle frames ','車輛畫面 ')+windows.traffic+' · '+t('obstruction frames ','障礙畫面 ')+windows.obstacles:t('People and vehicle counts describe the camera view.','人數及車輛數只描述相機視野。'));
    drawBoxes();
  }else{
    put('direction',mode==='error'?t('Camera unavailable','相機暫不可用'):opening?t('Waiting for camera access','等候相機權限'):t('Start the scenario or open the camera','播放情境或開啟相機'));
    put('directionDetail',mode==='error'?t('Check camera permissions and use HTTPS or localhost.','請檢查相機權限並使用 HTTPS 或 localhost。'):t('Watch a barrier appear, a detour open and the next route update.','觀看障礙出現、改道及下一次路線更新。'));
    rows([]);put('note','');
  }
  const next=selectRoute(history), count=(history.lift||0)+(history.covered||0);
  put('learning',name(next)+' · '+count+t(' simulated blockages learned',' 次已學習的模擬阻塞')+(storageOK?' · '+t('saved in this browser','儲存於此瀏覽器'):' · '+t('this session only','只限本次瀏覽')));
}
$('demo').onclick=play;$('live').onclick=live;
$('stop').onclick=()=>{stop();render();};
$('reset').onclick=()=>{stop();history={};save();render();};
$('language').onclick=()=>{zh=!zh;render();};
window.addEventListener('pagehide',()=>stop());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='live'||mode==='opening')){stop();render();}});
window.addEventListener('resize',()=>{if(mode==='live')drawBoxes();});
render();
