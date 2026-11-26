import {observationLabel,tripMapIncidents,tripPaths} from './trip-journey.mjs?v=53';

export const routeColors={planned:'#29865b',travelled:'#df9136',ramp:'#703b86'};

export function drawRouteLines(layer,{planned,travelled,ramp=[]},labels){
  const legend=document.createElement('div');
  legend.className='trip-route-key';
  const styles=[
    {lines:planned,kind:'planned',weight:8,halo:11},
    {lines:travelled,kind:'travelled',weight:4,halo:6,dashArray:'7 10'},
    {lines:ramp,kind:'ramp',weight:4,halo:6,dashArray:'2 7'},
  ];
  for(const {lines,kind,weight,halo,dashArray,lineCap='round'} of styles){
    if(!lines.length)continue;
    const options={dashArray,lineCap,interactive:false};
    L.polyline(lines,{...options,color:'#fff',weight:halo}).addTo(layer);
    L.polyline(lines,{...options,color:routeColors[kind],weight}).addTo(layer);
    const key=document.createElement('span');
    if(dashArray)key.className=kind==='ramp'?'trip-key-dotted':'trip-key-dashed';
    key.style.setProperty('--study-color',routeColors[kind]);
    key.textContent=labels[kind];
    legend.append(key);
  }
  return legend;
}

export function drawTripComparison({layer,map,trip,lang}){
  const t=(en,tc)=>lang==='zh'?tc:en;
  const paths=tripPaths(trip);
  const legend=drawRouteLines(layer,{...paths,travelled:paths.actual},{
    travelled:t('Travelled path','行經路線'),planned:t('Suggested route','建議路線'),ramp:t('Ramp section','斜道路段'),
  });
  const cautions=tripMapIncidents(trip).map(event=>{
    const label=observationLabel(event.id,lang);
    const content=document.createElement('p');
    content.textContent=label;
    const marker=L.marker(event.point,{
      icon:L.divIcon({className:'trip-caution-marker',html:'<span aria-hidden="true"><b>!</b></span>',
        iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-12]}),
      title:label,alt:label,bubblingMouseEvents:false,
    }).bindPopup(content).addTo(layer);
    return {...event,label,showOnMap(){map.panTo(event.point,{animate:false});marker.openPopup();}};
  });
  const extent=L.latLngBounds([...paths.planned.flat(),...paths.actual.flat(),...cautions.map(event=>event.point)]);
  return {legend,cautions,extent};
}

export function fitTripComparison(map,extent){
  map.stop().invalidateSize({pan:false});
  if(extent.isValid())map.fitBounds(extent,{padding:[30,38],maxZoom:18,animate:false});
}
