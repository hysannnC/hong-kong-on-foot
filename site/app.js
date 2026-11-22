import {openScene} from './scene3d.js';
import {markerKey,pinImage} from './pins.js';
import {profiles,districts,neighbourhoods,locales} from './settings.js';
import {buildItinerary,distanceBetween,guidanceGlyph,navigationFrame,updateGuidance} from './navigation.js';

const $=id=>document.getElementById(id);
const kinds=['groceries','dining','health','parks','education','toilets','benches','mtr'];
const dotColors=['#427639','#a75522','#ad4860','#44744f','#76569b','#506571','#986119','#a62c50'];
const ramp=[[11,79,108],[31,158,154],[155,197,61],[242,193,78],[232,116,59]];
function timeColor(ratio) {
  const scale=Math.min(3.9999, Math.max(0,ratio)*4), i=Math.floor(scale);
  return 'rgb('+ramp[i].map((v,j)=>Math.round(v+(ramp[i+1][j]-v)*(scale-i))).join(' ')+')';
}
const times=[5,10,15,20,25,30];
const bounds=L.latLngBounds([22.13,113.81],[22.58,114.5]);
const params=new URLSearchParams(location.hash.slice(1));
const languageKey=params.get('lang')||(/^zh\b/i.test(navigator.language)?'zh':'en');
let language=languageKey==='zh'?'zh':'en';
let word=locales[language];
const validMode=value=>['public','planner'].includes(value)?value:'';
const chosenMode=validMode(params.get('mode'));
let mode=chosenMode;
let tab=params.get('view')==='directions'?'directions':'explore';
let profile=Object.hasOwn(profiles,params.get('profile'))?params.get('profile'):'adult';
function numeric(key,fallback,min,max){
  const raw=params.get(key), n=Number(raw);
  return raw!==null && Number.isFinite(n)&&n>=min&&n<=max?n:fallback;
}
const initial=[neighbourhoods[0][2],neighbourhoods[0][3]];
let origin=[numeric('lat',initial[0],22.13,22.58),numeric('lng',initial[1],113.81,114.5)];
let minutes=Math.round(numeric('min',15,5,30));
let selected=new Set(params.has('places')?params.get('places').split(',').filter(n=>/^[0-7]$/.test(n)).map(Number):[7]);
let plannerDistrict=districts.findIndex(d=>Math.hypot(d[4]-origin[0],d[5]-origin[1])<.000003);
let originName='';
let current=null,destination=null,route=null,routeStatus='',notice='',request=0,routeRequest=0,timer,shareTimer;
let indexPromise,addressAbort,searchNumber=0;
const mobilityProfile=()=>mode==='public'&&['limited','wheelchair'].includes(profile);
const gentleDefault=id=>['older','limited','wheelchair'].includes(id);
const legacyGrade=Number(params.get('slope'));
let gentle=params.has('terrain')?params.get('terrain')==='gentle':
  legacyGrade>0?legacyGrade<=8:params.has('slope')?false:gentleDefault(profile);
let guide=null, guideFeedback='', itinerary=null;
let scene=null, scenePromise=null, want3d=false, viewing3d=false, fromScene=false, viewError='';
let visiblePins=[],panelOpen=true,turnMarker=null;
const markerSizes=[22,28,36];
let markerSize=22;
try{
  const saved=Number(localStorage.getItem('hk-marker-size'));
  if(markerSizes.includes(saved))markerSize=saved;
}catch{ /* The size still applies to this session. */ }
$('pin-size').value=String(markerSize);
const sceneAngles={pitch:numeric('pitch',48,0,65),bearing:numeric('bearing',0,-180,180)};
const placeLimits=new Map();
$('stairs').checked=params.has('stairs')?params.get('stairs')==='1':profiles[profile][3];
$('hills').checked=params.get('hills')!=='0';
$('slope').value=['0','5','8','12'].includes(params.get('slope'))?params.get('slope'):String(profiles[profile][4]);
$('accessible').checked=params.get('access')==='1';
$('show-barriers').checked=params.get('barriers')==='1';
$('show-area').checked=params.get('area')!=='0';

const map=L.map('map',{preferCanvas:true,maxBounds:bounds,maxBoundsViscosity:.65,zoomControl:false,minZoom:10,maxZoom:19,zoomSnap:0})
  .setView([numeric('y',origin[0],22.13,22.58),numeric('x',origin[1],113.81,114.5)],numeric('z',15,10,19));
if(window.proj4)window.proj4.defs('EPSG:2326','+proj=tmerc +lat_0=22.31213333333333 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246 +units=m +no_defs');
const zoom=L.control.zoom({position:'topleft'}).addTo(map);
const raster=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
try {
  if (L.maplibreGL && window.maplibregl) {
    const vector=L.maplibreGL({style:'https://tiles.openfreemap.org/styles/positron',padding:.1,
      attribution:'&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a>'}).addTo(map);
    const vectorMap=vector.getMaplibreMap();
    vectorMap.once('load',()=>raster.remove());
    vectorMap.on('error',()=>{if(!vectorMap.isStyleLoaded()&&map.hasLayer(vector)) vector.remove();});
  }
} catch { /* The raster basemap remains available. */ }
map.attributionControl.addAttribution('<a href="https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637222018065_52265">Walking network &copy; LandsD / CSDI</a>');
map.createPane('reachArea').style.zIndex=385;
const area=L.layerGroup().addTo(map), paths=L.layerGroup().addTo(map), markers=L.layerGroup().addTo(map);
const obstacles=L.layerGroup().addTo(map), routeLayer=L.layerGroup().addTo(map);
const makeIcon=className=>L.divIcon({className,iconSize:[27,27],iconAnchor:[13,13]});
const pin=L.marker(origin,{icon:makeIcon('start-pin'),draggable:true,autoPan:true}).addTo(map);
let worker,reachStatus='';

function el(tag,text,className){
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  if(className) node.className=className;
  return node;
}
function createButton(text,action){
  const button=el('button',text);
  button.type='button';
  button.addEventListener('click',action);
  return button;
}
const langIndex=()=>language==='zh'?1:0;
const timeLabel=value=>Math.max(1,Math.ceil(value))+' '+word.min;
const metresLabel=m=>m<1000?Math.max(1,Math.round(m))+' '+word.metres:(m/1000).toFixed(2)+' '+word.km;
const categoryName=i=>word[kinds[i]];
const pointName=p=>p.name?.[langIndex()]||p.name?.[1-langIndex()]||categoryName(p.kind);
const flagText=p=>['',word.accessYes,word.accessLimited,word.accessNo][p.access||0];
const fromReach=p=>({coords:p.slice(0,2),kind:p[2],name:[p[3],p[4]],ref:p[5],eta:p[6],edge:p[7],position:p[8],distance:p[9],access:p[10],walkMetres:p[11],photo:p[12],address:p[13],brand:p[14]});
const fromIndex=p=>({coords:[p[0]/1e6,p[1]/1e6],kind:p[2],name:[p[3],p[4]],ref:p[5],edge:p[6],position:p[7],distance:p[8],access:p[9],photo:p[10],address:p[11],brand:p[12]});

function findPreset(){
  return neighbourhoods.findIndex(p=>Math.hypot(p[2]-origin[0],p[3]-origin[1])<.000003);
}
function profileSettings(){
  const mobility=mobilityProfile();
  const slope=mode==='planner'?Number($('slope').value):gentle||profile==='wheelchair'?5:mobility?8:0;
  return {pace:profiles[profile][2],stairs:$('stairs').checked||profile==='wheelchair'||mobility,
    hills:$('hills').checked,slope,wheelchair:profile==='wheelchair'||mobility,mobility};
}
function syncURL(){
  if(!mode) return;
  const c=guide?.view.centre||map.getCenter();
  const hash=new URLSearchParams({mode,view:tab,lang:language,lat:origin[0].toFixed(6),lng:origin[1].toFixed(6),
    y:c.lat.toFixed(6),x:c.lng.toFixed(6),z:Number((guide?.view.zoom??map.getZoom()).toFixed(3)),min:minutes,profile,
    stairs:Number($('stairs').checked),hills:Number($('hills').checked),slope:profileSettings().slope,terrain:gentle||profile==='wheelchair'?'gentle':'all',
    places:[...selected].sort().join(','),access:Number($('accessible').checked),
    barriers:Number($('show-barriers').checked),area:Number($('show-area').checked)});
  if(guide?guide.view.threeD:viewing3d){
    const angles=guide?.view.angles||sceneAngles;
    hash.set('map','3d');
    hash.set('pitch',angles.pitch.toFixed(1));
    hash.set('bearing',angles.bearing.toFixed(1));
  }
  if(destination) hash.set('to',JSON.stringify([destination.coords,destination.kind,destination.name,destination.ref,
    destination.edge??null,destination.position??null,destination.distance??null,destination.access??0]));
  history.replaceState(null,'','#'+hash);
}
function readDestination(){
  try{
    if(!params.has('to')||params.get('to').length>800)return null;
    const [coords,kind,name,ref,edge,position,distance,access]=JSON.parse(params.get('to'));
    if(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||!bounds.contains(coords)||
      !Number.isInteger(kind)||kind<0||kind>7||!Array.isArray(name)||name.length!==2||
      !name.every(s=>typeof s==='string'&&s.length<300)||typeof ref!=='string')return null;
    const located=Number.isInteger(edge)&&Number.isFinite(position)&&position>=0&&position<=1&&Number.isFinite(distance)&&distance>=0&&distance<=110;
    return {coords,kind,name,ref,edge:located?edge:undefined,position:located?position:undefined,distance:located?distance:undefined,access:[0,1,2,3].includes(access)?access:0};
  }catch{return null;}
}
const mapFrame=$('map').parentElement;
new ResizeObserver(()=>{
  map.invalidateSize({pan:false});
  scene?.resize();
}).observe(mapFrame);

function renderPanel(){
  const panel=$('panel'),button=$('panel-toggle');
  button.hidden=!mode;
  button.textContent=word[panelOpen?'hidePanel':'showPanel'];
  button.setAttribute('aria-expanded',String(panelOpen));
  if(!panelOpen&&panel.contains(document.activeElement))button.focus();
  panel.hidden=!panelOpen;
  panel.inert=!mode||!panelOpen;
  mapFrame.parentElement.classList.toggle('panel-collapsed',!panelOpen);
}

function pauseFollowing(){
  if(!guide||!guide.follow)return;
  guide.follow=false;
  renderGuide();
}
function mapCamera(){
  const centre=map.getCenter();
  return {coords:[centre.lat,centre.lng],zoom:map.getZoom()};
}
function renderViewControls(){
  $('view-2d').setAttribute('aria-pressed',String(!viewing3d));
  $('view-3d').setAttribute('aria-pressed',String(viewing3d));
  $('view-3d').disabled=want3d&&!scene;
  const status=viewError||(want3d&&!scene?'loading3d':viewing3d&&!guide&&map.getZoom()<14.4?'zoomBuildings':'');
  $('view-status').hidden=!status;
  $('view-status').textContent=status?word[status]:'';
}
function activateView(value){
  viewing3d=value;
  mapFrame.dataset.view=value?'3d':'2d';
  $('map-3d').inert=!value;
  $('map-3d').setAttribute('aria-hidden',String(!value));
  $('map').inert=value;
  if(value){
    map.closePopup();
    scene.show({...mapCamera(),...sceneAngles});
    scene.setOrigin(origin,word.start,!guide);
    scene.setPosition(guide?.fix?.coords);
    scene.setPlaces(visiblePins);
    scene.setPinSize(markerSize);
    scene.setGuiding(!!guide);
  }else{
    scene?.hide();
    map.invalidateSize({pan:false});
    render2DPins();
  }
  renderLines();
  renderRoute();
  if(guide?.follow)followPosition(guide);
  renderViewControls();
  syncURL();
}
async function chooseMapView(next){
  want3d=next;viewError='';
  if(!next){activateView(false);return;}
  if(scene){activateView(true);return;}
  renderViewControls();
  if(!scenePromise){
    scenePromise=openScene($('map-3d'),{
      view:{...mapCamera(),...sceneAngles},
      bounds:[[22.13,113.81],[22.58,114.5]],
      labels:word,
      onView(view){
        sceneAngles.pitch=view.pitch;sceneAngles.bearing=view.bearing;
        fromScene=true;
        map.setView(view.coords,view.zoom,{animate:false});
        fromScene=false;
        renderViewControls();
        syncURL();
      },
      onOrigin(coords){if(mode&&!guide)changeOrigin(coords,false);},
      onPlace(point){showMapPopup(point.coords,placePopup(point));},
      onDrag:pauseFollowing,
      onUnavailable(){
        if(!scene)return;
        const unavailable=scene;
        want3d=false;viewError='unavailable3d';activateView(false);
        scene=null;scenePromise=null;
        queueMicrotask(()=>unavailable.dispose());
      }
    });
  }
  try {
    scene=await scenePromise;
    if(want3d)activateView(true);
  } catch {
    scenePromise=null;
    if(want3d){want3d=false;viewError='unavailable3d';activateView(false);}
  }
}
function showMapPopup(coords,content){
  if(viewing3d)scene.showPopup(coords,content);
  else L.popup().setLatLng(coords).setContent(content).openOn(map);
}
function setNotice(value){
  notice=value;
  $('notice').hidden=!value;
  $('notice').textContent=value?word[value]:'';
}
function renderReachStatus(){
  const show=Boolean(reachStatus&&mode&&(mode==='planner'||tab==='explore'));
  $('reach-feedback').hidden=!show;
  $('reach-status').textContent=show?word[reachStatus]:'';
  $('retry-reach').hidden=reachStatus!=='failed';
}
function renderTime(){
  const options=times.includes(minutes)?times:[...times,minutes].sort((a,b)=>a-b);
  $('times').replaceChildren(...options.map(value=>{
    const button=createButton(value+' '+word.min,()=>{minutes=value;renderTime();run();});
    button.setAttribute('aria-pressed',String(minutes===value));
    return button;
  }));
  $('legend-gradient').style.background='linear-gradient(90deg,'+ramp.map(c=>'rgb('+c.join(' ')+')').join(',')+')';
  $('legend-ticks').replaceChildren(...[0,...times.filter(t=>t<minutes),minutes].map(t=>el('span',String(t))));
}
function renderModes(){
  renderPanel();
  $('panel-title').textContent=word[mode==='planner'?'dashboard':tab];
  $('panel-hint').textContent=word[mode==='planner'?'plannerHint':tab==='directions'?'directionsHint':'publicHint'];
  $('switch-mode').hidden=$('share').hidden=!mode;
  $('switch-mode').textContent=word[mode==='planner'?'public':'plannerShort'];
  $('switch-mode').setAttribute('aria-label',word[mode==='planner'?'public':'planner']);
  $('public-tabs').hidden=mode!=='public';
  $('planner-panel').hidden=mode!=='planner';
  $('planner-slope').hidden=mode!=='planner';
  $('terrain-field').hidden=mode!=='public';
  renderTerrain();
  $('explore-panel').hidden=mode!=='public'||tab!=='explore';
  $('route-panel').hidden=mode!=='public'||tab!=='directions';
  $('time-field').hidden=mode==='public'&&tab==='directions';
  $('legend').hidden=!mode||(mode==='public'&&tab==='directions');
  $('legend-reference').hidden=mode!=='planner';
  $('explore-tab').setAttribute('aria-pressed',String(tab==='explore'));
  $('directions-tab').setAttribute('aria-pressed',String(tab==='directions'));
  const choices=mode==='planner'?districts:neighbourhoods;
  $('origin-label').textContent=word[mode==='planner'?'district':'start'];
  $('place').replaceChildren(new Option(originName||word.pin,'-1'),...choices.map((p,i)=>new Option(p[langIndex()],i)));
  $('place').value=mode==='planner'?plannerDistrict:findPreset();
}
function renderTerrain(){
  const chair=profile==='wheelchair';
  $('terrain-gentle').setAttribute('aria-pressed',String(gentle||chair));
  $('terrain-all').setAttribute('aria-pressed',String(!gentle&&!chair));
  $('terrain-all').disabled=chair;
  $('terrain-note').textContent=word[chair?'chairSlope':gentle?'gentleNote':mobilityProfile()?'limitedSlope':'allHillsNote'];
  $('stairs').disabled=chair||mobilityProfile();
  if($('stairs').disabled)$('stairs').checked=true;
}
function localize(){
  word=locales[language];
  document.documentElement.lang=language==='zh'?'zh-Hant':'en';
  for(const node of document.querySelectorAll('[data-t]'))node.textContent=word[node.dataset.t];
  for(const node of document.querySelectorAll('[data-label]'))node.setAttribute('aria-label',word[node.dataset.label]);
  for(const node of document.querySelectorAll('[data-placeholder]'))node.placeholder=word[node.dataset.placeholder];
  for(const button of [$('language'),$('welcome-language')]){
    button.textContent=language==='zh'?'English':'繁體中文';
    button.lang=language==='zh'?'en':'zh-Hant';
  }
  $('profile').replaceChildren(...Object.entries(profiles).map(([id,p])=>new Option(p[langIndex()],id)));
  $('profile').value=profile;
  $('profile-note').textContent=profiles[profile][2].toFixed(2)+(language==='zh'?' 米／秒（參考值）':' m/s reference pace')+(mobilityProfile()?' · '+word.stepFreeProfile:'');
  pin.getElement().setAttribute('aria-label',word.start);
  scene?.setOrigin(origin,word.start,!guide);
  renderViewControls();
  for(const [key,label] of [['in',word.zoomIn],['out',word.zoomOut]]){
    const button=zoom.getContainer().querySelector('.leaflet-control-zoom-'+key);
    button.title=label;button.setAttribute('aria-label',label);
  }
  $('evidence').replaceChildren(...Object.values(profiles).map(p=>{
    const node=el('li',p[langIndex()]+' · '+p[2].toFixed(2)+' m/s · ');
    const link=el('a',p[5]);link.href=p[6];node.append(link);return node;
  }));
  setNotice(notice);
  renderModes();
  renderTime();
  const districtFacility=$('district-facility');
  const savedFacility=districtFacility.value||'-1';
  districtFacility.replaceChildren(new Option(word.allPlaces,'-1'),...kinds.map((_,i)=>new Option(categoryName(i),i)));
  districtFacility.value=savedFacility;
  renderAll();
}
function selectMode(value){
  if(value!=='public')stopGuide();
  mode=value;
  if(value==='planner') tab='explore';
  if($('welcome').open)$('welcome').close();
  localize();
  run();
}
function setTab(value){
  if(value!=='directions')stopGuide();
  tab=value;renderModes();renderAll();syncURL();
  if(value==='directions'&&destination&&!route)runRoute(false);
}
function changeOrigin(coords,pan,label='',district=-1){
  if(!bounds.contains(coords)) {pin.setLatLng(origin);setNotice('noPath');return;}
  stopGuide();
  origin=[Number(coords[0]),Number(coords[1])];
  originName=label;
  plannerDistrict=district>=0?district:districts.findIndex(d=>Math.hypot(d[4]-origin[0],d[5]-origin[1])<.000003);
  pin.setLatLng(origin);
  scene?.setOrigin(origin,word.start,!guide);
  if(pan)map.setView(origin,Math.max(map.getZoom(),15));
  renderModes();
  run();
}
function run(){
  if(!mode)return;
  clearTimeout(timer);
  const id=++request;
  current=null;
  placeLimits.clear();
  setNotice('');
  reachStatus='loading';
  renderAll();
  timer=setTimeout(()=>postWalk({id,origin,minutes,...profileSettings()}),80);
  if(destination&&mode==='public'&&tab==='directions')runRoute(false);
  else {route=null;routeStatus='';routeRequest++;}
  syncURL();
}
function runRoute(pan){
  if(guide){
    if(guide.fix&&guide.fix.accuracy<=38){
      // The previous line may violate the newly selected route options.
      route=null;itinerary=null;
      rerouteGuide(guide);
      renderRoute();
      return;
    }
    stopGuide();
  }
  route=null;itinerary=null;routeStatus='routeBusy';
  renderRoute();
  const id=++routeRequest;
  postWalk({id,origin,minutes,destination,...profileSettings()});
  if(pan)map.fitBounds(L.latLngBounds(origin,destination.coords).pad(.17),{maxZoom:17,padding:[18,18]});
}
function receiveWalk({data}){
  if(data.kind==='route'){
    if(data.id!==routeRequest)return;
    if(guide?.reroute===data.id){
      const state=guide;
      state.reroute=null;
      if(data.route){
        route=data.route;
        itinerary=buildItinerary(route.legs);
        state.progress={};
        state.spoken='';
        state.phase='usingGps';
        if(state.fix)onGuideFix(state,state.fix);
        renderRoute();
      }else{
        state.phase='rerouteFail';
        renderGuide();
      }
      return;
    }
    route=data.route||null;
    itinerary=route?buildItinerary(route.legs):null;
    routeStatus=data.error||data.routeError||'';
    renderRoute();
    return;
  }
  if(data.id!==request)return;
  current=data.empty||data.error?null:data;
  reachStatus=data.error||(data.empty?'noPath':data.lines.slice(1).some(g=>g.length)?'':'noReach');
  renderAll();
}

function walkWorkerFailed(){
  worker?.terminate();
  worker=null;
  if(reachStatus==='loading')reachStatus='failed';
  if(routeStatus==='routeBusy')routeStatus='failed';
  if(guide?.reroute){
    guide.reroute=null;
    guide.phase='rerouteFail';
    renderGuide();
  }
  renderReachStatus();
  renderRoute();
}

function postWalk(data){
  try{
    if(!worker){
      worker=new Worker('reach.js');
      worker.onmessage=receiveWalk;
      worker.onerror=walkWorkerFailed;
      worker.onmessageerror=walkWorkerFailed;
    }
    worker.postMessage(data);
  }catch{
    walkWorkerFailed();
  }
}

function renderLines(){
  paths.clearLayers();area.clearLayers();obstacles.clearLayers();
  const enabled=mode&&current&&!(mode==='public'&&tab==='directions');
  if(viewing3d){
    const lines=[],cells=[],barriers=[];
    if(enabled){
      if(mode==='planner'&&current.lines[0].length)lines.push({segments:current.lines[0],color:'#758187',width:2.1});
      current.gradient.forEach((segments,i)=>{
        if(segments.length)lines.push({segments,color:timeColor((i+.5)/current.gradient.length),width:3.3});
      });
      if($('show-area').checked)for(const [y,x,band] of current.cells){
        cells.push({ring:cellRing(y,x),color:timeColor(Math.min(1,(band-.5)*5/minutes))});
      }
      if(mode==='planner'&&$('show-barriers').checked)for(const [lat,lng,,type,grade] of current.barriers){
        barriers.push({coords:[lat,lng],label:barrierLabel(type,grade)});
      }
    }
    scene.setReach(lines,cells,barriers);
    return;
  }
  if(!enabled)return;
  if($('show-area').checked){
    const cellsByBand=Array.from({length:times.length+1},()=>[]);
    for(const [y,x,band] of current.cells)cellsByBand[band].push(cellRing(y,x));
    for(let band=1;band<cellsByBand.length;band++) {
      if(cellsByBand[band].length)L.polygon(cellsByBand[band].map(r=>[r]),{pane:'reachArea',stroke:false,fillColor:timeColor(Math.min(1,(band-.5)*5/minutes)),fillOpacity:.13,interactive:false}).addTo(area);
    }
  }
  if(mode==='planner'&&current.lines[0].length){
    L.polyline(current.lines[0],{color:'#758187',weight:2.1,opacity:.65,interactive:false}).addTo(paths);
  }
  current.gradient.forEach((lines,i)=>{
    if(lines.length)L.polyline(lines,{color:timeColor((i+.5)/current.gradient.length),weight:3.3,opacity:.96,interactive:false}).addTo(paths);
  });
  if(mode==='planner'&&$('show-barriers').checked){
    for(const [lat,lng,,type,grade] of current.barriers){
      const popup=el('span',barrierLabel(type,grade));
      L.circleMarker([lat,lng],{radius:5,color:'#fff',weight:1.5,fillColor:'#ad432c',fillOpacity:.94}).bindPopup(popup).addTo(obstacles);
    }
  }
}
function cellRing(y,x){
  const a=y*.00045,b=x*.00045;
  return [[a,b],[a+.00045,b],[a+.00045,b+.00045],[a,b+.00045],[a,b]];
}
function placeTitle(p){
  const name=pointName(p);return p.ref&&p.ref!==name?name+' · '+p.ref:name;
}
const photos=new Map();
async function photoFor(reference){
  if(!photos.has(reference)){
    photos.set(reference,(async()=>{
      let file=reference;
      if(/^Q[1-9]\d{0,11}$/.test(reference)){
        const query=new URLSearchParams({action:'wbgetclaims',entity:reference,property:'P18',origin:'*',format:'json'});
        const response=await fetch('https://www.wikidata.org/w/api.php?'+query);
        if(!response.ok)return null;
        const data=await response.json();
        const value=data.claims?.P18?.find(entry=>entry.rank!=='deprecated'&&entry.mainsnak?.datavalue?.value)?.mainsnak.datavalue.value;
        file=typeof value==='string'?'File:'+value:'';
      }
      if(!/^file:/i.test(file))return null;
      const query=new URLSearchParams({action:'query',titles:file,origin:'*',format:'json',formatversion:'2',
        prop:'imageinfo',iiprop:'url|extmetadata',iiextmetadatafilter:'Artist|LicenseShortName',iiurlwidth:'160',redirects:'1'});
      const response=await fetch('https://commons.wikimedia.org/w/api.php?'+query);
      if(!response.ok)return null;
      const data=await response.json();
      const info=data.query?.pages?.[0]?.imageinfo?.[0];
      if(!info?.thumburl||!info?.descriptionurl||new URL(info.thumburl).hostname!=='upload.wikimedia.org'||
        new URL(info.descriptionurl).hostname!=='commons.wikimedia.org')return null;
      const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replaceAll('&amp;','&').trim();
      const artist=plain(info.extmetadata?.Artist?.value).slice(0,75);
      const license=plain(info.extmetadata?.LicenseShortName?.value);
      if(!license)return null;
      return {url:info.thumburl,link:info.descriptionurl,credit:[artist,license].filter(Boolean).join(' · ')};
    })().catch(()=>null));
  }
  return photos.get(reference);
}
const placePhotoObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){
    placePhotoObserver.unobserve(entry.target);
    if(entry.target.isConnected)fillPlacePhoto(entry.target);
  }
},{rootMargin:'120px'}):null;
async function fillPlacePhoto(figure){
  const photo=await photoFor(figure.dataset.photo);
  if(!figure.isConnected)return;
  if(!photo){figure.remove();return;}
  const img=el('img');
  img.alt=figure.dataset.name;
  img.loading='lazy';
  img.addEventListener('error',()=>figure.remove(),{once:true});
  img.src=photo.url;
  const credit=el('a',photo.credit);
  credit.href=photo.link;
  credit.target='_blank';
  credit.rel='noopener noreferrer';
  credit.setAttribute('aria-label',word.photoCredit+' · '+photo.credit);
  figure.append(img,credit);
}
const nearSort=(a,b)=>(a.walkMetres??Infinity)-(b.walkMetres??Infinity)||a.eta-b.eta;
function walkingDetails(point){
  return [timeLabel(point.eta),Number.isFinite(point.walkMetres)?metresLabel(point.walkMetres):''].filter(Boolean).join(' · ');
}
function placeCard(point){
  const li=el('li',undefined,'place-card');
  const button=createButton(placeTitle(point),()=>chooseDestination(point));
  button.append(el('small',walkingDetails(point),'place-eta'));
  for(const detail of [point.address,flagText(point)])if(detail)button.append(el('small',detail));
  li.append(button);
  if(point.photo){
    const figure=el('figure',undefined,'place-photo');
    figure.dataset.photo=point.photo;
    figure.dataset.name=placeTitle(point);
    li.append(figure);
    if(placePhotoObserver)placePhotoObserver.observe(figure);else queueMicrotask(()=>fillPlacePhoto(figure));
  }
  return li;
}
function placeGroup(i,points){
  const group=el('section',undefined,'place-group');
  const heading=el('h3',categoryName(i)+' · '+points.length);
  const list=el('ul',undefined,'nearby');
  const more=createButton(word.morePlaces,()=>append(12));
  more.className='place-more';
  let rendered=0;
  function append(count){
    const next=points.slice(rendered,rendered+count);
    list.append(...next.map(placeCard));
    rendered+=next.length;
    placeLimits.set(i,rendered);
    more.hidden=rendered>=points.length;
  }
  if(points.length){group.append(heading,list,more);append(placeLimits.get(i)||12);}
  else group.append(heading,el('p',word.noPlaces,'subtle'));
  return group;
}
function placePopup(point){
  const popup=el('div');
  popup.append(el('strong',placeTitle(point)),
    el('p',walkingDetails(point)+(flagText(point)?' · '+flagText(point):'')),
    createButton(word.directions,()=>chooseDestination(point)));
  return popup;
}
function render2DPins(){
  markers.clearLayers();
  if(viewing3d)return;
  const groups=new Map();
  for(const [index,point] of visiblePins.entries()){
    let key=index;
    if(map.getZoom()<15){
      const pixel=map.project(point.coords);
      key=Math.floor(pixel.x/48)+'_'+Math.floor(pixel.y/48);
    }
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(point);
  }
  for(const points of groups.values()){
    if(points.length>1){
      const bounds=L.latLngBounds(points.map(point=>point.coords));
      const html=el('span',String(points.length));
      const label=word.cluster.replace('{count}',points.length);
      const icon=L.divIcon({className:'place-cluster',html,iconSize:[34,34],iconAnchor:[17,17]});
      const cluster=L.marker(bounds.getCenter(),{icon,title:label}).on('click',()=>{
        const zoom=Math.max(map.getZoom()+1,15);
        map.fitBounds(bounds,{maxZoom:zoom,padding:[24,24]});
      }).addTo(markers);
      cluster.getElement()?.setAttribute('aria-label',label);
      continue;
    }
    const [point]=points, label=placeTitle(point);
    const brand=!markerKey(point).startsWith('category-');
    const w=markerSize;
    const icon=L.divIcon({className:brand?'place-marker brand-marker':'place-marker',
      html:pinImage(point),iconSize:[w,w],iconAnchor:[w/2,w/2],popupAnchor:[0,-w/2]});
    L.marker(point.coords,{icon,title:label}).bindPopup(()=>placePopup(point)).addTo(markers)
      .getElement()?.setAttribute('aria-label',label);
  }
}
function renderExplore(){
  placePhotoObserver?.disconnect();
  visiblePins=[];
  if(mode!=='public'||tab!=='explore'){
    render2DPins();
    if(viewing3d)scene.setPlaces([]);
    return;
  }
  const only=$('accessible').checked;
  const points=(current?.places||[]).map(fromReach).filter(p=>!only||p.access===1);
  const counts=Array(8).fill(0);
  points.forEach(p=>counts[p.kind]++);
  $('categories').replaceChildren(...kinds.map((_,i)=>{
    const button=createButton('',()=>{if(selected.has(i))selected.delete(i);else selected.add(i);renderExplore();syncURL();});
    button.className='category';button.disabled=!current;
    button.setAttribute('aria-pressed',String(selected.has(i)));
    const dot=el('i');dot.style.setProperty('--dot',dotColors[i]);
    button.append(dot,el('span',categoryName(i)),el('strong',current?String(counts[i]):'–'));
    return button;
  }));
  const visible=points.filter(p=>selected.has(p.kind)).sort(nearSort);
  visiblePins=visible.slice(0,700);
  render2DPins();
  if(viewing3d)scene.setPlaces(visiblePins);
  $('nearby-sort').hidden=!current||!visible.length;
  $('nearby').replaceChildren(...(current?[...selected].sort((a,b)=>a-b).map(i=>placeGroup(i,visible.filter(p=>p.kind===i))):[]));
  if(current&&!selected.size)$('nearby').append(el('p',word.selectCategory,'subtle'));
}
function chooseDestination(point){
  stopGuide();guideFeedback='';
  destination=point;tab='directions';
  $('destination').value='';
  $('destination-results').hidden=true;
  searchNumber++;
  renderModes();renderExplore();renderLines();runRoute(true);syncURL();
}
function clearDestination(){
  stopGuide();guideFeedback='';
  routeRequest++;
  destination=route=itinerary=null;routeStatus='';
  $('destination').value='';
  renderRoute();syncURL();
}
function guideText(state){
  if(state.phase!=='following')return word[state.phase];
  const cue=itinerary?.cues[state.progress.cueIndex];
  if(!cue||cue.at-(state.progress.progress||0)>100)return word.follow;
  const delta=cue.at-(state.progress.progress||0);
  const command=word[cue.kind];
  if(delta<=9)return word.nowAction.replace('{action}',command);
  const distance=metresLabel(Math.max(10,Math.round(delta/10)*10));
  const action=language==='en'?command[0].toLowerCase()+command.slice(1):command;
  return word.inDistance.replace('{distance}',distance).replace('{action}',action);
}

function renderTurn(state){
  const cue=state?.phase==='following'?itinerary?.cues[state.progress.cueIndex]:null;
  const upcoming=cue&&cue.at-state.progress.progress<=85?cue:null;
  const glyph=guidanceGlyph(upcoming?.kind);
  $('live-arrow').textContent=glyph;
  scene?.setTurn(viewing3d&&upcoming?{coords:upcoming.coords,glyph}:null);
  if(viewing3d||!upcoming){
    turnMarker?.remove();
    turnMarker=null;
    return;
  }
  const icon=L.divIcon({className:'turn-pin',html:glyph,iconSize:[30,30],iconAnchor:[15,15]});
  if(!turnMarker)turnMarker=L.marker(upcoming.coords,{icon,interactive:false,keyboard:false,zIndexOffset:1200}).addTo(map);
  else turnMarker.setLatLng(upcoming.coords).setIcon(icon);
}

function renderGuide(){
  const state=guide;
  mapFrame.dataset.guiding=String(!!state);
  renderTurn(state);
  $('live-guidance').hidden=!state;
  $('start-guide').hidden=!route||!!state||mode!=='public'||tab!=='directions';
  $('guide-feedback').textContent=guideFeedback?word[guideFeedback]:'';
  if(!state)return;
  const message=guideText(state);
  if($('live-message').textContent!==message)$('live-message').textContent=message;
  const remaining=state.progress.remaining;
  $('live-distance').textContent=Number.isFinite(remaining)&&state.phase==='following'?
    word.remaining.replace('{distance}',metresLabel(remaining)):word.foreground;
  $('live-recenter').disabled=!state.fix;
  $('live-voice').hidden=!('speechSynthesis' in window);
  $('live-voice').setAttribute('aria-pressed',String(state.voice));
}

function speakGuide(text){
  if(!('speechSynthesis' in window))return;
  const message=new SpeechSynthesisUtterance(text);
  message.lang=language==='zh'?'zh-HK':'en-HK';
  speechSynthesis.cancel();
  speechSynthesis.speak(message);
}

async function keepScreenOn(state){
  if(document.hidden||state.screenLock||!navigator.wakeLock)return;
  try{
    const lock=await navigator.wakeLock.request('screen');
    if(guide!==state){await lock.release();return;}
    state.screenLock=lock;
    lock.addEventListener('release',()=>{if(state.screenLock===lock)state.screenLock=null;},{once:true});
  }catch{ /* Guidance remains available without a screen lock. */ }
}

function stopGuide(message=''){
  const state=guide;
  if(!state)return;
  guide=null;
  if(state.watch!==undefined)navigator.geolocation.clearWatch(state.watch);
  state.marker?.remove();
  scene?.setPosition(null);
  scene?.setGuiding(false);
  scene?.setOrigin(origin,word.start,true);
  pin.dragging.enable();
  state.screenLock?.release().catch(()=>{});
  if(state.reroute){
    routeRequest++;
    state.reroute=null;
  }
  if(state.voice&&'speechSynthesis' in window)speechSynthesis.cancel();
  guideFeedback=message;
  panelOpen=state.view.panelOpen;
  renderPanel();
  Object.assign(sceneAngles,state.view.angles);
  map.setView(state.view.centre,state.view.zoom,{animate:false});
  if(viewing3d!==state.view.threeD||want3d!==state.view.threeD)chooseMapView(state.view.threeD);
  else if(viewing3d)scene.setView({...mapCamera(),...sceneAngles});
  renderGuide();
  syncURL();
}

function rerouteGuide(state){
  if(guide!==state||!state.fix||!destination)return;
  state.lastReroute=Date.now();
  state.phase='rerouting';
  state.reroute=++routeRequest;
  postWalk({id:state.reroute,origin:state.fix.coords,minutes,destination,...profileSettings()});
  renderGuide();
}

function followPosition(state){
  const coords=state.fix?.coords||itinerary?.segments[0]?.a;
  if(!coords)return;
  const frame=itinerary?navigationFrame(itinerary,state.progress.progress):null;
  if(frame&&state.phase!=='offRoute')state.bearing=frame.bearing;
  if(viewing3d){
    scene.follow(coords,state.bearing??sceneAngles.bearing);
  }else if(!state.followed2d)map.setView(coords,Math.max(17,map.getZoom()),{animate:false});
  else map.panTo(coords,{animate:false});
  state.followed2d=!viewing3d;
}

function onGuideFix(state,fix){
  if(guide!==state)return;
  if(!bounds.contains(fix.coords)){
    stopGuide('gpsUnavailable');return;
  }
  if(fix.accuracy<=65){
    state.fix=fix;
    state.marker ||= L.marker(fix.coords,{icon:L.divIcon({className:'gps-pin',iconSize:[16,16],iconAnchor:[8,8]}),
      interactive:false,keyboard:false}).addTo(map);
    state.marker.setLatLng(fix.coords);
    if(viewing3d)scene.setPosition(fix.coords);
  }
  if(state.reroute){
    if(state.follow&&fix.accuracy<=65)followPosition(state);
    return;
  }
  if(!itinerary){
    if(fix.accuracy<=38 && Date.now()-state.lastReroute>=12000)rerouteGuide(state);
    return;
  }
  const first=state.progress.progress==null;
  state.progress=updateGuidance(itinerary,state.progress,fix);
  switch(state.progress.status){
    case 'arrived':{
      const voice=state.voice;
      stopGuide('arrived');
      if(voice)speakGuide(word.arrived);
      if(matchMedia('(max-width: 700px)').matches)$('guide-feedback').scrollIntoView({block:'center'});
      return;
    }
    case 'weak':state.phase='gpsWeak';break;
    case 'off':
      if(fix.accuracy<=38&&(state.progress.off>=3||(first&&fix.accuracy<=25))&&Date.now()-state.lastReroute>=12000){
        rerouteGuide(state);return;
      }
      if(state.phase!=='rerouteFail')state.phase='offRoute';
      break;
    default:state.phase='following';
  }
  if(state.follow&&fix.accuracy<=65)followPosition(state);
  renderGuide();
  if(state.voice&&!document.hidden&&state.phase==='following'){
    const index=state.progress.cueIndex, cue=itinerary.cues[index];
    if(cue){
      const distance=cue.at-state.progress.progress;
      const key=index+'_'+(distance<=9?'now':'soon');
      if(distance<=65&&key!==state.spoken){state.spoken=key;speakGuide(guideText(state));}
    }
  }
}

function startGuide(){
  if(guide||!route||!itinerary)return;
  if(!navigator.geolocation||!window.isSecureContext){
    guideFeedback='gpsUnavailable';renderGuide();return;
  }
  const state={phase:'usingGps',progress:{},view:{centre:map.getCenter(),zoom:map.getZoom(),
    threeD:want3d,panelOpen,angles:{...sceneAngles}},voice:false,follow:true,lastReroute:-Infinity,spoken:''};
  guide=state;
  panelOpen=false;
  renderPanel();
  pin.dragging.disable();
  scene?.setOrigin(origin,word.start,false);
  guideFeedback='';
  renderGuide();
  chooseMapView(true);
  if(!viewing3d)followPosition(state);
  try{
    state.watch=navigator.geolocation.watchPosition(position=>{
      const {latitude,longitude,accuracy}=position.coords;
      onGuideFix(state,{coords:[latitude,longitude],accuracy,time:position.timestamp});
    },error=>{
      if(guide!==state)return;
      if(error.code===1){stopGuide('gpsDenied');return;}
      state.phase=state.fix?'gpsWeak':'usingGps';
      renderGuide();
    },{enableHighAccuracy:true,maximumAge:1000,timeout:12000});
    keepScreenOn(state);
  }catch{stopGuide('gpsUnavailable');}
}

function renderRoute(){
  routeLayer.clearLayers();
  if(viewing3d){scene.setRoute([]);scene.setDestination(null);}
  renderGuide();
  if(mode!=='public'||tab!=='directions')return;
  $('route-selected').hidden=!destination;
  $('route-selected').replaceChildren();
  $('route-info').replaceChildren();
  $('route-steps').replaceChildren();
  if(!destination)return;
  $('route-selected').append(el('strong',placeTitle(destination)),
    createButton(word.clear,clearDestination));
  if(routeStatus)$('route-info').append(el('p',word[routeStatus],'subtle'));
  if(routeStatus==='failed')$('route-info').append(createButton(word.retry,()=>runRoute(false)));
  if(viewing3d)scene.setDestination(destination.coords);
  else L.marker(destination.coords,{icon:makeIcon('destination-pin'),interactive:false}).addTo(routeLayer);
  if(!route)return;
  const lines=route.legs.filter(leg=>leg[3]>.1).map(leg=>leg.slice(0,2));
  if(viewing3d)scene.setRoute(lines);
  else{
    L.polyline(lines,{color:'#fff',weight:9,opacity:.95,interactive:false}).addTo(routeLayer);
    L.polyline(lines,{color:'#12675a',weight:5.6,opacity:1,interactive:false}).addTo(routeLayer);
  }
  const settings=profileSettings();
  const details=el('details'), summary=el('summary',word.why);
  details.append(summary,el('p',[word.walkWhy,settings.stairs?word.stepWhy:'',settings.wheelchair?word.chairWhy:'',
    settings.slope?word.gentleWhy:'',word.unmapped].filter(Boolean).join(' '),'subtle'));
  $('route-info').append(el('h3',timeLabel(route.seconds/60)+' · '+metresLabel(route.metres)),
    el('p',word[settings.stairs?'stepFreeMapped':'fastestMapped'],'subtle'),
    ...(flagText(destination)?[el('p',flagText(destination),'subtle')]:[]),details);
  if(settings.stairs){
    const lift=route.legs.some(leg=>leg[3]>.1&&(leg[2]&32));
    $('route-info').append(el('p',lift?word.verifyLift+' '+word.verifyAccess:word.verifyAccess,'route-access-note'));
  }
  const cues=itinerary?.cues||[];
  $('route-steps').replaceChildren(...cues.map((cue,i)=>{
    const line=el('li'), distance=(cues[i+1]?.at??cue.at)-cue.at;
    const label=word[cue.kind]+(distance>12&&cue.kind!=='lift'?' · '+metresLabel(distance):'');
    line.append(createButton(label,()=>{
      pauseFollowing();
      map.setView(cue.coords,Math.max(17,map.getZoom()));
      showMapPopup(cue.coords,el('span',label));
      if(matchMedia('(max-width: 700px)').matches)$('map').scrollIntoView({block:'start'});
    }));
    return line;
  }));
}

function barrierLabel(type,grade){
  return type==='stairs'?word.stairsTag:type==='restricted'?word.restricted:word.steep+' · '+Math.round(grade)+'%';
}
function renderPlanner(){
  if(mode!=='planner')return;
  const district=districts[plannerDistrict];
  $('sample-label').textContent=(district?word.benchmark+' · '+district[2+langIndex()]+'. ':'')+word.sample;
  const metric=(value,label)=>{const div=el('div',undefined,'metric');div.append(el('strong',value),el('span',label));return div;};
  const rows=kinds.map((_,i)=>[categoryName(i),current?.reference[i]??'–',current?.counts[i]??'–',
    current?Math.max(0,current.reference[i]-current.counts[i]):'–']);
  const gaps=rows.filter(r=>r[3]>0).sort((a,b)=>b[3]-a[3]);
  $('metrics').replaceChildren(
    metric(current?String(gaps.reduce((s,r)=>s+r[3],0)):'–',word.gap),
    metric(current?metresLabel(current.length):'–',word.network),
    ...(district?[metric(district[6].toFixed(1)+'%',word.age)]:[]));
  $('metrics-rows').replaceChildren(...rows.map(row=>{
    const tr=el('tr');for(const value of row)tr.append(el('td',String(value)));return tr;
  }));
  const firstBarrier=current?.barriers.find(b=>b[3]==='stairs'?profileSettings().stairs:
    b[3]==='restricted'?profileSettings().wheelchair:profileSettings().slope>0);
  $('findings').replaceChildren(...gaps.slice(0,2).map(([name,,,n])=>el('li',word.auditGap+' '+name.toLowerCase()+' · '+n+' '+word.auditGapTail)));
  if(firstBarrier&&gaps.length){
    const item=el('li');
    const [lat,lng,,kind,grade]=firstBarrier;
    const focus=createButton(word.auditBarrier+' · '+barrierLabel(kind,grade),()=>{
      $('show-barriers').checked=true;renderLines();map.setView([lat,lng],17);syncURL();
      showMapPopup([lat,lng],el('span',barrierLabel(kind,grade)));
    });
    item.append(focus);$('findings').append(item);
  }
  if(current&&!gaps.length)$('findings').append(el('li',word.auditNone));
  for(const id of ['csv','geo','print'])$(id).disabled=!current;
}
let districtData;
let districtPromise;
async function renderDistrictComparison(){
  if(mode!=='planner'||!$('district-comparison').open)return;
  const table=$('district-rows');
  if(!districtData){
    try{
      districtPromise ||= fetch('data/districts.json').then(r=>{if(!r.ok)throw new Error('District benchmarks');return r.json();});
      districtData=await districtPromise;
    }catch{
      districtPromise=null;
      const tr=el('tr'), td=el('td',word.failed);td.colSpan=4;tr.append(td);table.replaceChildren(tr);return;
    }
  }
  const i=Math.min(5,Math.max(0,Math.floor(minutes/5)-1));
  const facility=Number($('district-facility').value);
  const count=values=>facility<0?values.reduce((a,b)=>a+b,0):values[facility];
  const rows=districts.map((d,j)=>({d,j,adult:count(districtData[j].adult[i]),group:count(districtData[j][profile][i])}));
  rows.sort((a,b)=>(b.adult-b.group)-(a.adult-a.group));
  table.replaceChildren(...rows.map(({d,j,adult,group})=>{
    const row=el('tr'), title=el('td');
    title.append(createButton(d[langIndex()],()=>changeOrigin(d.slice(4,6),true,'',j)));
    row.append(title,el('td',String(adult)),el('td',String(group)),el('td',String(Math.max(0,adult-group))));
    return row;
  }));
}
function renderAll(){renderReachStatus();renderLines();renderExplore();renderRoute();renderPlanner();renderDistrictComparison();}
function download(name,contents,type){
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const link=el('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportCSV(){
  if(!current)return;
  const district=districts[plannerDistrict];
  const settings=profileSettings();
  const rows=[['district','sample_origin','latitude','longitude','minutes','profile','pace_m_s','avoid_stairs','slope_adjustment','maximum_grade_pct','census_65_plus_pct_2021','facility','adult_baseline','selected_profile','fewer','source'],
    ...kinds.map((key,i)=>[district?.[0]||'',district?.[2]||'Dropped pin',...origin,minutes,profile,settings.pace,settings.stairs,settings.hills,settings.slope||'',district?.[6]??'',key,
      current.reference[i],current.counts[i],Math.max(0,current.reference[i]-current.counts[i]),'LandsD/OSM November 2026; one sample origin'])];
  const csv=rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n');
  download('hong-kong-walking-comparison.csv','\ufeff'+csv,'text/csv;charset=utf-8');
}
function exportGeo(){
  if(!current)return;
  const flip=p=>[p[1],p[0]];
  const features=current.lines.slice(1).flatMap((lines,i)=>lines.length?[{type:'Feature',
    properties:{profile,band_minutes:Math.min(times[i],minutes),kind:'reachable_network'},
    geometry:{type:'MultiLineString',coordinates:lines.map(line=>line.map(flip))}}]:[]);
  for(const [y,x,band] of current.cells)features.push({type:'Feature',properties:{kind:'approximate_reach_cell',band_minutes:Math.min(times[band-1],minutes)},
    geometry:{type:'Polygon',coordinates:[cellRing(y,x).map(flip)]}});
  download('hong-kong-walking-reach.geojson',JSON.stringify({type:'FeatureCollection',
    properties:{origin:flip(origin),minutes,profile,source:'LandsD/OSM processed November 2026',method:'Approximate network cells'},features}),'application/geo+json');
}
async function getIndex(){
  if(!indexPromise)indexPromise=fetch('data/destinations.bin').then(response=>{
    if(!response.ok)throw new Error('Destination index unavailable');
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  }).catch(error=>{indexPromise=null;throw error;});
  return indexPromise;
}
const queryWords={
  groceries:/\b(supermarkets?|grocer(?:y|ies)|convenience stores?|markets?)\b|超市|便利店|街市/,
  dining:/\b(restaurants?|caf[eé]s?|coffee|food)\b|餐廳|咖啡|餐飲/,
  health:/\b(clinics?|hospital|healthcare|pharmacies?|doctors?)\b|診所|醫院|藥房/,
  parks:/\b(parks?|playgrounds?|gardens?)\b|公園|遊樂場|花園/,
  education:/\b(schools?|libraries|library|education)\b|學校|圖書館/,
  toilets:/\b(toilets?|restrooms?)\b|公廁|洗手間/,
  benches:/\b(benches?|seats?)\b|長椅|座椅/,
  mtr:/\b(mtr|entrances?|stations?)\b|港鐵|地鐵|出入口/
};
async function searchDestination(value){
  const id=++searchNumber, box=$('destination-results');
  const query=value.trim().toLowerCase().normalize('NFKC');
  box.hidden=!query;
  if(!query)return;
  box.replaceChildren(el('p',word.searching,'subtle'));
  try{
    const index=await getIndex();
    if(id!==searchNumber)return;
    const wanted=kinds.findIndex(key=>queryWords[key].test(query));
    const accessible=/wheelchair|accessible|輪椅|無障礙/.test(query);
    const terms=query.replace(/\b(nearby|nearest|accessible|where|can|find|the|is|are|wheelchair|me|near|a|an|to)\b|最近|附近|無障礙|輪椅|在哪裏/g,' ').trim();
    const found=index.map(fromIndex);
    if(wanted>=0)for(const p of (current?.places||[]).map(fromReach))if(p.kind===wanted&&!p.name.some(Boolean)&&!p.ref)found.push(p);
    const ranking=found.filter(p=>{
      if(accessible&&p.access!==1)return false;
      const label=[...p.name,p.ref].join(' ').toLowerCase().normalize('NFKC');
      return Boolean(terms&&label.includes(terms))||(wanted>=0&&p.kind===wanted);
    }).map(p=>{
      const title=[...p.name,p.ref].join(' ').toLowerCase();
      const exact=Number(Boolean(terms&&title.includes(terms)));
      const distance=Math.hypot((p.coords[0]-origin[0])*111200,(p.coords[1]-origin[1])*103000);
      return {p,exact,distance};
    }).sort((a,b)=>b.exact-a.exact||a.distance-b.distance);
    const exactResults=ranking.filter(row=>row.exact);
    const results=exactResults.length?exactResults:ranking;
    box.replaceChildren(...results.slice(0,12).map(({p,distance})=>{
      const button=createButton(placeTitle(p),()=>chooseDestination(p));
      button.append(el('small',categoryName(p.kind)+' · '+metresLabel(distance)+(flagText(p)?' · '+flagText(p):'')));
      return button;
    }));
    if(!ranking.length)box.append(el('p',word.noMatch,'subtle'));
  } catch {
    if(id===searchNumber)box.replaceChildren(el('p',word.failed,'subtle'));
  }
}
async function searchAddress(event){
  event.preventDefault();
  const q=$('address').value.trim(), box=$('address-results');
  if(!q)return;
  addressAbort?.abort();
  const controller=new AbortController();addressAbort=controller;
  box.hidden=false;box.replaceChildren(el('p',word.searching,'subtle'));
  try{
    const response=await fetch('https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q='+encodeURIComponent(q),{signal:controller.signal});
    if(!response.ok||!window.proj4)throw new Error('Address service');
    const rows=await response.json();
    if(controller.signal.aborted)return;
    box.replaceChildren(...rows.filter(entry=>Number.isFinite(+entry.x)&&Number.isFinite(+entry.y)).slice(0,8).map(entry=>{
      const label=language==='zh'?entry.nameZH||entry.nameEN:entry.nameEN||entry.nameZH;
      const button=createButton(label,()=>{
        const xy=window.proj4('EPSG:2326','EPSG:4326',[+entry.x,+entry.y]);
        changeOrigin([xy[1],xy[0]],true,label);box.hidden=true;
      });
      return button;
    }));
    if(!box.childNodes.length)box.append(el('p',word.noAddress,'subtle'));
  }catch(error){
    if(error.name!=='AbortError')box.replaceChildren(el('p',word.addressError,'subtle'));
  }
}

for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>selectMode(button.dataset.mode));
$('welcome').addEventListener('cancel',event=>{if(!mode)event.preventDefault();});
$('switch-mode').addEventListener('click',()=>$('welcome').showModal());
for(const id of ['language','welcome-language'])$(id).addEventListener('click',()=>{language=language==='zh'?'en':'zh';localize();syncURL();});
$('share').addEventListener('click',async()=>{
  syncURL();
  try{await navigator.clipboard.writeText(location.href);$('share').textContent=word.copied;clearTimeout(shareTimer);
    shareTimer=setTimeout(()=>$('share').textContent=word.share,1600);}
  catch{window.prompt(word.share,location.href);}
});
$('profile').addEventListener('change',()=>{
  profile=$('profile').value;
  $('stairs').checked=profiles[profile][3];$('slope').value=String(profiles[profile][4]);
  gentle=gentleDefault(profile);
  localize();run();
});
for(const [id,value] of [['terrain-gentle',true],['terrain-all',false]])$(id).addEventListener('click',()=>{
  if(gentle===value)return;
  gentle=value;renderTerrain();run();
});
$('start-guide').addEventListener('click',startGuide);
$('live-stop').addEventListener('click',()=>stopGuide());
$('live-recenter').addEventListener('click',()=>{if(guide){guide.follow=true;followPosition(guide);}});
$('live-voice').addEventListener('click',()=>{
  if(!guide)return;
  guide.voice=!guide.voice;
  if(guide.voice)speakGuide(guideText(guide));else speechSynthesis.cancel();
  renderGuide();
});
document.addEventListener('visibilitychange',()=>{if(guide&&!document.hidden)keepScreenOn(guide);});
map.on('dragstart',pauseFollowing);
for(const id of ['stairs','hills','slope'])$(id).addEventListener('change',run);
$('place').addEventListener('change',()=>{
  const i=Number($('place').value), planner=mode==='planner';
  const place=planner?districts[i]:neighbourhoods[i];
  if(place)changeOrigin(planner?place.slice(4,6):place.slice(2,4),true,'',planner?i:-1);
});
$('address-form').addEventListener('submit',searchAddress);
$('locate').addEventListener('click',()=>{
  if(!navigator.geolocation){setNotice('locationFail');return;}
  navigator.geolocation.getCurrentPosition(position=>changeOrigin([position.coords.latitude,position.coords.longitude],true,word.locate),
    ()=>setNotice('locationFail'),{timeout:12000,maximumAge:30000});
});
map.on('click',({latlng})=>{if(mode&&!guide)changeOrigin([latlng.lat,latlng.lng],false);});
map.on('moveend',()=>{
  if(viewing3d&&!fromScene)scene.setView(mapCamera());
  renderViewControls();
  syncURL();
});
map.on('zoomend',render2DPins);
$('panel-toggle').addEventListener('click',()=>{
  panelOpen=!panelOpen;
  if(guide)guide.view.panelOpen=panelOpen;
  renderPanel();
});
$('pin-size').addEventListener('change',()=>{
  markerSize=Number($('pin-size').value);
  try{localStorage.setItem('hk-marker-size',String(markerSize));}catch{ /* Optional preference. */ }
  render2DPins();
  scene?.setPinSize(markerSize);
});
$('view-2d').addEventListener('click',()=>chooseMapView(false));
$('view-3d').addEventListener('click',()=>chooseMapView(true));
pin.on('dragend',()=>{const p=pin.getLatLng();changeOrigin([p.lat,p.lng],false);});
$('retry-reach').addEventListener('click',run);
$('explore-tab').addEventListener('click',()=>setTab('explore'));
$('directions-tab').addEventListener('click',()=>setTab('directions'));
$('destination').addEventListener('input',()=>searchDestination($('destination').value));
$('accessible').addEventListener('change',()=>{renderExplore();syncURL();});
for(const id of ['show-barriers','show-area'])$(id).addEventListener('change',()=>{renderLines();syncURL();});
$('district-comparison').addEventListener('toggle',renderDistrictComparison);
$('district-facility').addEventListener('change',renderDistrictComparison);
$('csv').addEventListener('click',exportCSV);
$('geo').addEventListener('click',exportGeo);
$('print').addEventListener('click',()=>window.print());
let installPrompt;
window.addEventListener('hashchange',()=>location.reload());
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
$('install-help').addEventListener('click',()=>{
  if(installPrompt){installPrompt.prompt();installPrompt=null;}else $('install-dialog').showModal();
});
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
destination=readDestination();
localize();
if(mode)run();else $('welcome').showModal();

if(params.get('map')==='3d')chooseMapView(true);
