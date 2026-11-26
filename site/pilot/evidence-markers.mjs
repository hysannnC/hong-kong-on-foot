import {centralCases} from './central-camera.mjs?v=56';
import {evidenceDetails,evidenceTitle} from './evidence-details.mjs?v=56';
import {evidenceDate,evidenceTime} from './field-evidence.mjs?v=56';

const activeTooltip=new WeakMap();
const symbols={flow:'↔',facility:'⊘',water:'≋',crossing:'!',blockage:'▰'};
const el=(tag,...children)=>{const node=document.createElement(tag);node.append(...children);return node;};
const local=(lang,pair)=>pair[lang==='zh'?1:0];
const link=(label,href)=>{
  const anchor=el('a',label);anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';return anchor;
};
export function evidenceIcon(kind){
  const glyph=el('span',symbols[kind]);
  glyph.className='observation-symbol observation-'+kind;
  glyph.setAttribute('aria-hidden','true');
  return glyph;
}

export function evidenceLegend(lang){
  const legend=el('div',...Object.keys(symbols).map(kind=>el('span',evidenceIcon(kind),evidenceTitle(kind,lang))));
  legend.className='observation-legend';
  return legend;
}

export function observationCard(records,lang,{planner=false,interactive=false}={}){
  const t=(en,zh)=>local(lang,[en,zh]);
  const [row,...earlier]=records.slice().sort((a,b)=>b.at-a.at);
  const model=evidenceDetails(row,lang);
  const labels={phone:t('Phone observation','手機觀察'),'ar-replay':t('AR replay','AR 重播'),'cctv-replay':t('CCTV replay','閉路電視重播')};
  const place=row.site||(row.scenario==='terminal'?['Pier 7 terminal access','七號碼頭接駁']:
    /^(ar|cctv)-central-/.test(row.id)?centralCases[row.kind]?.place:undefined);
  const title=el('div',evidenceIcon(row.kind),el('strong',evidenceTitle(row.kind,lang)));
  title.className='observation-card-title';
  const card=el('div',title);
  card.className='observation-tooltip-info';
  if(place)card.append(el('div',local(lang,place)));
  const replay=records.some(entry=>entry.source!=='phone');
  const source=el('small',row.demoCamera?t('Simulated automatic AR capture','模擬 AR 自動擷取'):replay?t('Replay example','重播示例'):labels[row.source]);
  source.className='observation-source';
  card.append(source);
  if(model.facts.length)card.append(el('dl',...model.facts.flatMap(([label,value])=>[el('dt',label),el('dd',value)])));
  if(model.photo){
    const photo=model.photo;
    const image=el('img');image.alt=local(lang,photo.caption);image.referrerPolicy='no-referrer';
    const caption=el('figcaption',t('Archive reference · ','存檔參考 · '),local(lang,photo.caption),' · ',
      interactive?link(local(lang,photo.credit),photo.media):local(lang,photo.credit));
    if(interactive&&photo.license)caption.append(' · ',link(t('License','授權'),photo.license));
    const frame=el('figure',image,caption);
    image.onerror=()=>{
      image.hidden=true;
      frame.prepend(interactive?link(t('Open source photo','開啟原始照片'),photo.media):
        el('small',t('Photo unavailable. Select the marker for the source.','暫未載入照片。選取標記查看來源。')));
    };
    image.src=photo.image;
    card.append(frame);
  }
  card.append(el('div',el('strong',t('Follow-up','跟進建議')),el('div',planner?model.followUp:model.action)));
  if(planner&&interactive){
    for(const detail of model.technical)card.append(el('small',detail));
    const provenance=el('small',...[row,...earlier].flatMap((entry,index)=>[
      ...(index?[el('br')]:[]),labels[entry.source]+' · '+evidenceDate(entry.at)+' '+evidenceTime(entry.at)+' HKT'+
        (Number.isFinite(entry.clearWidthM)?' · '+entry.clearWidthM+' m':''),
    ]));
    provenance.className='observation-source';
    card.append(provenance);
  }
  return card;
}

export function observationMarkers({map,layer,rows,lang,planner=false,onMarker,camera=false}){
  const groups=new Map();
  for(const row of rows){
    const key=row.kind+'|'+row.point.join(',');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  const extent=L.latLngBounds([]);
  for(const records of groups.values()){
    const {kind,point}=records[0];
    const name=evidenceTitle(kind,lang), glyph=evidenceIcon(kind);
    if(camera){glyph.textContent='📷';glyph.classList.add('observation-camera');}
    if(records.length>1){const badge=el('small',String(records.length));badge.className='observation-count';glyph.append(badge);}
    const marker=L.marker(point,{
      icon:L.divIcon({className:'observation-marker',html:glyph,iconSize:[27,27],iconAnchor:[13,13],tooltipAnchor:[0,-15],popupAnchor:[0,-14]}),
      alt:name,bubblingMouseEvents:false,
    });
    marker.bindTooltip(()=>observationCard(records,lang,{planner}),{direction:'auto',offset:[13,14],opacity:1,className:'observation-tooltip'});
    marker.bindPopup(()=>observationCard(records,lang,{planner,interactive:true}),{maxWidth:300,minWidth:215,maxHeight:Math.min(420,map.getSize().y*.7),
      className:'observation-popup',autoPanPadding:[16,16]});
    marker.on('tooltipopen',({tooltip})=>{
      const previous=activeTooltip.get(map);
      if(previous!==marker)previous?.closeTooltip();
      activeTooltip.set(map,marker);
      const box=tooltip.getElement();
      box.style.translate='';
      const bounds=map.getContainer().getBoundingClientRect();
      const rect=box.getBoundingClientRect();
      const dx=Math.max(bounds.left+8-rect.left,Math.min(0,bounds.right-8-rect.right));
      const dy=Math.max(bounds.top+8-rect.top,Math.min(0,bounds.bottom-8-rect.bottom));
      box.style.translate=dx+'px '+dy+'px';
    });
    marker.on('tooltipclose',()=>{if(activeTooltip.get(map)===marker)activeTooltip.delete(map);});
    marker.on('popupopen',()=>marker.closeTooltip());
    marker.addTo(layer);
    marker.getElement()?.setAttribute('aria-label',name+(records.length>1?(lang==='zh'?'，'+records.length+' 筆觀察':', '+records.length+' observations'):''));
    onMarker?.(kind,marker,records);
    extent.extend(point);
  }
  return extent;
}
