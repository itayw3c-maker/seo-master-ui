// SEO Master - screens. Data lives in Supabase; access is limited by RLS to team members.
const SUPABASE_URL = 'https://tryaxdeokzqplwhzefaf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CdTlVykilFJlPtTdOrPzqQ_gUarOjlu'; // publishable key, safe in the browser
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const state = { clients: [], starCounts: {}, current: null, keywords: [], filter: 'starred', signup: false };

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d }));

// ---------- התחברות ----------
$('toggle-mode').onclick = () => {
  state.signup = !state.signup;
  $('login-btn').textContent = state.signup ? 'הרשמה' : 'כניסה';
  $('toggle-mode').textContent = state.signup ? 'כבר יש לך משתמש? כניסה' : 'אין לך עדיין משתמש? הרשמה';
  $('login-msg').textContent = '';
};

$('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = $('email').value.trim(), password = $('password').value;
  $('login-msg').textContent = '...';
  if (state.signup) {
    const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
    $('login-msg').textContent = error ? 'שגיאה: ' + error.message
      : 'נשלח אליך מייל אישור. לוחצים על הקישור במייל, חוזרים לכאן ונכנסים עם האימייל והסיסמה.';
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $('login-msg').textContent = error ? 'הכניסה נכשלה: ' + error.message : '';
  }
};

$('logout').onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange((_ev, session) => render(session));
sb.auth.getSession().then(({ data }) => render(data.session));

async function render(session) {
  if (!session) { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); return; }
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('user-email').textContent = session.user.email;
  await loadClients();
}

// ---------- לקוחות ----------
async function loadClients() {
  const { data, error } = await sb.from('clients').select('*').order('name');
  if (error) { toast('שגיאה בטעינה'); return; }
  if (!data.length) {
    $('client-list').innerHTML = '';
    $('empty').textContent = 'המשתמש מחובר, אבל עדיין לא נוסף לרשימת הצוות. בקש מאיתי להוסיף אותך.';
    return;
  }
  state.clients = data;
  const { data: st } = await sb.from('keywords').select('client_id').eq('starred', true);
  state.starCounts = {};
  (st || []).forEach((r) => (state.starCounts[r.client_id] = (state.starCounts[r.client_id] || 0) + 1));
  drawClients();
}

function drawClients() {
  const q = $('client-search').value.trim().toLowerCase();
  $('client-list').innerHTML = state.clients
    .filter((c) => !q || (c.name || '').toLowerCase().includes(q) || c.domain.includes(q))
    .map((c) => {
      const n = state.starCounts[c.id] || 0;
      return `<li data-id="${c.id}" class="${state.current?.id === c.id ? 'active' : ''}">
        <span>${esc(c.name || c.domain)}</span><span class="cnt ${n > 30 ? 'over' : ''}">${n} ★</span></li>`;
    }).join('');
}
$('client-search').oninput = drawClients;
$('client-list').onclick = (e) => {
  const li = e.target.closest('li'); if (!li) return;
  openClient(state.clients.find((c) => c.id === li.dataset.id));
};

// ---------- ביטויים ----------
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

  const { data, error } = await sb.from('keywords').select('*').eq('client_id', c.id)
    .order('starred', { ascending: false }).order('gsc_impressions_90d', { ascending: false, nullsFirst: false })
    .order('volume', { ascending: false, nullsFirst: false });
  if (error) { toast('שגיאה בטעינת ביטויים'); return; }
  state.keywords = data; drawKeywords();
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
  $('kw-body').innerHTML = rows.map((k) => `
    <tr>
      <td class="col-star"><button class="star-btn ${k.starred ? 'on' : ''}" data-id="${k.id}" title="סימון כוכב">★</button></td>
      <td><div class="kw">${esc(k.keyword)}</div>${k.reason ? `<div class="reason">${esc(k.reason)}</div>` : ''}</td>
      <td>${esc(k.cluster || '')}</td>
      <td class="num">${k.gsc_position === null ? '-' : fmt(k.gsc_position, 2)}</td>
      <td class="num">${fmt(k.gsc_impressions_90d)}</td>
      <td class="num">${fmt(k.volume)}</td>
      <td class="small">${esc(k.source || '')}</td>
      <td>${k.target_url ? `<a class="url" href="${esc(k.target_url)}" target="_blank" rel="noopener">${esc(decodeURI(k.target_url).replace(/^https?:\/\//, ''))}</a>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="8" class="muted">אין ביטויים להצגה</td></tr>`;
}

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
  state.starCounts[state.current.id] = state.keywords.filter((x) => x.starred).length;
  drawClients(); toast(next ? 'נוסף כוכב' : 'הכוכב הוסר');
};
