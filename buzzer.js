/*  BUZZER — Shared game logic (PeerJS-based P2P)
    Host = PeerJS peer that all players connect to.
    Room code = last 4 chars of the host's peer ID (uppercased).
    Data flows: Player → Host → broadcast to all.
*/

const PEER_PREFIX = 'buzzer-room-';
const PLAYER_COLORS = [
  '#FF3E6C','#00E5FF','#FFD600','#76FF03',
  '#FF9100','#D500F9','#00E676','#FF1744',
  '#18FFFF','#FFEA00','#64FFDA','#FF6D00',
  '#B388FF','#69F0AE','#FF8A80','#84FFFF'
];

/* ── Audio helpers ── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _actx;
function actx(){ if(!_actx) _actx = new AudioCtx(); return _actx; }

function playBuzzSound(){
  try {
    const c=actx(), o=c.createOscillator(), g=c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type='square';
    o.frequency.setValueAtTime(880,c.currentTime);
    o.frequency.exponentialRampToValueAtTime(440,c.currentTime+.15);
    g.gain.setValueAtTime(.25,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.3);
    o.start(c.currentTime); o.stop(c.currentTime+.3);
  } catch(e){}
}
function playLockSound(){
  try {
    const c=actx(), o=c.createOscillator(), g=c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type='sawtooth';
    o.frequency.setValueAtTime(200,c.currentTime);
    o.frequency.exponentialRampToValueAtTime(100,c.currentTime+.2);
    g.gain.setValueAtTime(.12,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.25);
    o.start(c.currentTime); o.stop(c.currentTime+.25);
  } catch(e){}
}
function playClickSound(){
  try {
    const c=actx(), o=c.createOscillator(), g=c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type='sine';
    o.frequency.setValueAtTime(660,c.currentTime);
    g.gain.setValueAtTime(.15,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);
    o.start(c.currentTime); o.stop(c.currentTime+.12);
  } catch(e){}
}

/* ── QR Code generation (inline, no dependency) ── */
// Using a CDN-loaded qrcode lib in each HTML page instead

/* ── HOST class ── */
class BuzzerHost {
  constructor(onUpdate){
    this.onUpdate = onUpdate;       // callback({type, ...})
    this.peer = null;
    this.connections = new Map();    // peerId → {conn, name, color, id}
    this.players = new Map();       // id → {name, color, connId}
    this.buzzes = [];
    this.armed = false;
    this.locked = false;
    this.timerDuration = 3;
    this.colorIndex = 0;
    this.roomCode = '';
    this.playerIdCounter = 0;
  }

  create(){
    return new Promise((resolve, reject) => {
      // Generate a room code
      this.roomCode = Math.random().toString(36).substring(2,6).toUpperCase();
      const peerId = PEER_PREFIX + this.roomCode.toLowerCase();

      this.peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', () => {
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this._handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        if(err.type === 'unavailable-id'){
          // Room code collision, retry
          this.roomCode = Math.random().toString(36).substring(2,6).toUpperCase();
          this.peer.destroy();
          this.create().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  _handleConnection(conn){
    conn.on('open', () => {
      conn.on('data', (data) => {
        this._handleData(conn, data);
      });
    });

    conn.on('close', () => {
      const entry = this.connections.get(conn.peer);
      if(entry){
        this.players.delete(entry.id);
        this.connections.delete(conn.peer);
        this._broadcastPlayerList();
      }
    });
  }

  _handleData(conn, msg){
    switch(msg.type){
      case 'join': {
        if(this.players.size >= 16){
          conn.send({type:'error', message:'Room is full (16 max)'});
          return;
        }
        const id = 'p' + (++this.playerIdCounter);
        const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
        this.colorIndex++;
        const player = { name: msg.name || 'Player', color, connId: conn.peer };
        this.players.set(id, player);
        this.connections.set(conn.peer, { conn, name: player.name, color, id });
        conn.send({ type:'joined', id, color, name: player.name });

        // If currently armed, let the new player know
        if(this.armed && !this.locked){
          conn.send({ type:'round_armed', timerDuration: this.timerDuration });
        }

        this._broadcastPlayerList();
        break;
      }
      case 'buzz': {
        if(!this.armed) return;
        const entry = this.connections.get(conn.peer);
        if(!entry) return;
        // Deduplicate
        if(this.buzzes.find(b => b.id === entry.id)) return;

        const buzzTime = Date.now();
        const isFirst = this.buzzes.length === 0;
        const firstTime = isFirst ? buzzTime : this.buzzes[0].time;
        const gap = buzzTime - firstTime;

        this.buzzes.push({
          id: entry.id,
          name: entry.name,
          color: entry.color,
          time: buzzTime,
          gap,
          order: this.buzzes.length + 1
        });

        if(isFirst){
          this.locked = true;
          playBuzzSound();
          // Broadcast first buzz to all
          this._broadcast({
            type:'first_buzz',
            id: entry.id,
            name: entry.name,
            color: entry.color,
            timerDuration: this.timerDuration
          });
        }

        // Send confirmation to buzzer
        conn.send({ type:'buzz_confirmed', order: this.buzzes.length, gap });

        // Update host
        this.onUpdate({ type:'buzz_list', buzzes: [...this.buzzes] });
        break;
      }
    }
  }

  armRound(){
    this.armed = true;
    this.locked = false;
    this.buzzes = [];
    this._broadcast({ type:'round_armed', timerDuration: this.timerDuration });
    this.onUpdate({ type:'armed' });
  }

  resetRound(){
    this.armed = false;
    this.locked = false;
    this.buzzes = [];
    this._broadcast({ type:'round_reset' });
    this.onUpdate({ type:'reset' });
  }

  setTimer(seconds){
    this.timerDuration = seconds;
  }

  kickPlayer(id){
    const player = this.players.get(id);
    if(!player) return;
    const entry = this.connections.get(player.connId);
    if(entry){
      entry.conn.send({ type:'kicked' });
      entry.conn.close();
      this.connections.delete(player.connId);
    }
    this.players.delete(id);
    this._broadcastPlayerList();
  }

  _broadcast(msg){
    for(const [, entry] of this.connections){
      try { entry.conn.send(msg); } catch(e){}
    }
    this.onUpdate(msg);
  }

  _broadcastPlayerList(){
    const players = [];
    for(const [id, p] of this.players){
      players.push({ id, name: p.name, color: p.color });
    }
    this._broadcast({ type:'player_list', players });
  }

  getJoinURL(){
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    return base + 'join.html?room=' + this.roomCode;
  }

  destroy(){
    if(this.peer) this.peer.destroy();
  }
}

/* ── PLAYER class ── */
class BuzzerPlayer {
  constructor(onUpdate){
    this.onUpdate = onUpdate;
    this.peer = null;
    this.conn = null;
    this.myId = null;
    this.myColor = '#00E5FF';
    this.myName = '';
  }

  join(roomCode, name){
    return new Promise((resolve, reject) => {
      this.myName = name;
      const hostPeerId = PEER_PREFIX + roomCode.toLowerCase();

      this.peer = new Peer(undefined, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', () => {
        this.conn = this.peer.connect(hostPeerId, { reliable: true });

        this.conn.on('open', () => {
          this.conn.send({ type:'join', name });
        });

        this.conn.on('data', (msg) => {
          this._handleData(msg, resolve);
        });

        this.conn.on('close', () => {
          this.onUpdate({ type:'disconnected' });
        });

        this.conn.on('error', (err) => {
          reject(new Error('Connection failed'));
        });
      });

      this.peer.on('error', (err) => {
        if(err.type === 'peer-unavailable'){
          reject(new Error('Room not found'));
        } else {
          reject(err);
        }
      });

      // Timeout
      setTimeout(() => {
        if(!this.myId) reject(new Error('Connection timed out'));
      }, 10000);
    });
  }

  _handleData(msg, resolveJoin){
    switch(msg.type){
      case 'joined':
        this.myId = msg.id;
        this.myColor = msg.color;
        this.myName = msg.name;
        if(resolveJoin) resolveJoin({ id: msg.id, color: msg.color, name: msg.name });
        this.onUpdate(msg);
        break;
      case 'error':
        this.onUpdate(msg);
        break;
      default:
        this.onUpdate(msg);
    }
  }

  buzz(){
    if(this.conn) this.conn.send({ type:'buzz' });
  }

  destroy(){
    if(this.peer) this.peer.destroy();
  }
}
