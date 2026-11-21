const CACHE='hk-on-foot-shell-v6';
const SHELL=['./','app.js','settings.js','reach.js','navigation.js','scene3d.js','pins.js','brands/schools.js','style.css','manifest.webmanifest',
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
