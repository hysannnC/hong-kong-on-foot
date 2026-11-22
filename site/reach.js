const SCALE = 1e6;
const TILE_SIZE = 20000;
const LAT_METRES = .1112;
const LNG_METRES = .103;
const STAIRS = 1;
const FORWARD_ONLY = 2;
const REVERSE_ONLY = 4;
const WHEELCHAIR_BARRIER = 16;
const LIFT = 32;
let manifest;
const tileCache = new Map();

async function loadData(path,gzip=false) {
  for (let attempt=1; ; attempt++) {
    try {
      const response=await fetch(path,{signal:AbortSignal.timeout(12000),cache:attempt===1?'default':'reload'});
      if (!response.ok) throw new Error('Walking data request failed');
      if (!gzip) return await response.json();
      const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).json();
    } catch(error) {
      if (attempt===3) throw error;
    }
  }
}

function getManifest() {
  manifest ||= loadData('data/manifest.json').catch(error=>{
    manifest=undefined;
    throw error;
  });
  return manifest;
}

function loadPackage(key,limit) {
  if (tileCache.has(key)) return tileCache.get(key);
  const pending = loadData('data/' + key + '.bin',true).catch(error => {
    if (tileCache.get(key)===pending) tileCache.delete(key);
    throw error;
  });
  tileCache.set(key,pending);
  if (tileCache.size > limit) tileCache.delete(tileCache.keys().next().value);
  return pending;
}

function loadTile(key,index) {
  if (!index.grouped) return loadPackage(key,60);
  const [y,x] = key.split('_').map(Number);
  const group = Math.floor(y/3) + '_' + Math.floor(x/3);
  return loadPackage(group,12).then(tiles => tiles[key]);
}

class MinHeap {
  rows = [];
  push(cost,node) {
    let index = this.rows.length;
    this.rows.push([cost,node]);
    const entry = this.rows[index];
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.rows[parent][0] <= cost) break;
      this.rows[index] = this.rows[parent];
      index = parent;
    }
    this.rows[index] = entry;
  }
  pop() {
    const head = this.rows[0];
    const last = this.rows.pop();
    if (!this.rows.length) return head;
    let index = 0;
    while (index * 2 + 1 < this.rows.length) {
      let child = index * 2 + 1;
      const right = child + 1;
      if (right < this.rows.length && this.rows[right][0] < this.rows[child][0]) child = right;
      if (this.rows[child][0] >= last[0]) break;
      this.rows[index] = this.rows[child];
      index = child;
    }
    this.rows[index] = last;
    return head;
  }
}

function project(lat,lng,e) {
  const dx = (e[6] - e[4]) * LNG_METRES;
  const dy = (e[5] - e[3]) * LAT_METRES;
  const x = (lng - e[4]) * LNG_METRES;
  const y = (lat - e[3]) * LAT_METRES;
  const t = dx || dy ? Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy))) : 0;
  return [t,Math.hypot(x - dx*t,y - dy*t)];
}

function addArc(graph,from,to,edge,reverse) {
  if (!graph.has(from)) graph.set(from,[]);
  graph.get(from).push([to,edge,reverse]);
}

function selectAnchor(candidates,graph,profile) {
  const preference = ([edge,,offset]) => offset + (edge[9] & 8 ? 4 : 0);
  candidates.sort((a,b) => preference(a) - preference(b) || a[0][0] - b[0][0]);
  const nearest = candidates[0];
  if (!nearest) return undefined;
  // Small isolated fragments often sit alongside the connected footpath.
  const small = new Set();
  for (const candidate of candidates) {
    if (candidate[2] > nearest[2] + 16) continue;
    const edge = candidate[0];
    if (!profile && small.has(edge[1])) continue;
    const visited = new Set();
    if (!profile || candidate[1]===0 || Number.isFinite(edgeCost(edge,true,profile))) visited.add(edge[1]);
    if (!profile || candidate[1]===1 || Number.isFinite(edgeCost(edge,false,profile))) visited.add(edge[2]);
    for (const node of visited) {
      for (const [other,segment,reverse] of graph.get(node) || []) {
        if (!profile || Number.isFinite(edgeCost(segment,reverse,profile))) visited.add(other);
      }
      if (visited.size >= 28) return candidate;
    }
    if (!profile) for (const node of visited) small.add(node);
  }
  return nearest;
}

function canUse(edge,profile) {
  return Number.isFinite(edgeCost(edge,false,profile)) || Number.isFinite(edgeCost(edge,true,profile));
}

function selectOriginAnchor(candidates,graph,profile) {
  if (!profile.stairs && !profile.slope && !profile.wheelchair) return selectAnchor(candidates,graph);
  if (!candidates.length) return undefined;
  // Keep the connection local to the pin. A distant flatter route does not
  // establish that the person can get there from the selected starting point.
  const nearest=Math.min(...candidates.map(candidate=>candidate[2]));
  const usable=candidates.filter(([edge,,offset])=>offset<=nearest+16&&canUse(edge,profile));
  return selectAnchor(usable,graph,profile);
}

function edgeCost(e,reverse,profile) {
  const grade = reverse ? -e[8] : e[8];
  const flags = e[9];
  if ((reverse ? flags & FORWARD_ONLY : flags & REVERSE_ONLY) ||
      (profile.stairs && (flags & STAIRS)) ||
      (profile.wheelchair && (flags & WHEELCHAIR_BARRIER)) ||
      (profile.slope && !(flags & LIFT) && Math.abs(grade) * 100 > profile.slope)) return Infinity;
  const factor = profile.hills && !(flags & LIFT) ? Math.exp(-3.5 * (Math.abs(grade + .05) - .05)) : 1;
  return e[7] / (factor * profile.pace);
}

function walk(graph,anchor,profile,budget,goal) {
  const heap = new MinHeap();
  const best = new Map();
  const travelled = new Map();
  const [e,position,offset] = anchor;
  const back = goal ? new Map() : null;
  function visit(node,cost,distance,arc) {
    if (cost > budget || cost >= (best.get(node) ?? Infinity) || !Number.isFinite(cost)) return;
    best.set(node,cost);
    travelled.set(node,distance);
    if (back) back.set(node,arc);
    heap.push(cost,node);
  }
  const startCost = offset/profile.pace;
  visit(e[1],position === 0 ? startCost : startCost + edgeCost(e,true,profile)*position,offset + e[7]*position);
  visit(e[2],position === 1 ? startCost : startCost + edgeCost(e,false,profile)*(1-position),offset + e[7]*(1-position));
  while (heap.rows.length) {
    const [cost,node] = heap.pop();
    if (best.get(node) !== cost) continue;
    for (const [to,edge,reverse] of graph.get(node) || []) visit(to,cost + edgeCost(edge,reverse,profile),travelled.get(node)+edge[7],[node,edge,reverse]);
  }
  return {best,travelled,profile,anchor,back};
}

function approaches(edge,journey) {
  const {best,travelled,profile,anchor} = journey;
  const list = [];
  const forward = edgeCost(edge,false,profile);
  const reverse = edgeCost(edge,true,profile);
  if (best.has(edge[1]) && Number.isFinite(forward)) list.push([0,1,best.get(edge[1]),forward,travelled.get(edge[1])]);
  if (best.has(edge[2]) && Number.isFinite(reverse)) list.push([1,0,best.get(edge[2]),reverse,travelled.get(edge[2])]);
  if (edge[0] === anchor[0][0]) {
    const startCost = anchor[2]/profile.pace;
    if (Number.isFinite(forward)) list.push([anchor[1],1,startCost,forward,anchor[2]]);
    if (Number.isFinite(reverse)) list.push([anchor[1],0,startCost,reverse,anchor[2]]);
  }
  return list;
}

function atTime(approach,position) {
  const [from,to,start,cost] = approach;
  if (position < Math.min(from,to) || position > Math.max(from,to)) return Infinity;
  return start + Math.abs(position-from)*cost;
}

const BANDS = [5,10,15,20,25,30];
const ADULT = {pace:1.25,stairs:false,hills:true,slope:0,wheelchair:false};
const CELL = 450;
const SHADES = 20;

function point(edge,t) {
  return [(edge[3]+(edge[5]-edge[3])*t)/SCALE,(edge[4]+(edge[6]-edge[4])*t)/SCALE];
}

function drawEdge(edge,profiles,lines,gradient,coverage,budget) {
  const cuts = new Set([0,1]);
  for (const [index,list] of profiles.entries()) {
    for (const [from,to,start,cost] of list) {
      cuts.add(from);
      if (!cost) continue;
      for (const cutoff of index === 0 ? [...BANDS.map(n=>n*60).filter(n=>n<budget), ...Array.from({length:SHADES},(_,i)=>budget*(i+1)/SHADES)] : [budget]) {
        const position = from + Math.sign(to-from)*(cutoff-start)/cost;
        if (cutoff>start && position>Math.min(from,to) && position<Math.max(from,to)) cuts.add(position);
      }
    }
  }
  const positions = [...cuts].sort((a,b)=>a-b);
  for (let i=1;i<positions.length;i++) {
    const left = positions[i-1], right = positions[i], mid = (left+right)/2;
    const custom = Math.min(...profiles[0].map(a=>atTime(a,mid)));
    const standard = Math.min(...profiles[1].map(a=>atTime(a,mid)));
    if (custom>budget && standard>budget) continue;
    const band = custom<=budget ? 1+BANDS.findIndex(m=>custom<=m*60) : 0;
    const segment=[point(edge,left),point(edge,right)];
    lines[band].push(segment);
    if (!band) continue;
    gradient[Math.min(SHADES-1,Math.floor(custom/budget*SHADES))].push(segment);
    const pieces = Math.max(1,Math.ceil(edge[7]*(right-left)/20));
    for (let n=0;n<=pieces;n++) {
      const [lat,lng] = point(edge,left+(right-left)*n/pieces);
      const y = Math.floor(lat*SCALE/CELL), x = Math.floor(lng*SCALE/CELL);
      const key = y+'_'+x;
      if (!coverage.has(key) || band<coverage.get(key)) coverage.set(key,band);
    }
  }
}

async function getNetwork(index,origin,other,range) {
  const [lat,lng] = origin.map(v=>Math.round(v*SCALE));
  const [toLat,toLng] = other ? other.map(v=>Math.round(v*SCALE)) : [lat,lng];
  const south = Math.min(lat,toLat)-range/LAT_METRES, north = Math.max(lat,toLat)+range/LAT_METRES;
  const west = Math.min(lng,toLng)-range/LNG_METRES, east = Math.max(lng,toLng)+range/LNG_METRES;
  const files = [];
  for(let y=Math.floor(south/TILE_SIZE);y<=Math.floor(north/TILE_SIZE);y++){
    for(let x=Math.floor(west/TILE_SIZE);x<=Math.floor(east/TILE_SIZE);x++){
      const key=y+'_'+x;
      if(index.tiles.includes(key)) files.push(loadTile(key,index));
    }
  }
  const tiles = await Promise.all(files);
  const graph = new Map(), edges = new Map(), candidates = [];
  for (const tile of tiles) for (const edge of tile.e) {
    if (edges.has(edge[0]) ||
        Math.min(edge[3],edge[5])>north || Math.max(edge[3],edge[5])<south ||
        Math.min(edge[4],edge[6])>east || Math.max(edge[4],edge[6])<west) continue;
    edges.set(edge[0],edge);
    addArc(graph,edge[1],edge[2],edge,false);
    addArc(graph,edge[2],edge[1],edge,true);
    const [position,distance] = project(lat,lng,edge);
    if (distance<=65) candidates.push([edge,position,distance]);
  }
  return {tiles,graph,edges,candidates};
}

function summaries(tiles,journey,budget,includePlaces) {
  const counts = Array(8).fill(0), places = [];
  for (const tile of tiles) for (const row of tile.p) {
    const [lat,lng,kind,en,zh,ref,edge,position,distance,access,photo,address,brand] = row;
    const segment = journey.edges.get(edge);
    if (!segment) continue;
    let seconds = Infinity, metres = Infinity;
    for (const option of approaches(segment,journey)) {
      const time = atTime(option,position)+distance/journey.profile.pace;
      const length = option[4]+Math.abs(position-option[0])*segment[7]+distance;
      if (time<seconds || (time===seconds && length<metres)) {
        seconds=time;
        metres=length;
      }
    }
    if (seconds>budget) continue;
    counts[kind]++;
    if (includePlaces) places.push([lat/SCALE,lng/SCALE,kind,en,zh,ref,seconds/60,edge,position,distance,access||0,metres,photo||'',address||'',brand||'']);
  }
  return {counts,places};
}

function barriersNear(edges,baseline,profile,budget) {
  const blocked = new Map();
  for(const edge of edges.values()){
    const stair = edge[9]&STAIRS, restricted = edge[9]&WHEELCHAIR_BARRIER, steep = Math.abs(edge[8])*100>(profile.slope||8);
    if(!stair&&!restricted&&!steep) continue;
    const seconds = Math.min(...approaches(edge,baseline).map(a=>atTime(a,.5)));
    if(seconds>budget) continue;
    const [lat,lng]=point(edge,.5);
    const key=[Math.round(lat*3600),Math.round(lng*3600)].join('_');
    const type = stair ? 'stairs' : restricted ? 'restricted' : 'steep';
    const prior=blocked.get(key);
    if(!prior||seconds<prior[2]) blocked.set(key,[lat,lng,seconds,type,Math.abs(edge[8])*100]);
  }
  return [...blocked.values()].sort((a,b)=>a[2]-b[2]).slice(0,160);
}

async function reach(index,data) {
  const budget=data.minutes*60;
  const range=budget*Math.max(ADULT.pace*1.2,data.pace*(data.hills?1.2:1))+150;
  const {tiles,graph,edges,candidates}=await getNetwork(index,data.origin,null,range);
  if(!candidates.length) return {empty:true};
  const anchor=selectOriginAnchor(candidates,graph,data);
  const journey=anchor ? {...walk(graph,anchor,data,budget),edges} : null;
  const emptyPlaces={counts:Array(8).fill(0),places:[]};
  if(data.summaryOnly)return journey?summaries(tiles,journey,budget,true):emptyPlaces;
  const baseline={...walk(graph,anchor||selectAnchor(candidates,graph),ADULT,budget),edges};
  const lines=Array.from({length:BANDS.length+1},()=>[]), gradient=Array.from({length:SHADES},()=>[]), coverage=new Map();
  for(const edge of edges.values()){
    const current=journey?approaches(edge,journey):[], reference=approaches(edge,baseline);
    if(current.length||reference.length) drawEdge(edge,[current,reference],lines,gradient,coverage,budget);
  }
  const {counts,places}=journey?summaries(tiles,journey,budget,true):emptyPlaces;
  const reference=summaries(tiles,baseline,budget,false).counts;
  const length=lines.slice(1).flat().reduce((sum,[a,b])=>sum+Math.hypot((a[0]-b[0])*111200,(a[1]-b[1])*103000),0);
  return {lines,gradient,counts,places,reference,length,barriers:barriersNear(edges,baseline,data,budget),
    cells:[...coverage].map(([key,band])=>[...key.split('_').map(Number),band])};
}

function reconstruct(journey,edge,position) {
  const [start,startPos,startOffset]=journey.anchor;
  const options=[];
  const add=(cost,node,reverse)=>{if(Number.isFinite(cost))options.push({cost,node,reverse});};
  const forward=edgeCost(edge,false,journey.profile), reverse=edgeCost(edge,true,journey.profile);
  add((journey.best.get(edge[1])??Infinity)+(position===0?0:forward*position),edge[1],false);
  add((journey.best.get(edge[2])??Infinity)+(position===1?0:reverse*(1-position)),edge[2],true);
  if(start[0]===edge[0]) add(startOffset/journey.profile.pace+
    (position===startPos?0:Math.abs(position-startPos)*(position>startPos?forward:reverse)),null,false);
  options.sort((a,b)=>a.cost-b.cost);
  const end=options[0];
  if(!end) return null;
  const leg=(e,from,to)=>[point(e,from),point(e,to),e[9],e[7]*Math.abs(to-from),(e[8]||0)*Math.sign(to-from)];
  if(end.node===null) return {seconds:end.cost,legs:[leg(start,startPos,position)]};
  const legs=[leg(edge,end.reverse?1:0,position)];
  let node=end.node, entry=journey.back.get(node);
  while(entry){
    const [previous,segment,backward]=entry;
    legs.push(leg(segment,backward?1:0,backward?0:1));
    node=previous;
    entry=journey.back.get(node);
  }
  legs.push(leg(start,startPos,node===start[1]?0:1));
  return {seconds:end.cost,legs:legs.reverse()};
}

function destinationAnchors(edges,destination,profile) {
  const [lat,lng]=destination.coords.map(value=>value*SCALE);
  const edge=edges.get(destination.edge);
  const limit=profile.mobility?32:110;
  if(edge&&Number.isFinite(destination.position)){
    const [,offset]=project(lat,lng,edge);
    if(offset<=limit){
      if(profile.mobility&&!canUse(edge,profile))return [];
      return [[edge,destination.position,offset]];
    }
    if(profile.mobility)return [];
  }
  const nearby=[];
  for(const segment of edges.values()){
    const [position,offset]=project(lat,lng,segment);
    if(offset<=(profile.mobility?22:45))nearby.push([segment,position,offset]);
  }
  if(!nearby.length)return [];
  const nearest=Math.min(...nearby.map(candidate=>candidate[2]));
  const tolerance=profile.mobility?8:16;
  return nearby.filter(([segment,,offset])=>offset<=nearest+tolerance&&canUse(segment,profile));
}

async function findRoute(index,profile) {
  const {origin,destination,pace,stairs,mobility}=profile;
  const [lat,lng]=destination.coords;
  const direct=Math.hypot((lat-origin[0])*111200,(lng-origin[1])*103000);
  if(direct>8500)return {routeError:'routeFar'};
  if(mobility&&destination.access===3)return {routeError:'blockedAccess'};
  const {graph,edges,candidates}=await getNetwork(index,origin,[lat,lng],1500);
  if(!candidates.length)return {routeError:'noPath'};
  const unavailable={routeError:stairs?'noStepFree':'noRoute'};
  const anchor=selectOriginAnchor(mobility?candidates.filter(candidate=>candidate[2]<=32):candidates,graph,profile);
  if(!anchor)return unavailable;
  const targets=destinationAnchors(edges,destination,profile);
  if(!targets.length)return unavailable;
  const budget=Math.min(21600,direct/pace*3+1500);
  const journey=walk(graph,anchor,profile,budget,true);
  let route=null;
  for(const [target,position,offset] of targets){
    const solution=reconstruct(journey,target,position);
    if(!solution)continue;
    const seconds=solution.seconds+offset/pace;
    if(route&&route.seconds<=seconds)continue;
    route={...solution,seconds,offset,metres:solution.legs.reduce((n,leg)=>n+leg[3],0)+anchor[2]+offset};
  }
  return route?{route}:unavailable;
}

self.onmessage=async ({data})=>{
  try {
    const index=await getManifest();
    const result=data.destination ? await findRoute(index,data) : await reach(index,data);
    self.postMessage({id:data.id,kind:data.destination?'route':'reach',source:index.source,...result});
  } catch(error){
    self.postMessage({id:data.id,kind:data.destination?'route':'reach',error:'failed'});
    console.error(error);
  }
};
