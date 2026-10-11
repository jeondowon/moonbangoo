// 절차적 스튜디오 환경맵 (명세 R6: 환경맵 기반 PBR 반사).
// HDRI 파일 대신 소프트박스·스트립 조명을 배치한 방을 PMREM으로 구워 쓴다 → 다운로드 0, 하이라이트 배치를 직접 연출.
// 팩 정면이 비추는 방향은 카메라 뒤(+z)이므로, 조명은 +z 반구에 모아 기울일 때 하이라이트가 가로지르게 한다.
import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
  Float32BufferAttribute,
} from 'three';

function panel(
  scene: Scene, w: number, h: number, intensity: number, tint: string,
  x: number, y: number, z: number, roll = 0,
) {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(tint).multiplyScalar(intensity) }));
  m.position.set(x, y, z);
  m.lookAt(0, 0, 0);
  m.rotateZ(roll);
  scene.add(m);
}

export function createStudioEnv(renderer: WebGLRenderer, profile: 'default' | 'pack' = 'default'): Texture {
  const scene = new Scene();
  const pack = profile === 'pack';

  // 팩은 차분한 베이지색 방으로 채워 포장지 전체에 부드러운 주변광을 준다.
  // 카드용 환경은 기존의 위가 밝고 아래가 어두운 그라디언트를 유지한다.
  const room = new BoxGeometry(16, 10, 16, 1, 8, 1);
  const p = room.getAttribute('position');
  const colors: number[] = [];
  const top = new Color(pack ? '#c3b6a3' : '#8a7358');
  const bottom = new Color(pack ? '#887b69' : '#3a2e22');
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 5) / 10;
    c.copy(bottom).lerp(top, t * t);
    colors.push(c.r, c.g, c.b);
  }
  room.setAttribute('color', new Float32BufferAttribute(colors, 3));
  scene.add(new Mesh(room, new MeshBasicMaterial({ side: BackSide, vertexColors: true })));

  if (pack) {
    // 팩은 넓은 창빛 같은 주광과 약한 보조광만 사용한다.
    // 선명한 반사띠·광점·윤곽광을 없애 포장지와 금박에 큰 명암만 남긴다.
    panel(scene, 7, 5, 1.8, '#fff8ee', -2.2, 3, 5.5);
    panel(scene, 6, 5, 0.6, '#fffaf2', 3, -0.5, 6.5);
  } else {
    // 카드의 홀로·금속 효과용 조명은 유지한다.
    panel(scene, 5.5, 2.4, 3.2, '#fff4e2', 0, 3.4, 4.6);
    panel(scene, 0.55, 5.5, 5, '#fff1d6', -3.6, 0.4, 3.6);
    panel(scene, 0.55, 5.5, 4, '#ffe8c4', 3.6, 0.4, 3.6);
    panel(scene, 3.2, 2.2, 1.6, '#fff4e6', 1.4, 1.1, 7.5);
    panel(scene, 9, 0.5, 4.5, '#fff8ee', 0, -0.6, 7.2, 0.5);
    panel(scene, 9, 0.28, 3.2, '#fff8ee', -0.6, 1.2, 7.2, 0.5);
    panel(scene, 8, 2.4, 1.1, '#e3c79a', 0, -4, 4);
    panel(scene, 3, 6, 1.6, '#ffd9a6', 0, 1, -7);

    const dotGeo = new SphereGeometry(0.07, 8, 6);
    const dotMat = new MeshBasicMaterial({ color: new Color('#fff6e6').multiplyScalar(40) });
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996; // 황금각 나선 → 고르게 흩어짐
      const r = 2.2 + (i % 5) * 0.55;
      const d = new Mesh(dotGeo, dotMat);
      d.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.75 + 0.5, 4.5 + (i % 3) * 0.8);
      scene.add(d);
    }
  }

  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.015).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
  return tex;
}
