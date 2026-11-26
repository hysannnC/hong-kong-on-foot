import * as T from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone} from '../vendor/SkeletonUtils.js';
import {notice,pedestrianPose,pedestrianPlan,walkingSpeed,position,duration,turnStart,rampLength,rampPose,rampFloor,rampExit} from './bridge-model.mjs';

export function buildWorld(canvas){
  const scene=new T.Scene();scene.background=new T.Color('#bfdae8');scene.fog=new T.FogExp2('#bfd3da',.013);
  const camera=new T.PerspectiveCamera(64,1,.06,125);
  const phoneCamera=new T.PerspectiveCamera(72,1,.06,125);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.17;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;
  const sky=new T.HemisphereLight('#dff3ff','#80776b',1.68);scene.add(sky);
  const sun=new T.DirectionalLight('#fff0d8',2.1);
  sun.position.set(-18,24,-17);
  sun.target.position.set(0,0,-32);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1536,1536);
  Object.assign(sun.shadow.camera,{left:-22,right:22,top:38,bottom:-42,near:1,far:85});
  sun.shadow.normalBias=.035;
  scene.add(sun,sun.target);
  const material=(color,params={})=>new T.MeshStandardMaterial({color,roughness:.84,...params});
  const boxGeometry=new T.BoxGeometry(1,1,1);
  const box=(w,h,l,x,y,s,mat,parent=scene)=>{
    const m=new T.Mesh(boxGeometry,mat);m.scale.set(w,h,l);m.position.set(x,y,-s);parent.add(m);return m;
  };
  const steel=material('#244d78',{metalness:.3}), edge=material('#728c9c',{metalness:.45});
  const grey=material('#b2bec0'), roof=material('#aebbbb'), glass=material('#87bbc7',{opacity:.25,transparent:true,depthWrite:false});
  const lamp=new T.MeshBasicMaterial({color:'#fff8de'});
  const alloy=material('#a8b5b7',{metalness:.58,roughness:.38});
  const bolts=new T.CylinderGeometry(.036,.036,.035,6);
  function bolt(x,y,s){const m=new T.Mesh(bolts,alloy);m.rotation.z=Math.PI/2;m.position.set(x,y,-s);scene.add(m);}

  const tile=document.createElement('canvas');tile.width=tile.height=128;
  const ctx=tile.getContext('2d');ctx.fillStyle='#a6a099';ctx.fillRect(0,0,128,128);
  for(let y=0;y<4;y++) for(let x=0;x<4;x++){
    const v=165+((x*19+y*11)%18);
    ctx.fillStyle='rgb('+v+','+(v-6)+','+(v-14)+')';ctx.fillRect(x*32+1,y*32+1,30,30);
  }
  for(let i=0;i<3300;i++){
    const x=(i*11731%17389)%128,y=(i*617%11777)%128;
    ctx.fillStyle=i%2?'#4e473b12':'#fff6e41a';ctx.fillRect(x,y,1+(i%2),1);
  }
  const map=new T.CanvasTexture(tile);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(9,87);map.anisotropy=8;
  const floor=new T.Mesh(new T.PlaneGeometry(6.8,65),material('#d2c9ba',{map}));
  floor.receiveShadow=true;floor.rotation.x=-Math.PI/2;floor.position.set(0,0,-32.5);scene.add(floor);
  box(6.8,.22,65,0,-.115,32.5,grey);
  box(7.8,.18,65,0,3.42,32.5,roof);
  for(let s=0;s<=64;s+=4){
    for(const x of [-3.49,3.49]){
      if((x<0&&s>=36&&s<=44)||(x>0&&s>=28&&s<=32))continue;
      box(.23,3.32,.26,x,1.66,s,steel);
      const inset=x*.966;
      box(.045,.36,.4,inset,1.18,s,edge);
      box(.045,.35,.44,inset,2.97,s,edge);
      for(const y of [1.08,1.28,2.86,3.06])for(const dz of [-.13,.13])bolt(inset*.991,y,s+dz);
      for(const dz of [.07,1.98,3.92]){
        box(.058,.95,.065,inset,.62,s+dz,alloy);
        box(.095,.045,.14,inset,.19,s+dz,alloy);
      }
      box(.09,.045,3.97,inset,.64,s+2,alloy);
      const beam=box(.19,5.17,.22,x,1.64,s+1.97,steel);
      beam.rotation.x=(s%8===0?1:-1)*.88;
      box(.09,.82,3.82,x,.60,s+2,glass);
      box(.13,.095,4,x,1.1,s+2,edge);
      box(.22,.19,4,x,.12,s+2,grey);
    }
    box(7.1,.15,.23,0,3.3,s,steel);
    for(const x of [-2.63,-1.78,-.9,0,.9,1.78,2.63])box(.018,.016,4,x,3.322,s+2,edge);
    for(const x of [-3.22,3.22])box(.08,.012,4,x,.012,s+2,grey);
    box(1.14,.065,.35,0,3.286,s+1.2,alloy);
    box(1.07,.032,.27,0,3.243,s+1.2,lamp);
    for(const x of [-2.42,2.42]){
      box(.57,.036,3.86,x,3.30,s+2,roof);
      box(.045,.042,3.88,x+.3,3.278,s+2,edge);
      box(.036,.045,3.91,x-.33,3.273,s+2,steel);
    }
    box(6.6,.008,.095,0,.007,s+.1,grey);
  }
  // Translucent construction sheeting softens the right side of the real bridge corridor.
  const liner=material('#b5b6a9',{roughness:1});
  for(let s=16;s<28;s+=2){
    box(.023,2.31,1.99,3.53,1.86,s+1,liner);
    box(.027,.016,1.99,3.51,2.89,s+1,alloy);
    box(.035,2.32,.024,3.51,1.86,s,edge);
  }
  const sea=material('#5d9ba9'), city=[material('#80959d'),material('#a3aeb0'),material('#779398')];
  box(65,.35,140,18,-5.5,39,sea);
  for(let i=0;i<19;i++){
    const x=i%2?-8-(i%4)*3:9+(i%5)*4,s=3+i*3.8,h=4+(i*13%19);
    if(x>0&&x<25&&s>15&&s<37)continue;
    box(2.8+(i%3),h,3.2,x,h/2-5,s,city[i%3]);
    for(let y=0;y<h-1;y+=1.3)box(2.3,.12,.03,x,y-3.7,s-1.62,edge);
  }
  const facadeCanvas=document.createElement('canvas');
  facadeCanvas.width=256;facadeCanvas.height=512;
  const facadeCtx=facadeCanvas.getContext('2d');
  facadeCtx.fillStyle='#576f80';facadeCtx.fillRect(0,0,256,512);
  for(let y=0;y<16;y++)for(let x=0;x<8;x++){
    facadeCtx.fillStyle=['#88a3b6','#6c889b','#a5b9c3','#465c6e'][(x*19+y*5+x*y)%4];
    facadeCtx.fillRect(x*32+2,y*32+2,28,27);
    facadeCtx.fillStyle='#cbdae121';facadeCtx.fillRect(x*32+2,y*32+2,28,5);
  }
  const facade=new T.CanvasTexture(facadeCanvas);facade.colorSpace=T.SRGBColorSpace;
  const facadeMat=material('#a0b9c8',{map:facade});
  for(let i=0;i<9;i++){
    const x=i%2?-12-(i%3)*4:13+(i%4)*5,s=5+i*5.2,h=9+(i*7%18);
    if(x>0&&x<25&&s>15&&s<37)continue;
    box(3.2,h,4.0,x,h/2-4.6,s,facadeMat);
  }
  function sign(lines,s,x=0,y=2.69,width=4.85,background='#174988'){
    const c=document.createElement('canvas');c.width=1024;c.height=200;
    const cx=c.getContext('2d');cx.fillStyle=background;cx.fillRect(0,0,1024,200);
    cx.fillStyle='#f3f7e7';cx.font='bold 55px system-ui';cx.fillText(lines[0],43,75,938);
    cx.font='36px system-ui';cx.fillText(lines[1],45,143,938);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(new T.PlaneGeometry(width,width*.195),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));m.position.set(x,y,-s);scene.add(m);return m;
  }
  sign(['↑  Pier 7 · Star Ferry','七號碼頭  天星小輪  ·  Tsim Sha Tsui 尖沙咀'],15);
  sign(['↑  Central Pier 7','中環七號碼頭  ·  Star Ferry 天星小輪'],35);
  sign(['↖  Lift to street level','升降機往地面'],36,-2.00,2.45,2.35);
  sign(['↖  Waterfront Promenade','海濱長廊  ·  Ramp access 斜道'],30,2.0,2.61,2.9).rotation.y=Math.PI;

  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const shadowContext=shadowCanvas.getContext('2d');
  const gradient=shadowContext.createRadialGradient(32,32,3,32,32,30);
  gradient.addColorStop(0,'#171f20a0');gradient.addColorStop(1,'#171f2000');
  shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,64,64);
  const shadowMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
  const shadowGeometry=new T.PlaneGeometry(.98,.85);
  const sphere=new T.SphereGeometry(1,24,18);
  function oval(parent,scale,position,mat){
    const mesh=new T.Mesh(sphere,mat);mesh.scale.set(...scale);mesh.position.set(...position);parent.add(mesh);return mesh;
  }
  function limb(parent,position,radius,length,mat){
    const joint=new T.Group();joint.position.set(...position);parent.add(joint);
    const skin=new T.Mesh(new T.CapsuleGeometry(radius,Math.max(.01,length-radius*2),6,12),mat);
    skin.position.y=-length/2;joint.add(skin);return joint;
  }
  const outfits=[
    ['#a05959','#bf9378','#28333a'],['#396675','#ad7b5c','#33383a'],['#bdad83','#d0a289','#516170'],
    ['#856687','#aa7a62','#273840'],['#507955','#c99376','#555554'],['#b26b50','#d3a285','#25343d'],
    ['#456a79','#9e6f55','#444c53'],['#a29163','#c89c7d','#303436'],['#597282','#c88d71','#384751'],
  ];
  function person([x,s,walking],i){
    const [color,skin,pants]=outfits[i%outfits.length];
    const g=new T.Group();scene.add(g);g.position.set(x,0,-s);g.scale.setScalar(.90+(i*7%13)/60);
    const shirt=material(color), trousers=material(pants), face=material(skin), hair=material(i%3?'#332d2b':'#51423a');
    const shoe=material('#252b30'), sole=material('#9b9a91');
    const body=new T.Group();g.add(body);
    oval(body,[.216,.313,.135],[0,1.13,0],shirt);
    oval(body,[.177,.16,.125],[0,.83,0],trousers);
    oval(body,[.061,.097,.058],[0,1.453,0],face);
    oval(body,[.117,.154,.105],[0,1.616,.012],face);
    oval(body,[.123,.114,.111],[0,1.691,-.009],hair);
    oval(body,[.108,.109,.052],[0,1.611,-.074],hair);
    oval(body,[.026,.035,.024],[0,1.60,.113],face);
    for(const side of [-1,1]){
      oval(body,[.018,.040,.024],[side*.115,1.61,.012],face);
      oval(body,[.017,.008,.005],[side*.044,1.631,.111],hair);
    }
    if(i%3===1){
      oval(body,[.15,.223,.084],[0,1.145,-.139],material('#353c48'));
      for(const x of [-.135,.135])box(.025,.33,.025,x,1.16,-.128,shoe,body);
    }
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=limb(body,[side*.19,1.355,0],.063,.32,shirt);
      arm.rotation.z=side*.105;
      const forearm=limb(arm,[0,-.292,0],.042,.278,face);
      forearm.rotation.x=-.13;
      oval(forearm,[.045,.066,.035],[0,-.266,.005],face);
      arms.push(arm);
      const thigh=limb(body,[side*.093,.819,0],.082,.39,trousers);
      const shin=limb(thigh,[0,-.365,0],.062,.36,trousers);
      oval(shin,[.071,.054,.133],[0,-.363,.047],shoe);
      oval(shin,[.072,.016,.137],[0,-.397,.048],sole);
      legs.push({thigh,shin});
    }
    const shade=new T.Mesh(shadowGeometry,shadowMat);shade.rotation.x=-Math.PI/2;shade.position.y=.009;g.add(shade);
    return {g,body,legs,arms,x,s,walking};
  }
  const walkers=pedestrianPlan.map(person);
  const listeners=walkers.slice(11);
  const timber=material('#917354'), amber=material('#de9332'), dark=material('#383737'), cloth=material('#b97e5b');
  box(.68,.07,1.9,2.91,.92,17.5,timber);
  for(const s of [16.8,18.2])box(.12,.92,.13,2.91,.46,s,dark);
  for(let i=0;i<5;i++)box(.2,.18,.24,2.96,1.04,16.83+i*.28,i%2?amber:cloth);
  box(.55,.22,.83,-2.92,.14,22.55,dark);
  box(.35,.46,.31,-3.03,.23,24.25,dark);
  const guitar=box(.26,.38,.11,-2.86,1.07,23.26,timber);guitar.rotation.z=-.3;
  const guitarNeck=box(.075,.4,.07,-2.71,1.33,23.27,timber);guitarNeck.rotation.z=-.5;
  const stainless=material('#9ba3a6',{metalness:.53,roughness:.37});
  const tealGlass=material('#306871',{metalness:.20,roughness:.28});
  const mullion=material('#56646a',{metalness:.45,roughness:.42});
  const canopy=material('#d5d8d2');
  const brushedCanvas=document.createElement('canvas');brushedCanvas.width=128;brushedCanvas.height=256;
  const brushed=brushedCanvas.getContext('2d');
  const reflection=brushed.createLinearGradient(0,0,128,0);
  for(const [stop,value] of [[0,'#6d7475'],[.26,'#c1c5c4'],[.46,'#a6afa9'],[.63,'#8b9392'],[1,'#d0d0c5']])reflection.addColorStop(stop,value);
  brushed.fillStyle=reflection;brushed.fillRect(0,0,128,256);
  for(let row=0;row<256;row++){
    brushed.fillStyle=row%3===0?'#fff2':'#0001';brushed.fillRect(0,row,128,1);
  }
  const doors=new T.CanvasTexture(brushedCanvas);doors.colorSpace=T.SRGBColorSpace;
  const doorMat=material('#c2c6be',{metalness:.28,roughness:.40,map:doors});
  const deck=new T.Mesh(new T.PlaneGeometry(5.70,13),floor.material);
  deck.receiveShadow=true;deck.rotation.x=-Math.PI/2;deck.position.set(-6.24,.004,-42.5);scene.add(deck);
  box(5.74,.35,13,-6.24,-.18,42.5,grey);
  box(5.7,.13,8,-6.24,2.97,40.5,roof);
  for(const [x,start,end] of [[-9.0,36,49],[-3.49,45,49]]){
    box(.065,.08,end-start,x,1.08,(start+end)/2,stainless);
    box(.033,.64,end-start,x,.62,(start+end)/2,glass);
    for(let s=start;s<=end;s+=1.3)box(.06,1.08,.06,x,.54,s,mullion);
  }
  box(5.5,.075,.075,-6.25,1.08,36.1,stainless);
  for(let i=0;i<8;i++)box(.05,1.07,.05,-8.9+i*.74,.54,36.1,mullion);
  for(const x of [-8.7,-3.7])box(.13,2.94,.15,x,1.47,37.2,mullion);
  // Lift shaft and landing sit beside the main bridge, connected by a level passage.
  const shaftWidth=3.18,shaftX=notice.x,front=48.52;
  box(shaftWidth,9.6,2.6,shaftX,-.65,front+1.32,tealGlass);
  box(shaftWidth+.28,.23,2.87,shaftX,4.27,front+1.31,canopy);
  for(const off of [-1.58,1.58]){
    box(.09,9.5,.09,shaftX+off,-.65,front,stainless);
    box(.09,9.5,.09,shaftX+off,-.65,front+2.58,stainless);
    for(let j=0;j<6;j++)box(.034,.07,2.58,shaftX+off,-4.3+j*1.38,front+1.29,mullion);
  }
  for(let i=0;i<15;i++)box(3.08,.045,.055,shaftX,2.66+i*.095,front-.04,dark);
  for(const off of [-.91,.91])box(.14,2.36,.12,shaftX+off,1.18,front-.08,stainless);
  box(1.96,.18,.14,shaftX,2.40,front-.085,stainless);
  for(const off of [-.423,.423]){
    box(.835,2.23,.12,shaftX+off,1.12,front-.075,doorMat);
    box(.24,1.03,.015,shaftX+off,1.37,front-.145,tealGlass);
    box(.235,.028,.019,shaftX+off,1.87,front-.154,stainless);
  }
  box(.018,2.2,.01,shaftX,1.1,front-.147,dark);
  box(.13,.28,.045,shaftX+1.16,1.06,front-.08,stainless);
  box(.049,.049,.021,shaftX+1.16,1.10,front-.11,lamp);
  sign(['L1  ·  OUT OF SERVICE','暫停服務'],front-.16,shaftX,2.39,.92,'#332527');
  box(3.36,.09,1.48,shaftX,2.70,front-.69,canopy);
  box(3.32,.028,1.42,shaftX,2.77,front-.68,glass);
  for(const off of [-1.45,1.45])box(.065,.065,1.50,shaftX+off,2.718,front-.69,stainless);
  box(.78,.04,.12,shaftX,2.642,front-.67,lamp);
  for(let i=0;i<13;i++)for(let j=0;j<4;j++)box(.043,.022,.043,shaftX-.82+i*.136,.017,front-.37-j*.12,amber);
  // Portable signed maintenance stand closes the actual door approach.
  const board=sign(['Lift temporarily out of service','升降機暫停服務  ·  26/11–02/12/2026'],notice.s,shaftX,1.13,1.53,'#74432b');
  board.rotation.x=-.12;
  box(1.57,.335,.045,shaftX,1.13,notice.s+.035,canopy);
  for(const off of [-.72,.72]){
    box(.057,1.30,.075,shaftX+off,.65,notice.s,stainless);
    const foot=box(.078,1.25,.065,shaftX+off,.62,notice.s+.25,stainless);
    foot.rotation.x=.31;
    box(.21,.052,.5,shaftX+off,.031,notice.s+.10,dark);
  }
  // Four sloping flights and three level landings share the camera path.
  const rampWidth=1.24;
  const sampleCount=Math.ceil(rampLength/.36);
  const rampTexture=map.clone();rampTexture.repeat.set(4,102);
  const rampMaterial=material('#c7c6ba',{map:rampTexture,side:T.DoubleSide});
  const rampVertices=[],rampUV=[],rampIndices=[];
  const fasciaVertices=[],fasciaIndices=[];
  const railMaterial=material('#a8b8b9',{metalness:.5,roughness:.38});
  function rampEdge(p,side,y=0){
    return new T.Vector3(p.x+side*Math.cos(p.heading)*rampWidth,p.y+y,-p.s+side*Math.sin(p.heading)*rampWidth);
  }
  function railBetween(a,b,size,mat){
    const delta=b.clone().sub(a);
    const mesh=box(size,delta.length()+size*.45,size,(a.x+b.x)/2,(a.y+b.y)/2,-(a.z+b.z)/2,mat);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  }
  for(let i=0;i<=sampleCount;i++){
    const metres=rampLength*i/sampleCount;
    const point=rampPose(metres);
    for(const side of [-1,1]){
      rampVertices.push(...rampEdge(point,side).toArray());rampUV.push((side+1)/2,i/sampleCount);
      fasciaVertices.push(...rampEdge(point,side).toArray(),...rampEdge(point,side,-.19).toArray());
      if(i<sampleCount){
        const next=rampPose(rampLength*(i+1)/sampleCount);
        for(const [height,size] of [[.12,.075],[.67,.048],[1.02,.074]]){
          railBetween(rampEdge(point,side,height),rampEdge(next,side,height),size,railMaterial);
        }
      }
      if(i%3===0||i===sampleCount){
        const foot=rampEdge(point,side);
        box(.056,1.03,.056,foot.x,foot.y+.51,-foot.z,mullion);
        box(.14,.025,.14,foot.x,foot.y+.012,-foot.z,railMaterial);
      }
    }
    if(i<sampleCount){
      const a=i*2;
      rampIndices.push(a,a+2,a+1,a+1,a+2,a+3);
      for(const side of [0,2]){
        const b=i*4+side;
        fasciaIndices.push(b,b+4,b+1,b+1,b+4,b+5);
      }
    }
    if(i%14===0&&point.y>rampFloor+.38){
      const height=point.y-rampFloor-.12;
      for(const side of [-.68,.68]){
        const foot=rampEdge(point,side);
        box(.30,height,.30,foot.x,rampFloor+height/2,-foot.z,steel);
      }
    }
  }
  function surface(vertices,indices,mat,uv){
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    if(uv)geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new T.Mesh(geo,mat);mesh.receiveShadow=true;scene.add(mesh);
  }
  surface(rampVertices,rampIndices,rampMaterial,rampUV);
  surface(fasciaVertices,fasciaIndices,material('#637a85',{side:T.DoubleSide}));
  // A continuous plaza meets the last flight flush at grade.
  const plazaTexture=map.clone();plazaTexture.repeat.set(34,27);
  const plaza=new T.Mesh(new T.PlaneGeometry(30,25),material('#aeb7b8',{map:plazaTexture}));
  plaza.rotation.x=-Math.PI/2;plaza.position.set(9,rampFloor,-24.0);plaza.receiveShadow=true;scene.add(plaza);
  box(30,2.6,25,9,rampFloor-1.32,24,grey);
  for(const x of [-2.8,2.8])for(const s of [15,25,35]){
    box(.46,-rampFloor,.54,x,rampFloor/2,s,grey);
  }
  for(let x=-5.5;x<=23.5;x+=1.45){
    box(.075,.96,.075,x,rampFloor+.48,36.4,mullion);
  }
  box(29.6,.078,.078,9,rampFloor+.96,36.4,railMaterial);
  box(29.6,.043,.043,9,rampFloor+.48,36.4,railMaterial);
  for(let i=0;i<13;i++)for(let j=0;j<4;j++){
    box(.039,.017,.039,rampExit.x-.12-j*.13,rampFloor+.008,rampExit.s-.96+i*.16,amber);
  }
  box(3.38,.10,.09,4.5,rampFloor+2.46,28.43,mullion);
  for(const x of [2.85,6.15]){
    box(.072,2.6,.072,x,rampFloor+1.30,28.4,mullion);
  }
  sign(['↑  Central Pier 7','中環七號碼頭  ·  Star Ferry 天星小輪'],28.4,4.5,rampFloor+2.39,3.1);
  // Camera-mounted foreground represents the rider's view down to the chair.
  scene.add(camera);
  const chair=new T.Group();chair.position.set(0,.025,-.65);camera.add(chair);
  const frameMat=material('#294552',{metalness:.46,roughness:.38});
  const denim=material('#31434e'), shoe=material('#383e41'), rubber=material('#282f31'), sole=material('#a5a6a1');
  function tube(from,to,radius,mat,parent){
    const a=new T.Vector3(...from),b=new T.Vector3(...to),delta=b.clone().sub(a);
    const m=new T.Mesh(new T.CylinderGeometry(radius,radius,delta.length(),10),mat);
    m.position.copy(a).addScaledVector(delta,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());parent.add(m);
  }
  for(const side of [-1,1]){
    const x=side*.16;
    // Thighs enter from beneath the camera. Ankles and shoe soles meet the footplate.
    tube([x,-.88,-.22],[x,-.80,-.81],.090,denim,chair);
    oval(chair,[.093,.096,.10],[x,-.792,-.82],denim);
    tube([x,-.80,-.82],[x,-.867,-1.22],.065,denim,chair);
    oval(chair,[.069,.055,.139],[x,-.933,-1.09],shoe);
    box(.135,.024,.245,x,-.890,1.36,sole,chair);
    box(.205,.026,.36,x,-.916,1.37,frameMat,chair);
    for(let i=0;i<7;i++)box(.17,.007,.013,x,-.900,1.23+i*.045,rubber,chair);
    tube([side*.31,-.78,-.59],[side*.24,-.916,-1.30],.028,frameMat,chair);
    tube([side*.22,-.918,-1.33],[side*.07,-.918,-1.33],.018,frameMat,chair);
  }
  // Near models use actual articulated rigs and authored walk cycles.
  const loader=new GLTFLoader();
  const peopleReady=Promise.all(['maya','sam','harper','jordan'].map(name=>loader.loadAsync('bridge-people/'+name+'.glb')))
    .then(assets=>{
      for(const [index,p] of walkers.entries()){
        const {scene:source,animations}=assets[index%assets.length];
        const model=clone(source);
        model.traverse(object=>{
          if(!object.isSkinnedMesh)return;
          object.frustumCulled=false;
          const palette=['#ffffff','#e2eaf1','#fff0e6','#d4e3ee'];
          if(!Array.isArray(object.material)&&/shirt|suit|hoodie|jacket|blouse|top/i.test(object.name)){
            object.material=object.material.clone();
            object.material.color.multiply(new T.Color(palette[Math.floor(index/4)%palette.length]));
          }
        });
        p.g.add(model);p.body.visible=false;
        p.model=model;
        const mixer=new T.AnimationMixer(model);
        const clip=animations.find(a=>a.name===(p.walking?'Walk_Relaxed':'Idle_Standing'))||animations[0];
        mixer.clipAction(clip).play();
        p.idle=clip.name==='Idle_Standing';
        p.mixer=mixer;
      }
      return true;
    }).catch(()=>false);
  function animate(t){
    walkers.forEach((p,i)=>{
      const {x,s,heading}=pedestrianPose(i,t);
      p.g.position.set(x,0,-s);
      p.g.visible=s>=.5&&s<=64.5;
      p.g.rotation.y=p.walking?heading:listeners.includes(p)?Math.atan2(-3.0-p.x,p.s-23.45):Math.PI;
      if(p.mixer){
        p.mixer.setTime(p.walking?t*walkingSpeed(i)/1.17+i*.37:p.idle?t*.55+i*.3:.15+(i%4)*.14+Math.sin(t*.7+i)*.045);
        return;
      }
      const cycle=t*(4.6+i%3*.23)+i*1.17;
      const swing=p.walking?Math.sin(cycle)*.34:0;
      p.body.position.y=p.walking?Math.abs(Math.sin(cycle))*.029:0;
      p.legs.forEach(({thigh,shin},side)=>{
        const stride=swing*(side?1:-1);
        thigh.rotation.x=stride;shin.rotation.x=Math.max(0,-stride)*.9;
        p.arms[side].rotation.x=-stride*.60;
      });
    });
  }
  function ribbon(points,color){
    const group=new T.Group();scene.add(group);
    const mat=new T.MeshBasicMaterial({color,side:T.DoubleSide});
    const arrowMat=new T.MeshBasicMaterial({color:'#effff2',side:T.DoubleSide});
    const path=new T.CatmullRomCurve3(points.map(([x,s,y])=>new T.Vector3(x,y+.026,-s)),false,'centripetal');
    const positions=[];
    for(let i=0;i<=320;i++){
      const p=path.getPointAt(i/320),d=path.getTangentAt(i/320);
      positions.push(p.x+d.z*.21,p.y,p.z-d.x*.21,p.x-d.z*.21,p.y,p.z+d.x*.21);
    }
    const indices=[];
    for(let i=0;i<320;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);
    group.add(new T.Mesh(geo,mat));
    const arrow=new T.Shape();
    arrow.moveTo(-.46,-.28);arrow.lineTo(0,.42);arrow.lineTo(.46,-.28);arrow.lineTo(.24,-.28);arrow.lineTo(0,.09);arrow.lineTo(-.24,-.28);arrow.closePath();
    const arrowGeo=new T.ShapeGeometry(arrow);arrowGeo.rotateX(-Math.PI/2);
    for(let distance=2;distance<path.getLength();distance+=2.8){
      const u=distance/path.getLength(),p=path.getPointAt(u),d=path.getTangentAt(u);
      const m=new T.Mesh(arrowGeo,arrowMat);m.position.copy(p);m.position.y=p.y+.006;
      m.rotation.y=Math.atan2(-d.x,-d.z);group.add(m);
    }
    return group;
  }
  function routePoints(start,end,detoured){
    const points=[];
    for(let time=start;time<end;time+=.35){const p=position(time,detoured);points.push([p.x,p.s,p.y]);}
    const last=position(end,detoured);points.push([last.x,last.s,last.y]);return points;
  }
  const original=ribbon(routePoints(0,turnStart-.45,false),'#21d5a5');
  const detour=ribbon(routePoints(0,turnStart-.45,true),'#21d5a5');
  const entryGuide=[2,4,6].map(metres=>{
    const {x,s,y}=rampPose(metres);
    return [x,s,y];
  });
  const rampRoute=ribbon([...routePoints(turnStart,duration,true),...entryGuide],'#45e7c0');
  function project(x,y,s,view=camera){
    const p=new T.Vector3(x,y,-s).project(view);
    return {x:(p.x+1)/2,y:(1-p.y)/2,visible:p.z>=-1&&p.z<=1};
  }
  // Collapse repeated bridge hardware into instanced draw calls.
  const batches=new Map();
  for(const obj of [...scene.children]){
    if(!obj.isMesh||obj.geometry!==boxGeometry||obj.material.transparent)continue;
    if(!batches.has(obj.material))batches.set(obj.material,[]);
    batches.get(obj.material).push(obj);
  }
  for(const [mat,meshes] of batches){
    if(meshes.length<3)continue;
    const instances=new T.InstancedMesh(boxGeometry,mat,meshes.length);
    meshes.forEach((mesh,index)=>{mesh.updateMatrix();instances.setMatrixAt(index,mesh.matrix);scene.remove(mesh);});
    instances.castShadow=mat===steel||mat===edge||mat===alloy||mat===canopy;
    instances.receiveShadow=mat===stainless||mat===tealGlass||mat===canopy||mat===grey;
    scene.add(instances);
  }
  return {scene,camera,phoneCamera,chair,renderer,animate,original,detour,rampRoute,walkers,peopleReady,project};
}
