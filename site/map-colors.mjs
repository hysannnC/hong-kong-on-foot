const ramp=[[11,79,108],[31,158,154],[155,197,61],[242,193,78],[232,116,59]];
export const mapGradient=ramp.map(rgb=>'rgb('+rgb.join(' ')+')').join(',');
export function mapColor(ratio){
  const scale=Math.min(3.9999,Math.max(0,ratio)*4),index=Math.floor(scale);
  return 'rgb('+ramp[index].map((value,channel)=>
    Math.round(value+(ramp[index+1][channel]-value)*(scale-index))).join(' ')+')';
}
