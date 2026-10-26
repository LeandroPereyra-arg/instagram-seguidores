import { igFetch } from './scanner.js';

const IG = 'https://www.instagram.com';
const HISTORY_LIMIT = 5000;

const $ = (sel) => document.querySelector(sel);
const els = {
  account: $('#account'),
  scanBtn: $('#scanBtn'),
  progress: $('#progress'),
  bar: $('#bar'),
  status: $('#status'),
  error: $('#error'),
  notice: $('#notice'),
  welcome: $('#welcome'),
  main: $('#main'),
  summary: $('#summary'),
  tabs: $('#tabs'),
  viewDesc: $('#viewDesc'),
  search: $('#search'),
  exportBtn: $('#exportBtn'),
  list: $('#list'),
  empty: $('#empty'),
};

let data = null;      // { account, history }
let view = 'notBack';
let query = '';
let scanning = false;

class ScanError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(1200 + Math.random() * 1800);
const fmtNum = (n) => Number(n || 0).toLocaleString('es');
const fmtDate = (t) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(t);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Views ---------- */

const toList = (map, ids) => ids.map((id) => ({ id, ...map[id] }));
const byUsername = (a, b) => a.username.localeCompare(b.username);

const VIEWS = {
  notBack: {
    desc: 'Cuentas que tú sigues pero que no te siguen a ti.',
    empty: 'Todas las cuentas que sigues te siguen de vuelta.',
    users: ({ followers, following }) =>
      toList(following, Object.keys(following).filter((id) => !followers[id])).sort(byUsername),
  },
  lost: {
    desc: 'Dejaron de seguirte desde el escaneo anterior.',
    empty: 'Nadie te dejó de seguir desde el escaneo anterior.',
    users: (a) => [...a.lost].sort(byUsername),
  },
  gained: {
    desc: 'Empezaron a seguirte desde el escaneo anterior.',
    empty: 'No hay seguidores nuevos desde el escaneo anterior.',
    users: (a) => [...a.gained].sort(byUsername),
  },
  fans: {
    desc: 'Te siguen pero tú no los sigues.',
    empty: 'Sigues de vuelta a todos tus seguidores.',
    users: ({ followers, following }) =>
      toList(followers, Object.keys(followers).filter((id) => !following[id])).sort(byUsername),
  },
  history: {
    desc: 'Todos los cambios detectados entre escaneos.',
    empty: 'Aún no hay cambios registrados. Aparecerán a partir del segundo escaneo.',
    users: () => data.history,
  },
};

function currentUsers() {
  const users = VIEWS[view].users(data.account);
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) => u.username.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
}

/* ---------- Rendering ---------- */

function render() {
  const has = !!data;
  els.welcome.hidden = has;
  els.main.hidden = !has;
  if (!has) return;

  const { account, history } = data;
  const followerIds = Object.keys(account.followers);
  const followingIds = Object.keys(account.following);
  const mutual = followingIds.filter((id) => account.followers[id]).length;

  els.account.textContent =
    `${account.username ? '@' + account.username + ' · ' : ''}Último escaneo: ${fmtDate(account.scannedAt)}`;

  els.summary.innerHTML = [
    ['Seguidores', followerIds.length],
    ['Seguidos', followingIds.length],
    ['Mutuos', mutual],
    ['Cambios registrados', history.length],
  ].map(([label, n]) => `<div class="stat"><b>${fmtNum(n)}</b><span>${label}</span></div>`).join('');

  for (const btn of els.tabs.querySelectorAll('button')) {
    const v = btn.dataset.view;
    btn.setAttribute('aria-selected', String(v === view));
    btn.querySelector('.count').textContent = fmtNum(VIEWS[v].users(account).length);
  }

  els.notice.hidden = !!account.prevScannedAt;
  if (!account.prevScannedAt) {
    els.notice.textContent =
      'Este es tu primer escaneo. Vuelve a escanear más adelante para ver quién te dejó de seguir y quién empezó a seguirte.';
  }

  els.viewDesc.textContent = VIEWS[view].desc +
    (account.prevScannedAt && (view === 'lost' || view === 'gained')
      ? ` (desde el ${fmtDate(account.prevScannedAt)})` : '');

  const users = currentUsers();
  els.list.innerHTML = users.map((u) => row(u, account)).join('');
  els.empty.hidden = users.length > 0;
  els.empty.textContent = query ? 'No hay resultados para tu búsqueda.' : VIEWS[view].empty;
}

function row(u, account) {
  const url = `${IG}/${encodeURIComponent(u.username)}/`;
  const pic = u.pic ? `<img src="${esc(u.pic)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  let extra = '';
  if (view === 'history') {
    extra = `<span class="date">${fmtDate(u.t)}</span>` +
      (u.type === 'lost'
        ? '<span class="tag lost">Te dejó de seguir</span>'
        : '<span class="tag gained">Empezó a seguirte</span>');
  } else if (view === 'lost' && account.following[u.id]) {
    extra = '<span class="tag">Aún lo sigues</span>';
  }
  return `<li>
    <span class="avatar">${esc(u.username[0] || '?')}${pic}</span>
    <span class="who">
      <a href="${url}" target="_blank" rel="noopener">${esc(u.username)}</a>${u.verified ? '<span class="verified" title="Verificado">✔</span>' : ''}
      ${u.name ? `<span class="name">${esc(u.name)}</span>` : ''}
    </span>
    ${extra}
  </li>`;
}

// Instagram's CDN sometimes refuses to serve images to other origins;
// fall back to the initial letter underneath. (Error events don't bubble.)
els.list.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') e.target.remove();
}, true);

/* ---------- Storage ---------- */

async function load() {
  const { lastUserId } = await chrome.storage.local.get('lastUserId');
  if (!lastUserId) return null;
  const keys = [`account:${lastUserId}`, `history:${lastUserId}`];
  const stored = await chrome.storage.local.get(keys);
  if (!stored[keys[0]]) return null;
  return { account: stored[keys[0]], history: stored[keys[1]] ?? [] };
}

/* ---------- Scanning ---------- */

async function getCookie(name) {
  const c = await chrome.cookies.get({ url: IG, name });
  return c?.value ?? null;
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(() => { cleanup(); reject(new ScanError('Instagram tardó demasiado en cargar. Inténtalo de nuevo.')); }, 30000);
    const cleanup = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') done(); }, () => {});
  });
}

// Requests must run inside an instagram.com tab. Reuse one if open, otherwise
// open one in the background and close it when the scan ends.
async function getInstagramTab() {
  const tabs = await chrome.tabs.query({ url: `${IG}/*` });
  const tab = tabs.find((t) => t.status === 'complete') ?? tabs[0];
  if (tab) {
    await waitForLoad(tab.id);
    return { tabId: tab.id, created: false };
  }
  const created = await chrome.tabs.create({ url: `${IG}/`, active: false });
  await waitForLoad(created.id);
  return { tabId: created.id, created: true };
}

async function inject(ctx, path) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: ctx.tabId },
      func: igFetch,
      args: [IG + path, ctx.csrf],
    });
    return res?.result ?? { status: 0, json: null };
  } catch {
    throw new ScanError('Se perdió la conexión con la pestaña de Instagram. No la cierres ni cambies de página durante el escaneo.');
  }
}

async function request(ctx, path) {
  for (let attempt = 1; ; attempt++) {
    const { status, json } = await inject(ctx, path);
    if (status === 200 && json && json.status !== 'fail') return json;

    const msg = json?.message ?? '';
    if (status === 401 || msg === 'login_required') {
      throw new ScanError('Instagram cerró tu sesión. Vuelve a iniciar sesión en instagram.com e inténtalo de nuevo.');
    }
    if (msg === 'checkpoint_required' || msg === 'challenge_required') {
      throw new ScanError('Instagram pide verificar tu cuenta. Abre instagram.com, completa la verificación y vuelve a intentarlo más tarde.');
    }
    if (attempt > 3) {
      throw new ScanError('Instagram está limitando las peticiones. Espera unas horas antes de volver a escanear.');
    }
    // Rate limit (429 / "Please wait a few minutes") or transient error: back off.
    for (let s = 60 * attempt; s > 0; s--) {
      setStatus(`Instagram pidió una pausa. Reintentando en ${s} s… (intento ${attempt}/3)`);
      await sleep(1000);
    }
  }
}

async function getProfileInfo(ctx) {
  const { status, json } = await inject(ctx, `/api/v1/users/${ctx.userId}/info/`);
  const user = status === 200 ? json?.user : null;
  return user
    ? { username: user.username, followerCount: user.follower_count, followingCount: user.following_count }
    : {};
}

async function fetchList(ctx, kind, progress) {
  const users = {};
  const seen = new Set();
  let maxId = '';
  for (;;) {
    const qs = new URLSearchParams({ count: '50' });
    if (maxId) qs.set('max_id', maxId);
    if (kind === 'followers') qs.set('search_surface', 'follow_list_page');

    const page = await request(ctx, `/api/v1/friendships/${ctx.userId}/${kind}/?${qs}`);
    for (const u of page.users ?? []) {
      users[String(u.pk ?? u.pk_id ?? u.id)] = {
        username: u.username,
        name: u.full_name || '',
        pic: u.profile_pic_url || '',
        verified: !!u.is_verified,
      };
    }
    progress(Object.keys(users).length);

    const next = page.next_max_id ? String(page.next_max_id) : '';
    if (!next || seen.has(next)) break;
    seen.add(next);
    maxId = next;
    await pause();
  }
  return users;
}

function setStatus(text) { els.status.textContent = text; }

function setProgress(done, total) {
  const bar = els.bar.parentElement;
  bar.classList.toggle('indeterminate', !total);
  els.bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : '';
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.hidden = !msg;
}

async function scan() {
  if (scanning) return;
  scanning = true;
  els.scanBtn.disabled = true;
  els.scanBtn.textContent = 'Escaneando…';
  els.progress.hidden = false;
  showError('');
  setProgress(0, 0);
  setStatus('Conectando con Instagram…');

  let tab = null;
  try {
    const userId = await getCookie('ds_user_id');
    if (!userId) {
      throw new ScanError('No hay ninguna sesión de Instagram abierta en este navegador. Entra en instagram.com, inicia sesión y vuelve a intentarlo.');
    }
    tab = await getInstagramTab();
    const ctx = { tabId: tab.tabId, userId, csrf: (await getCookie('csrftoken')) ?? '' };

    const info = await getProfileInfo(ctx);
    const total = (info.followerCount ?? 0) + (info.followingCount ?? 0);

    const followers = await fetchList(ctx, 'followers', (n) => {
      setStatus(`Leyendo seguidores… ${fmtNum(n)}${info.followerCount ? ' de ' + fmtNum(info.followerCount) : ''}`);
      setProgress(n, total);
    });
    const followerCount = Object.keys(followers).length;
    await pause();
    const following = await fetchList(ctx, 'following', (n) => {
      setStatus(`Leyendo seguidos… ${fmtNum(n)}${info.followingCount ? ' de ' + fmtNum(info.followingCount) : ''}`);
      setProgress(followerCount + n, total);
    });

    const keyA = `account:${userId}`;
    const keyH = `history:${userId}`;
    const stored = await chrome.storage.local.get([keyA, keyH]);
    const prev = stored[keyA];
    const history = stored[keyH] ?? [];

    // Guard against a truncated list being misread as a wave of unfollows.
    if (info.followerCount > 50 && followerCount < info.followerCount * 0.8) {
      throw new ScanError(`Instagram devolvió solo ${fmtNum(followerCount)} de ${fmtNum(info.followerCount)} seguidores. No se guardó el escaneo para no registrar cambios falsos; inténtalo más tarde.`);
    }

    const now = Date.now();
    let lost = [];
    let gained = [];
    if (prev) {
      lost = toList(prev.followers, Object.keys(prev.followers).filter((id) => !followers[id]));
      gained = toList(followers, Object.keys(followers).filter((id) => !prev.followers[id]));
      const events = [
        ...lost.map((u) => ({ ...u, type: 'lost' })),
        ...gained.map((u) => ({ ...u, type: 'gained' })),
      ].map(({ pic, ...u }) => ({ ...u, t: now })); // profile pic URLs expire; don't keep them
      history.unshift(...events);
      history.length = Math.min(history.length, HISTORY_LIMIT);
    }

    const account = {
      userId,
      username: info.username ?? prev?.username ?? '',
      scannedAt: now,
      prevScannedAt: prev?.scannedAt ?? null,
      followers,
      following,
      lost,
      gained,
    };
    await chrome.storage.local.set({ [keyA]: account, [keyH]: history, lastUserId: userId });

    data = { account, history };
    if (prev) view = lost.length ? 'lost' : gained.length ? 'gained' : view;
    render();
    els.progress.hidden = true;
  } catch (e) {
    console.error(e);
    els.progress.hidden = true;
    showError(e instanceof ScanError ? e.message : `Error inesperado: ${e.message}`);
  } finally {
    if (tab?.created) chrome.tabs.remove(tab.tabId).catch(() => {});
    scanning = false;
    els.scanBtn.disabled = false;
    els.scanBtn.textContent = 'Escanear ahora';
  }
}

/* ---------- CSV export ---------- */

function exportCsv() {
  const users = currentUsers();
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = view === 'history' ? ['fecha', 'cambio', 'usuario', 'nombre', 'perfil'] : ['usuario', 'nombre', 'perfil'];
  const lines = users.map((u) => {
    const base = [u.username, u.name, `${IG}/${u.username}/`];
    return view === 'history'
      ? [new Date(u.t).toISOString(), u.type === 'lost' ? 'te dejó de seguir' : 'empezó a seguirte', ...base]
      : base;
  });
  const csv = '﻿' + [header, ...lines].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `instagram-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Wiring ---------- */

els.scanBtn.addEventListener('click', scan);
els.exportBtn.addEventListener('click', exportCsv);
els.search.addEventListener('input', () => { query = els.search.value; render(); });
els.tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  view = btn.dataset.view;
  render();
});
window.addEventListener('beforeunload', (e) => { if (scanning) e.preventDefault(); });

data = await load();
render();
