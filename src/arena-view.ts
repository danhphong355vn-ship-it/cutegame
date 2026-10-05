import * as T from 'three';
import { ARENA, inArena } from './world-events.ts';

export class ArenaView {
  readonly group: T.Group;
  private flames: T.Mesh[] = [];
  private barrier?: T.Mesh;
  readonly ringRopes: T.Mesh[] = [];
  private hiddenScenery: T.Object3D[] = [];
  private removedObstacles: any[] = [];
  private time = 0;
  private attachedWorldRoot: T.Group | null = null;
  private attachedWorld: any = null;

  constructor() {
    this.group = new T.Group();
    this.group.name = 'pvp-arena-stadium';
    this.buildStadium();
  }

  private buildStadium() {
    const cx = ARENA.x;
    const cz = ARENA.z;
    const r = ARENA.radius;
    // Flat level flush with character feet (y ≈ 0.0)
    const floorY = 0.02;

    // 1. Grand Stone Platform (Bệ đài đá bát giác / tròn lớn phẳng sát mặt đất, không làm chìm chân)
    const baseGeo = new T.CylinderGeometry(r + 0.4, r + 0.9, 0.03, 32);
    const baseMat = new T.MeshStandardMaterial({
      color: '#1f1b24',
      roughness: 0.85,
      metalness: 0.15,
    });
    const base = new T.Mesh(baseGeo, baseMat);
    base.position.set(cx, floorY - 0.005, cz);
    base.receiveShadow = true;
    this.group.add(base);

    // Sàn thi đấu chính (Combat Floor)
    const floorGeo = new T.CylinderGeometry(r, r + 0.1, 0.02, 32);
    const floorMat = new T.MeshStandardMaterial({
      color: '#2a2431',
      roughness: 0.7,
      metalness: 0.2,
    });
    const floor = new T.Mesh(floorGeo, floorMat);
    floor.position.set(cx, floorY + 0.01, cz);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Viền vàng hoàng gia quanh chu vi sàn (Outer Golden Rim)
    const rimGeo = new T.TorusGeometry(r, 0.12, 12, 64);
    const rimMat = new T.MeshStandardMaterial({
      color: '#ffd043',
      emissive: '#d48800',
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.6,
    });
    const rim = new T.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cx, floorY + 0.02, cz);
    this.group.add(rim);

    // Vòng tròn trung tâm (Center Battle Ring)
    const centerRingGeo = new T.RingGeometry(3.6, 4.0, 32);
    const centerRingMat = new T.MeshStandardMaterial({
      color: '#ff9900',
      emissive: '#ff7700',
      emissiveIntensity: 0.7,
      side: T.DoubleSide,
    });
    const centerRing = new T.Mesh(centerRingGeo, centerRingMat);
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.set(cx, floorY + 0.025, cz);
    this.group.add(centerRing);

    // Họa tiết song kiếm bắt chéo ở tâm sàn đấu (⚔️ Crossed Swords Emblem)
    const swordBladeGeo = new T.BoxGeometry(0.24, 0.02, 5.0);
    const swordBladeMat = new T.MeshStandardMaterial({
      color: '#fff3b0',
      emissive: '#ffaa00',
      emissiveIntensity: 0.6,
    });
    const sword1 = new T.Mesh(swordBladeGeo, swordBladeMat);
    sword1.position.set(cx, floorY + 0.03, cz);
    sword1.rotation.y = Math.PI / 4;
    this.group.add(sword1);

    const sword2 = new T.Mesh(swordBladeGeo, swordBladeMat);
    sword2.position.set(cx, floorY + 0.03, cz);
    sword2.rotation.y = -Math.PI / 4;
    this.group.add(sword2);

    // Bậc thềm đá ngoài cổng
    for (let i = 0; i < 4; i++) {
      const stepAngle = (i * Math.PI) / 2;
      const stepGeo = new T.BoxGeometry(4.0, 0.04, 1.8);
      const stepMat = new T.MeshStandardMaterial({ color: '#2f2838', roughness: 0.9 });
      const step = new T.Mesh(stepGeo, stepMat);
      step.position.set(
        cx + Math.cos(stepAngle) * (r + 0.8),
        0.01,
        cz + Math.sin(stepAngle) * (r + 0.8)
      );
      step.rotation.y = -stepAngle + Math.PI / 2;
      this.group.add(step);
    }

    // 2. 8 Monumental Colosseum Pillars with Torches (8 Cột trụ giác đấu & Ngọn đuốc)
    const numPillars = 8;
    const pillarHeight = 3.6;
    for (let i = 0; i < numPillars; i++) {
      const angle = (i * Math.PI * 2) / numPillars;
      const px = cx + Math.cos(angle) * r;
      const pz = cz + Math.sin(angle) * r;
      const py = 0;

      // Chân cột
      const baseColGeo = new T.BoxGeometry(1.2, 0.4, 1.2);
      const baseColMat = new T.MeshStandardMaterial({ color: '#332c3d', roughness: 0.8 });
      const baseCol = new T.Mesh(baseColGeo, baseColMat);
      baseCol.position.set(px, py + 0.2, pz);
      baseCol.rotation.y = angle;
      this.group.add(baseCol);

      // Thân cột
      const colGeo = new T.CylinderGeometry(0.38, 0.44, pillarHeight, 16);
      const colMat = new T.MeshStandardMaterial({
        color: '#473d54',
        roughness: 0.7,
        metalness: 0.1,
      });
      const col = new T.Mesh(colGeo, colMat);
      col.position.set(px, py + pillarHeight / 2 + 0.4, pz);
      this.group.add(col);

      // Đỉnh cột / Bệ chảo lửa
      const capGeo = new T.BoxGeometry(0.9, 0.3, 0.9);
      const capMat = new T.MeshStandardMaterial({ color: '#ffd043', roughness: 0.4, metalness: 0.5 });
      const cap = new T.Mesh(capGeo, capMat);
      cap.position.set(px, py + pillarHeight + 0.55, pz);
      cap.rotation.y = angle;
      this.group.add(cap);

      // Chảo lửa đồng đen
      const brazierGeo = new T.CylinderGeometry(0.55, 0.3, 0.35, 12);
      const brazierMat = new T.MeshStandardMaterial({ color: '#1a181e', roughness: 0.5, metalness: 0.7 });
      const brazier = new T.Mesh(brazierGeo, brazierMat);
      brazier.position.set(px, py + pillarHeight + 0.8, pz);
      this.group.add(brazier);

      // Ngọn lửa 3D bốc cháy
      const flameGeo = new T.ConeGeometry(0.35, 0.85, 8);
      const flameMat = new T.MeshBasicMaterial({
        color: '#ff6600',
      });
      const flame = new T.Mesh(flameGeo, flameMat);
      flame.position.set(px, py + pillarHeight + 1.25, pz);
      this.group.add(flame);
      this.flames.push(flame);
    }

    // 3. 3-Tier 3D Glowing Ropes / Forcefield (3 Tầng dây đài ở độ cao ngang người: 0.7m, 1.3m, 1.9m)
    const ropeHeights = [0.7, 1.3, 1.9];
    const ropeMat = new T.MeshStandardMaterial({
      color: '#ffe066',
      emissive: '#ff9900',
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.4,
    });

    for (const rh of ropeHeights) {
      const ropeGeo = new T.TorusGeometry(r, 0.075, 10, 64);
      const rope = new T.Mesh(ropeGeo, ropeMat);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(cx, rh, cz);
      this.group.add(rope);
      this.ringRopes.push(rope);
    }

    // 4. Glowing Energy Forcefield Cylinder (Kết giới bảo vệ trong suốt)
    const barrierGeo = new T.CylinderGeometry(r - 0.05, r - 0.05, 2.6, 32, 1, true);
    const barrierMat = new T.MeshBasicMaterial({
      color: '#ffaa00',
      transparent: true,
      opacity: 0.12,
      side: T.DoubleSide,
      depthWrite: false,
    });
    this.barrier = new T.Mesh(barrierGeo, barrierMat);
    this.barrier.position.set(cx, 1.3, cz);
    this.group.add(this.barrier);

    // 5. Grand Entrance Archway (Cổng chào Đấu Trường Hướng Nam)
    const archZ = cz + r + 0.2;
    const archWidth = 4.2;
    const archH = 4.5;

    const gateMat = new T.MeshStandardMaterial({ color: '#3d3448', roughness: 0.7 });
    const postGeo = new T.BoxGeometry(0.7, archH, 0.7);
    const postL = new T.Mesh(postGeo, gateMat);
    postL.position.set(cx - archWidth / 2, archH / 2, archZ);
    this.group.add(postL);

    const postR = new T.Mesh(postGeo, gateMat);
    postR.position.set(cx + archWidth / 2, archH / 2, archZ);
    this.group.add(postR);

    // Xà ngang cổng
    const beamGeo = new T.BoxGeometry(archWidth + 1.2, 0.6, 0.8);
    const beamMat = new T.MeshStandardMaterial({
      color: '#ffd043',
      emissive: '#c97e00',
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const beam = new T.Mesh(beamGeo, beamMat);
    beam.position.set(cx, archH - 0.2, archZ);
    this.group.add(beam);

    // Biểu tượng vương miện / đấu sĩ trên đỉnh cổng
    const crestGeo = new T.ConeGeometry(0.6, 0.9, 4);
    const crestMat = new T.MeshStandardMaterial({ color: '#ffea78', emissive: '#ffaa00', emissiveIntensity: 0.5 });
    const crest = new T.Mesh(crestGeo, crestMat);
    crest.position.set(cx, archH + 0.55, archZ);
    crest.rotation.y = Math.PI / 4;
    this.group.add(crest);
  }

  attach(worldRoot: T.Group, scene?: T.Scene, worldInstance?: any) {
    this.detach();
    this.attachedWorldRoot = worldRoot;
    this.attachedWorld = worldInstance;
    if (worldRoot && typeof worldRoot.add === 'function') {
      worldRoot.add(this.group);
      this.cleanScenery(worldRoot, worldInstance);
    } else if (scene && typeof scene.add === 'function') {
      scene.add(this.group);
    }
  }

  detach() {
    this.restoreScenery();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.attachedWorldRoot = null;
    this.attachedWorld = null;
  }

  /** Dọn sạch quặng, đá, cây chết và chướng ngại vật trong lòng võ đài để mặt sàn phẳng đẹp */
  private cleanScenery(worldRoot: T.Group, worldInstance?: any) {
    const cx = ARENA.x;
    const cz = ARENA.z;
    const clearRadius = ARENA.radius - 0.2;

    // 1. Dọn dẹp con trong worldRoot (đá, cây trang trí)
    if (worldRoot?.children) {
      for (const child of worldRoot.children) {
        if (child === this.group || child.name === 'pvp-arena-boundary') continue;
        const pos = child.position;
        if (pos && typeof pos.x === 'number' && typeof pos.z === 'number') {
          const d = Math.hypot(pos.x - cx, pos.z - cz);
          if (d <= clearRadius && child.visible !== false) {
            child.visible = false;
            this.hiddenScenery.push(child);
          }
        }
      }
    }

    // 2. Dọn sạch quặng (ores/mining nodes) và vật thể tương tác
    if (worldInstance?.entities && Array.isArray(worldInstance.entities)) {
      for (const entity of worldInstance.entities) {
        const d = Math.hypot(entity.x - cx, entity.z - cz);
        if (d <= clearRadius) {
          if (entity.mesh && entity.mesh.visible !== false) {
            entity.mesh.visible = false;
            this.hiddenScenery.push(entity.mesh);
          }
        }
      }
    }

    // 3. Loại bỏ vật cản va chạm (obstacles) trong lòng võ đài để nhân vật không va phải quặng vô hình
    if (Array.isArray(worldInstance?.obstacles)) {
      this.removedObstacles = worldInstance.obstacles.filter((o: any) =>
        Math.hypot(o.x - cx, o.z - cz) <= clearRadius
      );
      worldInstance.obstacles = worldInstance.obstacles.filter((o: any) =>
        Math.hypot(o.x - cx, o.z - cz) > clearRadius
      );
    }
  }

  private restoreScenery() {
    for (const obj of this.hiddenScenery) {
      obj.visible = true;
    }
    this.hiddenScenery = [];
    if (this.attachedWorld && Array.isArray(this.attachedWorld.obstacles) && this.removedObstacles.length) {
      this.attachedWorld.obstacles.push(...this.removedObstacles);
      this.removedObstacles = [];
    }
  }

  update(dt: number, arenaActive = false, worldInstance?: any) {
    this.time += dt;

    // Hoạt ảnh ngọn lửa bập bùng
    const pulse = Math.sin(this.time * 6) * 0.12;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const indPulse = Math.sin(this.time * 7 + i) * 0.15;
      f.scale.set(1 + indPulse, 1 + pulse, 1 + indPulse);
    }

    // Hoạt ảnh dây đài & kết giới khi đấu
    if (this.barrier) {
      if (arenaActive) {
        this.barrier.visible = true;
        (this.barrier.material as T.MeshBasicMaterial).opacity = 0.18 + Math.sin(this.time * 4) * 0.08;
      } else {
        this.barrier.visible = true;
        (this.barrier.material as T.MeshBasicMaterial).opacity = 0.08 + Math.sin(this.time * 2) * 0.03;
      }
    }

    // Nhịp phát sáng của dây đài
    const glow = (arenaActive ? 0.9 : 0.6) + Math.sin(this.time * 3) * 0.2;
    for (const rope of this.ringRopes) {
      const mat = rope.material as T.MeshStandardMaterial;
      if (mat) {
        mat.emissiveIntensity = glow;
      }
    }

    const currentWorld = worldInstance ?? this.attachedWorld;
    const cx = ARENA.x;
    const cz = ARENA.z;
    const barrierRadius = ARENA.radius;

    // Ngăn quái vật xâm nhập vào võ đài: đẩy dạt toàn bộ quái ra ngoài ranh giới
    if (currentWorld?.enemies && Array.isArray(currentWorld.enemies)) {
      for (const e of currentWorld.enemies) {
        if (e.hp <= 0 && e.respawn > 0) continue;
        const d = Math.hypot(e.x - cx, e.z - cz);
        if (d < barrierRadius + 1.2) {
          const angle = Math.atan2(e.z - cz, e.x - cx);
          const pushDist = barrierRadius + 2.5;
          e.x = cx + Math.cos(angle) * pushDist;
          e.z = cz + Math.sin(angle) * pushDist;
          if (e.mesh?.position) {
            e.mesh.position.x = e.x;
            e.mesh.position.z = e.z;
          }
          // Di dời điểm sinh (spawn origin) của quái ra ngoài ranh giới võ đài
          if (Math.hypot((e.homeX ?? e.x) - cx, (e.homeZ ?? e.z) - cz) < barrierRadius + 2) {
            e.homeX = cx + Math.cos(angle) * (barrierRadius + 6);
            e.homeZ = cz + Math.sin(angle) * (barrierRadius + 6);
          }
          // Giải trừ trạng thái dí người chơi nếu mục tiêu đang ở trong võ đài
          if (e.phase === 'chase') {
            e.phase = 'idle';
            e.target = null;
          }
        }
      }
    }

    // Luôn ẩn các quặng (ores) mới mọc lên trong lòng võ đài (do thời tiết tạo ra)
    if (currentWorld?.entities && Array.isArray(currentWorld.entities)) {
      for (const entity of currentWorld.entities) {
        if (Math.hypot(entity.x - cx, entity.z - cz) <= barrierRadius - 0.2) {
          if (entity.mesh && entity.mesh.visible !== false) {
            entity.mesh.visible = false;
            this.hiddenScenery.push(entity.mesh);
          }
        }
      }
    }
  }

  dispose() {
    this.detach();
    this.group.traverse(obj => {
      if (obj instanceof T.Mesh) {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose?.());
        } else {
          obj.material?.dispose?.();
        }
      }
    });
  }
}
