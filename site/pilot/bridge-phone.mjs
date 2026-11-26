function hand(ctx,x,y,width,height){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(width/300,height/600);
  const skin=ctx.createLinearGradient(155,350,365,566);
  for(const [stop,color] of [[0,'#d09676'],[.32,'#bb7d60'],[.72,'#925c45'],[1,'#603d31']])skin.addColorStop(stop,color);
  ctx.fillStyle=skin;ctx.strokeStyle='#674639';ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(369,654);
  ctx.bezierCurveTo(302,595,266,543,254,498);
  ctx.bezierCurveTo(247,468,250,446,268,425);
  ctx.bezierCurveTo(284,401,292,391,303,393);
  ctx.bezierCurveTo(326,395,342,421,347,456);
  ctx.bezierCurveTo(351,485,368,519,387,549);
  ctx.lineTo(439,645);
  ctx.closePath();ctx.fill();ctx.stroke();
  const cuff=ctx.createLinearGradient(332,560,433,615);
  cuff.addColorStop(0,'#3b5057');cuff.addColorStop(.55,'#26393f');cuff.addColorStop(1,'#1a2931');
  ctx.fillStyle=cuff;ctx.beginPath();
  ctx.moveTo(311,574);ctx.quadraticCurveTo(360,579,395,550);
  ctx.lineTo(470,663);ctx.lineTo(365,684);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#5b6a70';ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(319,586);ctx.quadraticCurveTo(362,589,403,562);ctx.stroke();
  ctx.restore();
}

export function drawPhone(ctx,world,state){
  const {renderer,scene,camera,phoneCamera,chair,original,detour,rampRoute}=world;
  const {time,route,guidance,warning,detector,lang,end}=state;
  const {width,height}=ctx.canvas;
  const tall=width/height<1.24;
  const h=height*(tall?.85:.93),w=h*.49;
  const x=(width-w)/2+Math.sin(time*2.2)*2,y=(height-h)/2+Math.sin(time*3)*1.5;
  const border=w*.027, sx=x+border,sy=y+border,sw=w-2*border,sh=h-2*border;
  const radius=w*.13;
  const round=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
  const routes=[original,detour,rampRoute];
  for(const item of routes)item.visible=false;
  chair.visible=true;
  renderer.setViewport(0,0,width,height);
  renderer.shadowMap.autoUpdate=true;
  renderer.render(scene,camera);
  ctx.drawImage(renderer.domElement,0,0,width,height);
  const vignette=ctx.createRadialGradient(width*.5,height*.45,height*.19,width*.5,height*.45,width*.65);
  vignette.addColorStop(0,'#09191600');vignette.addColorStop(1,'#09191634');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
  hand(ctx,x,y,w,h);
  ctx.save();
  ctx.shadowColor='#111d1bc9';ctx.shadowBlur=w*.11;ctx.shadowOffsetY=w*.030;
  const edge=ctx.createLinearGradient(x,y,x+w,y+h);
  edge.addColorStop(0,'#74817c');edge.addColorStop(.27,'#232b2c');edge.addColorStop(.72,'#151a1b');edge.addColorStop(1,'#56605a');
  ctx.fillStyle=edge;round(x,y,w,h,radius);ctx.fill();ctx.restore();
  ctx.strokeStyle='#a4aaa5';ctx.lineWidth=Math.max(1,w*.004);
  round(x+1,y+1,w-2,h-2,radius);ctx.stroke();
  ctx.fillStyle='#758583';round(x+w-1,y+h*.27,w*.013,h*.104,w*.004);ctx.fill();

  const viewportW=Math.round(sw),viewportH=Math.round(sh);
  phoneCamera.position.copy(camera.position);
  phoneCamera.quaternion.copy(camera.quaternion);
  phoneCamera.translateX(-.018);
  phoneCamera.translateY(-.040);
  phoneCamera.translateZ(-.085);
  phoneCamera.aspect=viewportW/viewportH;
  phoneCamera.updateProjectionMatrix();
  chair.visible=false;
  routes[route].visible=true;
  renderer.setViewport(0,0,viewportW,viewportH);
  renderer.shadowMap.autoUpdate=false;
  renderer.render(scene,phoneCamera);
  const p=detector&&world.project(...detector.point,phoneCamera);
  ctx.save();
  round(sx,sy,sw,sh,radius-border);ctx.clip();
  ctx.drawImage(renderer.domElement,0,height-viewportH,viewportW,viewportH,sx,sy,sw,sh);

  const up=sw/282;
  ctx.translate(sx,sy);ctx.scale(up,up);
  const H=sh/up;
  const t=(en,tc)=>lang==='zh'?tc:en;
  const text=(value,x,y,size,color,weight=650,maxWidth=252)=>{
    ctx.font=weight+' '+size+'px system-ui';ctx.fillStyle=color;
    ctx.fillText(value,x,y,maxWidth);
  };
  const pill=(value,left,top,fill,color)=>{
    ctx.font='650 13px system-ui';
    const wide=Math.min(256,ctx.measureText(value).width+18);
    ctx.fillStyle=fill;
    round(left,top,wide,24,9);ctx.fill();text(value,left+9,top+16,13,color,650,wide-18);
  };
  ctx.fillStyle='#111918';round(105,9,72,15,8);ctx.fill();
  ctx.fillStyle='#4d6664';ctx.beginPath();ctx.arc(162,16.5,2.4,0,Math.PI*2);ctx.fill();
  pill(t('AR GUIDE','AR 導航'),12,35,'#10221ff5','#ddf8ef');
  if(p?.visible&&p.x>.08&&p.x<.92&&p.y>.13&&p.y<.76){
    const bw=detector.lift?132:98,bh=detector.lift?44:112;
    const l=Math.max(10,Math.min(272-bw,p.x*282-bw/2));
    const top=Math.max(60,Math.min(H-190,p.y*H-bh/2));
    const color=detector.lift?'#ffd18a':'#91f4c9';
    ctx.strokeStyle=color;ctx.lineWidth=2.5;
    round(l,top,bw,bh,9);ctx.stroke();
    pill(detector.text,Math.min(l,110),top-25,'#101f1df2',color);
  }
  ctx.fillStyle='#101f1df4';round(11,H-131,260,107,15);ctx.fill();
  text(warning,24,H-105,14,'#ffd18a');
  guidance.forEach((line,i)=>text(line,24,H-77+i*25,22,'#fff',750,237));
  if(end)text(t('Trip review in the 1.0 map','在 1.0 地圖回顧行程'),24,H-47,14,'#aaf1ce');
  ctx.fillStyle='#f4f7f1';round(93,H-13,96,4,2);ctx.fill();
  ctx.restore();
  // Curled fingers overlap the near edge of the case.
  ctx.save();ctx.translate(x+w,y+h*.64);ctx.scale(w/300,h/600);
  const grip=ctx.createLinearGradient(-28,0,11,0);
  grip.addColorStop(0,'#d5a186');grip.addColorStop(.6,'#b97d60');grip.addColorStop(1,'#89523f');
  for(const [left,top,length] of [[-17,0,33],[-20,28,38],[-15,57,31],[-10,84,25]]){
    round(left,top,length,20,10);ctx.fillStyle=grip;ctx.fill();
    ctx.strokeStyle='#764b3d';ctx.lineWidth=1;ctx.stroke();
    ctx.strokeStyle='#e5af93';ctx.beginPath();ctx.moveTo(left+5,top+5);ctx.lineTo(left+14,top+4);ctx.stroke();
  }
  ctx.restore();
}
