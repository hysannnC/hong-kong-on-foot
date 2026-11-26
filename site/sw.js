const CACHE='hk-on-foot-shell-v54';
const SHELL=['./','pilot/published-trips.mjs?v=54','pilot/published-trip-records.json','app.js?v=54','settings.js?v=54','reach.js','navigation.js','scene3d.js?v=54','pins.js?v=54','brands/schools.js','style.css?v=54','manifest.webmanifest',
  'pilot/','pilot/index.html','pilot/ar.html','pilot/bridge.html','pilot/bridge.css?v=54','pilot/bridge.mjs?v=54','pilot/bridge-world.mjs','pilot/bridge-model.mjs','pilot/bridge-study.mjs','pilot/bridge-geography.mjs','pilot/bridge-field.mjs?v=54','pilot/street-model.mjs','pilot/street-model.mjs?v=54','pilot/demo-trips.mjs?v=54','pilot/demo-detections.mjs?v=54','pilot/demo-routes.mjs?v=54','pilot/street-photos.mjs','pilot/central-corridors.mjs','pilot/street-media/pedder.jpg','pilot/street-media/des-voeux.jpg','pilot/street-panel.mjs?v=54','pilot/data-downloads.mjs?v=54','map-colors.mjs','pilot/central-study.mjs?v=54','pilot/field-evidence.mjs?v=54','pilot/feedback-panel.mjs?v=54','pilot/market-routing.mjs?v=54','pilot/evidence-markers.mjs?v=54','pilot/evidence-details.mjs?v=54','reach.js?v=54','pilot/central-camera-workflow.zh.vtt','pilot/central-flow.mjs?v=54','pilot/central-camera.mjs?v=54','pilot/central-network.json','pilot/street-media/central-out-of-service.jpg','pilot/street-media/hong-kong-station-works.jpg','pilot/trip-analysis.mjs?v=54','pilot/trip-journey.mjs?v=54','pilot/trip-map.mjs?v=54','pilot/street-store.mjs?v=54','pilot/ferry-media/lift-study.jpg','pilot/bridge-phone.mjs','pilot/bridge-review.mjs','pilot/phone-signals.mjs?v=23','vendor/three.module.min.js','vendor/GLTFLoader.js','vendor/BufferGeometryUtils.js','vendor/SkeletonUtils.js','vendor/mp4-muxer.mjs','pilot/bridge-people/maya.glb','pilot/bridge-people/sam.glb','pilot/bridge-people/harper.glb','pilot/bridge-people/jordan.glb','pilot/vision.mjs','pilot/ferry.html','pilot/ferry.css','pilot/ferry.mjs','pilot/ferry-media/scene-2.jpg','pilot/ferry-media/scene-4.jpg','pilot/ferry-media/scene-6.jpg','pilot/ferry-media/scene-7.jpg','pilot/ar.css','pilot/ar.mjs','pilot/ar-model.mjs','pilot/journey.css','pilot/journey.mjs','pilot/comparison.mjs','pilot/learning.mjs','pilot/pilot.css','pilot/model.mjs','pilot/pilot.mjs',
  'vendor/leaflet.js','vendor/leaflet.css','vendor/maplibre-gl.js','vendor/maplibre-gl.css',
  'vendor/maplibre-leaflet.js','vendor/proj4.js','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('hk-on-foot-shell-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(!SHELL.some(path=>new URL(path,self.registration.scope).pathname===new URL(request.url).pathname)&&request.mode!=='navigate')return;
  event.respondWith(fetch(request).catch(async()=>await caches.match(request,{ignoreSearch:true})||
    (request.mode==='navigate'?await caches.match(new URL('./',self.registration.scope)):Response.error())||Response.error()));
});
