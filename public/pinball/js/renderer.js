(function (P) {
  'use strict';
  const TAU = Math.PI * 2;
  const INK = '#4a3a28', PAPER = '#f4ede0', PAPER_HI = '#fbf7ef';
  const METALS = {
    ivory: ['#b59a70','#d9c7a4','#f8efdc','#cfb98f','#efe1c4','#b99b6c','#dfcea9'],
    gold: ['#7a5623','#b68c47','#e3c88b','#a57b37','#d2b06b','#8f6a2c','#c29d59'],
    silver: ['#7d848d','#c9ced4','#f7f8fa','#a3aab3','#e6e9ed','#8a919a','#cfd4da'],
    rainbow: ['#c499aa','#f3d29d','#efedb8','#a9d5bd','#a7c6dc','#c0afd5','#e7b4c8']
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const obstacleArtBase = typeof document !== 'undefined' && document.currentScript?.src ? new URL('../assets/obstacles/',document.currentScript.src).href : './assets/obstacles/';
  const obstacleArt = new Map();
  // Opaque sprite bounds from assets/obstacles/manifest.json; retain PNG alpha.
  const obstacleArtRects={classic:[20,238,2132,242],twinfold:[11,232,2150,243],cascade:[11,209,2152,298],rhythm:[7,213,2158,269]};
  const backgroundArtBase = typeof document !== 'undefined' && document.currentScript?.src ? new URL('../assets/backgrounds/',document.currentScript.src).href : './assets/backgrounds/';
  const backgroundArt = new Map();
  P.mapBackgroundImage = function(id,onReady) {
    if(typeof Image==='undefined')return null;
    let entry=backgroundArt.get(id);
    if(!entry){
      entry={image:new Image(),ready:false,listeners:new Set()};backgroundArt.set(id,entry);
      entry.image.decoding='async';
      entry.image.onload=()=>{entry.ready=true;for(const notify of entry.listeners)notify();entry.listeners.clear();};
      entry.image.onerror=()=>entry.listeners.clear();
      if(onReady)entry.listeners.add(onReady);
      entry.image.src=backgroundArtBase+id+'-background-v2.png';
    }else if(!entry.ready&&onReady)entry.listeners.add(onReady);
    return entry.ready&&entry.image.naturalWidth>0?entry.image:null;
  };
  function obstacleImage(id) {
    if(typeof Image === 'undefined')return null;
    if(!obstacleArt.has(id)){
      const image=new Image();image.decoding='async';image.src=obstacleArtBase+id+'-surface-v'+(id==='rhythm'?2:1)+'.png';obstacleArt.set(id,image);
    }
    const image=obstacleArt.get(id);return image.complete&&image.naturalWidth>0?image:null;
  }
  function rgba(hex, alpha) {
    if (!hex || hex[0] !== '#') return hex || '#ffffff';
    let h = hex.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
  }
  function pill(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function wave(ctx,x0,x1,y,amp,period,phase) { ctx.beginPath(); const start=x0-period; ctx.moveTo(start,y+Math.sin((start+phase)/period*TAU)*amp); for(let x=start;x<=x1+period;x+=period/24)ctx.lineTo(x,y+Math.sin((x+phase)/period*TAU)*amp); ctx.stroke(); }
  function sun(ctx,x,y,r,count) { ctx.beginPath();ctx.arc(x,y,r*.42,0,TAU);ctx.stroke();for(let i=0;i<(count||20);i++){const a=i/(count||20)*TAU;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6);ctx.lineTo(x+Math.cos(a)*r*(i%2?.85:1),y+Math.sin(a)*r*(i%2?.85:1));ctx.stroke();} }
  function fish(ctx,x,y,r,facing) { ctx.save();ctx.translate(x,y);ctx.scale(facing||1,1);ctx.beginPath();ctx.moveTo(-r*.85,0);ctx.bezierCurveTo(-r*.25,-r*.72,r*.65,-r*.7,r,0);ctx.bezierCurveTo(r*.65,r*.7,-r*.25,r*.72,-r*.85,0);ctx.lineTo(-r*1.35,-r*.43);ctx.lineTo(-r*1.35,r*.43);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.arc(r*.55,-r*.1,r*.055,0,TAU);ctx.fill();ctx.beginPath();ctx.moveTo(r*.28,-r*.4);ctx.quadraticCurveTo(r*.05,0,r*.28,r*.4);ctx.stroke();ctx.restore(); }
  function sparkle(ctx,x,y,r) { ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+r*.2,y-r*.2,x+r,y);ctx.quadraticCurveTo(x+r*.2,y+r*.2,x,y+r);ctx.quadraticCurveTo(x-r*.2,y+r*.2,x-r,y);ctx.quadraticCurveTo(x-r*.2,y-r*.2,x,y-r);ctx.fill(); }
  // One group-colored sphere for the tube, hand scene, flight and board.
  // Keep the existing sprite geometry: its solid circle is exactly 25/128.
  const Pinball = {
    status: 'color', revision: 0, cache: new Map(),
    levels: [64, 128, 256, 512, 1024],
    groups: new Map(), groupSource: null,
    configureGroups(marbles) {
      if (this.groupSource === marbles) return;
      this.groupSource = marbles; this.groups.clear();
      const palette = ['#167aaf','#ce573e','#48853d','#9652aa','#b17a13','#078c87','#c44784','#606cbb'];
      for (const marble of marbles) {
        const name = String(marble.name || '');
        if (this.groups.has(name)) continue;
        const index = this.groups.size;
        const fixed = P.COLOR_GROUPS && P.COLOR_GROUPS.find(group => marble.groupColor ? group.id === marble.groupColor : group.name === name);
        this.groups.set(name, {color: fixed ? fixed.color : palette[index] || `hsl(${Math.round(index*137.508%360)},65%,42%)`, segments: (fixed ? P.COLOR_GROUPS.indexOf(fixed) : index)%4+1});
      }
    },
    group(name) { return this.groups.get(String(name || '')) || {color:'#167aaf',segments:1}; },
    mark(ctx,name,x,y,r,scale=1) {
      if (!name || r<=0) return;
      // Preserve a readable screen-space stroke when the board camera zooms out.
      const group=this.group(name), width=Math.max(r*.09,Math.min(r*.12,.75/Math.max(.01,scale))), radius=r*.88;
      // An enamel identification ring stays inside the collision silhouette.
      // The breaks provide a second cue besides color; no flashing or movement.
      ctx.save();ctx.lineCap='round';
      for (let i=0;i<group.segments;i++) {
        const start=-Math.PI/2+i*TAU/group.segments, end=start+TAU/group.segments-(group.segments===1?0:.20);
        ctx.beginPath();ctx.arc(x,y,radius,start,end);ctx.strokeStyle='rgba(255,248,231,.25)';ctx.lineWidth=width*1.35;ctx.stroke();
        ctx.strokeStyle=group.color;ctx.lineWidth=width;ctx.stroke();
      }
      ctx.restore();
    },
    load() { this.status = 'color'; return Promise.resolve(true); },
    sprite(pixels = 128, color = '#167aaf') {
      const size = this.levels.find(level => level >= pixels) || this.levels[this.levels.length - 1];
      const key = color + ':' + size;
      if (this.cache.has(key)) return this.cache.get(key);
      const c = makeCanvas(size, size), ctx = c.getContext('2d'), r = size * 25 / 128, center = size / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(center, center, r, 0, TAU); ctx.clip();
      ctx.fillStyle = color; ctx.fillRect(center-r, center-r, r*2, r*2);
      const shade = ctx.createRadialGradient(center-r*.3, center-r*.35, r*.1, center, center, r);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.5, 'rgba(0,0,0,.02)'); shade.addColorStop(1, 'rgba(55,40,25,.24)');
      ctx.fillStyle = shade; ctx.fillRect(center-r, center-r, r*2, r*2);
      const light = ctx.createRadialGradient(center-r*.35, center-r*.42, 0, center-r*.35, center-r*.42, r*.85);
      light.addColorStop(0, 'rgba(255,248,231,.35)'); light.addColorStop(.2, 'rgba(255,248,231,.18)'); light.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = light; ctx.fillRect(center-r, center-r, r*2, r*2);
      // Stable material grain is built once per cached sprite, never from race RNG.
      // A normalized pattern keeps the same surface at every resolution.
      let grain = 739391;
      for (let i = 0; i < 420; i++) {
        grain = (Math.imul(grain, 1664525) + 1013904223) >>> 0;
        const x = (grain / 4294967296 * 2 - 1) * r;
        grain = (Math.imul(grain, 1664525) + 1013904223) >>> 0;
        const y = (grain / 4294967296 * 2 - 1) * r;
        ctx.fillStyle = i % 2 ? 'rgba(255,248,231,.065)' : 'rgba(48,35,23,.045)';
        ctx.beginPath(); ctx.ellipse(center + x, center + y, r * .012, r * .008, -.3, 0, TAU); ctx.fill();
      }
      const reflection = ctx.createRadialGradient(center-r*.3, center-r*.48, 0, center-r*.3, center-r*.48, r*.5);
      reflection.addColorStop(0, 'rgba(255,250,239,.16)'); reflection.addColorStop(1, 'rgba(255,250,239,0)');
      ctx.fillStyle = reflection; ctx.fillRect(center-r, center-r, r*2, r*2);
      ctx.strokeStyle = 'rgba(45,35,25,.4)'; ctx.lineWidth = size/128*.7;
      ctx.beginPath(); ctx.arc(center, center, r-.4*size/128, 0, TAU); ctx.stroke(); ctx.restore();
      // Color groups share at most five sizes; avoid growing for arbitrary legacy colors.
      if (this.cache.size >= 80) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, c); return c;
    }
  };
  P.Pinball = Pinball;
  function marbleColor(index, total, theme) {
    theme = typeof theme === 'string' ? P.THEMES[theme] : theme || P.THEMES.cosmic;
    const tone = theme.marble;
    return `hsl(${Math.round(((Number(index) || 0) / Math.max(total, 1) * 360 + tone.hueOffset) % 360)},${tone.saturation}%,${tone.lightness}%)`;
  }
  class Renderer {
    constructor(canvas) {
      this.renderScale=1;this.surface=typeof document.getElementById==='function'?document.getElementById('game-surface'):null;this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});Pinball.load();this.theme=P.THEMES.cosmic;this.quality='high';this.reducedMotion=false;
      this.sprites=new Map();this.nameSprites=new Map();this.currentZoom=1;this.winProgress=0;this.lastWinner=null;this.logo=null;
      if(typeof Image!=='undefined'){const image=new Image();image.onload=()=>{this.logo=image;this.sprites.clear();this.buildBackground();};image.src='./assets/logo.svg';}
      // Soft, screen-anchored paper variation. Interpolated 32px cells avoid
      // single-pixel grain aliasing into pepper bands on a scaled TV canvas.
      const size=256,cells=8,grid=[],ctx=(this.noise=makeCanvas(size,size)).getContext('2d'),data=ctx.createImageData(size,size);
      let seed=6197;for(let i=0;i<cells*cells;i++){seed=seed*16807%2147483647;grid.push((seed-1)/2147483646);}
      const smooth=t=>t*t*(3-2*t),at=(x,y)=>grid[(y%cells)*cells+(x%cells)];
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const gx=x/32,gy=y/32,ix=Math.floor(gx),iy=Math.floor(gy),u=smooth(gx-ix),v=smooth(gy-iy),i=(y*size+x)*4;
        const upper=at(ix,iy)+(at(ix+1,iy)-at(ix,iy))*u,lower=at(ix,iy+1)+(at(ix+1,iy+1)-at(ix,iy+1))*u;
        data.data[i]=116;data.data[i+1]=86;data.data[i+2]=47;data.data[i+3]=Math.round(2+(upper+(lower-upper)*v)*5);
      }
      ctx.putImageData(data,0,0);this.paperPattern=this.ctx.createPattern(this.noise,'repeat');this.resize();
    }
    brandMark(ctx,x,y,r){if(!this.logo)return;ctx.save();ctx.drawImage(this.logo,x-r,y-r*.87,r*2,r*1.74);ctx.restore();}
    material(){return METALS[this.theme.material]?this.theme.material:{cosmic:'ivory',candy:'rainbow',gold:'gold',ice:'silver'}[this.theme.id]||'gold';}
    foil(ctx,x1,y1,x2,y2){const g=ctx.createLinearGradient(x1,y1,x2,y2);METALS[this.material()].forEach((c,i,a)=>g.addColorStop(i/(a.length-1),c));return g;}
    resize() {
      const width=this.canvas.clientWidth||innerWidth,height=this.canvas.clientHeight||innerHeight;
      const density=P.renderDensity(width,height,devicePixelRatio)*(this.renderScale||1),w=Math.round(width*density),h=Math.round(height*density);
      if(this.width===width&&this.height===height&&this.dpr===density&&this.canvas.width===w&&this.canvas.height===h&&this.background)return false;
      this.width=width;this.height=height;this.dpr=density;
      this.canvas.width=w;this.canvas.height=h;this.ctx.imageSmoothingQuality='high';this.buildBackground();return true;
    }
    setMap(id) { const next = P.MAP_STYLES && P.MAP_STYLES[id] || null; if (next === this.mapStyle) return; this.mapStyle = next; this.boardDensity=1; this.sprites.clear(); this.buildBackground(); }
    mapBackground() {
      if(!this._backgroundReady)this._backgroundReady=()=>{this.backgroundRevision=(this.backgroundRevision||0)+1;this.buildBackground();};
      return P.mapBackgroundImage(this.mapStyle?.id||'classic',this._backgroundReady);
    }
    backgroundTileHeight(width) {
      const image=this.mapBackground();return image?Math.max(1000,Math.min(2000,Math.round(width*image.naturalHeight/image.naturalWidth))):520;
    }
    paintMapBackdrop(ctx,w,h) {
      const image=this.mapBackground();if(!image)return false;
      const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
      ctx.save();ctx.globalAlpha=.78;ctx.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);ctx.restore();return true;
    }
    obstacleMaterial(pose,id=this.mapStyle?.id||'classic') {
      const image=obstacleImage(id);if(!image)return false;
      const ctx=this.ctx,r=pose.thickness||8,length=Math.hypot(pose.x2-pose.x1,pose.y2-pose.y1);
      ctx.save();ctx.translate((pose.x1+pose.x2)/2,(pose.y1+pose.y2)/2);ctx.rotate(Math.atan2(pose.y2-pose.y1,pose.x2-pose.x1));
      pill(ctx,-length/2-r,-r,length+2*r,2*r,r);ctx.clip();
      ctx.drawImage(image,...obstacleArtRects[id],-length/2-r,-r,length+2*r,2*r);
      ctx.restore();return true;
    }
    obstacleMedallion(o) {
      const id=this.mapStyle?.id||'classic',image=obstacleImage(id);if(!image)return;
      const ctx=this.ctx,r=o.r||10;ctx.save();ctx.beginPath();ctx.arc(o.x,o.y,r,0,TAU);ctx.clip();
      const [x,y,w,h]=obstacleArtRects[id];ctx.drawImage(image,x+w*.35,y,w*.3,h,o.x-r,o.y-r,r*2,r*2);ctx.restore();
    }
    setRenderScale(scale){const next=clamp(Number(scale)||1,.65,1);if(Math.abs(next-(this.renderScale||1))<.001)return false;this.renderScale=next;return this.resize();}
    setTheme(id) { const next = P.THEMES[id] || P.THEMES.cosmic; if (this.theme === next) return; this.theme = next; this.sprites.clear(); this.nameSprites.clear(); this.buildBackground(); }
    setQuality(quality) { if (this.quality === quality) return; this.quality = quality; this.resize(); }
    setReducedMotion(value) { this.reducedMotion = value; }
    buildBackground() {
      if(!this.width||!this.theme)return;const w=this.width,h=this.height,t=this.theme,d=this.dpr||1;this.background=makeCanvas(Math.round(w*d),Math.round(h*d));const ctx=this.background.getContext('2d');ctx.scale(d,d);
      this.backgroundRevision=(this.backgroundRevision||0)+1;
      let g=ctx.createLinearGradient(0,0,w,h);const palette=this.mapStyle?.background||(t.id==='cosmic'?['#D9E6DD','#F3F3E7','#AAC7C1']:t.background);g.addColorStop(0,palette[0]);g.addColorStop(.52,palette[1]);g.addColorStop(1,palette[2]);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle=ctx.createPattern(this.noise,'repeat');ctx.fillRect(0,0,w,h);
      if(this.paintMapBackdrop(ctx,w,h)){}else if(this.mapStyle)this.mapPattern(ctx,w,h,false);else{
      ctx.strokeStyle=t.id==='gold'?'rgba(217,184,114,.045)':'rgba(144,111,63,.06)';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.save();ctx.globalAlpha=.06;this.brandMark(ctx,w*.72,h*.46,Math.min(w,h)*.22);ctx.restore();sun(ctx,w*.3,h*.25,Math.min(w,h)*.22,28);for(let i=0;i<7;i++)wave(ctx,0,w,h*.75+i*15,13,180,i*20);fish(ctx,w*.87,h*.74,48,-1);fish(ctx,w*.17,h*.85,36,1);
      }
      this.vignette=makeCanvas(Math.round(w*d),Math.round(h*d));const v=this.vignette.getContext('2d');v.scale(d,d);g=v.createRadialGradient(w*.58,h*.48,Math.min(w,h)*.23,w*.58,h*.48,Math.max(w,h)*.78);g.addColorStop(0,'rgba(120,83,35,0)');g.addColorStop(.6,'rgba(120,83,35,.015)');g.addColorStop(1,'rgba(120,83,35,.1)');v.fillStyle=g;v.fillRect(0,0,w,h);
      if(this.surface){const density=P.renderDensity(w,h,devicePixelRatio),surface=this.surface;
        surface.width=Math.round(w*density);surface.height=Math.round(h*density);
        const overlay=surface.getContext('2d');overlay.setTransform(density,0,0,density,0,0);
        overlay.drawImage(this.vignette,0,0,w,h);overlay.globalAlpha=.26;overlay.fillStyle=this.paperPattern;overlay.fillRect(0,0,w,h);overlay.globalAlpha=1;
        // The composite retains this effect; release the temporary full-size texture.
        this.vignette=null;}
    }
    mapPattern(ctx,w,h,board) {
      const style=this.mapStyle;if(!style)return;ctx.save();ctx.strokeStyle=style.ink;ctx.fillStyle=style.ink;ctx.lineWidth=board?1.3:1.8;ctx.globalAlpha=board?.17:.22;
      if(style.motif==='pond'){
        for(let y=75;y<h;y+=150){const x=(Math.floor(y/150)%2?.76:.22)*w;for(let r=28;r<=80;r+=18){ctx.beginPath();ctx.ellipse(x,y,r,r*.32,0,0,TAU);ctx.stroke();}ctx.save();ctx.translate(x,y-15);ctx.beginPath();ctx.arc(0,0,22,.35,TAU-.35);ctx.lineTo(0,0);ctx.closePath();ctx.fill();ctx.restore();}if(!board){fish(ctx,w*.5,h*.38,60,1);fish(ctx,w*.82,h*.72,42,-1);}
      }else if(style.motif==='library'){
        for(let y=40;y<h;y+=145){ctx.beginPath();ctx.moveTo(35,y+86);ctx.lineTo(w-35,y+86);ctx.stroke();for(let x=55;x<w-55;x+=58){const height=48+(Math.floor(x/58)%3)*12;ctx.strokeRect(x,y+85-height,35,height);ctx.beginPath();ctx.moveTo(x+7,y+89-height);ctx.lineTo(x+7,y+80);ctx.moveTo(x+14,y+64);ctx.lineTo(x+28,y+64);ctx.stroke();}}
      }else if(style.motif==='terraces'){
        for(let y=-100;y<h+120;y+=155){ctx.beginPath();ctx.moveTo(0,y+95);for(let x=0;x<=w;x+=100){const level=(Math.floor(x/100)%4)*18;ctx.lineTo(x,y+level);ctx.lineTo(x+50,y+level);}ctx.stroke();ctx.beginPath();ctx.moveTo(0,y+115);ctx.lineTo(w,y-65);ctx.stroke();}if(!board){ctx.globalAlpha=.12;ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(w*.4,h*.4);ctx.lineTo(w*.65,h*.75);ctx.lineTo(w,h*.48);ctx.lineTo(w,h);ctx.closePath();ctx.fill();}
      }else if(style.motif==='clockwork'){
        for(let y=80;y<h;y+=260){const x=(Math.floor(y/260)%2?.72:.28)*w;
          for(const radius of [36,56,82]){ctx.beginPath();ctx.arc(x,y,radius,-Math.PI*.75,Math.PI*.75);ctx.stroke();}
          for(let k=0;k<12;k++){const a=k*TAU/12;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*87,y+Math.sin(a)*87);ctx.lineTo(x+Math.cos(a)*94,y+Math.sin(a)*94);ctx.stroke();}
          ctx.beginPath();ctx.moveTo(x,y+100);ctx.lineTo(x,y+145);ctx.lineTo(w-x,y+145);ctx.stroke();
          for(let k=0;k<5;k++)ctx.strokeRect(w-x-40+k*20,y+164,8,16+(k%3)*8);
        }
      }else{
        for(let x=30;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=30;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.globalAlpha=board?.24:.25;for(let y=90;y<h;y+=210){const x=(Math.floor(y/210)%2?.72:.28)*w;for(const r of [20,42,68]){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();}ctx.beginPath();ctx.moveTo(x-90,y);ctx.lineTo(x+90,y);ctx.moveTo(x,y-90);ctx.lineTo(x,y+90);ctx.stroke();}
      }ctx.restore();
    }
    glow(color){const key='g:'+color;if(this.sprites.has(key))return this.sprites.get(key);const c=makeCanvas(128,128),ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,color);g.addColorStop(.3,color);g.addColorStop(1,'rgba(244,237,224,0)');ctx.globalAlpha=.18;ctx.fillStyle=g;ctx.fillRect(0,0,128,128);this.sprites.set(key,c);return c;}
    marbleSprite(color, pixels = 128) { return Pinball.sprite(pixels, color || '#167aaf'); }
    pinSprite(color,kind,pixels=128) {
      const size=[128,256,512,1024].find(n=>n>=pixels)||1024,key='p:'+color+':'+kind+':'+size;if(this.sprites.has(key))return this.sprites.get(key);const c=makeCanvas(size,size),ctx=c.getContext('2d'),r=20;ctx.scale(size/128,size/128);let g=ctx.createRadialGradient(64,72,13,64,72,33);g.addColorStop(0,'rgba(82,53,17,.19)');g.addColorStop(1,'rgba(82,53,17,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(64,70,33,0,TAU);ctx.fill();
      ctx.fillStyle=this.foil(ctx,44,44,84,90);ctx.beginPath();ctx.arc(64,64,r,0,TAU);ctx.fill();ctx.strokeStyle='rgba(98,65,23,.45)';ctx.lineWidth=1;ctx.stroke();ctx.strokeStyle='rgba(255,250,231,.92)';ctx.beginPath();ctx.arc(64,63,r-3,3.5,5.5);ctx.stroke();
      if(kind==='bumper'){ctx.fillStyle=PAPER_HI;ctx.beginPath();ctx.arc(64,64,15,0,TAU);ctx.fill();ctx.strokeStyle=this.foil(ctx,48,46,80,82);ctx.lineWidth=1.1;this.brandMark(ctx,64,65,10);}else{g=ctx.createRadialGradient(60,58,0,66,67,16);g.addColorStop(0,'#fffdf7');g.addColorStop(.45,'#f1e4ca');g.addColorStop(1,color);ctx.fillStyle=g;ctx.beginPath();ctx.arc(64,64,12,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.ellipse(60,59,3.4,2.1,-.5,0,TAU);ctx.fill();}this.sprites.set(key,c);return c;
    }
    drawBackground(camera,time){const ctx=this.ctx;ctx.drawImage(this.background,0,0,this.width,this.height);if(this.material()==='rainbow'&&this.quality!=='low'){ctx.save();const drift=this.reducedMotion?0:Math.sin(time*.18)*24;ctx.globalAlpha=.07;ctx.fillStyle=this.foil(ctx,0,drift,this.width,this.height+drift);ctx.fillRect(0,0,this.width,this.height);ctx.restore();}}
    boardTile(width) {
      const image=this.mapBackground(),height=this.backgroundTileHeight(width),density=this.boardDensity=Math.min(image?2:4,Math.max(this.boardDensity||1,Math.ceil(this.currentZoom*this.dpr))),key='board:'+(this.mapStyle?.id||'classic')+':'+width+':'+density+':'+(this.backgroundRevision||0);if(this.sprites.has(key))return this.sprites.get(key);
      // Retain only the current board density rather than each zoom history.
      for(const old of this.sprites.keys())if(old.startsWith('board:'))this.sprites.delete(old);
      const c=makeCanvas(width*density,height*density),ctx=c.getContext('2d');ctx.scale(density,density);ctx.strokeStyle='rgba(184,157,111,.065)';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.5;
      if(image){
        ctx.fillStyle=this.mapStyle?.board||PAPER_HI;ctx.fillRect(0,0,width,height);
        ctx.save();ctx.globalAlpha=this.mapStyle?.id==='rhythm'?.42:.46;ctx.drawImage(image,0,0,width,height);ctx.restore();
        // A calm central lane keeps colored marbles distinct from decorative foliage/gears.
        const quiet=ctx.createLinearGradient(0,0,width,0),board=this.mapStyle?.board||PAPER_HI;
        quiet.addColorStop(0,rgba(board,0));quiet.addColorStop(.22,rgba(board,.58));quiet.addColorStop(.78,rgba(board,.58));quiet.addColorStop(1,rgba(board,0));
        ctx.fillStyle=quiet;ctx.fillRect(0,0,width,height);
      }else if(this.mapStyle)this.mapPattern(ctx,width,520,true);else{ctx.save();ctx.globalAlpha=.12;this.brandMark(ctx,width/2,240,95);ctx.restore();fish(ctx,145,370,28,1);fish(ctx,width-145,385,28,-1);for(let i=0;i<3;i++)wave(ctx,55,width-55,420+i*9,6,98,i*24);}this.sprites.set(key,c);return c;
    }
    drawBoard(map,time,visible) {
      const ctx=this.ctx,t=this.theme,w=map.width,h=map.height,top=Math.max(0,visible.top),bottom=Math.min(h,visible.bottom);ctx.save();ctx.fillStyle='rgba(91,67,35,.035)';pill(ctx,10,8,w-20,h,28);ctx.fill();ctx.fillStyle=this.mapStyle?.board||(t.id==='gold'?'#EAD9B9':PAPER_HI);pill(ctx,23,0,w-46,h-18,24);ctx.fill();ctx.beginPath();pill(ctx,23,0,w-46,h-18,24);ctx.clip();
      let g=ctx.createLinearGradient(25,0,w-25,0);g.addColorStop(0,'rgba(171,139,86,.07)');g.addColorStop(.2,'rgba(248,239,221,.04)');g.addColorStop(.8,'rgba(248,239,221,.04)');g.addColorStop(1,'rgba(171,139,86,.07)');ctx.fillStyle=g;ctx.fillRect(23,0,w-46,h);const tileHeight=this.backgroundTileHeight(w);for(let y=Math.floor(top/tileHeight)*tileHeight;y<bottom;y+=tileHeight){ctx.save();if(tileHeight!==520&&Math.abs(Math.round(y/tileHeight))%2){ctx.translate(0,y+tileHeight);ctx.scale(1,-1);ctx.drawImage(this.boardTile(w),0,0,w,tileHeight+1);}else ctx.drawImage(this.boardTile(w),0,y,w,tileHeight+(tileHeight!==520?1:0));ctx.restore();}ctx.restore();ctx.strokeStyle=this.foil(ctx,0,0,w,240);ctx.lineWidth=3;pill(ctx,24,2,w-48,h-22,23);ctx.stroke();ctx.strokeStyle='rgba(116,85,42,.24)';ctx.lineWidth=.8;const bounds=P.boardBounds(map);pill(ctx,bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top,bounds.radius);ctx.stroke();
      ctx.strokeStyle='rgba(255,252,242,.85)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(27,Math.max(24,top));ctx.lineTo(27,Math.min(h-46,bottom));ctx.stroke();for(let y=Math.max(110,Math.floor(top/300)*300);y<bottom;y+=300){ctx.strokeStyle=this.foil(ctx,34,y,72,y+35);ctx.lineWidth=1.1;this.brandMark(ctx,55,y,13);this.brandMark(ctx,w-55,y,13);}
      if(top<170){ctx.save();ctx.textAlign='center';ctx.fillStyle=INK;ctx.font='600 10px Pretendard Variable,sans-serif';ctx.fillStyle='#8a7760';ctx.font='500 10px Pretendard Variable,sans-serif';if(this.logo){ctx.globalAlpha=.2;ctx.drawImage(this.logo,w/2-70,84,140,122);}ctx.restore();}
    }
    segment(pose,color,ghost,shadow=true){const ctx=this.ctx,thickness=Math.max(3,pose.thickness||9);ctx.save();ctx.lineCap='round';if(shadow){ctx.beginPath();ctx.moveTo(pose.x1,pose.y1+(ghost?0:3));ctx.lineTo(pose.x2,pose.y2+(ghost?0:3));ctx.strokeStyle='rgba(94,66,27,.13)';ctx.lineWidth=thickness*2+4;ctx.stroke();}ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);ctx.strokeStyle=ghost?rgba(color,.13):(this.mapStyle?rgba(this.mapStyle.accent,.8):this.foil(ctx,pose.x1,pose.y1-9,pose.x2,pose.y2+12));ctx.lineWidth=thickness*2;ctx.stroke();if(!ghost&&this.mapStyle){ctx.strokeStyle=PAPER_HI;ctx.lineWidth=Math.max(2,thickness*2-3);ctx.stroke();}if(!ghost){ctx.strokeStyle='rgba(255,250,231,.78)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(pose.x1,pose.y1-thickness*.6);ctx.lineTo(pose.x2,pose.y2-thickness*.6);ctx.stroke();}if(!ghost)this.obstacleMaterial(pose);ctx.restore();}
    drawWindGust(o, elapsed) {
      const ctx=this.ctx,lanes=this.quality==='low'?[0]:[0,1];
      // Layered original ink-drawn packets: a narrow tail, expanding curled head,
      // outward drift and dissipation. Shapes are rebuilt on every render frame.
      lanes.forEach((lane,i)=>{
        const delay=i*.07,age=elapsed-delay;
        if(age<0||age>.68)return;
        const t=this.reducedMotion ? .48 :age/.68,sign=i?1:-1;
        const fade=Math.min(1,age/.055)*Math.pow(1-age/.68,.65);
        const r=(42+55*Math.sin(Math.PI*t*.85))*(i?.5:1),x=o.x+(i?65+t*25:-12-t*12),y=o.y-35-t*(o.height-52);
        // Long, fine tails taper towards the nozzle, like the reference sketch.
        for(let strand=0;strand<3;strand++){
          const start=o.x-45+(strand-1)*12,end=x+(-.6+strand*.32)*r;
          ctx.beginPath();ctx.moveTo(start,o.y-9-strand*5);
          ctx.bezierCurveTo(start+sign*r*.1,o.y-30,end-sign*r*.65,y+r*.9,end,y+r*.5);
          ctx.strokeStyle=`rgba(69,86,76,${fade*(.66-strand*.14)})`;ctx.lineWidth=strand===0?1.8:1.1;ctx.stroke();
        }
        ctx.save();ctx.translate(x,y);ctx.scale(r*1.18,r);ctx.rotate(sign*(-.10+.13*t));
        // Uneven open lobes and internal curls read as a rolling gust, not a balloon.
        ctx.beginPath();ctx.moveTo(-.68,.64);
        ctx.bezierCurveTo(-1.18,.72,-1.31,-.04,-.86,-.22);
        ctx.bezierCurveTo(-1.11,-.72,-.57,-1.04,-.24,-.73);
        ctx.bezierCurveTo(-.13,-1.22,.66,-1.15,.73,-.66);
        ctx.bezierCurveTo(1.24,-.76,1.48,-.09,1.04,.16);
        ctx.bezierCurveTo(1.43,.58,.78,1.06,.54,.72);
        ctx.fillStyle=`rgba(255,254,244,${fade*.21})`;ctx.fill();
        ctx.strokeStyle=`rgba(57,76,67,${fade*.86})`;ctx.lineWidth=1.7/r;ctx.stroke();
        ctx.beginPath();ctx.moveTo(-.55,.33);ctx.bezierCurveTo(-.95,-.1,-.44,-.53,-.12,-.23);ctx.bezierCurveTo(.15,.05,-.02,.41,-.3,.27);
        ctx.moveTo(.28,.55);ctx.bezierCurveTo(.81,.76,1.02,.2,.72,.04);ctx.bezierCurveTo(.45,-.11,.3,.12,.45,.27);
        ctx.moveTo(.07,-.51);ctx.bezierCurveTo(.23,-.85,.69,-.65,.63,-.34);
        ctx.strokeStyle=`rgba(64,84,73,${fade*.72})`;ctx.lineWidth=1.25/r;ctx.stroke();
        // Short offset pencil accents emphasize the moving outer edges.
        ctx.strokeStyle=`rgba(67,85,74,${fade*.48})`;ctx.lineWidth=.9/r;
        for(let mark=0;mark<3;mark++){
          const offset=mark*.075;ctx.beginPath();ctx.moveTo(-1.15-offset,-.1);ctx.quadraticCurveTo(-1.28-offset,-.3,-1.13-offset,-.48);ctx.stroke();
          ctx.beginPath();ctx.moveTo(.4+offset,-1.07);ctx.quadraticCurveTo(.2+offset,-1.19,.02+offset,-1.08);ctx.stroke();
        }
        ctx.restore();
      });
    }
    drawWind(o, physics) {
      const ctx=this.ctx,clock=physics.time||0,pulse=P.windPulse(o,clock),active=pulse.active;
      const left=o.x-o.width/2,elapsed=(clock+(o.phase||0))%o.period;
      const charge=active?1:clamp((elapsed-o.duration)/(o.period-o.duration),0,1);
      const brass=ctx.createLinearGradient(0,o.y-20,0,o.y+38);
      brass.addColorStop(0,'#F3DEAA');brass.addColorStop(.28,'#C0A06B');brass.addColorStop(.65,'#84633E');brass.addColorStop(1,'#D2B67B');
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      // A brief drawn gust trails off naturally; the physical impulse stays 0.4s.
      if(elapsed<.84)this.drawWindGust(o,elapsed);
      // A brass and celadon housing, recessed grille and inset book medallion.
      ctx.fillStyle='rgba(77,59,33,.14)';pill(ctx,left-12,o.y+13,o.width+24,38,20);ctx.fill();
      ctx.fillStyle=brass;ctx.strokeStyle='#957341';ctx.lineWidth=1.8;pill(ctx,left-12,o.y-7,o.width+24,42,21);ctx.fill();ctx.stroke();
      ctx.fillStyle='#2F655F';ctx.beginPath();ctx.ellipse(o.x,o.y-3,o.width/2-7,16,0,0,TAU);ctx.fill();
      ctx.strokeStyle='#E4D5A4';ctx.lineWidth=2;ctx.stroke();
      const inset=ctx.createLinearGradient(0,o.y-15,0,o.y+12);inset.addColorStop(0,'#244F4B');inset.addColorStop(.55,'#5E9E8D');inset.addColorStop(1,'#244F4B');
      for(let x=left+24;x<left+o.width-18;x+=22){if(Math.abs(x-o.x)<35)continue;ctx.fillStyle=inset;ctx.strokeStyle='rgba(202,222,184,.65)';ctx.lineWidth=.9;pill(ctx,x-4,o.y-13,9,19,4);ctx.fill();ctx.stroke();}
      ctx.beginPath();ctx.ellipse(o.x,o.y-6,o.width/2-17,10,0,Math.PI,TAU);ctx.strokeStyle='rgba(255,248,215,.7)';ctx.lineWidth=1;ctx.stroke();
      // Fluted end caps carry small pressure dials, lit as the next gust nears.
      for(const x of [left-2,left+o.width+2]){
        ctx.fillStyle=brass;ctx.strokeStyle='#947647';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(x,o.y+7,20,24,0,0,TAU);ctx.fill();ctx.stroke();
        ctx.fillStyle='#294F49';ctx.beginPath();ctx.arc(x,o.y+5,11,0,TAU);ctx.fill();
        for(let i=0;i<8;i++){const a=-Math.PI*.8+i*Math.PI*1.6/7;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*14,o.y+5+Math.sin(a)*14);ctx.lineTo(x+Math.cos(a)*17,o.y+5+Math.sin(a)*17);ctx.strokeStyle='rgba(250,231,184,.7)';ctx.lineWidth=.8;ctx.stroke();}
        const angle=-Math.PI*.8+charge*Math.PI*1.6;ctx.beginPath();ctx.moveTo(x,o.y+5);ctx.lineTo(x+Math.cos(angle)*8,o.y+5+Math.sin(angle)*8);ctx.strokeStyle=active?'#E2F9C6':'#D9C38B';ctx.lineWidth=1.7;ctx.stroke();
      }
      ctx.fillStyle='#E2CE96';ctx.strokeStyle='#8F7449';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(o.x,o.y+7,24,0,TAU);ctx.fill();ctx.stroke();
      ctx.fillStyle='#365F51';ctx.beginPath();ctx.arc(o.x,o.y+7,19,0,TAU);ctx.fill();
      ctx.strokeStyle='#E9DBAC';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(o.x,o.y+16);ctx.lineTo(o.x-12,o.y+11);ctx.lineTo(o.x-12,o.y);ctx.quadraticCurveTo(o.x-5,o.y-2,o.x,o.y+3);ctx.quadraticCurveTo(o.x+5,o.y-2,o.x+12,o.y);ctx.lineTo(o.x+12,o.y+11);ctx.closePath();ctx.moveTo(o.x,o.y+3);ctx.lineTo(o.x,o.y+16);ctx.stroke();
      // Segmented rails fill inwards; the state stays legible at game zoom.
      for(const sign of [-1,1])for(let i=0;i<8;i++){
        const x=o.x+sign*(94+i*23)-8,lit=active||charge>(7-i)/8;
        ctx.fillStyle=lit?(active?'#69A892':'#BCA471'):'rgba(120,113,84,.16)';pill(ctx,x,o.y+48,16,4,2);ctx.fill();
      }
      ctx.fillStyle='rgba(248,244,222,.94)';ctx.strokeStyle='rgba(124,150,116,.48)';ctx.lineWidth=1;pill(ctx,o.x-74,o.y+39,148,27,13);ctx.fill();ctx.stroke();
      ctx.fillStyle='#386F62';ctx.font='600 14px Pretendard Variable,sans-serif';ctx.textAlign='center';ctx.fillText(active?'상승 바람 ↑':'바람길',o.x,o.y+57);
      ctx.restore();
    }
    drawCombMember(o, physics) {
      const ctx=this.ctx,pose=physics.getObstaclePose(o),spine=o.role==='comb-spine';
      ctx.save();
      if(spine){
        const trackX=o.side<0?20:966;
        ctx.fillStyle='#AC7955';ctx.strokeStyle='#765338';ctx.lineWidth=1.5;
        pill(ctx,trackX,o.y-140,14,280,6);ctx.fill();ctx.stroke();
        ctx.strokeStyle='#E9C99A';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(trackX+5,o.y-126);ctx.lineTo(trackX+5,o.y+126);ctx.stroke();
        for(const dy of [-126,126]){ctx.fillStyle='#765338';ctx.beginPath();ctx.arc(trackX+7,o.y+dy,2,0,TAU);ctx.fill();}
      }
      // The collider assembly continues behind the wall; only exposed teeth show.
      ctx.beginPath();ctx.rect(36,o.y-360,928,720);ctx.clip();
      ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);
      ctx.lineCap='round';ctx.strokeStyle='#835136';ctx.lineWidth=o.thickness*2+2;ctx.stroke();
      ctx.strokeStyle=spine?'#D39763':'#E1B780';ctx.lineWidth=o.thickness*2;ctx.stroke();
      ctx.strokeStyle=spine?'#FFE2AA':'#FFF0CA';ctx.lineWidth=spine?3:1.5;ctx.stroke();
      this.obstacleMaterial(pose,'cascade');
      if(spine){
        for(let i=0;i<5;i++){
          const t=(i+.5)/5,x=pose.x1+(pose.x2-pose.x1)*t,y=pose.y1+(pose.y2-pose.y1)*t;
          ctx.fillStyle='#9F6B43';ctx.beginPath();ctx.arc(x,y,3.5,0,TAU);ctx.fill();ctx.fillStyle='#F6D99E';ctx.beginPath();ctx.arc(x-.7,y-.7,1.2,0,TAU);ctx.fill();
        }
      }
      ctx.restore();
    }
    drawClockwork(o,physics) {
      const ctx=this.ctx,pose=physics.getObstaclePose(o),gold='#D4A25E',dark='#171B35',mint='#7BC7BE';
      ctx.save();
      if(o.role==='clock-drum'){
        if(o.beat.step===0){
          ctx.strokeStyle='rgba(212,162,94,.24)';ctx.lineWidth=2;
          for(let k=0;k<24;k++){const a=k*TAU/24;ctx.beginPath();ctx.moveTo(o.x+Math.cos(a)*366,o.y+Math.sin(a)*366);ctx.lineTo(o.x+Math.cos(a)*(k%2?372:380),o.y+Math.sin(a)*(k%2?372:380));ctx.stroke();}
          ctx.fillStyle='rgba(123,199,190,.05)';ctx.beginPath();ctx.arc(o.x,o.y,305,0,TAU);ctx.fill();
          const beat=Math.floor((((pose.angle/TAU)%1+1)%1)*6);
          for(let k=0;k<6;k++){ctx.beginPath();ctx.arc(o.x+(k-2.5)*24,o.y-245,4,0,TAU);ctx.fillStyle=k===beat?mint:'#665269';ctx.fill();}
        }
        // Six exposed spokes and their open pockets use the actual rotor pose.
        ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);
        ctx.strokeStyle=gold;ctx.lineWidth=20;ctx.stroke();ctx.strokeStyle='#F5DFC0';ctx.lineWidth=3;ctx.stroke();this.obstacleMaterial(pose,'rhythm');
        ctx.strokeStyle='rgba(123,199,190,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(o.x,o.y,105,pose.angle+.12,pose.angle+Math.PI/3-.12);ctx.stroke();
        if(o.beat.step===2){ctx.fillStyle=dark;ctx.beginPath();ctx.arc(o.x,o.y,18,0,TAU);ctx.fill();ctx.strokeStyle=mint;ctx.lineWidth=3;ctx.stroke();}
      }else if(o.role==='clock-pad'||o.role==='clock-buffer'){
        ctx.strokeStyle='rgba(123,199,190,.3)';ctx.lineWidth=2;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(o.x,o.y-o.amplitude-28);ctx.lineTo(o.x,o.y+o.amplitude+28);ctx.stroke();ctx.setLineDash([]);
        ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);ctx.strokeStyle=mint;ctx.lineWidth=o.thickness*2;ctx.stroke();ctx.strokeStyle='#32666D';ctx.lineWidth=o.thickness*2-8;ctx.stroke();
        this.obstacleMaterial(pose,'rhythm');ctx.strokeStyle='#C0E9DB';ctx.lineWidth=2;ctx.beginPath();for(const dx of [-20,0,20]){ctx.moveTo(o.x+dx,pose.y-9);ctx.lineTo(o.x+dx,pose.y+9);}ctx.stroke();
      }else if(o.role==='clock-fork'){
        ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);ctx.strokeStyle='#BB8F64';ctx.lineWidth=16;ctx.stroke();ctx.strokeStyle='#F5DFC0';ctx.lineWidth=2;ctx.stroke();this.obstacleMaterial(pose,'rhythm');
        ctx.fillStyle=mint;ctx.beginPath();ctx.arc(pose.x,pose.y,5,0,TAU);ctx.fill();
      }else if(o.role==='clock-jewel'){
        ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);ctx.lineWidth=48;ctx.strokeStyle='#B5824C';ctx.stroke();ctx.lineWidth=36;ctx.strokeStyle='#F4DDB9';ctx.stroke();this.obstacleMaterial(pose,'rhythm');
        ctx.beginPath();ctx.arc(pose.x,pose.y,14,0,TAU);ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=gold;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=mint;ctx.beginPath();ctx.arc(pose.x,pose.y,5,0,TAU);ctx.fill();
      }else{
        ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);ctx.lineWidth=16;ctx.strokeStyle=o.role==='clock-ring'?'#AF7C56':'#78617F';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#E4BC83';ctx.stroke();this.obstacleMaterial(pose,'rhythm');
      }
      ctx.restore();
    }
    drawObstacle(o,physics,effects,time,visible) {
      if(o.role==='rock-ledge'){
        const pose=physics.getObstaclePose(o),ctx=this.ctx;
        if(pose.y+80<visible.top||pose.y-80>visible.bottom)return;
        ctx.save();ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pose.x1,pose.y1);ctx.lineTo(pose.x2,pose.y2);
        ctx.lineWidth=o.thickness*2;ctx.strokeStyle='#915D43';ctx.stroke();ctx.lineWidth=o.thickness;ctx.strokeStyle='#D8A17B';ctx.stroke();this.obstacleMaterial(pose,'cascade');
        ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.strokeStyle='#FFF0DD';ctx.lineWidth=2;
        for(let x=-o.length/2+18;x<o.length/2-10;x+=32){ctx.beginPath();ctx.moveTo(x,-4);ctx.lineTo(x+6,4);ctx.stroke();}
        ctx.restore();return;
      }
      if(o.type==='moving'&&o.role==='bookend'){
        const pose=physics.getObstaclePose(o);
        this.drawObstacle({type:'pin',id:o.id,role:o.role,x:pose.x,y:pose.y,r:o.thickness},physics,effects,time,visible);
        return;
      }
      if(o.role&&o.role.indexOf('clock-')===0){const yy=o.points?o.points[1].y:o.y===undefined?(o.y1+o.y2)/2:o.y,span=o.role==='clock-drum'?400:250;if(yy+span>=visible.top&&yy-span<=visible.bottom)this.drawClockwork(o,physics);return;}
      if(o.assembly&&o.role&&o.role.indexOf('comb-')===0){if(o.y+360>=visible.top&&o.y-360<=visible.bottom)this.drawCombMember(o,physics);return;}
      if(o.type==='wind'){if(o.y+80>=visible.top&&o.y-o.height<=visible.bottom)this.drawWind(o,physics);return;}
      const ctx=this.ctx,t=this.theme,type=o.type,pose=physics.getObstaclePose?physics.getObstaclePose(o):o;
      const y=type==='polygon'?(Math.min(...o.points.map(p=>p.y))+Math.max(...o.points.map(p=>p.y)))/2:pose.y===undefined?(pose.y1+pose.y2)/2:pose.y,span=type==='polygon'?(Math.max(...o.points.map(p=>p.y))-Math.min(...o.points.map(p=>p.y)))/2:(o.length||o.height||o.r||70);if(y+span<visible.top-80||y-span>visible.bottom+80)return;const hit=effects&&effects.hits&&effects.hits.get(o.id||o),power=hit?clamp(hit.life/.3,0,1):0;
      if (o.channelWall) {
        ctx.save(); ctx.beginPath(); o.points.forEach((point,index) => index ? ctx.lineTo(point.x,point.y) : ctx.moveTo(point.x,point.y)); ctx.closePath();
        ctx.fillStyle = '#e3d8c5'; ctx.fill(); ctx.strokeStyle = 'rgba(119,88,43,.5)'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,252,242,.85)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); return;
      }
      if(type==='pin'&&this.mapStyle){const r=o.r||10;ctx.save();ctx.beginPath();ctx.arc(o.x,o.y,r,0,TAU);ctx.fillStyle=this.mapStyle.accent;ctx.fill();this.obstacleMedallion(o);ctx.strokeStyle=this.mapStyle.board;ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle=this.mapStyle.board;ctx.lineWidth=1;ctx.beginPath();if(this.mapStyle.motif==='library'){ctx.moveTo(o.x,o.y-r*.6);ctx.lineTo(o.x,o.y+r*.6);}else if(this.mapStyle.motif==='terraces'){ctx.moveTo(o.x-r*.5,o.y);ctx.lineTo(o.x,o.y-r*.4);ctx.lineTo(o.x+r*.5,o.y);}else{ctx.arc(o.x,o.y,r*.45,0,TAU);}ctx.stroke();if(power&&!this.reducedMotion){ctx.strokeStyle=this.mapStyle.accent;ctx.globalAlpha=power*.5;ctx.beginPath();ctx.arc(o.x,o.y,r+5+power*8,0,TAU);ctx.stroke();}ctx.restore();}
      else if(type==='pin'||type==='bumper'){const color=type==='bumper'?t.secondary:t.primary,r=(o.r||10)*(1+power*(type==='bumper'?.14:.04));if(type==='bumper'){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(this.reducedMotion?0:time*.18);ctx.strokeStyle=this.foil(ctx,-r*2,-r,r*2,r);ctx.lineWidth=1.5;sun(ctx,0,0,r*1.6,16);ctx.restore();}ctx.drawImage(this.pinSprite(color,type,r*6.4*this.currentZoom*this.dpr),o.x-r*3.2,o.y-r*3.2,r*6.4,r*6.4);this.obstacleMedallion(o);if(power&&!this.reducedMotion){ctx.save();ctx.globalAlpha=power*.75;ctx.fillStyle='#fffaf0';sparkle(ctx,o.x-r*.4,o.y-r*.6,r*.6);ctx.restore();}}
      else if(type==='segment'||type==='rotor'||type==='moving'){
        this.segment(pose,this.mapStyle?this.mapStyle.accent:t.primary,false,type==='segment');
        if(type==='moving'&&this.mapStyle){ctx.save();ctx.strokeStyle=this.mapStyle.accent;ctx.lineWidth=1;ctx.setLineDash([2,7]);ctx.beginPath();ctx.moveTo(o.x-o.amplitude,o.y);ctx.lineTo(o.x+o.amplitude,o.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(o.x-10,o.y-4);ctx.lineTo(o.x-16,o.y);ctx.lineTo(o.x-10,o.y+4);ctx.moveTo(o.x+10,o.y-4);ctx.lineTo(o.x+16,o.y);ctx.lineTo(o.x+10,o.y+4);ctx.stroke();ctx.restore();}
        if(type==='rotor')ctx.drawImage(this.pinSprite(t.secondary,'bumper',60*this.currentZoom*this.dpr),o.x-30,o.y-30,60,60);
      }else if(type==='polygon'){ctx.save();ctx.beginPath();o.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=this.mapStyle?PAPER_HI:this.foil(ctx,o.points[0].x,o.points[0].y,o.points[1].x,o.points[1].y);ctx.fill();ctx.strokeStyle=this.mapStyle?this.mapStyle.accent:'rgba(112,77,30,.28)';ctx.lineWidth=2;ctx.stroke();ctx.clip();ctx.strokeStyle='rgba(255,248,225,.3)';ctx.lineWidth=1;for(let i=0;i<4;i++)wave(ctx,0,1000,y-30+i*20,9,130,i*12);ctx.restore();}
      else if(type==='boost'){const shape=P.boostShape(o),w=shape.width,h=shape.height;ctx.save();ctx.translate(o.x,o.y);ctx.rotate(shape.angle);ctx.fillStyle='rgba(232,219,191,.48)';pill(ctx,-w/2,-h/2,w,h,shape.radius);ctx.fill();ctx.strokeStyle=this.foil(ctx,-w/2,0,w/2,h);ctx.lineWidth=1.5;ctx.stroke();for(let i=0;i<4;i++){const py=((i*h/3+(this.reducedMotion?0:time*40))%h)-h/2;ctx.globalAlpha=.35+(1-Math.abs(py)/(h/2))*.6;ctx.strokeStyle=t.primary;ctx.lineWidth=2;wave(ctx,-w*.35,w*.35,py,4,w*.6,0);}ctx.restore();}
      else if(type==='portal'){const r=o.r||35;ctx.save();ctx.translate(o.x,o.y);ctx.rotate(this.reducedMotion?0:-time*.45);ctx.fillStyle=this.foil(ctx,-r,-r,r,r);ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.strokeStyle='rgba(108,78,39,.35)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=PAPER_HI;ctx.beginPath();ctx.arc(0,0,r*.74,0,TAU);ctx.fill();ctx.strokeStyle=this.foil(ctx,-r,-r,r,r);ctx.lineWidth=1.3;this.brandMark(ctx,0,3,r*.55);for(let i=0;i<12;i++){const a=i/12*TAU;ctx.fillStyle=i%2?t.primary:'#b79e73';ctx.beginPath();ctx.arc(Math.cos(a)*r*1.25,Math.sin(a)*r*1.25,i%2?1.5:2.3,0,TAU);ctx.fill();}ctx.restore();ctx.save();ctx.textAlign='center';ctx.font='700 13px Pretendard Variable,sans-serif';ctx.fillStyle='#674B27';ctx.fillText((o.pair||'').charAt(0).toUpperCase()+(o.exit?' 도착':' 진입'),o.x,o.y-r-19);ctx.restore();}
    }
    portalPairs(map) {
      return (map.obstacles || []).filter(o => o.type === 'portal' && !o.exit && Number.isFinite(o.targetX) && Number.isFinite(o.targetY))
        .map(o => ({ x: o.x, y: o.y, targetX: o.targetX, targetY: o.targetY, pair: o.pair }));
    }
    drawPortalGuides(map, visible) {
      const ctx = this.ctx;
      for (const route of this.portalPairs(map)) {
        if (route.y > visible.bottom + 60 || route.targetY < visible.top - 60) continue;
        ctx.save(); ctx.strokeStyle='rgba(119,85,39,.42)';ctx.lineWidth=2.5;ctx.setLineDash([4,12]);ctx.beginPath();
        ctx.moveTo(route.x,route.y);ctx.bezierCurveTo(route.x,route.y+230,route.targetX,route.targetY-230,route.targetX,route.targetY);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#795831';ctx.beginPath();ctx.moveTo(route.targetX,route.targetY-49);ctx.lineTo(route.targetX-8,route.targetY-63);ctx.lineTo(route.targetX+8,route.targetY-63);ctx.closePath();ctx.fill();ctx.restore();
      }
    }
    drawFinish(map,time,visible){const y=map.finish&&map.finish.y||map.height-120;if(y<visible.top-180||y>visible.bottom+180)return;const ctx=this.ctx,x=80,w=map.width-160;ctx.save();ctx.fillStyle=PAPER_HI;pill(ctx,x,y-82,w,100,9);ctx.fill();ctx.strokeStyle=this.foil(ctx,x,y-90,x+w,y+25);ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='rgba(120,87,39,.28)';ctx.lineWidth=.8;pill(ctx,x+9,y-73,w-18,81,4);ctx.stroke();ctx.textAlign='center';ctx.fillStyle=INK;ctx.font='700 25px Pretendard Variable,sans-serif';ctx.fillText('결승',map.width/2,y-38);ctx.font='500 11px Pretendard Variable,sans-serif';ctx.fillStyle='#8a7760';ctx.fillText('어른뭉방구  ·  당첨을 확인하는 곳',map.width/2,y-12);ctx.strokeStyle=this.foil(ctx,x,y-75,x+w,y);ctx.fillStyle=this.theme.primary;ctx.lineWidth=1.3;this.brandMark(ctx,x+50,y-30,22);this.brandMark(ctx,x+w-50,y-30,22);ctx.strokeStyle='rgba(170,137,82,.55)';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(x+24,y+32);ctx.lineTo(x+w-24,y+32);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
    drawMarble(m, total, leader, visible, time, dt, idle) {
      const ctx = this.ctx, color = Pinball.group(m.name).color, r = m.r || 16;
      if (m.y + r * 6 < visible.top || m.y - r * 6 > visible.bottom) return;
      ctx.drawImage(this.marbleSprite(color, r * 5.12 * (this.currentZoom || 1) * (this.dpr || 1)), m.x - r * 2.56, m.y - r * 2.56, r * 5.12, r * 5.12);
      Pinball.mark(ctx,m.name,m.x,m.y,r,this.currentZoom||1);
      const isLeader = leader && leader.id === m.id;
      if (isLeader) { ctx.strokeStyle = this.foil(ctx,m.x-r*2,m.y-r*2,m.x+r*2,m.y+r*2); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(m.x, m.y, r * 1.7, 0, TAU); ctx.stroke(); }
    }
    nameSprite(m, leader) {
      const ctx = this.ctx, font = leader ? 12 : 10;
      let name = m.name || 'PLAYER'; if (name.length > 14) name = name.slice(0, 13) + '…';
      const key = `${leader ? 'leader' : 'name'}:${m.name}:${Pinball.group(m.name).color}`; let label = this.nameSprites.get(key);
      if (!label) {
        ctx.save(); ctx.font = `${leader ? 700 : 500} ${font}px Pretendard Variable,sans-serif`; const width = Math.ceil(ctx.measureText(name).width + (leader ? 34 : 16)), height = leader ? 25 : 20; ctx.restore();
        const sprite = makeCanvas(width * 2 + 4, height * 2 + 4), c = sprite.getContext('2d'); c.scale(2, 2); c.translate(1, 1);
        c.fillStyle = leader ? '#fbf3dc' : 'rgba(251,247,239,.93)'; pill(c, 0, 0, width, height, height / 2); c.fill(); c.strokeStyle = leader ? '#be9d60' : 'rgba(133,108,69,.34)'; c.lineWidth = .8; c.stroke(); c.strokeStyle=Pinball.group(m.name).color;c.lineWidth=2;c.beginPath();c.moveTo(width*.3,height-2);c.lineTo(width*.7,height-2);c.stroke();
        c.font = `${leader ? 700 : 500} ${font}px Pretendard Variable,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK; c.fillText(name, width / 2 + (leader ? 8 : 0), height / 2 + .5);
        if (leader) { c.strokeStyle='#a87d37';c.lineWidth=1;sun(c,15,height/2,7,10); }
        label = { sprite, width: width + 2, height: height + 2 }; if (this.nameSprites.size >= 550) this.nameSprites.delete(this.nameSprites.keys().next().value); this.nameSprites.set(key, label);
      }
      return label;
    }
    planLabels(marbles, leader, camera, area) {
      const active = marbles.filter(m => !m.finished);
      const limit = marbles.length <= 12 ? 12 : marbles.length <= 50 ? 7 : marbles.length <= 200 ? 3 : 1;
      const visible = active.map(m => ({ marble: m, point: camera.worldToScreen(m.x, m.y), radius: (m.r || 12) * camera.zoom }))
        .filter(item => item.point.x >= area.x && item.point.x <= area.x + area.w && item.point.y >= area.y && item.point.y <= area.y + area.h);
      const candidates = visible.slice().sort((a, b) => (b.marble.id === (leader && leader.id)) - (a.marble.id === (leader && leader.id)) || b.marble.y - a.marble.y).slice(0, limit);
      const placements = [];
      for (const item of candidates) {
        const isLeader = !!leader && item.marble.id === leader.id, label = this.nameSprite(item.marble, isLeader);
        const w = label.width, h = label.height, x = item.point.x, y = item.point.y, r = item.radius;
        const positions = [
          { x: x - w / 2, y: y - r - h - 6 }, { x: x + r + 6, y: y - h / 2 },
          { x: x - r - w - 6, y: y - h / 2 }, { x: x - w / 2, y: y + r + 6 }
        ];
        let best = null, score = Infinity;
        for (const box of positions) {
          if (box.x < area.x + 3 || box.y < area.y + 3 || box.x + w > area.x + area.w - 3 || box.y + h > area.y + area.h - 3) continue;
          let overlap = 0;
          for (const other of visible) {
            if (other === item) continue;
            const px = clamp(other.point.x, box.x, box.x + w), py = clamp(other.point.y, box.y, box.y + h);
            if (Math.hypot(other.point.x - px, other.point.y - py) < other.radius + 2) overlap++;
          }
          for (const placed of placements) if (box.x < placed.x + placed.label.width + 4 && box.x + w + 4 > placed.x && box.y < placed.y + placed.label.height + 4 && box.y + h + 4 > placed.y) overlap += 3;
          if (overlap < score) { best = box; score = overlap; }
          if (score === 0) break;
        }
        if (best && (score === 0 || isLeader)) placements.push({ marble: item.marble, label, x: best.x, y: best.y });
      }
      return placements;
    }
    drawLabels(marbles, leader, camera, area) {
      const ctx = this.ctx, placements = this.planLabels(marbles, leader, camera, area);
      ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
      for (const item of (this.quality === 'low' && marbles.length > 12 ? placements.slice(0, 1) : placements)) ctx.drawImage(item.label.sprite, item.x, item.y, item.label.width, item.label.height);
      ctx.restore();
    }
    finishDisplay(finished, map) {
      const recent = finished.slice(-12), start = finished.length - recent.length;
      return recent.map((marble, index) => ({ marble, rank: start + index + 1,
        x: 145 + ((start + index) % 6) * 142,
        y: map.finish.y + 65 + (Math.floor(((start + index) % 12) / 6) * 72) }));
    }
    drawFinishers(physics, map, visible) {
      const finished = physics.finished || [], y = map.finish.y;
      if (!finished.length || y > visible.bottom + 20 || y + 190 < visible.top) return;
      const ctx = this.ctx;
      for (const entry of this.finishDisplay(finished, map)) {
        const color = Pinball.group(entry.marble.name).color, r = 10;
        ctx.drawImage(this.marbleSprite(color, r * 5.12 * (this.currentZoom || 1) * (this.dpr || 1)), entry.x - r * 2.56, entry.y - r * 2.56, r * 5.12, r * 5.12);
        Pinball.mark(ctx,entry.marble.name,entry.x,entry.y,r,this.currentZoom||1);
      }
      ctx.save(); ctx.textAlign = 'center'; ctx.font = '600 12px Pretendard Variable,sans-serif'; ctx.fillStyle = '#765633';
      ctx.fillText('완주 ' + finished.length + ' / ' + physics.marbles.length, map.width / 2, y + 185); ctx.restore();
    }
    drawEffects(effects,visible){if(!effects)return;const ctx=this.ctx;ctx.save();if(effects.lead&&Number.isFinite(effects.lead.x)&&!this.reducedMotion){const lead=effects.lead;ctx.globalAlpha=Math.min(.55,lead.life*.4);ctx.drawImage(this.glow(lead.color||this.theme.primary),lead.x-110,lead.y-110,220,220);}
      for(const ring of effects.rings){if(ring.y<visible.top-ring.radius||ring.y>visible.bottom+ring.radius)continue;ctx.strokeStyle=ring.color;ctx.globalAlpha=ring.life/ring.duration*.6;ctx.lineWidth=1+ring.life/ring.duration;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.radius,0,TAU);ctx.stroke();}
      for(const p of effects.particles){if(p.y<visible.top-20||p.y>visible.bottom+20)continue;ctx.globalAlpha=Math.min(1,p.life/Math.min(.4,p.duration))*.85;ctx.fillStyle=p.color;ctx.strokeStyle=p.color;
        if(p.type==='ice'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle='#b4bcc1';ctx.beginPath();ctx.moveTo(0,-p.r);ctx.lineTo(p.r*.55,0);ctx.lineTo(0,p.r);ctx.lineTo(-p.r*.55,0);ctx.closePath();ctx.fill();ctx.restore();}
        else if(p.type==='confetti'||p.type==='gold'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillRect(-p.r,-p.r/3,p.r*2,p.r*.7);ctx.fillStyle='rgba(255,250,225,.65)';ctx.fillRect(-p.r,-p.r/3,p.r*2,p.r*.18);ctx.restore();}else sparkle(ctx,p.x,p.y,p.r*1.4);
      }ctx.restore();}
    drawWinner(winner,total,camera,dt,time){if(this.lastWinner!==winner.id){this.winProgress=0;this.lastWinner=winner.id;}this.winProgress=Math.min(1,this.winProgress+dt*1.15);const ease=1-Math.pow(1-this.winProgress,3),pos=camera.worldToScreen(winner.x,winner.y),area=camera.viewport||{x:0,y:0,w:this.width,h:this.height},cx=area.x+area.w/2,cy=area.y+area.h*.4;
      const ctx=this.ctx,color=Pinball.group(winner.name).color,x=pos.x+(cx-pos.x)*ease,y=pos.y+(cy-pos.y)*ease,r=(winner.r||16)*camera.zoom+52*ease;ctx.save();ctx.globalAlpha=ease*.9;const g=ctx.createRadialGradient(cx,cy,50,cx,cy,Math.max(area.w,area.h)*.7);g.addColorStop(0,PAPER_HI);g.addColorStop(.6,'rgba(251,247,239,.95)');g.addColorStop(1,'rgba(244,237,224,0)');ctx.fillStyle=g;ctx.fillRect(area.x,area.y,area.w,area.h);ctx.globalAlpha=ease;
      ctx.strokeStyle=this.foil(ctx,cx-140,cy-170,cx+140,cy+170);ctx.lineWidth=1.4;sun(ctx,cx,cy,r*2.2,32);ctx.beginPath();ctx.arc(cx,cy,r*1.66,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(172,135,75,.24)';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(cx,cy,r*1.85,0,TAU);ctx.stroke();ctx.globalAlpha=1;ctx.drawImage(this.marbleSprite(color, r * 5.12 * (this.dpr || 1)),x-r*2.56,y-r*2.56,r*5.12,r*5.12);Pinball.mark(ctx,winner.name,x,y,r);ctx.globalAlpha=ease;ctx.fillStyle='#9a7434';ctx.textAlign='center';ctx.font='600 11px Pretendard Variable,sans-serif';ctx.fillStyle=INK;ctx.font='700 19px Pretendard Variable,sans-serif';
      ctx.font='700 34px Pretendard Variable,sans-serif';ctx.fillText((winner.name||'당첨자').slice(0,22),cx,cy+157);ctx.font='500 12px Pretendard Variable,sans-serif';ctx.fillStyle='#8a7760';ctx.fillText('축하드립니다!',cx,cy+186);ctx.strokeStyle=this.foil(ctx,cx-90,cy+211,cx+90,cy+211);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-110,cy+212);ctx.lineTo(cx-18,cy+212);ctx.moveTo(cx+18,cy+212);ctx.lineTo(cx+110,cy+212);ctx.stroke();ctx.fillStyle=this.theme.primary;sparkle(ctx,cx,cy+212,6);ctx.restore();}
    render(state) {
      // Chrome can change DPR on zoom/display changes without changing CSS size.
      if(this.canvas&&this.width&&this.height&&typeof devicePixelRatio==='number'&&
          Math.abs(this.dpr-P.renderDensity(this.width,this.height,devicePixelRatio)*(this.renderScale||1))>.001)this.resize();
      const { physics, map, camera, effects, time = 0, dt = 1 / 60, status, leader, winner, photoFinish } = state; if (!map || !physics || !camera) return;
      const ctx = this.ctx, marbles = physics.marbles || []; Pinball.configureGroups(marbles);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.drawBackground(camera, time);
      const area = camera.viewport || { x: 0, y: 0, w: this.width, h: this.height }, scale = camera.zoom || 1; this.currentZoom = scale;
      const shake = !this.reducedMotion && effects ? effects.shake : 0, sx = Math.sin(time * 93) * shake * 2, sy = Math.cos(time * 107) * shake * 1.4;
      ctx.save(); ctx.translate(area.x + area.w / 2 + sx, area.y + area.h / 2 + sy); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
      const visible = { top: camera.y - this.height / (2 * scale) - 100, bottom: camera.y + this.height / (2 * scale) + 100 };
      this.drawBoard(map, time, visible); this.drawPortalGuides(map, visible); for (const o of map.obstacles || []) this.drawObstacle(o, physics, effects, time, visible); this.drawFinish(map, time, visible);
      this.drawEffects(effects, visible);
      if (leader && effects && effects.lead && !this.reducedMotion) { const remaining = effects.lead.life || effects.lead.time || 0; ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(.45, remaining * .4); ctx.drawImage(this.glow(this.theme.primary), leader.x - 110, leader.y - 110, 220, 220); ctx.restore(); }
      if (!state.hideMarbles) {
        for (const m of marbles) if (!m.finished) this.drawMarble(m, marbles.length, leader, visible, time, dt, status === 'idle');
        this.drawFinishers(physics, map, visible);
      }
      ctx.restore();
      if(!this.surface){ctx.drawImage(this.vignette,0,0,this.width,this.height);ctx.save();ctx.globalAlpha=.26;ctx.fillStyle=this.paperPattern;ctx.fillRect(0,0,this.width,this.height);ctx.restore();}
      if(photoFinish){ctx.save();ctx.textAlign='center';ctx.font='600 10px Pretendard Variable,sans-serif';ctx.fillStyle='#8f6834';ctx.fillText('아주 가까운 승부  ·  마지막 순간을 천천히',area.x+area.w/2,area.y+35);ctx.restore();}
      if(!this.reducedMotion&&effects&&effects.flash>.01){ctx.save();ctx.globalAlpha=effects.flash*.06;ctx.fillStyle='#fff6dc';ctx.fillRect(0,0,this.width,this.height);ctx.restore();}
      if (!state.hideMarbles && status !== 'finished') this.drawLabels(marbles, leader, camera, area);
      if (status === 'finished' && winner) this.drawWinner(winner, marbles.length, camera, dt, time); else { this.winProgress = 0; this.lastWinner = null; }
    }
    cinemaBoard(physics, bottom) {
      const map = physics.map, image = makeCanvas(map.width, Math.ceil(bottom)), ctx = image.getContext('2d'), original = this.ctx;
      try {
        this.ctx = ctx; const visible = { top: 0, bottom };
        this.drawBoard(map, 0, visible);
        this.drawPortalGuides(map, visible);
        for (const obstacle of map.obstacles || []) this.drawObstacle(obstacle, physics, null, 0, visible);
        this.drawFinish(map, 0, visible);
      } finally { this.ctx = original; }
      return image;
    }
    drawMinimap(canvas, physics, camera) {
      if (!canvas || !physics || !physics.map) return;
      const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height, density = P.renderDensity(w,h,typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
      const backingW=Math.round(w*density),backingH=Math.round(h*density);
      if(canvas.width!==backingW||canvas.height!==backingH){canvas.width=backingW;canvas.height=backingH;}
      const map = physics.map, ctx = canvas.getContext('2d'), pad = 8, sx = (w - pad * 2) / map.width, sy = (h - pad * 2) / map.height, t = this.theme;
      ctx.setTransform(density,0,0,density,0,0);ctx.imageSmoothingQuality='high';
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = PAPER_HI; pill(ctx, 0, 0, w, h, 12); ctx.fill(); ctx.save(); ctx.translate(pad, pad); ctx.scale(sx, sy);
      for (const route of this.portalPairs(map)) { ctx.strokeStyle='rgba(124,86,37,.6)';ctx.lineWidth=14;ctx.setLineDash([16,30]);ctx.beginPath();ctx.moveTo(route.x,route.y);ctx.lineTo(route.targetX,route.targetY);ctx.stroke();ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(164,132,78,.4)'; for (const o of map.obstacles || []) { if(o.type==='wind'){ctx.fillStyle='rgba(55,155,148,.4)';ctx.fillRect(o.x-o.width/2,o.y-o.height,o.width,o.height);} else if (o.channelWall || o.type === 'polygon') { ctx.beginPath(); o.points.forEach((point,index) => index ? ctx.lineTo(point.x,point.y) : ctx.moveTo(point.x,point.y)); ctx.closePath(); ctx.fillStyle=this.mapStyle?rgba(this.mapStyle.accent,.35):'rgba(119,93,58,.28)'; ctx.fill(); } else if (o.type === 'pin' || o.type === 'bumper') { ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(o.r || 10, 15), 0, TAU); ctx.fill(); } else if (o.type === 'segment' || o.type === 'rotor' || o.type === 'moving') { const p = physics.getObstaclePose(o); ctx.strokeStyle = this.mapStyle?rgba(this.mapStyle.accent,.75):'rgba(139,109,64,.45)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); } }
      const active = (physics.marbles || []).filter(m => !m.finished), leader = P.raceStanding(active.slice().sort((a,b) => b.y - a.y)).leader;
      ctx.fillStyle = 'rgba(103,75,43,.48)'; for (const m of active) { ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(m.r || 16, 22), 0, TAU); ctx.fill(); }
      if (leader) { ctx.fillStyle='#A65436';ctx.beginPath();ctx.arc(leader.x,leader.y,52,0,TAU);ctx.fill(); }
      ctx.strokeStyle = '#b98e49'; ctx.lineWidth = 12; const fy = map.finish && map.finish.y || map.height - 100; ctx.beginPath(); ctx.moveTo(60, fy); ctx.lineTo(map.width - 60, fy); ctx.stroke(); ctx.restore();
      const area = camera.viewport || { w: this.width, h: this.height }, vw = Math.min(w - 2 * pad, area.w / camera.zoom * sx), vh = Math.min(h - 2 * pad, area.h / camera.zoom * sy), x = clamp(pad + camera.x * sx - vw / 2, pad, w - pad - vw), y = clamp(pad + camera.y * sy - vh / 2, pad, h - pad - vh);
      ctx.fillStyle = 'rgba(182,140,71,.13)'; ctx.fillRect(x, y, vw, vh); ctx.strokeStyle = '#b68c47'; ctx.lineWidth = 1; ctx.strokeRect(x, y, vw, vh);
    }
  }
  Renderer.marbleColor = marbleColor; P.marbleColor = marbleColor; P.Renderer = Renderer;
})(window.CosmicPinball = window.CosmicPinball || {});
