import {photos} from './street-photos.mjs';

export const centralCases={
  facility:{
    name:['Facility interruption','設施服務中斷'],place:['Travelator 5T · Queen’s Road Central to Wellington Street','5T 行人自動輸送帶 · 皇后大道中至威靈頓街'],
    where:[22.28339,114.1547],
    image:'pilot/street-media/central-out-of-service.jpg',credit:['Snatewittru · CC BY-SA 3.0','Snatewittru · CC BY-SA 3.0'],
    media:'https://commons.wikimedia.org/wiki/File:HK_Central_Escalators_interior_out_of_Service_night_no_entry_sign_Nov-2012.jpg',
    license:'https://creativecommons.org/licenses/by-sa/3.0/',
    source:'https://www.td.gov.hk/en/traffic_notices/index_id_56343.html',
    sourceName:['Transport Department · historical notice','運輸署 · 歷史通告'],
    caption:['Archive photo of a closed Central escalator. The separate 5T replay notice is based on a historical Transport Department suspension.',
      '中環停用扶手電梯的存檔照片。5T 的重播告示另根據運輸署歷史停用通告製作。'],
    cue:['Fixture OCR · “5T OUT OF SERVICE”','模擬文字辨識 ·「5T 暫停服務」'],
    method:['Read the notice text and match the asset ID. Closed doors or an empty frame alone do not establish an outage.',
      '讀取告示並配對設施編號。單憑關閉的門或空畫面無法確認停用。'],
    action:['Verify the status and reopening with the operator. Check available uphill alternatives for people who cannot use stairs, and update advance signs at approach junctions.',
      '向營辦者核實狀態及重開時間。為不能使用樓梯的人確認上坡替代路線，並在接近路口前更新指示。'],
    next:['Operator log and verified alternative route','營辦者紀錄及經核實的替代路線'],
    box:[19,36,63,41],period:{start:'2019-09-10',end:'2020-02',end_precision:'mid-month'},
    samples:[{notice:'5T OUT OF SERVICE',asset:'5T'},{notice:'5T OUT OF SERVICE',asset:'5T'},{notice:'8E OUT OF SERVICE',asset:'8E'}],
  },
  water:{
    name:['Flood-prone access','水浸路段通行'],place:['Connaught Road Central near Jubilee Street','干諾道中近租庇利街'],
    where:[22.284934,114.156373],
    image:'https://hk.on.cc/hk/bkn/cnt/news/20250219/photo/bkn-20250219010317966-0219_00822_001_01b.jpg?20250219155238',
    media:'https://content-hk-cdn.on.cc/hk/bkn/cnt/news/20250219/bkn-20250219010317966-0219_00822_001.html',
    credit:['on.cc · archived event photograph','東網 · 歷史事件相片'],
    source:'https://www.youtube.com/watch?v=WQaUxWYo7cw',
    sourceName:['TVB News · repair and reopening report','無綫新聞 · 搶修報道'],
    caption:['The February 2025 water-main burst shows water on the carriageway. It provides a case for checking pedestrian access near the junction.',
      '2025 年 2 月爆水管事件顯示車道積水，可用作研究交界附近行人通行情況的案例。'],
    cue:['Fixture water mask · persistent water at kerb','模擬積水範圍 · 路緣持續有水'],
    method:['Compare the wet area with a fixed kerb across successive frames. Reflections and spray alone do not establish standing water across an access point.',
      '用連續畫面比較濕地範圍與固定路緣。單靠倒影或水花無法證實出入口有積水。'],
    action:['Check whether water reaches the dropped kerb, measure the usable footway and record the cause. Compare independently observed rain events before treating this location as flood-prone.',
      '查核積水是否到達下斜路緣，量度可用行人道闊度並記錄原因。要判定水浸風險，需比較獨立觀察的暴雨事件。'],
    next:['Kerb inspection and separate incident records','路緣檢查及獨立事件紀錄'],
    box:[13,39,72,47],affected:{length_m:24,width_m:1.5},
    samples:[{at:0,kerb:true},{at:1,kerb:true},{at:2,kerb:true},{at:3,kerb:false}],
  },
  crossing:{
    name:['Crossing safety','過路安全'],place:photos.desvoeux.name,
    where:[22.2841941,114.1561125],
    image:photos.desvoeux.file,media:photos.desvoeux.url,
    credit:['Alexkom000 · CC BY 4.0','Alexkom000 · CC BY 4.0'],license:photos.desvoeux.license,
    source:'https://www.td.gov.hk/en/road_safety/road_users_code/index/chapter_2_for_pedestrians/pedestrian_lights_/index.html',
    sourceName:['Transport Department · pedestrian signals','運輸署 · 行人燈號'],
    caption:['The 2024 photo shows the crossing. Tracks and signal phase are added as anonymized replay inputs.',
      '2024 年相片顯示過路處；行人軌跡及燈號時序為匿名重播輸入。'],
    cue:['Fixture trajectory · new entry during red phase','模擬軌跡 · 紅燈期間進入車道'],
    method:['Compare entry time and trajectory with the marked crossing and signal phase. A pedestrian already crossing when red starts must be distinguished from a new entry.',
      '核對進入時間、行人軌跡、過路線及燈號。紅燈開始前已過路的行人和新進入車道的行人須分開辨識。'],
    action:['Review pedestrian wait times and crossing alignment at the same time of day. Use time-linked pedestrian and vehicle tracks to check conflicts before adjusting signal timing.',
      '在相同時段查核行人等候時間及過路線位置。調整信號前，使用同步行人及車輛軌跡核實衝突。'],
    next:['Timed observation with pedestrian and vehicle movements','行人及車輛動向時序觀察'],
    box:[8,47,85,41],
    samples:[{entry:'red',outside:true,frames:4},{entry:'green',outside:false,frames:6},{entry:'unknown',outside:true,frames:4}],
  },
  blockage:{
    name:['Recurring footway blockage','行人路反覆受阻'],
    place:['IFC approach from Finance Street','金融街往國際金融中心接駁路段'],
    where:[22.285234,114.157519],
    image:'pilot/street-media/hong-kong-station-works.jpg',
    media:'https://commons.wikimedia.org/wiki/File:HK_%E6%B8%AF%E9%90%B5_MTR_%E4%B8%AD%E7%92%B0_Central_%E9%A6%99%E6%B8%AF%E7%AB%99_Hong_Kong_Station_passageway_%E7%B6%AD%E4%BF%AE%E9%80%B2%E8%A1%8C_construction_in_progress_February_2025_R12S_01.jpg',
    credit:['Shwim WIAIOP 226 · CC0','Shwim WIAIOP 226 · CC0'],
    license:'https://creativecommons.org/publicdomain/zero/1.0/',
    source:'https://commons.wikimedia.org/wiki/File:HK_%E6%B8%AF%E9%90%B5_MTR_%E4%B8%AD%E7%92%B0_Central_%E9%A6%99%E6%B8%AF%E7%AB%99_Hong_Kong_Station_passageway_%E7%B6%AD%E4%BF%AE%E9%80%B2%E8%A1%8C_construction_in_progress_February_2025_R12S_01.jpg',
    sourceName:['Hong Kong Station works photo','香港站工程照片'],
    caption:['Temporary works hoarding inside Hong Kong Station, 27 February 2025. The replay applies this example to a nearby approach.',
      '2025 年 2 月 27 日香港站內的臨時工程圍板。重播以此為例，模擬附近接駁路段受阻。'],
    cue:['Clear passage narrowed in separate works windows','不同施工時段的通道淨寬收窄'],
    method:['Compare the narrowest clear passage across separate works windows. Count each day once so repeated frames do not inflate recurrence.',
      '比較不同施工時段最窄位置的通道淨寬。每天只計一次，避免連續畫面高估出現頻率。'],
    action:['Ask the works team to measure the clear width at the hoarding and maintain a continuous step-free passage. Signpost a verified detour if needed.',
      '請施工團隊量度圍板旁的通道淨寬，保持無梯級通道暢通；有需要時標示經核實的替代路線。'],
    next:['Works schedule and clear-width measurements','施工時間表及通道淨寬量度'],
    objects:['Temporary works hoarding and protective frames','臨時工程圍板及防護架'],
    box:[5,34,73,58],widthThreshold:1.2,
    samples:[
      {date:'2026-11-23',time:'16:55',clear_width_m:0.7},
      {date:'2026-11-24',time:'17:05',clear_width_m:0.9},
      {date:'2026-11-25',time:'16:58',clear_width_m:1.7},
      {date:'2026-11-26',time:'17:00',clear_width_m:0.8},
    ],
  },
};

const screen={
  facility(samples){
    const matched=samples.filter(sample=>sample.asset==='5T'&&/\b5T\b.*\bOUT OF SERVICE\b/i.test(sample.notice)).length;
    return {flagged:matched>=2,matched};
  },
  water(samples){
    let run=0,matched=0,previous;
    for(const sample of samples){
      run=sample.kerb?(previous&&sample.at-previous.at===1?run+1:1):0;
      matched=Math.max(matched,run);previous=sample;
    }
    return {flagged:matched>=3,matched};
  },
  crossing(samples){
    const matched=samples.filter(sample=>sample.entry==='red'&&sample.outside&&sample.frames>=3).length;
    return {flagged:matched>0,matched};
  },
  blockage(samples,entry){
    const matched=new Set(samples.filter(sample=>sample.clear_width_m<entry.widthThreshold).map(sample=>sample.date)).size;
    return {flagged:matched>=2,matched};
  },
};

export function reviewCameraBatch(cases=centralCases){
  return Object.entries(cases).map(([id,entry])=>({...entry,id,...screen[id](entry.samples,entry)}));
}
