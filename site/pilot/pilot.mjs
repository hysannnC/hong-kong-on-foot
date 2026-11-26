import {places, issues, outcomes, profiles, arrivals, sample, summarise, questionFor, traceStats} from './model.mjs';

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let zh=params.has('lang')?params.get('lang')==='zh':navigator.language.startsWith('zh');
let tab='collect', source='sample', profile='all', place='concourse', selectedWalk=sample[0].id;
let session=null, watch=null, tick=null, stalledMessage='', lastSave=false, storageError=false;
const storageKey='hkonfoot.central.walking-study';
let saved=[];
try {
  const entries=JSON.parse(localStorage.getItem(storageKey)||'[]');
  if(Array.isArray(entries)) saved=entries;
} catch { storageError=true; }

const text=(en,tc)=>zh?tc:en;
const name=pair=>pair?.[zh?1:0]||'';
const copy={
  brand:()=>[text('Hong Kong on Foot','步行香港地圖'),el('small',text('步行香港地圖','Hong Kong on Foot'))],
  pilot:()=>text('BEHAVIOURAL STUDY · PROTOTYPE 2.0','步行行為研究 · 2.0 原型'),
  title:()=>text('How people walk Central','人們如何步行穿越中環'),
  intro:()=>text('Follow a walk from Central MTR to IFC. See where people hesitate, change course or need help, and what the original map could learn from it.','從港鐵中環站走到國際金融中心，看看行人在哪裡猶豫、改道或需要協助，以及這些經歷如何改善原有地圖。'),
  area:()=>text('Central MTR – IFC · Illustrative locations','港鐵中環站至國際金融中心 · 示意位置'),
  collect:()=>text('Record a walk','記錄步行'),
  analyse:()=>text('Analyse walks','分析步行'),
  apply:()=>text('Improve the map','改善地圖'),
};

function el(tag, content=[], className='') {
  const node=document.createElement(tag);
  if(className) node.className=className;
  node.append(...[content].flat());
  return node;
}
function btn(label, handler, primary=false) {
  const button=el('button',label,primary?'primary':'');
  button.type='button';
  button.addEventListener('click',handler);
  return button;
}
function actions(...children){return el('div',children,'actions');}
function card(...children){return el('article',children,'card');}
function grid(...children){return el('div',children,'grid');}
function field(label, control){return el('label',[el('span',label),control],'field');}
function check(label, checked, update) {
  const input=el('input');
  input.type='checkbox';
  input.checked=checked;
  input.addEventListener('change',()=>update(input.checked));
  return el('label',[input,el('span',label)],'check');
}
function select(label, options, value, update) {
  const input=el('select');
  input.setAttribute('aria-label',label);
  for(const [key,label] of options) input.append(new Option(label,key));
  input.value=value;
  input.addEventListener('change',()=>update(input.value));
  return field(label,input);
}
const options=object=>Object.entries(object).map(([key,pair])=>[key,name(pair)]);
const placeOptions=()=>Object.entries(places).map(([key,item])=>[key,name(item.name)]);
function noteField(label,value,change) {
  const textarea=el('textarea');
  textarea.rows=2;
  textarea.maxLength=500;
  textarea.value=value||'';
  textarea.addEventListener('input',()=>change(textarea.value));
  return field(label,textarea);
}
function go(next, focus=false) {
  tab=next;
  render();
  if(focus) {
    const heading=$(tab).querySelector('h2');
    heading.tabIndex=-1;
    heading.focus();
  }
}
function duration(seconds) {
  const n=Math.round(seconds);
  return zh?Math.floor(n/60)+' 分 '+n%60+' 秒':Math.floor(n/60)+' min '+n%60+' s';
}
const toMap=(finding='',issue='')=>'../#'+new URLSearchParams({mode:'planner',lang:zh?'zh':'en',lat:'22.28205',lng:'114.15782',y:'22.28312',x:'114.15818',z:'17',...(finding?{pilot:finding,pilotIssue:issue}:{})});
const emptyEvent=()=>({place:'concourse',result:'independent',issue:'',note:''});

function begin(gps, setup) {
  if(session) return;
  lastSave=false;
  stalledMessage='';
  session={id:globalThis.crypto?.randomUUID?.()||String(Date.now()), mode:gps?'gps':'manual', start:Date.now(), points:[], events:[], marks:[], arrival:'arrived', path:'unknown',
    familiar:setup.familiar, profile:setup.profile, intent:setup.intent, event:emptyEvent(), followup:''};
  if(gps && navigator.geolocation && window.isSecureContext) {
    watch=navigator.geolocation.watchPosition(({coords,timestamp})=>{
      if(!session||session.end||document.hidden) return;
      const previous=session.points.at(-1);
      if(previous && timestamp-previous.time<1500) return;
      session.points.push({lat:coords.latitude,lng:coords.longitude,accuracy:coords.accuracy,time:timestamp});
      stalledMessage='';
      updateLive();
    },({code})=>{
      stalledMessage=code===1?'denied':'signal';
      updateLive();
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  } else if(gps) stalledMessage='unavailable';
  tick=setInterval(updateLive,1000);
  render();
}

function updateLive() {
  if(!session || session.end || !$('live-stats')) return;
  const {points,start,mode}=session;
  const count=points.filter(p=>p.accuracy<=30).length;
  $('live-stats').textContent=duration((Date.now()-start)/1000) + (mode==='gps' ? ' · '+count+text(' usable GPS samples',' 個可用的 GPS 位置'):'');
  $('gps-status').textContent={
    denied:text('Location permission was declined. You can continue with manual reports.','定位權限未獲批准。你仍可手動記錄。'),
    signal:text('Waiting for a usable signal. Keep recording or add a manual report.','正在等候可用訊號。你可繼續記錄或手動補充。'),
    unavailable:text('GPS requires HTTPS or localhost and a supported browser. Manual reporting is active.','GPS 需要 HTTPS 或 localhost 及支援的瀏覽器。手動記錄仍可使用。'),
  }[stalledMessage]||'';
}
function stopTracking() {
  if(watch!==null) navigator.geolocation.clearWatch(watch);
  clearInterval(tick);
  watch=null;
  tick=null;
}
function addEvent() {
  const {mark,...fields}=session.event;
  const event={...fields,at:mark??Math.round(((session.end||Date.now())-session.start)/1000)};
  session.events.push(event);
  if(mark!==undefined) session.marks=session.marks.filter(item=>item!==mark);
  session.event={...emptyEvent(),place:event.place};
  render();
}
function finish() {
  stopTracking();
  session.end=Date.now();
  session.stats=traceStats(session.points);
  session.points=[];
  render();
}
function persist(next) {
  try {
    localStorage.setItem(storageKey,JSON.stringify(next));
    storageError=false;
  } catch {storageError=true;}
  saved=next;
}
function saveWalk() {
  const {id, profile, familiar, intent, arrival, path, start, end, events, mode, stats, followup}=session;
  persist([...saved,{id, profile, familiar, intent, arrival, path, seconds:(end-start)/1000, events, mode, stats, followup}]);
  session=null;
  lastSave=true;
  source='local';
  selectedWalk=id;
  profileFilterReset();
  go('analyse',true);
}
function profileFilterReset(){profile='all';}
function formatEvent(event) {
  return name(places[event.place].name)+' · '+name(outcomes[event.result])+(event.issue?' · '+name(issues[event.issue]):'');
}
function eventEditor(s) {
  const e=s.event;
  return [
    el('h3',text('Report a decision point','記錄路線決定點')),
    ...(e.mark===undefined?[]:[el('p',text('Labelling moment at ','標註時間點 ')+duration(e.mark),'notice')]),
    el('div',[
      select(text('Where?','在哪裡？'),placeOptions(),e.place,key=>e.place=key),
      select(text('What did you do?','你當時怎樣做？'),options(outcomes),e.result,key=>e.result=key),
      select(text('What influenced the decision?','甚麼影響當時的決定？'),[['',text('No issue / leave blank','沒有問題／留空')],...options(issues)],e.issue,key=>e.issue=key),
    ],'fields'),
    noteField(text('Optional · What helped you continue?','選填 · 甚麼幫助你繼續前進？'),e.note,value=>e.note=value),
    btn(text('Add this observation','加入這項觀察'),addEvent),
    ...s.events.length?[el('ul',s.events.map((event,index)=>el('li',[
      el('p',formatEvent(event)+' · '+duration(event.at)), ...(event.note?[el('p',event.note,'meta')]:[]),
      btn(text('Remove observation','移除觀察'),()=>{s.events.splice(index,1);render();}),
    ])),'list')]:[],
  ];
}

const setup={profile:'walk',familiar:false,intent:'main'};
const intents={
  main:['IFC main entrance','國際金融中心正門'],
  other:['Another IFC entrance','國際金融中心其他入口'],
  undecided:['IFC, entrance undecided','國際金融中心，未決定入口'],
};
function collect() {
  const heading=el('h2',text('Record a walk','記錄一次步行'));
  const demo=card(el('h3',text('Try the walkthrough','試用示範')),
    el('p',text('Explore ten fictional trips, including someone who avoided a lift, someone who turned back and someone who found their way by asking staff.','探索十次虛構行程，包括避開升降機、折返，以及向職員問路的例子。')),
    btn(text('Explore sample walks','查看示範行程'),()=>{source='sample';profileFilterReset();selectedWalk=sample[0].id;go('analyse',true);}),
    el('p',text('Sample findings and pins are illustrative.','示範發現及標記只作說明。'),'notice'));
  if(!session) return grid(card(heading,
    el('p',text('Use the phone while this page is open, or log observations manually. If you already know a path you avoid, record it as a decision point.','在本頁保持開啟時使用手機定位，或手動記錄。如果有你一向避開的路段，可將它記錄為路線決定點。')),
    el('div',[
      select(text('Intended destination','原定目的地'),options(intents),setup.intent,k=>setup.intent=k),
      select(text('How are you travelling?','你以甚麼方式步行？'),options(profiles),setup.profile,k=>setup.profile=k),
    ],'fields'),
    check(text('I already know this area well','我熟悉這個地區'),setup.familiar,value=>setup.familiar=value),
    el('p',text('GPS is optional. Raw positions stay in memory and are discarded at the end. If you save the walk, its summary, notes and approximate decision points stay in this browser.','GPS 為選填。原始定位只存於記憶體，結束後即清除。儲存行程後，摘要、備註及大概的路線決定點會留在此瀏覽器。'),'meta'),
    actions(btn(text('Start with GPS','以 GPS 開始'),()=>begin(true,setup),true),btn(text('Start manual walk','開始手動記錄'),()=>begin(false,setup)))),demo);

  const s=session;
  const chosen=s.events.find(e=>['blocked','avoided','detour','assisted'].includes(e.result))||s.events.find(e=>e.issue)||s.events[0];
  const followup=name(questionFor(chosen,s.stats?.backtrack));
  const discard=btn(text('Discard walk','捨棄行程'),()=>{stopTracking();session=null;render();});
  if(!s.end) return grid(card(heading,
    el('p',text('Walk in progress','正在記錄步行')),
    Object.assign(el('p'),{id:'live-stats'}),Object.assign(el('p',[],'muted'),{id:'gps-status'}),
    actions(btn(text('Mark a moment','標記此刻'),()=>{
      const elapsed=Math.round((Date.now()-s.start)/1000);
      if(!s.marks.includes(elapsed)) s.marks.push(elapsed);
      render();
    })),
    el('p',s.marks.length+text(' marked moments to label after the walk.',' 個待步行後標註的時間點。'),'meta'),
    ...eventEditor(s),actions(btn(text('Finish and review','結束並檢視'),finish,true),discard)),demo);

  return grid(card(el('h2',text('Review your walk','檢視步行記錄')),
    el('p',duration((s.end-s.start)/1000)),
    ...(s.mode==='gps'?[el('p',s.stats.usable+text(' usable GPS samples',' 個可用 GPS 位置')+' · '+s.stats.gaps+text(' unusable intervals',' 段不可用的定位間隔')),
      ...(s.stats.pace===null?[]:[el('p',text('Estimated pace on usable moving segments ','可用移動路段的估計速度 ')+s.stats.pace.toFixed(2)+' m/s')]),
      ...(s.stats.backtrack?[el('p',text('Possible backtrack from GPS. Confirm the location and reason if you remember.','GPS 顯示可能曾折返。如記得，可確認位置和原因。'),'notice')]:[])]:[]),
    select(text('How did the walk end?','行程如何結束？'),options(arrivals),s.arrival,k=>s.arrival=k),
    select(text('Which path did you use?','你使用哪條路線？'),options(pathsUsed),s.path,k=>s.path=k),
    ...(s.marks.length?[el('h3',text('Label marked moments','標註已記錄的時間點')),
      actions(...s.marks.map(mark=>btn(duration(mark),()=>{
        s.event={...s.event,mark};
        render();
        $('collect').querySelector('select[aria-label="'+text('Where?','在哪裡？')+'"]').focus();
      })))]:[]),
    ...eventEditor(s)),
    el('div',[card(el('h3',text('Agent follow-up','代理追問')),el('p',followup),noteField(text('Your answer · optional','你的回答 · 選填'),s.followup,value=>s.followup=value),
      el('p',text('The prototype picks this question using your report or a possible GPS backtrack.','原型會根據你的報告或 GPS 推測的折返提出問題。'),'meta'),
      actions(btn(text('Save on this device','儲存於此裝置'),saveWalk,true),discard)),demo],'stack'));
}

function currentTrips(){
  return (source==='sample'?sample:saved).filter(trip=>profile==='all'||trip.profile===profile);
}
function metric(label,count) {
  return el('div',[el('strong',String(count)),el('span',label)],'metric');
}
function observationsList(observations) {
  return el('ul',observations.map(({trip,...event})=>el('li',[
    el('p',name(outcomes[event.result])+(event.issue?' · '+name(issues[event.issue]):'')),
    el('p',name(profiles[trip.profile])+' · '+(trip.familiar?text('Familiar with area','熟悉該區'):text('Unfamiliar with area','不熟悉該區')),'meta'),
    ...(event.note?[el('blockquote',zh&&event.zh?event.zh:event.note)]:[]),
  ])),'list');
}
function analyse() {
  const trips=currentTrips();
  const stats=summarise(trips,place);
  const trip=trips.find(item=>item.id===selectedWalk)||trips[0];
  return el('div',[
    card(el('h2',text('Analyse walks','分析步行記錄')),
      ...(lastSave?[el('p',storageError?text('Browser storage is unavailable. This walk is available until you reload.','瀏覽器儲存空間不可用。重新載入前仍可查看此行程。'):text('Walk saved in this browser.','行程已儲存在此瀏覽器。'),'notice')]:[]),
      el('div',Object.entries(arrivals).map(([key,label])=>metric(name(label),trips.filter(trip=>trip.arrival===key).length)),'metrics'),
      el('div',[
        select(text('Evidence source','資料來源'),[['sample',text('Fictional sample walks','虛構的示範行程')],['local',text('Walks on this device','此裝置的行程')]],source,key=>{source=key;lastSave=false;profileFilterReset();render();}),
        select(text('Mobility profile','步行方式'),[['all',text('All profiles','所有方式')],...options(profiles)],profile,key=>{profile=key;render();}),
        select(text('Decision point','路線決定點'),placeOptions(),place,key=>{place=key;render();}),
      ],'fields')),
    grid(card(el('h3',name(places[place].name)),
        el('div',[
          metric(text('Tried this connection','嘗試此接駁處'),stats.attempted),
          metric(text('Avoided before trying','事先避開'),stats.avoided),
          metric(text('Passed independently','自行通過'),stats.independent),
          metric(text('Passed with help','在協助下通過'),stats.assisted),
          metric(text('Detoured or turned back','改道或折返'),stats.interrupted),
        ],'metrics'),
        el('p',trips.length+text(' walks in this view. Counts show distinct walks per outcome. A walk can have more than one outcome at this point.',' 次行程。每種結果按不同的行程計算，同一行程在此地點可有多種結果。'),'meta'),
        stats.observations.length?observationsList(stats.observations):el('p',text('No observations at this point for these filters.','在這些篩選條件下，此地點沒有觀察記錄。')),
        btn(copy.apply(),()=>go('apply',true),true)),
      card(el('h3',text('Review a single trip','檢視個別行程')),
        ...(trip?[select(text('Trip','行程'),trips.map((item,i)=>[String(item.id),text('Trip ','行程 ')+(i+1)+' · '+name(profiles[item.profile])]),String(trip.id),key=>{selectedWalk=trips.find(item=>String(item.id)===key)?.id;render();}),
          ...(trip.intent?[el('p',text('Intended destination · ','原定目的地 · ')+name(intents[trip.intent]))]:[]),
          ...(trip.path?[el('p',text('Path used · ','所用路線 · ')+name(pathsUsed[trip.path]))]:[]),
          el('p',name(arrivals[trip.arrival])+' · '+duration(trip.seconds)),
          ...(trip.stats?.pace?[el('p',text('Estimated moving pace ','估計移動速度 ')+trip.stats.pace.toFixed(2)+' m/s','meta')]:[]),
          ...trip.events.map(event=>el('p',formatEvent(event),'meta')),
          ...(trip.followup?[el('blockquote',trip.followup)]:[]),
          ...(source==='local'?[btn(text('Delete this walk','刪除此行程'),()=>{
            if(!confirm(text('Delete this walk from this device?','從此裝置刪除此行程？'))) return;
            persist(saved.filter(item=>item.id!==trip.id));lastSave=false;render();
          })]:[]),
        ]:[el('p',text('Record a walk to see its outcome here.','記錄一次步行，便可在此查看結果。'))])))], 'stack');
}

const pathsUsed={
  street:['Mainly street level','主要在地面'],
  indoor:['Mainly indoor or underground','主要在室內或地下'],
  bridge:['Mainly elevated walkway','主要在行人天橋'],
  mix:['A mix of levels','經過不同樓層'],
  unknown:['Unsure or did not set out','不確定或未出發'],
};
const improvements={
  sign:['Check the sign wording and add a matching landmark or exit cue at the turn.','檢查指示牌用字，在轉彎提示中加入相符的地標或出口資料。'],
  floor:['Verify the exit and floor, then show the level change in directions.','核實出口和樓層，再在導航指出樓層轉換。'],
  lift:['Check lift access and its operating status. Verify an alternative connection before suggesting it for step-free trips.','核查升降機的可達性及運作狀況。建議無梯級路線前，先核實替代接駁。'],
  step:['Survey the barrier and verify a step-free alternative before changing guidance.','實地查核障礙，核實無梯級替代路線後再更新導航。'],
  crowd:['Check whether the delay recurs at certain times before adjusting travel estimates.','查核延誤是否在特定時段反覆出現，再調整步行時間估算。'],
  rest:['Check nearby resting places and consider showing them along the route.','查核附近的休息點，考慮在路線沿途標示。'],
  preference:['Check the reported comfort feature and consider showing it as a route trade-off.','查核行人提及的舒適設施，考慮將其列作選擇路線時的考量。'],
  other:['Review the report and confirm what happened before proposing a map change.','檢視報告並核實經過，才建議地圖變更。'],
};
function exportSummary(trips) {
  const report={
    study:'Central MTR–IFC', source:source==='sample'?'fictional-sample':'device-recorded',
    mobilityFilter:profile, walks:trips.length,
    arrivalCounts:Object.fromEntries(Object.keys(arrivals).map(key=>[key,trips.filter(trip=>trip.arrival===key).length])),
    decisionPoints:Object.fromEntries(Object.keys(places).map(key=>{
      const {observations,...counts}=summarise(trips,key);
      return [key,counts];
    })),
  };
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=el('a');
  link.href=url;
  link.download='central-walking-study-'+report.source+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function apply() {
  const trips=currentTrips();
  const findings=Object.entries(places).flatMap(([key,location])=>{
    const {issuesByCount}=summarise(trips,key);
    return issuesByCount.map(({issue,count})=>({key,location,issue,count}));
  }).sort((a,b)=>b.count-a.count);
  const result=grid(
    card(el('h2',text('Improve the original map','改善原有地圖')),
      el('p',source==='sample'?text('Fictional sample walks · Proposed changes for demonstration only.','虛構的示範行程 · 建議變更只作示範。'):text('Walks saved on this device · Planner review required.','儲存於此裝置的行程 · 須由規劃師審閱。'),'notice'),
      el('p',text('Each finding shows how many distinct walks reported the issue. Two or more reports in this view flag it for a follow-up check. Review the level, signs or physical barrier in the field before updating directions.','各項發現顯示有多少次不同的行程報告了該問題。在此檢視中有兩份或以上的報告會標記為待跟進。更新導航前，須實地核實樓層、標示或實體障礙。')),
      actions(btn(text('Back to evidence and filters','返回資料及篩選'),()=>go('analyse',true)),
        ...(trips.length?[btn(text('Export summary','匯出摘要'),()=>exportSummary(trips))]:[])),
      el('p',text('The export includes group and decision-point counts. It excludes notes and GPS positions.','匯出資料包括組別和路線決定點的行程數，不含備註或 GPS 位置。'),'meta')),
    el('div',findings.length?findings.map(({key,location,issue,count})=>{
      const link=el('a',text('Preview study pin on original map','在原有地圖預覽研究標記'),'button');
      link.href=toMap(key,issue);
      return card(el('h3',name(location.name)),
        el('p',name(issues[issue])+' · '+count+text(count===1?' walk':' walks',' 次行程')),
        el('p',count>=2?text('Prioritise for field check','優先實地查核'):text('Single report · consider gathering more evidence','單次報告 · 可再蒐集資料'),'meta'),
        el('p',name(improvements[issue])),
        ...(source==='sample'?[link]:[]));
    }):[card(el('p',text('No reported issues for these walks.','這些行程沒有報告問題。')))],'stack'));
  return result;
}

function render() {
  document.documentElement.lang=zh?'zh-Hant':'en';
  document.title=text('Walking study · Hong Kong on Foot','步行研究 · 步行香港地圖');
  $('home').href=toMap();
  $('language').textContent=text('繁體中文','English');
  $('language').lang=text('zh-Hant','en');
  for(const node of document.querySelectorAll('[data-copy]')) node.replaceChildren(...[copy[node.dataset.copy]()].flat());
  for(const button of document.querySelectorAll('[data-tab]')) {
    if(button.dataset.tab===tab) button.setAttribute('aria-current','step');
    else button.removeAttribute('aria-current');
    $(button.dataset.tab).hidden=button.dataset.tab!==tab;
  }
  $(tab).replaceChildren({collect,analyse,apply}[tab]());
  for(const [key,marker] of Object.entries(areaMarkers)){
    marker.setStyle({fillColor:key===place?'#0d594c':'#638675'});
    marker.setTooltipContent(name(places[key].name));
  }
  updateLive();
}
const areaMarkers={};
if(window.L) {
  const map=L.map('study-map',{zoomControl:false,scrollWheelZoom:false,dragging:false,doubleClickZoom:false,boxZoom:false,touchZoom:false,keyboard:false})
    .setView([22.28308,114.15811],17);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  for(const [key,item] of Object.entries(places)) {
    const marker=L.circleMarker(item.coords,{radius:8,color:'#fff',weight:2,fillOpacity:1}).addTo(map);
    marker.bindTooltip(name(item.name));
    marker.on('click',()=>{place=key;go('analyse',true);});
    areaMarkers[key]=marker;
  }
}
for(const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click',()=>go(button.dataset.tab,true));
$('language').addEventListener('click',()=>{zh=!zh;render();});
render();

if('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(()=>{});
