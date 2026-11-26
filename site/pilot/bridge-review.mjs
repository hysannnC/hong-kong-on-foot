import {geographySources} from './bridge-geography.mjs';
import {inferObservations,learningRounds,profileNames,reviewEstimate,studyPaths,reviewHash} from './bridge-study.mjs';

const routeNames={
  lift:['Lift A','升降機 A'],ramp:['Harbourfront ramp','海濱斜道'],stairs:['Stairs','樓梯'],
};
const layerStyles={
  planned:{color:'#b56a18',weight:6,dashArray:'9 8'},
  recorded:{color:'#007c6f',weight:7},
};
const storageKey='hk.bridge-review.samples.v1';

export function mountBridgeReview(root,map,view){
  const layer=L.layerGroup().addTo(map);
  const evidence=inferObservations();
  const bounds=L.latLngBounds(studyPaths.planned);
  let language='en', profile='wheelchair', date='2026-11-29', period='busy', round=0;
  const planner=view==='planner';
  let withEvidence=true, selected='crowd', compare=planner;
  try{
    const saved=Number(localStorage.getItem(storageKey));
    if(Number.isInteger(saved)&&saved>=0&&saved<=learningRounds)round=saved;
  }catch{ /* Sample learning remains available in this visit. */ }
  const t=(en,tc)=>language==='zh'?tc:en;
  const name=pair=>pair[language==='zh'?1:0];
  const node=(tag,copy,className)=>{
    const item=document.createElement(tag);
    if(copy)item.textContent=copy;
    if(className)item.className=className;
    return item;
  };
  const button=(copy,fn)=>{
    const item=node('button',copy);item.type='button';item.onclick=fn;return item;
  };
  const section=node('details');
  section.open=true;
  const title=node('summary');
  const body=node('div',null,'bridge-review-body');
  section.append(title,body);
  root.replaceChildren(section);
  const fit=()=>{
    map.invalidateSize({pan:false});
    map.fitBounds(bounds,{padding:[28,34],maxZoom:18.5,animate:false});
  };
  section.ontoggle=()=>requestAnimationFrame(fit);
  new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(map.getContainer());

  function observations(){
    return {
      crowd:{
        title:t('Crowd bypass','繞過人群'),
        signals:t('Camera people counts + pace + lateral movement','相機人數辨識＋速度＋橫向移動'),
        result:evidence.crowd.confirmed
          ?t('Three busy frames, a slowdown and a sideways detour support a short-lived crowd delay.',
            '三次擠迫畫面、減速和橫向繞行，支持短暫人群延誤的判斷。')
          :t('The crowd signal needs more evidence before it affects routing.','人群訊號需要更多證據才影響路線。'),
        use:t('Use the delay only for this trip. Learn typical delays by time of day from repeat traversals.',
          '延誤只套用於本次行程。以多次通過紀錄估算各時段的典型延誤。'),
      },
      lift:{
        title:t('Lift A closure','升降機 A 停用'),
        signals:t('Camera text recognition + location + heading reversal','相機文字辨識＋位置＋掉頭'),
        result:t('Two matching readings identify the notice for Lift A (26 Nov–2 Dec 2026). The rider stops and turns back.',
          '兩次一致的文字辨識讀取升降機 A 告示（2026 年 11 月 26 日至 12 月 2 日）。使用者停下並掉頭。'),
        use:t('Exclude the simulated lift during the closure. Check that it has reopened before using it again in this pilot.',
          '停用期間排除該升降機。此試驗會先確認重開，再將它納入路線。'),
      },
      ramp:{
        title:t('Ramp entrance','斜道入口'),
        signals:t('Pause + heading sweep near a decision point','決策點附近停頓＋方向變化'),
        result:t('A possible wayfinding hesitation. The recording ends here. No ramp descent or level change was observed.',
          '可能出現尋路猶豫。行程記錄在此結束，未觀察到斜道下行或樓層變化。'),
        use:t('Look for the same pattern across more trips before changing sign or turn instructions.',
          '先在更多行程尋找相同模式，再調整指示或轉向提示。'),
      },
    };
  }
  function restoreControl(id){body.querySelector('#'+id)?.focus({preventScroll:true});}
  function select(id,label,current,options,change){
    const input=node('select');
    input.id=id;
    input.append(...options.map(([value,copy])=>new Option(copy,value)));
    input.value=current;
    input.onchange=()=>{change(input.value);render();restoreControl(id);};
    const field=node('label',label);field.append(input);return field;
  }
  function path(name,description){
    const style=layerStyles[name];
    L.polyline(studyPaths[name],{...style,opacity:.96,interactive:false}).bindTooltip(description).addTo(layer);
  }
  function redraw(labels,details){
    layer.clearLayers();
    path('planned',labels.planned);
    if(!compare)return;
    path('recorded',labels.recorded);
    for(const [id,event] of Object.entries(evidence)){
      if(!planner&&id!=='lift')continue;
      const radius=planner?(id===selected?8:6):4;
      const dot=L.circleMarker(event.location,{radius,color:'#fff',weight:2,fillColor:'#213b35',fillOpacity:1,bubblingMouseEvents:false});
      dot.bindTooltip(details[id].title).on('click',()=>{
        if(planner){selected=id;render();}else dot.openTooltip();
      }).addTo(layer);
    }
  }

  function links(mode){
    const anchor=node('a',mode==='planner'?t('View planner evidence','查看規劃證據'):t('Back to trip summary','返回行程摘要'));
    anchor.href='./?study=2'+reviewHash(language,mode);
    return anchor;
  }
  function legendFor(labels){
    const legend=node('ul',null,'pilot-map-legend');
    for(const [id,label] of Object.entries(labels)){
      const item=node('li',label);
      item.style.setProperty('--route-colour',layerStyles[id].color);
      item.dataset.line=id;
      legend.append(item);
    }
    return legend;
  }
  function publicSummary(legends){
    title.textContent=t('Trip summary','行程摘要');
    const heading=node('h2',t('IFC to Star Ferry Pier 7','國際金融中心至天星碼頭七號碼頭'));
    const card=node('div',null,'pilot-recommendation');
    card.append(
      node('strong',t('The rider turned back at the lift','使用者在升降機前折返')),
      node('p',t('In the demo, a lift closure prompts a detour to the ramp entrance.',
        '在示範中，升降機停用令使用者改道至斜道入口。')),
    );
    const next=node('p',t('Check step-free access at the terminal before continuing. The demo ramp has no verified map connection.',
      '繼續前先確認碼頭無梯級通道。示範斜道的接駁位置尚未核實。'),'pilot-muted');
    const toggle=button(compare?t('Hide comparison','隱藏路線比較'):t('Compare routes','比較路線'),()=>{
      compare=!compare;render();restoreControl('compare-study');if(compare)requestAnimationFrame(fit);
    });
    toggle.id='compare-study';toggle.setAttribute('aria-pressed',String(compare));
    const actions=node('div',null,'public-study-actions');
    actions.append(toggle,links('planner'));
    const exit=node('a',t('Return to the main map','返回主地圖'));
    exit.href='./#'+new URLSearchParams({mode:'public',lang:language});
    body.replaceChildren(heading,card,next,actions);
    if(compare)body.append(legendFor(legends),node('p',t('Simulated movements are aligned to the passageway centreline.',
      '模擬移動對齊行人通道中心線。'),'pilot-muted'));
    body.append(exit);
  }

  function render(){
    const details=observations();
    const requireStepFree=profile!=='walk';
    const result=reviewEstimate({profile,period,round,withEvidence,date,requireStepFree});
    const base=reviewEstimate({profile,period,round:0,withEvidence:false,date,requireStepFree});
    const legends={
      planned:t('Mapped corridor to Pier 7','已繪製的七號碼頭通道'),
      recorded:t('Simulated track on the corridor','通道上的模擬記錄路線'),
    };
    if(!planner){
      publicSummary(legends);
      redraw(legends,details);
      return;
    }
    title.textContent=t('Planner evidence · IFC to Pier 7','規劃證據 · 國際金融中心至七號碼頭');
    const intro=node('p',t('The map follows pedestrian links via Central Yards. The lift closure, ramp and behaviour observations are from the simulation.',
      '地圖沿 Central Yards 的行人通道繪製。升降機停用、斜道及行為觀察來自模擬。'),'pilot-muted');
    const legend=legendFor(legends);
    const view=button(t('Fit routes on map','顯示完整路線'),fit);
    const phase=node('div',null,'pilot-controls');
    const when=node('input');when.type='date';when.id='study-date';when.value=date;
    when.onchange=()=>{if(when.value){date=when.value;render();restoreControl(when.id);}else when.value=date;};
    const dateLabel=node('label',t('Travel date','出行日期'));dateLabel.append(when);
    const inputs=node('div',null,'pilot-fields');
    inputs.append(
      select('study-profile',t('Mobility profile','行動需求'),profile,Object.entries(profileNames).map(([id,pair])=>[id,name(pair)]),id=>{profile=id;}),
      dateLabel,
      select('study-period',t('Time of day','時段'),period,[['busy',t('Busy period','繁忙時段')],['quiet',t('Quiet period','非繁忙時段')]],id=>{period=id;}),
    );
    const toggle=button(withEvidence?t('Compare with map-only estimate','比較僅用地圖的估算'):t('Apply study observations','套用研究觀察'),()=>{
      withEvidence=!withEvidence;render();restoreControl(toggle.id);
    });toggle.id='study-toggle';
    phase.append(view,toggle);
    const time=seconds=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const recommendation=node('div',null,'pilot-recommendation');
    recommendation.setAttribute('aria-live','polite');
    recommendation.append(
      node('h2',t('Simulated route ranking','模擬路線排序')),
      node('strong',name(routeNames[result.best.id])+' · '+time(result.best.seconds)),
      node('p',t('Map-only baseline: ','僅用地圖的基準：')+name(routeNames[base.best.id])+' · '+time(base.best.seconds)),
    );
    const reason=!withEvidence?t('Showing estimated route costs before study evidence.','顯示套用研究證據前的路線估算。'):
      result.within?t('Lift A is excluded for the dated demo closure.','升降機 A 在示範停用期內被排除。'):
      result.verify?t('The closure window has passed. Verify reopening before recommending Lift A.','停用期已過。建議使用升降機 A 前須核實重開。'):
      t('The dated closure has yet to start on this date.','所選日期在停用期開始之前。');
    recommendation.append(node('p',reason));
    if(result.best.id==='ramp')recommendation.append(node('p',t('The model favours the ramp in this scenario. Its real alignment is unverified and is omitted from the map.',
      '此情境下模型優先選用斜道。實際走線未核實，因此未在地圖繪製。'),'pilot-muted'));
    const exclusions=result.choices.filter(v=>v.exclusion);
    if(exclusions.some(v=>v.exclusion==='steps'))recommendation.append(node('p',t('Stairs excluded by the step-free requirement.','無梯級要求排除樓梯。')));
    const learn=button(t('Learn from the next sample batch','學習下一批示範行程'),()=>{
      round++;try{localStorage.setItem(storageKey,String(round));}catch{}
      render();restoreControl('study-learn');
    });learn.id='study-learn';learn.disabled=round>=learningRounds||!withEvidence;
    const learning=node('section',null,'pilot-learning');
    learning.append(node('h2',t('Learn from repeat trips','從重複行程學習')),
      node('p',t('Bridge segment estimate: ','天橋路段估算：')+result.baseline+' → '+result.learned+t(' seconds',' 秒')),
      node('p',result.samples+t(' matching simulated trips',' 次符合條件的模擬行程')+' · '+result.delayed+t(' with delays',' 次出現延誤'),'pilot-muted'),learn);
    if(round){
      const reset=button(t('Reset sample learning','重設示範學習'),()=>{
        round=0;try{localStorage.removeItem(storageKey);}catch{}render();restoreControl('study-learn');
      });learning.append(reset);
    }
    const findings=node('details',null,'pilot-findings');
    findings.open=true;
    findings.append(node('summary',t('Sensor evidence','感測證據')));
    const markers=node('div',null,'pilot-controls');
    for(const [id,detail] of Object.entries(details)){
      const selectEvidence=button(detail.title,()=>{
        selected=id;render();restoreControl('study-sensor-'+id);map.panTo(evidence[id].location,{animate:false});
      });selectEvidence.id='study-sensor-'+id;
      selectEvidence.setAttribute('aria-pressed',String(id===selected));
      markers.append(selectEvidence);
    }
    const detail=details[selected];
    const record=evidence[selected];
    const confidence={
      corroborated:t('Multiple signals agree','多項訊號一致'),
      'scenario-only':t('Scenario evidence only','僅屬情境證據'),
      tentative:t('Needs corroboration','待其他訊號確認'),
    };
    const audit=node('p',t('Confidence: ','信心：')+confidence[record.confidence]+' · '+t('Source: simulation','來源：模擬'),'pilot-muted');
    const match=node('p',t('Map segment: ','地圖路段：')+record.segment,'pilot-muted');
    findings.append(markers,node('strong',detail.signals),node('p',detail.result),audit,match,node('p',detail.use,'pilot-muted'));
    if(record.closure)findings.append(node('p',t('Applies through ','適用至 ')+record.closure.through,'pilot-muted'));
    const method=node('details',null,'pilot-findings');
    method.append(node('summary',t('How the estimates update','估算如何更新')),
      node('p',t('Each quality-checked sample adds one timed bridge traversal. Two baseline values stabilise the average. The model learns separately by mobility profile and time of day. Closures and step-free access are applied as eligibility rules.',
        '每個通過品質檢查的樣本加入一次天橋通過時間。以兩個基準值穩定平均數。按行動需求及時段分開學習。設施停用及無梯級通行則是路線篩選條件。')),
      node('p',t('Motion and heading help distinguish a stop, a detour and a turnback. Where supported, a barometer can help flag a level change for checking. Precise width, gradient and step-free accessibility require verified route data.',
        '動作及方向有助區分停下、繞行與折返。裝置如支援氣壓感測，可協助標記待核實的樓層變化。準確闊度、斜度及無梯級通行需要已核實的路線資料。')));
    const walkthrough=node('a',t('Replay the 29-second walkthrough','重播 29 秒導覽'));
    walkthrough.href='pilot/bridge.html?lang='+language;
    const close=node('a',t('Leave trip review','離開行程回顧'));
    close.href='./#'+new URLSearchParams({mode:'planner',lang:language});
    const sources=node('details',null,'pilot-findings');
    sources.append(node('summary',t('Route geometry sources','路線位置來源')));
    for(const [en,tc,href] of geographySources){
      const link=node('a',t(en,tc));link.href=href;
      const row=node('p');row.append(link);sources.append(row);
    }
    body.replaceChildren(intro,legend,phase,recommendation,inputs,findings,learning,method,sources,links('public'),walkthrough,close);
    redraw(legends,details);
  }
  root.hidden=false;
  fit();
  return {localize(lang){language=lang;render();}};
}
