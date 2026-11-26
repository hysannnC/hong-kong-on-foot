// Online estimates are fitted to fictional completed walks, with a separate prior.
export const routes=[
  {id:'direct',name:['Direct connection','直接接駁'],minutes:6,stepFree:false,coords:[[22.28213,114.15793],[22.2827,114.15775],[22.2833,114.158],[22.28408,114.15810]]},
  {id:'lift',name:['Lift connection','升降機接駁'],minutes:8,stepFree:true,coords:[[22.28213,114.15793],[22.2826,114.15840],[22.28328,114.15827],[22.2838,114.15840],[22.28408,114.15810]]},
  {id:'covered',name:['Covered alternative','有蓋替代路線'],minutes:10,stepFree:true,coords:[[22.28213,114.15793],[22.2823,114.15895],[22.28335,114.15885],[22.28395,114.1588],[22.28408,114.15810]]},
];
export const batches=[
  [{route:'lift',minutes:13,independent:false},{route:'lift',minutes:12,independent:true},{route:'covered',minutes:9,independent:true},{route:'direct',minutes:7,independent:true}],
  [{route:'lift',minutes:14,independent:false},{route:'covered',minutes:8,independent:true},{route:'covered',minutes:9,independent:true}],
  [{route:'lift',minutes:11,independent:true},{route:'covered',minutes:10,independent:true},{route:'covered',minutes:9,independent:true}],
];
export function rankRoutes(observations,stepFree=false,penalty=4){
  return routes.map(route=>{
    const walks=observations.filter(w=>w.route===route.id);
    const n=walks.length;
    const independent=walks.filter(w=>w.independent).length;
    const estimate=(route.minutes*2+walks.reduce((sum,w)=>sum+w.minutes,0))/(2+n);
    const failure=(n-independent)/(2+n);
    return {...route,n,independent,estimate,score:estimate+penalty*failure,eligible:!stepFree||route.stepFree};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.score-b.score);
}
