import {centralCases,reviewCameraBatch} from './central-camera.mjs?v=56';
import {evidenceNames} from './field-evidence.mjs?v=56';
import {photos} from './street-photos.mjs';
import {benchmark,streets} from './street-model.mjs';

const checked=Object.fromEntries(reviewCameraBatch().map(entry=>[entry.id,entry]));
const crowdPhoto={
  image:photos.desvoeux.file,media:photos.desvoeux.url,license:photos.desvoeux.license,
  caption:photos.desvoeux.name,credit:[photos.desvoeux.by,photos.desvoeux.by],
};
const crowdAction=[
  'Count pedestrians again at busy and quiet times, measure the clear width and check whether queues block through movement.',
  '在繁忙及非繁忙時段重新點算人流，量度淨寬，並檢查排隊是否阻礙通行。',
];
const publicActions={
  flow:['Allow extra time or follow the quieter route in the demo.','預留時間，或選用示範中的較少人路線。'],
  facility:['Use the alternate connection shown on the map.','使用地圖所示的替代接駁。'],
  water:['Use the alternate route to avoid the flooded approach.','使用替代路線避開積水接駁路段。'],
  crossing:['Use the marked crossing and follow the signal.','使用指定過路處並遵照燈號。'],
  blockage:['Take the alternative while the footway is obstructed.','行人路受阻時，改用替代路線。'],
};
const local=(lang,pair)=>pair[lang==='zh'?1:0];

export function evidenceDetails(row,lang){
  const t=(en,zh)=>local(lang,[en,zh]);
  const fmt=new Intl.NumberFormat(lang==='zh'?'zh-HK':'en-HK');
  const n=value=>fmt.format(Math.round(value));
  const result={
    action:local(lang,publicActions[row.kind]),
    followUp:local(lang,centralCases[row.kind]?.action||crowdAction),
    facts:[],technical:[],metrics:{},
  };
  if(row.demoCamera){
    const demo=row.demoCamera;
    return {...result,facts:demo.facts.map(([label,value])=>[local(lang,label),local(lang,value)]),
      photo:demo.photo,followUp:local(lang,demo.followUp),
      technical:[t('Fictional automatic camera detection for this sample trip. The archive photo illustrates the event type.',
        '此為樣本行程中的虛構自動相機偵測。存檔照片用作展示事件類型。')],
      metrics:{elapsed_seconds:row.elapsed_seconds}};
  }
  const centralReplay=row.source!=='phone'&&/^(ar|cctv)-central-/.test(row.id);
  const fact=(en,zh,value)=>result.facts.push([t(en,zh),value]);
  if(row.kind==='flow'&&Number.isFinite(row.observedSeconds)&&row.observedSeconds>0&&
    Number.isFinite(row.toward)&&Number.isFinite(row.away)){
    const count=row.toward+row.away;
    const hourly=count*3600/row.observedSeconds;
    fact('Recorded flow','記錄人流',t(n(count)+' crossings in '+row.observedSeconds+' s',row.observedSeconds+' 秒內 '+n(count)+' 人次'));
    result.metrics={sample_crossings:count,sample_seconds:row.observedSeconds,toward:row.toward,away:row.away};
    result.technical.push(t(n(row.toward)+' toward · '+n(row.away)+' away', '往向 '+n(row.toward)+' 人次 · 反向 '+n(row.away)+' 人次'));
    if(row.source==='ar-replay'||row.source==='cctv-replay'){
      const widths={
        'ar-ifc-bridge-flow':streets.find(street=>street.id==='link').width,
        'ar-ifc-waterfront-flow':streets.find(street=>street.id==='pier').width,
      };
      const width=widths[row.id]??2.3,capacity=width*benchmark*60;
      const percent=hourly/capacity*100;
      Object.assign(result.metrics,{estimated_crossings_per_hour:hourly,assumed_clear_width_m:width,
        benchmark_people_per_hour:capacity,percent_of_hourly_benchmark:percent});
      fact('Crowd load','人流負荷',t(n(percent)+'% · sample estimate','每小時基準的 '+n(percent)+'% · 樣本估算'));
      result.technical.push(t(n(hourly)+' crossings/h extrapolated from the replay sample ÷ '+n(capacity)+
        ' crossings/h benchmark ('+width+' m assumed width × '+benchmark+' people/min/m × 60). This is a flow ratio.',
        '重播樣本推算每小時 '+n(hourly)+' 人次 ÷ 每小時 '+n(capacity)+' 人次基準（假設淨寬 '+width+' 米 × '+benchmark+' 人／分鐘／米 × 60）。此為流量比率。'));
      result.photo=crowdPhoto;
    }else{
      fact('Crowd load','人流負荷',t('Benchmark unavailable','未有比較基準'));
    }
  }
  if(!centralReplay||row.kind==='flow')return result;
  const entry=checked[row.kind];
  const caption={
    facility:['Closed escalator in Central','中環停用扶手電梯'],
    water:['Connaught Road Central water-main burst · Feb 2025','干諾道中爆水管 · 2025 年 2 月'],
    crossing:entry.place,
    blockage:['Hoarding inside Hong Kong Station · 27 Feb 2025','香港站內的工程圍板 · 2025 年 2 月 27 日'],
  };
  result.photo={image:entry.image,media:entry.media,license:entry.license,caption:caption[row.kind],credit:entry.credit};
  result.technical.push(local(lang,entry.method));
  if(row.kind==='facility'){
    result.metrics=entry.period;
    fact('Affected period','受影響時段',t('10 Sep 2019 to mid-Feb 2020 · historical notice','2019 年 9 月 10 日至 2020 年 2 月中 · 歷史通告'));
    result.technical.push(t('The notice concerns travelator 5T. The photo shows a separate closure on the Central walkway system.',
      '通告涉及 5T 行人自動輸送帶。照片顯示中環行人通道系統另一次停用。'));
  }else if(row.kind==='water'){
    const {length_m,width_m}=entry.affected;
    result.metrics={...entry.affected,area_m2:length_m*width_m};
    fact('Affected area','受影響範圍',t('Kerbside approach and dropped kerb · about '+result.metrics.area_m2+' m² in the replay',
      '路緣接駁段及下斜路緣 · 重播約 '+result.metrics.area_m2+' 平方米'));
    result.technical.push(t('Demo footprint '+length_m+' m × '+width_m+' m. The archive photo shows road flooding and illustrates the cue.',
      '示例範圍 '+length_m+' 米 × '+width_m+' 米。存檔照片顯示車道積水，作辨識示例。'));
  }else if(row.kind==='blockage'){
    const days=new Set(entry.samples.map(sample=>sample.date)).size;
    result.metrics={observed_days:days,blocked_days:entry.matched,clear_width_screen_m:entry.widthThreshold,windows:entry.samples};
    fact('Obstruction','阻礙物',local(lang,entry.objects));
    fact('Recurrence','出現頻率',t(entry.matched+' of '+days+' sample days','觀察 '+days+' 天，有 '+entry.matched+' 天受阻'));
    result.technical.push(t('Screening threshold '+entry.widthThreshold+' m of clear width. The photo shows the works setup. The widths and repeat dates are replay inputs.',
      '篩查門檻為 '+entry.widthThreshold+' 米淨寬。照片顯示施工圍板。淨寬和觀察日期為重播輸入。'));
  }else{
    fact('Recorded cue','記錄線索',t(entry.matched+' of '+entry.samples.length+' replay tracks flagged','重播 '+entry.samples.length+' 條行人軌跡，有 '+entry.matched+' 條標記待查'));
    result.metrics={flagged_tracks:entry.matched,replay_tracks:entry.samples.length};
  }
  return result;
}

export const evidenceTitle=(kind,lang)=>local(lang,evidenceNames[kind]);
