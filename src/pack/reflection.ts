import { Group, Matrix4, Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { PACK_H } from './pack';

export const PACK_FLOOR_Y = -PACK_H / 2 - 0.07 * PACK_H;
const OPACITY = 0.3;

/** 팩 표면만 복제한다. 이후 추가되는 카드 뭉치는 반사에 포함하지 않는다. */
export class PackReflection {
  readonly group = new Group();
  private readonly surfaces: { source: Mesh; mirror: Mesh }[] = [];
  private readonly transform = new Matrix4();
  private readonly inverse = new Matrix4();
  private readonly floor = { value: PACK_FLOOR_Y };
  private readonly height = { value: PACK_H };

  constructor(source: Object3D) {
    source.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const original = node.material as MeshStandardMaterial;
      const material = original.clone();
      material.transparent = true;
      material.opacity = OPACITY;
      material.depthWrite = false;
      material.alphaToCoverage = false;
      material.alphaTest = 0;
      // clone()이 복사하지 않는 절취 셰이더와 공유 유니폼도 이어받는다.
      material.onBeforeCompile = (shader, renderer) => {
        original.onBeforeCompile(shader, renderer);
        shader.uniforms.uReflectionFloor = this.floor;
        shader.uniforms.uReflectionHeight = this.height;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vReflectionY;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvReflectionY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vReflectionY;\nuniform float uReflectionFloor, uReflectionHeight;')
          .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
            if (vReflectionY > uReflectionFloor) discard;
            diffuseColor.a *= smoothstep(uReflectionFloor - uReflectionHeight * 0.76, uReflectionFloor, vReflectionY);`);
      };
      material.customProgramCacheKey = () => `${original.customProgramCacheKey()}-floor-reflection`;
      const mirror = new Mesh(node.geometry, material);
      mirror.matrixAutoUpdate = false;
      this.surfaces.push({ source: node, mirror });
      this.group.add(mirror);
    });
  }

  update(floorY: number, height = PACK_H, opacity = 1) {
    this.floor.value = floorY;
    this.height.value = height;
    this.group.updateWorldMatrix(true, false);
    this.inverse.copy(this.group.matrixWorld).invert();
    // 바닥은 회전시키지 않는다. 월드 좌표에서 먼저 팩을 회전한 뒤 Y만 반전한다.
    this.transform.makeScale(1, -1, 1).setPosition(0, 2 * floorY, 0);
    this.transform.premultiply(this.inverse);
    for (const { source, mirror } of this.surfaces) {
      source.updateWorldMatrix(true, false);
      mirror.matrix.multiplyMatrices(this.transform, source.matrixWorld);
      mirror.matrixWorldNeedsUpdate = true;
      let visible = true;
      for (let node: Object3D | null = source; node; node = node.parent) visible &&= node.visible;
      mirror.visible = visible;
      (mirror.material as MeshStandardMaterial).opacity = OPACITY * opacity;
    }
  }
}
