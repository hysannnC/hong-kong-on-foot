import {centralCases,reviewCameraBatch} from './central-camera.mjs?v=53';
import {evidenceDetails} from './evidence-details.mjs?v=53';
import {downloadJSON} from './data-downloads.mjs?v=53';
import {arReplayEvidence,cameraEvidence,evidenceNames,evidenceTime,fieldEvidence} from './field-evidence.mjs?v=53';
import {drawRouteLines,fitTripComparison} from './trip-map.mjs?v=53';
import {evidenceIcon,evidenceLegend,observationMarkers} from './evidence-markers.mjs?v=53';

const origin=[22.28332,114.15465],destination=[22.28468,114.1585];
const cases=[
  {kind:'flow',ids:['ar-central-market-flow'],edge:1206552,impact:120,point:[22.28401,114.15522],
    site:['Central Market passage','中環街市通道'],
    rule:['Add 2 minutes to the busy passage in the replay.','在重播中，為繁忙通道增加 2 分鐘。']},
  {kind:'facility',ids:['cctv-central-facility-0','ar-central-5t'],edge:1487437,impact:Infinity,point:[22.28339,114.15469],
    site:['Mid-Levels walkway connector','半山行人通道接駁段'],
    rule:['Exclude the connector associated with the replayed service interruption.','排除重播中受服務中斷影響的接駁段。']},
  {kind:'water',ids:['cctv-central-water-0','ar-central-water'],edge:13931,impact:Infinity,point:[22.284926,114.156737],
    site:['Connaught Road access near Jubilee Street','干諾道中近租庇利街通道'],
    rule:['Exclude the access link treated as blocked by standing water in this scenario.','排除此情境中因積水而被視為封閉的通道。']},
  {kind:'crossing',ids:['cctv-central-crossing-0','ar-central-crossing'],edge:1205459,impact:90,point:[22.28433,114.156145],
    site:['Queen Victoria Street crossing approach','域多利皇后街過路接駁'],
    rule:['Add a crossing-conflict penalty equal to 90 seconds of routing cost. This is a preference weight.','加入等同 90 秒路線成本的過路衝突權重。此為路線偏好權重。']},
  {kind:'blockage',ids:['cctv-central-blockage-0','cctv-central-blockage-1','cctv-central-blockage-2'],
    edge:13244,impact:Infinity,point:centralCases.blockage.where,site:centralCases.blockage.place,
    rule:['Avoid the approach while temporary works narrow the passage in the replay.','重播中的臨時工程令通道收窄，路線會避開該接駁路段。']},
];
const states=new WeakMap();
let worker,nextRequest=0;
const requests=new Map();
function route(impacts){
  if(!worker){
    worker=new Worker('reach.js?v=53');
    worker.onmessage=({data})=>{
      requests.get(data.id)?.(data.route||null);
      requests.delete(data.id);
    };
    worker.onerror=()=>{
      for(const resolve of requests.values())resolve(null);
      requests.clear();worker.terminate();worker=null;
    };
  }
  return new Promise(resolve=>{
    const id=++nextRequest;
    requests.set(id,resolve);
    worker.postMessage({id,origin,destination:{coords:destination},pace:1.15,stairs:false,hills:false,wheelchair:false,
      replayImpacts:Object.fromEntries(impacts.map(({edge,impact})=>[edge,impact]))});
  });
}

function exampleRecords(){
  const available=new Map([...arReplayEvidence,...cameraEvidence(reviewCameraBatch())].map(row=>[row.id,row]));
  for(const row of fieldEvidence())available.set(row.id,row);
  return cases.map(entry=>({...entry,observations:entry.ids.map(id=>available.get(id)).filter(Boolean)
    .map(row=>({...row,reportedPoint:row.point,point:entry.point,site:entry.site}))}));
}
function linkLines(route){
  const lines=[];
  for(const [a,b,,metres] of route.legs){
    if(metres<=.02)continue;
    const last=lines.at(-1)?.at(-1);
    if(last&&last[0]===a[0]&&last[1]===a[1])lines.at(-1).push(b);
    else lines.push([a,b]);
  }
  return lines;
}
const hasEdge=(route,id)=>route.legs.some(leg=>leg[3]>.02&&leg[5]===id);
const el=(tag,...children)=>{const node=document.createElement(tag);node.append(...children);return node;};
const css=(tag,name,...children)=>{const node=el(tag,...children);node.className=name;return node;};
const anchor=(text,href)=>{const node=el('a',text);node.href=href;return node;};
const button=(text,action)=>{const node=el('button',text);node.type='button';node.onclick=action;return node;};

export function marketRoutePanel({root,map,layer,lang,planner=false,refit=false}){
  const t=(en,zh)=>lang==='zh'?zh:en;
  let state=states.get(root);
  if(!state){
    const saved=new URLSearchParams(location.search).get('caseKinds');
    state={enabled:new Set(saved===null?cases.map(entry=>entry.kind):saved.split(',').filter(Boolean)),sequence:0,calculations:new Map()};
    states.set(root,state);
  }
  if(refit)state.fitted=false;
  const events=exampleRecords();
  const output=css('div','market-route-control');
  const otherView=anchor(planner?t('View the public comparison','查看公眾路線比較'):
    t('Open planner analysis','開啟規劃分析'),'#');
  output.setAttribute('aria-live','polite');
  const checks=css('div','market-impact-options');
  for(const entry of events){
    const input=el('input');input.type='checkbox';input.checked=state.enabled.has(entry.kind);
    input.onchange=()=>{if(input.checked)state.enabled.add(entry.kind);else state.enabled.delete(entry.kind);update();};
    checks.append(el('label',input,evidenceIcon(entry.kind),t(...evidenceNames[entry.kind])));
  }
  const extent=L.latLngBounds([origin,destination]);
  const resultCards=(original,updated)=>{
    const selected=events.filter(event=>state.enabled.has(event.kind));
    const card=(label,route)=>{
      const affected=selected.filter(event=>hasEdge(route,event.edge));
      return css('div','loop-row',el('h3',label),el('strong',Math.round(route.metres)+' m'),
        el('p',t(affected.length+' active caution links on route','路線上有 '+affected.length+' 個已啟用的注意路段')));
    };
    return css('div','loop-metrics',card(t('Original suggested route','原建議路線'),original),
      ...(updated?[card(t('Route with selected evidence','套用所選證據的路線'),updated)]:[]));
  };
  function update(){
    const token=++state.sequence, selected=events.filter(event=>state.enabled.has(event.kind)&&event.observations.length);
    otherView.href='./?shell=53&fieldLoop=1&routeCase=market&caseKinds='+encodeURIComponent(selected.map(event=>event.kind).join(','))+
      (planner?'#mode=public&view=directions&lang=':'#mode=planner&view=trips&lang=')+lang;
    output.replaceChildren(css('p','subtle',t('Calculating routes on the walking network…','正在步行網絡計算路線…')));
    state.baseline??=route([]).then(result=>{if(!result)state.baseline=null;return result;});
    const key=selected.map(entry=>entry.kind).join(',');
    if(key&&!state.calculations.has(key))state.calculations.set(key,route(selected).then(result=>{
      if(!result)state.calculations.delete(key);
      return result;
    }));
    Promise.all([state.baseline,key?state.calculations.get(key):state.baseline]).then(([original,updated])=>{
      if(token!==state.sequence||root.hidden||!output.isConnected)return;
      if(!original){output.replaceChildren(el('p',t('The walking graph is unavailable.','無法使用步行網絡。')),
        button(t('Retry','重試'),update));return;}
      layer.clearLayers();
      const originalLines=linkLines(original),updatedLines=updated?linkLines(updated):[];
      const changed=Boolean(updated&&selected.length&&JSON.stringify(originalLines)!==JSON.stringify(updatedLines));
      const legend=drawRouteLines(layer,{planned:originalLines,travelled:changed?updatedLines:[]},{
        planned:t('Original suggested route','原建議路線'),travelled:t('Evidence-based alternative','依據證據的替代路線'),
      });
      const bounds=L.latLngBounds([...originalLines.flat(),...updatedLines.flat()]);
      const points=observationMarkers({map,layer,rows:selected.flatMap(event=>event.observations),lang,planner});
      if(points.isValid())bounds.extend(points);
      for(const [index,point] of [originalLines[0][0],originalLines.at(-1).at(-1)].entries()){
        const marker=L.circleMarker(point,{radius:7,color:'#fff',weight:2,
          fillColor:index?'#c7514d':'#29865b',fillOpacity:1,interactive:false});
        marker.addTo(layer);
      }
      const outcome=updated?changed?t('The map found a different route under the selected conditions.','地圖按所選情況找到不同路線。'):
        t('The original route still ranks first under the selected conditions.','按所選情況，原路線仍排首位。'):
        t('The selected restrictions leave no route in this example.','所選限制使此示例沒有可行路線。');
      const notes=css('ul','market-evidence-notes',...selected.map(event=>{
        const sources=event.observations.map(row=>{
          const label=row.source==='ar-replay'?t('AR replay','AR 重播'):t('CCTV replay','閉路電視重播');
          return planner?label+' '+evidenceTime(row.at)+' HKT':label;
        });
        const item=el('li',el('strong',t(...event.site)),el('br'),t(...event.rule),el('br'),css('span','subtle',sources.join(' · ')));
        const details=evidenceDetails(event.observations[0],lang);
        if(planner)item.append(el('ul',...details.facts.map(([label,value])=>el('li',el('strong',label),' · '+value))));
        item.append(el('br'),el('strong',t('Follow-up','跟進建議')),' · '+(planner?details.followUp:details.action));
        return item;
      }));
      const impact=selected.length&&planner?css('section','trip-chart',el('h3',t('Observations used in routing','用於計算路線的觀察')),notes):
        el('details',el('summary',t('How each observation changes routing','各項觀察如何影響路線')),notes);
      const difference=updated?Math.round(updated.metres)-Math.round(original.metres):0;
      const routesExport=button(t('Download route comparison data (JSON)','下載路線比較資料（JSON）'),()=>{
        const legs=result=>result?{
          distance_m:result.metres,weighted_cost_seconds:result.seconds,
          legs:result.legs.map(([from,to,flags,metres,grade,linkId])=>({
            from,to,link_id:linkId,network_flags:flags,length_m:metres,grade_pct:grade*100,
          })),
        }:null;
        downloadJSON('central-market-route-comparison.json',{
          source:'Illustrative route replay on the pedestrian network',
          coordinates:'[latitude, longitude] in decimal degrees',
          origin,destination,changed,
          observation_rules:events.map(event=>({
            kind:event.kind,applied:selected.includes(event),link_id:event.edge,link_point:event.point,
            site:event.site,evidence_metrics:evidenceDetails(event.observations[0],lang).metrics,
            reference_photo:evidenceDetails(event.observations[0],lang).photo?.media??null,
            follow_up:evidenceDetails(event.observations[0],lang).followUp,blocks_link:event.impact===Infinity,
            penalty_seconds:Number.isFinite(event.impact)?event.impact:null,
            records:event.observations.map(({at,point,reportedPoint,site,...row})=>({
              ...row,observed_point:reportedPoint,timestamp_utc:new Date(at).toJSON(),
            })),
          })),
          original:legs(original),with_selected_observations:legs(updated),
        });
      });
      output.replaceChildren(legend,resultCards(original,updated),el('p',outcome),
        ...(planner&&difference>0?[el('p',t('The alternative adds '+difference+' m.','替代路線增加 '+difference+' 米。'))]:[]),
        ...(selected.length?[evidenceLegend(lang),impact]:[]),
        ...(planner?[routesExport]:[]),
        button(t('Fit routes and observations','顯示路線及觀察位置'),()=>fitTripComparison(map,bounds)));
      extent.extend(bounds);
      if(!state.fitted){fitTripComparison(map,bounds);state.fitted=true;}
    }).catch(()=>{
      if(token===state.sequence)output.replaceChildren(el('p',t('Route calculation failed.','路線計算失敗。')),button(t('Retry','重試'),update));
    });
  }
  root.replaceChildren(
    el('h2',t('Central Market → Hong Kong Station','中環街市 → 香港站')),
    css('p','subtle',t('Replay example for an ordinary walking profile. Switch observations on or off to recalculate. Sample conditions and weights are illustrative.',
      '一般步行模式的重播示例。切換觀察即可重新計算。樣本路況和權重僅供示範。')),
    css('p','subtle',t('Hover, focus or tap a map symbol for evidence and follow-up. Photos are archived references.',
      '將游標移至地圖符號、用鍵盤選取或點按，即可查看證據及跟進建議。照片為存檔參考。')),
    checks,output,
    css('div','study-options',
      anchor(t('Street observations','街道觀察'),'./?shell=53&streetSub=observations#mode=planner&view=street&lang='+lang),
      otherView));
  update();
  return extent;
}
