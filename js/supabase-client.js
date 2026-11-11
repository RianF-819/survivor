/**
 * Pixel Survivor 3D - Supabase SDK Integration & Private Real-time Leaderboard
 * Handles inserting final scores to table 'highscores' (nama, skor_tertinggi, room_code)
 * and real-time subscription filtered by private room code.
 */

class SupabaseLeaderboard {
  constructor() {
    this.client = null;
    this.channel = null;
    this.isConnected = false;
    this.onRealtimeUpdate = null;

    // Active room code for private leaderboards
    this.currentRoomCode = (localStorage.getItem('room_code') || 'GLOBAL').trim().toUpperCase();
    this.currentPlayerName = localStorage.getItem('player_name') || 'CyberSurvivor';

    // Default configuration (loads from window.ENV, localStorage, or .env)
    const envUrl = (window.ENV && window.ENV.SUPABASE_URL) ? window.ENV.SUPABASE_URL.trim() : '';
    const envKey = (window.ENV && window.ENV.SUPABASE_ANON_KEY) ? window.ENV.SUPABASE_ANON_KEY.trim() : '';

    this.supabaseUrl = this.cleanUrl(envUrl || localStorage.getItem('supabase_url') || '');
    this.supabaseKey = envKey || localStorage.getItem('supabase_key') || '';

    // If localStorage had a URL with /rest/v1 suffix, update with the clean base URL
    if (this.supabaseUrl) {
      localStorage.setItem('supabase_url', this.supabaseUrl);
    }

    // Local storage fallback key
    this.localKey = 'pixel_survivor_local_highscores';

    // Attempt to load from .env file asynchronously if not already set
    if (!this.supabaseUrl || !this.supabaseKey) {
      this.loadFromEnvFile();
    }
  }

  /**
   * Normalize and sanitize Supabase base URL (strips accidental /rest/v1 or trailing slashes)
   */
  cleanUrl(url) {
    if (!url) return '';
    let cleaned = url.trim();
    cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned;
  }

  /**
   * Try loading credentials from .env file if served via HTTP server
   */
  async loadFromEnvFile() {
    try {
      const res = await fetch('.env');
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.split('\n');
      let foundUrl = '';
      let foundKey = '';

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) return;
        const [k, ...v] = trimmed.split('=');
        const val = v.join('=').trim().replace(/^["']|["']$/g, '');
        if (k.trim() === 'SUPABASE_URL' && val && !val.includes('your-project')) {
          foundUrl = val;
        }
        if (k.trim() === 'SUPABASE_ANON_KEY' && val && !val.includes('your-anon-key')) {
          foundKey = val;
        }
      });

      if (foundUrl && foundKey) {
        this.supabaseUrl = this.cleanUrl(foundUrl);
        this.supabaseKey = foundKey;
        this.init(this.onRealtimeUpdate);
      }
    } catch (e) {
      // Quiet fail if .env is not accessible directly
    }
  }

  /**
   * Set active room code
   */
  setRoomCode(code) {
    this.currentRoomCode = (code || 'GLOBAL').trim().toUpperCase();
    localStorage.setItem('room_code', this.currentRoomCode);
    return this.currentRoomCode;
  }

  /**
   * Set active player name
   */
  setPlayerName(name) {
    this.currentPlayerName = (name || 'Survivor').trim().substring(0, 16);
    localStorage.setItem('player_name', this.currentPlayerName);
    return this.currentPlayerName;
  }

  /**
   * Initialize Supabase client if credentials exist
   */
  init(onUpdateCallback = null) {
    this.onRealtimeUpdate = onUpdateCallback;

    if (typeof window.supabase === 'undefined') {
      console.warn('Supabase SDK not loaded yet. Running in offline/local mode.');
      this.isConnected = false;
      return false;
    }

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        this.client = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        this.isConnected = true;
        this.subscribeRealtime();
        console.log('Supabase connected successfully.');
        return true;
      } catch (err) {
        console.error('Error initializing Supabase client:', err);
        this.isConnected = false;
        return false;
      }
    } else {
      console.info('Supabase URL/Key not configured. Using LocalStorage fallback for highscores.');
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Test connection to Supabase and verify 'highscores' table
   */
  async testConnection(url, key) {
    const testUrl = this.cleanUrl(url || this.supabaseUrl || '');
    const testKey = (key || this.supabaseKey || '').trim();

    if (!testUrl || !testKey) {
      return { success: false, message: 'URL and Anon Key cannot be empty.' };
    }

    if (typeof window.supabase === 'undefined') {
      return { success: false, message: 'Supabase JS SDK is not loaded. Check your internet connection.' };
    }

    try {
      const tempClient = window.supabase.createClient(testUrl, testKey);
      const { data, error } = await tempClient
        .from('highscores')
        .select('id')
        .limit(1);

      if (error) {
        if (error.code === '42P01' || (error.message && (error.message.includes('relation "highscores" does not exist') || error.message.includes('not found')))) {
          return {
            success: false,
            tableMissing: true,
            message: "Connected to Supabase project, but table 'highscores' does not exist yet. Please run the SQL setup script."
          };
        }
        return {
          success: false,
          message: `Supabase Error: ${error.message}`
        };
      }

      return {
        success: true,
        message: "Successfully connected to Supabase and verified 'highscores' table!"
      };
    } catch (err) {
      return {
        success: false,
        message: `Connection failed: ${err.message}`
      };
    }
  }

  /**
   * Update and save Supabase credentials with active validation
   */
  async configure(url, key) {
    this.supabaseUrl = this.cleanUrl(url);
    this.supabaseKey = (key || '').trim();

    localStorage.setItem('supabase_url', this.supabaseUrl);
    localStorage.setItem('supabase_key', this.supabaseKey);

    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }

    const test = await this.testConnection(this.supabaseUrl, this.supabaseKey);

    // Initialize client
    this.init(this.onRealtimeUpdate);

    return test;
  }

  /**
   * Insert final game score to 'highscores' table with private Room Code
   * Columns: nama (TEXT), skor_tertinggi (INTEGER), room_code (TEXT)
   * @param {string} nama Player nickname
   * @param {number} skor Final survival score
   * @param {string} roomCode Private leaderboard room code
   */
  async submitScore(nama, skor, roomCode = null) {
    const cleanName = (nama || this.currentPlayerName || 'Survivor').trim().substring(0, 16);
    const finalScore = Math.floor(Math.max(0, skor));
    const cleanRoom = (roomCode || this.currentRoomCode || 'GLOBAL').trim().toUpperCase().substring(0, 16);

    this.setPlayerName(cleanName);
    this.setRoomCode(cleanRoom);

    // Save to local storage for offline resilience
    this.saveLocalScore(cleanName, finalScore, cleanRoom);

    if (!this.isConnected || !this.client) {
      return {
        success: true,
        source: 'local',
        message: 'Score saved locally (Supabase not connected).'
      };
    }

    try {
      const payload = {
        nama: cleanName,
        skor_tertinggi: finalScore,
        room_code: cleanRoom
      };

      const { data, error } = await this.client
        .from('highscores')
        .insert([payload])
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        return {
          success: false,
          source: 'supabase',
          error: error.message
        };
      }

      console.log('Score saved to Supabase (Room: ' + cleanRoom + '):', data);
      return {
        success: true,
        source: 'supabase',
        data: data[0]
      };
    } catch (err) {
      console.error('Exception submitting score to Supabase:', err);
      return {
        success: false,
        source: 'supabase',
        error: err.message
      };
    }
  }

  /**
   * Fetch top 10 scores filtered by private room code using .eq('room_code', roomCode)
   * @param {string} roomCode Target private room code
   * @param {number} limit Number of highscore records (default 10)
   */
  async getTopScores(roomCode = null, limit = 10) {
    const targetRoom = (roomCode || this.currentRoomCode || 'GLOBAL').trim().toUpperCase();

    if (!this.isConnected || !this.client) {
      return this.getLocalScores(targetRoom, limit);
    }

    try {
      // Query filtered by private room code
      const { data, error } = await this.client
        .from('highscores')
        .select('id, nama, skor_tertinggi, room_code, created_at')
        .eq('room_code', targetRoom)
        .order('skor_tertinggi', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Failed to query Supabase room scores, falling back to local:', error.message);
        return this.getLocalScores(targetRoom, limit);
      }

      return data || [];
    } catch (err) {
      console.warn('Error fetching private leaderboard from Supabase:', err);
      return this.getLocalScores(targetRoom, limit);
    }
  }

  /**
   * Listen for real-time score insertions on table 'highscores'
   */
  subscribeRealtime() {
    if (!this.isConnected || !this.client) return;

    if (this.channel) {
      this.channel.unsubscribe();
    }

    try {
      this.channel = this.client
        .channel('realtime_highscores_feed')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'highscores'
          },
          (payload) => {
            const row = payload.new;
            console.log('Realtime new score received:', row);

            // Only trigger update if score belongs to current active room
            if (!row.room_code || row.room_code === this.currentRoomCode) {
              if (typeof this.onRealtimeUpdate === 'function') {
                this.onRealtimeUpdate(row);
              }
            }
          }
        )
        .subscribe((status) => {
          console.log(`Supabase Realtime Channel Status: ${status}`);
        });
    } catch (err) {
      console.error('Failed to establish Supabase Realtime channel:', err);
    }
  }

  /**
   * Local storage fallback handlers filtered by room code
   */
  getLocalScores(roomCode = 'GLOBAL', limit = 10) {
    try {
      const raw = localStorage.getItem(this.localKey);
      let list = raw ? JSON.parse(raw) : [
        { nama: 'PixelKnight', skor_tertinggi: 12500, room_code: 'GLOBAL', created_at: new Date().toISOString() },
        { nama: 'CyberPhantom', skor_tertinggi: 9400, room_code: 'GLOBAL', created_at: new Date().toISOString() },
        { nama: 'VampireBane', skor_tertinggi: 7800, room_code: 'ROOM101', created_at: new Date().toISOString() },
        { nama: 'ArcaneMaster', skor_tertinggi: 5600, room_code: 'ROOM101', created_at: new Date().toISOString() }
      ];

      // Filter by room code
      const filtered = list.filter(item => (item.room_code || 'GLOBAL').toUpperCase() === roomCode.toUpperCase());
      filtered.sort((a, b) => b.skor_tertinggi - a.skor_tertinggi);
      return filtered.slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  saveLocalScore(nama, skor_tertinggi, room_code = 'GLOBAL') {
    try {
      const raw = localStorage.getItem(this.localKey);
      let list = raw ? JSON.parse(raw) : [];
      list.push({
        id: 'local_' + Date.now(),
        nama,
        skor_tertinggi,
        room_code,
        created_at: new Date().toISOString()
      });
      list.sort((a, b) => b.skor_tertinggi - a.skor_tertinggi);
      localStorage.setItem(this.localKey, JSON.stringify(list.slice(0, 50)));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
  }
}

window.supabaseLeaderboard = new SupabaseLeaderboard();
