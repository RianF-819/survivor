/**
 * Pixel Survivor 3D - Multi-Platform Input Controller (PC & Touch Tablet)
 * Features:
 * - Dedicated PC Keyboard (WASD, Arrow Keys, Space, Shift, E, Tab, Esc)
 * - 3D Mouse Crosshair Aiming using Three.js Raycasting
 * - Left Click Attack & Right Click Dash with ContextMenu Suppression
 * - Mobile / Tablet Virtual Joystick with Multi-Touch Tracking
 * - Auto-Detection of PC vs Touch Mode + Toggle Switch
 */

class InputController {
  constructor() {
    // Current input state consumed by game loop
    this.moveX = 0;      // -1.0 to 1.0 (X axis)
    this.moveY = 0;      // -1.0 to 1.0 (Z axis in 3D world)
    this.isAttacking = false;
    this.isDashing = false;
    this.autoAttack = false;

    // Facing angle in radians
    this.facingAngle = 0;
    this.mouseAimActive = false;
    this.mouseX = 0;
    this.mouseY = 0;

    // Platform mode: 'pc' or 'touch'
    this.mode = 'pc';

    // Touch Virtual Joystick Configuration
    this.joystickTouchId = null;
    this.joystickBase = null;
    this.joystickStick = null;
    this.joystickZone = null;

    this.baseRadius = 60;
    this.deadZone = 8;
    this.baseX = 0;
    this.baseY = 0;

    // Keyboard state tracking
    this.keys = {};

    // 3D Raycasting references
    this.raycaster = null;
    this.groundPlane = null;
    this.targetPoint = null;
  }

  init() {
    this.joystickZone = document.getElementById('joystick-zone');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickStick = document.getElementById('joystick-stick');

    this.btnAttack = document.getElementById('btn-attack');
    this.btnDash = document.getElementById('btn-dash');
    this.btnAutoAttack = document.getElementById('btn-auto-attack');
    this.touchControlsEl = document.getElementById('touch-controls');
    this.pcControlsBar = document.getElementById('pc-controls-bar');
    this.customCursor = document.getElementById('custom-crosshair');

    // Setup 3D Raycasting if Three.js is ready
    if (typeof THREE !== 'undefined') {
      this.raycaster = new THREE.Raycaster();
      this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Ground Y = 0
      this.targetPoint = new THREE.Vector3();
    }

    this.setupKeyboardEvents();
    this.setupMouseEvents();
    this.setupTouchEvents();
    this.setupPlatformAutoDetect();
  }

  /**
   * Auto-detect PC vs Touch Device & set appropriate UI layout
   */
  setupPlatformAutoDetect() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.setControlMode(isTouch ? 'touch' : 'pc');

    // If mouse moves, switch smoothly to PC mode
    window.addEventListener('mousemove', () => {
      if (this.mode !== 'pc') {
        this.setControlMode('pc');
      }
    }, { once: true });

    // If touch begins on joystick zone, switch to touch mode
    if (this.joystickZone) {
      this.joystickZone.addEventListener('touchstart', () => {
        if (this.mode !== 'touch') {
          this.setControlMode('touch');
        }
      }, { passive: true });
    }
  }

  setControlMode(mode) {
    this.mode = mode;
    document.body.classList.toggle('mode-pc', mode === 'pc');
    document.body.classList.toggle('mode-touch', mode === 'touch');

    if (this.touchControlsEl) {
      this.touchControlsEl.style.display = mode === 'touch' ? 'block' : 'none';
    }
    if (this.pcControlsBar) {
      this.pcControlsBar.style.display = mode === 'pc' ? 'flex' : 'none';
    }
    if (this.customCursor) {
      this.customCursor.style.display = mode === 'pc' ? 'block' : 'none';
    }
  }

  /**
   * Dedicated PC Keyboard Controls
   */
  setupKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      // Prevent browser default actions (scrolling on Space/Arrows, activating focused buttons)
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }

      // Ensure no UI button stays focused to prevent accidental click on Space
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }

      this.keys[e.code] = true;

      // Attacks: Space or KeyJ
      if (['Space', 'KeyJ'].includes(e.code)) {
        this.isAttacking = true;
      }

      // Dash: Shift or KeyK
      if (['ShiftLeft', 'ShiftRight', 'KeyK'].includes(e.code)) {
        this.isDashing = true;
      }

      // Toggle Auto-Attack: KeyE
      if (e.code === 'KeyE') {
        this.toggleAutoAttack();
      }

      // Quick Leaderboard: Tab
      if (e.code === 'Tab') {
        const lbModal = document.getElementById('leaderboard-modal');
        if (lbModal) {
          const isActive = lbModal.classList.contains('active');
          if (isActive) {
            lbModal.classList.remove('active');
          } else {
            lbModal.classList.add('active');
            if (typeof refreshLeaderboardUI === 'function') refreshLeaderboardUI();
          }
        }
      }

      // Quick Pause / Settings: Escape or KeyP
      if (['Escape', 'KeyP'].includes(e.code)) {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
          settingsModal.classList.toggle('active');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }

      this.keys[e.code] = false;

      if (['Space', 'KeyJ'].includes(e.code)) {
        this.isAttacking = false;
      }
      if (['ShiftLeft', 'ShiftRight', 'KeyK'].includes(e.code)) {
        this.isDashing = false;
      }
    });
  }

  /**
   * Dedicated PC Mouse Aiming & Attacks
   */
  setupMouseEvents() {
    // 1. Mouse Movement & 3D Crosshair Aiming
    window.addEventListener('mousemove', (e) => {
      this.mouseAimActive = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;

      // Move custom crosshair element
      if (this.customCursor) {
        this.customCursor.style.left = `${e.clientX}px`;
        this.customCursor.style.top = `${e.clientY}px`;
      }

      // Calculate 3D facing angle towards mouse cursor
      this.update3DMouseAim(e.clientX, e.clientY);
    });

    // 2. Mouse Click Controls: Left Click = Attack, Right Click = Dash
    window.addEventListener('mousedown', (e) => {
      // Ignore clicks on UI modals or buttons
      if (e.target.closest('.modal-box, #hud, .touch-btn, .hud-btn')) return;

      if (e.button === 0) { // Left Click = Attack
        this.isAttacking = true;
      } else if (e.button === 2) { // Right Click = Dash
        e.preventDefault();
        this.isDashing = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isAttacking = false;
      if (e.button === 2) this.isDashing = false;
    });

    // Suppress default context menu on right click
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  /**
   * Raycast from camera through 2D mouse position to 3D ground plane (Y = 0)
   */
  update3DMouseAim(clientX, clientY) {
    if (!window.game || !window.game.camera || !window.game.player) return;
    if (!this.raycaster || !this.groundPlane || !this.targetPoint) return;

    const ndcX = (clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, window.game.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.targetPoint);

    if (hit) {
      const p = window.game.player;
      // Calculate angle from player 3D position to intersection point
      // X = horizontal, Z = vertical in 3D ground plane
      const dx = this.targetPoint.x - p.x;
      const dz = this.targetPoint.z - p.z;
      this.facingAngle = Math.atan2(dz, dx);
    }
  }

  /**
   * Touch Virtual Joystick for Tablet/Mobile
   */
  setupTouchEvents() {
    if (!this.joystickZone) return;

    const onJoystickStart = (e) => {
      e.preventDefault();
      if (this.joystickTouchId !== null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const rect = this.joystickZone.getBoundingClientRect();

        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {

          this.joystickTouchId = touch.identifier;
          this.mouseAimActive = false;
          this.baseX = touch.clientX;
          this.baseY = touch.clientY;

          this.joystickBase.style.left = `${this.baseX}px`;
          this.joystickBase.style.top = `${this.baseY}px`;
          this.joystickBase.classList.add('active');

          this.updateStickPosition(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onJoystickMove = (e) => {
      e.preventDefault();
      if (this.joystickTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickTouchId) {
          this.updateStickPosition(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onJoystickEnd = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickTouchId) {
          this.resetJoystick();
          break;
        }
      }
    };

    this.joystickZone.addEventListener('touchstart', onJoystickStart, { passive: false });
    window.addEventListener('touchmove', onJoystickMove, { passive: false });
    window.addEventListener('touchend', onJoystickEnd, { passive: false });
    window.addEventListener('touchcancel', onJoystickEnd, { passive: false });

    // Touch Action Buttons
    if (this.btnAttack) {
      this.btnAttack.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isAttacking = true;
        this.btnAttack.classList.add('pressed');
      }, { passive: false });

      const endAttack = (e) => {
        e.preventDefault();
        this.isAttacking = false;
        this.btnAttack.classList.remove('pressed');
      };
      this.btnAttack.addEventListener('touchend', endAttack, { passive: false });
      this.btnAttack.addEventListener('touchcancel', endAttack, { passive: false });
    }

    if (this.btnDash) {
      this.btnDash.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isDashing = true;
        this.btnDash.classList.add('pressed');
      }, { passive: false });

      const endDash = (e) => {
        e.preventDefault();
        this.isDashing = false;
        this.btnDash.classList.remove('pressed');
      };
      this.btnDash.addEventListener('touchend', endDash, { passive: false });
      this.btnDash.addEventListener('touchcancel', endDash, { passive: false });
    }

    if (this.btnAutoAttack) {
      const toggle = (e) => {
        e.preventDefault();
        this.toggleAutoAttack();
      };
      this.btnAutoAttack.addEventListener('click', toggle);
      this.btnAutoAttack.addEventListener('touchstart', toggle, { passive: false });
    }
  }

  toggleAutoAttack() {
    this.autoAttack = !this.autoAttack;
    if (this.btnAutoAttack) {
      this.btnAutoAttack.classList.toggle('active', this.autoAttack);
      this.btnAutoAttack.setAttribute('aria-pressed', this.autoAttack.toString());
      this.btnAutoAttack.innerText = this.autoAttack ? 'AUTO-ATTACK: ON' : 'AUTO-ATTACK: OFF';
    }
    const pcAutoEl = document.getElementById('pc-auto-status');
    if (pcAutoEl) {
      pcAutoEl.innerText = this.autoAttack ? 'ON' : 'OFF';
      pcAutoEl.style.color = this.autoAttack ? 'var(--neon-green)' : 'var(--neon-cyan)';
    }
  }

  updateStickPosition(touchX, touchY) {
    const dx = touchX - this.baseX;
    const dy = touchY - this.baseY;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.deadZone) {
      this.moveX = 0;
      this.moveY = 0;
      this.joystickStick.style.transform = `translate(0px, 0px)`;
      return;
    }

    const angle = Math.atan2(dy, dx);
    if (!this.mouseAimActive) {
      this.facingAngle = angle;
    }

    const clampedDist = Math.min(dist, this.baseRadius);
    const intensity = (clampedDist - this.deadZone) / (this.baseRadius - this.deadZone);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    this.joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

    this.moveX = Math.cos(angle) * intensity;
    this.moveY = Math.sin(angle) * intensity;
  }

  resetJoystick() {
    this.joystickTouchId = null;
    this.moveX = 0;
    this.moveY = 0;
    if (this.joystickStick) {
      this.joystickStick.style.transform = `translate(0px, 0px)`;
    }
    if (this.joystickBase) {
      this.joystickBase.classList.remove('active');
    }
  }

  /**
   * Consolidate keyboard + joystick input vector & facing angle
   */
  getInput() {
    let kx = 0;
    let ky = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) ky -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) ky += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kx += 1;

    let finalX = this.moveX;
    let finalY = this.moveY;

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky);
      finalX = kx / len;
      finalY = ky / len;

      // If mouse is not actively aiming, face keyboard movement direction
      if (!this.mouseAimActive) {
        this.facingAngle = Math.atan2(finalY, finalX);
      }
    }

    // Continuously update mouse aim so player tracks cursor even while moving or standing still
    if (this.mouseAimActive && this.mouseX !== 0 && this.mouseY !== 0) {
      this.update3DMouseAim(this.mouseX, this.mouseY);
    }

    return {
      x: finalX,
      y: finalY,
      facingAngle: this.facingAngle,
      attacking: this.isAttacking || this.autoAttack,
      dashing: this.isDashing
    };
  }
}

window.inputController = new InputController();
