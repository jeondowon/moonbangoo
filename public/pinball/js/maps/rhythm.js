(function(P){
  'use strict';
  var map={id:'rhythm',version:5,name:'박자 분배기',width:1000,height:11200,spawn:{x:36,y:50,width:928,height:700},finish:{y:11000},obstacles:[]};
  function rail(id,a,b,role,assembly){map.obstacles.push({type:'segment',id:'rhythm-'+id,x1:a.x,y1:a.y,x2:b.x,y2:b.y,thickness:8,role:role,assembly:assembly});}
  // Four open clock chambers, each with a rotating six-spoke distributor.
  // Side arcs have real top/bottom openings, not a closed decorative enclosure.
  [1700,4500,7300,10100].forEach(function(y,row){
    [-1,1].forEach(function(side){var curve=[[-40,-800],[60,-790],[200,-750],[330,-680],[400,-620],[444,-580],[444,-470],[444,-365]];
      for(var c=0;c<curve.length-1;c++){var a=curve[c],b=curve[c+1];rail('funnel-'+row+'-'+side+'-'+c,
        {x:side===-1?a[0]:1000-a[0],y:y+a[1]},{x:side===-1?b[0]:1000-b[0],y:y+b[1]},'clock-funnel','rhythm-funnel-'+row+'-'+side);}
    });
    map.obstacles.push({type:'moving',id:'rhythm-detail-jewel-'+row,x:500,y:y+400,role:'clock-jewel',axis:'x',length:40,thickness:24,angle:.2,amplitude:38,speed:Math.PI*2/2.4,phase:row*Math.PI/3,beat:{period:2.4,step:0,stage:row}});
    [150,850].forEach(function(x,i){map.obstacles.push({type:'pin',id:'rhythm-detail-feed-'+row+'-'+i,x:x,y:y-350,r:12});});
    [-1,1].forEach(function(side){for(var i=0;i<12;i++){
      var start=(side===1?-Math.PI/3:Math.PI*2/3)+i*Math.PI/18,end=start+Math.PI/18;
      var a={x:500+340*Math.cos(start),y:y+340*Math.sin(start)},b={x:500+340*Math.cos(end),y:y+340*Math.sin(end)};
      map.obstacles.push({type:'moving',id:'rhythm-ring-'+row+'-'+side+'-'+i,role:'clock-ring',assembly:'rhythm-ring-'+row,
        x:(a.x+b.x)/2,y:(a.y+b.y)/2,length:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x),
        thickness:8,axis:'x',amplitude:12,speed:Math.PI*2/2.4,phase:row*Math.PI/3});
    }});
    for(var spoke=0;spoke<3;spoke++)map.obstacles.push({type:'rotor',id:'rhythm-drum-'+row+'-'+spoke,
      role:'clock-drum',assembly:'rhythm-drum-'+row,x:500,y:y,length:420,thickness:10,
      angle:spoke*Math.PI/3+row*Math.PI/8,speed:(row%2?-1:1)*Math.PI*2/(row%2?3.2:4.8),
      beat:{period:row%2?3.2:4.8,step:spoke,stage:row}});
    if(row===3)return;
    // Gently swaying forks divert the outside arrivals; the middle stays open.
    // Their tips move sideways too, so a marble cannot balance on a fixed apex.
    [330,670].forEach(function(x,i){map.obstacles.push({type:'moving',id:'rhythm-fork-'+row+'-'+i,role:'clock-fork',
      x:x,y:y+850,axis:'x',amplitude:26,length:250,thickness:8,angle:i?.9:-.9,speed:Math.PI*2/4.8,
      phase:row*Math.PI/3+i*Math.PI,beat:{period:4.8,step:i,stage:row}});});
    [200,500,800].forEach(function(x,i){map.obstacles.push({type:'moving',id:'rhythm-pad-'+row+'-'+i,role:'clock-pad',
      x:x,y:y+1350,axis:'y',amplitude:80,length:80,thickness:16,angle:i===0?.22:i===2?-.22:(row%2?-.18:.18),speed:Math.PI*2/2.4,
      phase:i*Math.PI*2/3+row*Math.PI/3,beat:{period:2.4,step:i,stage:row}});});
    [350,650].forEach(function(x,i){map.obstacles.push({type:'pin',id:'rhythm-detail-merge-'+row+'-'+i,x:x,y:y+1700,r:12});});
  });
  // Three buffer stations meter the flow between drums with real tilted pads.
  // These compact elevators fill the empty transfer bays without copying the
  // canyon's full-board shelves; all timing still comes from physical contacts.
  [3550,6350,9150].forEach(function(y,row){[225,500,775].forEach(function(x,i){
    map.obstacles.push({type:'moving',id:'rhythm-buffer-'+row+'-'+i,role:'clock-buffer',
      x:x,y:y,axis:'y',amplitude:20,length:140,thickness:12,angle:i===2?-.25:.25,
      speed:Math.PI*2/2.4,phase:i*Math.PI*2/3+row*Math.PI/3,
      beat:{period:2.4,step:i,stage:row}});
  });});
  [200,500,800].forEach(function(x,i){map.obstacles.push({type:'moving',id:'rhythm-finale-'+i,role:'clock-pad',
    x:x,y:10720,axis:'y',amplitude:60,length:80,thickness:16,angle:i===0?.22:i===2?-.22:.18,speed:Math.PI*2/2.4,
    phase:i*Math.PI*2/3,beat:{period:2.4,step:i,stage:3}});});
  [350,650].forEach(function(x,i){map.obstacles.push({type:'pin',id:'rhythm-detail-final-'+i,x:x,y:10900,r:12});});
  P.registerMap(map,{name:map.name,description:'회전 드럼과 세 갈래 타건 통로가 만나는 리듬 공장',accent:'#D4A25E'});
})(window.CosmicPinball);
