import schools from './brands/schools.js';

const logos={
  seven:'brands/seven.svg',
  'circle-k':'brands/circle-k.svg',
  wellcome:'brands/wellcome.svg',
  mannings:'brands/mannings.svg',
  parknshop:'brands/parknshop.png',
  mtr:'brands/mtr.png',
  vango:'brands/vango.png',
  mcdonalds:'brands/mcdonalds.svg',
  aeon:'brands/aeon.svg',
  'pizza-hut':'brands/pizza-hut.svg',
  subway:'brands/subway.svg',
  kfc:'brands/kfc.svg',
  'pacific-coffee':'brands/pacific-coffee.png',
  fairwood:'brands/fairwood.svg',
  starbucks:'brands/starbucks.png',
  hkust:'brands/hkust.svg',
  polyu:'brands/polyu.png',

};
const shapes=[
  'M4 10h16l-2 9H6z M8 10l4-6 4 6 M9 13v3 M15 13v3',
  'M6 4v7m-2-7v5a2 2 0 0 0 4 0V4m-2 7v9m11-16c-2 1-3 4-3 8h4m0-8v16',
  'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z',
  'M12 3l-6 7h3l-5 6h16l-5-6h3z M12 16v5',
  'M4 8l8-4 8 4-8 4z M7 10v6c3 2 7 2 10 0v-6 M20 8v7',
  'M6 5h4v7H6zm8 0h4v7h-4z M8 12v7m8-7v7m-4-9v9',
  'M5 7v7m14-7v7M5 8h14M4 14h16M6 14v5m12-5v5',
  'M6 17V6c0-2 12-2 12 0v11z M6 11h12M8 14h1m7 0h-1m-7 3-2 3m10-3 2 3',
];
const colors=['#427639','#a75522','#ad4860','#44744f','#76569b','#506571','#986119','#a62c50'];
const categories=shapes.map((path,i)=>'data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="'+path+'" fill="none" stroke="'+colors[i]+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
const normalName=name=>(name||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const brandsByKind={
  0:{seveneleven:'seven','7eleven':'seven','711':'seven','711便利店':'seven',seven:'seven',circlek:'circle-k',ok便利店:'circle-k',wellcome:'wellcome',惠康:'wellcome',parknshop:'parknshop',百佳:'parknshop',mannings:'mannings',萬寧:'mannings',vango:'vango',vango便利店:'vango',aeon:'aeon',aeonstores:'aeon',永旺:'aeon',永旺百貨:'aeon'},
  1:{mcdonalds:'mcdonalds',麥當勞:'mcdonalds',pizzahut:'pizza-hut',必勝客:'pizza-hut',subway:'subway',
    kfc:'kfc',肯德基:'kfc',pacificcoffee:'pacific-coffee',太平洋咖啡:'pacific-coffee',
    fairwood:'fairwood',大快活:'fairwood',starbucks:'starbucks',starbuckscoffee:'starbucks',星巴克:'starbucks'},
  4:{thehongkonguniversityofscienceandtechnology:'hkust',香港科技大學:'hkust',
    香港理工大學:'polyu',thehongkongpolytechnicuniversity:'polyu',
    香港理工大學紅磡灣校園:'polyu',香港理工大學西九龍校園:'polyu'},
};

export function markerKey(point){
  if(point.kind===7)return 'mtr';
  if(Object.hasOwn(logos,point.brand))return point.brand;
  if(point.kind===4){
    const school=schools[point.coords.map(n=>Math.round(n*1e6)).join('_')];
    if(school)return school;
  }
  const aliases={...brandsByKind[0],...brandsByKind[1],...brandsByKind[point.kind]};
  for(const name of aliases?point.name||[]:[]){
    const alias=normalName(name);
    if(Object.hasOwn(aliases,alias))return aliases[alias];
  }
  return 'category-'+point.kind;
}
function pinSource(key){
  if(Object.hasOwn(logos,key))return logos[key];
  if(key.startsWith('school-'))return 'brands/schools/'+key+'.webp';
  return categories[Number(key.slice(9))];
}
export function pinImage(point){
  const img=document.createElement('img');
  img.alt='';
  img.addEventListener('error',()=>{img.src=pinSource('category-'+point.kind);},{once:true});
  img.src=pinSource(markerKey(point));
  return img;
}

export function createPinSprites(map){
  const pending=new Map();
  let active=true;
  function add(key){
    if(!active||map.hasImage(key))return Promise.resolve(true);
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      const img=new Image();
      img.src=pinSource(key);
      try{
        await img.decode();
        if(!active)return false;
        const size=64;
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=size;
        const context=canvas.getContext('2d');
        context.fillStyle='white';context.strokeStyle='#a4b8ad';context.lineWidth=2;
        context.beginPath();context.arc(size/2,size/2,size/2-2,0,Math.PI*2);
        context.fill();context.stroke();
        const ratio=Math.min(48/img.naturalWidth,45/img.naturalHeight);
        const w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;
        context.drawImage(img,(size-w)/2,(size-h)/2,w,h);
        map.addImage(key,context.getImageData(0,0,size,size),{pixelRatio:2});
        return true;
      }catch{
        return false;
      }
    })().finally(()=>pending.delete(key));
    pending.set(key,task);
    return task;
  }
  return {
    async prepare(){
      const ready=await Promise.all(shapes.map((_,i)=>add('category-'+i)));
      if(ready.some(value=>!value))throw new Error('Could not prepare a category icon');
    },
    add,
    dispose(){active=false;},
  };
}
