import * as T from 'three';
import { KitLibrary, modelUrl, bakeModel } from './assets.ts';

export const skillArt = new KitLibrary([modelUrl('skill-art.glb')]);
export function requestSkillArt() { if (typeof window !== 'undefined' && !skillArt.requested) void skillArt.load(); }

/** The caller owns the copied resources, matching CombatView's projectile disposal. */
export function mountainArt(radius: number): T.Mesh | null {
  requestSkillArt();
  const model = skillArt.instance('skill_mountain');
  if (!model) return null;
  bakeModel(model);
  const source = model.children.find(c => c instanceof T.Mesh) as T.Mesh | undefined;
  if (!source || Array.isArray(source.material)) return null;
  const mesh = new T.Mesh(source.geometry.clone(), source.material.clone());
  mesh.geometry.applyMatrix4(source.matrix);
  mesh.geometry.translate(0, -1.1, 0);
  mesh.scale.setScalar(Math.max(.6, radius));
  mesh.name = 'blender-skill-mountain';
  mesh.castShadow = true;
  return mesh;
}
