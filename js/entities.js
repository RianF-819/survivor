/**
 * Pixel Survivor 3D - Three.js Entity System
 * Player3D, Enemy3D with Continuous Tracking AI, Gem3D, Slash3D, and 3D Particles.
 */

// Shared Geometry and Material Caches for High Performance
const G3D = {
  playerBody: new THREE.BoxGeometry(0.9, 1.2, 0.7),
  playerHead: new THREE.BoxGeometry(0.65, 0.65, 0.65),
  playerVisor: new THREE.BoxGeometry(0.7, 0.22, 0.25),
  swordBlade: new THREE.BoxGeometry(0.12, 1.6, 0.08),

  mutantBody: new THREE.DodecahedronGeometry(0.7, 0),
  batBody: new THREE.ConeGeometry(0.5, 0.8, 4),
  batWing: new THREE.BoxGeometry(0.8, 0.06, 0.4),
  bruteBody: new THREE.BoxGeometry(1.5, 1.8, 1.3),
  bossBody: new THREE.DodecahedronGeometry(2.2, 1),
  bossHorn: new THREE.ConeGeometry(0.4, 1.2, 4),

  gemGeoSmall: new THREE.OctahedronGeometry(0.35, 0),
  gemGeoMed: new THREE.OctahedronGeometry(0.5, 0),
  gemGeoLarge: new THREE.OctahedronGeometry(0.75, 0),
  daggerGeo: new THREE.ConeGeometry(0.18, 0.8, 5),

  particleGeo: new THREE.BoxGeometry(0.15, 0.15, 0.15)
};

const M3D = {
  playerArmor: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.7 }),
  playerVisor: new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.8 }),
  swordEnergy: new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 2.0 }),

  mutant: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5, emissive: 0x15803d, emissiveIntensity: 0.4 }),
  bat: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, emissive: 0xb91c1c, emissiveIntensity: 0.6 }),
  brute: new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.3, metalness: 0.5, emissive: 0x6b21a8, emissiveIntensity: 0.5 }),
  boss: new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.2, metalness: 0.6, emissive: 0xff0055, emissiveIntensity: 0.9 }),
  bossCore: new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 2.5 }),

  gemCyan: new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 1.2, roughness: 0.1 }),
  gemGreen: new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 1.2, roughness: 0.1 }),
  gemRed: new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xf43f5e, emissiveIntensity: 1.2, roughness: 0.1 }),
  gemGold: new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 2.0, roughness: 0.1 }),

  slash: new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  }),

  aura: new THREE.MeshBasicMaterial({
    color: 0xff00b4,
    wireframe: true,
    transparent: true,
    opacity: 0.65
  })
};

class Particle3D {
  constructor(scene, x, y, z, color = 0x00f5ff, speed = 8) {
    this.scene = scene;
    const mat = new THREE.MeshBasicMaterial({ color: color });
    this.mesh = new THREE.Mesh(G3D.particleGeo, mat);
    this.mesh.position.set(x, y, z);
    scene.add(this.mesh);

    const angle = Math.random() * Math.PI * 2;
    const vSpeed = (Math.random() * 0.6 + 0.4) * speed;
    this.vx = Math.cos(angle) * vSpeed;
    this.vy = Math.random() * 5 + 3;
    this.vz = Math.sin(angle) * vSpeed;
    this.life = 0.45;
    this.maxLife = 0.45;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      this.destroy();
      return;
    }

    this.mesh.position.x += this.vx * dt;
    this.mesh.position.y += this.vy * dt;
    this.mesh.position.z += this.vz * dt;
    this.vy -= 18 * dt; // Gravity
    if (this.mesh.position.y < 0.1) {
      this.mesh.position.y = 0.1;
      this.vy = -this.vy * 0.4;
    }

    const scale = Math.max(0.01, this.life / this.maxLife);
    this.mesh.scale.set(scale, scale, scale);
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
  }
}

class Slash3D {
  constructor(scene, x, z, angle, range, arcAngle = Math.PI * 0.75) {
    this.scene = scene;
    this.duration = 0.16;
    this.elapsed = 0;
    this.dead = false;

    // Create 3D Curved Arc Geometry
    const innerR = Math.max(0.2, range * 0.55);
    const outerR = range;
    const geo = new THREE.RingGeometry(innerR, outerR, 24, 1, -arcAngle * 0.5, arcAngle);
    
    // Parent group cleanly separates ground-plane alignment from directional rotation
    this.mesh = new THREE.Group();
    const ringMesh = new THREE.Mesh(geo, M3D.slash.clone());
    ringMesh.rotation.x = -Math.PI / 2; // Flat on ground plane, arc centered along +X
    this.mesh.add(ringMesh);

    // Rotate around world Y axis so arc center points exactly along facing angle
    this.mesh.rotation.y = -angle;
    this.mesh.position.set(x, 0.75, z);
    scene.add(this.mesh);
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.dead = true;
      this.destroy();
      return;
    }

    const prog = this.elapsed / this.duration;
    if (this.mesh.children[0] && this.mesh.children[0].material) {
      this.mesh.children[0].material.opacity = (1 - prog) * 0.9;
    }
    const sc = 0.85 + prog * 0.35;
    this.mesh.scale.set(sc, sc, sc);
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
  }
}

class Projectile3D {
  constructor(scene, x, z, vx, vz, damage = 26, maxLife = 1.6) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.vx = vx;
    this.vz = vz;
    this.damage = damage;
    this.radius = 0.4;
    this.life = maxLife;
    this.dead = false;

    this.mesh = new THREE.Mesh(G3D.daggerGeo, M3D.swordEnergy);
    this.mesh.position.set(x, 0.8, z);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.rotation.z = -Math.atan2(vz, vx) - Math.PI / 2;
    scene.add(this.mesh);
  }

  update(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.life -= dt;
    this.mesh.position.set(this.x, 0.8, this.z);

    if (this.life <= 0) {
      this.dead = true;
      this.destroy();
    }
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
  }
}

class Gem3D {
  constructor(scene, x, z, value = 10) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.value = value;
    this.dead = false;
    this.bob = Math.random() * Math.PI * 2;

    let geo = G3D.gemGeoSmall;
    let mat = M3D.gemCyan;
    this.radius = 0.4;

    if (value >= 250) {
      geo = G3D.gemGeoLarge;
      mat = M3D.gemGold;
      this.radius = 0.8;
    } else if (value >= 100) {
      geo = G3D.gemGeoMed;
      mat = M3D.gemRed;
      this.radius = 0.6;
    } else if (value >= 30) {
      geo = G3D.gemGeoMed;
      mat = M3D.gemGreen;
      this.radius = 0.5;
    }

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, 0.6, z);
    scene.add(this.mesh);
  }

  update(dt, player) {
    this.bob += dt * 3.5;
    this.mesh.position.y = 0.6 + Math.sin(this.bob) * 0.15;
    this.mesh.rotation.y += dt * 2.5;
    this.mesh.rotation.x += dt * 1.5;

    // Magnet attraction towards 3D player coordinates
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= player.magnetRange) {
      const pullSpeed = 16 * (1 - dist / player.magnetRange) + 6;
      this.x += (dx / dist) * pullSpeed * dt;
      this.z += (dz / dist) * pullSpeed * dt;
      this.mesh.position.x = this.x;
      this.mesh.position.z = this.z;

      // Pickup radius collision
      if (dist <= player.radius + this.radius + 0.3) {
        this.dead = true;
        this.destroy();
        player.addExp(this.value);

        if (window.soundEngine) {
          window.soundEngine.playSFX('gem', this.x, player.x, 30);
        }
      }
    }
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
  }
}

class Enemy3D {
  constructor(scene, x, z, type = 'mutant', healthMultiplier = 1.0) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.type = type;
    this.dead = false;
    this.hitFlash = 0;
    this.animTime = 0;

    this.mesh = new THREE.Group();

    switch (type) {
      case 'bat':
        this.radius = 0.6;
        this.speed = 7.5;
        this.maxHp = Math.floor(22 * healthMultiplier);
        this.damage = 8;
        this.expValue = 15;
        this.yPos = 1.6;

        this.bodyMesh = new THREE.Mesh(G3D.batBody, M3D.bat.clone());
        this.bodyMesh.rotation.x = Math.PI / 2;
        this.wingL = new THREE.Mesh(G3D.batWing, M3D.bat.clone());
        this.wingR = new THREE.Mesh(G3D.batWing, M3D.bat.clone());
        this.wingL.position.x = -0.6;
        this.wingR.position.x = 0.6;
        this.mesh.add(this.bodyMesh, this.wingL, this.wingR);
        break;

      case 'brute':
        this.radius = 1.2;
        this.speed = 3.2;
        this.maxHp = Math.floor(130 * healthMultiplier);
        this.damage = 22;
        this.expValue = 50;
        this.yPos = 0.9;

        this.bodyMesh = new THREE.Mesh(G3D.bruteBody, M3D.brute.clone());
        this.mesh.add(this.bodyMesh);
        break;

      case 'boss':
        this.radius = 2.4;
        this.speed = 2.8;
        this.maxHp = Math.floor(550 * healthMultiplier);
        this.damage = 35;
        this.expValue = 250;
        this.yPos = 1.8;

        this.bodyMesh = new THREE.Mesh(G3D.bossBody, M3D.boss.clone());
        this.coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), M3D.bossCore);
        this.coreMesh.position.y = 0.4;

        this.hornL = new THREE.Mesh(G3D.bossHorn, M3D.boss.clone());
        this.hornR = new THREE.Mesh(G3D.bossHorn, M3D.boss.clone());
        this.hornL.position.set(-1.0, 1.6, 0.4);
        this.hornR.position.set(1.0, 1.6, 0.4);
        this.hornL.rotation.z = 0.3;
        this.hornR.rotation.z = -0.3;

        this.mesh.add(this.bodyMesh, this.coreMesh, this.hornL, this.hornR);
        break;

      case 'mutant':
      default:
        this.radius = 0.7;
        this.speed = 4.4;
        this.maxHp = Math.floor(36 * healthMultiplier);
        this.damage = 12;
        this.expValue = 10;
        this.yPos = 0.6;

        this.bodyMesh = new THREE.Mesh(G3D.mutantBody, M3D.mutant.clone());
        this.mesh.add(this.bodyMesh);
        break;
    }

    this.hp = this.maxHp;
    this.mesh.position.set(x, this.yPos, z);
    scene.add(this.mesh);
  }

  /**
   * Continuous tracking AI towards player in 3D (X, Z plane)
   * with soft flocking/separation from nearby enemies
   */
  trackPlayer(player, dt, otherEnemies = []) {
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0 && this.bodyMesh) {
        this.bodyMesh.material.emissive.setHex(this.type === 'boss' ? 0xff0055 : (this.type === 'bat' ? 0xb91c1c : (this.type === 'brute' ? 0x6b21a8 : 0x15803d)));
      }
    }

    this.animTime += dt * 8;

    // Direction vector towards player
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const distToPlayer = Math.hypot(dx, dz);

    let moveX = 0;
    let moveZ = 0;

    if (distToPlayer > 0.001) {
      moveX = dx / distToPlayer;
      moveZ = dz / distToPlayer;
    }

    // Soft flocking separation
    let sepX = 0;
    let sepZ = 0;
    const checkCount = Math.min(otherEnemies.length, 30);

    for (let i = 0; i < checkCount; i++) {
      const other = otherEnemies[i];
      if (other === this || other.dead) continue;

      const ex = this.x - other.x;
      const ez = this.z - other.z;
      const enemyDist = Math.hypot(ex, ez);
      const minDist = this.radius + other.radius + 0.3;

      if (enemyDist > 0 && enemyDist < minDist) {
        const factor = (minDist - enemyDist) / minDist;
        sepX += (ex / enemyDist) * factor * 1.5;
        sepZ += (ez / enemyDist) * factor * 1.5;
      }
    }

    let vx = moveX + sepX;
    let vz = moveZ + sepZ;
    const len = Math.hypot(vx, vz);

    if (len > 0) {
      vx = (vx / len) * this.speed;
      vz = (vz / len) * this.speed;
    }

    this.x += vx * dt;
    this.z += vz * dt;

    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;

    // Facing direction
    if (distToPlayer > 0.1) {
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    // Animation bobbing / wing flapping
    if (this.type === 'bat' && this.wingL && this.wingR) {
      const flap = Math.sin(this.animTime * 1.5) * 0.5;
      this.wingL.rotation.z = flap;
      this.wingR.rotation.z = -flap;
    } else {
      this.mesh.position.y = this.yPos + Math.sin(this.animTime) * 0.08;
    }
  }

  takeDamage(amount, knockbackAngle = null, knockbackDist = 1.2) {
    this.hp -= amount;
    this.hitFlash = 0.12;

    if (this.bodyMesh) {
      this.bodyMesh.material.emissive.setHex(0xffffff);
    }

    if (knockbackAngle !== null) {
      this.x += Math.cos(knockbackAngle) * knockbackDist;
      this.z += Math.sin(knockbackAngle) * knockbackDist;
      this.mesh.position.x = this.x;
      this.mesh.position.z = this.z;
    }

    if (this.hp <= 0) {
      this.dead = true;
    }
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
  }
}

class Player3D {
  constructor(scene, x = 0, z = 0) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.radius = 0.8;
    this.facingAngle = 0;
    this.walkAnim = 0;

    // Stats
    this.baseSpeed = 10.5;
    this.speed = this.baseSpeed;
    this.maxHp = 100;
    this.hp = 100;
    this.level = 1;
    this.exp = 0;
    this.expToNext = 80;
    this.kills = 0;
    this.score = 0;

    // Combat Stats
    this.attackDamage = 35;
    this.attackRange = 4.2;
    this.attackArc = Math.PI * 0.75;
    this.attackCooldown = 0.36;
    this.attackTimer = 0;
    this.critChance = 0.15;

    // Dash
    this.dashCooldown = 2.4;
    this.dashTimer = 0;
    this.dashDuration = 0.16;
    this.isDashing = false;
    this.dashElapsed = 0;
    this.dashVx = 0;
    this.dashVz = 0;

    // Defense & Utility
    this.invulnerableTimer = 0;
    this.magnetRange = 5.8;

    // Upgrades
    this.hasAura = false;
    this.auraRadius = 3.6;
    this.auraDamage = 18;
    this.auraTick = 0.5;
    this.auraTimer = 0;

    this.hasDaggers = false;
    this.daggerCooldown = 1.2;
    this.daggerTimer = 0;

    // Build 3D Player Mesh Hierarchy
    this.mesh = new THREE.Group();

    this.bodyMesh = new THREE.Mesh(G3D.playerBody, M3D.playerArmor);
    this.bodyMesh.position.y = 0.8;

    this.headMesh = new THREE.Mesh(G3D.playerHead, M3D.playerArmor);
    this.headMesh.position.y = 1.6;

    this.visorMesh = new THREE.Mesh(G3D.playerVisor, M3D.playerVisor);
    this.visorMesh.position.set(0, 1.6, 0.3);

    // Energy Katana attached to right arm
    this.swordPivot = new THREE.Group();
    this.swordPivot.position.set(0.65, 0.9, 0);

    this.swordMesh = new THREE.Mesh(G3D.swordBlade, M3D.swordEnergy);
    this.swordMesh.position.set(0, 0.6, 0.4);
    this.swordMesh.rotation.x = Math.PI / 4;
    this.swordPivot.add(this.swordMesh);

    // Glowing PointLight on player
    this.light = new THREE.PointLight(0x00f5ff, 2.2, 16);
    this.light.position.set(0, 2.0, 0);

    // Plasma Aura Mesh (hidden until unlocked)
    this.auraMesh = new THREE.Mesh(new THREE.TorusGeometry(this.auraRadius, 0.08, 8, 36), M3D.aura);
    this.auraMesh.rotation.x = Math.PI / 2;
    this.auraMesh.position.y = 0.6;
    this.auraMesh.visible = false;

    this.mesh.add(this.bodyMesh, this.headMesh, this.visorMesh, this.swordPivot, this.light, this.auraMesh);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  update(dt, input, arenaSize) {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);

    // Always update facing direction from input (mouse aim or joystick/keyboard)
    if (typeof input.facingAngle === 'number') {
      this.facingAngle = input.facingAngle;
    }

    if (this.isDashing) {
      this.dashElapsed += dt;
      this.x += this.dashVx * dt;
      this.z += this.dashVz * dt;

      if (this.dashElapsed >= this.dashDuration) {
        this.isDashing = false;
      }
    } else {
      if (input.x !== 0 || input.y !== 0) {
        this.x += input.x * this.speed * dt;
        this.z += input.y * this.speed * dt; // Y joystick axis maps to 3D Z world axis
        this.walkAnim += dt * 14;

        // Bobbing walk animation
        this.bodyMesh.position.y = 0.8 + Math.abs(Math.sin(this.walkAnim)) * 0.12;
      }

      if (input.dashing && this.dashTimer <= 0) {
        this.isDashing = true;
        this.dashElapsed = 0;
        this.dashTimer = this.dashCooldown;
        this.invulnerableTimer = this.dashDuration + 0.1;
        const dashSpeed = this.speed * 3.2;

        if (input.x !== 0 || input.y !== 0) {
          this.dashVx = input.x * dashSpeed;
          this.dashVz = input.y * dashSpeed;
        } else {
          // Dash in facing direction if stationary
          this.dashVx = Math.cos(this.facingAngle) * dashSpeed;
          this.dashVz = Math.sin(this.facingAngle) * dashSpeed;
        }

        if (window.soundEngine) {
          window.soundEngine.playSFX('dash', this.x, this.x, 30);
        }
      }
    }

    // Clamp inside arena bounds
    const half = arenaSize * 0.5 - 1.5;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.z = Math.max(-half, Math.min(half, this.z));

    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;

    // Rotate player mesh towards facing direction
    // Notice facingAngle 0 is Right (+X), PI/2 is Down (+Z)
    this.mesh.rotation.y = -this.facingAngle + Math.PI / 2;

    // Sword swing animation during attack
    if (this.swordPivot) {
      if (this.attackTimer > 0) {
        const attackProgress = 1.0 - (this.attackTimer / this.attackCooldown);
        this.swordPivot.rotation.x = Math.sin(attackProgress * Math.PI) * 1.6;
        this.swordPivot.rotation.y = Math.sin(attackProgress * Math.PI) * 0.8;
      } else {
        this.swordPivot.rotation.x = 0;
        this.swordPivot.rotation.y = 0;
      }
    }

    // Aura ring rotation
    if (this.hasAura) {
      this.auraMesh.visible = true;
      this.auraMesh.rotation.z += dt * 3.0;
    }
  }

  takeDamage(amount) {
    if (this.invulnerableTimer > 0) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableTimer = 0.45;

    if (window.soundEngine) {
      window.soundEngine.playSFX('player_hurt', this.x, this.x, 30);
    }
    return true;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addExp(amount) {
    this.exp += amount;
    this.score += amount * 10;
  }

  checkLevelUp() {
    if (this.exp >= this.expToNext) {
      this.level += 1;
      this.exp -= this.expToNext;
      this.expToNext = Math.floor(this.expToNext * 1.45 + 25);
      this.heal(this.maxHp * 0.35);

      if (window.soundEngine) {
        window.soundEngine.playSFX('levelup', this.x, this.x, 30);
      }
      return true;
    }
    return false;
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.scene.remove(this.mesh);
    }
  }
}

window.Entities3D = {
  Player3D,
  Enemy3D,
  Gem3D,
  Slash3D,
  Projectile3D,
  Particle3D
};
