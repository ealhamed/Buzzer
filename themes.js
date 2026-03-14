/* BUZZER — Theme System
   Host switches theme → broadcast to all players.
   Themes are CSS custom properties applied to :root.
*/

const THEMES = {
  neon: {
    name: 'Neon',
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
  gold: {
    name: 'Gold & Navy',
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
  purple: {
    name: 'Electric Purple',
    vars: {
      '--t-bg':'#100818','--t-s1':'#1A0E28','--t-s2':'#221438','--t-bdr':'#351D55',
      '--t-txt':'#F0E8FF','--t-dim':'#9080B0','--t-primary':'#BF5AF2','--t-secondary':'#FF2D78',
      '--t-green':'#30D5C8','--t-yellow':'#FFD166','--t-orange':'#FF6B6B',
      '--t-btn-start-bg':'linear-gradient(135deg,#BF5AF2,#9B30FF)','--t-btn-start-c':'#ffffff',
      '--t-btn-reset-bg':'linear-gradient(135deg,#FF2D78,#D81B60)','--t-btn-reset-c':'#ffffff',
      '--t-card-bg':'#1A0E28','--t-card-bdr':'#351D55','--t-input-bg':'#100818',
      '--t-buzz-glow':'1','--t-logo-grad':'linear-gradient(135deg,#BF5AF2,#FF2D78)',
      '--t-lock-color':'#30D5C8','--t-lock-bg':'rgba(48,213,200,0.06)','--t-lock-bdr':'rgba(48,213,200,0.3)',
      '--t-penalty-color':'#FF6B6B','--t-penalty-bg':'rgba(255,107,107,0.06)','--t-penalty-bdr':'rgba(255,107,107,0.25)',
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

let _currentTheme = 'neon';

function applyTheme(themeId) {
  const theme = THEMES[themeId];
  if (!theme) return;
  _currentTheme = themeId;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
  // Toggle aldewaniah logo visibility
  const alLogo = document.getElementById('aldewaniahLogo');
  if (alLogo) alLogo.style.display = (themeId === 'aldewaniah') ? 'block' : 'none';
  // Toggle standard logo
  const stdLogo = document.getElementById('stdLogo');
  if (stdLogo) stdLogo.style.display = (themeId === 'aldewaniah') ? 'none' : 'block';
}

function getCurrentTheme() { return _currentTheme; }
function getThemeList() { return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name })); }
