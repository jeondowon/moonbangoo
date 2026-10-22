(function (P) {
  'use strict';
  // Existing IDs remain stable for saved games. Every visible skin follows the stationery brand.
  P.CONFIG = {
    background: ['#F4EDE0', '#FBF7EF', '#E6D9C2'],
    neon: ['#C29A55', '#7A5520', '#B48775', '#8C9678', '#79969B', '#9B879D'],
    physicsStep: 1 / 120, maxDpr: 4,
    particles: { high: 900, medium: 420, low: 140 },
    minZoom: .16, maxZoom: 2.8, lowFpsThreshold: 45
  };
  P.renderDensity = function (width, height, pixelRatio) {
    const native = Math.max(1, Number(pixelRatio) || 1);
    return Math.min(native, P.CONFIG.maxDpr, Math.sqrt(12000000 / Math.max(1, width * height)));
  };
  P.THEMES = {
    cosmic: {
      id: 'cosmic', name: '문방구 종이', subtitle: '따뜻한 종이 위에 모이는 작은 행운',
      background: P.CONFIG.background.slice(), accents: P.CONFIG.neon.slice(),
      primary: '#9B773F', secondary: '#C29A55', text: '#4A3A28', panel: '#FBF7EF',
      particle: 'spark', material: 'ivory', marble: { saturation: 42, lightness: 54, hueOffset: 22 },
      sound: { waveform: 'sine', collision: 390, brightness: .7, decay: .2 },
      ui: { primary: '#9B773F', secondary: '#C29A55', bg: '#F4EDE0', panel: '#FBF7EF' }
    },
    candy: {
      id: 'candy', name: '홀로그램', subtitle: '빛의 각도마다 달라지는 진주빛 문방구',
      background: ['#F3EEE9', '#FAF7F0', '#E6E0E9'],
      accents: ['#BA91A7', '#CEB38C', '#A2BFA4', '#8BAABB', '#A095BC', '#C49385'],
      primary: '#9A7E99', secondary: '#789D99', text: '#51414D', panel: '#FAF7F2',
      particle: 'confetti', material: 'rainbow', marble: { saturation: 45, lightness: 63, hueOffset: 318 },
      sound: { waveform: 'triangle', collision: 440, brightness: .85, decay: .19 },
      ui: { primary: '#9A7E99', secondary: '#789D99', bg: '#F3EEE9', panel: '#FAF7F2' }
    },
    gold: {
      id: 'gold', name: '금박', subtitle: '갈색 종이 위에 조용히 반짝이는 금박',
      background: ['#211A13', '#33291F', '#18130F'],
      accents: ['#D9B872', '#C29A55', '#E8D4A4', '#B4884D', '#9FAF9F', '#BB8C77'],
      primary: '#D9B872', secondary: '#C29A55', text: '#F4EDE0', panel: '#332A20',
      particle: 'gold', material: 'gold', marble: { saturation: 41, lightness: 63, hueOffset: 36 },
      sound: { waveform: 'sine', collision: 460, brightness: .65, decay: .34 },
      ui: { primary: '#D9B872', secondary: '#C29A55', bg: '#211A13', panel: '#332A20' }
    },
    ice: {
      id: 'ice', name: '은박', subtitle: '차분한 펄 종이에 새긴 은빛 반짝임',
      background: ['#E9E9E4', '#F8F7F1', '#D8DEE0'],
      accents: ['#87969E', '#B6C1C4', '#D8D9CF', '#A1ABB8', '#879B91', '#AF9BAA'],
      primary: '#74868F', secondary: '#9BA7B0', text: '#3F484C', panel: '#F8F7F1',
      particle: 'ice', material: 'silver', marble: { saturation: 28, lightness: 61, hueOffset: 190 },
      sound: { waveform: 'sine', collision: 600, brightness: 1.05, decay: .38 },
      ui: { primary: '#74868F', secondary: '#9BA7B0', bg: '#E9E9E4', panel: '#F8F7F1' }
    }
  };
})(window.CosmicPinball = window.CosmicPinball || {});
