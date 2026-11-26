import {observationMarkers} from './evidence-markers.mjs?v=54';
import {evidenceDetails,evidenceTitle} from './evidence-details.mjs?v=54';
import {demoTrips,demoTripById,drawDemoTrip,movementColors} from './demo-trips.mjs?v=54';
import {downloadJSON} from './data-downloads.mjs?v=54';
import {marketRoutePanel} from './market-routing.mjs?v=54';
import {exampleRouteDistances,observationLabel,tripMapURL,tripPaths} from './trip-journey.mjs?v=54';
import {drawTripComparison,fitTripComparison} from './trip-map.mjs?v=54';
import {exampleTripReview,summarizeTrips,tripCharts} from './trip-analysis.mjs?v=54';
import {mountCentralStudy} from './central-study.mjs?v=54';
import {behaviorSummary,streets} from './street-model.mjs?v=54';
import {mergeTrips,studyState} from './street-store.mjs?v=54';
import {publishedTrips} from './published-trips.mjs?v=54';

export function mountStreetPanel(root,map,tripRoot,completedTrip) {
  const layer=L.layerGroup().addTo(map);
  const centralStudy=mountCentralStudy(root,map,layer);
  const query=new URLSearchParams(location.search);
  const requestedSource=query.get('tripSource');
  let tripView=query.get('routeCase')==='market'||(!completedTrip&&!requestedSource)?'market':'saved';
  let tripSource=completedTrip?.source??(['phone','sample'].includes(requestedSource)?requestedSource:null),tripSegment='';
  let comparison=null,segmentExtent=null;
  let selectedTrip=completedTrip?.saved||completedTrip?.preview?completedTrip.id:'';
  let lang='en',visible=null,status='';
  const t=(en,tc)=>lang==='zh'?tc:en;
  const name=row=>row.name[lang==='zh'?1:0];
  const el=(tag,content=[],cls='')=>{
    const node=document.createElement(tag);node.className=cls;node.append(...[content].flat());return node;
  };
  const button=(text,fn,pressed)=>{
    const node=el('button',text);node.type='button';node.onclick=fn;
    if(pressed!==undefined)node.setAttribute('aria-pressed',String(pressed));
    return node;
  };
  const marketRoot=el('section',[],'market-route-control');
  const link=(label,url)=>{
    const anchor=el('a',label);anchor.href=url;return anchor;
  };
  function fit(){
    if(comparison?.extent.isValid()){fitTripComparison(map,comparison.extent);return;}
    if(segmentExtent?.isValid())fitTripComparison(map,segmentExtent);
  }
  function transfer(trips){
    const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
    const state=el('p','', 'subtle');state.setAttribute('role','status');
    input.onchange=async()=>{
      try{
        const file=input.files[0];
        if(!file||file.size>250000)throw Error();
        const payload=JSON.parse(await file.text());
        if(payload.version!==1)throw Error();
        const result=mergeTrips(payload.trips);
        if(!result.saved)throw Error();
        status=result.added+t(' imported observations.',' 筆觀察已匯入。');render();
      }catch{state.textContent=t('This file could not be imported. Use a street study export.','無法匯入。請使用街道研究匯出的檔案。');}
    };
    const download=button(t('Export observations','匯出觀察'),()=>{
      downloadJSON('hong-kong-on-foot-study.json',{version:1,trips});
    });download.disabled=!trips.length;
    const add=button(t('Import observations','匯入觀察'),()=>input.click());
    const summary=el('details',[
      el('summary',t('Import or export observations','匯入或匯出觀察')),
      el('div',[download,add,input],'study-options'),state,
    ],'study-transfer');
    if(status&&visible==='trips'){summary.open=true;state.textContent=status;}
    return summary;
  }
  function analysis(){
    const {trips}=studyState();
    const live=trips.filter(row=>row.source==='phone'), source=tripSource??(live.length?'phone':'sample');
    const preview=completedTrip?.preview;
    const sample=new Map(trips.filter(row=>row.source==='sample').map(row=>[row.id,row]));
    if(preview)sample.set(preview.id,preview);
    for(const {trip} of demoTrips)sample.set(trip.id,trip);
    const sampleRows=[...sample.values()].sort((a,b)=>b.day.localeCompare(a.day)||a.id.localeCompare(b.id));
    const population=source==='phone'?live:sampleRows;
    const inSegment=population.filter(row=>!tripSegment||(row.segment||'unmatched')===tripSegment);
    const focused=inSegment.find(row=>row.id===selectedTrip);
    const selected=focused?[focused]:inSegment;
    const segments=streets.filter(street=>population.some(row=>row.segment===street.id)).map(street=>{
      const records=population.filter(row=>row.segment===street.id);
      return {...street,camera:summarizeTrips(records),stats:behaviorSummary(records,street.id,source)};
    });
    const demo=demoTripById.get(focused?.id);
    const setSegment=id=>{
      tripSegment=id;selectedTrip='';render();fit();tripRoot.querySelector('.trip-segment')?.focus({preventScroll:true});
    };
    segmentExtent=L.latLngBounds((segments.find(street=>street.id===tripSegment)?.line??segments.flatMap(street=>street.line)));
    const routeTrip=focused?.source==='sample'?focused:
      focused?.id===completedTrip?.id&&completedTrip?.saved?completedTrip:null;
    const routePaths=routeTrip?tripPaths(routeTrip):null;
    comparison=routePaths&&(routePaths.planned.length||routePaths.actual.length)
      ?drawTripComparison({layer,map,trip:routeTrip,lang}):null;
    if(demo){
      layer.clearLayers();
      drawDemoTrip(layer,demo,{lang});
    }
    if(!comparison){
      if(source==='sample'){
        for(const row of selected){
          const example=demoTripById.get(row.id);
          if(example)drawDemoTrip(layer,example,{lang,select:()=>{
            selectedTrip=row.id;render();fit();
          }});
        }
      }else{
        for(const street of segments.filter(street=>street.stats.sessions)){
          L.polyline(street.line,{color:'#288476',weight:5}).bindTooltip(name(street)).on('click',()=>setSegment(street.id)).addTo(layer);
        }
      }
    }
    const detections=selected.flatMap(row=>demoTripById.get(row.id)?.observations||[]);
    const detectionMarkers=new Map();
    observationMarkers({map,layer,rows:detections,lang,planner:true,camera:true,
      onMarker:(_kind,marker,records)=>records.forEach(record=>detectionMarkers.set(record.id,marker))});
    const resetSelection=next=>{tripSource=next;tripSegment=selectedTrip='';render();fit();};
    const filter=el('select');
    filter.setAttribute('aria-label',t('Trip segment','行程路段'));
    filter.append(new Option(t('All recorded segments','所有已記錄路段'),''),
      ...segments.map(street=>new Option(name(street)+' · '+street.stats.sessions,street.id)),
      new Option(t('No mapped segment','沒有已配對路段')+' · '+population.filter(row=>!row.segment).length,'unmatched'));
    filter.value=tripSegment;
    filter.onchange=()=>setSegment(filter.value);
    filter.className='trip-segment';
    const choices=el('div',[button(t('Live phone','即時手機')+' · '+live.length,()=>resetSelection('phone'),source==='phone'),
      button(t('Simulated replay','模擬重播')+' · '+sampleRows.length,()=>resetSelection('sample'),source==='sample')],'study-options');
    const legend=el('div',[
      ...[['normal',t('Normal movement','正常移動')],['slow',t('Slowing','減速')],['stopped',t('Stopped','停頓')]].map(([state,label])=>{
        const item=el('span',label);item.style.setProperty('--study-color',movementColors[state]);return item;
      }),el('p',t('Green circle = start · Red circle = end. Red stretches mark stops. Select a route for details.','綠色圓點為起點，紅色圓點為終點。紅色路段標示停頓。選取路線查看詳情。'),'subtle'),
    ],'trip-route-key movement-route-key');
    const empty=el('p',t('No saved trips for this selection. Enable planner sharing before starting an AR trip.','此選項未有已儲存行程。開始 AR 行程前，可選擇分享予規劃人員。'),'trip-empty');
    const visibleSegments=segments.filter(street=>!tripSegment||street.id===tripSegment);
    const audit=source==='phone'&&visibleSegments.some(street=>street.stats.audit);
    const summary=audit?t('Review wayfinding on the selected segments. At least three phone trips over two days support a check.',
      '建議覆核所選路段的尋路指示。至少兩天有三次手機行程支持覆核。'):'';
    const picker=el('select');
    picker.setAttribute('aria-label',t('Trip selection','選擇行程'));
    const tripLabel=(row,index)=>{
      const street=segments.find(street=>street.id===row.segment);
      const label=demoTripById.has(row.id)?name(street):row.source==='sample'?t('IFC bridge replay','國際金融中心天橋重播'):
        t('Trip ','行程 ')+(index+1);
      return row.day+' · '+label;
    };
    picker.append(new Option(t('All trips in view','目前顯示的所有行程'),''),
      ...inSegment.map((row,index)=>new Option(tripLabel(row,index),row.id)));
    picker.value=focused?.id||'';
    picker.onchange=()=>{selectedTrip=picker.value;render();fit();tripRoot.querySelector('.trip-picker')?.focus({preventScroll:true});};
    picker.className='trip-picker';
    const tripEvents=focused?[...(focused.timeline||[]).map(event=>({...event,label:observationLabel(event.id,lang)})),
      ...detections.map(record=>({at:record.elapsed_seconds,label:t('Camera capture · ','相機擷取 · ')+evidenceTitle(record.kind,lang)}))]
      .sort((a,b)=>a.at-b.at):[];
    const timeline=tripEvents.length?el('section',[
      el('h3',t('Trip timeline','行程時間線')),
      el('ol',tripEvents.map(event=>el('li',[
        el('strong',Math.floor(event.at/60)+':'+String(event.at%60).padStart(2,'0')),event.label,
      ])),'trip-timeline'),
    ],'trip-chart'):null;
    const back=completedTrip?link(t('Back to trip summary','返回行程摘要'),tripMapURL(lang,false,true)):null;
    const details=demo&&comparison?[el('section',[
      el('h3',name(segments.find(street=>street.id===focused.segment))),
      el('p',focused.day+' · '+(demo.direction==='forward'?t('Forward trip','正向行程'):t('Return trip','回程'))),
      el('p',demo.distance+' m · '+t('Normal '+demo.normalSeconds+' s · Slowing '+demo.slowSeconds+' s · Stopped '+focused.pauses+' s',
        '正常 '+demo.normalSeconds+' 秒 · 減速 '+demo.slowSeconds+' 秒 · 停頓 '+focused.pauses+' 秒')),
      el('p',focused.cues.backtracks?t('This trip briefly doubled back along the same corridor. The map marks the backtrack point.',
        '此行程曾沿同一通道短暫折返。地圖標示了折返位置。'):t('The example trip followed the planned segment.',
        '此示例行程沿原定路段行走。'),'subtle'),
    ],'trip-chart')]:focused?.source==='sample'&&comparison?exampleTripReview({t,el,comparison,distances:exampleRouteDistances()}):
      comparison?[comparison.legend,el('p',t('This phone trace may have gaps. Saved planner records retain segment summaries.','手機路線記錄可能有缺漏。規劃資料保留路段摘要。'),'subtle')]:[];
    const selectedDemos=selected.flatMap(row=>demoTripById.has(row.id)?[demoTripById.get(row.id)]:[]);
    const days=new Set(selected.map(row=>row.day)).size;
    const routeCount=new Set(selected.map(row=>row.segment).filter(Boolean)).size;
    const duration=selected.reduce((total,row)=>total+row.moves+row.pauses,0);
    const distance=selectedDemos.reduce((total,row)=>total+row.distance,0);
    const scope=el('section',[
      el('h3',focused?t('Selected trip metrics','所選單次行程數據'):
        tripSegment?t('Selected route metrics','所選路線數據'):t('All saved trip metrics','所有已儲存行程數據')),
      el('p',t(selected.length+(selected.length===1?' trip':' trips')+' · '+routeCount+(routeCount===1?' route':' routes')+' · '+days+(days===1?' day':' days'),
        selected.length+' 次行程 · '+routeCount+' 條路線 · '+days+' 天')),
      ...(selectedDemos.length?[el('p',t('Mapped sample distance '+distance.toLocaleString()+' m',
        '已繪製樣本總距離 '+distance.toLocaleString()+' 米'))]:[]),
      ...(selected.length?[el('p',t('Average recorded duration '+Math.round(duration/selected.length)+' s per trip',
        '平均每次行程記錄時間 '+Math.round(duration/selected.length)+' 秒'))]:[]),
      ...(focused||tripSegment?[button(t('Show all saved trips','顯示所有已儲存行程'),()=>{
        tripSegment=selectedTrip='';render();fit();
      })]:[]),
    ],'trip-chart trip-metric-scope');
    const charts=selected.length?tripCharts(selected,{t,el,summary}):[empty];
    const metrics=focused?.source==='sample'&&!demo?el('details',[
      el('summary',t('Replay sensor charts','重播感測圖表')),...charts,
    ],'trip-sensor-details'):null;
    const demoNotice=el('p',t('Simulated trips illustrate how contributions build a picture over time. Phone trips are counted separately.',
      '模擬行程展示多次提供資料如何累積成觀察。手機行程另行統計。'),'subtle');
    const demoOverview=!focused&&source==='sample'?el('section',[
      el('h3',t('What repeated trips can show','多次行程能反映甚麼')),
      ...visibleSegments.filter(street=>street.stats.sessions).map(street=>{
        const {sessions,wayfindingTrips,wayfindingDays,audit}=street.stats;
        const place=tripSegment?el('strong',name(street)):button(name(street),()=>setSegment(street.id));
        return el('div',[place,el('p',t(wayfindingTrips+' of '+sessions+' trips showed a possible wayfinding issue'+
          (wayfindingDays?' across '+wayfindingDays+(wayfindingDays===1?' day':' days'):'')+'.',
          sessions+' 次行程中有 '+wayfindingTrips+' 次出現可能的尋路問題'+(wayfindingDays?'，分布在 '+wayfindingDays+' 天':'')+'。')),
          ...(street.camera.cameraTrips?[el('p',t(
            'Crowding appeared in '+street.camera.crowdTrips+' of '+street.camera.cameraTrips+' trips with usable camera data.',
            '有可用相機資料的 '+street.camera.cameraTrips+' 次行程中，有 '+street.camera.crowdTrips+' 次出現人群擠迫。'),'subtle')]:[]),
          ...(audit?[el('p',t('Example follow-up · Check signs at the junction.','示例跟進 · 查核交匯處指示。'))]:[]),
        ],'trip-contribution-row');
      }),
      el('p',t('The review threshold is three trips across at least two days. A sign report, or a pause of at least five seconds with a turn and no reported personal stop, can flag a trip.',
        '覆核門檻為至少兩天共三次行程。指示不清的回報，或停頓至少五秒並出現轉向（而且未回報個人停留），可標示行程待查。'),'subtle'),
    ],'trip-chart trip-contributions'):null;
    const cameraAnalysis=detections.length?el('section',[
      el('h3',t('Camera detections during trips','行程中的相機偵測')),
      el('p',t(detections.length+(detections.length===1?' fictional capture':' fictional captures')+' across '+new Set(detections.map(row=>row.trip_id)).size+(new Set(detections.map(row=>row.trip_id)).size===1?' trip.':' trips.')+' Camera symbols show their positions.',
        detections.length+' 筆虛構擷取，來自 '+new Set(detections.map(row=>row.trip_id)).size+' 次行程。相機符號顯示擷取位置。'),'subtle'),
      el('div',[...new Set(detections.map(row=>row.kind))].map(kind=>
        el('p',evidenceTitle(kind,lang)+' · '+detections.filter(row=>row.kind===kind).length)),'camera-detection-counts'),
      ...detections.map(record=>{
        const details=evidenceDetails(record,lang);
        const elapsed=record.elapsed_seconds;
        return el('details',[
          el('summary',evidenceTitle(record.kind,lang)+' · '+record.site[lang==='zh'?1:0]+' · '+
            Math.floor(elapsed/60)+':'+String(elapsed%60).padStart(2,'0')),
          el('p',t('Trip date ','行程日期 ')+new Date(record.at).toLocaleDateString(lang==='zh'?'zh-HK':'en-HK',{timeZone:'Asia/Hong_Kong'}),'subtle'),
          ...details.facts.map(([label,value])=>el('p',[el('strong',label),' · '+value])),
          el('p',[el('strong',t('Follow-up','跟進建議')),' · '+details.followUp]),
          button(t('Show camera capture on map','在地圖顯示擷取位置'),()=>{
            map.setView(record.point,18,{animate:false});detectionMarkers.get(record.id)?.openPopup();
          }),
        ],'camera-detection-record');
      }),
    ],'trip-chart trip-camera-analysis'):null;
    const exportTrips=button(t('Download selected trip records (JSON)','下載所選行程紀錄（JSON）'),()=>
      downloadJSON('hong-kong-on-foot-trip-records.json',{
        version:1,selection:{source,segment:tripSegment||null,trip_id:focused?.id||null},
        summary:{trip_count:selected.length,route_count:routeCount,day_count:days,
          mapped_sample_distance_m:distance,total_duration_seconds:duration,
          ...summarizeTrips(selected)},
        field_notes:{
          source:{phone:'Phone observations',sample:'Illustrative AR replay'},
          moves:'Seconds classified as moving',pauses:'Seconds classified as paused',
          turns:'Count of possible turns',accelerometer:'Sample count',gyroscope:'Sample count',
          gps:'Position fix count',scans:'Camera frames scanned',crowd:'Frames with a crowd cue',
          cues:'Derived phone cues. Backtracks is an event count.',
          timeline:'Event ID and elapsed seconds from the start of the replay or trip',
        },
        trips:selected,
        demo_geometry:selected.flatMap(row=>{
          const example=demoTripById.get(row.id);
          return example?[{trip_id:row.id,coordinates:'[latitude, longitude]',direction:example.direction,
            paths:example.paths,events:example.events,movement_sections:example.motion,camera_detections:example.observations}]:[];
        }),
      }));
    exportTrips.disabled=!selected.length;
    const exports=el('section',[
      el('h3',t('Trip data','行程資料')),exportTrips,
      link(t('Download all 13 published trips (JSON)','下載全部 13 個已發布行程（JSON）'),'./pilot/published-trip-records.json'),
      el('p',t(publishedTrips.length+' published demonstration trips are available to every visitor. New trips saved on this device remain local until exported and published.',
        publishedTrips.length+' 個已發布示範行程可供所有訪客查看。此裝置新儲存的行程會保留在本機，直至匯出並發布。'),'subtle'),
      el('p',t('Download the records behind these charts, including sensor counts, cues and available event times. The app retains only summaries of phone trips.',
        '下載圖表所用的紀錄，包括感測次數、線索及可用的事件時間。程式僅保留手機行程摘要。'),'subtle'),
      transfer(trips),
    ],'trip-chart');
    return [...(back?[back]:[]),choices,...(source==='sample'?[demoNotice]:[]),filter,picker,...(!comparison||demo?[legend]:[]),
      button(comparison?t('Fit full route','顯示完整路線'):t('Fit trip segments','顯示各行程路段'),fit),...details,
      ...(demoOverview?[demoOverview]:[]),...(timeline?[timeline]:[]),scope,...(metrics?[metrics]:charts),...(cameraAnalysis?[cameraAnalysis]:[]),exports];
  }
  function render(refit=false){
    layer.clearLayers();comparison=null;
    root.hidden=visible!=='street';tripRoot.hidden=visible!=='trips';
    if(visible==='street'){centralStudy.show(lang);return;}
    centralStudy.hide();
    if(visible!=='trips')return;
    const selectView=next=>{
      tripView=next;render(true);
      tripRoot.querySelector('[data-trip-view] [aria-pressed="true"]')?.focus({preventScroll:true});
    };
    const switcher=el('div',[
      button(t('Central Market replay','中環街市重播'),()=>selectView('market'),tripView==='market'),
      button(t('Saved AR trips','已儲存的 AR 行程'),()=>selectView('saved'),tripView==='saved'),
    ],'study-options');
    switcher.dataset.tripView='';
    switcher.setAttribute('aria-label',t('Trip analysis source','行程分析來源'));
    switcher.setAttribute('role','group');
    if(tripView==='market'){
      tripRoot.replaceChildren(switcher,marketRoot);
      marketRoutePanel({root:marketRoot,map,layer,lang,planner:true,refit});
      return;
    }
    tripRoot.replaceChildren(switcher,el('h2',t('AR trip observations','AR 行程觀察')),
      el('p',t('Review the evidence by trip or mapped segment.','按行程或已繪製路段檢視觀察資料。'),'subtle'),...analysis());
    if(refit)requestAnimationFrame(()=>{if(visible==='trips'&&tripView==='saved')fit();});
  }
  window.addEventListener('storage',()=>render());
  window.addEventListener('street-study-change',()=>render());
  return {
    update(language,show){
      const entering=show&&show!==visible;
      lang=language;visible=show;render(entering&&show==='trips');
    },
  };
}
