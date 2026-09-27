/* =========================================================
   FF Visit Ops — Admin Panel Logic
   Calls existing /visit endpoint (untouched backend)
   ========================================================= */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: k => localStorage.removeItem(k)
};

const state = {
  history: LS.get('ff_history', []),
  totalRequests: LS.get('ff_total_requests', 0),
  regionStats: LS.get('ff_region_stats', {}),
  busy: false
};

/* ============ NAVIGATION ============ */
const VIEWS = {
  dashboard: 'Dashboard',
  sender: 'Visit Sender',
  history: 'History',
  tokens: 'Tokens',
  docs: 'API Docs',
  settings: 'Settings'
};

function navigate(view) {
  if (!VIEWS[view]) return;
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + view)?.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('#page-title').textContent = VIEWS[view];
  $('#breadcrumb-current').textContent = view;
  $('#sidebar').classList.remove('open');
  if (view === 'dashboard') renderDashboard();
  if (view === 'history') renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('.nav-item').forEach(n => n.addEventListener('click', () => navigate(n.dataset.view)));
$$('[data-nav]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.nav)));
$('#menuToggle')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));

/* ============ CLOCK ============ */
function tickClock() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  $('#clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
tickClock(); setInterval(tickClock, 1000);

/* ============ TOASTS ============ */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'ok' ? '' : ' ' + type);
  el.innerHTML = `<span>${type === 'ok' ? '✅' : type === 'error' ? '⛔' : '⚠️'}</span><span>${msg}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ============ LOG ============ */
function log(msg, cls = 'info') {
  const el = $('#logConsole');
  const ts = new Date().toLocaleTimeString('en-GB');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="ts">[${ts}]</span><span class="${cls}">${msg}</span>`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 200) el.removeChild(el.firstChild);
}
$('#clearLog')?.addEventListener('click', () => {
  $('#logConsole').innerHTML = `<div class="log-line"><span class="ts">[clear]</span><span class="ok">Log cleared.</span></div>`;
});

/* ============ REGION CHIPS ============ */
$('#regionChips')?.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  $('#region').value = chip.dataset.region;
});
$('#region')?.addEventListener('change', e => {
  $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.region === e.target.value));
});

/* ============ VISIT FORM ============ */
$('#visitForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (state.busy) return;

  const uid = $('#uid').value.trim();
  const region = $('#region').value;

  if (!/^\d{5,15}$/.test(uid)) {
    toast('Enter a valid numeric UID (5–15 digits).', 'warn');
    return;
  }

  state.busy = true;
  const btn = $('#submitBtn');
  const label = $('.btn-label', btn);
  const spinner = $('.spinner', btn);
  btn.disabled = true;
  label.textContent = 'Sending...';
  spinner.hidden = false;

  const wrap = $('#progressWrap');
  const bar = $('#progressBar');
  const ptext = $('#progressText');
  const ptime = $('#progressTime');
  wrap.hidden = false;
  bar.style.width = '0%';
  ptext.textContent = `Opening connection to region ${region}...`;
  const t0 = performance.now();
  let pct = 0;
  const fakeTimer = setInterval(() => {
    pct = Math.min(pct + Math.random() * 4, 92);
    bar.style.width = pct + '%';
    ptime.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's';
  }, 120);

  log(`→ Dispatching visit request · UID=${uid} · REGION=${region}`, 'info');

  try {
    const res = await fetch(`/visit?uid=${encodeURIComponent(uid)}&region=${encodeURIComponent(region)}`);
    const data = await res.json();

    clearInterval(fakeTimer);
    bar.style.width = '100%';
    ptime.textContent = ((performance.now() - t0) / 1000).toFixed(2) + 's';

    if (!res.ok) {
      ptext.textContent = 'Request failed.';
      log(`✗ ${data.error || 'Request failed'}`, 'err');
      toast(data.error || 'Request failed', 'error');
      if (data && data.error) showResult(null, data);
      bumpRequest(0, 0);
      return;
    }

    const success = data.SuccessfulVisits ?? data.success ?? 0;
    const failed  = data.FailedVisits ?? data.fail ?? 0;
    const total   = data.TotalVisits ?? (success + failed);
    const nick    = data.PlayerNickname ?? data.nickname ?? '—';
    const pUid    = data.UID ?? uid;
    const pRegion = region;

    ptext.textContent = `Done — ${success} successful / ${failed} failed`;
    log(`✓ Completed · success=${success} · failed=${failed} · total=${total}`, 'ok');
    toast(`Visits sent: ${success} success, ${failed} failed`, success > 0 ? 'ok' : 'warn');

    showResult({ uid: pUid, nickname: nick, region: pRegion, success, failed, total }, data);

    state.history.unshift({
      id: Date.now(),
      time: new Date().toISOString(),
      uid: String(pUid),
      region: pRegion,
      nickname: nick,
      success, failed, total,
      duration: +((performance.now() - t0) / 1000).toFixed(2)
    });
    if (state.history.length > 200) state.history.length = 200;
    LS.set('ff_history', state.history);

    bumpRequest(success, failed);
  } catch (err) {
    clearInterval(fakeTimer);
    ptext.textContent = 'Network error.';
    log(`✗ Network error: ${err.message}`, 'err');
    toast('Network error: ' + err.message, 'error');
    bumpRequest(0, 0);
  } finally {
    state.busy = false;
    btn.disabled = false;
    label.textContent = 'Send 1000 Visits';
    spinner.hidden = true;
    updateBadges();
  }
});

$('#visitForm').addEventListener('reset', () => {
  $('#progressWrap').hidden = true;
  $('#resultGrid').hidden = true;
});

function bumpRequest(success, failed) {
  state.totalRequests++;
  LS.set('ff_total_requests', state.totalRequests);
  const r = state.regionStats;
  const region = $('#region').value;
  r[region] = r[region] || { success: 0, failed: 0 };
  r[region].success += success;
  r[region].failed += failed;
  LS.set('ff_region_stats', r);
}

function showResult(player, raw) {
  $('#resultGrid').hidden = false;
  if (player) {
    $('#playerName').textContent = player.nickname || '—';
    $('#playerUid').textContent = 'UID ' + (player.uid || '—');
    $('#playerRegion').textContent = 'REGION ' + (player.region || '—');
    $('#playerAvatar').textContent = (player.nickname || '?').trim().charAt(0).toUpperCase() || '?';
    $('#resSuccess').textContent = player.success;
    $('#resFailed').textContent = player.failed;
    $('#resTotal').textContent = player.total;
    $('#resultStatus').textContent = player.success > 0 ? 'SUCCESS' : 'PARTIAL';
    $('#resultStatus').classList.toggle('ok', player.success > 0);
  }
  $('#jsonOut').textContent = JSON.stringify(raw, null, 2);
}

$('#copyJson')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#jsonOut').textContent);
    toast('Copied to clipboard');
  } catch { toast('Copy failed', 'error'); }
});

/* ============ DASHBOARD RENDER ============ */
function renderDashboard() {
  const h = state.history;
  const success = h.reduce((a, x) => a + (x.success || 0), 0);
  const failed  = h.reduce((a, x) => a + (x.failed  || 0), 0);
  const rate    = (success + failed) ? Math.round((success / (success + failed)) * 100) : 0;

  animateNum($('#stat-total'), state.totalRequests);
  animateNum($('#stat-success'), success);
  animateNum($('#stat-failed'), failed);
  $('#stat-rate').textContent = rate + '%';

  const list = $('#activity-list');
  const recent = h.slice(0, 10);
  if (!recent.length) {
    list.innerHTML = `<div class="empty">No activity yet. Fire your first batch →</div>`;
  } else {
    list.innerHTML = recent.map(x => `
      <div class="activity-item">
        <span class="dot ${x.success > 0 ? 'ok' : 'bad'}"></span>
        <span class="a-uid">${x.uid}</span>
        <span class="a-region">${x.region}</span>
        <span class="a-time">${timeAgo(x.time)}</span>
      </div>`).join('');
  }

  const rb = $('#region-bars');
  const entries = Object.entries(state.regionStats);
  if (!entries.length) {
    rb.innerHTML = `<div class="empty">No data yet.</div>`;
  } else {
    const max = Math.max(...entries.map(([, v]) => v.success + v.failed), 1);
    rb.innerHTML = entries.sort((a, b) => (b[1].success + b[1].failed) - (a[1].success + a[1].failed))
      .map(([r, v]) => {
        const total = v.success + v.failed;
        const pct = Math.round((total / max) * 100);
        return `<div class="region-row">
          <span class="name">${r}</span>
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <span class="count">${total}</span>
        </div>`;
      }).join('');
  }
}

function animateNum(el, target) {
  const start = parseInt(el.textContent.replace(/[^\d]/g, ''), 10) || 0;
  const dur = 600, t0 = performance.now();
  function step(t) {
    const p = Math.min((t - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * ease).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

/* ============ HISTORY ============ */
function renderHistory() {
  const b = $('#historyBody');
  if (!state.history.length) {
    b.innerHTML = `<tr><td colspan="7" class="empty">No history yet.</td></tr>`;
    return;
  }
  b.innerHTML = state.history.map(x => `
    <tr>
      <td>${new Date(x.time).toLocaleString('en-GB')}</td>
      <td>${x.uid}</td>
      <td>${x.region}</td>
      <td>${escapeHtml(x.nickname || '—')}</td>
      <td class="num" style="color:var(--primary)">${x.success}</td>
      <td class="num" style="color:var(--red)">${x.failed}</td>
      <td class="num">${x.duration ?? 0}s</td>
    </tr>`).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
$('#clearHistory')?.addEventListener('click', () => {
  if (!confirm('Clear all history and stats?')) return;
  state.history = []; state.totalRequests = 0; state.regionStats = {};
  LS.del('ff_history'); LS.del('ff_total_requests'); LS.del('ff_region_stats');
  renderHistory(); renderDashboard(); updateBadges();
  toast('History cleared');
});
$('#exportHistory')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ff-history-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Exported');
});

function updateBadges() {
  $('#history-badge').textContent = state.history.length;
}

/* ============ DOCS TRY-IT ============ */
$('#tryBtn')?.addEventListener('click', async () => {
  const uid = $('#tryUid').value.trim();
  const region = $('#tryRegion').value;
  if (!uid) return toast('Enter UID', 'warn');
  $('#tryOut').textContent = '⏳ Requesting...';
  try {
    const res = await fetch(`/visit?uid=${encodeURIComponent(uid)}&region=${encodeURIComponent(region)}`);
    const data = await res.json();
    $('#tryOut').textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    $('#tryOut').textContent = 'Error: ' + e.message;
  }
});

/* ============ SETTINGS ============ */
const THEME_KEY = 'ff_theme';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  LS.set(THEME_KEY, t);
}
applyTheme(LS.get(THEME_KEY, 'dark'));
$('#themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  toast('Theme: ' + next);
});

$('#matrixToggle').checked = LS.get('ff_matrix', true);
document.documentElement.classList.toggle('no-matrix', !$('#matrixToggle').checked);
$('#matrixToggle').addEventListener('change', e => {
  LS.set('ff_matrix', e.target.checked);
  document.documentElement.classList.toggle('no-matrix', !e.target.checked);
});

$('#scanToggle').checked = LS.get('ff_scan', true);
document.documentElement.classList.toggle('no-scan', !$('#scanToggle').checked);
$('#scanToggle').addEventListener('change', e => {
  LS.set('ff_scan', e.target.checked);
  document.documentElement.classList.toggle('no-scan', !e.target.checked);
});

$('#wipeBtn').addEventListener('click', () => {
  if (!confirm('Wipe all local data (history, settings)?')) return;
  Object.keys(localStorage).filter(k => k.startsWith('ff_')).forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* ============ MATRIX RAIN ============ */
(function matrix() {
  const c = $('#matrix-canvas');
  const ctx = c.getContext('2d');
  const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF</>{}[]();=+*&%$#@!';
  let cols, drops, fs = 14;

  function resize() {
    c.width = innerWidth;
    c.height = innerHeight;
    cols = Math.floor(c.width / fs);
    drops = Array(cols).fill(1);
  }
  resize();
  addEventListener('resize', resize);

  setInterval(() => {
    if (document.documentElement.classList.contains('no-matrix')) {
      ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    ctx.fillStyle = 'rgba(4,7,12,0.08)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#00ff9d';
    ctx.font = fs + 'px JetBrains Mono, monospace';
    for (let i = 0; i < drops.length; i++) {
      const txt = chars.charAt(Math.floor(Math.random() * chars.length));
      ctx.fillText(txt, i * fs, drops[i] * fs);
      if (drops[i] * fs > c.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }, 60);
})();

/* ============ INIT ============ */
updateBadges();
renderDashboard();
log('Panel initialised. Awaiting commands.', 'ok');