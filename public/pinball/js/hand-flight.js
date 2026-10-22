(function (P) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const ease = value => { const t = clamp(value); return t * t * t * (10 + t * (-15 + t * 6)); };
  const derivative=x=>x<=0||x>=1?0:30*x*x*(1-x)*(1-x);
  const interval = (from, to, value) => smooth((value - from) / (to - from));
  const lerp = (a, b, t) => a + (b - a) * t;
  const point = (matrix, x, y) => ({ x: matrix.a * x + matrix.e, y: matrix.d * y + matrix.f });
  const centroid = items => ({ x: items.reduce((sum, item) => sum + item.x, 0) / items.length,
    y: items.reduce((sum, item) => sum + item.y, 0) / items.length });
  function curve(from, velocity, target, duration, q) {
    const delta = target - from, tangent = velocity * duration;
    const a = 10 * delta - 6 * tangent, b = -15 * delta + 8 * tangent, c = 6 * delta - 3 * tangent;
    return { position: from + tangent * q + a * q * q * q + b * q * q * q * q + c * q * q * q * q * q,
      velocity: (tangent + 3 * a * q * q + 4 * b * q * q * q + 5 * c * q * q * q * q) / duration };
  }

  class HandFlight {
    constructor(cinematic) { this.cinema = cinematic; this.items = []; this.lastPoses = []; }
    begin(physics, handScene, decision, duration = 2.8, reduced = false) {
      const c = this.cinema, area = handScene.area(), camera = handScene.camera || c.camera;
      this.area = Object.assign({}, area); this.duration = Math.max(.25, Number(duration) || 2.8); this.reduced = !!reduced;
      this.physics = physics;
      // Even a stationary ready release launches. Input speed only adds visual
      // thrust. Random top landing coordinates were already committed before flight.
      const speed = Math.min(2.8, Math.max(0, Number(decision && decision.inputSpeed) || 0));
      this.propulsion = area.s * (this.reduced ? .12 : .8 + speed * .1);
      const origin = camera ? camera.worldToScreen(0, 0) : { x: area.w / 2 - 500 * .5, y: area.h / 2 - 450 * .5 };
      const zoom = camera && camera.zoom || .5;
      this.final = { a: zoom, b: 0, c: 0, d: zoom, e: origin.x, f: origin.y };
      this.landingFinal = Object.assign({}, this.final); this.correction = null;
      const scale = Math.min(area.s * .32 / 1000, area.h * .7 / 2200);
      this.initial = this.reduced ? Object.assign({}, this.final)
        : { a: scale, b: 0, c: 0, d: scale, e: area.w + area.s * .15, f: area.h * .32 };
      this.bottom = P.CINEMA && P.CINEMA.boardView && camera
        ? P.CINEMA.boardView(area.w, area.h, camera, 0, false).bottom : 2200;
      let dx = Number(decision && decision.dx) || 0, dy = Number(decision && decision.dy) || 0;
      const length = Math.hypot(dx, dy);
      if (length > 1e-10) { dx /= length; dy /= length; } else { dx = 1; dy = 0; }
      this.direction = { x: dx, y: dy };
      const bodies = new Map(handScene.shuffle.bodies.map(body => [body.id, body]));
      // Start at the last visible sphere, including its sub-tick display interpolation.
      // Physical landing slots are the committed seeded scatter endpoints.
      const sameViewport = handScene.lastPoseArea && handScene.lastPoseArea.w === area.w && handScene.lastPoseArea.h === area.h;
      const displayed = new Map(sameViewport && handScene.lastPoses ? handScene.lastPoses.map(pose => [pose.id, pose]) : []);
      const marbles = new Map(physics.marbles.map(marble => [marble.id, marble]));
      this.items = handScene.entries.map((entry, index) => {
        const body = bodies.get(entry.id), marble = marbles.get(entry.id);
        if (!body || !marble) throw new Error('비행 핀볼 ID가 셔플 또는 경기 출발 슬롯과 일치하지 않습니다.');
        const displayScale = area.s * (handScene.viewScale || 1);
        const visible = displayed.get(entry.id);
        const source = { id: entry.id, index, entry, x: visible ? visible.x : area.x + body.x * displayScale, y: visible ? visible.y : area.y + body.y * displayScale,
          vx: body.vx * displayScale, vy: body.vy * displayScale, radius: visible ? visible.radius : body.r * displayScale, delay: 0 };
        const target = point(this.initial, marble.x, marble.y);
        return Object.assign(source, { targetX: target.x, targetY: target.y, endRadius: marble.r * this.initial.a, marble });
      });
      const front = this.items.slice().sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy) || a.index - b.index);
      const maxDelay = Math.min(.12, this.duration * .15);
      front.forEach((item, rank) => { item.delay = front.length > 1 ? rank / (front.length - 1) * maxDelay : 0; });
      this.releaseCenter = centroid(this.items);
      this.targetCenter = centroid(this.items.map(item => ({ x: item.targetX, y: item.targetY })));
      const worldCenter = centroid(this.items.map(item => ({ x: item.marble.x, y: item.marble.y })));
      this.finalCenter = point(this.final, worldCenter.x, worldCenter.y);
      this.initial=Object.assign({},this.final);
      this.propulsion=this.area.s*.045;
      for(const item of this.items){item.delay*=1/3;const target=point(this.initial,item.marble.x,item.marble.y);item.targetX=target.x;item.targetY=target.y;item.endRadius=item.marble.r*this.initial.a;}
      this.targetCenter=centroid(this.items.map(item=>({x:item.targetX,y:item.targetY})));
      this.finalCenter=Object.assign({},this.targetCenter);
      this.lastPoses = [];
      return this;
    }
    pose(index,seconds){
    const i=this.items[index];if(!i)return null;
    const t=Math.max(0,Number(seconds)||0),p=clamp(t/this.duration);
    const radius=i.radius+(i.endRadius-i.radius)*smooth(p);
    if(p===1)return {id:i.id,index,x:i.targetX,y:i.targetY,vx:0,vy:0,radius:i.endRadius,focus:1,amount:1,depth:0};
    if(t<=i.delay)return {id:i.id,index,x:i.x+i.vx*t,y:i.y+i.vy*t,vx:i.vx,vy:i.vy,radius,focus:1,amount:p,depth:0};
    const duration=this.duration-i.delay,q=(t-i.delay)/duration,x=i.x+i.vx*i.delay,y=i.y+i.vy*i.delay;
    // A compact C2 inertia window preserves the captured velocity at release
    // without carrying its tangent across the whole 2.8-second transfer.
    const bound=(position,velocity,extent)=>velocity>0?extent-i.radius-position:velocity<0?position-i.radius:Infinity;
    const room=Math.max(0,Math.min(bound(x,i.vx,this.area.w),bound(y,i.vy,this.area.h)));
    const window=Math.max(.002,Math.min(.12,room/(Math.max(1,Math.abs(i.vx),Math.abs(i.vy))*duration)));
    const u=q/window,inertia=duration*q*(1-ease(u)),inertiaV=1-ease(u)-q/window*derivative(u);
    const bump=this.propulsion*64*q*q*q*Math.pow(1-q,3),bumpV=this.propulsion*192*q*q*Math.pow(1-q,2)*(1-2*q)/duration;
    return {id:i.id,index,x:x+(i.targetX-x)*ease(q)+i.vx*inertia+this.direction.x*bump,y:y+(i.targetY-y)*ease(q)+i.vy*inertia+this.direction.y*bump,
      vx:(i.targetX-x)*derivative(q)/duration+i.vx*inertiaV+this.direction.x*bumpV,vy:(i.targetY-y)*derivative(q)/duration+i.vy*inertiaV+this.direction.y*bumpV,radius,focus:1,amount:p,depth:0};
  }
    correctionAt(progress) {
      const track = this.correction;
      if (!track) return { logScale: 0, e: 0, f: 0, vLog: 0, vE: 0, vF: 0 };
      const duration = 1 - track.start, p = clamp(progress);
      if (p >= 1 || duration <= 0) return Object.assign({}, track.target, { vLog: 0, vE: 0, vF: 0 });
      if (p <= track.start) return track.from;
      const q = (p - track.start) / duration;
      const scale = curve(track.from.logScale, track.from.vLog, track.target.logScale, duration, q);
      const x = curve(track.from.e, track.from.vE, track.target.e, duration, q);
      const y = curve(track.from.f, track.from.vF, track.target.f, duration, q);
      return { logScale: scale.position, e: x.position, f: y.position,
        vLog: scale.velocity, vE: x.velocity, vF: y.velocity };
    }
    retarget(camera, progress) {
      if (!camera || !this.landingFinal) return false;
      const origin = camera.worldToScreen(0, 0), zoom = camera.zoom;
      if (!(zoom > 0) || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
      const next = { a: zoom, b: 0, c: 0, d: zoom, e: origin.x, f: origin.y };
      if (['a','d','e','f'].every(key => Math.abs(next[key] - this.landingFinal[key]) < 1e-10)) return false;
      const p = clamp(Number(progress) || 0), scale = zoom / this.final.a;
      // A viewport change adjusts the shared camera over the remaining flight.
      // Keep every source, own slot and trajectory fixed, including their IDs.
      // Carry correction velocity too, so another resize cannot abruptly stop it.
      this.correction = { start: p, from: this.correctionAt(p),
        target: { logScale: Math.log(scale), e: origin.x - scale * this.final.e, f: origin.y - scale * this.final.f } };
      this.landingFinal = next;
      return true;
    }
    cameraAt(progress) {
    const p=clamp(Number(progress)||0),adjust=this.correctionAt(p),scale=Math.exp(adjust.logScale);
    let scene={a:scale,b:0,c:0,d:scale,e:adjust.e,f:adjust.f};
    if(p===1)scene={a:this.landingFinal.a/this.initial.a,b:0,c:0,d:this.landingFinal.d/this.initial.d,e:this.landingFinal.e-this.initial.e*this.landingFinal.a/this.initial.a,f:this.landingFinal.f-this.initial.f*this.landingFinal.d/this.initial.d};
    const current={a:scene.a*this.initial.a,b:0,c:0,d:scene.d*this.initial.d,e:scene.a*this.initial.e+scene.e,f:scene.d*this.initial.f+scene.f};
    return {...scene,scene,initial:this.initial,current,final:this.landingFinal,bottom:this.bottom,amount:smooth(p),scale:scene.a};
  }
    render(state){
    const c=this.cinema,r=c.renderer,camera=state.camera,physics=state.physics||this.physics;
    c.resize();const p=clamp(Number(state.progress)||0),ctx=c.ctx,w=c.width,h=c.height;
    this.retarget(camera,p);
    const samples=this.items.map((_,i)=>this.pose(i,p*this.duration)),view=this.cameraAt(p,samples),m=view.current;
    const framing=Object.create(camera),area=camera.area?camera.area():{x:0,y:0,w,h};
    framing.zoom=m.a;framing.x=(area.x+area.w/2-m.e)/m.a;framing.y=(area.y+area.h/2-m.f)/m.d;
    if(r&&r.render)r.render({physics,map:physics.map,camera:framing,effects:state.effects,time:state.time||0,dt:0,status:'flight',hideMarbles:true});
    ctx.clearRect(0,0,w,h);
    if(p<1){
      // The real renderer paints the moving board, including live obstacle art.
      // A paper dissolve replaces the detached arch/miniature/cached board.
      if(r&&r.canvas)ctx.drawImage(r.canvas,0,0,r.canvas.width,r.canvas.height,0,0,w,h);
      const paper=1-smooth((p-.04)/.48);
      if(paper>0&&r&&r.background){ctx.save();ctx.globalAlpha=paper;ctx.drawImage(r.background,0,0,w,h);ctx.restore();}
    }
    ctx.save();ctx.transform(view.a,0,0,view.d,view.e,view.f);
    const reduced=state.reducedMotion===undefined?this.reduced:!!state.reducedMotion;
    this.lastPoses=this.items.map((item,i)=>{const pose=samples[i];c.drawOrb(item.entry,pose,smooth((p-.45)/.55),item.marble,this.items.length,reduced);const screen=point(view.scene,pose.x,pose.y);return {id:pose.id,index:i,x:screen.x,y:screen.y,radius:pose.radius*view.a,focus:1};});ctx.restore();
    return {reveal:smooth((p-.55)/.45),cameraAmount:view.amount};
  }

  }
  P.HandFlight = HandFlight;
})(window.CosmicPinball = window.CosmicPinball || {});
