'use strict';

// ---------- data ----------

const ROLE = {
  werewolf: {
    name: 'มนุษย์หมาป่า',
    team: 'ฝ่ายหมาป่า',
    desc: 'ทุกคืนตื่นมาพร้อมเพื่อนหมาป่าเพื่อเลือกเหยื่อ 1 คน กลางวันแกล้งเป็นชาวบ้าน ชนะเมื่อหมาป่ามีจำนวนเท่ากับหรือมากกว่าฝ่ายหมู่บ้าน',
  },
  seer: {
    name: 'ผู้หยั่งรู้',
    team: 'ฝ่ายหมู่บ้าน',
    desc: 'ทุกคืนเลือกส่องผู้เล่น 1 คน เพื่อรู้ว่าเป็นมนุษย์หมาป่าหรือไม่',
  },
  bodyguard: {
    name: 'บอดี้การ์ด',
    team: 'ฝ่ายหมู่บ้าน',
    desc: 'ทุกคืนเลือกปกป้อง 1 คนจากเขี้ยวหมาป่า ปกป้องตัวเองได้ แต่ห้ามเลือกคนเดิมสองคืนติดกัน',
  },
  witch: {
    name: 'แม่มด',
    team: 'ฝ่ายหมู่บ้าน',
    desc: 'รู้ว่าหมาป่ากัดใครในคืนนั้น มียาชุบชีวิต 1 ขวดและยาพิษ 1 ขวด ใช้ได้อย่างละครั้งต่อเกม',
  },
  hunter: {
    name: 'นายพราน',
    team: 'ฝ่ายหมู่บ้าน',
    desc: 'เมื่อตายไม่ว่าด้วยเหตุใด ยิงพาผู้เล่นอีก 1 คนไปด้วยได้ทันที',
  },
  villager: {
    name: 'ชาวบ้าน',
    team: 'ฝ่ายหมู่บ้าน',
    desc: 'ไม่มีพลังพิเศษ ใช้การสังเกต การถกเถียง และการโหวตเพื่อกำจัดหมาป่า',
  },
};
const ROLE_ORDER = ['werewolf', 'seer', 'bodyguard', 'witch', 'hunter', 'villager'];

const GLYPH = {
  werewolf: '<path d="M4 3l4.5 5h7L20 3v8.5c0 4.8-3.6 8.6-8 9.5-4.4-.9-8-4.7-8-9.5z"/><path d="M9 12.5l1.2.8M15 12.5l-1.2.8M10.5 17l1.5 1 1.5-1"/>',
  seer: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M12 2v1.5M5 4.5l1 1M19 4.5l-1 1"/>',
  bodyguard: '<path d="M12 2.5l8 3v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  witch: '<path d="M9.5 2.5h5M10.5 2.5V8L5.3 17.6A2.8 2.8 0 0 0 7.8 21.5h8.4a2.8 2.8 0 0 0 2.5-3.9L13.5 8V2.5"/><path d="M7.2 14.5h9.6"/><circle cx="11" cy="17.8" r=".6"/><circle cx="14" cy="16.8" r=".6"/>',
  hunter: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>',
  villager: '<path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
};

// ---------- small utils ----------

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $peek = document.getElementById('peek');

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Thai leading vowels (เ แ โ ใ ไ) come before their consonant; show the consonant.
function initial(name) {
  name = name.replace(/^[\u0E40-\u0E44]/, '') || name;
  try {
    const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
    return seg.segment(name).containing(0)?.segment || '?';
  } catch {
    return Array.from(name)[0] || '?';
  }
}

function glyph(role, cls = 'glyph') {
  return `<span class="${cls}" data-role="${role}"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[role]}</svg></span>`;
}

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), 3200);
}

// ---------- state ----------

// Each tab plays as its own player (sessionStorage); localStorage keeps the
// last seat so a phone that closed the tab can rejoin from the home page.
const tabSession = {
  get() { try { return JSON.parse(sessionStorage.getItem('ww.session')); } catch { return null; } },
  set(v) { try { sessionStorage.setItem('ww.session', JSON.stringify(v)); } catch {} },
  del() { try { sessionStorage.removeItem('ww.session'); } catch {} },
};

const S = {
  session: tabSession.get(), // { code, token }
  view: null,
  es: null,
  offset: 0,
  stageKey: '',
  sel: null,
  witchSave: false,
  flipped: false,
  narrator: !!store.get('ww.narrator'),
};

// Panels fade in once per stage, not on every live update.
const fx = () => (S.fresh ? 'fade-in' : '');

const nameOf = (v, id) => v.players.find((p) => p.id === id)?.name || '—';
const playerOf = (v, id) => v.players.find((p) => p.id === id);

async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'), { status: r.status });
  return j;
}

async function act(type, extra = {}) {
  if (!S.session) return;
  try {
    await api('/api/action', { ...S.session, type, ...extra });
  } catch (e) {
    toast(e.message);
  }
}

// ---------- connection ----------

function connect() {
  if (!S.session) return render();
  S.es?.close();
  const { code, token } = S.session;
  const es = new EventSource(`/api/stream?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
  S.es = es;
  es.onmessage = (e) => onView(JSON.parse(e.data));
  es.addEventListener('kicked', () => {
    toast('หัวห้องเชิญคุณออกจากห้องแล้ว');
    leaveLocal();
  });
  es.onerror = async () => {
    if (es.readyState !== EventSource.CLOSED || S.es !== es) return; // browser is retrying by itself
    const alive = await api('/api/join', S.session).then(() => true, (e) => (e.status ? false : null));
    if (alive === false) {
      toast('ห้องนี้ปิดไปแล้ว');
      leaveLocal();
    } else {
      setTimeout(connect, 2000);
    }
  };
}

function leaveLocal() {
  S.es?.close();
  S.es = null;
  S.session = null;
  S.view = null;
  store.del('ww.session');
  tabSession.del();
  history.replaceState(null, '', location.pathname);
  document.body.dataset.time = 'night';
  render();
}

function stageOf(v) {
  return `${v.room.phase}:${v.room.day}:${v.night?.step || ''}`;
}

function onView(v) {
  S.offset = v.serverNow - Date.now();
  const key = stageOf(v);
  if (key !== S.stageKey) {
    const first = !S.stageKey;
    S.stageKey = key;
    S.sel = v.night?.action?.chosen ?? v.vote?.mine ?? null;
    S.witchSave = false;
    S.flipped = false;
    S.fresh = true;
    if (!first) {
      onStageChange(v);
      window.scrollTo({ top: 0 });
    }
  }
  S.view = v;
  render();
  S.fresh = false;
}

// ---------- narrator ----------

function speak(text) {
  if (!S.narrator || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'th-TH';
  u.rate = 0.92;
  const th = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('th'));
  if (th) u.voice = th;
  speechSynthesis.speak(u);
}

function onStageChange(v) {
  const { phase, day, announcement } = v.room;
  if (phase === 'night' && v.night?.step === 'main') {
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(200);
    speak(`ค่ำคืนที่ ${day} มาถึงแล้ว ทุกคนหลับตา ผู้ที่มีพลังพิเศษ ตื่นขึ้นมาทำหน้าที่ของตัวเองบนมือถือ`);
  } else if (phase === 'night' && v.night?.step === 'witch') {
    speak('แม่มด ตื่นขึ้นมา คืนนี้จะใช้ยาหรือไม่');
  } else if (phase === 'day') {
    const deaths = announcement?.deaths || [];
    speak(
      `รุ่งเช้าแล้ว ทุกคนลืมตา ` +
        (deaths.length ? `เมื่อคืน ${deaths.map((id) => nameOf(v, id)).join(' และ ')} ถูกพบเป็นศพ` : 'เมื่อคืนสงบสุข ไม่มีใครตาย') +
        ' เริ่มถกเถียงกันได้',
    );
  } else if (phase === 'vote') {
    speak('หมดเวลาถกเถียง ได้เวลาลงมติ โหวตคนที่คิดว่าเป็นหมาป่า');
  } else if (phase === 'verdict') {
    const out = v.verdict?.eliminated;
    speak(out ? `หมู่บ้านลงมติประหาร ${nameOf(v, out)}` : 'วันนี้ไม่มีใครถูกประหาร');
  } else if (phase === 'hunter') {
    speak(`นายพราน ${nameOf(v, v.hunter.id)} ล้มลง แต่ยังมีแรงยิงอีกหนึ่งนัด`);
  } else if (phase === 'end') {
    speak(v.room.winner === 'wolf' ? 'เกมจบแล้ว ฝ่ายหมาป่าชนะ' : 'เกมจบแล้ว ฝ่ายหมู่บ้านชนะ');
  }
}

// ---------- render: shared pieces ----------

function timeOf(v) {
  const { phase, winner } = v.room;
  if (['day', 'vote', 'verdict', 'hunter'].includes(phase)) return 'day';
  if (phase === 'end') return winner === 'village' ? 'day' : 'night';
  return 'night';
}

function rulesSection() {
  return `
  <section class="panel">
    <details class="rules">
      <summary>กติกาและบทบาท</summary>
      <ol>
        <li>ทุกคนได้ไพ่บทบาทลับ มนุษย์หมาป่ารู้ว่าใครเป็นพวกเดียวกัน</li>
        <li><b>กลางคืน</b> ทุกคนแตะเลือกบนมือถือพร้อมกัน หมาป่าเลือกเหยื่อ ผู้หยั่งรู้ส่อง บอดี้การ์ดปกป้อง คนที่ไม่มีพลังก็แตะเลือกคนที่สงสัยไว้พรางตัว (ไม่มีผลต่อเกม) จากนั้นแม่มดตัดสินใจใช้ยา</li>
        <li><b>รุ่งเช้า</b> ประกาศผู้ตาย แล้วทุกคนถกเถียงกันตามเวลาที่ตั้งไว้</li>
        <li><b>ลงมติ</b> คนที่ได้เสียงมากที่สุดถูกประหาร ถ้าเสียงเสมอหรืองดออกเสียงมากที่สุด วันนั้นไม่มีใครตาย</li>
        <li>คนที่ตายแล้วห้ามพูดและห้ามบอกใบ้ แต่ดูบทบาททุกคนได้</li>
        <li><b>ฝ่ายหมู่บ้านชนะ</b> เมื่อหมาป่าตายหมด <b>ฝ่ายหมาป่าชนะ</b> เมื่อมีจำนวนเท่ากับหรือมากกว่าฝ่ายหมู่บ้าน</li>
      </ol>
      <div class="role-list">
        ${ROLE_ORDER.map((r) => `<div class="role-line">${glyph(r)}<div><b>${ROLE[r].name}</b> <span class="muted small">${ROLE[r].team}</span><p class="small">${ROLE[r].desc}</p></div></div>`).join('')}
      </div>
    </details>
  </section>`;
}

function roleCard(role, flipped, tag = 'button') {
  const r = ROLE[role];
  const attrs = tag === 'button' ? `data-do="flip" aria-label="${flipped ? 'คว่ำไพ่' : 'เปิดไพ่บทบาท'}"` : '';
  return `
  <div class="card-wrap">
    <${tag} class="role-card ${flipped ? 'flipped' : ''}" ${attrs}>
      <div class="side back"><span>แตะเพื่อเปิดไพ่</span></div>
      <div class="side front" data-role="${role}">
        <div class="big-glyph"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[role]}</svg></div>
        <span class="team-tag">${r.team}</span>
        <h2>${r.name}</h2>
        <p>${r.desc}</p>
      </div>
    </${tag}>
  </div>`;
}

function setupChips(v) {
  const r = v.room.rolesInGame;
  if (!r) return '';
  return `<div class="row small">${ROLE_ORDER.filter((k) => r[k])
    .map((k) => `<span class="row" style="gap:6px">${glyph(k)}<span>${ROLE[k].name} ×${r[k]}</span></span>`)
    .join('')}</div>`;
}

// One token per player. `o` decides what the token shows in the current phase.
function token(p, v, o = {}) {
  const inGame = v.room.phase !== 'lobby';
  const isMe = p.id === v.me.id;
  const mate = v.me.role === 'werewolf' && p.role === 'werewolf' && !isMe;
  const selectable = o.selectable?.has(p.id);
  const el = selectable ? 'button' : 'div';
  const cls = ['token', !p.alive && 'dead', mate && 'mate', isMe && 'me'].filter(Boolean).join(' ');

  let tag = '';
  const hideOwn = isMe && p.alive && v.room.phase !== 'end';
  if (inGame && p.role && !hideOwn) tag = `<span class="tag role">${ROLE[p.role].name}</span>`;
  if (!p.alive) tag = `<span class="tag">${p.role ? ROLE[p.role].name + ' · ' : ''}เสียชีวิต</span>`;
  else if (p.ready) tag += `<span class="tag">พร้อมแล้ว</span>`;
  else if (p.voted) tag += `<span class="tag">โหวตแล้ว</span>`;
  if (!p.connected) tag += `<span class="tag">หลุดการเชื่อมต่อ</span>`;
  if (p.isHost && !inGame) tag += `<span class="tag host">หัวห้อง</span>`;
  if (p.bot) tag += `<span class="tag">บอท</span>`;

  const badge = o.badges?.[p.id] ? `<span class="badge ${o.badges[p.id].ok ? 'ok' : ''}">${esc(o.badges[p.id].text)}</span>` : '';
  const kick = o.kick && !isMe ? `<button class="kick" data-do="kick" data-id="${p.id}" aria-label="เชิญ ${esc(p.name)} ออกจากห้อง" title="เชิญออกจากห้อง">✕</button>` : '';
  const pressed = selectable ? `aria-pressed="${S.sel === p.id}" data-do="pick" data-id="${p.id}"` : '';

  return `
  <${el} class="${cls}" ${p.role && !hideOwn ? `data-role="${p.role}"` : ''} ${pressed}>
    ${!p.connected && !p.isHost ? '<span class="off" title="หลุดการเชื่อมต่อ"></span>' : ''}
    ${badge}
    <span class="face">${esc(initial(p.name))}</span>
    <span class="name">${esc(p.name)}${isMe ? ' (คุณ)' : ''}</span>
    ${tag}
    ${kick}
  </${el}>`;
}

function board(v, o = {}) {
  return `<div class="board">${v.players.map((p) => token(p, v, o)).join('')}</div>`;
}

// Seer keeps her readings on the board for the rest of the game.
function seerBadges(v) {
  const b = {};
  for (const r of v.me.seerResults || []) b[r.id] = r.isWolf ? { text: 'หมาป่า' } : { text: 'ไม่ใช่หมาป่า', ok: true };
  return b;
}

function topbar(v) {
  const { phase, day, phaseEndsAt, code } = v.room;
  const titles = {
    reveal: ['รับบทบาท', 'ดูไพ่ของคุณ อย่าให้ใครเห็น'],
    night: [`คืนที่ ${day}`, 'หมู่บ้านหลับใหล'],
    hunter: ['นายพรานเล็งปืน', `วันที่ ${day}`],
    day: [`วันที่ ${day}`, 'ถกเถียงหาตัวหมาป่า'],
    vote: [`ลงมติ วันที่ ${day}`, 'เลือกคนที่จะประหาร'],
    verdict: ['ผลการลงมติ', `วันที่ ${day}`],
    end: ['จบเกม', `เล่นไป ${day} วัน`],
  };
  const [title, sub] = titles[phase] || ['', ''];
  const showTimer = phaseEndsAt && phase !== 'night';
  return `
  <header class="topbar">
    <div>
      <div class="phase-title display">${title}</div>
      <div class="phase-sub">${sub} · ห้อง ${esc(code)}</div>
    </div>
    <div class="timer" ${showTimer ? `data-ends="${phaseEndsAt}"` : ''}></div>
    <div class="tools" style="grid-column: 1 / -1">
      ${v.me.role ? '<button class="chip-btn" data-peek>กดค้างดูบทบาท</button>' : ''}
      <button class="chip-btn" data-do="narrator" aria-pressed="${S.narrator}">เสียงผู้ดำเนินเกม</button>
    </div>
  </header>`;
}

function hostAdvance(v, label) {
  return v.me.isHost ? `<button class="btn ghost block" data-do="advance">${label}</button>` : '';
}

function logPanel(v) {
  const items = v.room.log;
  if (!items.length) return '';
  return `
  <section class="panel">
    <span class="eyebrow">บันทึกหมู่บ้าน</span>
    <div class="log"><ul>
      ${items
        .map((l) => `<li><span class="when">${l.kind === 'system' ? '—' : l.phase === 'night' ? `คืน ${l.day}` : `วัน ${l.day}`}</span><span class="${l.kind === 'death' ? 'death' : ''}">${esc(l.text)}</span></li>`)
        .join('')}
    </ul></div>
  </section>`;
}

// ---------- render: screens ----------

function render() {
  if (!S.session) return renderHome();
  const v = S.view;
  if (!v) {
    $app.innerHTML = `<section class="panel sleep"><div class="moon-icon"></div><p>กำลังเข้าห้อง…</p></section>`;
    return;
  }
  document.body.dataset.time = timeOf(v);
  if (v.room.phase === 'lobby') renderLobby(v);
  else renderGame(v);
  tick();
  if (!document.body.classList.contains('ready')) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
}

function renderHome(err) {
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') || '').toUpperCase().slice(0, 4);
  const name = store.get('ww.name') || '';
  const last = store.get('ww.session');
  $app.innerHTML = `
  <header class="hero fade-in">
    <span class="eyebrow">เกมปาร์ตี้ 5–16 คน · ทุกคนใช้มือถือของตัวเอง</span>
    <h1 class="display">มนุษย์หมาป่า</h1>
    <p>หมู่บ้านเล็ก ๆ แห่งนี้มีหมาป่าแฝงตัวอยู่ กลางคืนพวกมันออกล่า กลางวันชาวบ้านต้องถกเถียงและโหวตหาตัวคนร้าย เว็บนี้ทำหน้าที่ผู้ดำเนินเกมให้ ทุกคนนั่งล้อมวงแล้วเล่นได้เลย</p>
  </header>
  ${
    last
      ? `<section class="panel row spread"><p>เล่นค้างอยู่ในห้อง <b>${esc(last.code)}</b></p><div class="row"><button class="btn primary" data-do="resume">กลับเข้าห้อง</button><button class="btn ghost" data-do="forget">ไม่ใช่ฉัน</button></div></section>`
      : ''
  }
  <section class="panel">
    <div class="field">
      <label for="name">ชื่อของคุณ</label>
      <input id="name" class="input" maxlength="20" autocomplete="nickname" placeholder="เช่น ต้น" value="${esc(name)}">
    </div>
    <div class="home-grid">
      <div class="stack" style="align-content:end">
        ${code ? '' : '<p class="small muted">เป็นคนเปิดวง</p>'}
        <button class="btn ${code ? '' : 'primary'} block" data-do="create">สร้างห้องใหม่</button>
      </div>
      <div class="stack">
        <label for="code" class="small muted">มีรหัสห้องแล้ว</label>
        <input id="code" class="input code" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" value="${esc(code)}">
        <button class="btn ${code ? 'primary' : ''} block" data-do="join">เข้าร่วมห้อง</button>
      </div>
    </div>
    ${err ? `<p class="warn">${esc(err)}</p>` : ''}
  </section>
  ${rulesSection()}`;
  document.body.dataset.time = 'night';
}

const isLocal = () => ['localhost', '127.0.0.1', '::1'].includes(location.hostname) || /^(10|172|192)\./.test(location.hostname);

function joinUrl(v) {
  const local = isLocal();
  const base = local && v.room.joinUrls[0] ? v.room.joinUrls[0] : location.origin;
  return `${base}/?room=${v.room.code}`;
}

function renderLobby(v) {
  const s = v.room.settings;
  const n = v.players.length;
  const host = v.me.isHost;
  const specials = ['werewolf', 'seer', 'bodyguard', 'witch', 'hunter'].reduce((a, k) => a + s.roles[k], 0);
  const villagers = Math.max(0, n - specials);
  const url = joinUrl(v);
  const sel = (id, value, opts, unit) =>
    `<select id="${id}" class="input" style="width:auto;min-height:40px;padding:6px 10px" ${host ? '' : 'disabled'}>${opts
      .map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o >= 60 && unit === 'min' ? `${o / 60} นาที` : `${o} วินาที`}</option>`)
      .join('')}</select>`;

  const roleRow = (k) => {
    const count = k === 'villager' ? villagers : s.roles[k];
    const max = k === 'werewolf' ? 6 : 1;
    const control =
      host && k !== 'villager'
        ? `<div class="stepper"><button data-do="role" data-role="${k}" data-d="-1" aria-label="ลด${ROLE[k].name}" ${count <= 0 ? 'disabled' : ''}>−</button><output>${count}</output><button data-do="role" data-role="${k}" data-d="1" aria-label="เพิ่ม${ROLE[k].name}" ${count >= max ? 'disabled' : ''}>+</button></div>`
        : `<div class="stepper"><output>${count}</output></div>`;
    return `<div class="setup-row">${glyph(k)}<div><b>${ROLE[k].name}</b><p class="small muted">${k === 'villager' ? 'คำนวณจากจำนวนผู้เล่นที่เหลือ' : ROLE[k].desc}</p></div>${control}</div>`;
  };

  $app.innerHTML = `
  <header class="row spread ${fx()}">
    <div><span class="eyebrow">ห้องรอ</span><h1 class="display" style="font-size:40px;color:var(--accent)">มนุษย์หมาป่า</h1></div>
    <button class="btn ghost" data-do="leave">ออกจากห้อง</button>
  </header>

  <section class="panel code-card">
    <div class="stack" style="min-width:0">
      <span class="eyebrow">รหัสห้อง</span>
      <div class="room-code">${esc(v.room.code)}</div>
      <p class="small muted">ให้เพื่อนสแกน QR หรือเปิดลิงก์นี้${/^http:\/\/(10|172|192)\./.test(url) ? ' (ต่อ Wi-Fi เดียวกับเครื่องที่เปิดเซิร์ฟเวอร์)' : ' เข้าจากที่ไหนก็ได้'}</p>
      <p class="join-url" id="join-url">${esc(url)}</p>
      <div class="row"><button class="btn" data-do="copy">คัดลอกลิงก์</button></div>
    </div>
    <div id="qr" aria-label="QR โค้ดสำหรับเข้าห้อง"></div>
  </section>

  <section class="panel">
    <div class="row spread"><h2>ผู้เล่น</h2><span class="muted small">${n} / ${v.room.limits.max} คน</span></div>
    ${board(v, { kick: host })}
    ${
      host
        ? `<div class="row spread"><p class="small muted">คนไม่ครบ? เพิ่มบอทมาเล่นด้วยได้ บอทเล่นบทบาทของตัวเองอัตโนมัติ</p><button class="btn" data-do="add-bot" ${n >= v.room.limits.max ? 'disabled' : ''}>+ เพิ่มบอท</button></div>`
        : ''
    }
  </section>

  <section class="panel">
    <div class="row spread">
      <h2>ตั้งค่าเกม</h2>
      ${host ? `<button class="btn ghost" data-do="auto" ${s.autoRoles ? 'disabled' : ''}>${s.autoRoles ? 'จัดตามจำนวนคนอยู่' : 'จัดบทบาทอัตโนมัติ'}</button>` : ''}
    </div>
    <div class="setup">${['werewolf', 'seer', 'bodyguard', 'witch', 'hunter', 'villager'].map(roleRow).join('')}</div>
    <div class="row spread"><label for="dayTime">เวลาถกเถียงกลางวัน</label>${sel('dayTime', s.dayTime, [60, 120, 180, 240, 300, 420], 'min')}</div>
    <div class="row spread"><label for="voteTime">เวลาโหวต</label>${sel('voteTime', s.voteTime, [30, 45, 60, 90, 120], 'sec')}</div>
    <label class="toggle"><input type="checkbox" id="revealOnDeath" ${s.revealOnDeath ? 'checked' : ''} ${host ? '' : 'disabled'}> เปิดเผยบทบาทเมื่อผู้เล่นตาย</label>
    ${v.room.setupProblem ? `<p class="warn">${esc(v.room.setupProblem)}</p>` : ''}
    ${
      host
        ? `<button class="btn primary block" data-do="start" ${v.room.setupProblem ? 'disabled' : ''}>เริ่มเกม · แจกไพ่</button>`
        : '<p class="muted">รอหัวห้องกดเริ่มเกม…</p>'
    }
  </section>
  ${rulesSection()}`;

  drawQr(url);
}

function drawQr(url) {
  const el = document.getElementById('qr');
  if (!el || el.children.length || !window.QRCode) return;
  try {
    new QRCode(el, { text: url, width: 116, height: 116, colorDark: '#14101e', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } catch {}
}

function renderGame(v) {
  $app.innerHTML = `${topbar(v)}${phasePanel(v)}${logPanel(v)}`;
}

function sleepPanel(text, sub = '') {
  return `<div class="sleep"><div class="moon-icon"></div><p class="instruction">${text}</p>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;
}

function phasePanel(v) {
  switch (v.room.phase) {
    case 'reveal':
      return revealPanel(v);
    case 'night':
      return nightPanel(v);
    case 'hunter':
      return hunterPanel(v);
    case 'day':
      return dayPanel(v);
    case 'vote':
      return votePanel(v);
    case 'verdict':
      return verdictPanel(v);
    case 'end':
      return endPanel(v);
  }
  return '';
}

function revealPanel(v) {
  const r = v.reveal;
  const mates = v.players.filter((p) => p.role === 'werewolf' && p.id !== v.me.id);
  return `
  <section class="panel ${fx()}">
    <p class="instruction">แตะไพ่เพื่อเปิดดูบทบาท แล้วแตะอีกครั้งเพื่อคว่ำ</p>
    ${roleCard(v.me.role, S.flipped)}
    ${v.me.role === 'werewolf' && S.flipped ? `<p class="note bad">${mates.length ? `เพื่อนหมาป่าของคุณ: <b>${mates.map((p) => esc(p.name)).join(', ')}</b>` : 'คุณเป็นหมาป่าตัวเดียวในเกมนี้'}</p>` : ''}
    <button class="btn primary block" data-do="ready" ${r.iAmReady ? 'disabled' : ''}>${r.iAmReady ? 'พร้อมแล้ว รอคนอื่น…' : 'จำบทบาทได้แล้ว พร้อม'}</button>
    <p class="muted small">พร้อมแล้ว ${r.readyCount} จาก ${r.total} คน · ในเกมนี้มี</p>
    ${setupChips(v)}
    ${hostAdvance(v, 'ไม่ต้องรอ เข้าสู่กลางคืนเลย')}
  </section>
  <section class="panel">${board(v)}</section>`;
}

function confirmRow(label, extra = '') {
  return `<div class="row"><button class="btn primary" data-do="confirm" ${S.sel ? '' : 'disabled'}>${label}</button>${extra}</div>`;
}

function nightPanel(v) {
  const n = v.night;
  if (v.me.ghost) return ghostNight(v);

  if (n.step === 'witch') {
    if (!n.witch) return `<section class="panel">${sleepPanel('ยังเป็นกลางคืน หลับตาไว้ก่อน', 'รอผู้มีพลังคนสุดท้ายตัดสินใจ')}</section>`;
    const w = n.witch;
    const victim = w.victim ? esc(nameOf(v, w.victim)) : null;
    return `
    <section class="panel ${fx()}" data-role="witch">
      <span class="eyebrow">แม่มด</span>
      <p class="note ${victim ? 'bad' : ''}">${victim ? `คืนนี้หมาป่ากัด <b>${victim}</b>` : 'คืนนี้หมาป่าไม่ได้กัดใคร'}</p>
      ${
        w.heal && victim
          ? `<label class="toggle"><input type="checkbox" id="witchSave" ${S.witchSave ? 'checked' : ''}> ใช้ยาชุบชีวิตช่วย ${victim}</label>`
          : `<p class="small muted">${w.heal ? 'ยาชุบชีวิต: ยังเหลือ' : 'ยาชุบชีวิต: ใช้ไปแล้ว'}</p>`
      }
      ${w.poison ? '<p>ยาพิษ: แตะเลือกผู้เล่นบนกระดานถ้าจะวางยา (แตะซ้ำเพื่อยกเลิก)</p>' : '<p class="small muted">ยาพิษ: ใช้ไปแล้ว</p>'}
      <div class="row"><button class="btn primary" data-do="witch">${S.witchSave || S.sel ? 'ยืนยันใช้ยา' : 'คืนนี้ไม่ใช้ยา'}</button></div>
      ${S.sel ? `<p class="note bad">จะวางยาพิษ <b>${esc(nameOf(v, S.sel))}</b></p>` : ''}
    </section>
    <section class="panel">${board(v, { selectable: w.poison ? new Set(w.options) : null })}</section>`;
  }

  const a = n.action;
  const waiting = `<p class="muted small">ยังรออีก ${n.waiting} คน</p>`;
  const lastNightResult = (v.me.seerResults || []).find((r) => r.night === v.room.day);

  if (a.done && a.kind !== 'wolf') {
    let extra = '';
    if (a.kind === 'seer' && lastNightResult) {
      const t = esc(nameOf(v, lastNightResult.id));
      extra = lastNightResult.isWolf
        ? `<p class="note bad">${t} คือ <b>มนุษย์หมาป่า</b></p>`
        : `<p class="note good">${t} <b>ไม่ใช่</b> มนุษย์หมาป่า</p>`;
    }
    return `
    <section class="panel ${fx()}">
      ${extra}
      ${sleepPanel('หลับตาได้แล้ว', `วางมือถือคว่ำไว้ · ยังรออีก ${n.waiting} คน`)}
      ${hostAdvance(v, 'ข้ามคนที่ยังไม่เลือก')}
    </section>
    ${a.kind === 'seer' ? `<section class="panel">${board(v, { badges: seerBadges(v) })}</section>` : ''}`;
  }

  const texts = {
    wolf: ['มนุษย์หมาป่า', 'เลือกเหยื่อคืนนี้', 'ตกลงกับเพื่อนหมาป่าให้ตรงกัน ถ้าเลือกไม่ตรงกันจะใช้เสียงข้างมาก เสมอกันจะสุ่ม'],
    seer: ['ผู้หยั่งรู้', 'เลือกคนที่จะส่อง', 'ส่องได้คืนละ 1 คน ยืนยันแล้วเปลี่ยนไม่ได้'],
    guard: ['บอดี้การ์ด', 'เลือกคนที่จะปกป้อง', n.lastGuard ? `คืนนี้ปกป้อง ${esc(nameOf(v, n.lastGuard))} ซ้ำไม่ได้` : 'ปกป้องตัวเองก็ได้'],
    dummy: ['กลางคืน', 'แตะเลือกคนที่คุณสงสัย', 'ไม่มีผลต่อเกม ทุกคนแตะพร้อมกันเพื่อไม่ให้ใครรู้ว่าใครมีพลัง'],
  }[a.kind];

  const badges = a.kind === 'seer' ? seerBadges(v) : {};
  if (a.kind === 'wolf' && n.wolfPicks) {
    const counts = {};
    for (const [wid, t] of Object.entries(n.wolfPicks)) if (t && wid !== v.me.id) counts[t] = (counts[t] || 0) + 1;
    for (const [t, c] of Object.entries(counts)) badges[t] = { text: `เพื่อนเลือก ${c}` };
  }

  const confirmLabel = { wolf: a.done ? 'เปลี่ยนเป็นคนนี้' : 'ยืนยันเหยื่อ', seer: 'ส่องคนนี้', guard: 'ปกป้องคนนี้', dummy: 'เลือกแล้ว' }[a.kind];
  return `
  <section class="panel ${fx()}" data-role="${v.me.role}">
    <span class="eyebrow">${texts[0]}</span>
    <p class="instruction">${texts[1]}</p>
    <p class="muted small">${texts[2]}</p>
    ${a.kind === 'wolf' && a.done ? `<p class="note bad">คุณเลือก <b>${esc(nameOf(v, a.chosen))}</b> แล้ว เปลี่ยนใจได้จนกว่าทุกคนจะเลือกเสร็จ</p>` : ''}
    ${confirmRow(confirmLabel, a.kind === 'dummy' ? '<button class="btn ghost" data-do="skip-night">ข้าม</button>' : '')}
    ${waiting}
    ${hostAdvance(v, 'ข้ามคนที่ยังไม่เลือก')}
  </section>
  <section class="panel">${board(v, { selectable: new Set(a.options), badges })}</section>`;
}

function ghostNight(v) {
  const g = v.night.ghost || {};
  const picks = Object.entries(g.wolfPicks || {}).map(([w, t]) => `${esc(nameOf(v, w))} → ${t ? esc(nameOf(v, t)) : 'ยังไม่เลือก'}`);
  return `
  <section class="panel ${fx()}">
    ${sleepPanel('คุณเป็นวิญญาณแล้ว', 'ดูเกมได้เงียบ ๆ ห้ามบอกใบ้คนที่ยังมีชีวิต')}
    ${picks.length ? `<p class="note bad">หมาป่าเลือก: ${picks.join(' · ')}</p>` : ''}
    <p class="muted small">ยังรออีก ${v.night.waiting} คน</p>
    ${hostAdvance(v, 'ข้ามคนที่ยังไม่เลือก')}
  </section>
  <section class="panel">${board(v)}</section>`;
}

function deathsNote(v) {
  const a = v.room.announcement;
  if (!a) return '';
  const who = (id) => {
    const p = playerOf(v, id);
    return `<b>${esc(p.name)}</b>${p.role ? ` (${ROLE[p.role].name})` : ''}`;
  };
  const lines = a.deaths.length ? `เมื่อคืน ${a.deaths.map(who).join(' และ ')} ถูกพบเป็นศพ` : 'เมื่อคืนสงบสุข ไม่มีใครตาย';
  const shot = a.hunterShot ? `<br>นายพรานยิง ${who(a.hunterShot)} ตามไปด้วย` : '';
  return `<p class="note ${a.deaths.length ? 'bad' : 'good'}">${lines}${shot}</p>`;
}

function hunterPanel(v) {
  const h = v.hunter;
  const fromVote = v.verdict && v.verdict.eliminated === h.id;
  if (h.isMe) {
    const opts = new Set(v.players.filter((p) => p.alive && p.id !== v.me.id).map((p) => p.id));
    return `
    <section class="panel ${fx()}" data-role="hunter">
      <span class="eyebrow">นายพราน</span>
      <p class="instruction">คุณถูกฆ่า! เลือกคนที่จะยิงพาไปด้วย</p>
      ${confirmRow('ยิง', '<button class="btn ghost" data-do="no-shoot">ไม่ยิงใคร</button>')}
    </section>
    <section class="panel">${board(v, { selectable: opts })}</section>`;
  }
  return `
  <section class="panel ${fx()}">
    ${fromVote ? '' : deathsNote(v)}
    <p class="instruction">นายพราน <b>${esc(nameOf(v, h.id))}</b> กำลังเลือกว่าจะยิงใครก่อนสิ้นใจ…</p>
    ${hostAdvance(v, 'ข้ามการยิง')}
  </section>
  <section class="panel">${board(v)}</section>`;
}

function dayPanel(v) {
  return `
  <section class="panel ${fx()}">
    ${deathsNote(v)}
    <p class="instruction">${v.me.alive ? 'ทุกคนลืมตา ถกเถียงกันว่าใครคือหมาป่า' : 'คุณตายแล้ว ฟังได้แต่ห้ามพูด'}</p>
    <p class="muted small">หมดเวลาแล้วจะเข้าสู่การโหวตอัตโนมัติ · ในเกมนี้มี</p>
    ${setupChips(v)}
    ${hostAdvance(v, 'เริ่มโหวตเลย')}
  </section>
  <section class="panel">${board(v, { badges: v.me.role === 'seer' ? seerBadges(v) : {} })}</section>`;
}

function votePanel(v) {
  const vote = v.vote;
  const progress = `<p class="muted small">โหวตแล้ว ${vote.count} จาก ${vote.total} คน</p>`;
  if (!v.me.alive) {
    return `<section class="panel ${fx()}"><p class="instruction">คนที่ยังมีชีวิตกำลังโหวต</p>${progress}${hostAdvance(v, 'ปิดโหวต')}</section><section class="panel">${board(v)}</section>`;
  }
  const opts = new Set(v.players.filter((p) => p.alive && p.id !== v.me.id).map((p) => p.id));
  const mine = vote.mine ? (vote.mine === 'skip' ? 'งดออกเสียง' : esc(nameOf(v, vote.mine))) : null;
  return `
  <section class="panel ${fx()}">
    <p class="instruction">โหวตคนที่คุณคิดว่าเป็นหมาป่า</p>
    ${mine ? `<p class="note">คุณเลือก <b>${mine}</b> แล้ว เปลี่ยนได้จนกว่าทุกคนจะโหวตครบ</p>` : ''}
    ${confirmRow('ยืนยันโหวต', '<button class="btn ghost" data-do="vote-skip">งดออกเสียง</button>')}
    ${progress}
    ${hostAdvance(v, 'ปิดโหวตเลย')}
  </section>
  <section class="panel">${board(v, { selectable: opts, badges: v.me.role === 'seer' ? seerBadges(v) : {} })}</section>`;
}

function tallyHtml(v) {
  const vd = v.verdict;
  const total = Object.keys(vd.votes).length || 1;
  const rows = Object.entries(vd.tally).sort((a, b) => b[1] - a[1]);
  return `<div class="tally">${rows
    .map(([t, c]) => {
      const voters = Object.entries(vd.votes).filter(([, x]) => x === t).map(([who]) => esc(nameOf(v, who)));
      return `<div class="tally-row ${t === vd.eliminated ? 'out' : ''}">
        <div class="row spread"><b>${t === 'skip' ? 'งดออกเสียง' : esc(nameOf(v, t))}</b><span class="muted small">${c} เสียง</span></div>
        <div class="bar"><i style="width:${(c / total) * 100}%"></i></div>
        <span class="small muted">${voters.join(', ')}</span>
      </div>`;
    })
    .join('')}</div>`;
}

function verdictPanel(v) {
  const vd = v.verdict;
  const out = vd.eliminated && playerOf(v, vd.eliminated);
  const result = out
    ? `<p class="note bad">หมู่บ้านลงมติประหาร <b>${esc(out.name)}</b>${out.role ? ` · บทบาท: <b>${ROLE[out.role].name}</b>` : ''}</p>`
    : `<p class="note good">${vd.tie ? 'คะแนนเสมอกัน' : 'เสียงส่วนใหญ่งดออกเสียง'} วันนี้ไม่มีใครถูกประหาร</p>`;
  return `
  <section class="panel ${fx()}">
    ${result}
    ${tallyHtml(v)}
    ${hostAdvance(v, 'ไปต่อ')}
  </section>
  <section class="panel">${board(v)}</section>`;
}

function endPanel(v) {
  const w = v.room.winner;
  return `
  <section class="panel ${fx()}">
    <div class="winner ${w}">
      <span class="eyebrow">ผลการแข่งขัน</span>
      <h2>${w === 'wolf' ? 'หมาป่าครองหมู่บ้าน' : 'หมู่บ้านปลอดภัยแล้ว'}</h2>
      <p class="muted">${w === 'wolf' ? 'ฝ่ายหมาป่าชนะ' : 'ฝ่ายหมู่บ้านชนะ'} · เล่นไป ${v.room.day} วัน</p>
    </div>
    ${v.me.isHost ? '<button class="btn primary block" data-do="restart">เล่นอีกรอบ (กลับห้องรอ)</button>' : '<p class="muted" style="text-align:center">รอหัวห้องเริ่มรอบใหม่…</p>'}
  </section>
  <section class="panel"><span class="eyebrow">บทบาทของทุกคน</span>${board(v)}</section>`;
}

// ---------- countdown ----------

function tick() {
  const el = document.querySelector('[data-ends]');
  if (!el) return;
  const left = Math.max(0, Math.ceil((Number(el.dataset.ends) - (Date.now() + S.offset)) / 1000));
  el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.classList.toggle('low', left <= 10);
}
setInterval(tick, 250);

// ---------- events ----------

async function enter(path, body) {
  const name = document.getElementById('name')?.value.trim();
  if (!name) return renderHome('กรุณาใส่ชื่อก่อน');
  store.set('ww.name', name);
  try {
    const res = await api(path, { ...body, name });
    S.session = { code: res.code, token: res.token };
    store.set('ww.session', S.session);
    tabSession.set(S.session);
    history.replaceState(null, '', `/?room=${res.code}`);
    S.stageKey = '';
    render();
    connect();
  } catch (e) {
    renderHome(e.message);
  }
}

$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-do]');
  if (!b || b.disabled) return;
  const v = S.view;
  switch (b.dataset.do) {
    case 'create':
      return enter('/api/create', {});
    case 'join': {
      const code = document.getElementById('code').value.trim().toUpperCase();
      if (code.length !== 4) return renderHome('รหัสห้องมี 4 ตัวอักษร');
      return enter('/api/join', { code });
    }
    case 'leave':
      return act('leave').then(leaveLocal);
    case 'resume':
      S.session = store.get('ww.session');
      if (!S.session) return renderHome();
      tabSession.set(S.session);
      S.stageKey = '';
      render();
      return connect();
    case 'forget':
      store.del('ww.session');
      return renderHome();
    case 'copy': {
      const url = document.getElementById('join-url')?.textContent;
      return navigator.clipboard?.writeText(url).then(() => toast('คัดลอกลิงก์แล้ว'), () => toast(url));
    }
    case 'kick':
      return act('kick', { id: b.dataset.id });
    case 'add-bot':
      return act('add-bot');
    case 'role': {
      const k = b.dataset.role;
      return act('settings', { settings: { roles: { [k]: v.room.settings.roles[k] + Number(b.dataset.d) } } });
    }
    case 'auto':
      return act('settings', { settings: { autoRoles: true } });
    case 'start':
      return act('start');
    case 'flip':
      S.flipped = !S.flipped;
      return render();
    case 'ready':
      return act('ready');
    case 'pick':
      S.sel = S.sel === b.dataset.id ? null : b.dataset.id;
      return render();
    case 'confirm':
      if (!S.sel) return;
      if (v.room.phase === 'night') return act('night', { target: S.sel });
      if (v.room.phase === 'vote') return act('vote', { target: S.sel });
      if (v.room.phase === 'hunter') return act('shoot', { target: S.sel });
      return;
    case 'skip-night':
      return act('night', { target: null });
    case 'witch':
      return act('witch', { save: S.witchSave, poison: S.sel });
    case 'vote-skip':
      S.sel = null;
      return act('vote', { target: 'skip' });
    case 'no-shoot':
      return act('shoot', { target: null });
    case 'advance':
      return act('advance');
    case 'restart':
      return act('restart');
    case 'narrator':
      S.narrator = !S.narrator;
      store.set('ww.narrator', S.narrator);
      b.setAttribute('aria-pressed', S.narrator);
      if (S.narrator) speak('เปิดเสียงผู้ดำเนินเกมแล้ว');
      else speechSynthesis?.cancel();
      return;
  }
});

$app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'dayTime') act('settings', { settings: { dayTime: Number(t.value) } });
  if (t.id === 'voteTime') act('settings', { settings: { voteTime: Number(t.value) } });
  if (t.id === 'revealOnDeath') act('settings', { settings: { revealOnDeath: t.checked } });
  if (t.id === 'witchSave') {
    S.witchSave = t.checked;
    render();
  }
});

$app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'code') $app.querySelector('[data-do="join"]')?.click();
  if (e.target.id === 'name') $app.querySelector(new URLSearchParams(location.search).get('room') ? '[data-do="join"]' : '[data-do="create"]')?.click();
});

// Hold-to-peek: the card shows only while the button is held, so nobody
// glancing over your shoulder catches it.
function showPeek(on) {
  const role = S.view?.me.role;
  if (on && role) {
    $peek.innerHTML = roleCard(role, true, 'div');
    $peek.hidden = false;
  } else {
    $peek.hidden = true;
    $peek.innerHTML = '';
  }
}
$app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-peek]')) {
    e.preventDefault();
    showPeek(true);
  }
});
['pointerup', 'pointercancel', 'blur'].forEach((ev) => window.addEventListener(ev, () => showPeek(false)));
$app.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-peek]')) e.preventDefault();
});
$app.addEventListener('keydown', (e) => {
  if (e.target.closest?.('[data-peek]') && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    showPeek(true);
  }
});
$app.addEventListener('keyup', (e) => {
  if (e.target.closest?.('[data-peek]')) showPeek(false);
});

render();
connect();
