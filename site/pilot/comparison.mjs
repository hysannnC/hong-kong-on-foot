import {routes,batches,rankRoutes} from './learning.mjs';
let activeMap=null;
export function disposeComparison(){if(activeMap){activeMap.remove();activeMap=null;}}
const key='hk-walking-learning-demo-v1';
let round=0, storageOK=true, free=false, priority='balanced', visibility={suggested:true,actual:true,others:true};
try{const n=Number(localStorage.getItem(key));if(Number.isInteger(n)&&n>=0&&n<=batches.length)round=n;}catch{storageOK=false;}
const observations=()=>batches.slice(0,round).flat();
function remember(){try{localStorage.setItem(key,String(round));storageOK=true;}catch{storageOK=false;}}
export function comparison({zh,demo,points,elapsed,onBack,render}){
  const t=(en,tc)=>zh?tc:en;
  const el=(tag,content=[],cls='')=>{const n=document.createElement(tag);n.append(...[content].flat());n.className=cls;return n;};
  const button=(label,fn,primary=false)=>{const n=el('button',label,primary?'primary':'');n.type='button';n.onclick=fn;return n;};
  const toggle=(label,value,fn)=>{const i=el('input');i.type='checkbox';i.checked=value;i.onchange=()=>fn(i.checked);return el('label',[i,el('span',label)],'toggle');};
  const learned=rankRoutes(observations(),free,priority==='independence'?12:4);
  const first=learned[0], prior=rankRoutes([],free)[0];
  const title=el('h1',t('Three paths. A better next walk.','比較三條路，改善下次步行。'));
  const map=el('div',[],'comparison-map');map.id='comparison-map';
  const actualAvailable=demo||points.some(p=>p.accuracy<=30);
  const controls=el('div',[
    toggle(t('Suggested','建議路線'),visibility.suggested,v=>{visibility.suggested=v;render();}),
    toggle(t('Your walk','你的路線'),visibility.actual,v=>{visibility.actual=v;render();}),
    toggle(t('Other sample walks','其他示範路線'),visibility.others,v=>{visibility.others=v;render();}),
  ],'route-legend');
  const selector=el('select');selector.setAttribute('aria-label',t('What matters most?','你最重視甚麼？'));
  selector.append(new Option(t('Time and independent passage','時間與自行通行'),'balanced'),new Option(t('Prioritise independent passage','優先自行通行'),'independence'));
  selector.value=priority;selector.onchange=()=>{priority=selector.value;render();};
  const summary=el('div',[
    el('h2',t('Recommended next time','下次建議路線')),
    el('strong',first.name[zh?1:0]),
    el('p',t('Initial choice · ','初始選擇 · ')+prior.name[zh?1:0]),
    el('p',t('Updated estimate · ','更新估計 · ')+first.estimate.toFixed(1)+t(' min',' 分鐘')),
    el('p',t('Based on ','根據 ')+observations().length+t(' fictional completed walks.',' 次虛構已完成行程。'),'small muted'),
  ],'review');
  const rows=el('div',learned.map(r=>el('div',[
    el('strong',r.name[zh?1:0]),
    el('p',r.eligible?r.estimate.toFixed(1)+t(' min estimated',' 分鐘（估計）'):t('Excluded by step-free requirement','因無梯級要求而排除')),
    el('small',r.n?t('Independent passage in ','自行通過 ')+r.independent+'/'+r.n+t(' sample walks',' 次示範行程'):t('No observed walks yet · map estimate used','尚無觀察行程，使用地圖估計')),
  ],'route-result')),'route-results');
  const details=el('details',[
    el('summary',t('How this learning works','這個學習過程如何運作')),
    el('p',t('Each batch fits an updated mean travel time and an independent-passage estimate for each path. Two prior observations stabilise small samples. Ranking combines estimated minutes with a penalty for assisted or unsuccessful independent passage.','每批資料更新各路線的平均時間及自行通過的估計。以兩個先驗觀察穩定小樣本，再結合估計分鐘及未能自行通過的懲罰作排序。')),
    el('p',t('These completed-walk examples illustrate online statistical learning. Field deployment must also account for abandoned trips, temporary obstacles, mobility groups and data quality. Route access attributes here are fictional.','這些已完成行程展示線上統計學習。實地部署還須處理放棄行程、臨時障礙、步行方式及資料品質。此處的通行屬性為虛構設定。')),
  ]);
  const nodes=[
    el('p',t('END-OF-WALK COMPARISON','步行結束後比較'),'eyebrow'),title,
    el('p',t('Central MTR–IFC · Illustrative paths and community evidence','中環站至國際金融中心 · 示意路線及社群資料'),'small muted'),
    map,controls,
    el('p',demo?t('Your simulated walk takes a detour. Other fictional walkers use the covered alternative.','你的模擬行程曾改道，其他虛構行人使用有蓋替代路線。'):actualAvailable?t('Your GPS points are shown in orange. Gaps and low-accuracy fixes are omitted. Community and suggested paths are illustrative.','你的 GPS 位置以橙色顯示，省略缺漏及低精度定位。社群及建議路線為示意。'):t('No usable GPS path recorded. The suggested and community paths remain illustrative.','沒有可用 GPS 路徑，建議及社群路線為示意。'),'small muted'),
    el('p',demo?t('Suggested 8 min · Your simulated walk 12 min · Covered sample 9 min','建議 8 分鐘 · 你的模擬步行 12 分鐘 · 有蓋示範 9 分鐘'):t('Your elapsed time · ','你的總時間 · ')+(elapsed/60).toFixed(1)+t(' min',' 分鐘'),'small'),
    el('h2',t('Let the next walks teach it','讓更多步行經歷幫助學習')),
    toggle(t('Require step-free access','需要無梯級通道'),free,v=>{free=v;render();}),selector,
    summary,
    button(round<batches.length?t('Learn from the next sample walks','加入下一批示範行程學習'):t('All sample walks included','已加入所有示範行程'),()=>{if(round<batches.length){round++;remember();render();}},true),
    rows,
    el('p',t(storageOK?'Demo learning progress stays in this browser across visits. Your real walk and photos stay separate and are discarded on reset.':'Browser storage unavailable. Demo learning lasts for this visit.',storageOK?'示範學習進度會保留在此瀏覽器。你的真實行程及相片另行處理，重設時清除。':'瀏覽器儲存不可用。示範學習只保留於本次瀏覽。'),'small muted'),
    details,button(t('Reset sample learning','重設示範學習'),()=>{round=0;remember();render();}),
    button(t('Back to my walk','返回我的步行'),onBack),
  ];
  return {nodes,mount(){
    if(!window.L){map.append(el('p',t('Map library unavailable. Route estimates are shown below.','地圖程式不可用。路線估計仍顯示於下方。')));return;}
    const m=L.map(map,{scrollWheelZoom:false}).setView([22.2831,114.1584],17);
    activeMap=m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m);
    const pointsShown=[];
    function path(coords,color,label,dash){
      if(coords.length<2)return;
      L.polyline(coords,{color,weight:color==='#12665a'?10:4,opacity:.85,dashArray:dash}).bindTooltip(label).addTo(m);
      pointsShown.push(...coords);
    }
    if(visibility.others)path(routes[2].coords,'#7453a4',t('Other fictional walks','其他虛構行程'),'5 7');
    if(visibility.suggested)path(routes[1].coords,'#12665a',t('Suggested before the walk','步行前的建議路線'));
    if(visibility.actual){
      if(demo)path([routes[1].coords[0],routes[1].coords[1],[22.2829,114.1588],routes[1].coords[1],...routes[1].coords.slice(2)],'#d3782f',t('Your simulated walk','你的模擬步行'),'9 5');
      else{
        let segment=[];
        for(const p of points){
          if(p.accuracy>30|| (segment.length&&p.time-segment.at(-1).time>30000)){
            path(segment.map(v=>[v.lat,v.lng]),'#d3782f',t('Your recorded walk','你的步行記錄'));segment=[];
          }
          if(p.accuracy<=30)segment.push(p);
        }
        path(segment.map(v=>[v.lat,v.lng]),'#d3782f',t('Your recorded walk','你的步行記錄'));
      }
    }
    if(pointsShown.length)m.fitBounds(pointsShown,{padding:[20,20],maxZoom:17});
  }};
}
