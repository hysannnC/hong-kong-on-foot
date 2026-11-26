import {mountFieldStudy} from './bridge-field.mjs?v=53';
import {drawPhone} from './bridge-phone.mjs';
import {buildWorld} from './bridge-world.mjs';
import {rememberTrip,tripMapURL} from './trip-journey.mjs?v=53';
import {duration,crowd as crowdArea,turnStart,turnEnd,notice,position,sensorTimeline} from './bridge-model.mjs';

const $=id=>document.getElementById(id);
const canvas=$('view'), scan=sensorTimeline();
const embedded=new URLSearchParams(location.search).get('embed')==='1';
if(embedded){
  document.body.classList.add('embedded');
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||!['en','zh'].includes(event.data?.studyLanguage))return;
    zh=event.data.studyLanguage==='zh';labels();paint();
  });
}
const field=mountFieldStudy({pause,complete(trip){
  if(!rememberTrip(trip)){
    put('journey-status',t('This browser could not open the trip summary.','此瀏覽器無法開啟行程摘要。'));
    return;
  }
  const lang=zh?'zh':'en';
  if(embedded)parent.postMessage({tripCompleted:true,studyLanguage:lang},location.origin);
  else location.replace(new URL('../'+tripMapURL(lang),location.href));
}});
const t=(en,tc)=>zh?tc:en;
let zh=new URLSearchParams(location.search).get('lang')==='zh';
let world, playing=false, time=0, last=0, raf=0, recorder, recordingUrl='', recordingCanvas;
let exporting=false;
const put=(id,value)=>{$(id).textContent=value;};
const seconds=value=>Math.floor(value/60)+':'+String(Math.floor(value)%60).padStart(2,'0');
function labels(){
  document.documentElement.lang=zh?'zh-Hant':'en';
  field.labels(zh?'zh':'en');
  put('language',t('繁體中文','English'));put('title',t('Inside the IFC footbridge','走進國際金融中心行人天橋'));
  put('subtitle',t('Connaught Road Central → Star Ferry Pier 7 · Wheelchair viewpoint','干諾道中 → 天星碼頭七號碼頭 · 輪椅視角'));
  put('restart',t('Restart','重新播放'));
  put('full',t('Full screen','全螢幕'));put('record',t('Record video','錄製影片'));
  put('method',t('Illustrative 3D reconstruction. Camera detections, notice and dates are simulated. The alternative ramp and its measurements are illustrative.','示意三維重建。相機辨識、告示及日期均為模擬。替代斜道及其量度只作示範。'));
  put('download',t('Download video','下載影片'));
  put('openMap',t('View trip summary','查看行程摘要'));

}
function paint(updatePage=true){
  if(!world)return;
  const {renderer,camera,animate}=world;
  const end=time>=duration;
  if(updatePage)$('openMap').hidden=!end||exporting;
  const target=exporting?recordingCanvas:canvas;
  const w=exporting?1280:Math.min(1280,canvas.clientWidth);
  const h=exporting?720:Math.round(w*canvas.clientHeight/canvas.clientWidth);
  if(!w||!h)return;
  if(target.width!==w||target.height!==h){target.width=w;target.height=h;}
  const size=renderer.getSize(camera.position.clone());
  if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const sample=scan[Math.min(scan.length-1,Math.floor((time+.0001)/.4))];
  const pose=position(time,sample.confirmed);
  camera.position.set(pose.x,pose.y+1.17+Math.sin(time*4)*.005,-pose.s);
  const yaw=pose.heading;
  const ease=x=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u);};
  const lookY=pose.y+.31+.47*ease((time-turnStart+4)/2.3)*(1-ease((time-turnEnd+1)/2.4));
  camera.lookAt(pose.x+4*Math.sin(yaw),lookY,-pose.s-4*Math.cos(yaw));
  animate(time);
  const passing=sample.confirmed&&pose.s<crowdArea.s+5;
  const guidance=end?[t('Ramp entrance reached','已到達斜道入口')]:
    sample.read&&time<turnEnd?[t('Turn back','請掉頭'),t('for the ramp','前往斜道')]:
    sample.read?[t('Follow the detour','沿繞道路線'),t('to the ramp','前往斜道')]:
    passing?[t('Slow down','請放慢速度'),t('Pass through the centre','從中央通道繞行')]:
    [t('Continue to the lift','繼續前往升降機')];
  const warning=sample.read&&time<turnEnd?t('Lift A closed','升降機 A 暫停服務'):
    passing?t('Crowd at the bridge edge','天橋邊有人群'):
    end?'':t('Pier 7 · Star Ferry','天星小輪 · 七號碼頭');
  const detector=time>=turnStart-4&&time<turnStart?
    {point:[notice.x,1.13,notice.s],lift:true,text:sample.read?t('Notice read','已讀取告示'):t('Reading notice','正在讀取告示')}:
    pose.s<22?{point:[-2.05,.96,crowdArea.s],text:sample.confirmed?t('Crowd detected','已偵測到人群'):t('Scanning ahead','正在掃描前方')}:null;
  const route=sample.read&&time>=turnStart?2:sample.confirmed?1:0;
  drawPhone(target.getContext('2d'),world,{time,route,guidance,warning,detector,lang:zh?'zh':'en',end});
  if(recorder?.state==='recording'&&!exporting){
    const ctx=recordingCanvas.getContext('2d'),scale=Math.min(1280/w,720/h);
    ctx.fillStyle='#16251f';ctx.fillRect(0,0,1280,720);
    ctx.drawImage(canvas,(1280-w*scale)/2,(720-h*scale)/2,w*scale,h*scale);
  }
  if(updatePage){
    field.replay(time);
    const copy=[warning,...guidance].filter(Boolean).join('. ');
    if($('guidance').textContent!==copy)put('guidance',copy);
    updatePlayback();
  }
}
function updatePlayback(){
  put('play',playing?t('Pause','暫停'):time>0&&time<duration?t('Resume','繼續'):t('Play walkthrough','播放導覽'));
  $('seek').value=time;
  put('time',seconds(time)+' / '+seconds(duration));
}
function pause(){
  playing=false;cancelAnimationFrame(raf);
}
function tick(now){
  if(!playing)return;
  if(last)time=Math.min(duration,time+Math.min(.25,(now-last)/1000));
  last=now;
  if(time>=duration){
    const recording=recorder?.state==='recording';
    pause();paint();finishCapture();
    if(!recording)field.finishReplay();
    return;
  }
  paint();raf=requestAnimationFrame(tick);
}
function start(){
  if(time>=duration){time=0;}
  last=0;playing=true;paint();raf=requestAnimationFrame(tick);
}
function finishCapture(){if(recorder?.state==='recording')recorder.stop();}
function recordRealtime(){
  if(!window.MediaRecorder||!canvas.captureStream){put('exportStatus',t('Video recording is unavailable in this browser.','此瀏覽器無法錄製影片。'));return;}
  if(recorder?.state==='recording'){finishCapture();return;}
  recordingCanvas=document.createElement('canvas');recordingCanvas.width=1280;recordingCanvas.height=720;
  const stream=recordingCanvas.captureStream(30);
  try{
    const mimeType=['video/mp4','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    recorder=new MediaRecorder(stream,mimeType?{mimeType,videoBitsPerSecond:3500000}:undefined);
  }catch{stream.getTracks().forEach(track=>track.stop());put('exportStatus',t('Video recording is unavailable.','無法錄製影片。'));return;}
  const chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{
    stream.getTracks().forEach(track=>track.stop());
    if(recordingUrl)URL.revokeObjectURL(recordingUrl);
    const type=recorder.mimeType;recordingUrl=URL.createObjectURL(new Blob(chunks,{type}));
    const link=$('download');link.href=recordingUrl;link.download='ifc-footbridge-walkthrough.'+(type.includes('mp4')?'mp4':'webm');link.hidden=false;
    put('exportStatus',t('Video ready','影片已就緒'));put('record',t('Record video','錄製影片'));
  };
  $('download').hidden=true;recorder.start();put('record',t('Stop recording','停止錄製'));put('exportStatus',t('Recording the walkthrough','正在錄製導覽'));
  pause();time=0;start();
}
function setExportControls(disabled){
  for(const id of ['play','restart','record','seek','language','full'])$(id).disabled=disabled;
}
async function exportVideo(){
  if(!window.VideoEncoder||!window.VideoFrame){recordRealtime();return;}
  const width=1280,height=720,fps=90;
  const requested={codec:'avc1.42002a',width,height,framerate:fps,bitrate:7200000,latencyMode:'quality'};
  let support;
  try{support=await VideoEncoder.isConfigSupported(requested);}catch{}
  if(!support?.supported){recordRealtime();return;}
  const cameraTime=time;
  setExportControls(true);pause();$('download').hidden=true;
  let encoder;
  try{
    const {Muxer,ArrayBufferTarget}=await import('../vendor/mp4-muxer.mjs');
    const target=new ArrayBufferTarget();
    const muxer=new Muxer({target,video:{codec:'avc',width,height},fastStart:'in-memory'});
    let failure;
    encoder=new VideoEncoder({output:(chunk,metadata)=>muxer.addVideoChunk(chunk,metadata),error:error=>{failure=error;}});
    encoder.configure(support.config);
    recordingCanvas=document.createElement('canvas');recordingCanvas.width=width;recordingCanvas.height=height;
    exporting=true;
    const frames=duration*fps;
    for(let index=0;index<frames;index++){
      if(failure)throw failure;
      time=index/(frames-1)*duration;paint(index%60===0||index===frames-1);
      const timestamp=Math.round(index*1000000/fps);
      const frame=new VideoFrame(recordingCanvas,{timestamp,duration:Math.round((index+1)*1000000/fps)-timestamp});
      encoder.encode(frame,{keyFrame:index%120===0});frame.close();
      if(encoder.encodeQueueSize>18)await encoder.flush();
      if(index%32===0){
        put('exportStatus',t('Rendering 90 fps · ','正在輸出 90 fps · ')+Math.round(index/(frames-1)*100)+'%');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    await encoder.flush();
    if(failure)throw failure;
    muxer.finalize();
    if(recordingUrl)URL.revokeObjectURL(recordingUrl);
    recordingUrl=URL.createObjectURL(new Blob([target.buffer],{type:'video/mp4'}));
    const link=$('download');link.href=recordingUrl;link.download='ifc-held-phone-ar-90fps.mp4';link.hidden=false;
    put('exportStatus',t('90 fps MP4 ready','90 fps MP4 已就緒'));
  }catch{
    put('exportStatus',t('90 fps export failed. Trying browser recording.','90 fps 匯出失敗，改用瀏覽器錄製。'));
    exporting=false;recordRealtime();
  }finally{
    if(encoder&&encoder.state!=='closed')encoder.close();
    exporting=false;setExportControls(false);
    if(!playing){time=recorder?.state==='recording'?0:Math.max(cameraTime,duration);paint();}
  }
}

labels();
try{
  $('seek').max=duration;
  world=buildWorld(document.createElement('canvas'));paint();
  $('play').onclick=()=>{if(playing){pause();paint();}else start();};
  $('restart').onclick=()=>{pause();time=0;start();};
  $('openMap').onclick=field.finishReplay;
  $('seek').oninput=e=>{time=Number(e.target.value);paint();};
  $('full').onclick=()=>$('player').requestFullscreen?.().catch(()=>{});
  $('language').onclick=()=>{zh=!zh;labels();paint();};
  $('record').onclick=exportVideo;
  $('record').disabled=true;
  world.peopleReady.then(()=>{$('record').disabled=false;paint();});
  new ResizeObserver(()=>paint()).observe($('player'));
}catch{
  put('guidance',t('This browser could not start the 3D view.','此瀏覽器無法啟動三維畫面。'));
  for(const id of ['play','restart','full','record','seek'])$(id).disabled=true;
}
