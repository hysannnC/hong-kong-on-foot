import {evidenceLegend,observationMarkers} from './evidence-markers.mjs?v=53';
import {downloadCSV,downloadJSON} from './data-downloads.mjs?v=53';
import {addFieldEvidence,cameraEvidence} from './field-evidence.mjs?v=53';
import {observationPanel,evidenceLink} from './feedback-panel.mjs?v=53';
import {mapColor,mapGradient} from '../map-colors.mjs';
import {edgeFlow,loadCentralNetwork,nearestFlowEdge} from './central-flow.mjs?v=53';
import {centralCases,reviewCameraBatch} from './central-camera.mjs?v=53';
import {getDetector} from './vision.mjs';
import {photos} from './street-photos.mjs';
import {benchmark} from './street-model.mjs';

export function mountCentralStudy(root,map,layer){
  let lang='en',active=false,tab=new URLSearchParams(location.search).get('streetSub')==='observations'?'observations':'flow',hour=17,network,extent,pending,error=false,selected,selectionLayer;
  let stage=0,results=[],filter='',panels={},photoId='pedder',observationSource='',savedBatch=false;
  const photoCounts=new Map();
  const t=(en,zh)=>lang==='zh'?zh:en;
  const el=(tag,...children)=>{const node=document.createElement(tag);node.append(...children);return node;};
  const styled=(tag,cls,...children)=>{const node=el(tag,...children);node.className=cls;return node;};
  const button=(label,action,pressed)=>{
    const node=el('button',label);node.type='button';node.onclick=action;
    if(pressed!==undefined)node.setAttribute('aria-pressed',String(pressed));
    return node;
  };
  const link=(label,href)=>{const node=el('a',label);node.href=href;return node;};
  const quiet=copy=>styled('p','subtle',copy);
  const n=value=>new Intl.NumberFormat(lang==='zh'?'zh-HK':'en-HK').format(value);
  const time=h=>String(h).padStart(2,'0')+':00';
  const visibleCases=()=>Object.entries(centralCases).filter(([id])=>!filter||filter===id);
  function focus(bounds){
    if(!bounds?.isValid())return;
    map.stop().invalidateSize({pan:false});
    map.fitBounds(bounds,{padding:[25,30],maxZoom:18,animate:false});
  }
  function fit(){
    if(tab==='flow')focus(extent);
    else if(tab==='cameras'){
      const points=stage===2?cameraEvidence(results).filter(row=>!filter||row.kind===filter).map(row=>row.point):
        visibleCases().map(([,entry])=>entry.where);
      focus(L.latLngBounds(points));
    }
  }
  function load(){
    if(network||pending)return;
    error=false;
    pending=loadCentralNetwork().then(value=>{
      network=value;
      extent=L.latLngBounds(network.edges.flatMap(edge=>edge.line));
    }).catch(()=>{error=true;}).finally(()=>{
      pending=null;
      if(active&&tab==='flow'){render();if(network)fit();}
    });
    render();
  }
  function edgeLabel(edge){
    if(edge.flags&32)return t('Lift link','升降機接駁');
    if(edge.flags&1)return t('Stair link','樓梯接駁');
    if(edge.flags&256)return t('Elevated link','高架接駁');
    if(edge.flags&128)return t('Subway link','隧道接駁');
    if(edge.flags&64)return t('Ramp link','斜道接駁');
    return t('Pedestrian link','行人接駁');
  }
  function updateSelected(){
    const box=panels.detail;
    if(!box)return;
    if(selectionLayer){layer.removeLayer(selectionLayer);selectionLayer=null;}
    if(!selected){
      box.replaceChildren(quiet(t('Tap any mapped path to inspect its simulated flow.','點選任一路徑查看模擬行人流量。')));
      return;
    }
    const load=edgeFlow(selected,hour,true);
    selectionLayer=L.layerGroup([
      L.polyline(selected.line,{color:'#16362e',weight:8,interactive:false}),
      L.polyline(selected.line,{color:mapColor(load.ratio),weight:5,interactive:false}),
      ...selected.line.map((point,i)=>L.circleMarker(point,{radius:8,fillOpacity:1,fillColor:'#fff',color:'#16362e',weight:2})
        .bindTooltip(i?'B':'A',{permanent:true,direction:'top',offset:[0,-3],className:'study-endpoint'})),
    ]).addTo(layer);
    const formula=selected.flags&32?t('Example lift benchmark of 480 people per hour.','升降機示例基準為每小時 480 人。'):
      t(selected.width+' m assumed clear width × '+benchmark+' people/min/m × 60.','假設淨寬 '+selected.width+' 米 × '+benchmark+' 人／分鐘／米 × 60。');
    box.replaceChildren(el('h3',edgeLabel(selected)+' · '+selected.id),
      el('strong',t(n(Math.round(load.ratio*100))+'% of hourly benchmark','每小時基準的 '+n(Math.round(load.ratio*100))+'%')),
      el('p',t(n(load.toward)+' people/h A → B · '+n(load.away)+' people/h B → A',
        '每小時 '+n(load.toward)+' 人 A → B · '+n(load.away)+' 人 B → A')),
      quiet(t(n(load.count)+' line crossings in a five-minute replay × 12, against a benchmark of '+n(selected.capacity)+' people/h.',
        '五分鐘重播有 '+n(load.count)+' 次穿越計數線 × 12，基準為每小時 '+n(selected.capacity)+' 人。')+' '+formula));
  }
  map.on('click',event=>{
    if(!active||tab!=='flow'||!network)return;
    const edge=nearestFlowEdge([event.latlng.lat,event.latlng.lng]);
    if(edge){selected=edge;updateSelected();}
  });
  function drawFlow(){
    layer.clearLayers();selectionLayer=null;
    L.polyline(network.boundary,{dashArray:'4 6',weight:1.5,color:'#516860',opacity:.65,interactive:false}).addTo(layer);
    const bins=Array.from({length:32},()=>[]);
    let busy=0,peak=null;
    for(const edge of network.edges){
      const {ratio}=edgeFlow(edge,hour);
      bins[Math.min(31,Math.floor(ratio*31))].push(edge.line);
      if(ratio>=.8)busy++;
      if(!peak||ratio>peak.ratio)peak={edge,ratio};
    }
    for(const [index,lines] of bins.entries()){
      if(lines.length)L.polyline(lines,{color:mapColor(index/31),weight:3.5,opacity:.92,interactive:false}).addTo(layer);
    }
    panels.window.textContent=time(hour)+'–'+time((hour+1)%24)+' HKT';
    panels.input.setAttribute('aria-valuetext',time(hour)+' HKT');
    panels.busy.textContent=t(n(busy)+' links at or above 80% of benchmark',n(busy)+' 條接駁達到或超過基準的 80%');
    panels.early.setAttribute('aria-pressed',String(hour===6));
    panels.peak.setAttribute('aria-pressed',String(hour===17));
    panels.find.disabled=!peak||peak.ratio===0;
    panels.find.onclick=()=>{
      if(!peak)return;
      selected=peak.edge;
      map.setView(selected.mid,18.5,{animate:false});updateSelected();
    };
    updateSelected();
  }
  function photoCalibration(){
    const choices=['pedder','desvoeux','bridge'];
    const photo=photos[photoId];
    const image=el('img');image.src=photo.file;image.alt=t(...photo.name);image.loading='lazy';
    const select=el('select',...choices.map(id=>new Option(t(...photos[id].name),id)));
    select.value=photoId;
    select.setAttribute('aria-label',t('Central calibration photo','中環校準照片'));
    const detail=el('details',el('summary',t('Try a snapshot count','試算單張照片人數')),
      quiet(t('The person detector counts visible people in the frame. Directional flow requires tracking across frames.',
        '行人辨識模型點算畫面內可見的人。方向流量須追蹤連續畫面。')),select);
    detail.open=photoCounts.has(photoId);
    detail.className='study-calibration';
    const measurement=quiet('');measurement.setAttribute('role','status');
    const show=value=>measurement.textContent=value==='error'?t('Person detection unavailable on this device.','此裝置暫無法辨識行人。'):
      Number.isInteger(value)?t(value+' people detected in the full frame.', '整張照片辨識到 '+value+' 人。'):'';
    const scan=button(t('Count visible people','點算可見行人'),async()=>{
      const id=photoId;scan.disabled=true;
      measurement.textContent=t('Counting visible people…','正在點算可見行人…');
      try{
        await image.decode();
        const model=await getDetector();
        const objects=await model.detect(image,65,.5);
        photoCounts.set(id,objects.filter(object=>object.class==='person').length);
      }catch{photoCounts.set(id,'error');}
      show(photoCounts.get(id));scan.disabled=false;
    });
    detail.append(styled('figure','study-frame',image,el('figcaption',link(photo.by,photo.url),' · ',link(t('License','授權'),photo.license))),
      scan,measurement);
    show(photoCounts.get(photoId));
    select.onchange=()=>{photoId=select.value;const next=photoCalibration();next.open=true;detail.replaceWith(next);next.querySelector('select').focus();};
    return detail;
  }
  function flow(){
    if(!network){
      const state=quiet(error?t('Central network could not be loaded.','無法載入中環網絡。'):t('Loading the original pedestrian network…','正在載入原有行人網絡…'));
      state.setAttribute('role','status');
      return [state,...(error?[button(t('Retry','重試'),load)]:[])];
    }
    const input=el('input');input.type='range';input.min=0;input.max=23;input.value=hour;
    input.setAttribute('aria-label',t('Crowd-flow hour','人流時段'));
    function setHour(value){hour=value;input.value=hour;drawFlow();}
    input.oninput=()=>setHour(Number(input.value));
    const gradient=styled('div','study-gradient');
    gradient.style.background='linear-gradient(90deg,'+mapGradient+')';
    const ticks=styled('div','study-gradient-ticks',...['0%','25%','50%','75%','100%+'].map(x=>el('span',x)));
    const scope=t(n(network.edges.length)+' pedestrian links · '+n(Math.round(network.length/1000))+' km of mapped links, including stacked levels',
      n(network.edges.length)+' 條行人接駁 · 共 '+n(Math.round(network.length/1000))+' 公里，包括不同樓層');
    panels={input,window:el('strong'),busy:el('strong'),detail:styled('div','study-kpi'),
      early:button(t('Early · 06:00','清晨 · 06:00'),()=>setHour(6)),peak:button(t('Evening · 17:00','傍晚 · 17:00'),()=>setHour(17)),
      find:button(t('Inspect busiest link','檢視最繁忙接駁'),()=>{})};
    const method=el('details',el('summary',t('Coverage and calculation','涵蓋範圍及計算')),
      quiet(t('Coverage uses the 2019 Chung Wan (A01) study boundary and every link in the original LandsD walking graph clipped to it. Stacked links can overlap on the map.',
        '範圍採用 2019 年中環（A01）界線，涵蓋原有地政總署步行網絡在界線內的所有接駁。不同樓層在地圖上或會重疊。')),
      quiet(t('Hourly counts and clear widths are replay assumptions. The scale is estimated hourly throughput divided by an illustrative planning benchmark. Snapshot counts alone cannot measure throughput.',
        '每小時流量及淨寬為重播假設。色階為估算每小時流量除以示意規劃基準。單張照片的人數無法直接量度流量。')),
      el('p',link(t('LandsD walking network','地政總署步行網絡'),'https://www.devb.gov.hk/en/home/my_blog/index_id_482.html'),' · ',
        link(t('2019 Chung Wan boundary data','2019 中環選區界線資料'),'https://github.com/hkdce/dcca-boundaries')));
    const exportFlow=button(t('Download selected hour (CSV)','下載所選時段（CSV）'),()=>{
      const window=String(hour).padStart(2,'0')+'00';
      downloadCSV('central-crowd-flow-'+window+'-hkt.csv',[
        'source','hour_start_hkt','link_id','link_length_m','a_latitude','a_longitude','b_latitude','b_longitude',
        'assumed_clear_width_m','sample_window_minutes','sample_line_crossings','estimated_a_to_b_people_per_hour',
        'estimated_b_to_a_people_per_hour','estimated_total_people_per_hour','benchmark_people_per_hour','percent_of_benchmark',
      ],network.edges.map(edge=>{
        const value=edgeFlow(edge,hour);
        return ['simulated',time(hour),edge.id,edge.length,...edge.line.flat(),edge.flags&32?null:edge.width,5,value.count,
          value.toward,value.away,value.toward+value.away,edge.capacity,Math.round(value.ratio*10000)/100];
      }));
    });
    drawFlow();
    return [quiet(t('2019 Chung Wan (A01) study boundary','2019 年中環（A01）研究界線')),quiet(scope),styled('div','study-hour',el('label',panels.window,input),styled('div','study-options',panels.early,panels.peak)),
      styled('div','study-flow-scale',el('strong',t('Simulated share of hourly benchmark','模擬流量佔每小時基準')),gradient,ticks),
      panels.busy,styled('div','study-options',panels.find,button(t('Fit Central network','顯示中環網絡'),fit)),panels.detail,exportFlow,quiet(t('Includes every mapped link for the selected Hong Kong hour. Counts and capacity benchmarks are simulated.',
        '包含所選香港時段的所有已繪製路段。流量和容量基準為模擬數據。')),method,photoCalibration()];
  }

  function switchStage(next){
    if(next>0&&!results.length)results=reviewCameraBatch();
    stage=next;filter='';
    if(stage===2)savedBatch=addFieldEvidence(cameraEvidence(results));
    render();
    fit();
    root.querySelector('.camera-stage')?.focus({preventScroll:true});
  }
  function cameraFrame(entry){
    const image=el('img');image.src=entry.image;image.alt=t(...entry.place);image.referrerPolicy='no-referrer';
    const frame=styled('div','camera-frame',image);
    image.onerror=()=>{image.hidden=true;frame.classList.add('camera-frame-unavailable');
      frame.append(link(t('Open source image','開啟原始影像'),entry.media));};
    if(stage===1){
      const box=styled('span','camera-box');
      const [left,top,width,height]=entry.box;
      Object.assign(box.style,{left:left+'%',top:top+'%',width:width+'%',height:height+'%'});
      box.setAttribute('aria-hidden','true');frame.append(box);
    }
    const credit=el('figcaption',t(...entry.caption),' ',link(t(...entry.credit),entry.media));
    if(entry.license)credit.append(' · ',link(t('License','授權'),entry.license));
    return styled('figure','study-frame',frame,credit);
  }
  function ruleEvidence(entry){
    const match=entry.matched;
    const labels={
      blockage:t(match+' separate sample days below the '+entry.widthThreshold+' m clear-width threshold.',
        '有 '+match+' 個不同樣本日的通道淨寬低於 '+entry.widthThreshold+' 米。'),
      facility:t(match+' of '+entry.samples.length+' notice reads matched asset 5T and the outage wording.',
        entry.samples.length+' 筆告示辨識中，'+match+' 筆配對到設施 5T 及停用字句。'),
      water:t(match+' consecutive sample frames showed water at the kerb.',
        '有 '+match+' 幀連續樣本顯示路緣積水。'),
      crossing:t(match+' of '+entry.samples.length+' tracks met the red-entry and outside-crossing checks.',
        entry.samples.length+' 條軌跡中有 '+match+' 條符合紅燈進入及在過路線外的條件。'),
    };
    return labels[entry.id];
  }
  function cameras(){
    const steps=[[t('1. Camera frames','1. 相機畫面'),0],[t('2. Screen signals','2. 篩查訊號'),1],[t('3. Map and act','3. 地圖及跟進'),2]];
    const stepsNode=styled('ol','camera-steps',...steps.map(([label,index])=>{
      const control=button(label,()=>switchStage(index));
      if(index===stage)control.setAttribute('aria-current','step');
      return el('li',control);
    }));
    const title=el('h3',[t('One batch, four Central cases','同一批次，四個中環案例'),t('Four checks in one run','一次執行四項檢查'),t('Planning results','規劃結果')][stage]);
    title.className='camera-stage';title.tabIndex=-1;
    const intro=[
      t('Archived site images stand in for one CCTV batch. The caption on each frame identifies its source.',
        '以存檔實景影像模擬同一批閉路電視畫面。各畫面說明列明來源。'),
      t('The agent runs four evidence rules on annotated replay inputs. Highlighted areas show where each check would look.',
        '代理在已標註的重播輸入執行四項證據規則。標記範圍顯示各項檢查的觀察位置。'),
      t('Compare cautions mapped in Central. Each photo is credited at its original location.',
        '比較中環地圖上的注意事項。照片均標明原拍攝地點。'),
    ][stage];
    const forward=stage===0?button(t('Run all four checks','執行四項檢查'),()=>{
      results=reviewCameraBatch();switchStage(1);
    }):stage===1?button(t('Map findings and review actions','在地圖顯示結果及跟進建議'),()=>switchStage(2)):null;
    if(forward)forward.className='accent';
    const back=stage>0?button(stage===1?t('Back to camera frames','返回相機畫面'):t('Review signal checks','覆核訊號檢查'),()=>switchStage(stage-1)):null;
    const controls=styled('div','study-options',...[forward,back].filter(Boolean));
    if(results.length)controls.append(button(t('Download camera replay data (JSON)','下載相機重播資料（JSON）'),()=>
      downloadJSON('central-camera-replay.json',{
        source:'CCTV replay with annotated example inputs',
        coordinates:'[latitude, longitude] in decimal degrees',
        checks:results.map(entry=>({
          kind:entry.id,site:entry.place,reference_point:entry.where,image_reference_url:entry.media,
          license_url:entry.license??null,source_url:entry.source,sample_inputs:entry.samples,
          matched_count:entry.matched,flagged:entry.flagged,planning_action:entry.action,
        })),
        mapped_cautions:cameraEvidence(results).map(({at,...row})=>({...row,timestamp_utc:new Date(at).toISOString()})),
      })));
    if(stage<2){
      const previewMarkers=new Map();
      for(const [id,entry] of Object.entries(centralCases)){
        const glyph=styled('span','observation-symbol observation-camera','📷');
        const marker=L.marker(entry.where,{
          icon:L.divIcon({className:'observation-marker',html:glyph,iconSize:[27,27],iconAnchor:[13,13]}),
          title:t(...entry.name),alt:t(...entry.name),bubblingMouseEvents:false,
        });
        marker.bindTooltip(t(...entry.name)+' · '+t(...entry.place));
        marker.bindPopup(()=>el('div',el('strong',t(...entry.name)),quiet(t(...entry.place)),cameraFrame(entry),
          quiet(t('Illustrative replay location in Central. The photo credit identifies its actual capture location.',
            '中環示意重播位置。照片說明標明實際拍攝地點。'))),{maxWidth:300,maxHeight:350});
        marker.addTo(layer);previewMarkers.set(id,marker);
      }
      const cards=Object.entries(centralCases).map(([id,entry])=>{
        const result=results.find(row=>row.id===id);
        const content=[el('h3',t(...entry.name)),quiet(t(...entry.place)),cameraFrame(entry),
          button(t('Show camera location','顯示相機位置'),()=>{
            map.setView(entry.where,18,{animate:false});previewMarkers.get(id)?.openPopup();
          })];
        if(stage===1)content.push(styled('strong','camera-cue',t(...entry.cue)),el('p',ruleEvidence(result)),quiet(t(...entry.method)),
          styled('p','camera-finding',result?.flagged?t('Caution flagged for review','已標示注意事項，待覆核'):t('Rule did not pass','未符合規則')));
        return styled('article','camera-case',...content);
      });
      return [stepsNode,title,quiet(intro),button(t('Show all camera locations','顯示所有相機位置'),fit),controls,...cards];
    }
    const shown=results.filter(entry=>entry.flagged&&(!filter||entry.id===filter));
    const filters=styled('div','study-options',...[[t('All cautions','所有注意事項'),''],...results.map(entry=>[t(...entry.name),entry.id])].map(([label,id])=>
      button(label,()=>{filter=id;render();fit();},filter===id)));
    const evidence=cameraEvidence(results);
    const markers=new Map();
    observationMarkers({map,layer,lang,planner:true,rows:evidence.filter(row=>!filter||row.kind===filter),
      onMarker:(kind,marker)=>{if(!markers.has(kind))markers.set(kind,marker);}});
    const cards=shown.map(entry=>{
      return styled('article','camera-case',el('h3',t(...entry.name)),quiet(t(...entry.place)),
        styled('strong','camera-cue',t(...entry.cue)),quiet(ruleEvidence(entry)),
        el('p',t(...entry.action)),
        quiet(t('Next evidence · ','下一步證據 · ')+t(...entry.next)),
        styled('div','study-options',button(t('Locate caution','顯示注意位置'),()=>{
          map.setView(entry.where,18.5,{animate:false});markers.get(entry.id)?.openPopup();
        }),link(t(...entry.sourceName),entry.source)));
    });
    const count=results.filter(entry=>entry.flagged).length;
    const summary=styled('p','camera-finding',t(evidence.length+' observation records · '+count+' checks flagged',
      evidence.length+' 筆觀察紀錄 · '+count+' 項檢查觸發'));
    return [stepsNode,title,quiet(intro),summary,
      quiet(t('Repeated observations at the same location share a symbol. Hover or select a symbol to see the evidence and follow-up.',
        '同一地點的重複觀察共用一個符號。將游標移至符號或選取，即可查看證據及跟進建議。')),evidenceLegend(lang),
      filters,button(t('Fit shown cautions','顯示所選注意事項'),fit),...cards,
      quiet(savedBatch?t('CCTV replay observations are available in Street observations.','閉路電視重播紀錄已加入街道觀察。'):
        t('This browser could not save the replay observations.','此瀏覽器未能儲存重播觀察。')),
      link(t('View the route comparison','查看路線比較'),evidenceLink(lang,'market')),controls];
  }

  function demoVideo(){
    const player=styled('video','loop-video');
    player.src='pilot/central-camera-workflow.mp4';player.controls=true;player.playsInline=true;player.preload='none';
    const subtitles=el('track');subtitles.kind='subtitles';subtitles.src='pilot/central-camera-workflow.zh.vtt';
    subtitles.srclang='zh-Hant';subtitles.label='繁體中文';subtitles.default=lang==='zh';player.append(subtitles);
    player.setAttribute('aria-label',t('Central CCTV workflow demonstration','中環閉路電視流程示範'));
    return el('details',el('summary',t('Watch the original three-check video','觀看原有三項檢查短片')),player);
  }
  function render(){
    if(!active)return;
    layer.clearLayers();
    const tabs=styled('div','study-options',
      button(t('Crowd flow','人流'),()=>{tab='flow';render();load();fit();},tab==='flow'),
      button(t('Camera replay','相機重播'),()=>{tab='cameras';render();fit();},tab==='cameras'),
      button(t('Street observations','街道觀察'),()=>{tab='observations';render();},tab==='observations'));
    const titles={flow:t('Central pedestrian network','中環行人網絡'),cameras:t('Central camera replay','中環相機重播'),
      observations:t('Street observations','街道觀察')};
    const detail=tab==='flow'?flow():tab==='cameras'?[demoVideo(),...cameras()]:
      observationPanel({lang,map,layer,filter:observationSource,select:next=>{observationSource=next;render();}});
    root.replaceChildren(el('h2',titles[tab]),tabs,...detail);
  }
  window.addEventListener('field-evidence-change',()=>{if(active&&tab==='observations')render();});
  return {
    show(language){
      const entering=!active;lang=language;active=true;render();
      if(tab==='flow'&&!error)load();
      if(entering)requestAnimationFrame(()=>{if(active)fit();});
    },
    hide(){active=false;},
  };
}
