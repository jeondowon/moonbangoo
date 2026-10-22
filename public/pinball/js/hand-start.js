(function(P){
  'use strict';
  // Seeded top scatter is independent of the exit side and race RNG.
  // Capture exact endpoints for flight and replay; v1 clustered layouts expire.
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const signature=physics=>JSON.stringify(['release-replay-v2-top-scatter',physics.map,P.PHYSICS_TUNING,physics.radius,physics.gravity,physics.restitution,physics.skills]);
  P.restoreHandStart=function(physics,record){
    if(physics.time!==0||physics.ticks!==0||!record||record.version!==2||record.seed!==physics.seed||record.signature!==signature(physics))throw new Error('직전 경기의 출발 기록이 없거나 현재 버전·설정과 호환되지 않습니다. 새로 섞어 주세요.');
    const spawn=physics.map.spawn,ids=new Set();
    if(!Array.isArray(record.starts)||record.starts.length!==physics.marbles.length)throw new Error('출발 기록의 핀볼 수가 다릅니다.');
    record.starts.forEach((start,i)=>{
      const r=physics.marbles[i].r;
      if(!start||start.id!==physics.marbles[i].id||ids.has(start.id)||![start.x,start.y,start.vx,start.vy].every(Number.isFinite)||start.x<spawn.x+r||start.x>spawn.x+spawn.width-r||start.y<spawn.y+r||start.y>spawn.y+spawn.height-r||Math.hypot(start.vx,start.vy)>120.000001)throw new Error('출발 기록의 ID 또는 위치·속도가 올바르지 않습니다.');
      ids.add(start.id);
    });
    const copy=JSON.parse(JSON.stringify(record));
    copy.starts.forEach((s,i)=>Object.assign(physics.marbles[i],{x:s.x,y:s.y,vx:s.vx,vy:s.vy,_anchorY:s.y,_stuckAt:0,_rescues:0}));
    physics.handStart=copy;
    return copy;
  };
  P.commitHandStart=function(physics,bodies){
    if(physics.handStart)return physics.handStart;
    if(physics.time!==0||physics.ticks!==0)throw new Error('경기 시작 후 출발 위치를 변경할 수 없습니다.');
    if(!Array.isArray(bodies)||bodies.length!==physics.marbles.length)throw new Error('셔플 핀볼 개수가 일치하지 않습니다.');
    const byID=new Map();
    for(const body of bodies){
      if(byID.has(body.id)||body.pouring||![body.x,body.y,body.vx,body.vy,body.r].every(Number.isFinite)||body.r<=0)throw new Error('셔플 핀볼 ID 또는 좌표가 올바르지 않습니다.');
      byID.set(body.id,body);
    }
    const source=physics.marbles.map(m=>{const b=byID.get(m.id);if(!b)throw new Error('셔플 핀볼 ID가 경기와 다릅니다.');return {id:b.id,x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r};});
    const spawn=physics.map.spawn,r=Math.max(...physics.marbles.map(m=>m.r));
    const left=spawn.x+r,right=spawn.x+spawn.width-r,top=spawn.y+r,bottom=spawn.y+spawn.height-r;
    const random=P.seedRandom(physics.seed+'|top-scatter-v2'),slots=[],count=source.length;
    if(count<=50){
      // One random location per horizontal cell for small groups: the whole
      // field is used, with enough clearance even at cell boundaries.
      const spacing=2*r+3,cols=Math.min(count,Math.max(1,Math.floor((right-left)/spacing))),rows=Math.ceil(count/cols);
      const width=(right-left)/cols,height=Math.min(bottom-top,Math.max(180,rows*spacing)),rowHeight=height/rows;
      const jitterX=Math.max(0,(width-spacing)/2),jitterY=Math.max(0,(rowHeight-spacing)/2);
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)slots.push({
        x:clamp(left+(col+.5)*width+(random()*2-1)*jitterX,left,right),
        y:clamp(top+(row+.5)*rowHeight+(random()*2-1)*jitterY,top,bottom)});
    }else{
      // Dense groups use a jittered non-overlapping packing across the same
      // obstacle-free spawn rectangle. No participant owns a fixed cell.
      const spacing=2*r+1.5,rowStep=spacing*Math.sqrt(3)/2,jitter=.4;
      for(let row=0;top+jitter+row*rowStep<=bottom-jitter;row++)
        for(let x=left+jitter+(row%2?spacing/2:0);x<=right-jitter;x+=spacing)
          slots.push({x:clamp(x+(random()*2-1)*jitter,left,right),y:clamp(top+jitter+row*rowStep+(random()*2-1)*jitter,top,bottom)});
    }
    if(slots.length<count)throw new Error('출발 구역에 모든 핀볼을 배치할 공간이 부족합니다.');
    // Fisher–Yates gives every ID/color the same chance of every selected slot.
    for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
    const starts=physics.marbles.map((m,i)=>({id:m.id,x:slots[i].x,y:slots[i].y,vx:0,vy:0}));
    starts.forEach((p,i)=>Object.assign(physics.marbles[i],{x:p.x,y:p.y,vx:p.vx,vy:p.vy,_anchorY:p.y,_stuckAt:0,_rescues:0}));
    physics.handStart={version:2,seed:physics.seed,signature:signature(physics),source,starts,placement:'seeded-top-scatter-v2'};
    return physics.handStart;
  };
})(window.CosmicPinball=window.CosmicPinball||{});
