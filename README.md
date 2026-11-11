# ⚔️ Pixel Survivor 3D - Cyberpunk Arena Survival

A top-down 3D arena survival web game built with **Three.js (WebGL)**, **HTML5**, **CSS3**, and **Vanilla JavaScript**. Engineered for high touch responsiveness on Android tablets, featuring global real-time leaderboards via **Supabase**, and a **Web Audio API** engine equipped with precision **Equal-Power IEM Channel Balancing** to eliminate left-channel bias on wired In-Ear Monitors.

100% static client-side application — **ready for instant deployment on Vercel**.

---

## 🚀 Key Features & Specifications

### 1. 🌐 3D WebGL Arena & Top-Down Isometric Camera (Three.js)
- **Three.js WebGL Engine**: Hardware-accelerated 3D graphics rendering with dynamic shadows, ambient & directional lighting, and particle effects.
- **Isometric Follow Camera**: Smooth overhead perspective camera that dynamically tracks the player across a 120x120 cyberpunk grid arena bounded by glowing neon laser walls.
- **Low-Poly Cyberpunk Entities**:
  - 3D Survivor with illuminated cyan visor, bobbing run animations, and swinging Energy Katana.
  - Multi-tier 3D enemies: Toxic Crawlers, swooping Crimson Bats with flapping wings, Armored Brutes, and Colossal Cyber Bosses.
  - 3D rotating and floating Octahedron EXP Crystals with emissive glow.
  - 3D curved energy arc meshes (`Slash3D`) with additive blending.
  - Screen-projected floating 3D combat damage text.

---

### 2. 🕹️ Touch Controls (Android Tablet Optimized) & Desktop Fallback
- **Virtual Joystick on Left**: Low-level touch event tracking (`touchstart`, `touchmove`, `touchend`, `touchcancel`) with `{ passive: false }` and `e.preventDefault()` to suppress Android browser gestures (pull-to-refresh, pinch zoom, swipe navigation).
- **Multi-Touch Isolation (`touch.identifier`)**: Left thumb joystick movement and right thumb attacks operate completely independently without cross-touch locking.
- **Right Action Buttons**:
  - `⚔️ ATTACK`: High-response weapon swing with visual active feedback.
  - `⚡ DASH`: Rapid evasive thruster dash with cooldown visual overlay.
  - `AUTO-ATTACK TOGGLE`: Hands-free attack toggle for long tablet survival sessions.
- **Desktop Keyboard Support**: WASD or Arrow keys to move, Space or Left Click to attack, Shift for dash.
- **Fullscreen API**: One-click fullscreen button on HUD to hide Android navigation and address bars.

---

### 3. ⚡ Core Gameplay & Survival Mechanics
- **`requestAnimationFrame` 3D Game Loop**: Delta time (`dt`) clamped physics loop for consistent frame rates on 60Hz, 90Hz, and 120Hz displays.
- **Continuous 3D Enemy Tracking AI**:
  - Enemies continuously track player $(X, Z)$ coordinates with soft flocking/separation to prevent clumping.
- **Attack Range Arc Cleave Collision**:
  - Validates Euclidean distance and angular difference $|\Delta\theta| \le \text{arc} / 2$ in 3D ground plane.
- **Level Up Augments**: 7 unique upgrade modules (Plasma Blade, Cleave Range, Anti-Grav Thrusters, Plasma Shield Aura, Seeking Daggers, Crystal Magnet, Nanobot Armor).
- **Boss Wave Encounters**: Massive Cyber Titan spawns every 60 seconds with warning siren SFX and on-screen alert banner.

---

### 4. ☁️ Supabase Cloud Integration (Private Real-Time Leaderboards)
- **SDK**: Loaded via official CDN `@supabase/supabase-js@2`.
- **Private Room Codes**: Players can enter custom room codes (e.g. `SQUAD_X`, `DEV_ROOM`, `GLOBAL`) to play with friends or guilds.
- **Filtered Queries**: Highscores are queried using `.eq('room_code', roomCode)` ordered by `skor_tertinggi DESC` and limited to the top 10 records.
- **Score Submission**: Final survival score submitted to table `highscores` as `{ nama, skor_tertinggi, room_code }` on Game Over.
- **Real-Time Room Subscription**: Listens to PostgreSQL `INSERT` events via WebSocket and updates the leaderboard live when an insert belongs to the active room.
- **Play Again Option**: Added directly inside the Leaderboard modal so players can immediately jump into another run.
- **Offline Fallback**: Automatically stores scores in `localStorage` filtered by room code when offline or before Supabase keys are configured.

#### Supabase Table SQL Schema:
```sql
CREATE TABLE highscores (
  id BIGSERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  skor_tertinggi INTEGER NOT NULL,
  room_code TEXT NOT NULL DEFAULT 'GLOBAL',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for high-speed private room queries
CREATE INDEX idx_highscores_room_score ON highscores (room_code, skor_tertinggi DESC);

ALTER TABLE highscores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select" ON highscores FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON highscores FOR INSERT WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE highscores;
```

---

### 5. 🎧 Web Audio API & Precision IEM Channel Balancing
Specifically addresses left-channel bias often experienced on wired In-Ear Monitors (IEMs) plugged into mobile USB-C DAC dongles:

#### Audio Pipeline:
```
[Sound Sources: SFX / BGM]
           │
           ▼
     [MasterGain]
           │
           ▼
     [DJ Club LPF]                <-- Muffled club filter during Level Up / Pause
           │
           ▼
[ChannelSplitterNode (L / R)]
     │             │
     ▼             ▼
[LeftTrimGain]  [RightTrimGain]   <-- Equal-Power Micro-Trim Calibration
     │             │
     ▼             ▼
 [LeftAnalyser]  [RightAnalyser]  <-- Real-time Stereo VU Meter Visualizer
     │             │
     ▼             ▼
 [ChannelMergerNode (Stereo)]
           │
           ▼
  [StereoPannerNode]              <-- Fine Center Calibration
           │
           ▼
 [AudioContext.destination]
```

- **Equal-Power Law**:
  $$\text{Gain}_L = \cos\left((\text{balance} + 1) \cdot \frac{\pi}{4}\right) \times \sqrt{2}, \quad \text{Gain}_R = \sin\left((\text{balance} + 1) \cdot \frac{\pi}{4}\right) \times \sqrt{2}$$
  Guarantees constant acoustic power ($G_L^2 + G_R^2 = 2.0$) without volume drop or digital clipping.
- **Live Stereo VU Meter**: Displays animated Left vs Right channel output bars in the Settings modal in real time.
- **Built-in House Synthesizer**: 124 BPM 4-on-the-floor kick (909 pitch envelope), offbeat hi-hats, electro bass, and French house chord stabs.
- **FLAC Support**: Natively decodes external `.flac` files via `AudioContext.decodeAudioData`.

---

## 🚢 Deploying to Vercel

```bash
# In the d:\CODING directory
vercel --prod
```
Or push to GitHub and import into [Vercel Dashboard](https://vercel.com/dashboard) with zero configuration needed.
