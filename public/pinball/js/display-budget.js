(function(P){
  'use strict';
  // Presentation only. Cadence-relative jitter also supports native 30/120Hz.
  class DisplayBudget {
    constructor(){this.samples=new Float32Array(90);this.count=0;this.scale=1;this.good=0;}
    sample(dt){
      if(!Number.isFinite(dt)||dt<=0||dt>.12)return this.scale;
      this.samples[this.count++]=dt;
      if(this.count<this.samples.length)return this.scale;
      this.count=0;
      const ordered=Array.from(this.samples).sort((a,b)=>a-b),cadence=Math.max(1/144,ordered[9]);
      const late=ordered.filter(t=>t>cadence*1.45).length/ordered.length;
      if(late>.18||cadence>1/23.5){this.scale=Math.max(.65,this.scale*.85);this.good=0;}
      else if(late<.04){if(++this.good>=6){this.scale=Math.min(1,this.scale+.08);this.good=0;}}
      else this.good=0;
      return this.scale;
    }
    resetTiming(){this.count=0;this.good=0;}
  }
  P.DisplayBudget=DisplayBudget;
})(window.CosmicPinball=window.CosmicPinball||{});
