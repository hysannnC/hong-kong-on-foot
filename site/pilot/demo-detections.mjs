import {centralCases} from './central-camera.mjs?v=53';
import {photos} from './street-photos.mjs';

const kinds=['flow','blockage','facility','crossing','water','blockage'];
const followUps={
  flow:['Check queues and clear passage width at the same time of day.','在相同時段檢查排隊情況及通道淨寬。'],
  blockage:['Ask the works team to keep a continuous clear passage and verify the alternative connection.','請施工團隊保持通道暢通，並核實替代接駁。'],
  facility:['Confirm the interruption and reopening time with the operator, then update route advice.','向營辦者核實停用及重開時間，再更新路線提示。'],
  crossing:['Review pedestrian waiting time and the crossing layout before proposing changes.','提出改善前，覆核行人等候時間及過路處設計。'],
  water:['Inspect the drainage and dropped kerb; check whether an accessible diversion is needed.','檢查排水及下斜路緣，確認是否需要無障礙改道。'],
};

export function demoDetection({trip,line,motion,routeIndex,visit,site}){
  const kind=visit===1?'flow':kinds[routeIndex];
  const leg=motion.find(row=>row.state==='slow')||motion[0];
  const stop=motion.find(row=>row.state==='stopped');
  const point=(visit===0&&stop?stop:leg).from;
  const seconds=Math.round((visit===0&&stop?stop:leg).start_seconds);
  const photo=kind==='flow'?{
    image:photos.desvoeux.file,media:photos.desvoeux.url,license:photos.desvoeux.license,
    caption:photos.desvoeux.name,credit:[photos.desvoeux.by,photos.desvoeux.by],
  }:{
    image:centralCases[kind].image,media:centralCases[kind].media,license:centralCases[kind].license,
    caption:centralCases[kind].caption,credit:centralCases[kind].credit,
  };
  const facts={
    flow:[
      [['Recorded flow','記錄人流'],[(visit?12:24)+' crossings in 20 s','20 秒內 '+(visit?12:24)+' 人次']],
      [['Flow benchmark ratio','流量基準比率'],[visit?'68% · sample estimate':'136% · sample estimate',visit?'68% · 樣本估算':'136% · 樣本估算']],
    ],
    blockage:[
      [['Obstruction','阻礙物'],['Temporary works hoarding','臨時工程圍板']],
      [['Estimated clear width','估算通道淨寬'],['0.9 m · sample estimate','0.9 米 · 樣本估算']],
    ],
    facility:[
      [['Camera cue','相機線索'],['Service suspension notice','暫停服務告示']],
      [['Affected period','受影響時段'],[trip.day+' 09:00–18:00 · fictional',trip.day+' 09:00–18:00 · 虛構時段']],
    ],
    crossing:[
      [['Camera cue','相機線索'],['One possible crossing conflict','一宗可能的過路衝突']],
      [['Review status','覆核狀態'],['Signal phase needs verification','須核實燈號時序']],
    ],
    water:[
      [['Camera cue','相機線索'],['Standing water at the access edge','接駁路段邊緣積水']],
      [['Affected area','受影響面積'],['8 m² · sample estimate','8 平方米 · 樣本估算']],
    ],
  };
  return {
    id:trip.id+'-camera',trip_id:trip.id,kind,source:'ar-replay',site,point,
    at:Date.parse(trip.day+'T09:00:00+08:00')+seconds*1000,elapsed_seconds:seconds,
    demoCamera:{facts:facts[kind],photo,followUp:followUps[kind]},
  };
}
