(function(P){
  'use strict';
  // Reference samples are compiled from measured QA runs, never fetched at runtime.
  P.RACE_WARNING_SECONDS=120;
  P.estimateRaceDuration=function(settings,count){
    const rows=(P.RACE_DURATION_SAMPLES||[]).filter(r=>r.count<=(P.MAX_MARBLES||50)&&(r.map||'classic')===(settings.map||'classic') && (!r.mapVersion || !P.MAPS || P.MAPS[r.map]?.version===r.mapVersion) && r.skills===!!settings.skills);
    if(!rows.length||!Number.isFinite(count)||count<1||count>(P.MAX_MARBLES||50))return null;
    const distance=r=>Math.abs(Math.log(count/r.count))*2+Math.abs(Number(settings.radius)-r.radius)/8+Math.abs(Math.log(Number(settings.gravity)/r.gravity))+Math.abs(Number(settings.restitution)-r.restitution)/.57;
    const ranked=rows.map(row=>({row,distance:distance(row)})).sort((a,b)=>a.distance-b.distance),best=ranked[0].distance;
    const selected=ranked.filter(x=>Math.abs(x.distance-best)<1e-9).map(x=>x.row),speed=Number(settings.speed);
    if(!(speed>0))return null;
    const p50=Math.min(...selected.map(r=>r.p50))/speed,p95=Math.max(...selected.map(r=>r.p95))/speed,max=Math.max(...selected.map(r=>r.max))/speed;
    return {p50,p95,max,approximate:best>1e-9,warning:max>P.RACE_WARNING_SECONDS};
  };
  P.durationText=function(seconds){const n=Math.max(1,Math.ceil(seconds)),minutes=Math.floor(n/60);return ((minutes?minutes+'분 ':'')+(n%60?n%60+'초':'')).trim();};
})(window.CosmicPinball=window.CosmicPinball||{});
