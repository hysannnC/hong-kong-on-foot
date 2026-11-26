import {demoTripById,movementColors} from './demo-trips.mjs?v=56';
import {routeColors} from './trip-map.mjs?v=56';
export function summarizeTrips(trips){
  const count=predicate=>trips.filter(predicate).length;
  const sum=key=>trips.reduce((total,trip)=>total+(trip[key]??0),0);
  const eligible=['accelerometer','gyroscope','gps'].map(sensor=>trips.filter(trip=>trip.cues&&trip[sensor]>0));
  return {
    count:trips.length,moves:sum('moves'),pauses:sum('pauses'),turns:sum('turns'),
    crowd:sum('crowd'),crowdTrips:count(trip=>trip.crowd>0),cameraTrips:count(trip=>trip.scans>0||trip.crowd>0),scans:sum('scans'),
    coverage:['accelerometer','gyroscope','gps'].map(sensor=>count(trip=>trip[sensor]>0)),
    samples:['accelerometer','gyroscope','gps'].map(sum),
    cueCoverage:eligible.map(rows=>rows.length),
    cues:[
      eligible[0].filter(trip=>trip.cues.lowMotion).length,
      eligible[1].filter(trip=>trip.cues.rotationChanged).length,
      eligible[2].filter(trip=>trip.cues.backtracks>0).length,
    ],
    reports:['sign','barrier','personal','unsure'].map(report=>count(trip=>trip.report===report)),
  };
}

export function tripCharts(trips,{t,el,summary}){
  const amount=new Intl.NumberFormat();
  const number=value=>amount.format(value);
  const bar=(label,value,maximum,display,color='green')=>{
    const fill=el('i',[],color);
    if(color.startsWith('#'))fill.style.backgroundColor=color;
    fill.style.width=(maximum?Math.min(1,value/maximum)*100:0)+'%';
    const track=el('span',fill,'trip-track');
    track.setAttribute('aria-hidden','true');
    return el('li',[el('span',label),el('strong',display),track]);
  };
  const chart=(title,rows,detail)=>el('section',[
    el('h3',title),el('ul',rows,'trip-bars'),...(detail?[el('p',detail,'subtle')]:[]),
  ],'trip-chart');
  const m=summarizeTrips(trips);
  const total=m.moves+m.pauses;
  const sensorNames=[t('Accelerometer','加速度計'),t('Gyroscope','陀螺儀'),t('GPS','GPS 定位'),t('Camera','相機')];
  const coverageCounts=[...m.coverage,m.cameraTrips], sampleCounts=[...m.samples,m.scans];
  const movement=trips.reduce((totals,trip)=>{
    const demo=demoTripById.get(trip.id);
    if(demo){
      totals.normal+=demo.normalSeconds;totals.slow+=demo.slowSeconds;
    }else totals.other+=trip.moves;
    return totals;
  },{normal:0,slow:0,other:0});
  const time=chart(t('Movement time in this selection','所選行程的移動時間'),[
    ...(movement.normal||movement.slow?[
      bar(t('Normal movement','正常移動'),movement.normal,total,number(movement.normal)+' s',movementColors.normal),
      bar(t('Slowing','減速'),movement.slow,total,number(movement.slow)+' s',movementColors.slow),
    ]:[]),
    ...(movement.other?[bar(t('Moving · speed breakdown unavailable','移動 · 未有速度分類'),movement.other,total,number(movement.other)+' s')]:[]),
    bar(t('Stopped','停頓'),m.pauses,total,number(m.pauses)+' s',movementColors.stopped),
  ],t('Totals are recalculated from the selected trip records. Each bar shows its share of recorded movement and stop time.',
    '按所選行程紀錄重新計算。每條棒形顯示該狀態佔已記錄移動及停頓時間的比例。'));
  const tripCount=(value,total)=>t(
    number(value)+' of '+number(total)+(total===1?' trip':' trips'),
    number(total)+' 次行程中有 '+number(value)+' 次');
  const cueRows=[
    [t('Low phone movement','手機動作較少'),m.cues[0],m.cueCoverage[0]],
    [t('Phone rotation changed','手機旋轉有變化'),m.cues[1],m.cueCoverage[1]],
    [t('Possible backtrack','可能折返'),m.cues[2],m.cueCoverage[2]],
    [t('Crowding observed','觀察到擠迫'),m.crowdTrips,m.cameraTrips,'amber'],
  ].map(([label,value,eligible,color],index)=>{
    const sensor=sensorNames[index];
    const row=bar(label,value,eligible,eligible?tripCount(value,eligible):t('No usable data','沒有可用資料'),color);
    row.append(el('small',sensor,'trip-sensor-label'));
    return row;
  });
  const cues=chart(t('Trips with sensor cues','出現感測線索的行程'),cueRows,
    t('Each row counts trips where the cue appeared at least once, out of trips with usable data for that sensor and cue. One trip can appear in several rows.',
      '每行顯示至少出現一次該線索的行程數，以及該感測器和線索有可用資料的行程總數。同一次行程可以計入多行。'));
  if(trips.every(trip=>trip.source==='sample'))cues.append(el('p',t(
    'This view contains '+number(m.count)+(m.count===1?' replay trip.':' replay trips.'),
    '此檢視包含 '+number(m.count)+' 次重播行程。'),'subtle'));
  const feedback=chart(t('Optional feedback','選填意見'),[
    ...[t('Unclear signage','指示不清'),t('Access barrier','通行障礙'),t('Personal stop','個人停留'),t('No issue / unsure','未發現問題／不確定')].map((label,index)=>
      bar(label,m.reports[index],m.count,tripCount(m.reports[index],m.count))),
  ]);
  const coverage=el('details',[
    el('summary',t('Sensor coverage and counts','感測覆蓋及讀數')),
    chart(t('Trips with usable readings','有可用讀數的行程'),sensorNames.map((label,index)=>
      bar(label,coverageCounts[index],m.count,tripCount(coverageCounts[index],m.count)))),
    el('p',sensorNames.map((label,index)=>label+' '+number(sampleCounts[index])+' '+[t('samples','筆樣本'),t('samples','筆樣本'),t('fixes','筆定位'),t('frames scanned','幀已掃描')][index]).join(' · '),'subtle'),
    el('p',t('Possible turns: ','可能轉向：')+number(m.turns)+' · '+t('Crowded camera frames: ','擠迫畫面：')+number(m.crowd),'subtle'),
  ],'trip-coverage');
  return [time,cues,feedback,coverage,...(summary?[el('p',summary,'subtle')]:[])];
}

const siteChecks={
  closure:[
    ['Simulated camera recognition of a lift maintenance notice. The replay then shows a U-turn.',
      '模擬相機辨識升降機維修告示，其後重播顯示掉頭。'],
    ['Confirm lift status and reopening with the operator. Audit the complete step-free alternative before publishing it.',
      '向管理方核實升降機狀態及重開時間，並在發布前查核完整的無梯級替代路線。'],
  ],
  crowd:[
    ['The replay models a crowd and a slowdown near the bridge edge.',
      '重播模擬天橋邊的人群及減速。'],
    ['Check clear passage width during a busy period and see whether users can pass without leaving the accessible corridor.',
      '在繁忙時段量度淨通道寬度，檢查使用者能否留在無障礙通道內通過。'],
  ],
  signage:[
    ['Added to the full-route example as a wayfinding issue.',
      '完整路線示例加入的尋路問題。'],
    ['Check whether signs for Pier 7 and the step-free route are visible before users reach the junction.',
      '檢查使用者到達交匯處前，能否看見七號碼頭及無梯級路線的指示。'],
  ],
  surface:[
    ['Added to the full-route example as a surface issue.',
      '完整路線示例加入的路面問題。'],
    ['Inspect the ramp landing for uneven joints, changes in level and usable manoeuvring space.',
      '檢查斜道平台的接縫高差、路面及可用迴轉空間。'],
  ],
  queue:[
    ['Added to the full-route example as a potential bottleneck.',
      '完整路線示例加入的潛在樽頸。'],
    ['Check where the queue forms and measure the width left for through movement at peak times.',
      '查核隊伍位置，並在高峰期量度剩餘通行寬度。'],
  ],
};

export function exampleTripReview({t,el,comparison,distances}){
  const {planned,actual,extra}=distances;
  const distanceRow=(label,metres,color)=>{
    const fill=el('span');
    if(color.startsWith('#'))fill.style.backgroundColor=color;
    fill.style.width=(metres/Math.max(planned,actual)*100)+'%';
    fill.style.backgroundColor=routeColors[color];
    const track=el('div',fill,'trip-distance-track');
    track.setAttribute('aria-hidden','true');
    return el('div',[el('span',label),el('strong',metres+' m'),track],'trip-distance-row');
  };
  const overview=el('section',[
    el('h3',t('Route change','路線變化')),
    el('p',t('The lift-closure scenario sends the user back to the ramp, then along the waterfront to Pier 7.',
      '升降機停用情境中，使用者折返前往斜道，再沿海濱到達七號碼頭。')),
    distanceRow(t('Suggested route','建議路線'),planned,'planned'),
    distanceRow(t('Travelled path','行經路線'),actual,'travelled'),
    el('p',t('About '+extra+' m farther via the ramp.','經斜道約多走 '+extra+' 米。'),'trip-distance-delta'),
    comparison.legend,
    el('p',t('Distances come from the full illustrative map paths. Sensor readings and event times cover the 29-second replay to the ramp entrance.',
      '距離按完整示意路線計算。感測讀數及事件時間僅涵蓋抵達斜道入口前的 29 秒重播。'),'subtle'),
  ],'trip-chart trip-route-review');
  const checks=el('section',[
    el('h3',t('Cautions and field checks','注意事項及實地查核')),
    el('p',t('Start with lift availability and the step-free connection. Other cautions show where a field visit could clarify the issue.',
      '先核實升降機及無梯級接駁。其他注意事項顯示哪些位置適合實地查核。'),'subtle'),
    ...Object.keys(siteChecks).flatMap(id=>comparison.cautions.filter(caution=>caution.id===id)).map(caution=>{
      const [evidence,check]=siteChecks[caution.id];
      const locate=el('button',t('Show on map','在地圖顯示'));
      locate.type='button';locate.onclick=caution.showOnMap;
      locate.setAttribute('aria-label',t('Show on map','在地圖顯示')+' · '+caution.label);
      const source=Number.isFinite(caution.at)?t('Replay evidence','重播資料'):t('Map-only example','地圖示例');
      return el('article',[
        el('span',source,'trip-source'),el('h4',caution.label),el('p',t(...evidence)),el('p',t(...check),'trip-field-check'),locate,
      ],'trip-check');
    }),
  ],'trip-chart trip-checks');
  return [overview,checks];
}
