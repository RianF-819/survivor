/**
 * Pixel Survivor 3D - Three.js WebGL Game Engine
 * Features:
 * - 3D isometric camera following player
 * - Top-down arena survival mechanics in 3D WebGL
 * - Continuous 3D enemy tracking AI & flocking
 * - Arc cleave & collision detection
 * - Progressive wave spawning & Boss encounter
 * - Screen-projected floating 3D damage numbers
 * - Clean restart & state lifecycle
 */

class Game3D {
  constructor() {
    this.container = null;
    this.damageContainer = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Arena dimensions in 3D units
    this.arenaSize = 120; // 120x120 units

    // Game state: 'START', 'PLAYING', 'PAUSED', 'LEVEL_UP', 'GAME_OVER'
    this.state = 'START';

    // Entities
    this.player = null;
    this.enemies = [];
    this.gems = [];
    this.projectiles = [];
    this.slashes = [];
    this.particles = [];

    // Timing & Spawning
    this.lastTime = 0;
    this.survivalTime = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1.2;
    this.bossTimer = 0;
    this.bossInterval = 60.0;

    // Upgrades Pool (in English)
    this.availableUpgrades = [
      {
        id: 'damage',
        name: 'Plasma Blade',
        desc: '+30% Cleave Slash Damage',
        icon: '⚔️',
        apply: (p) => { p.attackDamage = Math.round(p.attackDamage * 1.3); }
      },
      {
        id: 'range',
        name: 'Extended Cleave',
        desc: '+25% Slash Radius & Arc Width',
        icon: '⚡',
        apply: (p) => {
          p.attackRange = Math.round(p.attackRange * 1.25);
          p.attackArc = Math.min(Math.PI * 1.15, p.attackArc * 1.15);
        }
      },
      {
        id: 'speed',
        name: 'Anti-Grav Thrusters',
        desc: '+20% Character Movement Speed',
        icon: '🥾',
        apply: (p) => { p.speed = Math.round(p.speed * 1.2); }
      },
      {
        id: 'aura',
        name: 'Plasma Shield',
        desc: 'Unlocks / Empowers a searing energy field around player',
        icon: '🛡️',
        apply: (p) => {
          p.hasAura = true;
          p.auraRadius += 0.8;
          p.auraDamage += 10;
        }
      },
      {
        id: 'daggers',
        name: 'Seeking Daggers',
        desc: 'Auto-launches homing energy blades at nearest enemies',
        icon: '🗡️',
        apply: (p) => {
          p.hasDaggers = true;
          p.daggerCooldown = Math.max(0.4, p.daggerCooldown * 0.8);
        }
      },
      {
        id: 'magnet',
        name: 'Crystal Magnet',
        desc: '+60% EXP Gem Attraction Radius',
        icon: '🧲',
        apply: (p) => { p.magnetRange = Math.round(p.magnetRange * 1.6); }
      },
      {
        id: 'health',
        name: 'Nanobot Armor',
        desc: '+35 Max HP & Instant 50% Health Restoration',
        icon: '❤️',
        apply: (p) => {
          p.maxHp += 35;
          p.heal(p.maxHp * 0.5);
        }
      }
    ];

    // HUD Elements Cache
    this.hudTime = null;
    this.hudKills = null;
    this.hudScore = null;
    this.hudLevel = null;
    this.hudHpBar = null;
    this.hudHpText = null;
    this.hudExpBar = null;
    this.hudDashCd = null;
    this.bossBanner = null;
    this.bossHud = null;
    this.bossBarFill = null;
    this.comboDisplay = null;
    this.comboCountEl = null;

    // Combo & Boss State
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMaxTime = 2.4;
    this.activeBoss = null;
    this.cameraShake = 0;
  }

  init() {
    this.container = document.getElementById('game-container');
    this.damageContainer = document.getElementById('damage-container');

    // Cache HUD DOM Elements
    this.hudTime = document.getElementById('hud-time');
    this.hudKills = document.getElementById('hud-kills');
    this.hudScore = document.getElementById('hud-score');
    this.hudLevel = document.getElementById('hud-level');
    this.hudHpBar = document.getElementById('hud-hp-bar');
    this.hudHpText = document.getElementById('hud-hp-text');
    this.hudExpBar = document.getElementById('hud-exp-bar');
    this.hudDashCd = document.getElementById('btn-dash-cd');
    this.bossBanner = document.getElementById('boss-banner');
    this.bossHud = document.getElementById('boss-hud-bar-container');
    this.bossBarFill = document.getElementById('boss-hud-bar-fill');
    this.comboDisplay = document.getElementById('combo-display');
    this.comboCountEl = document.getElementById('combo-count');

    // 1. Setup Three.js Scene, Camera, and WebGLRenderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d14);
    this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.015);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 300);
    this.camera.position.set(0, 26, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // 2. Setup Cyberpunk Lighting
    const ambient = new THREE.AmbientLight(0x223355, 0.85);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(30, 45, 25);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // 3. Setup 3D Arena Ground & Glowing Grid
    this.setupArenaEnvironment();

    // 4. Window Resize Event
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 200));

    // 5. Start Game Loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  setupArenaEnvironment() {
    // Dark metallic reflective ground
    const floorGeo = new THREE.PlaneGeometry(this.arenaSize, this.arenaSize);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x070b12,
      roughness: 0.4,
      metalness: 0.6
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Cyberpunk Grid Helper
    const grid = new THREE.GridHelper(this.arenaSize, 60, 0x00f5ff, 0x1e293b);
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Glowing Arena Perimeter Walls
    const wallHeight = 4;
    const half = this.arenaSize * 0.5;
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });

    // 4 Border Walls
    const wallNorth = new THREE.Mesh(new THREE.PlaneGeometry(this.arenaSize, wallHeight), wallMat);
    wallNorth.position.set(0, wallHeight * 0.5, -half);
    const wallSouth = new THREE.Mesh(new THREE.PlaneGeometry(this.arenaSize, wallHeight), wallMat);
    wallSouth.position.set(0, wallHeight * 0.5, half);
    wallSouth.rotation.y = Math.PI;
    const wallWest = new THREE.Mesh(new THREE.PlaneGeometry(this.arenaSize, wallHeight), wallMat);
    wallWest.position.set(-half, wallHeight * 0.5, 0);
    wallWest.rotation.y = Math.PI / 2;
    const wallEast = new THREE.Mesh(new THREE.PlaneGeometry(this.arenaSize, wallHeight), wallMat);
    wallEast.position.set(half, wallHeight * 0.5, 0);
    wallEast.rotation.y = -Math.PI / 2;

    this.scene.add(wallNorth, wallSouth, wallWest, wallEast);
  }

  handleResize() {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  startNewGame() {
    // Ensure no HTML UI button keeps focus during gameplay (prevents Space from clicking buttons)
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    // 1. Cleanup old entities
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    this.enemies.forEach(e => e.destroy());
    this.enemies = [];
    this.gems.forEach(g => g.destroy());
    this.gems = [];
    this.projectiles.forEach(p => p.destroy());
    this.projectiles = [];
    this.slashes.forEach(s => s.destroy());
    this.slashes = [];
    this.particles.forEach(p => p.destroy());
    this.particles = [];

    if (this.damageContainer) {
      this.damageContainer.innerHTML = '';
    }

    // 2. Spawn 3D Player at Arena Center
    this.player = new window.Entities3D.Player3D(this.scene, 0, 0);

    // 3. Reset Timers & Wave State
    this.survivalTime = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1.2;
    this.bossTimer = 0;

    this.state = 'PLAYING';

    // Start BGM & normalize audio filter
    if (window.soundEngine) {
      window.soundEngine.setClubFilter(false);
      window.soundEngine.playBGM();
    }

    this.updateHUD();
  }

  loop(currentTime) {
    const rawDt = (currentTime - this.lastTime) / 1000.0;
    this.lastTime = currentTime;
    const dt = Math.min(rawDt, 0.1);

    if (this.state === 'PLAYING') {
      this.update(dt);
    }

    // Smooth 3D Isometric Camera tracking player
    if (this.player && this.camera) {
      const targetX = this.player.x;
      const targetZ = this.player.z;
      this.camera.position.x += (targetX - this.camera.position.x) * 0.12;
      this.camera.position.z += ((targetZ + 19) - this.camera.position.z) * 0.12;
      this.camera.position.y = 25;
      this.camera.lookAt(this.player.x, 0.8, this.player.z);
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.survivalTime += dt;
    this.bossTimer += dt;

    // 1. Controller Input
    const input = window.inputController.getInput();
    this.player.update(dt, input, this.arenaSize);

    // 2. Player Primary Attack (Arc Cleave)
    if (input.attacking && this.player.attackTimer <= 0) {
      this.performPlayerAttack();
    }

    // 3. Secondary Abilities
    this.updatePlayerAbilities(dt);

    // 4. Wave Spawner
    this.updateEnemySpawning(dt);

    // 5. Boss Wave Encounter
    if (this.bossTimer >= this.bossInterval) {
      this.bossTimer = 0;
      this.spawnBoss();
    }

    // 6. Update Enemies: Continuous tracking towards 3D player coordinates
    const pX = this.player.x;
    const pZ = this.player.z;
    const pRad = this.player.radius;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.trackPlayer(this.player, dt, this.enemies);

      // Collision with player
      const distToPlayer = Math.hypot(enemy.x - pX, enemy.z - pZ);
      if (distToPlayer <= enemy.radius + pRad) {
        const damaged = this.player.takeDamage(enemy.damage);
        if (damaged) {
          this.spawnDamageText(pX, 1.8, pZ, `-${enemy.damage}`, 'player-hurt');
          this.spawnHitParticles(pX, 1.0, pZ, 0xff0055, 6);

          if (this.player.hp <= 0) {
            this.triggerGameOver();
            return;
          }
        }
      }

      if (enemy.dead) {
        this.killEnemy(enemy, i);
      }
    }

    // 7. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(dt);

      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        if (e.dead) continue;
        const d = Math.hypot(e.x - proj.x, e.z - proj.z);
        if (d <= e.radius + proj.radius) {
          e.takeDamage(proj.damage);
          this.spawnDamageText(e.x, 1.4, e.z, `${proj.damage}`);
          this.spawnHitParticles(proj.x, 0.8, proj.z, 0x00f5ff, 4);
          proj.dead = true;
          proj.destroy();
          break;
        }
      }

      if (proj.dead) {
        this.projectiles.splice(i, 1);
      }
    }

    // 8. Update Slash Cleaves
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const slash = this.slashes[i];
      slash.update(dt);
      if (slash.dead) {
        this.slashes.splice(i, 1);
      }
    }

    // 9. Update Gems (EXP Drops)
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      gem.update(dt, this.player);
      if (gem.dead) {
        this.gems.splice(i, 1);

        if (this.player.checkLevelUp()) {
          this.triggerLevelUp();
          return;
        }
      }
    }

    // 10. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.dead) {
        this.particles.splice(i, 1);
      }
    }

    this.updateHUD();
  }

  /**
   * Collision Detection & 3D Attack Execution
   */
  performPlayerAttack() {
    this.player.attackTimer = this.player.attackCooldown;

    const pX = this.player.x;
    const pZ = this.player.z;
    const facing = this.player.facingAngle;
    const range = this.player.attackRange;
    const arc = this.player.attackArc;

    // 3D Animated Slash Arc Mesh
    this.slashes.push(new window.Entities3D.Slash3D(this.scene, pX, pZ, facing, range, arc));

    if (window.soundEngine) {
      window.soundEngine.playSFX('slash', pX, pX, 30);
    }

    // Collision Detection in 3D ground plane against all active enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.dead) continue;

      const dx = enemy.x - pX;
      const dz = enemy.z - pZ;
      const dist = Math.hypot(dx, dz);

      if (dist <= range + enemy.radius) {
        const enemyAngle = Math.atan2(dz, dx);
        let angleDiff = enemyAngle - facing;

        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= arc * 0.5) {
          const isCrit = Math.random() < this.player.critChance;
          const damage = isCrit ? Math.floor(this.player.attackDamage * 2.0) : this.player.attackDamage;

          enemy.takeDamage(damage, enemyAngle, 1.4);

          this.spawnDamageText(enemy.x, 1.5, enemy.z, `${damage}`, isCrit ? 'crit' : '');
          this.spawnHitParticles(enemy.x, 1.0, enemy.z, isCrit ? 0xffd700 : 0x00f5ff, isCrit ? 8 : 4);

          if (window.soundEngine) {
            window.soundEngine.playSFX('hit', enemy.x, pX, 30);
          }
        }
      }
    }
  }

  updatePlayerAbilities(dt) {
    const p = this.player;

    // 1. Plasma Aura
    if (p.hasAura) {
      p.auraTimer += dt;
      if (p.auraTimer >= p.auraTick) {
        p.auraTimer = 0;
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dead) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d <= p.auraRadius + e.radius) {
            e.takeDamage(p.auraDamage);
            this.spawnDamageText(e.x, 1.2, e.z, `${p.auraDamage}`, 'aura');
            this.spawnHitParticles(e.x, 0.8, e.z, 0xff00b4, 2);
          }
        }
      }
    }

    // 2. Seeking Daggers
    if (p.hasDaggers) {
      p.daggerTimer += dt;
      if (p.daggerTimer >= p.daggerCooldown) {
        p.daggerTimer = 0;
        this.fireSeekingDagger();
      }
    }
  }

  fireSeekingDagger() {
    if (this.enemies.length === 0) return;

    let nearest = null;
    let minDist = Infinity;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.player.x, e.z - this.player.z);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }

    if (nearest) {
      const angle = Math.atan2(nearest.z - this.player.z, nearest.x - this.player.x);
      const speed = 22;
      const vx = Math.cos(angle) * speed;
      const vz = Math.sin(angle) * speed;
      this.projectiles.push(new window.Entities3D.Projectile3D(this.scene, this.player.x, this.player.z, vx, vz, 28));
    }
  }

  updateEnemySpawning(dt) {
    this.spawnTimer += dt;
    this.spawnInterval = Math.max(0.28, 1.2 - (this.survivalTime / 90.0) * 0.85);

    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemyWave();
    }
  }

  spawnEnemyWave() {
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 26; // Just outside 3D camera view
    let sx = this.player.x + Math.cos(angle) * spawnDist;
    let sz = this.player.z + Math.sin(angle) * spawnDist;

    const half = this.arenaSize * 0.5 - 3;
    sx = Math.max(-half, Math.min(half, sx));
    sz = Math.max(-half, Math.min(half, sz));

    let type = 'mutant';
    const roll = Math.random();

    if (this.survivalTime > 60 && roll < 0.25) {
      type = 'brute';
    } else if (this.survivalTime > 25 && roll < 0.45) {
      type = 'bat';
    }

    const healthMul = 1.0 + (this.survivalTime / 60.0) * 0.45;
    this.enemies.push(new window.Entities3D.Enemy3D(this.scene, sx, sz, type, healthMul));
  }

  spawnBoss() {
    if (this.bossBanner) {
      this.bossBanner.classList.add('visible');
      setTimeout(() => this.bossBanner.classList.remove('visible'), 3500);
    }

    if (window.soundEngine) {
      window.soundEngine.playSFX('boss_spawn', this.player.x, this.player.x, 30);
    }

    const angle = Math.random() * Math.PI * 2;
    const sx = this.player.x + Math.cos(angle) * 28;
    const sz = this.player.z + Math.sin(angle) * 28;
    const healthMul = 1.0 + (this.survivalTime / 60.0) * 0.85;

    this.enemies.push(new window.Entities3D.Enemy3D(this.scene, sx, sz, 'boss', healthMul));
  }

  killEnemy(enemy, index) {
    this.enemies.splice(index, 1);
    this.player.kills += 1;
    this.player.score += enemy.expValue * 10;

    // Spawn 3D Gem
    this.gems.push(new window.Entities3D.Gem3D(this.scene, enemy.x, enemy.z, enemy.expValue));

    // Death particles
    const color = enemy.type === 'boss' ? 0xff0055 : (enemy.type === 'bat' ? 0xef4444 : (enemy.type === 'brute' ? 0x9333ea : 0x22c55e));
    this.spawnHitParticles(enemy.x, 1.0, enemy.z, color, enemy.type === 'boss' ? 24 : 8);

    enemy.destroy();
  }

  spawnHitParticles(x, y, z, color, count = 5) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new window.Entities3D.Particle3D(this.scene, x, y, z, color));
    }
  }

  /**
   * Project 3D World Coordinates to 2D Screen and Display Floating Damage Text
   */
  spawnDamageText(worldX, worldY, worldZ, text, extraClass = '') {
    if (!this.damageContainer || !this.camera) return;

    const vec = new THREE.Vector3(worldX, worldY, worldZ);
    vec.project(this.camera);

    // Behind camera check
    if (vec.z > 1) return;

    const screenX = (vec.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(vec.y * 0.5) + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = `floating-damage ${extraClass}`.trim();
    el.innerText = text;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;

    this.damageContainer.appendChild(el);

    // Animate upward drift & fade
    requestAnimationFrame(() => {
      el.style.transform = `translate(-50%, -45px)`;
      el.style.opacity = '0';
    });

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 450);
  }

  triggerLevelUp() {
    this.state = 'LEVEL_UP';

    if (window.soundEngine) {
      window.soundEngine.setClubFilter(true);
    }

    const shuffled = [...this.availableUpgrades].sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, 3);

    const modal = document.getElementById('levelup-modal');
    const container = document.getElementById('upgrade-cards');
    if (!container || !modal) return;

    container.innerHTML = '';
    choices.forEach((upg) => {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="upgrade-icon">${upg.icon}</div>
        <div class="upgrade-info">
          <div class="upgrade-title">${upg.name}</div>
          <div class="upgrade-desc">${upg.desc}</div>
        </div>
      `;

      const selectUpg = (e) => {
        e.preventDefault();
        upg.apply(this.player);
        modal.classList.remove('active');
        this.state = 'PLAYING';

        if (window.soundEngine) {
          window.soundEngine.setClubFilter(false);
        }
      };

      card.addEventListener('click', selectUpg);
      card.addEventListener('touchstart', selectUpg, { passive: false });
      container.appendChild(card);
    });

    modal.classList.add('active');
  }

  triggerGameOver() {
    this.state = 'GAME_OVER';

    if (window.soundEngine) {
      window.soundEngine.stopBGM();
      window.soundEngine.playSFX('gameover', this.player.x, this.player.x, 30);
    }

    const modal = document.getElementById('gameover-modal');
    const finalScoreEl = document.getElementById('go-final-score');
    const finalTimeEl = document.getElementById('go-final-time');
    const finalKillsEl = document.getElementById('go-final-kills');
    const inputName = document.getElementById('player-name-input');
    const inputRoom = document.getElementById('gameover-room-code');

    if (finalScoreEl) finalScoreEl.innerText = this.player.score.toLocaleString();
    if (finalTimeEl) finalTimeEl.innerText = this.formatTime(this.survivalTime);
    if (finalKillsEl) finalKillsEl.innerText = this.player.kills.toString();

    // Auto-fill active player name & room code
    if (inputName && window.supabaseLeaderboard) {
      inputName.value = window.supabaseLeaderboard.currentPlayerName;
    }
    if (inputRoom && window.supabaseLeaderboard) {
      inputRoom.value = window.supabaseLeaderboard.currentRoomCode;
    }

    if (modal) modal.classList.add('active');
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  updateHUD() {
    if (this.hudTime) this.hudTime.innerText = this.formatTime(this.survivalTime);
    if (this.hudKills) this.hudKills.innerText = this.player ? this.player.kills : 0;
    if (this.hudScore) this.hudScore.innerText = this.player ? this.player.score.toLocaleString() : 0;
    if (this.hudLevel) this.hudLevel.innerText = `LV ${this.player ? this.player.level : 1}`;

    if (this.player) {
      const hpPct = Math.max(0, Math.min(100, (this.player.hp / this.player.maxHp) * 100));
      if (this.hudHpBar) this.hudHpBar.style.width = `${hpPct}%`;
      if (this.hudHpText) this.hudHpText.innerText = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}`;

      const expPct = Math.max(0, Math.min(100, (this.player.exp / this.player.expToNext) * 100));
      if (this.hudExpBar) this.hudExpBar.style.width = `${expPct}%`;

      if (this.hudDashCd) {
        const dashCdPct = this.player.dashTimer > 0 ? (this.player.dashTimer / this.player.dashCooldown) * 100 : 0;
        this.hudDashCd.style.height = `${dashCdPct}%`;
      }
    }
  }
}

window.game = new Game3D();
