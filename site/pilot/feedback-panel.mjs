import {downloadCSV} from './data-downloads.mjs?v=55';
import {marketRoutePanel} from './market-routing.mjs?v=55';
import {evidenceLegend,observationMarkers} from './evidence-markers.mjs?v=55';
import {drawRouteLines} from './trip-map.mjs?v=55';
import {evidenceDate,evidenceNames,evidenceTime,fieldEvidence,routeComparison} from './field-evidence.mjs?v=55';
import {distanceBetween} from '../navigation.js';

export const evidenceLink=(lang,scenario='market')=>'./?shell=55&fieldLoop=1&routeCase='+scenario+'#mode=public&view=directions&lang='+lang;
const el=(tag,...children)=>{const node=document.createElement(tag);node.append(...children);return node;};
const cls=(tag,name,...children)=>{const node=el(tag,...children);node.className=name;return node;};
const link=(title,url)=>{const node=el('a',title);node.href=url;return node;};
const button=(title,action)=>{const node=el('button',title);node.type='button';node.onclick=action;return node;};
const t=(lang,en,zh)=>lang==='zh'?zh:en;
const shortStamp=row=>evidenceTime(row.at)+' HKT';

export function observationPanel({lang,map,layer,filter='',select}){
  const rows=fieldEvidence();
  const local=(en,zh)=>t(lang,en,zh);
  const sourceLabels={phone:local('Live phone','即時手機'),'ar-replay':local('AR replay','AR 重播'),'cctv-replay':local('CCTV replay','閉路電視重播')};
  const shown=rows.filter(row=>!filter||row.source===filter);
  const selector=el('select',new Option(local('All sources','所有來源'),''),
    ...Object.entries(sourceLabels).map(([key,label])=>new Option(label,key)));
  selector.value=filter;selector.setAttribute('aria-label',local('Source','來源'));selector.onchange=()=>select(selector.value);
  const markers=observationMarkers({map,layer,rows:shown,lang,planner:true});
  const table=el('table',el('thead',el('tr',...[
    local('Time','時間'),local('Source','來源'),local('Observation','觀察'),
  ].map(label=>el('th',label)))),el('tbody',...shown.slice().reverse().slice(0,80).map(row=>el('tr',
    el('td',shortStamp(row),el('br'),evidenceDate(row.at)),el('td',sourceLabels[row.source]),el('td',local(...evidenceNames[row.kind]),
      ...(row.kind==='flow'?[el('br'),local(row.toward+' toward · '+row.away+' away in '+row.observedSeconds+' s',
        row.observedSeconds+' 秒內往向 '+row.toward+' 人次、反向 '+row.away+' 人次')]:[]))))));
  return [cls('p','subtle',local('Saved observations on this browser. Phone estimates and replay observations retain their source labels.',
    '此瀏覽器已儲存的觀察。手機估算與重播觀察各自保留來源標籤。')),selector,evidenceLegend(lang),
    ...(shown.length?[
      button(local('Download filtered observations (CSV)','下載篩選後的觀察（CSV）'),()=>downloadCSV(
        'central-street-observations.csv',
        ['id','source','kind','timestamp_utc','latitude','longitude','count_window_seconds','crossings_toward','crossings_away','scenario','route','clear_width_m'],
        shown.map(row=>[row.id,row.source,row.kind,new Date(row.at).toJSON(),...row.point,
          row.observedSeconds,row.toward,row.away,row.scenario,row.route,row.clearWidthM]))),
      cls('p','subtle',local('Includes all records for the selected source. The table shows the latest 80.',
        '下載包含所選來源的全部紀錄。表格顯示最新 80 筆。')),
      cls('div','table-scroll',table),button(local('Fit observations','顯示觀察位置'),()=>{
      if(markers.isValid())map.fitBounds(markers,{padding:[28,32],maxZoom:17.5,animate:false});
    })]:[el('p',local('No observations for this source yet.','此來源暫無觀察。'))]),
    link(local('Compare evidence-based routes','比較依據證據的路線'),evidenceLink(lang,'market')),
  ];
}

export function routeFeedbackPanel({root,map,layer,lang}){
  if(new URLSearchParams(location.search).get('routeCase')!=='pier')return marketRoutePanel({root,map,layer,lang});
  const local=(en,zh)=>t(lang,en,zh);
  const review=routeComparison(fieldEvidence());
  layer.clearLayers();
  const extent=L.latLngBounds(review.original);
  const travelled=review.recommend?[review.alternative]:[];
  if(travelled.length)extent.extend(L.latLngBounds(review.alternative));
  const key=drawRouteLines(layer,{planned:[review.original],travelled},{
    travelled:local('Evidence-based alternative','依據證據的替代路線'),
    planned:local('Original suggested route','原建議路線'),
  });
  if(review.baseline.facility)L.circleMarker(review.facilityPoint,{radius:8,color:'#fff',weight:2,fillColor:'#9b4039',fillOpacity:1})
    .bindPopup(local('Lift interruption reported in the AR replay.','AR 重播中有升降機服務中斷紀錄。')).addTo(layer);
  for(const row of review.originalCautions)L.circleMarker(row.point,{radius:7,color:'#fff',weight:2,fillColor:'#785e2e',fillOpacity:1})
    .bindPopup(local('Simulated CCTV caution near the original route.','原建議路線附近的閉路電視模擬提示。')).addTo(layer);
  const length=line=>Math.round(line.slice(1).reduce((total,point,i)=>total+distanceBetween(line[i],point),0)/10)*10;
  const card=(title,geometry,stats)=>cls('div','loop-row',el('h3',title),
    el('strong',length(geometry)+' m'),
    el('p',stats.flow===null?local('No comparable timed sample','沒有可比較的定時樣本'):
      local(stats.flow+' camera-line crossings in '+stats.seconds+' seconds',
        stats.seconds+' 秒內有 '+stats.flow+' 次穿越相機計數線')),
    ...(stats.facility?[el('p',local('Lift interruption flag → review access','升降機停用提示 → 查核通行'))]:[]));
  const controls=cls('div','study-options',
    button(local('Fit routes','顯示路線'),()=>map.fitBounds(extent,{padding:[26,36],maxZoom:18,animate:false})),
    link(local('Central Market example','中環街市示例'),evidenceLink(lang,'market')),
    link(local('Open Street Study','開啟街道研究'),'./?shell=55#mode=planner&view=street&lang='+lang),
    link(local('Back to Directions','返回路線指引'),'./?shell=55#mode=public&view=directions&lang='+lang));
  root.replaceChildren(el('h2',local('Routes with street observations','結合街道觀察的路線')),
    cls('p','subtle',local('Central → Star Ferry Pier 7 · 17:00 replay scenario','中環 → 天星小輪七號碼頭 · 17:00 重播情境')),
    key,
    cls('div','loop-metrics',card(local('Original suggested route','原建議路線'),review.original,review.baseline),
      ...(review.recommend?[card(local('Evidence-based alternative','依據證據的替代路線'),review.alternative,review.updated)]:[])),
    cls('p','loop-method',review.recommend?local('The replay favours the ramp and waterfront. The timed sample had fewer crossings there, and the path avoids the reported lift interruption.',
      '重播傾向採用斜道及海濱路線。該處定時樣本較少行人穿越計數線，路線亦繞過有停用紀錄的升降機。'):
      review.hasReplay?local('The comparison did not clear an alternative under the replay rules.',
        '按重播規則，此比較未能提出替代路線。'):
      local('Complete a Central AR replay to populate the comparison with dated observations.',
        '完成中環 AR 重播，即可加入附時間的觀察，進行路線比較。')),
    cls('p','subtle',local(review.cctv.length?'CCTV replay screened '+review.cctv.length+' cautions. Within 22 m of route geometry: '+review.originalCautions.length+' original, '+review.alternativeCautions.length+' alternative. The ramp needs field verification.':
      'CCTV checks can be added through Street Study. The ramp and route choice are illustrative.',
      review.cctv.length?'閉路電視重播共篩查 '+review.cctv.length+' 項提示。路線 22 米內：原路線 '+review.originalCautions.length+' 項，替代路線 '+review.alternativeCautions.length+' 項。斜道須實地核實。':
      '可在街道研究加入閉路電視檢查。斜道及路線選擇為示意。')),
    controls);
  return extent;
}
