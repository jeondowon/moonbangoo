(function(P){
  'use strict';
  var map={id:'cascade',version:7,name:'빗살 낙하',width:1000,height:11200,spawn:{x:36,y:50,width:928,height:700},finish:{y:11000},obstacles:[]};
  function rail(id,x1,y1,x2,y2,role){map.obstacles.push({type:'segment',id:'cascade-'+id,x1:x1,y1:y1,x2:x2,y2:y2,thickness:8,role:role||'guide'});}
  // Each pair covers the full horizontal projection, even while every comb is
  // retracted. A falling marble must change direction rather than use a shaft.
  var catchDrop=660*Math.tan(.32); // Slightly steeper exits reduce small-group dwell time.
  [880,2320,3870,5420,6970,8520,10070].forEach(function(y,row){
    rail('catch-'+row+'-left',-40,y,620,y+catchDrop,'catch-shelf');
    rail('catch-'+row+'-right',380,y+360+catchDrop,1040,y+360,'catch-shelf');
  });
  [500,165,835].forEach(function(x,i){map.obstacles.push({type:'pin',id:'cascade-detail-final-'+i,x:x,y:10800,r:14});});
  [2680,4230,5780,7330,8880,10430].forEach(function(y,row){[420,580].forEach(function(x,col){map.obstacles.push({type:'pin',id:'cascade-detail-'+row+'-'+col,x:x,y:y,r:14});});});
  // Each comb is a rigid assembly of existing moving colliders. Teeth face
  // downstream: no upward-facing pockets. Both sides withdraw outside the board.
  [1700,3250,4800,6350,7900,9450].forEach(function(y,row){
    [-1,1].forEach(function(side){
      var angle=side===-1?.36:-.36,phase=row*Math.PI/3+(side===1?Math.PI:0);
      var rootX=side===-1?-210:1210,rootY=y+(side===1?300:0),assembly='cascade-comb-'+row+'-'+side;
      function member(part,x,yy,length,a,thickness,role){map.obstacles.push({type:'moving',id:assembly+'-'+part,assembly:assembly,stage:row,side:side,role:role,
        x:x,y:yy,length:length,angle:a,thickness:thickness,axis:'x',amplitude:480,speed:Math.PI/2,phase:phase});}
      member('spine',rootX,rootY,600,angle,10,'comb-spine');
      for(var tooth=0;tooth<21;tooth++){
        var along=-240+tooth*24,normal=22;
        member('tooth-'+tooth,rootX+Math.cos(angle)*along-Math.sin(angle)*normal,
          rootY+Math.sin(angle)*along+Math.cos(angle)*normal,44,angle+Math.PI/2,8,'comb-tooth');
      }
    });
  });
  // Short rock ledges break up the open descent between combs. Alternate a
  // free-standing outcrop with a ledge rooted through the left canyon wall.
  // Gentle drift prevents a fixed balance point; existing shelf/comb gaps stay open.
  [2200,3750,5300,6850,8400,9950].forEach(function(y,row){
    map.obstacles.push({type:'moving',id:'cascade-rock-outcrop-'+row,role:'rock-ledge',
      x:250,y:y,length:110,angle:-.3,thickness:12,axis:'x',amplitude:8,speed:.8,phase:row*1.7});
    if(row<5)map.obstacles.push({type:'moving',id:'cascade-rock-wall-'+row,role:'rock-ledge',
      x:120,y:y+770,length:320,angle:.22,thickness:12,axis:'x',amplitude:8,speed:.8,phase:row*1.7+1});
  });
  P.registerMap(map,{name:map.name,description:'엇갈린 빗살이 열리고 닫히는 낙하 코스',accent:'#A76546'});
})(window.CosmicPinball);
