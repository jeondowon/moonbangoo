// 승인한 시안의 손을 세 자세로 구운 투명 아틀라스. 접촉 시점은 물리 ceiling 이벤트와 같다.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, PointsMaterial,
  Sprite, SpriteMaterial, SRGBColorSpace, TextureLoader, Vector3, type Camera,
} from 'three';
import { HandMotion } from './handMotion';
import { CEILING_Y, COIN_R } from './physics';
import { pixelTexture, radialAlpha } from './scenery';

const ATLAS = new URL('./assets/divine-hand.png', import.meta.url).href;
const SIZE = 2.55;

export async function createDivineHand() {
  const atlas = await new TextureLoader().loadAsync(ATLAS);
  atlas.colorSpace = SRGBColorSpace;
  const group = new Group();
  const motion = new HandMotion();
  const poses = [0, 1, 2].map(i => {
    const map = atlas.clone();
    map.repeat.set(1 / 3, 1);
    map.offset.set(i / 3, 0);
    const sprite = new Sprite(new SpriteMaterial({
      map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
    }));
    // 접촉 자세의 중지 끝은 셀의 (0.30, 0.89). 모든 자세가 같은 손목 위치를 공유한다.
    sprite.center.set(0.30, 0.11);
    sprite.scale.set(SIZE, SIZE, 1);
    sprite.renderOrder = 20 + i;
    group.add(sprite);
    return sprite;
  });
  const glowMap = pixelTexture(64, 64, (x, y) => [255, 242, 195,
    radialAlpha(Math.hypot(x - 32, y - 32) / 32, [[0, 1], [0.18, 0.7], [1, 0]]),
  ]);
  const flash = new Sprite(new SpriteMaterial({
    map: glowMap, transparent: true, depthWrite: false, depthTest: false,
    blending: AdditiveBlending, toneMapped: false, fog: false,
  }));
  flash.renderOrder = 24;
  group.add(flash);
  const positions = new Float32Array(18 * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const dust = new Points(geometry, new PointsMaterial({
    map: glowMap, color: '#ffe6a8', size: 0.09, transparent: true, depthWrite: false,
    depthTest: false, blending: AdditiveBlending, toneMapped: false, fog: false,
  }));
  dust.renderOrder = 23;
  group.add(dust);
  const point = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const contact = new Vector3(0, CEILING_Y + COIN_R * 0.65, 0);
  group.visible = false;

  return {
    group,
    motion,
    update(dt: number, height: number, vy: number, camera: Camera) {
      const frame = motion.step(dt, CEILING_Y - height, vy > 0);
      group.visible = frame.ready + frame.contact + frame.release > 0;
      if (!group.visible) return frame;
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const alpha = [frame.ready, frame.contact, frame.release];
      poses.forEach((sprite, i) => {
        sprite.material.opacity = alpha[i] * 0.94;
        sprite.visible = alpha[i] > 0.001;
        sprite.position.copy(contact)
          .addScaledVector(right, frame.retreat * 0.38)
          .addScaledVector(up, frame.retreat * 0.45);
      });
      flash.position.copy(contact);
      flash.scale.setScalar(0.55 + (1 - frame.flash) * 0.2);
      flash.material.opacity = frame.flash;
      dust.material.opacity = frame.ripple * 0.8;
      for (let i = 0; i < 18; i++) {
        const angle = i * 2.39996;
        const radius = (1 - frame.ripple) * (0.4 + (i % 4) * 0.15);
        const p = point.copy(contact).addScaledVector(right, Math.cos(angle) * radius)
          .addScaledVector(up, Math.sin(angle) * radius * 0.45 - (1 - frame.ripple) ** 2 * 0.25);
        p.toArray(positions, i * 3);
      }
      geometry.attributes.position.needsUpdate = true;
      return frame;
    },
  };
}
