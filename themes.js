/* BUZZER — Theme System v4
   Thrill (neon), Posh (gold+navy), Glass (glassmorphism), الديوانية
*/
const THEMES = {
  thrill: {
    name: 'Thrill',
    vars: {
      '--t-bg':'#06060C','--t-s1':'#0E0E18','--t-s2':'#161624','--t-bdr':'#222236',
      '--t-txt':'#E0E0F0','--t-dim':'#8888A0','--t-primary':'#00E5FF','--t-secondary':'#FF3E6C',
      '--t-green':'#76FF03','--t-yellow':'#FFD600','--t-orange':'#FF9100',
      '--t-btn-start-bg':'linear-gradient(135deg,#00E5FF,#00B4D8)','--t-btn-start-c':'#06060C',
      '--t-btn-reset-bg':'linear-gradient(135deg,#FF3E6C,#D81B60)','--t-btn-reset-c':'#ffffff',
      '--t-card-bg':'#0E0E18','--t-card-bdr':'#222236','--t-input-bg':'#06060C',
      '--t-buzz-glow':'1','--t-logo-grad':'linear-gradient(135deg,#00E5FF,#FF3E6C)',
      '--t-lock-color':'#76FF03','--t-lock-bg':'rgba(118,255,3,0.05)','--t-lock-bdr':'rgba(118,255,3,0.3)',
      '--t-penalty-color':'#FF9100','--t-penalty-bg':'rgba(255,145,0,0.06)','--t-penalty-bdr':'rgba(255,145,0,0.25)',
      '--t-mode':'dark'
    }
  },
  posh: {
    name: 'Posh',
    vars: {
      '--t-bg':'#0B1120','--t-s1':'#111B33','--t-s2':'#182444','--t-bdr':'#243050',
      '--t-txt':'#E8E4D8','--t-dim':'#8090A8','--t-primary':'#D4A853','--t-secondary':'#C0392B',
      '--t-green':'#27AE60','--t-yellow':'#D4A853','--t-orange':'#E67E22',
      '--t-btn-start-bg':'linear-gradient(135deg,#D4A853,#B8902E)','--t-btn-start-c':'#0B1120',
      '--t-btn-reset-bg':'linear-gradient(135deg,#C0392B,#962D22)','--t-btn-reset-c':'#ffffff',
      '--t-card-bg':'#111B33','--t-card-bdr':'#243050','--t-input-bg':'#0B1120',
      '--t-buzz-glow':'1','--t-logo-grad':'linear-gradient(135deg,#D4A853,#E8C56A)',
      '--t-lock-color':'#27AE60','--t-lock-bg':'rgba(39,174,96,0.06)','--t-lock-bdr':'rgba(39,174,96,0.3)',
      '--t-penalty-color':'#E67E22','--t-penalty-bg':'rgba(230,126,34,0.06)','--t-penalty-bdr':'rgba(230,126,34,0.25)',
      '--t-mode':'dark'
    }
  },
  glass: {
    name: 'Glass',
    vars: {
      '--t-bg':'#0a0b10','--t-s1':'rgba(22,25,37,0.5)','--t-s2':'rgba(30,34,50,0.45)','--t-bdr':'rgba(255,255,255,0.1)',
      '--t-txt':'#FFFFFF','--t-dim':'#a0a5b5','--t-primary':'#00f0ff','--t-secondary':'#ff0055',
      '--t-green':'#00ff66','--t-yellow':'#ffaa00','--t-orange':'#ff6633',
      '--t-btn-start-bg':'linear-gradient(135deg,#00f0ff,#00c4cc)','--t-btn-start-c':'#0a0b10',
      '--t-btn-reset-bg':'linear-gradient(135deg,#ffaa00,#cc8800)','--t-btn-reset-c':'#0a0b10',
      '--t-card-bg':'rgba(22,25,37,0.5)','--t-card-bdr':'rgba(255,255,255,0.1)','--t-input-bg':'rgba(15,17,25,0.6)',
      '--t-buzz-glow':'1','--t-logo-grad':'linear-gradient(135deg,#00f0ff,#00ff66)',
      '--t-lock-color':'#00ff66','--t-lock-bg':'rgba(0,255,102,0.06)','--t-lock-bdr':'rgba(0,255,102,0.2)',
      '--t-penalty-color':'#ff6633','--t-penalty-bg':'rgba(255,102,51,0.06)','--t-penalty-bdr':'rgba(255,102,51,0.2)',
      '--t-mode':'dark'
    }
  },
  aldewaniah: {
    name: 'الديوانية',
    vars: {
      '--t-bg':'#F2EDE4','--t-s1':'#FFFFFF','--t-s2':'#F8F5F0','--t-bdr':'#D8D0C4',
      '--t-txt':'#1B2A4A','--t-dim':'#8A7B6B','--t-primary':'#6B2D3E','--t-secondary':'#1B2A4A',
      '--t-green':'#2E7D32','--t-yellow':'#C9A84C','--t-orange':'#C0392B',
      '--t-btn-start-bg':'linear-gradient(135deg,#6B2D3E,#5A2433)','--t-btn-start-c':'#F2EDE4',
      '--t-btn-reset-bg':'linear-gradient(135deg,#1B2A4A,#15223C)','--t-btn-reset-c':'#F2EDE4',
      '--t-card-bg':'#FFFFFF','--t-card-bdr':'#D8D0C4','--t-input-bg':'#F8F5F0',
      '--t-buzz-glow':'0','--t-logo-grad':'linear-gradient(135deg,#6B2D3E,#1B2A4A)',
      '--t-lock-color':'#2E7D32','--t-lock-bg':'rgba(46,125,50,0.06)','--t-lock-bdr':'rgba(46,125,50,0.3)',
      '--t-penalty-color':'#C0392B','--t-penalty-bg':'rgba(192,57,43,0.06)','--t-penalty-bdr':'rgba(192,57,43,0.25)',
      '--t-mode':'light'
    }
  }
};

let _currentTheme = 'thrill';

function applyTheme(themeId) {
  const theme = THEMES[themeId];
  if (!theme) return;
  _currentTheme = themeId;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  // Aldewaniah logo toggle
  const alLogo = document.getElementById('aldewaniahLogo');
  if (alLogo) alLogo.style.display = (themeId === 'aldewaniah') ? 'block' : 'none';
  const stdLogo = document.getElementById('stdLogo');
  if (stdLogo) stdLogo.style.display = (themeId === 'aldewaniah') ? 'none' : 'block';
  // Glass backdrop-filter
  const isGlass = themeId === 'glass';
  document.querySelectorAll('.glass-target').forEach(el => {
    el.style.backdropFilter = isGlass ? 'blur(20px)' : 'none';
    el.style.webkitBackdropFilter = isGlass ? 'blur(20px)' : 'none';
  });
}

function getCurrentTheme() { return _currentTheme; }
function getThemeList() { return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name })); }

/* Toast notification system */
let _toastBox = null;
function showToast(msg, type) {
  if (!_toastBox) {
    _toastBox = document.createElement('div');
    _toastBox.style.cssText = 'position:fixed;top:env(safe-area-inset-top,12px);left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:92%;max-width:420px';
    document.body.appendChild(_toastBox);
  }
  const cols = { info:'var(--t-primary)', success:'var(--t-green)', warning:'var(--t-orange)', error:'var(--t-secondary)' };
  const bg = cols[type] || cols.info;
  const t = document.createElement('div');
  t.style.cssText = 'padding:10px 18px;border-radius:12px;font-family:Barlow,sans-serif;font-size:14px;font-weight:800;letter-spacing:.5px;opacity:0;transform:translateY(-12px);transition:all .3s ease;pointer-events:auto;text-align:center;width:100%;color:#000;background:'+bg;
  t.textContent = msg;
  _toastBox.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-12px)'; setTimeout(() => t.remove(), 300); }, 2800);
}
