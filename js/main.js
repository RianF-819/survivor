/**
 * Pixel Survivor 3D - Main Application Controller
 * Handles UI Modals, Audio Engine, Supabase Realtime, and Game Lifecycle.
 * Language: English.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Subsystems
  window.inputController.init();
  window.game.init();

  // Initialize Supabase with real-time update listener
  window.supabaseLeaderboard.init((newRow) => {
    console.log('Real-time highscore notification received:', newRow);
    refreshLeaderboardUI();
    showToastNotification(`New Record: ${newRow.nama} (${(newRow.skor_tertinggi || 0).toLocaleString()} PTS)`);
  });

  // 2. Setup UI Modals & Handlers
  setupStartScreen();
  setupGameOverModal();
  setupLeaderboardModal();
  setupSettingsModal();
  setupSupabaseConfigModal();
  setupFullscreenToggle();
  setupControlsToggle();

  // Load initial leaderboard
  refreshLeaderboardUI();
});

/**
 * Start Screen wiring: initializes player profile & private room code inputs
 */
function setupStartScreen() {
  const startModal = document.getElementById('start-modal');
  const btnStart = document.getElementById('btn-start-game');
  const btnOpenLb = document.getElementById('btn-open-leaderboard');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnOpenSupa = document.getElementById('btn-open-supabase-config');

  const startNameInput = document.getElementById('start-player-name');
  const startRoomInput = document.getElementById('start-room-code');

  // Prepopulate saved player name & room code
  if (startNameInput) startNameInput.value = window.supabaseLeaderboard.currentPlayerName;
  if (startRoomInput) startRoomInput.value = window.supabaseLeaderboard.currentRoomCode;

  const startGameHandler = async (e) => {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    // Store active player name & room code
    if (startNameInput) window.supabaseLeaderboard.setPlayerName(startNameInput.value);
    if (startRoomInput) window.supabaseLeaderboard.setRoomCode(startRoomInput.value);

    if (window.soundEngine) {
      await window.soundEngine.init();
    }
    startModal.classList.remove('active');
    window.game.startNewGame();
  };

  btnStart.addEventListener('click', startGameHandler);
  btnStart.addEventListener('touchstart', startGameHandler, { passive: false });

  btnOpenLb.addEventListener('click', () => {
    if (startRoomInput) window.supabaseLeaderboard.setRoomCode(startRoomInput.value);
    refreshLeaderboardUI();
    openModal('leaderboard-modal');
  });
  btnOpenSettings.addEventListener('click', () => openModal('settings-modal'));
  btnOpenSupa.addEventListener('click', () => openModal('supabase-config-modal'));
}

/**
 * Game Over Modal wiring: handles player name, room code submission & Supabase insert
 */
function setupGameOverModal() {
  const modal = document.getElementById('gameover-modal');
  const inputName = document.getElementById('player-name-input');
  const inputRoom = document.getElementById('gameover-room-code');
  const btnSubmit = document.getElementById('btn-submit-score');
  const btnRestart = document.getElementById('btn-restart');
  const statusMsg = document.getElementById('go-submit-status');

  // Sync inputs with current session
  if (inputName) inputName.value = window.supabaseLeaderboard.currentPlayerName;
  if (inputRoom) inputRoom.value = window.supabaseLeaderboard.currentRoomCode;

  btnSubmit.addEventListener('click', async () => {
    const name = (inputName.value || 'Survivor').trim();
    const room = (inputRoom ? inputRoom.value : window.supabaseLeaderboard.currentRoomCode).trim().toUpperCase();
    const score = window.game.player ? window.game.player.score : 0;

    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Submitting...';
    statusMsg.className = 'status-msg';
    statusMsg.innerText = `Uploading score to Room [${room}]...`;

    const result = await window.supabaseLeaderboard.submitScore(name, score, room);

    btnSubmit.disabled = false;
    btnSubmit.innerText = 'SUBMIT SCORE';

    if (result.success) {
      statusMsg.className = 'status-msg success';
      statusMsg.innerText = result.source === 'supabase'
        ? `✓ Uploaded to Supabase Cloud (Room: ${room})!`
        : `✓ Saved locally in Room [${room}] (Offline Mode)`;

      setTimeout(() => {
        modal.classList.remove('active');
        refreshLeaderboardUI(room);
        openModal('leaderboard-modal');
      }, 700);
    } else {
      statusMsg.className = 'status-msg error';
      statusMsg.innerText = `Error: ${result.error || 'Failed to submit'}`;
    }
  });

  const restartHandler = (e) => {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    modal.classList.remove('active');
    statusMsg.innerText = '';
    window.game.startNewGame();
  };

  btnRestart.addEventListener('click', restartHandler);
  btnRestart.addEventListener('touchstart', restartHandler, { passive: false });
}

/**
 * Real-time Private Leaderboard Modal wiring:
 * Features room code filter input, live updates, and Play Again restart
 */
function setupLeaderboardModal() {
  const modal = document.getElementById('leaderboard-modal');
  const btnClose = document.getElementById('btn-close-lb');
  const btnRefresh = document.getElementById('btn-refresh-lb');
  const btnRestart = document.getElementById('btn-lb-restart');
  const roomFilterInput = document.getElementById('lb-room-filter-input');
  const btnFilter = document.getElementById('btn-lb-filter');

  if (roomFilterInput) {
    roomFilterInput.value = window.supabaseLeaderboard.currentRoomCode;
  }

  // Room Filter Trigger
  if (btnFilter && roomFilterInput) {
    const applyFilter = (e) => {
      e.preventDefault();
      const targetRoom = (roomFilterInput.value || 'GLOBAL').trim().toUpperCase();
      window.supabaseLeaderboard.setRoomCode(targetRoom);
      refreshLeaderboardUI(targetRoom);
    };

    btnFilter.addEventListener('click', applyFilter);
    roomFilterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyFilter(e);
    });
  }

  // Close Button
  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.remove('active');
      if (window.game.state === 'GAME_OVER') {
        const goModal = document.getElementById('gameover-modal');
        if (goModal) goModal.classList.add('active');
      }
    });
  }

  // Restart / Play Again directly from Leaderboard
  if (btnRestart) {
    const handleRestart = (e) => {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      modal.classList.remove('active');
      const goModal = document.getElementById('gameover-modal');
      if (goModal) goModal.classList.remove('active');
      const startModal = document.getElementById('start-modal');
      if (startModal) startModal.classList.remove('active');
      window.game.startNewGame();
    };

    btnRestart.addEventListener('click', handleRestart);
    btnRestart.addEventListener('touchstart', handleRestart, { passive: false });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => refreshLeaderboardUI());
  }
}

async function refreshLeaderboardUI(roomCode = null) {
  const listEl = document.getElementById('leaderboard-list');
  const statusBadge = document.getElementById('lb-connection-status');
  const roomFilterInput = document.getElementById('lb-room-filter-input');
  if (!listEl) return;

  const targetRoom = (roomCode || window.supabaseLeaderboard.currentRoomCode || 'GLOBAL').trim().toUpperCase();
  if (roomFilterInput && roomFilterInput.value !== targetRoom) {
    roomFilterInput.value = targetRoom;
  }

  listEl.innerHTML = `<div class="lb-loading">Loading rankings for Room [${targetRoom}]...</div>`;

  const isConnected = window.supabaseLeaderboard.isConnected;
  if (statusBadge) {
    statusBadge.className = isConnected ? 'status-badge connected' : 'status-badge offline';
    statusBadge.innerText = isConnected
      ? `● Supabase Realtime (Room: ${targetRoom})`
      : `○ Offline / Local Mode (Room: ${targetRoom})`;
  }

  // Fetch top 10 scores filtered by .eq('room_code', targetRoom)
  const scores = await window.supabaseLeaderboard.getTopScores(targetRoom, 10);
  listEl.innerHTML = '';

  if (!scores || scores.length === 0) {
    listEl.innerHTML = `<div class="lb-empty">No scores recorded yet in Room [${targetRoom}]. Be the first champion!</div>`;
    return;
  }

  scores.forEach((row, idx) => {
    const item = document.createElement('div');
    item.className = `lb-item rank-${idx + 1}`;
    item.id = `lb-row-${row.id || idx}`;

    let medal = `${idx + 1}`;
    if (idx === 0) medal = '🥇';
    if (idx === 1) medal = '🥈';
    if (idx === 2) medal = '🥉';

    item.innerHTML = `
      <div class="lb-rank">${medal}</div>
      <div class="lb-name">${escapeHTML(row.nama)}</div>
      <div class="lb-score">${(row.skor_tertinggi || 0).toLocaleString()} PTS</div>
    `;
    listEl.appendChild(item);
  });
}

/**
 * Settings Modal & Precision IEM Stereo Balancing
 */
function setupSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const btnClose = document.getElementById('btn-close-settings');

  // Sliders
  const masterVol = document.getElementById('vol-master');
  const bgmVol = document.getElementById('vol-bgm');
  const sfxVol = document.getElementById('vol-sfx');

  // IEM Precision Balance Slider
  const iemBalanceSlider = document.getElementById('iem-balance-slider');
  const iemBalanceVal = document.getElementById('iem-balance-val');
  const btnResetBalance = document.getElementById('btn-reset-balance');
  const btnNudgeLeft = document.getElementById('btn-nudge-left');
  const btnNudgeRight = document.getElementById('btn-nudge-right');

  // IEM Audio Calibration Test Tools
  const btnTestCenterNoise = document.getElementById('btn-test-center-noise');
  const btnTestPingSequence = document.getElementById('btn-test-ping-sequence');

  // BGM Selector & FLAC Uploader
  const bgmModeSelect = document.getElementById('bgm-mode-select');
  const flacFileInput = document.getElementById('flac-file-input');
  const flacUploadStatus = document.getElementById('flac-upload-status');

  // Real-time Stereo VU Meter Loop
  const meterFillL = document.getElementById('meter-fill-l');
  const meterFillR = document.getElementById('meter-fill-r');
  const meterValL = document.getElementById('meter-val-l');
  const meterValR = document.getElementById('meter-val-r');

  function updateStereoMeterLoop() {
    if (modal.classList.contains('active') && window.soundEngine) {
      const levels = window.soundEngine.getStereoLevels();
      const pctL = Math.round(levels.left * 100);
      const pctR = Math.round(levels.right * 100);

      if (meterFillL) meterFillL.style.width = `${pctL}%`;
      if (meterFillR) meterFillR.style.width = `${pctR}%`;
      if (meterValL) meterValL.innerText = `${pctL}%`;
      if (meterValR) meterValR.innerText = `${pctR}%`;
    }
    requestAnimationFrame(updateStereoMeterLoop);
  }
  requestAnimationFrame(updateStereoMeterLoop);

  if (btnClose) {
    btnClose.addEventListener('click', () => modal.classList.remove('active'));
  }

  // Volume listeners
  if (masterVol) {
    masterVol.addEventListener('input', (e) => window.soundEngine.setMasterVolume(parseFloat(e.target.value)));
  }
  if (bgmVol) {
    bgmVol.addEventListener('input', (e) => window.soundEngine.setBGMVolume(parseFloat(e.target.value)));
  }
  if (sfxVol) {
    sfxVol.addEventListener('input', (e) => window.soundEngine.setSFXVolume(parseFloat(e.target.value)));
  }

  // IEM Balance display
  const updateBalanceDisplay = (val) => {
    let text = '0.00 (Dead Center)';
    if (val > 0.005) {
      text = `+${val.toFixed(2)} Right (IEM Left Bias Fix)`;
    } else if (val < -0.005) {
      text = `${val.toFixed(2)} Left (IEM Right Bias Fix)`;
    }
    if (iemBalanceVal) iemBalanceVal.innerText = text;
  };

  if (iemBalanceSlider) {
    iemBalanceSlider.value = window.soundEngine.channelBalance.toString();
    updateBalanceDisplay(window.soundEngine.channelBalance);

    iemBalanceSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      window.soundEngine.setChannelBalance(val);
      updateBalanceDisplay(val);
    });
  }

  if (btnResetBalance) {
    btnResetBalance.addEventListener('click', () => {
      if (iemBalanceSlider) iemBalanceSlider.value = '0';
      window.soundEngine.setChannelBalance(0.0);
      updateBalanceDisplay(0.0);
    });
  }

  if (btnNudgeRight) {
    btnNudgeRight.addEventListener('click', () => {
      const cur = parseFloat(iemBalanceSlider.value || '0');
      const next = Math.min(1.0, cur + 0.05);
      iemBalanceSlider.value = next.toFixed(2);
      window.soundEngine.setChannelBalance(next);
      updateBalanceDisplay(next);
    });
  }

  if (btnNudgeLeft) {
    btnNudgeLeft.addEventListener('click', () => {
      const cur = parseFloat(iemBalanceSlider.value || '0');
      const next = Math.max(-1.0, cur - 0.05);
      iemBalanceSlider.value = next.toFixed(2);
      window.soundEngine.setChannelBalance(next);
      updateBalanceDisplay(next);
    });
  }

  if (btnTestCenterNoise) {
    btnTestCenterNoise.addEventListener('click', async () => {
      await window.soundEngine.init();
      window.soundEngine.playCalibrationNoise(2.2);
    });
  }

  if (btnTestPingSequence) {
    btnTestPingSequence.addEventListener('click', async () => {
      await window.soundEngine.init();
      window.soundEngine.pingStereoSequence();
    });
  }

  if (bgmModeSelect) {
    bgmModeSelect.addEventListener('change', (e) => {
      window.soundEngine.bgmMode = e.target.value;
      if (window.soundEngine.bgmPlaying) {
        window.soundEngine.stopBGM();
        window.soundEngine.playBGM();
      }
    });
  }

  if (flacFileInput) {
    flacFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      flacUploadStatus.innerText = `Decoding ${file.name}...`;
      const ok = await window.soundEngine.loadFLACFromFile(file);

      if (ok) {
        flacUploadStatus.className = 'status-msg success';
        flacUploadStatus.innerText = `✓ FLAC Loaded: ${file.name}`;
        if (bgmModeSelect) bgmModeSelect.value = 'flac';
      } else {
        flacUploadStatus.className = 'status-msg error';
        flacUploadStatus.innerText = 'Failed to decode FLAC audio format.';
      }
    });
  }
}

/**
 * Supabase Config Modal wiring
 */
function setupSupabaseConfigModal() {
  const modal = document.getElementById('supabase-config-modal');
  const btnClose = document.getElementById('btn-close-supa-config');
  const inputUrl = document.getElementById('supa-url-input');
  const inputKey = document.getElementById('supa-key-input');
  const btnSave = document.getElementById('btn-save-supa');
  const statusEl = document.getElementById('supa-config-status');
  const btnCopySql = document.getElementById('btn-copy-sql');
  const sqlCodeEl = document.getElementById('supabase-sql-code');

  if (btnClose) {
    btnClose.addEventListener('click', () => modal.classList.remove('active'));
  }

  if (btnCopySql && sqlCodeEl) {
    btnCopySql.addEventListener('click', () => {
      navigator.clipboard.writeText(sqlCodeEl.innerText).then(() => {
        btnCopySql.innerText = '✓ Copied!';
        setTimeout(() => { btnCopySql.innerText = '📋 Copy SQL'; }, 2000);
      }).catch(() => {
        btnCopySql.innerText = 'Selected!';
      });
    });
  }

  if (inputUrl) inputUrl.value = window.supabaseLeaderboard.supabaseUrl;
  if (inputKey) inputKey.value = window.supabaseLeaderboard.supabaseKey;

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const url = (inputUrl ? inputUrl.value : '').trim();
      const key = (inputKey ? inputKey.value : '').trim();

      if (!url || !key) {
        statusEl.className = 'status-msg error';
        statusEl.innerText = 'Please enter both Supabase URL and Anon Key.';
        return;
      }

      btnSave.disabled = true;
      btnSave.innerText = 'TESTING...';
      statusEl.className = 'status-msg';
      statusEl.innerText = 'Testing connection to Supabase...';

      const result = await window.supabaseLeaderboard.configure(url, key);

      btnSave.disabled = false;
      btnSave.innerText = 'SAVE & CONNECT';

      if (result.success) {
        statusEl.className = 'status-msg success';
        statusEl.innerText = '✓ Connected to Supabase Cloud & Table Verified!';
        refreshLeaderboardUI();
        showToastNotification('Connected to Supabase!');
        setTimeout(() => modal.classList.remove('active'), 1200);
      } else {
        statusEl.className = 'status-msg error';
        statusEl.innerText = result.message || 'Failed to connect. Check URL & Key.';
      }
    });
  }
}

/**
 * Control Mode Toggle (PC vs Touch)
 */
function setupControlsToggle() {
  const btn = document.getElementById('btn-toggle-control-mode');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!window.inputController) return;
    const next = window.inputController.mode === 'pc' ? 'touch' : 'pc';
    window.inputController.setControlMode(next);
    showToastNotification(`Control Mode: ${next.toUpperCase()}`);
  });
}

/**
 * Fullscreen toggle helper
 */
function setupFullscreenToggle() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request blocked:', err.message);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function showToastNotification(text) {
  const toast = document.createElement('div');
  toast.className = 'game-toast';
  toast.innerText = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 50);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, (tag) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
