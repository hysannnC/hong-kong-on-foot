export const places = {
  concourse: {name:['MTR concourse junction','港鐵大堂交匯處'], coords:[22.28213,114.15793]},
  lift: {name:['Lift connection','升降機接駁處'], coords:[22.28328,114.15827]},
  entrance: {name:['IFC approach','國際金融中心入口通道'], coords:[22.28408,114.15810]},
};

export const issues = {
  sign: ['Sign missing, unclear or hard to read','指示牌缺失、不清晰或難以閱讀'],
  floor: ['Wrong floor or exit','樓層或出口錯誤'],
  lift: ['Lift unavailable or hard to use','升降機停用或難以使用'],
  step: ['Stairs, kerb or steep slope','梯級、路緣或斜坡過陡'],
  crowd: ['Crowding or queue','擠迫或排隊'],
  rest: ['Needed a rest','需要休息'],
  preference: ['Chose a more comfortable path','選擇較舒適的路線'],
  other: ['Other or unsure','其他或不確定'],
};
export const outcomes = {
  independent:['Passed independently','自行通過'], assisted:['Passed with help','在協助下通過'],
  detour:['Tried it and took another path','嘗試後改走其他路線'], avoided:['Avoided before trying','事先避開'],
  blocked:['Turned back or could not pass','折返或無法通過'],
};
export const profiles = {
  walk:['Walking without an aid','步行（不使用輔具）'], wheelchair:['Wheelchair','輪椅'],
  aid:['Cane or other walking aid','手杖或其他助行輔具'], stroller:['With a stroller','推嬰兒車'],
  private:['Prefer not to say','不願透露'],
};
export const arrivals = {
  arrived:['Reached intended entrance','抵達原定入口'], alternate:['Arrived via another entrance','經另一入口抵達'],
  changed:['Changed destination','更改目的地'], stopped:['Ended trip early','提早結束'],
};

const demo = (id, profile, familiar, arrival, seconds, events) => ({
  id, profile, familiar, arrival, seconds, mode:'sample',
  events:events.map(([place, result, issue, note, zh])=>({place,result,issue,note,zh})),
});

export const sample = [
  demo(1,'walk',false,'arrived',490,[['concourse','detour','sign','The sign used a different destination name. I followed another walker.','指示牌用了不同的目的地名稱。我跟隨另一名行人。']]),
  demo(2,'aid',false,'arrived',550,[['concourse','assisted','sign','I asked staff which way to go.','我向職員問路。'],['lift','independent',null,'','']]),
  demo(3,'walk',true,'arrived',405,[['concourse','independent',null,'I knew which exit to take.','我本來就知道要走哪個出口。']]),
  demo(4,'wheelchair',true,'alternate',655,[['lift','avoided','lift','I already knew this lift was often unavailable, so I chose another entrance.','我知道這部升降機經常停用，因此改走另一個入口。']]),
  demo(5,'wheelchair',false,'stopped',430,[['lift','blocked','lift','The lift was out of service when I arrived.','我抵達時升降機正在停用。']]),
  demo(6,'stroller',false,'alternate',590,[['lift','detour','lift','The lift was closed, so I went back to find another one.','升降機關閉了，我折返找另一部。']]),
  demo(7,'wheelchair',true,'arrived',520,[['lift','independent',null,'The lift was running on this trip.','這次升降機正常運作。']]),
  demo(8,'aid',true,'arrived',495,[['entrance','independent','preference','I chose the covered approach so I could rest in the shade.','我選了有上蓋的通道，可以在陰涼處休息。']]),
  demo(9,'walk',false,'arrived',467,[['concourse','detour','floor','I took the wrong exit and came back.','我走錯出口後折返。']]),
  demo(10,'walk',false,'arrived',441,[['concourse','independent',null,'I recognised the shopfront near the turn.','我認出了轉角附近的店舖。']]),
];

export function summarise(trips, place) {
  const observations = trips.flatMap(trip=>trip.events.filter(event=>event.place===place).map(event=>({...event,trip})));
  // A connection counts once per walk in the denominator, even if someone reports it twice.
  const walkCount = predicate=>new Set(observations.filter(predicate).map(item=>item.trip.id)).size;
  const issuesByCount = Object.keys(issues)
    .map(issue=>({issue,count:walkCount(item=>item.issue===issue)}))
    .filter(item=>item.count).sort((a,b)=>b.count-a.count);
  return {
    observations, attempted:walkCount(item=>item.result!=='avoided'),
    avoided:walkCount(item=>item.result==='avoided'),
    independent:walkCount(item=>item.result==='independent'),
    assisted:walkCount(item=>item.result==='assisted'),
    interrupted:walkCount(item=>['blocked','detour'].includes(item.result)),
    issuesByCount,
  };
}

export function questionFor(event, backtrack) {
  if (event?.issue==='sign' || event?.issue==='floor' || (!event && backtrack))
    return ['What did you look for at that point, and what eventually helped you find the way?','當時你在找甚麼？最後甚麼幫你找到方向？'];
  if (event?.result==='avoided')
    return ['What did you expect to encounter, and which path did you use instead?','你原本預計會遇到甚麼？最後改走哪條路？'];
  if (['blocked','assisted','detour'].includes(event?.result))
    return ['What made you change plans or ask for help? What happened next?','甚麼令你改變計劃或尋求協助？後來怎樣？'];
  return ['What made this route worth choosing, and would you use it again?','你為甚麼選這條路？下次還會走這條路嗎？'];
}

function metres(a,b) {
  const radians = Math.PI/180;
  const dy = (a.lat-b.lat)*111195;
  const dx = (a.lng-b.lng)*111195*Math.cos((a.lat+b.lat)*radians/2);
  return Math.hypot(dx,dy);
}

export function traceStats(points) {
  let distance=0, moving=0, gaps=0, backtrack=false;
  const usable = points.filter(p=>p.accuracy<=30).length;
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i], dt=(b.time-a.time)/1000;
    if (Math.max(a.accuracy,b.accuracy)>30 || dt>30 || dt<=0) {gaps++; continue;}
    const step=metres(a,b);
    if (step<Math.max(4,(a.accuracy+b.accuracy)*.35) || step/dt>3) continue;
    distance+=step;
    moving+=dt;
    const earlier=points[i-2];
    if (earlier && earlier.accuracy<=15 && b.time-earlier.time<=60000 &&
        step>18 && metres(earlier,a)>18 && metres(earlier,b)<10) backtrack=true;
  }
  return {usable, distance:Math.round(distance), pace:moving?distance/moving:null, gaps, backtrack};
}
