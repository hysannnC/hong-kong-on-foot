import {createPinSprites,markerKey} from './pins.js';

const collection=features=>({type:'FeatureCollection',features});
const flip=([lat,lng])=>[lng,lat];
const feature=(type,coordinates,properties={})=>({type:'Feature',geometry:{type,coordinates},properties});

export async function openScene(container,{view,bounds,labels,onView,onOrigin,onPlace,onDrag,onUnavailable}){
  const renderer=window.maplibregl;
  if(!renderer)throw new Error('3D renderer unavailable');
  const map=new renderer.Map({
    container,style:'https://tiles.openfreemap.org/styles/positron',center:flip(view.coords),
    zoom:view.zoom-1,pitch:view.pitch??48,bearing:view.bearing??0,minZoom:9,maxZoom:18,
    maxBounds:bounds.map(flip),maxPitch:65,renderWorldCopies:false,
    attributionControl:{compact:true,customAttribution:'<a href="https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637222018065_52265">Walking network © LandsD / CSDI</a>'},
    locale:{'NavigationControl.ZoomIn':labels.zoomIn,'NavigationControl.ZoomOut':labels.zoomOut,'NavigationControl.ResetBearing':labels.resetBearing}
  });
  let visible=false, syncing=false, places=[], popup=null, start=null, end=null, gps=null, turn=null;
  const sprites=createPinSprites(map);
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('3D style load timeout')),18000);
      const loaded=()=>finish();
      const lost=()=>finish(new Error('3D context unavailable'));
      function finish(error){
        clearTimeout(timer);map.off('style.load',loaded);map.off('webglcontextlost',lost);
        if(error)reject(error);else resolve();
      }
      map.once('style.load',loaded);
      map.once('webglcontextlost',lost);
    });
    const elevation='hk-elevation';
    const tileURL=new URL('terrain/',document.baseURI).href+'{z}/{x}/{y}.png';
    map.addSource(elevation,{type:'raster-dem',tiles:[tileURL],encoding:'terrarium',tileSize:256,
      minzoom:9,maxzoom:13,bounds:[113.55,22.01,114.8,22.87],
      attribution:'<a href="https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-1">Elevation: NASA / NGA SRTM</a>'});
    const styleLayers=map.getStyle().layers;
    map.addLayer({id:'hk-hillshade',type:'hillshade',source:elevation,paint:{
      'hillshade-shadow-color':'#56685b','hillshade-highlight-color':'#fbfbf3',
      'hillshade-accent-color':'#4d6051','hillshade-exaggeration':.26,
      'hillshade-illumination-anchor':'map',
    }},styleLayers.find(layer=>layer['source-layer']==='water')?.id
      ||styleLayers.find(layer=>layer.type==='line')?.id);
    map.setTerrain({source:elevation,exaggeration:1});
    const height=['max',0,['to-number',['coalesce',['get','render_height'],7],7]];
    map.addLayer({id:'hk-buildings',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',
      minzoom:13.4,filter:['!=',['get','hide_3d'],true],paint:{
        'fill-extrusion-color':['interpolate',['linear'],height,0,'#d9dddf',100,'#b9c4c7',300,'#a8bcc3'],
        'fill-extrusion-height':height,
        'fill-extrusion-base':['min',height,['max',0,['to-number',['coalesce',['get','render_min_height'],0],0]]],
        'fill-extrusion-opacity':.72,
      }},map.getStyle().layers.find(layer=>layer.type==='symbol')?.id);
    await sprites.prepare();
    for(const id of ['hk-reach','hk-area','hk-barriers','hk-route']){
      map.addSource(id,{type:'geojson',data:collection([])});
    }
    map.addLayer({id:'hk-area',type:'fill',source:'hk-area',paint:{'fill-color':['get','color'],'fill-opacity':.14}});
    map.addLayer({id:'hk-reach',type:'line',source:'hk-reach',layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':.95}});
    map.addLayer({id:'hk-route-halo',type:'line',source:'hk-route',layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':'white','line-width':9}});
    map.addLayer({id:'hk-route',type:'line',source:'hk-route',layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':'#12675a','line-width':5.6}});
    map.addLayer({id:'hk-barriers',type:'circle',source:'hk-barriers',
      paint:{'circle-radius':5,'circle-color':'#ad432c','circle-stroke-color':'white','circle-stroke-width':1.5}});
    map.addSource('hk-places',{type:'geojson',data:collection([]),cluster:true,clusterMaxZoom:13,clusterRadius:44});
    map.addLayer({id:'hk-clusters',type:'circle',source:'hk-places',filter:['has','point_count'],
      paint:{'circle-radius':16,'circle-color':'#225e50','circle-stroke-color':'white','circle-stroke-width':2}});
    map.addLayer({id:'hk-cluster-count',type:'symbol',source:'hk-places',filter:['has','point_count'],
      layout:{'text-field':['get','point_count_abbreviated'],'text-size':12,'text-allow-overlap':true},
      paint:{'text-color':'white'}});
    map.addLayer({id:'hk-places',type:'symbol',source:'hk-places',filter:['!',['has','point_count']],
      layout:{'icon-size':22/32,'icon-image':['coalesce',['image',['get','icon']],['image',['get','fallback']]],
        'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-pitch-alignment':'viewport'}});
    map.addControl(new renderer.NavigationControl({visualizePitch:true}),'top-left');
  } catch(error) {
    sprites.dispose();
    map.remove();
    throw error;
  }

  function showPopup(coords,content){
    popup?.remove();
    popup=new renderer.Popup({offset:13,maxWidth:'280px'}).setLngLat(flip(coords)).setDOMContent(content).addTo(map);
  }
  function setMarker(marker,coords,className,size,options={}){
    if(!coords){marker?.remove();return null;}
    if(!marker){
      const element=document.createElement('div');
      element.className=className;
      element.style.width=element.style.height=size+'px';
      marker=new renderer.Marker({element,...options}).setLngLat(flip(coords)).addTo(map);
      if(options.draggable)marker.on('dragend',()=>{
        const p=marker.getLngLat();onOrigin([p.lat,p.lng]);
      });
    }else marker.setLngLat(flip(coords));
    return marker;
  }
  function setView(next){
    syncing=true;
    map.jumpTo({center:flip(next.coords),zoom:next.zoom-1,
      ...(next.pitch==null?{}:{pitch:next.pitch}),...(next.bearing==null?{}:{bearing:next.bearing})});
    syncing=false;
  }
  map.on('moveend',event=>{
    if(!visible||syncing||event.guideCamera)return;
    const {lat,lng}=map.getCenter();
    onView({coords:[lat,lng],zoom:map.getZoom()+1,pitch:map.getPitch(),bearing:map.getBearing()});
  });
  map.on('movestart',event=>{if(event.originalEvent)onDrag();});
  map.on('webglcontextlost',onUnavailable);
  const interactive=['hk-places','hk-clusters','hk-barriers'];
  map.on('mousemove',event=>{map.getCanvas().style.cursor=map.queryRenderedFeatures(event.point,{layers:interactive}).length?'pointer':'';});
  map.on('click',async event=>{
    if(event.originalEvent.target?.closest?.('.maplibregl-marker'))return;
    const hit=map.queryRenderedFeatures(event.point,{layers:interactive})[0];
    if(hit?.layer.id==='hk-places'){
      const place=places[Number(hit.properties.index)];
      if(place)onPlace(place);
      return;
    }
    if(hit?.layer.id==='hk-clusters'){
      try{
        const zoom=await map.getSource('hk-places').getClusterExpansionZoom(hit.properties.cluster_id);
        if(visible)map.easeTo({center:hit.geometry.coordinates,zoom});
      }catch{ /* The point selection can change during the animation. */ }
      return;
    }
    if(hit?.layer.id==='hk-barriers'){
      const node=document.createElement('span');
      node.textContent=hit.properties.label;
      showPopup([event.lngLat.lat,event.lngLat.lng],node);
      return;
    }
    onOrigin([event.lngLat.lat,event.lngLat.lng]);
  });

  return {
    show(next){visible=true;map.resize();setView(next);},
    hide(){visible=false;popup?.remove();},
    dispose(){places=[];sprites.dispose();map.remove();},
    setView,showPopup,
    resize(){map.resize();},
    setPinSize(size){map.setLayoutProperty('hk-places','icon-size',size/32);},
    setGuiding(active){map.setLayoutProperty('hk-buildings','visibility',active?'none':'visible');},
    follow(coords,bearing){
      const verticalOffset=Math.min(110,map.getCanvas().clientHeight*.18);
      map.easeTo({center:flip(coords),bearing,pitch:53,zoom:18,duration:500,offset:[0,verticalOffset]},
        {guideCamera:true});
    },
    setTurn(cue){
      turn=setMarker(turn,cue?.coords,'turn-pin',30);
      if(turn){
        turn.getElement().textContent=cue.glyph;
        turn.getElement().setAttribute('aria-hidden','true');
      }
    },
    setOrigin(coords,label,draggable){
      start=setMarker(start,coords,'start-pin',27,{draggable:true});
      start.setDraggable(draggable);
      start.getElement().setAttribute('aria-label',label);
    },
    setDestination(coords){end=setMarker(end,coords,'destination-pin',27);},
    setPosition(coords){gps=setMarker(gps,coords,'gps-pin',16);},
    setPlaces(points){
      places=points;
      const features=points.map((p,index)=>feature('Point',flip(p.coords),
        {index,icon:markerKey(p),fallback:'category-'+p.kind}));
      map.getSource('hk-places').setData(collection(features));
      const keys=new Set(features.map(f=>f.properties.icon).filter(key=>!key.startsWith('category-')));
      if(keys.size)Promise.all([...keys].map(sprites.add)).then(results=>{
        if(places===points&&results.some(Boolean))map.getSource('hk-places')?.setData(collection(features));
      });
    },
    setReach(lines,cells,barriers){
      map.getSource('hk-reach').setData(collection(lines.map(({segments,color,width})=>
        feature('MultiLineString',segments.map(line=>line.map(flip)),{color,width}))));
      map.getSource('hk-area').setData(collection(cells.map(({ring,color})=>
        feature('Polygon',[ring.map(flip)],{color}))));
      map.getSource('hk-barriers').setData(collection(barriers.map(({coords,label})=>
        feature('Point',flip(coords),{label}))));
    },
    setRoute(lines){
      map.getSource('hk-route').setData(lines.length?collection([feature('MultiLineString',lines.map(line=>line.map(flip)))]):collection([]));
    },
  };
}
