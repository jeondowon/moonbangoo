(function (P) {
  'use strict';
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  function visualRandom(seed) {
    let hash=2166136261;
    for(const letter of String(seed)+'|hand-visual-only'){hash^=letter.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return ()=>{hash+=0x6d2b79f5;let n=Math.imul(hash^hash>>>15,1|hash);n^=n+Math.imul(n^n>>>7,61|n);return ((n^n>>>14)>>>0)/4294967296;};
  }
  // Preparation distances use the usable screen's short side. This solver has
  // its own seeded state; HandStart later captures it without consuming race RNG.
  class HandShuffle {
    constructor(entries,seed) {
      this.radius=Math.min(.044,.18/Math.sqrt(Math.max(1,entries.length)));
      this.clusterRadius=.30;this.pointerRadius=.26;this.pointerCoreRadius=.045;
      this.interacted=false;
      this.bounds={left:-.46,right:.46,top:-.46,bottom:.46};
      this.bodies=[];this.collisions=0;this.wallHits=0;this.ticks=0;
      this.pointer=null;this.circleGrabEnabled=false;this.grab=null;
      const random=visualRandom(seed);
      for(let i=0;i<entries.length;i++) {
        const entry=entries[i];let x=0,y=0,attempt=0;
        do {
          const angle=random()*Math.PI*2,distance=Math.sqrt(random())*(this.clusterRadius-this.radius);
          x=Math.cos(angle)*distance;y=Math.sin(angle)*distance;
          attempt++;
        }while(attempt<30000&&this.bodies.some(b=>Math.hypot(x-b.x,y-b.y)<this.radius*2.06));
        this.bodies.push({index:entry.index===undefined?i:entry.index,id:entry.id===undefined?String(i):entry.id,
          x,y,vx:0,vy:0,r:this.radius,spin:random()*Math.PI*2});
      }
      // Resolve the very rare crowded random-placement fallback with the same
      // collision constraints used during interaction, keeping IDs in order.
      for(let pass=0;pass<8;pass++)if(this.contacts(this.pairs())<.005)break;
    }
    begin(x,y,timeMs) {
      this.interacted=false;
      this.pointer={x,y,vx:0,vy:0,timeMs,age:0};
      if(this.circleGrabEnabled)this.beginCircle(x,y);
    }
    circleCenter(x,y) {
      const r=this.pointerRadius,b=this.bounds;
      return {x:clamp(x,b.left+r,b.right-r),y:clamp(y,b.top+r,b.bottom-r)};
    }
    beginCircle(x,y) {
      const center=this.circleCenter(x,y),active=this.bodies.filter(b=>!b.pouring);
      this.grab={x:center.x,y:center.y,vx:0,vy:0};
      if(!active.length)return;
      let cx=0,cy=0;for(const b of active){cx+=b.x;cy+=b.y;}cx/=active.length;cy/=active.length;
      let scale=1;
      for(const b of active){const d=Math.hypot(b.x-cx,b.y-cy);if(d>0)scale=Math.min(scale,(this.pointerRadius-b.r)/d);}
      // One geometric transform for the entire group, with no ID/color ordering.
      for(const b of active){b.x=center.x+(b.x-cx)*scale;b.y=center.y+(b.y-cy)*scale;this.wall(b);}
      for(let pass=0;pass<32;pass++)if(this.contacts(this.pairs())<.005)break;
    }
    moveCircle(x,y,seconds) {
      const g=this.grab,next=this.circleCenter(x,y),dx=next.x-g.x,dy=next.y-g.y;
      let vx=dx/seconds,vy=dy/seconds;const speed=Math.hypot(vx,vy);
      if(speed>2.8){vx*=2.8/speed;vy*=2.8/speed;}
      for(const b of this.bodies)if(!b.pouring){b.x+=dx;b.y+=dy;b.vx-=vx-g.vx;b.vy-=vy-g.vy;}
      Object.assign(g,{x:next.x,y:next.y,vx,vy});
      this.interacted=this.interacted||Math.hypot(dx,dy)>1e-8;
      // Raw pointer motion still owns the existing outlet gesture when the cage
      // reaches the screen boundary. Its contained marbles remain visible.
      this.interacted=this.interacted||Math.hypot(x-this.pointer.x,y-this.pointer.y)>1e-8;
    }
    move(x,y,timeMs) { this.setPointer(x,y,timeMs); return this.interacted; }
    setPointer(x,y,timeMs) {
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(timeMs))return;
      if(!this.pointer){this.begin(x,y,timeMs);return;}
      const p=this.pointer,seconds=(timeMs-p.timeMs)/1000;
      if(seconds<=0)return;
      if(this.grab){
        this.moveCircle(x,y,seconds);
        Object.assign(p,{x,y,vx:this.grab.vx,vy:this.grab.vy,timeMs,age:0});
        return;
      }
      let vx=(x-p.x)/seconds,vy=(y-p.y)/seconds;
      const speed=Math.hypot(vx,vy),limit=2.8;
      if(speed>limit){vx*=limit/speed;vy*=limit/speed;}
      // Event-time impulse records actual contact even if release arrives before
      // the next render tick. Sweep the real segment to retain fast crossings.
      const mx=x-p.x,my=y-p.y,length2=mx*mx+my*my;
      if(length2>1e-12)for(const b of this.bodies) {
        const t=clamp(((b.x-p.x)*mx+(b.y-p.y)*my)/length2,0,1);
        const near=Math.hypot(b.x-p.x-mx*t,b.y-p.y-my*t);
        if(near>=this.pointerRadius)continue;
        const weight=Math.pow(1-near/this.pointerRadius,2);
        const transfer=1-Math.exp(-12*weight*Math.min(seconds,.1));
        const ix=(vx-b.vx)*transfer,iy=(vy-b.vy)*transfer;
        if(Math.hypot(ix,iy)>1e-7){b.vx+=ix;b.vy+=iy;this.interacted=true;}
      }
      Object.assign(p,{x,y,vx,vy,timeMs,age:0});
    }
    release() {
      if(this.grab)for(const b of this.bodies)if(!b.pouring){b.vx+=this.grab.vx;b.vy+=this.grab.vy;}
      this.pointer=null;this.grab=null;
    }
    snapshot() {return this.bodies.map(b=>({...b}));}
    wall(b) {
      const limits=this.bounds,r=b.r;
      if(this.grab){
        const g=this.grab,dx=b.x-g.x,dy=b.y-g.y,d=Math.hypot(dx,dy),limit=this.pointerRadius-r;
        if(d>limit){
          const nx=d>1e-10?dx/d:1,ny=d>1e-10?dy/d:0;
          b.x=g.x+nx*limit;b.y=g.y+ny*limit;
          const normal=b.vx*nx+b.vy*ny;
          if(normal>0){const tx=b.vx-normal*nx,ty=b.vy-normal*ny;b.vx=-normal*.52*nx+tx*.97;b.vy=-normal*.52*ny+ty*.97;}
          this.wallHits++;
        }
        return;
      }
      if(limits.opening && b.x>limits.right-limits.opening && b.y<limits.top+limits.opening) {
        // The two rounded wall ends leave a true northeast opening.
        for(const end of [[limits.right-limits.opening,limits.top],[limits.right,limits.top+limits.opening]]) {
          const dx=b.x-end[0],dy=b.y-end[1],d=Math.hypot(dx,dy);
          if(d<r) {
            const nx=d>1e-10?dx/d:-Math.SQRT1_2,ny=d>1e-10?dy/d:Math.SQRT1_2;
            b.x=end[0]+nx*r;b.y=end[1]+ny*r;
            const normal=b.vx*nx+b.vy*ny;
            if(normal<0){const tx=b.vx-normal*nx,ty=b.vy-normal*ny;b.vx=-normal*.52*nx+tx*.97;b.vy=-normal*.52*ny+ty*.97;}
            this.wallHits++;
          }
        }
        // Escaped visual bodies stay on screen and return under the existing
        // weak centre force when the user cancels or lets go inside the outlet.
        const outer=limits.outer;
        if(outer){if(b.x>outer.right-r){b.x=outer.right-r;if(b.vx>0)b.vx*=-.52;this.wallHits++;}if(b.y<outer.top+r){b.y=outer.top+r;if(b.vy<0)b.vy*=-.52;this.wallHits++;}}
        return;
      }
      if(limits.cornerRadius>r) {
        // Offset the same rounded enclosure by this body's collision radius.
        const corner=limits.cornerRadius-r;
        const cx=clamp(b.x,limits.left+limits.cornerRadius,limits.right-limits.cornerRadius);
        const cy=clamp(b.y,limits.top+limits.cornerRadius,limits.bottom-limits.cornerRadius);
        const dx=b.x-cx,dy=b.y-cy,distance=Math.hypot(dx,dy);
        if(distance>corner+1e-10) {
          const nx=dx/distance,ny=dy/distance;
          b.x=cx+nx*corner;b.y=cy+ny*corner;
          const normal=b.vx*nx+b.vy*ny;
          if(normal>0) {
            const tx=b.vx-normal*nx,ty=b.vy-normal*ny;
            b.vx=-normal*.52*nx+tx*.97;b.vy=-normal*.52*ny+ty*.97;
          }
          this.wallHits++;
        }
        return;
      }
      if(b.x<limits.left+r){b.x=limits.left+r;if(b.vx<0)b.vx*=-.52;b.vy*=.97;this.wallHits++;}
      if(b.x>limits.right-r){b.x=limits.right-r;if(b.vx>0)b.vx*=-.52;b.vy*=.97;this.wallHits++;}
      if(b.y<limits.top+r){b.y=limits.top+r;if(b.vy<0)b.vy*=-.52;b.vx*=.97;this.wallHits++;}
      if(b.y>limits.bottom-r){b.y=limits.bottom-r;if(b.vy>0)b.vy*=-.52;b.vx*=.97;this.wallHits++;}
    }
    pairs() {
      const size=this.radius*2.15,grid=new Map(),locations=new Array(this.bodies.length),pairs=[];
      for(let i=0;i<this.bodies.length;i++) {
        const b=this.bodies[i];if(b.pouring)continue;
        const gx=Math.floor(b.x/size),gy=Math.floor(b.y/size),key=(gy+4096)*8192+gx;
        let cell=grid.get(key);
        if(!cell){cell={gx,gy,indices:[],neighbors:null};grid.set(key,cell);}
        cell.indices.push(i);locations[i]=cell;
      }
      for(let i=0;i<this.bodies.length;i++) {
        const cell=locations[i];if(!cell)continue;
        // Bodies sharing a cell reuse its nine neighbor lookups. Keep the old
        // dx/dy/index ordering so collision responses remain exactly the same.
        if(!cell.neighbors) {
          cell.neighbors=[];
          for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
            const near=grid.get((cell.gy+dy+4096)*8192+cell.gx+dx);
            if(near)cell.neighbors.push(near.indices);
          }
        }
        for(const near of cell.neighbors)for(const j of near) {
          if(j>=i)break;
          pairs.push([this.bodies[j],this.bodies[i]]);
        }
      }
      return pairs;
    }
    contacts(pairs) {
      let worst=0;
      for(const [a,b] of pairs) {
        let nx=b.x-a.x,ny=b.y-a.y;const diameter=a.r+b.r,d2=nx*nx+ny*ny;
        if(d2>=diameter*diameter)continue;
        const distance=Math.sqrt(d2);
        if(distance<1e-9){nx=1;ny=0;}else{nx/=distance;ny/=distance;}
        worst=Math.max(worst,(diameter-distance)/diameter);
        const correction=(diameter-distance)*.505;
        a.x-=nx*correction;a.y-=ny*correction;b.x+=nx*correction;b.y+=ny*correction;
        const approach=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(approach<0) {
          const impulse=-approach*.79;
          a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;
          // Small tangent friction dissipates sliding without locking a cluster.
          const tangent=((b.vx-a.vx)*-ny+(b.vy-a.vy)*nx)*.035;
          a.vx-=ny*tangent;a.vy+=nx*tangent;b.vx+=ny*tangent;b.vy-=nx*tangent;
          this.collisions++;
        }
      }
      if(worst>0)for(const b of this.bodies)if(!b.pouring)this.wall(b);
      return worst;
    }
    step(dt=1/120) {
      if(!Number.isFinite(dt)||dt<=0)return;
      // Adaptive substeps limit each body to a fraction of its collision radius.
      // The caller still advances this module with the shared fixed game clock.
      dt=Math.min(dt,1/30);
      let maximumSpeed=0;for(const b of this.bodies)maximumSpeed=Math.max(maximumSpeed,Math.hypot(b.vx,b.vy));
      const substeps=clamp(Math.ceil((maximumSpeed+.08)*dt/(this.radius*.40)),1,12),h=dt/substeps;
      for(let sub=0;sub<substeps;sub++) {
        const p=this.pointer;
        // Input velocity comes from event timestamps, and becomes stale when
        // the finger stops. Rendering more frames cannot manufacture momentum.
        const freshness=p?Math.exp(-Math.max(0,p.age-.025)*24):0;
        if(this.grab){
          const g=this.grab,vx=p.vx*freshness,vy=p.vy*freshness;
          for(const b of this.bodies)if(!b.pouring){b.vx-=vx-g.vx;b.vy-=vy-g.vy;}
          g.vx=vx;g.vy=vy;
        }
        const damping=Math.exp(-h*(p?1.65:1.9));
        const handSpeed=p?Math.hypot(p.vx,p.vy)*freshness:0;
        const pressureActivity=clamp((handSpeed-.015)/.25,0,1);
        for(const b of this.bodies) {
          if(b.pouring)continue;
          const distance=Math.hypot(b.x,b.y),returnStrength=this.gravity ? 0 : p?.06:.36;
          let ax=-b.x*returnStrength,ay=(this.gravity || .008)-b.y*returnStrength;
          if(!this.gravity && distance>this.clusterRadius){const extra=(distance-this.clusterRadius)*2.4/distance;ax-=b.x*extra;ay-=b.y*extra;}
          if(p&&!this.grab) {
            const dx=p.x-b.x,dy=p.y-b.y,near=Math.hypot(dx,dy);
            if(near<this.pointerRadius) {
              const weight=Math.pow(1-near/this.pointerRadius,2);
              // A moving finger has a small soft core: local radial pressure
              // deflects contacts around its real path. A stationary finger
              // contributes none, and this never depends on a body ID or phase.
              const core=this.pointerCoreRadius+b.r;
              if(near<core&&near>1e-8&&pressureActivity>0) {
                const pressure=(core-near)*120*pressureActivity;
                ax-=dx/near*pressure;ay-=dy/near*pressure;
              }
              // Local velocity transfer and a modest hand attraction: all
              // rotation comes from the actual path, never ID-specific waves.
              ax+=weight*((p.vx*freshness-b.vx)*18+dx*7*freshness);
              ay+=weight*((p.vy*freshness-b.vy)*18+dy*7*freshness);
            }
          }
          b.vx=(b.vx+ax*h)*damping;b.vy=(b.vy+ay*h)*damping;
          const speed=Math.hypot(b.vx,b.vy);if(speed>3){b.vx*=3/speed;b.vy*=3/speed;}
          b.x+=b.vx*h;b.y+=b.vy*h;b.spin+=b.vx*h/b.r;this.wall(b);
        }
        let pairs=this.pairs();
        for(let pass=0;pass<(this.gravity ? 18 : 12);pass++) {
          if(pass===3||pass===6||pass===9||pass===12||pass===15)pairs=this.pairs();
          const worst=this.contacts(pairs);
          if(worst===0 || pass>=1&&worst<.012)break;
        }
        if(p)p.age+=h;
      }
      this.ticks++;
    }
  }
  P.HandShuffle=HandShuffle;
})(window.CosmicPinball=window.CosmicPinball||{});
