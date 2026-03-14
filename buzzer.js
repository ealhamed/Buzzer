/*  BUZZER v2 — P2P Game Engine
    PeerJS WebRTC. Host browser = server. Static hosting.
    Teams (max 4, optional), idle detection, penalties, reconnect, sound themes.
*/
const PEER_PREFIX = 'bzr2-';
const MAX_PLAYERS = 16;
const MAX_TEAMS = 4;
const HEARTBEAT_MS = 3000;
const IDLE_THRESHOLD_MS = 10000;

const TEAM_PRESET_COLORS = [
  { name:'Crimson', hex:'#FF3E6C' },
  { name:'Cyan',    hex:'#00E5FF' },
  { name:'Lime',    hex:'#76FF03' },
  { name:'Amber',   hex:'#FFD600' }
];

const PLAYER_COLORS = [
  '#FF6B8A','#00D4F5','#FFE040','#8CFF20',
  '#FF7B00','#E040FB','#00F5A0','#FF2D55',
  '#40FFFF','#FFEE58','#80FFCC','#FF8A50',
  '#B39DFF','#69F0AE','#FF8A80','#84FFFF'
];

/* ── Sound Engine ── */
const SND_THEMES = {
  arcade: {
    buzz:  { type:'square', f0:880, f1:440, dur:.15, vol:.25 },
    lock:  { type:'sawtooth', f0:200, f1:100, dur:.2, vol:.12 },
    click: { type:'sine', f0:660, f1:660, dur:.1, vol:.15 },
    arm:   { type:'sine', f0:520, f1:780, dur:.2, vol:.18 },
    penalty:{ type:'sawtooth', f0:150, f1:80, dur:.35, vol:.2 }
  },
  classic: {
    buzz:  { type:'sine', f0:1000, f1:600, dur:.2, vol:.2 },
    lock:  { type:'triangle', f0:300, f1:150, dur:.25, vol:.1 },
    click: { type:'sine', f0:800, f1:800, dur:.08, vol:.12 },
    arm:   { type:'triangle', f0:440, f1:660, dur:.25, vol:.15 },
    penalty:{ type:'triangle', f0:200, f1:100, dur:.4, vol:.15 }
  },
  scifi: {
    buzz:  { type:'sawtooth', f0:1200, f1:300, dur:.25, vol:.2 },
    lock:  { type:'square', f0:100, f1:50, dur:.3, vol:.1 },
    click: { type:'sine', f0:1400, f1:900, dur:.06, vol:.1 },
    arm:   { type:'sawtooth', f0:300, f1:1200, dur:.3, vol:.15 },
    penalty:{ type:'square', f0:80, f1:40, dur:.5, vol:.18 }
  }
};

let _actx, _sndTheme = 'arcade';
function actx(){ if(!_actx) _actx = new (window.AudioContext||window.webkitAudioContext)(); return _actx; }
function setSoundTheme(t){ if(SND_THEMES[t]) _sndTheme = t; }

function playSound(key){
  try {
    const s = SND_THEMES[_sndTheme][key]; if(!s) return;
    const c=actx(), o=c.createOscillator(), g=c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type=s.type;
    o.frequency.setValueAtTime(s.f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,s.f1), c.currentTime+s.dur);
    g.gain.setValueAtTime(s.vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime+s.dur+.05);
    o.start(c.currentTime); o.stop(c.currentTime+s.dur+.06);
  } catch(e){}
}

/* ── Haptics ── */
function hapticBuzz(ms){
  try { if(navigator.vibrate) navigator.vibrate(ms||80); } catch(e){}
}

/* ── Utility ── */
function genCode(){ return Math.random().toString(36).substring(2,6).toUpperCase(); }
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function lighten(hex,pct){const n=parseInt(hex.replace('#',''),16),a=Math.round(2.55*pct);return'#'+(0x1000000+Math.min(255,(n>>16)+a)*0x10000+Math.min(255,((n>>8)&0xFF)+a)*0x100+Math.min(255,(n&0xFF)+a)).toString(16).slice(1)}
function darken(hex,pct){const n=parseInt(hex.replace('#',''),16),a=Math.round(2.55*pct);return'#'+(0x1000000+Math.max(0,(n>>16)-a)*0x10000+Math.max(0,((n>>8)&0xFF)-a)*0x100+Math.max(0,(n&0xFF)-a)).toString(16).slice(1)}

/* ══════════════════════════════════════
   HOST
   ══════════════════════════════════════ */
class BuzzerHost {
  constructor(onUpdate){
    this.onUpdate = onUpdate;
    this.peer = null;
    this.conns = new Map();       // peerId → {conn, playerId}
    this.players = new Map();     // id → {name,color,connPeer,team,lastSeen,idle,penaltyUntil}
    this.teams = new Map();       // teamId → {name,color,locked:false}
    this.buzzes = [];
    this.armed = false;
    this.locked = false;
    this.timerDuration = 3;
    this.colorIdx = 0;
    this.roomCode = '';
    this.pidCounter = 0;
    this.teamsLocked = false;
    this._hbInterval = null;
    // Reconnect tokens: secret → playerId
    this.reconnectTokens = new Map();
  }

  create(){
    return new Promise((resolve, reject) => {
      this.roomCode = genCode();
      const peerId = PEER_PREFIX + this.roomCode.toLowerCase();
      this.peer = new Peer(peerId, { debug:0, config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]} });

      this.peer.on('open', () => {
        this._startHeartbeat();
        resolve(this.roomCode);
      });
      this.peer.on('connection', c => this._onConn(c));
      this.peer.on('error', err => {
        if(err.type==='unavailable-id'){
          this.roomCode = genCode();
          this.peer.destroy();
          this.create().then(resolve).catch(reject);
        } else reject(err);
      });
    });
  }

  _startHeartbeat(){
    this._hbInterval = setInterval(() => {
      const now = Date.now();
      for(const [id, p] of this.players){
        const wasIdle = p.idle;
        p.idle = (now - p.lastSeen) > IDLE_THRESHOLD_MS;
        if(p.idle !== wasIdle) this._broadcastLobby();
      }
      // Ping all
      for(const [, c] of this.conns){
        try { c.conn.send({type:'ping'}); } catch(e){}
      }
    }, HEARTBEAT_MS);
  }

  _onConn(conn){
    conn.on('open', () => {
      conn.on('data', d => this._onData(conn, d));
    });
    conn.on('close', () => this._onDisconnect(conn));
    conn.on('error', () => this._onDisconnect(conn));
  }

  _onDisconnect(conn){
    const entry = this.conns.get(conn.peer);
    if(!entry) return;
    const p = this.players.get(entry.playerId);
    if(p){
      p.idle = true;
      p.connPeer = null;
      // Don't remove — allow reconnect. Just mark idle.
      this._broadcastLobby();
    }
    this.conns.delete(conn.peer);
  }

  _onData(conn, msg){
    switch(msg.type){
      case 'join': this._handleJoin(conn, msg); break;
      case 'reconnect': this._handleReconnect(conn, msg); break;
      case 'buzz': this._handleBuzz(conn); break;
      case 'pong': this._handlePong(conn); break;
      case 'create_team': this._handleCreateTeam(conn, msg); break;
      case 'join_team': this._handleJoinTeam(conn, msg); break;
      case 'leave_team': this._handleLeaveTeam(conn); break;
    }
  }

  _handleJoin(conn, msg){
    if(this.players.size >= MAX_PLAYERS){
      conn.send({type:'error',message:'Room full (16 max)'}); return;
    }
    const id = 'p'+(++this.pidCounter);
    const color = PLAYER_COLORS[this.colorIdx % PLAYER_COLORS.length];
    this.colorIdx++;
    const token = Math.random().toString(36).substring(2,14);
    this.reconnectTokens.set(token, id);

    const player = { name:msg.name||'Player', color, connPeer:conn.peer, team:null, lastSeen:Date.now(), idle:false, penaltyUntil:0 };
    this.players.set(id, player);
    this.conns.set(conn.peer, { conn, playerId:id });

    conn.send({ type:'joined', id, color, name:player.name, token, teams:this._teamsPayload(), teamsLocked:this.teamsLocked });

    if(this.armed && !this.locked){
      conn.send({ type:'round_armed', timerDuration:this.timerDuration });
    }
    this._broadcastLobby();
  }

  _handleReconnect(conn, msg){
    const playerId = this.reconnectTokens.get(msg.token);
    if(!playerId || !this.players.has(playerId)){
      conn.send({type:'error', message:'Reconnect failed — join as new player'}); return;
    }
    const p = this.players.get(playerId);
    // Remove old connection if exists
    if(p.connPeer && this.conns.has(p.connPeer)){
      this.conns.delete(p.connPeer);
    }
    p.connPeer = conn.peer;
    p.lastSeen = Date.now();
    p.idle = false;
    this.conns.set(conn.peer, { conn, playerId });

    conn.send({ type:'rejoined', id:playerId, color:p.color, name:p.name, team:p.team, token:msg.token, teams:this._teamsPayload(), teamsLocked:this.teamsLocked });

    if(this.armed && !this.locked){
      conn.send({ type:'round_armed', timerDuration:this.timerDuration });
    } else if(this.armed && this.locked && this.buzzes.length > 0){
      conn.send({ type:'first_buzz', id:this.buzzes[0].id, name:this.buzzes[0].name, color:this.buzzes[0].color, timerDuration:this.timerDuration });
    }
    this._broadcastLobby();
  }

  _handlePong(conn){
    const entry = this.conns.get(conn.peer);
    if(!entry) return;
    const p = this.players.get(entry.playerId);
    if(p){ p.lastSeen = Date.now(); p.idle = false; }
  }

  _handleBuzz(conn){
    if(!this.armed) return;
    const entry = this.conns.get(conn.peer);
    if(!entry) return;
    const pid = entry.playerId;
    const p = this.players.get(pid);
    if(!p) return;
    // Already buzzed?
    if(this.buzzes.find(b=>b.id===pid)) return;
    // Penalty active?
    if(p.penaltyUntil && Date.now() < p.penaltyUntil){
      conn.send({ type:'penalty_active', remaining: Math.ceil((p.penaltyUntil - Date.now())/1000) });
      return;
    }

    const now = Date.now();
    const isFirst = this.buzzes.length === 0;
    const gap = isFirst ? 0 : now - this.buzzes[0].time;

    this.buzzes.push({ id:pid, name:p.name, color:p.color, team:p.team, time:now, gap, order:this.buzzes.length+1 });

    if(isFirst){
      this.locked = true;
      this._broadcast({ type:'first_buzz', id:pid, name:p.name, color:p.color, team:p.team, timerDuration:this.timerDuration });
    }

    conn.send({ type:'buzz_confirmed', order:this.buzzes.length, gap });
    this.onUpdate({ type:'buzz_list', buzzes:[...this.buzzes] });
  }

  _handleCreateTeam(conn, msg){
    if(this.teamsLocked){ conn.send({type:'error',message:'Teams are locked'}); return; }
    if(this.teams.size >= MAX_TEAMS){ conn.send({type:'error',message:`Max ${MAX_TEAMS} teams`}); return; }
    const entry = this.conns.get(conn.peer);
    if(!entry) return;
    const tid = 't'+(this.teams.size+1)+'_'+Date.now();
    const colorIdx = msg.colorIndex != null ? msg.colorIndex : this.teams.size;
    const preset = TEAM_PRESET_COLORS[colorIdx % TEAM_PRESET_COLORS.length];
    this.teams.set(tid, { name:msg.name||('Team '+(this.teams.size+1)), color:preset.hex });
    // Auto-join creator
    const p = this.players.get(entry.playerId);
    if(p) p.team = tid;
    this._broadcastTeamsAndLobby();
  }

  _handleJoinTeam(conn, msg){
    if(this.teamsLocked){ conn.send({type:'error',message:'Teams are locked'}); return; }
    const entry = this.conns.get(conn.peer);
    if(!entry) return;
    if(!this.teams.has(msg.teamId)) return;
    const p = this.players.get(entry.playerId);
    if(p) p.team = msg.teamId;
    this._broadcastTeamsAndLobby();
  }

  _handleLeaveTeam(conn){
    if(this.teamsLocked){ conn.send({type:'error',message:'Teams are locked'}); return; }
    const entry = this.conns.get(conn.peer);
    if(!entry) return;
    const p = this.players.get(entry.playerId);
    if(p) p.team = null;
    this._broadcastTeamsAndLobby();
  }

  // Host actions
  armRound(){
    this.armed=true; this.locked=false; this.buzzes=[];
    this._broadcast({ type:'round_armed', timerDuration:this.timerDuration });
    this.onUpdate({type:'armed'});
  }
  resetRound(){
    this.armed=false; this.locked=false; this.buzzes=[];
    // Clear all active penalties on reset
    for(const [, p] of this.players){ p.penaltyUntil = 0; }
    this._broadcast({type:'round_reset'});
    this.onUpdate({type:'reset'});
  }
  setTimer(s){ this.timerDuration=s; }

  penalizeTeam(teamId){
    // 10 second penalty for all players on this team
    const until = Date.now() + 10000;
    for(const [id, p] of this.players){
      if(p.team === teamId){
        p.penaltyUntil = until;
        const entry = [...this.conns.values()].find(c => c.playerId === id);
        if(entry) try { entry.conn.send({ type:'penalty', seconds:10 }); } catch(e){}
      }
    }
    this._broadcast({ type:'team_penalized', teamId, seconds:10 });
    this.onUpdate({ type:'team_penalized', teamId });
  }

  penalizePlayer(playerId){
    const p = this.players.get(playerId);
    if(!p) return;
    p.penaltyUntil = Date.now() + 10000;
    const entry = [...this.conns.values()].find(c => c.playerId === playerId);
    if(entry) try { entry.conn.send({ type:'penalty', seconds:10 }); } catch(e){}
    this.onUpdate({ type:'player_penalized', playerId });
  }

  kickPlayer(id){
    const p = this.players.get(id);
    if(!p) return;
    if(p.connPeer){
      const entry = this.conns.get(p.connPeer);
      if(entry){ try{entry.conn.send({type:'kicked'});}catch(e){} try{entry.conn.close();}catch(e){} }
      this.conns.delete(p.connPeer);
    }
    // Remove reconnect token
    for(const [tok,pid] of this.reconnectTokens){ if(pid===id) this.reconnectTokens.delete(tok); }
    this.players.delete(id);
    this._broadcastLobby();
  }

  lockTeams(){ this.teamsLocked=true; this._broadcast({type:'teams_locked'}); this._broadcastLobby(); }
  unlockTeams(){ this.teamsLocked=false; this._broadcast({type:'teams_unlocked'}); this._broadcastLobby(); }

  setSoundTheme(t){ setSoundTheme(t); this._broadcast({type:'sound_theme',theme:t}); }

  // Payloads
  _teamsPayload(){
    const out=[];
    for(const [id,t] of this.teams) out.push({id,name:t.name,color:t.color});
    return out;
  }
  _lobbyPayload(){
    const players=[];
    for(const [id,p] of this.players){
      players.push({ id, name:p.name, color:p.color, team:p.team, idle:p.idle, penalized:p.penaltyUntil>Date.now() });
    }
    return { players, teams:this._teamsPayload(), teamsLocked:this.teamsLocked };
  }

  _broadcastLobby(){
    const lobby = this._lobbyPayload();
    this._broadcast({ type:'lobby', ...lobby });
  }
  _broadcastTeamsAndLobby(){
    this._broadcastLobby();
  }

  _broadcast(msg){
    for(const [,c] of this.conns){
      try { c.conn.send(msg); } catch(e){}
    }
    this.onUpdate(msg);
  }

  getJoinURL(){
    return window.location.href.replace(/\/[^/]*$/,'/') + 'join.html?room=' + this.roomCode;
  }

  destroy(){
    if(this._hbInterval) clearInterval(this._hbInterval);
    if(this.peer) this.peer.destroy();
  }
}

/* ══════════════════════════════════════
   PLAYER
   ══════════════════════════════════════ */
class BuzzerPlayer {
  constructor(onUpdate){
    this.onUpdate = onUpdate;
    this.peer = null;
    this.conn = null;
    this.myId = null;
    this.myColor = '#00E5FF';
    this.myName = '';
    this.myTeam = null;
    this.token = null; // reconnect token
    this._pongInterval = null;
  }

  join(roomCode, name){
    return new Promise((resolve, reject) => {
      this.myName = name;
      const hostId = PEER_PREFIX + roomCode.toLowerCase();
      this.peer = new Peer(undefined, { debug:0, config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]} });

      this.peer.on('open', () => {
        this.conn = this.peer.connect(hostId, {reliable:true});
        this.conn.on('open', () => {
          // Check for reconnect token
          const stored = sessionStorage.getItem('bzr_token_'+roomCode);
          if(stored){
            this.conn.send({type:'reconnect', token:stored});
          } else {
            this.conn.send({type:'join', name});
          }
          this._startPong();
        });
        this.conn.on('data', d => this._onData(d, resolve));
        this.conn.on('close', () => this.onUpdate({type:'disconnected'}));
        this.conn.on('error', () => reject(new Error('Connection failed')));
      });
      this.peer.on('error', err => {
        if(err.type==='peer-unavailable') reject(new Error('Room not found'));
        else reject(err);
      });
      setTimeout(()=>{ if(!this.myId) reject(new Error('Connection timed out')); }, 12000);
    });
  }

  _startPong(){
    this._pongInterval = setInterval(() => {
      if(this.conn) try { this.conn.send({type:'pong'}); } catch(e){}
    }, HEARTBEAT_MS);
  }

  _onData(msg, resolveJoin){
    switch(msg.type){
      case 'joined':
        this.myId=msg.id; this.myColor=msg.color; this.myName=msg.name; this.token=msg.token;
        // Store token for reconnect
        const code = new URLSearchParams(location.search).get('room')||'';
        if(this.token) sessionStorage.setItem('bzr_token_'+code.toUpperCase(), this.token);
        if(resolveJoin) resolveJoin({id:msg.id, color:msg.color, name:msg.name, teams:msg.teams, teamsLocked:msg.teamsLocked});
        this.onUpdate(msg);
        break;
      case 'rejoined':
        this.myId=msg.id; this.myColor=msg.color; this.myName=msg.name; this.myTeam=msg.team; this.token=msg.token;
        if(resolveJoin) resolveJoin({id:msg.id, color:msg.color, name:msg.name, teams:msg.teams, teamsLocked:msg.teamsLocked, rejoined:true});
        this.onUpdate(msg);
        break;
      case 'ping':
        if(this.conn) try{this.conn.send({type:'pong'});}catch(e){}
        break;
      case 'error':
        // If reconnect failed, clear token and retry as new join
        if(msg.message && msg.message.includes('Reconnect failed')){
          const c2 = new URLSearchParams(location.search).get('room')||'';
          sessionStorage.removeItem('bzr_token_'+c2.toUpperCase());
        }
        this.onUpdate(msg);
        break;
      default:
        this.onUpdate(msg);
    }
  }

  buzz(){ if(this.conn) this.conn.send({type:'buzz'}); }
  createTeam(name, colorIndex){ if(this.conn) this.conn.send({type:'create_team', name, colorIndex}); }
  joinTeam(teamId){ if(this.conn) this.conn.send({type:'join_team', teamId}); this.myTeam=teamId; }
  leaveTeam(){ if(this.conn) this.conn.send({type:'leave_team'}); this.myTeam=null; }

  destroy(){
    if(this._pongInterval) clearInterval(this._pongInterval);
    if(this.peer) this.peer.destroy();
  }
}
