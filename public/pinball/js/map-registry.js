(function (P) {
  'use strict';
  // Presentation and policy live outside classic's replay-signed geometry.
  P.MAP_INFO = { classic: { name: '연못 정원', description: '핀과 회전 장애물이 있는 기본 코스', accent: '#9B773F', skills: true, recovery: true } };
  P.MAP_STYLES = { classic:{id:'classic',accent:'#638F82',motif:'pond',background:['#ABCABE','#DDEADD','#A4C6BC'],board:'#EDF5E9',ink:'#739687'} };
  P.resolveMapId = function (id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(P.MAPS, id) ? id : 'classic'; };
  P.mapInfo = function (id) { return P.MAP_INFO[P.resolveMapId(id)] || P.MAP_INFO.classic; };
  // Keep display names outside replay-signed map data so saved starts remain valid.
  P.MAP_NAMES = { classic: '연못 정원', twinfold: '바람 도서관', cascade: '빗살 협곡', rhythm: '태엽 공장' };
  P.registerMap = function (map, info) {
    if (!map.id || P.MAPS[map.id]) throw new Error('Duplicate or missing map ID');
    P.MAPS[map.id] = map;
    P.MAP_INFO[map.id] = Object.assign({ skills: false, recovery: false }, info, { name: P.MAP_NAMES[map.id] || info.name });
  };
})(window.CosmicPinball);
