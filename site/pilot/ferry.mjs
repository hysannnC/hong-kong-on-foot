import {getDetector} from './vision.mjs';
import {cameraSignals} from './ar-model.mjs';

const $=id=>document.getElementById(id);
const photo=$('photo'), video=$('video'), canvas=$('overlay');
const scenes=[
  {id:7,author:'Kamenyaks',license:'3.0',file:'HK_Central_Man_Yiu_Street_footbridge_interior_Dec-2012.JPG',aim:[.49,.59],near:[.44,.92]},
  {id:4,author:'Liasu',license:'4.0',file:'HK_Central_Man_Yiu_Street_footbridge_interior_visitors_龍和道_Lung_Wo_Road_October_2016_DSC.jpg',aim:[.51,.64],near:[.42,.96]},
  {id:6,author:'LEUSMA',license:'4.0',file:'HK_中環_Central_民光街_Man_Yiu_Street_行人天橋_footbridge_visitors_September_2022_Px3_01.jpg',aim:[.53,.66],near:[.52,.96]},
  {id:2,author:'Wocokacl',license:'3.0',file:'HK_Star_Ferry_Central_Piers_facade_Sunday.jpg',aim:[.24,.60],near:[.52,.93]},
];
const steps=[
  ['Approach via the covered connection','沿有蓋接駁通道前往'],
  ['Continue toward the Pier 7 signs','沿七號碼頭指示繼續前行'],
  ['Follow the bridge toward the waterfront','沿行人天橋前往海濱'],
  ['Star Ferry Central · Pier 7','中環天星碼頭 · 七號碼頭'],
];
const key='hkonfoot.ferry.observations.v1';
let history={};
try{history=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
let zh=new URLSearchParams(location.search).get('lang')==='zh';
const t=(en,tc)=>zh?tc:en;
let run=null, frame=0, url='', status='';
const put=(id,value)=>{$(id).textContent=value;};
function labels(){
  document.documentElement.lang=zh?'zh-Hant':'en';
  put('language',t('繁體中文','English'));
  put('eyebrow',t('HONG KONG ON FOOT · AR PILOT','步行香港地圖 · AR 試驗'));
  put('title',t('Connaught Road Central to Star Ferry','干諾道中至天星碼頭'));
  put('intro',t('Follow the IFC footbridge toward Pier 7. Use the archive walkthrough or play a video recorded on this route. After arrival, the agent uses its observations to compare route options.','沿國際金融中心行人天橋前往七號碼頭。可選用歷史相片導覽，或播放沿線實拍影片。抵達後，代理會用觀察結果比較路線選項。'));
  put('start',t('Start photo walkthrough','開始相片導覽'));
  put('choose',t('Play your walking video','播放你的步行影片'));
  put('sourceVideo',t('View a real walk via IFC on YouTube','在 YouTube 觀看經國際金融中心的實拍步行'));
  $('bridge').href='bridge.html?lang='+(zh?'zh':'en');
  put('bridge',t('Open the 3D footbridge demonstration','開啟三維行人天橋示範'));
  put('exit',t('Exit','離開'));put('replay',t('Back to start','返回起點'));
}
function inference(source,model){
  const width=source.videoWidth||source.naturalWidth,height=source.videoHeight||source.naturalHeight;
  const image=document.createElement('canvas');
  image.width=Math.min(width,640);image.height=Math.round(height*image.width/width);
  image.getContext('2d').drawImage(source,0,0,image.width,image.height);
  return model.detect(image,30,.48).then(found=>cameraSignals(found,image.width,image.height));
}
function analyse(source,current,index){
  if(!current.model||current.busy||current.samples.length>=60)return;
  current.busy=Promise.resolve().then(()=>inference(source,current.model)).then(signal=>{
    if(run===current){current.samples.push(signal);current.latest=signal;if(index!==undefined)current.scanned.add(index);}
  }).catch(()=>{current.failed=true;}).finally(()=>{current.busy=null;});
}
function preload(scene){
  const image=new Image();
  image.src='ferry-media/scene-'+scene.id+'.jpg';
  return image.decode().then(()=>image);
}
function start(file){
  stop();
  const current=run={file,samples:[],scanned:new Set(),started:performance.now(),nextScan:0,index:-1,failed:false};
  $('setup').hidden=true;$('report').hidden=true;$('walk').hidden=false;
  photo.hidden=Boolean(file);video.hidden=!file;
  put('mode',file?t('Walking video · prototype','步行影片 · 原型'):t('Photo walkthrough · archival views','相片導覽 · 歷史影像'));
  $('exit').focus();
  current.modelLoad=getDetector().then(model=>{current.model=model;}).catch(()=>{current.failed=true;});
  if(file){
    url=URL.createObjectURL(file);video.src=url;
    // Start inside the user gesture. Muted playback also works on mobile.
    video.play().catch(()=>{if(run===current){stop();put('status',t('This video could not play. Try an MP4 file.','無法播放影片，請試用 MP4 檔案。'));}});
    current.filenameHash=crypto.subtle?file.slice(0,65536).arrayBuffer()
      .then(bytes=>crypto.subtle.digest('SHA-256',bytes))
      .then(hash=>Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')+'-'+file.size)
      .catch(()=>null):null;
  }else{
    current.photos=Promise.all(scenes.map(preload));
    current.photos.catch(()=>{if(run===current){stop();put('status',t('A route photo could not load.','無法載入路線相片。'));}});
  }
  if(run===current)frame=requestAnimationFrame(tick);
}
function stop(){
  run=null;cancelAnimationFrame(frame);video.pause();video.removeAttribute('src');video.load();
  if(url){URL.revokeObjectURL(url);url='';}
  $('walk').hidden=true;$('report').hidden=true;$('setup').hidden=false;
}
function draw(scene,phase,current){
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const source=current.file?video:photo;
  const sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);
  if(!sw||!sh)return;
  const scale=Math.max(width/sw,height/sh);
  const project=([x,y])=>[(width-sw*scale)/2+x*sw*scale,(height-sh*scale)/2+y*sh*scale];
  const near=project(current.file?[.50,.88]:scene.near);
  const far=project(current.file?[.50,.55]:scene.aim);
  const dx=far[0]-near[0],dy=far[1]-near[1],len=Math.hypot(dx,dy);
  const unit=[dx/len,dy/len],normal=[-unit[1],unit[0]];
  ctx.save();
  ctx.shadowColor='#073523';ctx.shadowBlur=5;
  ctx.fillStyle='#33dfa9cc';ctx.beginPath();
  for(const [i,point] of [[0,[near[0]+normal[0]*18,near[1]+normal[1]*18]],[1,[far[0]+normal[0]*3,far[1]+normal[1]*3]],[1,[far[0]-normal[0]*3,far[1]-normal[1]*3]],[1,[near[0]-normal[0]*18,near[1]-normal[1]*18]]]){
    if(i)ctx.lineTo(...point);else ctx.moveTo(...point);
  }
  ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#e4fff0';ctx.lineCap='round';ctx.lineJoin='round';
  for(const offset of [0,.29,.58]){
    const f=.1+(offset+phase*.20)% .72,size=24*(1-f)+4;
    const x=near[0]+dx*f,y=near[1]+dy*f;
    ctx.lineWidth=Math.max(2,(1-f)*4);ctx.beginPath();
    ctx.moveTo(x-unit[0]*size+normal[0]*size,y-unit[1]*size+normal[1]*size);
    ctx.lineTo(x+unit[0]*size,y+unit[1]*size);
    ctx.lineTo(x-unit[0]*size-normal[0]*size,y-unit[1]*size-normal[1]*size);ctx.stroke();
  }
  ctx.restore();
}
function tick(now){
  const current=run;
  if(!current)return;
  const progress=current.file?(Number.isFinite(video.duration)?video.currentTime/video.duration:0):Math.min(1,(now-current.started)/22000);
  const index=Math.min(3,Math.floor(progress*4));
  const scene=scenes[index];
  if(current.index!==index){
    current.index=index;
    photo.src='ferry-media/scene-'+scene.id+'.jpg';
    const credit=$('credit');credit.hidden=Boolean(current.file);
    credit.href='https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(scene.file);
    credit.textContent=scene.author+' · CC BY-SA '+scene.license;
    put('direction',steps[index][zh?1:0]);
    put('sub',current.file?t('Illustrative overlay on your clip','影片上的示意導航'):t('Connaught Road Central → IFC → Star Ferry','干諾道中 → 國際金融中心 → 天星碼頭'));
  }
  if(current.file&&video.readyState>=2&&video.currentTime>=current.nextScan&&current.model&&!current.busy){
    current.nextScan=video.currentTime+1.25;analyse(video,current);
  }else if(!current.file&&photo.complete&&photo.naturalWidth&&!current.scanned.has(index)&&!current.failed)analyse(photo,current,index);
  $('progress').value=progress;
  put('scan',current.latest?t('AI scan · ','AI 掃描 · ')+current.latest.people+t(' people in frame',' 人在畫面內')+(current.latest.vehicles?' · '+current.latest.vehicles+t(' vehicles in view',' 輛車在畫面內'):'')+(current.latest.obstacle?t(' · possible foreground obstruction',' · 前景可能有障礙'):''):current.failed?t('AI scan unavailable','AI 掃描暫不可用'):t('Preparing automatic scan','正在準備自動掃描'));
  draw(scene,progress,current);
  if((current.file&&video.ended)||progress>=1){finish(current);return;}
  frame=requestAnimationFrame(tick);
}
async function finish(current){
  put('scan',t('Assessing route observations','正在評估路線觀察'));
  let timeout;
  try{
    await Promise.race([(async()=>{
      await current.modelLoad;
      await current.busy;
      if(!current.file&&current.model){
        const images=await current.photos;
        for(const [index,image] of images.entries()){
          if(run!==current)break;
          if(!current.scanned.has(index)){analyse(image,current,index);await current.busy;}
        }
      }else if(current.file&&current.model&&!current.samples.length&&video.readyState>=2){
        analyse(video,current);await current.busy;
      }
    })(),new Promise(resolve=>{timeout=setTimeout(resolve,12000);})]);
  }catch{current.failed=true;}finally{clearTimeout(timeout);}
  if(run!==current)return;
  const id=current.file?await current.filenameHash:'commons-footbridge-v1';
  if(run!==current)return;
  const samples=current.samples.slice();
  const duplicate=Boolean(id&&Object.hasOwn(history,id));
  if(id&&samples.length&&!duplicate){
    history[id]={frames:samples.length,busy:samples.filter(s=>s.people>=4).length};
    try{localStorage.setItem(key,JSON.stringify(history));}catch{}
  }
  stop();$('setup').hidden=true;$('report').hidden=false;
  put('done',t('WALKTHROUGH COMPLETE · AUTOMATIC ASSESSMENT','導覽完成 · 自動評估'));
  put('reportTitle',t('What the route learned','路線學到了甚麼'));
  const count=samples.length;
  put('evidence',count?t('Analysed ','已分析 ')+count+t(' frames. Peak visible people: ',' 個畫面。畫面最高人數：')+Math.max(...samples.map(s=>s.people))+t('. Frames with vehicles: ','。有車輛的畫面：')+samples.filter(s=>s.vehicles).length+t('. Possible foreground obstructions: ','。可能有前景障礙：')+samples.filter(s=>s.obstacle).length+'.':t('No frames were successfully analysed this run. No new evidence was learned.','本次未能分析任何畫面，沒有新增學習資料。'));
  const prior=Object.values(history);
  const frames=prior.reduce((n,r)=>n+r.frames,0), busy=prior.reduce((n,r)=>n+r.busy,0);
  // Beta(1, 4) update for the chance of a busy frame, using media-level deduplication.
  const estimated=(1+busy)/(5+frames);
  const profiles=[
    [t('General walking','一般步行'),2],
    [t('Prefer a quieter connection','偏好較少人流'),7],
    [t('Wheelchair or step-free travel','輪椅或無梯級出行'),null],
  ];
  const results=$('recommendations');results.replaceChildren();
  for(const [label,weight] of profiles){
    const row=document.createElement('div');row.className='result';
    const heading=document.createElement('h2');heading.textContent=label;
    const text=document.createElement('p');
    text.textContent=weight===null?t('Keep step-free verification as a requirement. Camera detections cannot determine clearance, slope or lift availability.','必須核實無梯級通道。相機偵測無法判定淨空、斜度或升降機運作狀態。'):
      t('Initial candidate: IFC footbridge. Updated candidate: ','初始候選：國際金融中心行人天橋。更新候選：')+
      (weight*estimated>2?t('quieter alternative for review','較少人流的替代路線，待核實'):t('IFC footbridge','國際金融中心行人天橋'))+
      t(' · estimated busy-frame rate ',' · 估計擠迫畫面比率 ')+Math.round(estimated*100)+'%';
    row.append(heading,text);results.append(row);
  }
  put('limits',t('Prototype scores use illustrative route costs. People counts describe the camera view. This browser holds aggregate evidence from ','原型以示意路線成本評分。人數只反映相機視野。此瀏覽器有來自 ')+prior.length+t(' distinct media sources.',' 個不同影像來源的匯總資料。')+(duplicate?t(' This replay was already counted.',' 此影像已計入。'):''));
  $('reportTitle').focus();
}
$('language').onclick=()=>{zh=!zh;labels();};
$('start').onclick=()=>start();
$('file').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)start(file);};
$('exit').onclick=stop;$('replay').onclick=stop;
window.addEventListener('pagehide',stop);
labels();
