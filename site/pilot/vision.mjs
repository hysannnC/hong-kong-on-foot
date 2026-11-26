let detectorPromise;
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Model dependency unavailable'));};
    document.head.append(script);
  });
}
export function getDetector(){
  detectorPromise??=(async()=>{
    if(!window.tf)await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    if(!window.cocoSsd)await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
    return window.cocoSsd.load({base:'lite_mobilenet_v2'});
  })().catch(error=>{detectorPromise=undefined;throw error;});
  return detectorPromise;
}
