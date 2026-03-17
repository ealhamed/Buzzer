/*  BUZZER v4 — P2P Game Engine
    PeerJS WebRTC. Latency correction. Early buzz penalty. Round history.
*/
const PEER_PREFIX = 'bzr4-';
const MAX_PLAYERS = 16;
const MAX_TEAMS = 4;
const HEARTBEAT_MS = 3000;
const IDLE_THRESHOLD_MS = 10000;

const TEAM_PRESET_COLORS = [
  {name:'Crimson',hex:'#FF3E6C'},{name:'Cyan',hex:'#00E5FF'},
  {name:'Lime',hex:'#76FF03'},{name:'Amber',hex:'#FFD600'}
];
const PLAYER_COLORS = [
  '#FF6B8A','#00D4F5','#FFE040','#8CFF20','#FF7B00','#E040FB','#00F5A0','#FF2D55',
  '#40FFFF','#FFEE58','#80FFCC','#FF8A50','#B39DFF','#69F0AE','#FF8A80','#84FFFF'
];

let _actx;
function actx(){if(!_actx)_actx=new(window.AudioContext||window.webkitAudioContext)();return _actx;}
function playSound(key){
  const defs={buzz:{type:'square',f0:880,f1:440,dur:.15,vol:.25},lock:{type:'sawtooth',f0:200,f1:100,dur:.2,vol:.12},click:{type:'sine',f0:660,f1:660,dur:.1,vol:.15},arm:{type:'sine',f0:520,f1:780,dur:.2,vol:.18},penalty:{type:'sawtooth',f0:150,f1:80,dur:.35,vol:.2}};
  try{const s=defs[key];if(!s)return;const c=actx(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type=s.type;o.frequency.setValueAtTime(s.f0,c.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(1,s.f1),c.currentTime+s.dur);g.gain.setValueAtTime(s.vol,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+s.dur+.05);o.start(c.currentTime);o.stop(c.currentTime+s.dur+.06);}catch(e){}
}
function hapticBuzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms||80);}catch(e){}}
function genCode(){return Math.random().toString(36).substring(2,6).toUpperCase();}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function lighten(hex,pct){const n=parseInt(hex.replace('#',''),16),a=Math.round(2.55*pct);return'#'+(0x1000000+Math.min(255,(n>>16)+a)*0x10000+Math.min(255,((n>>8)&0xFF)+a)*0x100+Math.min(255,(n&0xFF)+a)).toString(16).slice(1)}
function darken(hex,pct){const n=parseInt(hex.replace('#',''),16),a=Math.round(2.55*pct);return'#'+(0x1000000+Math.max(0,(n>>16)-a)*0x10000+Math.max(0,((n>>8)&0xFF)-a)*0x100+Math.max(0,(n&0xFF)-a)).toString(16).slice(1)}

class BuzzerHost {
  constructor(onUpdate){
    this.onUpdate=onUpdate;this.peer=null;this.conns=new Map();this.players=new Map();
    this.teams=new Map();this.buzzes=[];this.armed=false;this.locked=false;
    this.timerDuration=3;this.colorIdx=0;this.roomCode='';this.pidCounter=0;
    this.teamsLocked=false;this._hbInterval=null;this.reconnectTokens=new Map();
    this.theme='neon';this.roundHistory=[];this.armedAt=0;this.penaltySeconds=10;
    // Latency: store clock offset per player
    this.clockOffsets=new Map();
  }
  create(){
    return new Promise((resolve,reject)=>{
      this.roomCode=genCode();
      this.peer=new Peer(PEER_PREFIX+this.roomCode.toLowerCase(),{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
      this.peer.on('open',()=>{this._startHB();resolve(this.roomCode);});
      this.peer.on('connection',c=>this._onConn(c));
      this.peer.on('error',err=>{if(err.type==='unavailable-id'){this.roomCode=genCode();this.peer.destroy();this.create().then(resolve).catch(reject);}else reject(err);});
    });
  }
  _startHB(){
    this._hbInterval=setInterval(()=>{
      const now=Date.now();let ch=false;
      for(const[,p]of this.players){const w=p.idle;p.idle=(now-p.lastSeen)>IDLE_THRESHOLD_MS;if(p.idle!==w)ch=true;}
      if(ch)this._broadcastLobby();
      // Ping with timestamp for latency calc
      for(const[,c]of this.conns)try{c.conn.send({type:'ping',t:Date.now()});}catch(e){}
    },HEARTBEAT_MS);
  }
  _onConn(conn){conn.on('open',()=>{conn.on('data',d=>this._onData(conn,d));});conn.on('close',()=>this._onDC(conn));conn.on('error',()=>this._onDC(conn));}
  _onDC(conn){const e=this.conns.get(conn.peer);if(!e)return;const p=this.players.get(e.playerId);if(p){p.idle=true;p.connPeer=null;this._broadcastLobby();}this.conns.delete(conn.peer);}
  _onData(conn,msg){
    switch(msg.type){
      case'join':this._join(conn,msg);break;case'reconnect':this._reconn(conn,msg);break;
      case'buzz':this._buzz(conn,msg);break;
      case'pong':{
        const e=this.conns.get(conn.peer);if(!e)return;
        const p=this.players.get(e.playerId);if(p){p.lastSeen=Date.now();p.idle=false;}
        // Latency: calculate clock offset
        if(msg.hostT){const rtt=Date.now()-msg.hostT;this.clockOffsets.set(e.playerId,Math.round(rtt/2));}
        break;
      }
      case'create_team':this._createTeam(conn,msg);break;case'join_team':this._joinTeam(conn,msg);break;case'leave_team':this._leaveTeam(conn);break;
      case'rename':{const e=this.conns.get(conn.peer);if(!e)return;const p=this.players.get(e.playerId);if(p&&msg.name){p.name=msg.name.substring(0,20);this._broadcastLobby();}break;}
    }
  }
  _join(conn,msg){
    if(this.players.size>=MAX_PLAYERS){conn.send({type:'error',message:'Room full (16 max)'});return;}
    const id='p'+(++this.pidCounter),color=PLAYER_COLORS[this.colorIdx%PLAYER_COLORS.length];this.colorIdx++;
    const token=Math.random().toString(36).substring(2,14);this.reconnectTokens.set(token,id);
    this.players.set(id,{name:msg.name||'Player',color,connPeer:conn.peer,team:null,lastSeen:Date.now(),idle:false,penaltyUntil:0});
    this.conns.set(conn.peer,{conn,playerId:id});
    conn.send({type:'joined',id,color,name:msg.name||'Player',token,teams:this._tp(),teamsLocked:this.teamsLocked,theme:this.theme});
    if(this.armed&&!this.locked)conn.send({type:'round_armed',timerDuration:this.timerDuration});
    this._broadcastLobby();
  }
  _reconn(conn,msg){
    const pid=this.reconnectTokens.get(msg.token);
    if(!pid||!this.players.has(pid)){conn.send({type:'error',message:'Reconnect failed — join as new player'});return;}
    const p=this.players.get(pid);
    if(p.connPeer&&this.conns.has(p.connPeer))this.conns.delete(p.connPeer);
    p.connPeer=conn.peer;p.lastSeen=Date.now();p.idle=false;
    this.conns.set(conn.peer,{conn,playerId:pid});
    conn.send({type:'rejoined',id:pid,color:p.color,name:p.name,team:p.team,token:msg.token,teams:this._tp(),teamsLocked:this.teamsLocked,theme:this.theme});
    if(this.armed&&!this.locked)conn.send({type:'round_armed',timerDuration:this.timerDuration});
    else if(this.armed&&this.locked&&this.buzzes.length>0)conn.send({type:'first_buzz',id:this.buzzes[0].id,name:this.buzzes[0].name,color:this.buzzes[0].color,team:this.buzzes[0].team,timerDuration:this.timerDuration});
    this._broadcastLobby();
  }
  _buzz(conn,msg){
    if(!this.armed)return;const e=this.conns.get(conn.peer);if(!e)return;
    const pid=e.playerId,p=this.players.get(pid);if(!p)return;
    if(this.buzzes.find(b=>b.id===pid))return;
    if(p.penaltyUntil&&Date.now()<p.penaltyUntil){conn.send({type:'penalty_active',remaining:Math.ceil((p.penaltyUntil-Date.now())/1000)});return;}
    // Latency correction: use player's local timestamp if provided, adjust by clock offset
    let buzzTime=Date.now();
    if(msg.localTime){
      const offset=this.clockOffsets.get(pid)||0;
      buzzTime=msg.localTime+offset;
    }
    const isFirst=this.buzzes.length===0;
    const gap=isFirst?0:buzzTime-this.buzzes[0].time;
    this.buzzes.push({id:pid,name:p.name,color:p.color,team:p.team,time:buzzTime,gap:Math.max(0,gap),order:this.buzzes.length+1});
    // Re-sort by corrected time
    this.buzzes.sort((a,b)=>a.time-b.time);
    this.buzzes.forEach((b,i)=>{b.order=i+1;b.gap=i===0?0:b.time-this.buzzes[0].time;});
    if(isFirst){
      this.locked=true;
      this._broadcast({type:'first_buzz',id:this.buzzes[0].id,name:this.buzzes[0].name,color:this.buzzes[0].color,team:this.buzzes[0].team,timerDuration:this.timerDuration});
    }
    conn.send({type:'buzz_confirmed',order:this.buzzes.find(b=>b.id===pid).order,gap:this.buzzes.find(b=>b.id===pid).gap});
    this.onUpdate({type:'buzz_list',buzzes:[...this.buzzes]});
  }
  _createTeam(conn,msg){
    if(this.teamsLocked){conn.send({type:'error',message:'Teams are locked'});return;}
    if(this.teams.size>=MAX_TEAMS){conn.send({type:'error',message:'Max '+MAX_TEAMS+' teams'});return;}
    const e=this.conns.get(conn.peer);if(!e)return;
    const tid='t'+(this.teams.size+1)+'_'+Date.now(),ci=msg.colorIndex!=null?msg.colorIndex:this.teams.size;
    this.teams.set(tid,{name:msg.name||'Team '+(this.teams.size+1),color:TEAM_PRESET_COLORS[ci%TEAM_PRESET_COLORS.length].hex});
    const p=this.players.get(e.playerId);if(p)p.team=tid;
    this._broadcastLobby();
  }
  _joinTeam(conn,msg){
    if(this.teamsLocked){conn.send({type:'error',message:'Teams are locked'});return;}
    const e=this.conns.get(conn.peer);if(!e)return;if(!this.teams.has(msg.teamId))return;
    const p=this.players.get(e.playerId);if(p)p.team=msg.teamId;this._broadcastLobby();
  }
  _leaveTeam(conn){
    if(this.teamsLocked){conn.send({type:'error',message:'Teams are locked'});return;}
    const e=this.conns.get(conn.peer);if(!e)return;const p=this.players.get(e.playerId);if(p)p.team=null;this._broadcastLobby();
  }
  armRound(){
    this.armed=true;this.locked=false;this.buzzes=[];this.armedAt=Date.now();
    this._broadcast({type:'round_armed',timerDuration:this.timerDuration});
    this.onUpdate({type:'armed'});
  }
  resetRound(){
    // Save to history if there was a buzz
    if(this.buzzes.length>0){
      const first=this.buzzes[0];
      const teamInfo=first.team?this.teams.get(first.team):null;
      this.roundHistory.push({round:this.roundHistory.length+1,name:first.name,color:first.color,team:teamInfo?teamInfo.name:null,teamColor:teamInfo?teamInfo.color:null});
      this.onUpdate({type:'history_update',history:[...this.roundHistory]});
    }
    this.armed=false;this.locked=false;this.buzzes=[];
    for(const[,p]of this.players)p.penaltyUntil=0;
    this._broadcast({type:'round_reset'});this.onUpdate({type:'reset'});
  }
  setTimer(s){this.timerDuration=Math.max(1,Math.min(60,parseInt(s)||3));}
  setPenaltyDuration(s){this.penaltySeconds=Math.max(1,Math.min(60,parseInt(s)||10));}
  penalizeTeam(teamId){
    const secs=this.penaltySeconds||10;const until=Date.now()+secs*1000;
    for(const[id,p]of this.players){if(p.team===teamId){p.penaltyUntil=until;const e=[...this.conns.values()].find(c=>c.playerId===id);if(e)try{e.conn.send({type:'penalty',seconds:secs});}catch(ex){}}}
    this._broadcast({type:'team_penalized',teamId,seconds:secs});this.onUpdate({type:'team_penalized',teamId});
  }
  kickPlayer(id){
    const p=this.players.get(id);if(!p)return;
    if(p.connPeer){const e=this.conns.get(p.connPeer);if(e){try{e.conn.send({type:'kicked'});}catch(ex){}try{e.conn.close();}catch(ex){}}this.conns.delete(p.connPeer);}
    for(const[tok,pid]of this.reconnectTokens)if(pid===id)this.reconnectTokens.delete(tok);
    this.players.delete(id);this._broadcastLobby();
  }
  lockTeams(){this.teamsLocked=true;this._broadcast({type:'teams_locked'});this._broadcastLobby();}
  unlockTeams(){this.teamsLocked=false;this._broadcast({type:'teams_unlocked'});this._broadcastLobby();}
  setTheme(themeId){this.theme=themeId;this._broadcast({type:'theme_change',theme:themeId});}
  _tp(){const o=[];for(const[id,t]of this.teams)o.push({id,name:t.name,color:t.color});return o;}
  _broadcastLobby(){const ps=[];for(const[id,p]of this.players)ps.push({id,name:p.name,color:p.color,team:p.team,idle:p.idle,penalized:p.penaltyUntil>Date.now()});this._broadcast({type:'lobby',players:ps,teams:this._tp(),teamsLocked:this.teamsLocked});}
  _broadcast(msg){for(const[,c]of this.conns)try{c.conn.send(msg);}catch(e){}this.onUpdate(msg);}
  getJoinURL(){return window.location.href.replace(/\/[^/]*$/,'/')+('join.html?room='+this.roomCode);}
  destroy(){if(this._hbInterval)clearInterval(this._hbInterval);if(this.peer)this.peer.destroy();}
}

class BuzzerPlayer {
  constructor(onUpdate){this.onUpdate=onUpdate;this.peer=null;this.conn=null;this.myId=null;this.myColor='#00E5FF';this.myName='';this.myTeam=null;this.token=null;this._pi=null;}
  join(roomCode,name){
    return new Promise((resolve,reject)=>{
      this.myName=name;
      this.peer=new Peer(undefined,{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
      this.peer.on('open',()=>{
        this.conn=this.peer.connect(PEER_PREFIX+roomCode.toLowerCase(),{reliable:true});
        this.conn.on('open',()=>{
          const s=sessionStorage.getItem('bzr_token_'+roomCode);
          if(s)this.conn.send({type:'reconnect',token:s});
          else this.conn.send({type:'join',name});
          this._pi=setInterval(()=>{if(this.conn)try{this.conn.send({type:'pong'});}catch(e){}},HEARTBEAT_MS);
        });
        this.conn.on('data',d=>this._onData(d,resolve));
        this.conn.on('close',()=>this.onUpdate({type:'disconnected'}));
        this.conn.on('error',()=>reject(new Error('Connection failed')));
      });
      this.peer.on('error',err=>{if(err.type==='peer-unavailable')reject(new Error('Room not found'));else reject(err);});
      setTimeout(()=>{if(!this.myId)reject(new Error('Connection timed out'));},12000);
    });
  }
  _onData(msg,res){
    switch(msg.type){
      case'joined':this.myId=msg.id;this.myColor=msg.color;this.myName=msg.name;this.token=msg.token;{const c=new URLSearchParams(location.search).get('room')||'';if(this.token)sessionStorage.setItem('bzr_token_'+c.toUpperCase(),this.token);}if(res)res({id:msg.id,color:msg.color,name:msg.name,teams:msg.teams,teamsLocked:msg.teamsLocked,theme:msg.theme});this.onUpdate(msg);break;
      case'rejoined':this.myId=msg.id;this.myColor=msg.color;this.myName=msg.name;this.myTeam=msg.team;this.token=msg.token;if(res)res({id:msg.id,color:msg.color,name:msg.name,teams:msg.teams,teamsLocked:msg.teamsLocked,rejoined:true,theme:msg.theme});this.onUpdate(msg);break;
      case'ping':
        // Respond with host's timestamp for latency calc
        if(this.conn)try{this.conn.send({type:'pong',hostT:msg.t});}catch(e){}
        break;
      case'error':if(msg.message&&msg.message.includes('Reconnect failed')){const c=new URLSearchParams(location.search).get('room')||'';sessionStorage.removeItem('bzr_token_'+c.toUpperCase());}this.onUpdate(msg);break;
      default:this.onUpdate(msg);
    }
  }
  // Send buzz with local timestamp for latency correction
  buzz(){if(this.conn)this.conn.send({type:'buzz',localTime:Date.now()});}
  rename(name){if(this.conn){this.conn.send({type:'rename',name});this.myName=name;}}
  createTeam(name,colorIndex){if(this.conn)this.conn.send({type:'create_team',name,colorIndex});}
  joinTeam(teamId){if(this.conn)this.conn.send({type:'join_team',teamId});this.myTeam=teamId;}
  leaveTeam(){if(this.conn)this.conn.send({type:'leave_team'});this.myTeam=null;}
  destroy(){if(this._pi)clearInterval(this._pi);if(this.peer)this.peer.destroy();}
}
