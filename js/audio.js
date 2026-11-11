/**
 * Pixel Survivor - Web Audio API Sound Engine
 * Handles FLAC BGM playback, procedural House/Electronic synthesizer,
 * spatial sound effects, and precision IEM Stereo Channel Balancing.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.bgmPlaying = false;
    this.bgmMode = 'synth'; // 'synth' or 'flac'

    // Volume settings
    this.masterVolume = 0.8;
    this.bgmVolume = 0.65;
    this.sfxVolume = 0.75;

    // Precision IEM Channel Balancing
    // 0 = Dead Center (Equal Power)
    // -1.0 = Full Left, +1.0 = Full Right
    // IEMs with left bias can be fine-tuned with small positive values (+0.05 to +0.2)
    this.channelBalance = parseFloat(localStorage.getItem('iem_balance') || '0.0');

    // Audio Graph Nodes
    this.masterGainNode = null;
    this.bgmGainNode = null;
    this.sfxGainNode = null;
    this.splitterNode = null;
    this.mergerNode = null;
    this.leftTrimGain = null;
    this.rightTrimGain = null;
    this.centerPanner = null;

    // FLAC audio buffer
    this.flacBuffer = null;
    this.flacSource = null;
    this.flacUrl = 'assets/audio/house_groove.flac';

    // Procedural House Synthesizer state
    this.houseSynth = {
      bpm: 124,
      step: 0,
      timerId: null,
      isPlaying: false,
      nextNoteTime: 0,
      scheduleAheadTime: 0.1,
      lookahead: 25.0, // ms
      basslinePattern: [
        'D2', null, 'D2', 'F2', null, 'G2', null, 'D2',
        'C2', null, 'C2', 'E2', null, 'F2', 'E2', 'C2'
      ],
      chordProgression: [
        ['D3', 'F3', 'A3', 'C4'], // Dm7
        ['Bb2', 'D3', 'F3', 'A3'], // Bbmaj7
        ['F2', 'A2', 'C3', 'E3'], // Fmaj7
        ['C3', 'E3', 'G3', 'B3']  // Cmaj
      ]
    };

    // Note frequencies
    this.noteFreqs = {
      'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
      'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
      'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
      'Bb2': 116.54
    };
  }

  /**
   * Initialize AudioContext on first user interaction.
   * Browsers require a user gesture (tap/click) before playing audio.
   */
  async init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

      // DJ Club Filter (Lowpass filter sweep for Level Up & Pause menu)
      this.clubFilterNode = this.ctx.createBiquadFilter();
      this.clubFilterNode.type = 'lowpass';
      this.clubFilterNode.frequency.setValueAtTime(20000, this.ctx.currentTime);
      this.clubFilterNode.Q.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGainNode.connect(this.clubFilterNode);

      // Separate BGM and SFX busses
      this.bgmGainNode = this.ctx.createGain();
      this.bgmGainNode.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);

      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);

      // Force explicit 2-channel stereo with speaker upmixing
      // This ensures mono SFX oscillators (slash, hits, etc.) are duplicated to both L & R channels
      // preventing them from dropping out of the right channel when entering ChannelSplitterNode
      this.sfxGainNode.channelCount = 2;
      this.sfxGainNode.channelCountMode = 'explicit';
      this.sfxGainNode.channelInterpretation = 'speakers';

      this.bgmGainNode.channelCount = 2;
      this.bgmGainNode.channelCountMode = 'explicit';
      this.bgmGainNode.channelInterpretation = 'speakers';

      this.masterGainNode.channelCount = 2;
      this.masterGainNode.channelCountMode = 'explicit';
      this.masterGainNode.channelInterpretation = 'speakers';

      this.clubFilterNode.channelCount = 2;
      this.clubFilterNode.channelCountMode = 'explicit';
      this.clubFilterNode.channelInterpretation = 'speakers';

      this.bgmGainNode.connect(this.masterGainNode);
      this.sfxGainNode.connect(this.masterGainNode);

      // =========================================================================
      // PRECISION IEM CHANNEL BALANCING & STEREO PANNING PIPELINE
      // Fixes left channel bias common on wired In-Ear Monitors & mobile DACs.
      // Master -> Club Filter -> Splitter (L/R) -> Trim Gains -> Merger -> StereoPanner -> Destination
      // =========================================================================
      this.splitterNode = this.ctx.createChannelSplitter(2);
      this.mergerNode = this.ctx.createChannelMerger(2);

      this.leftTrimGain = this.ctx.createGain();
      this.rightTrimGain = this.ctx.createGain();

      // Realtime Analyser Nodes for Stereo Meter Visualizer
      this.leftAnalyser = this.ctx.createAnalyser();
      this.rightAnalyser = this.ctx.createAnalyser();
      this.leftAnalyser.fftSize = 256;
      this.rightAnalyser.fftSize = 256;

      this.clubFilterNode.connect(this.splitterNode);

      // Splitter output 0 -> Left Gain -> Analyser L -> Merger input 0
      this.splitterNode.connect(this.leftTrimGain, 0);
      this.leftTrimGain.connect(this.leftAnalyser);
      this.leftAnalyser.connect(this.mergerNode, 0, 0);

      // Splitter output 1 -> Right Gain -> Analyser R -> Merger input 1
      this.splitterNode.connect(this.rightTrimGain, 1);
      this.rightTrimGain.connect(this.rightAnalyser);
      this.rightAnalyser.connect(this.mergerNode, 0, 1);

      // Stereo Panner for fine calibration
      if (this.ctx.createStereoPanner) {
        this.centerPanner = this.ctx.createStereoPanner();
        this.centerPanner.pan.setValueAtTime(0, this.ctx.currentTime);
        this.mergerNode.connect(this.centerPanner);
        this.centerPanner.connect(this.ctx.destination);
      } else {
        this.mergerNode.connect(this.ctx.destination);
      }

      // Apply initial IEM balance calibration
      this.setChannelBalance(this.channelBalance);

      this.initialized = true;
      console.log('Audio Engine initialized. IEM Balance:', this.channelBalance);

      // Try loading FLAC in background (non-blocking)
      this.preloadFLAC(this.flacUrl);
    } catch (err) {
      console.warn('Web Audio API not supported or error initializing:', err);
    }
  }

  /**
   * DJ Club Filter: Lowpass filter sweep for Level Up & Pause menu
   */
  setClubFilter(enabled) {
    if (!this.initialized || !this.clubFilterNode || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.clubFilterNode.frequency.cancelScheduledValues(t);
    if (enabled) {
      this.clubFilterNode.frequency.exponentialRampToValueAtTime(450, t + 0.35);
    } else {
      this.clubFilterNode.frequency.exponentialRampToValueAtTime(20000, t + 0.25);
    }
  }

  /**
   * Get Real-time Stereo RMS Levels for visual VU Meter
   */
  getStereoLevels() {
    if (!this.initialized || !this.leftAnalyser || !this.rightAnalyser) {
      return { left: 0, right: 0 };
    }
    const leftData = new Uint8Array(this.leftAnalyser.frequencyBinCount);
    const rightData = new Uint8Array(this.rightAnalyser.frequencyBinCount);
    this.leftAnalyser.getByteTimeDomainData(leftData);
    this.rightAnalyser.getByteTimeDomainData(rightData);

    let leftSum = 0;
    let rightSum = 0;
    const len = leftData.length;
    for (let i = 0; i < len; i++) {
      const l = (leftData[i] - 128) / 128;
      const r = (rightData[i] - 128) / 128;
      leftSum += l * l;
      rightSum += r * r;
    }
    const leftRms = Math.sqrt(leftSum / len);
    const rightRms = Math.sqrt(rightSum / len);

    return {
      left: Math.min(1.0, leftRms * 3.8),
      right: Math.min(1.0, rightRms * 3.8)
    };
  }

  /**
   * Set and apply precision channel balance.
   * Uses Equal Power Panning law to ensure neither channel suffers loss of acoustic energy.
   * @param {number} balance Value from -1.0 (hard left) to +1.0 (hard right). 0 is calibrated center.
   */
  setChannelBalance(balance) {
    this.channelBalance = Math.max(-1.0, Math.min(1.0, balance));
    localStorage.setItem('iem_balance', this.channelBalance.toString());

    if (!this.initialized || !this.ctx) return;

    // Equal-Power Curve calculation:
    // angle = (balance + 1) * PI / 4  -> range [0, PI/2]
    // leftGain = cos(angle) * sqrt(2)
    // rightGain = sin(angle) * sqrt(2)
    // At balance 0: cos(PI/4)*sqrt(2) = 1.0, sin(PI/4)*sqrt(2) = 1.0
    const angle = (this.channelBalance + 1.0) * (Math.PI / 4.0);
    const leftAmp = Math.cos(angle) * Math.SQRT2;
    const rightAmp = Math.sin(angle) * Math.SQRT2;

    const t = this.ctx.currentTime;
    this.leftTrimGain.gain.cancelScheduledValues(t);
    this.rightTrimGain.gain.cancelScheduledValues(t);

    this.leftTrimGain.gain.linearRampToValueAtTime(leftAmp, t + 0.05);
    this.rightTrimGain.gain.linearRampToValueAtTime(rightAmp, t + 0.05);
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGainNode && this.ctx) {
      this.masterGainNode.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.03);
    }
  }

  setBGMVolume(val) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    if (this.bgmGainNode && this.ctx) {
      this.bgmGainNode.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.03);
    }
  }

  setSFXVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGainNode && this.ctx) {
      this.sfxGainNode.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.03);
    }
  }

  /**
   * Preload FLAC audio file via fetch & AudioContext.decodeAudioData
   */
  async preloadFLAC(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.info(`FLAC file at ${url} not found, procedural synth will be used as default House BGM.`);
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      this.flacBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      console.log('FLAC audio file successfully decoded & ready for playback.');
    } catch (err) {
      console.info('Using procedural Web Audio House synthesizer for BGM.', err.message);
    }
  }

  /**
   * Load FLAC from a user-uploaded File or ArrayBuffer
   */
  async loadFLACFromFile(file) {
    if (!this.initialized) await this.init();
    try {
      const arrayBuffer = await file.arrayBuffer();
      this.flacBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.bgmMode = 'flac';
      if (this.bgmPlaying) {
        this.stopBGM();
        this.playBGM();
      }
      return true;
    } catch (err) {
      console.error('Failed to decode uploaded FLAC file:', err);
      return false;
    }
  }

  /**
   * Start BGM playback. Uses decoded FLAC if available, or procedural House synth.
   */
  playBGM() {
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.bgmPlaying) return;

    this.bgmPlaying = true;

    if (this.bgmMode === 'flac' && this.flacBuffer) {
      this.playFLACLoop();
    } else {
      this.startHouseSynth();
    }
  }

  /**
   * Stop BGM playback
   */
  stopBGM() {
    this.bgmPlaying = false;
    if (this.flacSource) {
      try {
        this.flacSource.stop();
        this.flacSource.disconnect();
      } catch (e) {}
      this.flacSource = null;
    }
    this.stopHouseSynth();
  }

  playFLACLoop() {
    if (!this.flacBuffer || !this.ctx) return;
    this.flacSource = this.ctx.createBufferSource();
    this.flacSource.buffer = this.flacBuffer;
    this.flacSource.loop = true;
    this.flacSource.connect(this.bgmGainNode);
    this.flacSource.start(0);
  }

  // =========================================================================
  // PROCEDURAL HOUSE / ELECTRONIC SYNTHESIZER
  // Generates 124 BPM 4-on-the-floor House music with deep kick, offbeat hats,
  // syncopated bass, and French house chord stabs.
  // =========================================================================
  startHouseSynth() {
    if (this.houseSynth.isPlaying) return;
    this.houseSynth.isPlaying = true;
    this.houseSynth.step = 0;
    this.houseSynth.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduleHouseBeat();
  }

  stopHouseSynth() {
    this.houseSynth.isPlaying = false;
    if (this.houseSynth.timerId) {
      clearTimeout(this.houseSynth.timerId);
      this.houseSynth.timerId = null;
    }
  }

  scheduleHouseBeat() {
    if (!this.houseSynth.isPlaying || !this.ctx) return;

    const secondsPerStep = (60.0 / this.houseSynth.bpm) / 4.0; // 16th note steps

    while (this.houseSynth.nextNoteTime < this.ctx.currentTime + this.houseSynth.scheduleAheadTime) {
      this.playHouseStep(this.houseSynth.step, this.houseSynth.nextNoteTime);
      this.houseSynth.nextNoteTime += secondsPerStep;
      this.houseSynth.step = (this.houseSynth.step + 1) % 64; // 4 bar loop
    }

    this.houseSynth.timerId = setTimeout(() => {
      this.scheduleHouseBeat();
    }, this.houseSynth.lookahead);
  }

  playHouseStep(step, time) {
    const beatInBar = step % 16;
    const bar = Math.floor(step / 16);

    // 1. Four-on-the-floor Kick Drum (steps 0, 4, 8, 12)
    if (beatInBar % 4 === 0) {
      this.synthKick(time);
    }

    // 2. Offbeat Open Hi-Hat (steps 2, 6, 10, 14)
    if (beatInBar % 4 === 2) {
      this.synthOpenHiHat(time);
    } else if (beatInBar % 2 === 0) {
      // 3. Closed Hi-Hat
      this.synthClosedHiHat(time, 0.4);
    }

    // 4. House Bassline
    const noteName = this.houseSynth.basslinePattern[beatInBar];
    if (noteName && this.noteFreqs[noteName]) {
      this.synthBass(this.noteFreqs[noteName], time, 0.18);
    }

    // 5. Synth Chords on bar drops (stabs on beats 0, 3, 6, 10)
    if ([0, 3, 6, 10].includes(beatInBar)) {
      const chord = this.houseSynth.chordProgression[bar % 4];
      this.synthChordStab(chord, time, 0.22);
    }
  }

  /**
   * 909-Style House Kick: Pitch sweep from 140Hz down to 42Hz
   */
  synthKick(time) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);

    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(this.bgmGainNode);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  /**
   * Filtered Noise for Hi-Hats
   */
  synthClosedHiHat(time, gainLevel = 0.35) {
    this.synthNoiseHiHat(time, 0.04, gainLevel, 7500);
  }

  synthOpenHiHat(time) {
    this.synthNoiseHiHat(time, 0.18, 0.55, 6500);
  }

  synthNoiseHiHat(time, duration, volume, filterFreq) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(filterFreq, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGainNode);

    noise.start(time);
    noise.stop(time + duration);
  }

  /**
   * Funky Electro House Bass with low-pass filter decay
   */
  synthBass(freq, time, duration) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * 0.5, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.frequency.exponentialRampToValueAtTime(250, time + duration);
    filter.Q.setValueAtTime(3.5, time);

    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGainNode);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + duration);
    subOsc.stop(time + duration);
  }

  /**
   * French House Chord Stabs
   */
  synthChordStab(chordNotes, time, duration) {
    if (!this.ctx) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, time);
    filter.frequency.exponentialRampToValueAtTime(800, time + duration);

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.28, time);
    chordGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    filter.connect(chordGain);
    chordGain.connect(this.bgmGainNode);

    chordNotes.forEach(n => {
      const freq = this.noteFreqs[n];
      if (!freq) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      // Subtle detune for rich vintage stereo spread
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, time);

      osc.connect(filter);
      osc.start(time);
      osc.stop(time + duration);
    });
  }

  // =========================================================================
  // SPATIAL SFX WITH PRECISE STEREO PANNING
  // Normalizes horizontal screen coordinate to pan value [-0.6, 0.6]
  // Clamped to avoid extreme phase fatigue on sensitive In-Ear Monitors.
  // =========================================================================
  createSpatialPanner(sourceX, listenerX, viewportWidth = 800) {
    if (!this.ctx) return null;
    if (!this.ctx.createStereoPanner) return null;

    const panner = this.ctx.createStereoPanner();
    if (typeof sourceX === 'number' && typeof listenerX === 'number') {
      const halfWidth = viewportWidth * 0.5;
      const rawPan = (sourceX - listenerX) / halfWidth;
      // Soft-clamp between -0.65 and 0.65 to ensure comfortable IEM listening
      const panVal = Math.max(-0.65, Math.min(0.65, rawPan));
      panner.pan.setValueAtTime(panVal, this.ctx.currentTime);
    } else {
      panner.pan.setValueAtTime(0, this.ctx.currentTime);
    }
    return panner;
  }

  /**
   * Play dynamic sound effect with spatial stereo panning
   */
  playSFX(type, sourceX = null, listenerX = null, viewportWidth = 800) {
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;
    const panner = this.createSpatialPanner(sourceX, listenerX, viewportWidth);
    const dest = panner || this.sfxGainNode;
    if (panner) {
      panner.connect(this.sfxGainNode);
    }

    switch (type) {
      case 'slash':
      case 'attack':
        this.sfxSlash(t, dest);
        break;
      case 'hit':
        this.sfxHit(t, dest);
        break;
      case 'gem':
      case 'exp':
        this.sfxGem(t, dest);
        break;
      case 'dash':
        this.sfxDash(t, dest);
        break;
      case 'levelup':
        this.sfxLevelUp(t, dest);
        break;
      case 'player_hurt':
        this.sfxPlayerHurt(t, dest);
        break;
      case 'gameover':
        this.sfxGameOver(t, dest);
        break;
      case 'boss_spawn':
        this.sfxBossSpawn(t, dest);
        break;
      default:
        break;
    }
  }

  sfxSlash(t, dest) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.12);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(2.0, t);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  sfxHit(t, dest) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  sfxGem(t, dest) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.07);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  sfxDash(t, dest) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(2400, t + 0.1);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  sfxLevelUp(t, dest) {
    const notes = [440, 554.37, 659.25, 880]; // A major fanfare
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteTime = t + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.5, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.38);
    });
  }

  sfxPlayerHurt(t, dest) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);

    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  sfxBossSpawn(t, dest) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.linearRampToValueAtTime(55, t + 0.8);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.Q.setValueAtTime(6.0, t);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.95);
  }

  sfxGameOver(t, dest) {
    const notes = [392, 349.23, 311.13, 261.63]; // Descending melancholy
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteTime = t + idx * 0.25;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.5, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.6);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.65);
    });
  }

  // =========================================================================
  // IEM STEREO CALIBRATION TOOLS
  // Allows user with wired IEMs to verify dead-center imaging or fine-tune.
  // =========================================================================

  /**
   * Play continuous pink/white noise for center acoustic balance calibration
   */
  playCalibrationNoise(durationSec = 2.0) {
    if (!this.initialized) this.init();
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * durationSec;
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    // Uniform correlated noise for phantom center imaging
    for (let i = 0; i < bufferSize; i++) {
      const sample = (Math.random() * 2 - 1) * 0.25;
      leftData[i] = sample;
      rightData[i] = sample; // strictly identical phase for center focus
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.linearRampToValueAtTime(0.001, t + durationSec);

    source.connect(gain);
    gain.connect(this.masterGainNode);

    source.start(t);
    source.stop(t + durationSec);
  }

  /**
   * Ping sound to Left, Center, then Right sequentially
   */
  pingStereoSequence() {
    if (!this.initialized) this.init();
    const t = this.ctx.currentTime;
    const sequence = [
      { pan: -0.8, delay: 0.0, freq: 880, label: 'Left' },
      { pan: 0.0, delay: 0.45, freq: 1100, label: 'Center' },
      { pan: 0.8, delay: 0.90, freq: 880, label: 'Right' }
    ];

    sequence.forEach(item => {
      const pingTime = t + item.delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(item.freq, pingTime);

      gain.gain.setValueAtTime(0.45, pingTime);
      gain.gain.exponentialRampToValueAtTime(0.001, pingTime + 0.25);

      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(item.pan, pingTime);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGainNode);
      } else {
        osc.connect(gain);
        gain.connect(this.masterGainNode);
      }

      osc.start(pingTime);
      osc.stop(pingTime + 0.28);
    });
  }
}

// Global Sound Engine Singleton
window.soundEngine = new SoundEngine();
