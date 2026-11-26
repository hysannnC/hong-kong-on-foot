import {comparison,disposeComparison} from './comparison.mjs';
const app=document.getElementById('app');
let zh=new URLSearchParams(location.search).get('lang')==='zh';
let phase='welcome', demo=true, step=0, timer=null, watch=null, started=0, ended=0;
let motionSamples=0, rotationSamples=0, gpsSamples=0, lastMotion=0, motionEnergy=0, rotationPeak=0;
let quietSince=0, paused=false, photo='', photoTime=0, events=[], reason='', status='', gaps=0;
let recordedPoints=[];
let hiddenAt=0, lastFix=null, gpsTrail=[];
const t=(en,tc)=>zh?tc:en;
function el(tag,content=[],cls=''){
  const node=document.createElement(tag);if(cls)node.className=cls;node.append(...[content].flat());return node;
}
function button(label,fn,primary=false){const b=el('button',label,primary?'primary':'');b.type='button';b.onclick=fn;return b;}
function actions(...items){return el('div',items,'actions');}
function scene(){return el('div',[el('div',[],'road'),el('div',[],'build'),el('div',[],'build b'),el('div',[],'walker s'+step),el('div',t('Central MTR · IFC','中環站 · 國際金融中心'),'scene-label')],'scene');}
function signal(label,value){return el('div',[el('strong',label),el('span',value)],'signal');}
function reset(){
  cleanup();if(photo)URL.revokeObjectURL(photo);
  photo='';events=[];recordedPoints=[];reason='';status='';step=0;motionSamples=0;rotationSamples=0;gpsSamples=0;
  motionEnergy=0;rotationPeak=0;quietSince=0;paused=false;lastMotion=0;gaps=0;lastFix=null;gpsTrail=[];hiddenAt=0;
}
function event(kind,detail,at=Date.now()){events.push({kind,detail,at});}
async function start(real=false){
  reset();demo=!real;phase='walk';started=Date.now();render();
  if(demo)return;
  if(window.DeviceMotionEvent){
    try{
      const permission=typeof DeviceMotionEvent.requestPermission==='function'?await DeviceMotionEvent.requestPermission():'granted';
      if(permission==='granted')window.addEventListener('devicemotion',onMotion);
      else status=t('Motion permission declined. GPS and photos are still available.','動作權限未獲批准。仍可使用 GPS 及相片。');
    }catch{status=t('Motion sensing unavailable in this browser.','此瀏覽器無法提供動作感測。');}
  }else status=t('Motion sensing unavailable on this device.','此裝置無法提供動作感測。');
  if(phase!=='walk')return;
  if(navigator.geolocation)watch=navigator.geolocation.watchPosition(onGPS,()=>{
    status=t('Location unavailable. Motion and photo reporting can continue.','無法取得定位。仍可使用動作感測及相片記錄。');render();
  },{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  timer=setInterval(()=>{if(phase==='walk')render();},2000);render();
}
function onMotion(e){
  if(phase!=='walk'||document.hidden||Date.now()-lastMotion<150)return;
  lastMotion=Date.now();
  const a=e.acceleration;
  if(a&&[a.x,a.y,a.z].every(Number.isFinite)){
    motionSamples++;
    const energy=Math.hypot(a.x,a.y,a.z);motionEnergy=energy;
    if(energy<.2){
      if(!quietSince)quietSince=Date.now();
      if(Date.now()-quietSince>12000&&!paused){paused=true;event('pause',t('Phone motion became quiet. Reason unconfirmed.','手機動作變得平靜，原因尚待確認。'),quietSince);}
    }else{quietSince=0;paused=false;}
  }
  const r=e.rotationRate;
  if(r&&[r.alpha,r.beta,r.gamma].some(Number.isFinite)){
    rotationSamples++;rotationPeak=Math.max(rotationPeak,Math.hypot(r.alpha||0,r.beta||0,r.gamma||0));
  }
}
function onGPS({coords,timestamp}){
  if(phase!=='walk'||document.hidden)return;
  gpsSamples++;lastFix={lat:coords.latitude,lng:coords.longitude,accuracy:coords.accuracy,time:timestamp};
  recordedPoints.push(lastFix);
  if(recordedPoints.length>10000)recordedPoints.shift();
  if(coords.accuracy<=30){
    gpsTrail.push(lastFix);if(gpsTrail.length>600)gpsTrail.shift();
    const n=gpsTrail.length;
    if(n>=3){
      const [a,b,c]=gpsTrail.slice(-3), scale=111195;
      const distance=(p,q)=>Math.hypot((p.lat-q.lat)*scale,(p.lng-q.lng)*scale*Math.cos(p.lat*Math.PI/180));
      if(c.time-a.time<60000&&distance(a,b)>25&&distance(a,c)<10&&!events.some(e=>e.kind==='backtrack'))event('backtrack',t('Possible return toward an earlier position.','可能回到較早的位置。'));
    }
  }
}
function cleanup(){
  clearInterval(timer);timer=null;
  if(watch!==null)navigator.geolocation.clearWatch(watch);
  watch=null;window.removeEventListener('devicemotion',onMotion);
}
function finish(){
  cleanup();ended=Date.now();phase='review';render();
}
function advance(){
  step++;
  if(step===1)event('pause',t('Motion drops and position stays near a junction for 42 seconds.','動作減少，位置在路口附近停留了 42 秒。'));
  if(step===2)event('backtrack',t('Position returns 35 metres. Phone rotation changes during the same interval.','位置折返約 35 米，同時手機旋轉訊號改變。'));
  if(step>=3){finish();return;}render();
}
function takePhoto(){
  const input=el('input');input.type='file';input.accept='image/*';input.setAttribute('capture','environment');
  input.onchange=()=>{
    const file=input.files?.[0];if(!file)return;
    if(!file.type.startsWith('image/')){status=t('Choose an image file.','請選擇圖片。');render();return;}
    if(photo)URL.revokeObjectURL(photo);photo=URL.createObjectURL(file);photoTime=Date.now();
    event('photo',t('Photo attached to this moment.','已在此刻附上相片。'));render();
  };input.click();
}
function photoBlock(){
  if(!photo)return [];
  const img=el('img',[],'photo');img.src=photo;img.alt=t('Your optional report photo','你的選填報告相片');
  return [img,button(t('Remove photo','移除相片'),()=>{URL.revokeObjectURL(photo);photo='';events=events.filter(e=>e.kind!=='photo');render();})];
}
const choices=()=>[
  ['sign',t('Couldn’t find the way','找不到方向')],
  ['barrier',t('Path was difficult to use','路線難以通行')],
  ['personal',t('Personal stop or change of plan','個人停留或改變計劃')],
  ['unsure',t('Something else / unsure','其他／不確定')],
];
function welcome(){
  return [
    el('p',t('CENTRAL MTR TO IFC','中環站至國際金融中心'),'eyebrow'),
    el('h1',t('Just walk. Let your phone notice.','開始步行，讓手機幫你留意。')),
    el('p',t('Start once. Walk as you normally would. At the end, confirm a moment the agent noticed with one tap.','按一次開始，照平常方式走。結束後，只需點一下，確認代理留意到的情況。'),'muted'),
    scene(),
    Object.assign(el('a',t('3D footbridge walkthrough','三維行人天橋導覽'),'map-link'),{href:'bridge.html?lang='+(zh?'zh':'en')}),
    Object.assign(el('a',t('Star Ferry AR walkthrough','天星碼頭 AR 導覽'),'map-link'),{href:'ferry.html?lang='+(zh?'zh':'en')}),
    Object.assign(el('a',t('Open camera navigation pilot','開啟相機導航試驗'),'map-link'),{href:'ar.html?lang='+(zh?'zh':'en')}),
    actions(button(t('Play the 1-minute demo','播放一分鐘示範'),()=>start(),true),button(t('Try with my phone','用我的手機試用'),()=>{phase='permission';render();})),
    el('p',t('Optional photos help explain unclear signs or obstacles.','你也可以拍照，補充不清晰的指示或障礙。'),'small muted')
  ];
}
function permission(){
  return [el('p',t('ON YOUR PHONE','在你的手機上'),'eyebrow'),el('h1',t('One start. Fewer questions.','按一次開始，減少填寫。')),
    el('p',t('Allow location and motion if asked. We look for changes in movement and position, then ask about an uncertain moment after your walk.','如出現提示，請選擇是否允許定位和動作感測。我們會留意動作及位置變化，步行後才詢問不確定的情況。')),
    el('p',t('Keep this page open and the screen on. Recording pauses when the page is hidden. You can take a photo whenever you are stopped.','請保持頁面開啟和螢幕亮著。頁面隱藏時會暫停記錄。停下來時可隨時拍照。'),'muted'),
    el('p',t('This prototype keeps the session and photos in memory on this device. Leaving or resetting discards them.','本原型只在此裝置的記憶體暫存行程及相片。離開或重設後會清除。'),'small muted'),
    actions(button(t('Start my walk','開始我的步行'),()=>start(true),true),button(t('Back','返回'),()=>{phase='welcome';render();}))];
}
function walk(){
  const signals=demo?[
    signal(t('Accelerometer','加速度計'),step? t('Low movement during pause','停留時動作減少'):t('Movement signal','動作訊號')),
    signal(t('Gyroscope','陀螺儀'),step===2?t('Phone rotation changes','手機旋轉改變'):t('Listening','感測中')),
    signal(t('GPS','GPS'),step===2?t('Possible backtrack','可能折返'):t('Position and timing','位置及時間')),
  ]:[
    signal(t('Acceleration samples','加速度樣本'),motionSamples?String(motionSamples):t('Waiting / unavailable','等候中／不可用')),
    signal(t('Rotation samples','旋轉樣本'),rotationSamples?String(rotationSamples):t('Waiting / unavailable','等候中／不可用')),
    signal(t('GPS fixes','GPS 定位'),String(gpsSamples)),
  ];
  return [el('div',t(demo?'SIMULATED WALK':'RECORDING WHILE OPEN',demo?'模擬步行':'頁面開啟時記錄'),'badge'),
    el('h1',t(step===1?'A pause at the junction.':step===2?'A change of direction.':'Walk your usual way.',step===1?'路口前停了一會。':step===2?'方向改變了。':'照你平常方式走。')),
    scene(),el('div',signals,'signals'),
    el('p',t(demo?'The demo illustrates signals a phone could observe. Continue to see what the agent asks afterward.':'Keep walking. The agent will ask about possible pauses or backtracking after you finish.',demo?'示範展示手機可能觀察到的訊號。繼續看看代理會在結束後問甚麼。':'繼續步行，代理會在結束後詢問可能的停留或折返。'),'muted'),
    ...(status?[el('p',status,'small muted')]:[]),
    ...photoBlock(),
    actions(button(t('Take a photo · optional','拍照 · 選填'),takePhoto),
      button(t(demo?(step===2?'Finish demo walk':'Continue demo'):'Finish walk',demo?(step===2?'結束示範步行':'繼續示範'):'結束步行'),demo?advance:finish,true))
  ];
}
function review(){
  const noticed=events.some(e=>e.kind==='pause'||e.kind==='backtrack');
  return [el('p',t('AFTER YOUR WALK','步行結束後'),'eyebrow'),
    el('h1',t(noticed?'What happened here?':'Anything worth sharing?',noticed?'當時發生了甚麼？':'有甚麼想分享嗎？')),
    el('p',t(noticed?'The agent noticed a possible pause or return along the route. A quick answer helps explain it.':'No clear pause or backtrack was detected. You can still share a photo or finish.',noticed?'代理留意到可能的停留或折返。簡單回答即可幫助解釋。':'未偵測到明顯停留或折返。你仍可分享相片或結束。'),'muted'),
    ...photoBlock(),
    actions(...choices().map(([key,label])=>button((reason===key?'✓ ':'')+label,()=>{reason=key;phase='story';render();},false)),
      button(t('Add a photo','加入相片'),takePhoto),
      button(t('Skip and see the result','略過並查看結果'),()=>{phase='story';render();})),
  ];
}
function story(){
  const relevant=reason==='sign'||reason==='barrier';
  return [el('p',t('FROM A WALK TO BETTER GUIDANCE','從一次步行到改善導航'),'eyebrow'),
    el('h1',t('Your walk tells a story.','你的步行經歷有價值。')),
    el('div',[
      el('div',[el('strong',t('Observed by the phone','手機觀察到的情況')),
        el('p',events.filter(e=>e.kind!=='photo').map(e=>demo?(e.kind==='pause'?t('Motion drops and position stays near a junction for 42 seconds.','動作減少，位置在路口附近停留了 42 秒。'):e.kind==='backtrack'?t('Position returns 35 metres. Phone rotation changes during the same interval.','位置折返約 35 米，同時手機旋轉訊號改變。'):e.detail):e.detail).join(' ')||t('No clear movement event detected.','未偵測到明確的動作事件。')),
        el('small',t(demo?'Simulated sensor evidence.':'Experimental detection from available samples.',demo?'模擬感測資料。':'根據可用樣本作實驗性偵測。'))]),
      el('div',[el('strong',t('Your explanation','你的解釋')),el('p',choices().find(([k])=>k===reason)?.[1]||t('Skipped · cause remains unknown.','已略過，原因尚未確定。'))]),
      el('div',[el('strong',t('What a planner could do','規劃師可以怎樣使用')),
        el('p',t(reason==='sign'?'Check the sign wording and add a verified landmark or exit cue.':reason==='barrier'?'Check the physical connection and verify a usable alternative for affected walkers.':reason==='personal'?'Keep this event separate from evidence of a route problem.':'Gather more evidence before proposing a route change.',
        reason==='sign'?'核對指示牌用字，加入經核實的地標或出口提示。':reason==='barrier'?'檢查實體接駁，為受影響的行人核實可用替代路線。':reason==='personal'?'將這次事件與路線問題的證據分開處理。':'先蒐集更多證據，再建議路線變更。'))])
    ],'timeline'),
    ...photoBlock(),
    el('p',t(photo?'Photo available for visual review. The demo has no automatic image recognition.':'A phone’s motion cannot establish why someone stopped or whether a route is accessible.',photo?'相片可供目視審閱。本示範尚未接入自動影像辨識。':'手機動作本身無法確定停留原因或路線是否無障礙。'),'small muted'),
    el('div',[
      el('h2',t('Help the original map learn','幫助原有地圖學習')),
      el('p',t(relevant?'With consented walks from more people, planners could see where the same difficulty recurs, review the evidence and improve directions.':'Repeated observations and people’s explanations help planners decide which events deserve a field check.',
        relevant?'在更多行人同意參與後，規劃師可找出反覆出現的困難，審閱證據並改善導航。':'反覆的觀察及行人的解釋，能幫助規劃師決定哪些情況值得實地查核。')),
      el('p',t('This demonstration stays on this device.','本示範資料留在此裝置。'),'small muted'),
    ],'review'),
    ...(demo&&relevant?[el('a',t('Preview this example on the original map','在原有地圖預覽此例子'),'map-link study-finding')]:[]),
    actions(button(t('Compare routes and learn','比較路線並學習'),()=>{phase='compare';render();},true)),
    actions(button(t('Try another walk','再試一次'),()=>{reset();phase='welcome';render();},true)),
    explain(),
  ];
}
function explain(){
  const details=el('details',[el('summary',t('What the sensors can tell us','感測器能告訴我們甚麼')),
    el('p',t('Acceleration describes phone movement. Rotation describes the phone turning. GPS adds position and timing. Together they can flag moments to review. Phone handling and how it is carried can change these signals.','加速度描述手機動作，旋轉描述手機轉動，GPS 補充位置和時間。結合這些訊號可以找出值得檢視的時刻。拿手機的方式也會影響訊號。')),
    el('p',t('Automatic cause classification, step counting, floor detection and continuous background recording would need further development and device testing.','自動原因分類、步數、樓層辨識及持續背景記錄，需要進一步開發及裝置測試。'))]);
  return details;
}
function render(){
  disposeComparison();
  document.documentElement.lang=zh?'zh-Hant':'en';
  document.getElementById('language').textContent=t('繁體中文','English');
  const stages={welcome,permission,walk,review,story};
  const progress=el('div',el('i'), 'progress');
  progress.firstChild.style.width=({welcome:12,permission:20,walk:35+step*15,review:85,story:100,compare:100}[phase])+'%';
  const result=phase==='compare'?comparison({zh,demo,points:recordedPoints,elapsed:(ended-started)/1000,onBack:()=>{phase='story';render();},render}):null;
  app.replaceChildren(el('section',[progress,...(result?result.nodes:stages[phase]())],'paper'));
  if(result)result.mount();
  const link=app.querySelector('.study-finding');
  if(link)link.href='../#'+new URLSearchParams({mode:'planner',lang:zh?'zh':'en',lat:'22.28205',lng:'114.15782',y:'22.28312',x:'114.15818',z:'17',pilot:reason==='sign'?'concourse':'lift',pilotIssue:reason==='sign'?'sign':'lift'});
}
document.getElementById('language').onclick=()=>{zh=!zh;render();};
document.addEventListener('visibilitychange',()=>{
  if(demo||phase!=='walk')return;
  if(document.hidden)hiddenAt=Date.now();
  else if(hiddenAt){gaps++;quietSince=0;paused=false;gpsTrail=[];event('gap',t('Page hidden for '+Math.round((Date.now()-hiddenAt)/1000)+' seconds. Recording gap.','頁面隱藏了 '+Math.round((Date.now()-hiddenAt)/1000)+' 秒，該段記錄有缺漏。'));hiddenAt=0;}
});
window.addEventListener('pagehide',cleanup);
render();
