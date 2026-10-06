// SEO Master - screens. Data lives in Supabase; access is limited by RLS to team members.
const SUPABASE_URL = 'https://tryaxdeokzqplwhzefaf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CdTlVykilFJlPtTdOrPzqQ_gUarOjlu'; // publishable key, safe in the browser
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const state = { clients: [], market: [], current: null, keywords: [], filter: 'starred', view: 'market' };
const FLAT = 0.1; // position change smaller than this counts as "no change"

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d }));
const dir = (delta) => (delta === null || delta === undefined ? 'flat' : delta >= FLAT ? 'up' : delta <= -FLAT ? 'down' : 'flat');
// delta = previous position - current position; positive means the keyword climbed
const chip = (delta) => {
  const d = dir(delta);
  const txt = delta === null || delta === undefined ? '—' : (d === 'up' ? '▲ ' : d === 'down' ? '▼ ' : '') + fmt(Math.abs(delta), 2);
  return `<span class="chip ${d}">${txt}</span>`;
};
const pct = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);
const ddmm = (s) => (s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------- ערכת צבעים ----------
const savedTheme = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
document.documentElement.dataset.theme = savedTheme || 'dark';
$('theme-btn').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
};

// ---------- התחברות ----------
$('google-btn').onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) $('login-msg').textContent = 'הכניסה עם Google נכשלה: ' + error.message;
};
$('logout').onclick = () => sb.auth.signOut();
sb.auth.onAuthStateChange((_ev, session) => render(session));

let loadedFor = null;
async function render(session) {
  if (!session) { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); loadedFor = null; return; }
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('user-email').textContent = session.user.email;
  if (loadedFor === session.user.id) return;
  loadedFor = session.user.id;
  await loadAll();
}

async function loadAll() {
  const [{ data: clients, error }, { data: market }] = await Promise.all([
    sb.from('clients').select('*').order('name'),
    sb.from('keyword_market').select('*').eq('starred', true),
  ]);
  if (error) { toast('שגיאה בטעינה'); return; }
  if (!clients.length) {
    $('view-market').innerHTML = '<div class="empty">המשתמש מחובר, אבל עדיין לא נוסף לרשימת הצוות. בקש מאיתי להוסיף אותך.</div>';
    return;
  }
  state.clients = clients;
  state.market = market || [];
  drawMarket();
  drawClients();
}

// ---------- ניווט ----------
document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
function showView(v) {
  state.view = v;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.view === v));
  $('view-market').classList.toggle('hidden', v !== 'market');
  $('view-keywords').classList.toggle('hidden', v !== 'keywords');
}

// ---------- מסך שוק ----------
function drawMarket() {
  const m = state.market;
  const withData = m.filter((r) => r.delta !== null);
  const up = withData.filter((r) => dir(r.delta) === 'up');
  const down = withData.filter((r) => dir(r.delta) === 'down');
  const anyPeriod = m.find((r) => r.period_end);
  if (anyPeriod) {
    const end = anyPeriod.period_end;
    $('period').textContent = `Search Console · 28 הימים עד ${ddmm(end)} מול 28 הימים שלפני`;
  }

  // כרטיסים
  const posCur = avg(withData.map((r) => Number(r.position)));
  const posPrev = avg(withData.map((r) => Number(r.prev_position)));
  const clicks = m.reduce((a, r) => a + (r.clicks || 0), 0);
  const prevClicks = m.reduce((a, r) => a + (r.prev_clicks || 0), 0);
  const impr = m.reduce((a, r) => a + (r.impressions || 0), 0);
  const prevImpr = m.reduce((a, r) => a + (r.prev_impressions || 0), 0);
  const pc = pct(clicks, prevClicks), pi = pct(impr, prevImpr);
  const posDelta = posCur !== null && posPrev !== null ? posPrev - posCur : null;
  const pctTxt = (p) => (p === null ? '' : `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${fmt(Math.abs(p), 1)}%</span>`);
  $('kpis').innerHTML = `
    <div class="kpi"><div class="lbl">ביטויים שעלו</div><div class="val up">${up.length}</div><div class="sub muted">מתוך ${withData.length} עם נתונים</div></div>
    <div class="kpi"><div class="lbl">ביטויים שירדו</div><div class="val down">${down.length}</div><div class="sub muted">${withData.length - up.length - down.length} ללא שינוי</div></div>
    <div class="kpi"><div class="lbl">מיקום ממוצע</div><div class="val">${fmt(posCur, 2)}</div><div class="sub">${chip(posDelta)}</div></div>
    <div class="kpi"><div class="lbl">קליקים (28 יום)</div><div class="val">${fmt(clicks)}</div><div class="sub">${pctTxt(pc)}</div></div>
    <div class="kpi"><div class="lbl">חשיפות (28 יום)</div><div class="val">${fmt(impr)}</div><div class="sub">${pctTxt(pi)}</div></div>`;

  // עולים ויורדים
  const row = (r) => `<tr class="click" data-client="${r.client_id}"><td><div class="kw">${esc(r.keyword)}</div><div class="cl">${esc(r.client_name)}</div></td>
      <td class="num mono">${fmt(r.prev_position, 2)} ← ${fmt(r.position, 2)}</td><td class="num">${chip(r.delta)}</td></tr>`;
  $('gainers').innerHTML = [...up].sort((a, b) => b.delta - a.delta).slice(0, 10).map(row).join('') || '<tr><td class="muted">אין נתונים עדיין</td></tr>';
  $('losers').innerHTML = [...down].sort((a, b) => a.delta - b.delta).slice(0, 10).map(row).join('') || '<tr><td class="muted">אין נתונים עדיין</td></tr>';

  // מדד לקוחות
  const by = new Map();
  m.forEach((r) => { if (!by.has(r.client_id)) by.set(r.client_id, []); by.get(r.client_id).push(r); });
  const rows = state.clients.map((c) => {
    const ks = by.get(c.id) || [];
    const wd = ks.filter((r) => r.delta !== null);
    const cur = avg(wd.map((r) => Number(r.position))), prev = avg(wd.map((r) => Number(r.prev_position)));
    const u = wd.filter((r) => dir(r.delta) === 'up').length, d = wd.filter((r) => dir(r.delta) === 'down').length;
    const cl = ks.reduce((a, r) => a + (r.clicks || 0), 0), pcl = ks.reduce((a, r) => a + (r.prev_clicks || 0), 0);
    return { c, n: ks.length, cur, delta: cur !== null && prev !== null ? prev - cur : null, u, d, f: wd.length - u - d, cl, pcl };
  }).sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999));
  $('board').innerHTML = `<thead><tr><th>לקוח</th><th class="num">ביטויים ★</th><th class="num">מיקום ממוצע</th><th class="num">שינוי</th>
      <th>עלו / ירדו</th><th class="num">קליקים</th><th class="num">שינוי קליקים</th></tr></thead><tbody>` +
    rows.map((x) => {
      const tot = x.u + x.d + x.f || 1;
      const p = pct(x.cl, x.pcl);
      return `<tr class="click" data-client="${x.c.id}">
        <td><b>${esc(x.c.name || x.c.domain)}</b> <span class="muted small">${esc(x.c.domain)}</span></td>
        <td class="num">${x.n}</td><td class="num">${fmt(x.cur, 2)}</td><td class="num">${chip(x.delta)}</td>
        <td><div class="bar"><i class="u" style="width:${(x.u / tot) * 100}%"></i><i class="f" style="width:${(x.f / tot) * 100}%"></i><i class="d" style="width:${(x.d / tot) * 100}%"></i></div>
            <span class="small"><span class="up">${x.u}▲</span> · <span class="down">${x.d}▼</span></span></td>
        <td class="num">${fmt(x.cl)}</td><td class="num">${p === null ? '-' : `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${fmt(p, 1)}%</span>`}</td></tr>`;
    }).join('') + '</tbody>';

  // טיקר
  const tk = [...withData].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 120);
  const items = tk.map((r) => {
    const d = dir(r.delta);
    return `<span class="tk"><span class="cl">${esc(r.client_name)}</span><b>${esc(r.keyword)}</b><span class="num">${fmt(r.position, 2)}</span><span class="num ${d}">${d === 'up' ? '▲' : d === 'down' ? '▼' : '•'}${fmt(Math.abs(r.delta), 2)}</span></span>`;
  }).join('');
  $('ticker-track').innerHTML = items || '<span class="tk">ממתין לנתוני Search Console…</span>';
}

document.addEventListener('click', (e) => {
  const tr = e.target.closest('tr.click'); if (!tr) return;
  const c = state.clients.find((x) => x.id === tr.dataset.client);
  if (c) { showView('keywords'); openClient(c); }
});

// ---------- מסך ביטויים ----------
function starCount(id) { return state.market.filter((r) => r.client_id === id).length; }
function drawClients() {
  const q = $('client-search').value.trim().toLowerCase();
  $('client-list').innerHTML = state.clients
    .filter((c) => !q || (c.name || '').toLowerCase().includes(q) || c.domain.includes(q))
    .map((c) => {
      const n = starCount(c.id);
      return `<li data-id="${c.id}" class="${state.current?.id === c.id ? 'active' : ''}">
        <span>${esc(c.name || c.domain)}</span><span class="cnt ${n > 30 ? 'down' : 'muted'}">${n} ★</span></li>`;
    }).join('');
}
$('client-search').oninput = drawClients;
$('client-list').onclick = (e) => {
  const li = e.target.closest('li'); if (!li) return;
  openClient(state.clients.find((c) => c.id === li.dataset.id));
};

async function openClient(c) {
  state.current = c; drawClients();
  $('empty').classList.add('hidden'); $('client-view').classList.remove('hidden');
  $('c-name').textContent = c.name || c.domain;
  $('c-domain').textContent = c.domain; $('c-domain').href = 'https://' + c.domain;
  const badges = [
    ['מסירה: ' + c.delivery_mode, c.delivery_mode === 'לא הוגדר'],
    [c.needs_client_approval ? 'דרוש אישור לקוח' : 'בלי אישור לקוח', false],
    [c.platform, false],
    [c.business_type === 'store' ? 'חנות' : 'שירות', false],
  ];
  if (c.technical_caution) badges.push(['זהירות טכנית', true]);
  if (c.owned_by_codex) badges.push(['אצל Codex כרגע', true]);
  $('c-badges').innerHTML = badges.map(([t, w]) => `<span class="badge ${w ? 'warn' : ''}">${esc(t)}</span>`).join('');

  const [{ data, error }, { data: mk }] = await Promise.all([
    sb.from('keywords').select('*').eq('client_id', c.id),
    sb.from('keyword_market').select('keyword_id,position,delta,clicks,impressions').eq('client_id', c.id),
  ]);
  if (error) { toast('שגיאה בטעינת ביטויים'); return; }
  const mm = new Map((mk || []).map((r) => [r.keyword_id, r]));
  state.keywords = data.map((k) => ({ ...k, m: mm.get(k.id) || {} }))
    .sort((a, b) => (b.starred - a.starred) || ((b.m.impressions ?? b.gsc_impressions_90d ?? -1) - (a.m.impressions ?? a.gsc_impressions_90d ?? -1)));
  drawKeywords();
}

function drawKeywords() {
  const q = $('kw-search').value.trim();
  const rows = state.keywords.filter((k) => {
    if (state.filter === 'starred' && !k.starred) return false;
    if (state.filter === 'suggest' && k.origin !== 'search_console') return false;
    return !q || k.keyword.includes(q);
  });
  const n = state.keywords.filter((k) => k.starred).length;
  $('star-count').textContent = n;
  $('star-count').parentElement.classList.toggle('over', n > 30);
  $('star-hint').textContent = n > 30 ? 'יותר מ-30, כדאי לצמצם' : n < 20 ? 'פחות מ-20' : 'יעד: 20-30 ביטויים';
  $('kw-body').innerHTML = rows.map((k) => {
    const pos = k.m.position ?? k.gsc_position;
    return `<tr>
      <td class="col-star"><button class="star-btn ${k.starred ? 'on' : ''}" data-id="${k.id}" title="סימון כוכב">★</button></td>
      <td><div class="kw">${esc(k.keyword)}</div>${k.reason ? `<div class="reason">${esc(k.reason)}</div>` : ''}</td>
      <td class="num">${pos === null || pos === undefined ? '-' : fmt(pos, 2)}</td>
      <td class="num">${k.m.delta !== undefined ? chip(k.m.delta) : '<span class="muted">-</span>'}</td>
      <td class="num">${fmt(k.m.clicks)}</td>
      <td class="num">${fmt(k.m.impressions ?? k.gsc_impressions_90d)}</td>
      <td class="num">${fmt(k.volume)}</td>
      <td class="small">${esc(k.cluster || '')}</td>
      <td>${k.target_url ? `<a class="url" href="${esc(k.target_url)}" target="_blank" rel="noopener">${esc(safeDecode(k.target_url).replace(/^https?:\/\//, ''))}</a>` : ''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" class="muted">אין ביטויים להצגה</td></tr>`;
}
function safeDecode(u) { try { return decodeURI(u); } catch { return u; } }

document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.seg button').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); state.filter = b.dataset.filter; drawKeywords();
}));
$('kw-search').oninput = drawKeywords;

$('kw-body').onclick = async (e) => {
  const btn = e.target.closest('.star-btn'); if (!btn) return;
  const k = state.keywords.find((x) => String(x.id) === btn.dataset.id);
  const next = !k.starred;
  k.starred = next; drawKeywords();
  const patch = { starred: next };
  if (next && (!k.source || k.source === 'Wincher' || k.source === 'קבוצה ב-Wincher' || k.source === 'הצעה מ-Search Console')) patch.source = 'נוסף ידנית';
  const { error } = await sb.from('keywords').update(patch).eq('id', k.id);
  if (error) { k.starred = !next; drawKeywords(); toast('השמירה נכשלה'); return; }
  if (patch.source) k.source = patch.source;
  // keep the market data in sync with the star change
  const { data: market } = await sb.from('keyword_market').select('*').eq('starred', true);
  state.market = market || state.market;
  drawMarket(); drawClients(); toast(next ? 'נוסף כוכב' : 'הכוכב הוסר');
};
