(function (global) {
  'use strict';
  var P = global.CosmicPinball = global.CosmicPinball || {};
  // The inner rail is the playable boundary, shared by drawing and collisions.
  P.boardBounds = function (map) {
    return { left: 36, right: map.width - 36, top: 14, bottom: map.height - 32, radius: 16 };
  };
  P.boostShape = function (field) {
    var width = field.width || 90, height = field.height || 120;
    return { width: width, height: height, radius: Math.min(14, width / 2, height / 2),
      angle: Math.atan2(field.dy == null ? 1 : field.dy, field.dx || 0) - Math.PI / 2 };
  };
  P.MAPS = {
    classic: {
      id: 'classic', name: '자개 핀 보드', subtitle: 'CLASSIC PEARL BOARD',
      width: 1000, height: 11200,
      spawn: { x: 12, y: 50, width: 976, height: 680 },
      finish: { y: 11000 }, obstacles: []
    }
  };

  // Maps are ordinary data: renderer, collision solver and minimap share these shapes.
  var classic = P.MAPS.classic.obstacles;
  for (var row = 0; row < 10; row++) {
    for (var col = 0; col < 9; col++) {
      var x = 80 + col * 105 + (row % 2 ? 48 : 0);
      if (x > 950) continue;
      classic.push({ type: 'pin', id: 'star-pin-' + row + '-' + col, x: x, y: 790 + row * 218, r: row % 3 === 0 ? 11 : 9 });
    }
  }
  [
    { x: 290, y: 1120 }, { x: 710, y: 1340 }, { x: 500, y: 1560 },
    { x: 245, y: 1990 }, { x: 755, y: 2210 }, { x: 500, y: 2650 }
  ].forEach(function (point, index) {
    classic.push({ type: 'bumper', id: 'star-bumper-' + index, x: point.x, y: point.y, r: 38, power: 110 });
  });
  classic.push(
    { type: 'segment', id: 'star-ramp-l', x1: 0, y1: 1790, x2: 150, y2: 1880, thickness: 7 },
    { type: 'segment', id: 'star-ramp-r', x1: 1000, y1: 2410, x2: 850, y2: 2500, thickness: 7 }
  );

  // Repeat the classic board in three sections without changing its geometry.
  (function () {
    var map = P.MAPS.classic;
    var bounds = P.boardBounds(map);
    map.spawn.x = bounds.left;
    map.spawn.width = bounds.right - bounds.left;
    // 500 of the largest marbles still fit above the first obstacle after insetting the walls.
    map.spawn.height = 700;
    var firstSection = map.obstacles.slice();
    for (var section = 1; section < 3; section++) {
      firstSection.forEach(function (obstacle) {
        var copy = JSON.parse(JSON.stringify(obstacle));
        copy.id += '-section-' + (section + 1);
        var offset = section * 2000;
        ['y', 'y1', 'y2', 'targetY'].forEach(function (field) {
          if (typeof copy[field] === 'number') copy[field] += offset;
        });
        if (copy.points) copy.points.forEach(function (point) { point.y += offset; });
        map.obstacles.push(copy);
      });
    }
  })();
  // Width and center vary together so the course itself becomes a winding chute.
  var map = P.MAPS.classic;
  map.channel = [
    { y: 2700, center: 500, width: 928 },
    { y: 3000, center: 600, width: 480 },
    { y: 3400, center: 380, width: 350 },
    { y: 3800, center: 630, width: 320 },
    { y: 4200, center: 370, width: 360 },
    { y: 4600, center: 590, width: 420 },
    { y: 5000, center: 500, width: 928 }
  ];
  P.courseBounds = function (map, y) {
    var rail = P.boardBounds(map), nodes = map.channel || [];
    for (var i = 1; i < nodes.length; i++) {
      var a = nodes[i-1], b = nodes[i];
      if (y < a.y || y > b.y) continue;
      var t = (y-a.y)/(b.y-a.y), center = a.center+(b.center-a.center)*t, width = a.width+(b.width-a.width)*t;
      return { left: center-width/2, right: center+width/2 };
    }
    return { left: rail.left, right: rail.right };
  };
  // Clear obstacles from the chute to leave room for large groups and turns.
  map.obstacles = classic = classic.filter(function (o) {
    var top = o.y === undefined ? Math.min(o.y1,o.y2) : o.y-(o.r||0);
    var bottom = o.y === undefined ? Math.max(o.y1,o.y2) : o.y+(o.r||0);
    return bottom < 2700 || top > 5000;
  });
  var left = map.channel.map(function (n) { return {x:n.center-n.width/2,y:n.y}; });
  var right = map.channel.map(function (n) { return {x:n.center+n.width/2,y:n.y}; });
  // Filled collision polygons close the side regions; there is no bypass behind a rail.
  classic.push({type:'polygon',id:'channel-left',channelWall:true,points:left.concat([{x:36,y:5000},{x:36,y:2700}])},
    {type:'polygon',id:'channel-right',channelWall:true,points:right.concat([{x:964,y:5000},{x:964,y:2700}])});
  // Shared physical obstacles: timing and contact, rather than rank, decide the route.
  [1850, 3350, 4850, 6400].forEach(function (y, section) {
    [260, 740].forEach(function (x, side) {
      var channel = P.courseBounds(map, y + side * 130);
      var inChannel = y >= 2700 && y <= 5000;
      if (inChannel) x = channel.left + (channel.right-channel.left)*(side ? .7 : .3);
      classic.push({ type: 'rotor', id: 'race-rotor-' + section + '-' + side,
        x: x, y: y + side * 130, length: inChannel ? 110 : 350, thickness: 9,
        angle: (section + side) * .75, speed: (side ? -1 : 1) * (1.3 + section * .15) });
    });
  });
  // A longer final act mixes sweeping gates, pins and counter-rotating paddles.
  for (var row = 0; row < 10; row++) {
    for (var col = 0; col < 8; col++) {
      var x = 110 + col * 110 + (row % 2 ? 40 : 0);
      classic.push({type:'pin',id:'extension-pin-'+row+'-'+col,x:x,y:7300+row*350,r:10});
    }
  }
  [7600, 8450, 9300, 10150].forEach(function (y, index) {
    classic.push({type:'moving',id:'sweep-gate-'+index,x:index%2?680:320,y:y,
      axis:'x',amplitude:110,length:310,thickness:8,angle:index%2?-.3:.3,speed:.85+index*.12,phase:index*1.7});
    classic.push({type:'bumper',id:'extension-bumper-'+index,x:index%2?290:710,y:y+230,r:32,power:100});
  });
  [8100, 9750, 10580].forEach(function (y, index) {
    [270,730].forEach(function (x, side) {
      classic.push({type:'rotor',id:'final-rotor-'+index+'-'+side,x:x,y:y+side*130,
        length:320,thickness:8,angle:index*.6,speed:side?-1.2:1.2});
    });
  });

  classic.push({type:'bumper',id:'final-bumper',x:500,y:10740,r:30,power:90},
    {type:'pin',id:'final-pin-left',x:270,y:10700,r:12},
    {type:'pin',id:'final-pin-right',x:730,y:10700,r:12});
  // Two slow reed paddles add physical timing interactions to the pond approach.
  [330,670].forEach(function(x,side){classic.push({type:'moving',id:'classic-detail-reed-'+side,x:x,y:8875,axis:'x',length:120,thickness:8,angle:(side?-1:1)*Math.PI/6,amplitude:40,speed:.8,phase:side*Math.PI});});
  P.MAPS.classic.version=2;
  // Passive collision studs: no boost, identity logic or recovery force.
  [[165,1540],[835,1540],[165,2660],[835,2660],[835,4900],[165,5740],[835,5740],[165,6860],[835,6860],[165,7140],[835,7140],[165,7420],[835,7420],[165,8540],[835,8540]].forEach(function(p,i){classic.push({type:'pin',id:'classic-detail-'+i,x:p[0],y:p[1],r:12});});
})(window);
