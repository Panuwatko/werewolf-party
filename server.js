// Werewolf (มนุษย์หมาป่า) — game server.
// The server is the moderator: it deals roles, runs night/day phases and
// only ever sends each player what that player is allowed to know.
// No dependencies: plain http + Server-Sent Events for live updates.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 16;

const ROLES = {
  werewolf: { team: 'wolf' },
  seer: { team: 'village' },
  bodyguard: { team: 'village' },
  witch: { team: 'village' },
  hunter: { team: 'village' },
  villager: { team: 'village' },
};
const SPECIALS = ['werewolf', 'seer', 'bodyguard', 'witch', 'hunter'];

const rooms = new Map();

// ---------- helpers ----------

const rid = (n = 12) => crypto.randomBytes(n).toString('base64url');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => pick(letters)).join('');
  } while (rooms.has(code));
  return code;
}

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
    }
  }
  return urls;
}

// Ultimate Werewolf-style suggestion: ~1 wolf per 4 players, specials as the table grows.
function suggestedRoles(n) {
  return {
    werewolf: Math.max(1, Math.floor((n + 2) / 4)),
    seer: 1,
    bodyguard: n >= 6 ? 1 : 0,
    hunter: n >= 7 ? 1 : 0,
    witch: n >= 8 ? 1 : 0,
  };
}

function setupProblem(room) {
  const n = room.players.length;
  const r = room.settings.roles;
  const specials = SPECIALS.reduce((s, k) => s + r[k], 0);
  if (n < MIN_PLAYERS) return `ต้องมีผู้เล่นอย่างน้อย ${MIN_PLAYERS} คน`;
  if (r.werewolf < 1) return 'ต้องมีมนุษย์หมาป่าอย่างน้อย 1 ตัว';
  if (r.werewolf * 2 >= n) return 'หมาป่าต้องน้อยกว่าครึ่งหนึ่งของผู้เล่น';
  if (specials > n) return 'จำนวนบทบาทมากกว่าจำนวนผู้เล่น';
  return null;
}

// ---------- room & player ----------

function createRoom(hostName) {
  const code = newRoomCode();
  const room = {
    code,
    hostId: null,
    players: [],
    conns: new Set(),
    settings: { roles: suggestedRoles(MIN_PLAYERS), autoRoles: true, dayTime: 180, voteTime: 60, revealOnDeath: true },
    phase: 'lobby',
    phaseEndsAt: null,
    timer: null,
    day: 0,
    lastActive: Date.now(),
  };
  rooms.set(code, room);
  const host = addPlayer(room, hostName);
  room.hostId = host.id;
  return { room, player: host };
}

function addPlayer(room, name, bot = false) {
  const p = {
    id: rid(6),
    token: rid(18),
    name,
    bot,
    connected: bot,
    conns: 0,
    alive: true,
    role: null,
    revealed: false,
    seerResults: [],
    joinedAt: Date.now(),
  };
  room.players.push(p);
  if (room.settings.autoRoles) room.settings.roles = suggestedRoles(Math.max(MIN_PLAYERS, room.players.length));
  return p;
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

function findByToken(room, token) {
  return room.players.find((p) => p.token === token);
}

function byId(room, id) {
  return room.players.find((p) => p.id === id);
}

function alivePlayers(room) {
  return room.players.filter((p) => p.alive);
}

function log(room, text, kind = 'info') {
  room.log.push({ day: room.day, phase: room.phase, text, kind });
}

// ---------- phases ----------

function setPhase(room, phase, seconds, onTimeout) {
  clearTimeout(room.timer);
  room.timer = null;
  room.phase = phase;
  room.phaseEndsAt = seconds ? Date.now() + seconds * 1000 : null;
  if (seconds && onTimeout) {
    const token = (room.phaseToken = rid(4));
    room.timer = setTimeout(() => {
      if (room.phaseToken !== token) return;
      onTimeout();
      broadcast(room);
    }, seconds * 1000);
  } else {
    room.phaseToken = rid(4);
  }
}

function startGame(room) {
  const n = room.players.length;
  const deck = [];
  for (const k of SPECIALS) for (let i = 0; i < room.settings.roles[k]; i++) deck.push(k);
  while (deck.length < n) deck.push('villager');
  shuffle(deck);
  room.players.forEach((p, i) => {
    p.role = deck[i];
    p.alive = true;
    p.revealed = false;
    p.seerResults = [];
  });
  room.gameNo = (room.gameNo || 0) + 1;
  room.rolesInGame = deck.reduce((m, r) => ((m[r] = (m[r] || 0) + 1), m), {});
  room.day = 0;
  room.log = [];
  room.witch = { heal: true, poison: true };
  room.lastGuard = null;
  room.winner = null;
  room.announcement = null;
  room.verdict = null;
  room.hunter = null;
  room.ready = new Set();
  setPhase(room, 'reveal');
  log(room, `เริ่มเกม ผู้เล่น ${n} คน`, 'system');
}

function startNight(room) {
  room.day += 1;
  room.night = { step: 'main', acts: {}, wolfTarget: null, witchAct: null };
  room.announcement = null;
  room.verdict = null;
  setPhase(room, 'night');
}

// What a living player does at night. Everyone taps something, so nobody can
// tell roles apart by who is busy with their phone.
function nightActionFor(room, p) {
  if (!p.alive) return null;
  const others = alivePlayers(room).filter((x) => x.id !== p.id).map((x) => x.id);
  switch (p.role) {
    case 'werewolf':
      return { kind: 'wolf', options: alivePlayers(room).filter((x) => x.role !== 'werewolf').map((x) => x.id) };
    case 'seer':
      return { kind: 'seer', options: others };
    case 'bodyguard':
      return { kind: 'guard', options: alivePlayers(room).filter((x) => x.id !== room.lastGuard).map((x) => x.id) };
    default:
      return { kind: 'dummy', options: others };
  }
}

function nightAct(room, p, target) {
  const n = room.night;
  if (n.step !== 'main') throw new Error('ตอนนี้ยังไม่ใช่ตาของคุณ');
  const action = nightActionFor(room, p);
  if (!action) throw new Error('คุณไม่ได้อยู่ในเกมแล้ว');
  if (target !== null && !action.options.includes(target)) throw new Error('เลือกเป้าหมายนี้ไม่ได้');
  if (action.kind === 'seer') {
    if (n.acts[p.id]) throw new Error('คุณใช้พลังคืนนี้ไปแล้ว');
    if (target) {
      const t = byId(room, target);
      p.seerResults.push({ night: room.day, id: t.id, isWolf: t.role === 'werewolf' });
    }
  }
  n.acts[p.id] = { target };
  maybeFinishMainNight(room);
}

function maybeFinishMainNight(room, force = false) {
  const n = room.night;
  if (n.step !== 'main') return;
  const waiting = alivePlayers(room).filter((p) => !n.acts[p.id]);
  if (waiting.length && !force) return;

  const tally = {};
  for (const p of alivePlayers(room)) {
    if (p.role === 'werewolf' && n.acts[p.id]?.target) tally[n.acts[p.id].target] = (tally[n.acts[p.id].target] || 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((k) => tally[k] === max);
  n.wolfTarget = max > 0 ? pick(top) : null;
  const guard = alivePlayers(room).find((p) => p.role === 'bodyguard');
  n.guardTarget = guard ? n.acts[guard.id]?.target || null : null;

  // The moderator always calls the witch if she was dealt, alive or not,
  // so the pause itself gives nothing away.
  if (room.rolesInGame.witch) {
    n.step = 'witch';
    const witch = alivePlayers(room).find((p) => p.role === 'witch');
    if (!witch || (!room.witch.heal && !room.witch.poison)) {
      setPhase(room, 'night', 4 + Math.floor(Math.random() * 4), () => resolveNight(room));
    } else {
      setPhase(room, 'night');
    }
  } else {
    resolveNight(room);
  }
}

function witchAct(room, p, { save, poison }) {
  const n = room.night;
  if (n.step !== 'witch' || p.role !== 'witch' || !p.alive) throw new Error('ตอนนี้ยังไม่ใช่ตาของคุณ');
  if (save && (!room.witch.heal || !n.wolfTarget)) throw new Error('ใช้ยาชุบชีวิตไม่ได้');
  if (poison) {
    if (!room.witch.poison) throw new Error('ยาพิษหมดแล้ว');
    const t = byId(room, poison);
    if (!t || !t.alive) throw new Error('เลือกเป้าหมายนี้ไม่ได้');
  }
  n.witchAct = { save: !!save, poison: poison || null };
  if (save) room.witch.heal = false;
  if (poison) room.witch.poison = false;
  resolveNight(room);
}

function resolveNight(room) {
  const n = room.night;
  const deaths = [];
  const target = n.wolfTarget;
  const saved = n.witchAct?.save;
  if (target && target !== n.guardTarget && !saved) deaths.push(target);
  if (n.witchAct?.poison && !deaths.includes(n.witchAct.poison)) deaths.push(n.witchAct.poison);
  room.lastGuard = n.guardTarget;

  room.announcement = { kind: 'dawn', night: room.day, deaths };
  if (deaths.length === 0) log(room, `คืนที่ ${room.day}: ไม่มีใครตาย`, 'calm');
  for (const id of deaths) log(room, `คืนที่ ${room.day}: ${byId(room, id).name} ถูกพบเป็นศพ`, 'death');
  processDeaths(room, deaths, 'day');
}

function kill(room, id) {
  const p = byId(room, id);
  if (!p || !p.alive) return;
  p.alive = false;
  if (room.settings.revealOnDeath) p.revealed = true;
}

function processDeaths(room, ids, next) {
  ids.forEach((id) => kill(room, id));
  const hunter = ids.map((id) => byId(room, id)).find((p) => p.role === 'hunter');
  if (hunter) {
    room.hunter = { id: hunter.id, next };
    setPhase(room, 'hunter', 60, () => hunterShoot(room, hunter, null));
  } else {
    afterDeaths(room, next);
  }
}

function hunterShoot(room, p, target) {
  if (room.phase !== 'hunter' || room.hunter?.id !== p.id) throw new Error('ตอนนี้ยิงไม่ได้');
  const next = room.hunter.next;
  if (target) {
    const t = byId(room, target);
    if (!t || !t.alive || t.id === p.id) throw new Error('เลือกเป้าหมายนี้ไม่ได้');
    kill(room, t.id);
    room.hunter.shot = t.id;
    log(room, `${p.name} นายพรานยิง ${t.name} ก่อนสิ้นใจ`, 'death');
    if (room.announcement) room.announcement.hunterShot = t.id;
  } else {
    log(room, `${p.name} นายพรานไม่ยิงใคร`, 'calm');
  }
  room.hunter = null;
  afterDeaths(room, next);
}

function winner(room) {
  const alive = alivePlayers(room);
  const wolves = alive.filter((p) => p.role === 'werewolf').length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'wolf';
  return null;
}

function afterDeaths(room, next) {
  const w = winner(room);
  if (w) return endGame(room, w);
  if (next === 'day') startDay(room);
  else startNight(room);
}

function startDay(room) {
  setPhase(room, 'day', room.settings.dayTime, () => startVote(room));
}

function startVote(room) {
  room.votes = {};
  setPhase(room, 'vote', room.settings.voteTime, () => tallyVotes(room));
}

function castVote(room, p, target) {
  if (room.phase !== 'vote' || !p.alive) throw new Error('ตอนนี้โหวตไม่ได้');
  if (target !== 'skip') {
    const t = byId(room, target);
    if (!t || !t.alive || t.id === p.id) throw new Error('โหวตคนนี้ไม่ได้');
  }
  room.votes[p.id] = target;
  if (alivePlayers(room).every((x) => room.votes[x.id])) tallyVotes(room);
}

// Most votes is eliminated; a tie (or "skip" leading) means nobody dies today.
function tallyVotes(room) {
  const tally = {};
  for (const v of Object.values(room.votes)) tally[v] = (tally[v] || 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((k) => tally[k] === max);
  const out = max > 0 && top.length === 1 && top[0] !== 'skip' ? top[0] : null;
  room.verdict = { day: room.day, votes: { ...room.votes }, tally, eliminated: out, tie: top.length > 1 };
  if (out) {
    kill(room, out);
    log(room, `วันที่ ${room.day}: หมู่บ้านลงมติประหาร ${byId(room, out).name} (${max} เสียง)`, 'death');
  } else {
    log(room, `วันที่ ${room.day}: ${top.length > 1 ? 'คะแนนเสมอ' : 'หมู่บ้านไม่ประหารใคร'} วันนี้ไม่มีใครถูกประหาร`, 'calm');
  }
  setPhase(room, 'verdict', 12, () => finishVerdict(room));
}

function finishVerdict(room) {
  const out = room.verdict?.eliminated && byId(room, room.verdict.eliminated);
  if (out && out.role === 'hunter') {
    room.hunter = { id: out.id, next: 'night' };
    setPhase(room, 'hunter', 60, () => hunterShoot(room, out, null));
    return;
  }
  afterDeaths(room, 'night');
}

function endGame(room, w) {
  room.winner = w;
  room.players.forEach((p) => (p.revealed = true));
  log(room, w === 'village' ? 'ชาวบ้านกำจัดหมาป่าได้หมด ฝ่ายหมู่บ้านชนะ' : 'หมาป่ามีจำนวนเท่ากับชาวบ้านแล้ว ฝ่ายหมาป่าชนะ', 'system');
  setPhase(room, 'end');
}

function backToLobby(room) {
  room.players.forEach((p) => {
    p.role = null;
    p.alive = true;
    p.revealed = false;
    p.seerResults = [];
  });
  room.day = 0;
  room.winner = null;
  setPhase(room, 'lobby');
}

// Host button: push the current phase forward when someone is AFK.
function advance(room) {
  switch (room.phase) {
    case 'reveal':
      return startNight(room);
    case 'night':
      if (room.night.step === 'main') return maybeFinishMainNight(room, true);
      return resolveNight(room);
    case 'day':
      return startVote(room);
    case 'vote':
      return tallyVotes(room);
    case 'verdict':
      return finishVerdict(room);
    case 'hunter':
      return hunterShoot(room, byId(room, room.hunter.id), null);
  }
}

// ---------- bots ----------
// Bots sit in the room like players and act through the same rules as
// everyone else, after a short "thinking" pause.

const BOT_NAMES = ['บอทสมชาย', 'บอทมาลี', 'บอทป้าแจ่ม', 'บอทลุงมี', 'บอทน้องฟ้า', 'บอทเจ๊หมวย', 'บอทพี่ตูน', 'บอทยายเพ็ญ', 'บอทหมอเก่ง', 'บอทครูแดง', 'บอทจ่าเฉย', 'บอทเสี่ยโต้ง', 'บอทแม่ส้ม', 'บอทตาบุญ', 'บอทน้าเอก'];

const stageKey = (room) => `${room.gameNo}:${room.phase}:${room.day}:${room.night?.step || ''}`;

function scheduleBots(room) {
  const key = stageKey(room);
  for (const p of room.players) {
    if (!p.bot || p.botKey === key || !botMove(room, p)) continue;
    p.botKey = key;
    setTimeout(() => {
      if (!rooms.has(room.code) || stageKey(room) !== key || !room.players.includes(p)) return;
      const move = botMove(room, p);
      if (!move) return;
      try {
        move();
      } catch (e) {
        console.error(`bot ${p.name}:`, e.message);
      }
      broadcast(room);
    }, 1200 + Math.random() * 2800);
  }
}

// Returns the bot's next action for the current stage, or null if it has nothing to do.
function botMove(room, p) {
  switch (room.phase) {
    case 'reveal':
      return room.ready.has(p.id) ? null : () => handleAction(room, p, { type: 'ready' });
    case 'night': {
      const n = room.night;
      if (n.step === 'main' && p.alive && !n.acts[p.id]) return () => nightAct(room, p, botNightTarget(room, p));
      if (n.step === 'witch' && p.role === 'witch' && p.alive && (room.witch.heal || room.witch.poison)) return () => witchAct(room, p, botWitch(room, p));
      return null;
    }
    case 'vote':
      return p.alive && !room.votes[p.id] ? () => castVote(room, p, botVote(room, p)) : null;
    case 'hunter':
      return room.hunter?.id === p.id ? () => hunterShoot(room, p, botShot(room, p)) : null;
  }
  return null;
}

function botNightTarget(room, p) {
  const { kind, options } = nightActionFor(room, p);
  if (!options.length) return null;
  if (kind === 'wolf') {
    // Follow a packmate's choice so the wolves agree.
    const mate = alivePlayers(room).find((x) => x.role === 'werewolf' && x.id !== p.id && room.night.acts[x.id]?.target);
    return mate ? room.night.acts[mate.id].target : pick(options);
  }
  if (kind === 'seer') {
    const seen = new Set(p.seerResults.map((r) => r.id));
    const fresh = options.filter((id) => !seen.has(id));
    return pick(fresh.length ? fresh : options);
  }
  return pick(options);
}

function botWitch(room, p) {
  const victim = room.night.wolfTarget;
  const save = room.witch.heal && !!victim && (victim === p.id || Math.random() < 0.6);
  let poison = null;
  if (room.witch.poison && room.day >= 2 && Math.random() < 0.25) {
    const targets = alivePlayers(room).filter((x) => x.id !== p.id && x.id !== victim);
    if (targets.length) poison = pick(targets).id;
  }
  return { save, poison };
}

function botVote(room, p) {
  const others = alivePlayers(room).filter((x) => x.id !== p.id);
  let pool = others;
  if (p.role === 'werewolf') pool = others.filter((x) => x.role !== 'werewolf');
  if (p.role === 'seer') {
    const wolf = p.seerResults.find((r) => r.isWolf && byId(room, r.id)?.alive);
    if (wolf) return wolf.id;
    const clean = new Set(p.seerResults.filter((r) => !r.isWolf).map((r) => r.id));
    pool = others.filter((x) => !clean.has(x.id));
  }
  if (!pool.length) return 'skip';
  if (p.role !== 'werewolf' && Math.random() < 0.08) return 'skip';
  // Half the time, side with whoever already has the most votes.
  const tally = {};
  for (const v of Object.values(room.votes)) if (pool.some((x) => x.id === v)) tally[v] = (tally[v] || 0) + 1;
  const leader = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  if (leader && Math.random() < 0.5) return leader;
  return pick(pool).id;
}

function botShot(room, p) {
  const targets = alivePlayers(room).filter((x) => x.id !== p.id);
  return targets.length ? pick(targets).id : null;
}

// ---------- per-player view ----------

function viewFor(room, me) {
  const inGame = !['lobby'].includes(room.phase);
  const ended = room.phase === 'end';
  const ghost = inGame && !me.alive;
  const meWolf = me.role === 'werewolf';

  const players = room.players.map((p) => {
    const seeRole = p.id === me.id || p.revealed || ended || ghost || (meWolf && p.role === 'werewolf');
    return {
      id: p.id,
      name: p.name,
      bot: p.bot,
      alive: p.alive,
      connected: p.connected,
      isHost: p.id === room.hostId,
      role: inGame && seeRole ? p.role : null,
      ready: room.phase === 'reveal' ? room.ready.has(p.id) : undefined,
      voted: room.phase === 'vote' ? !!room.votes[p.id] : undefined,
      acted: ghost && room.phase === 'night' ? !!room.night.acts[p.id] : undefined,
    };
  });

  const view = {
    serverNow: Date.now(),
    me: { id: me.id, name: me.name, isHost: me.id === room.hostId, alive: me.alive, role: me.role, ghost },
    room: {
      code: room.code,
      phase: room.phase,
      day: room.day,
      phaseEndsAt: room.phaseEndsAt,
      settings: room.settings,
      setupProblem: room.phase === 'lobby' ? setupProblem(room) : null,
      joinUrls: process.env.PUBLIC_URL ? [process.env.PUBLIC_URL] : lanUrls(),
      rolesInGame: inGame ? room.rolesInGame : null,
      winner: room.winner || null,
      announcement: room.announcement || null,
      log: inGame ? room.log : [],
      limits: { min: MIN_PLAYERS, max: MAX_PLAYERS },
    },
    players,
  };

  if (room.phase === 'reveal') view.reveal = { readyCount: room.ready.size, total: room.players.length, iAmReady: room.ready.has(me.id) };

  if (me.role === 'seer') view.me.seerResults = me.seerResults;

  if (room.phase === 'night') {
    const n = room.night;
    const night = { step: n.step, waiting: alivePlayers(room).filter((p) => !n.acts[p.id]).length };
    if (n.step === 'main' && me.alive) {
      const action = nightActionFor(room, me);
      night.action = { ...action, chosen: n.acts[me.id]?.target ?? undefined, done: !!n.acts[me.id] };
      if (action.kind === 'guard') night.lastGuard = room.lastGuard;
      if (meWolf) {
        night.wolfPicks = {};
        for (const p of room.players) if (p.role === 'werewolf' && p.alive && n.acts[p.id]) night.wolfPicks[p.id] = n.acts[p.id].target;
      }
    }
    if (n.step === 'witch' && me.role === 'witch' && me.alive && (room.witch.heal || room.witch.poison)) {
      night.witch = {
        victim: n.wolfTarget,
        heal: room.witch.heal,
        poison: room.witch.poison,
        options: alivePlayers(room).map((p) => p.id),
      };
    }
    if (ghost) {
      night.ghost = {
        wolfPicks: Object.fromEntries(room.players.filter((p) => p.role === 'werewolf' && n.acts[p.id]).map((p) => [p.id, n.acts[p.id].target])),
        wolfTarget: n.wolfTarget,
      };
    }
    view.night = night;
  }

  if (me.role === 'witch') view.me.potions = room.witch;

  if (room.phase === 'vote') {
    view.vote = {
      mine: room.votes[me.id] || null,
      count: Object.keys(room.votes).length,
      total: alivePlayers(room).length,
    };
  }
  if (room.phase === 'verdict' || (room.verdict && ['hunter', 'end'].includes(room.phase))) view.verdict = room.verdict;
  if (room.phase === 'hunter') view.hunter = { id: room.hunter.id, isMe: room.hunter.id === me.id };

  return view;
}

function send(conn, room) {
  const p = byId(room, conn.playerId);
  if (!p) {
    conn.res.end(`event: kicked\ndata: {}\n\n`);
    room.conns.delete(conn);
    return;
  }
  conn.res.write(`data: ${JSON.stringify(viewFor(room, p))}\n\n`);
}

function broadcast(room) {
  room.lastActive = Date.now();
  for (const conn of room.conns) send(conn, room);
  scheduleBots(room);
}

// ---------- actions ----------

function handleAction(room, p, body) {
  const isHost = p.id === room.hostId;
  const hostOnly = () => {
    if (!isHost) throw new Error('เฉพาะหัวห้องเท่านั้น');
  };
  switch (body.type) {
    case 'settings': {
      hostOnly();
      if (room.phase !== 'lobby') throw new Error('แก้ได้เฉพาะก่อนเริ่มเกม');
      const s = room.settings;
      const b = body.settings || {};
      if (b.roles) {
        for (const k of SPECIALS) {
          if (b.roles[k] !== undefined) s.roles[k] = Math.max(0, Math.min(k === 'werewolf' ? 6 : 1, Math.floor(b.roles[k]) || 0));
        }
        s.autoRoles = false;
      }
      if (b.autoRoles) {
        s.autoRoles = true;
        s.roles = suggestedRoles(Math.max(MIN_PLAYERS, room.players.length));
      }
      if (b.dayTime) s.dayTime = Math.max(30, Math.min(600, Math.floor(b.dayTime)));
      if (b.voteTime) s.voteTime = Math.max(15, Math.min(180, Math.floor(b.voteTime)));
      if (b.revealOnDeath !== undefined) s.revealOnDeath = !!b.revealOnDeath;
      return;
    }
    case 'start': {
      hostOnly();
      if (room.phase !== 'lobby') throw new Error('เกมเริ่มไปแล้ว');
      const problem = setupProblem(room);
      if (problem) throw new Error(problem);
      return startGame(room);
    }
    case 'add-bot': {
      hostOnly();
      if (room.phase !== 'lobby') throw new Error('เพิ่มบอทได้เฉพาะก่อนเริ่มเกม');
      if (room.players.length >= MAX_PLAYERS) throw new Error(`ห้องเต็มแล้ว (สูงสุด ${MAX_PLAYERS} คน)`);
      const taken = new Set(room.players.map((x) => x.name));
      const name = BOT_NAMES.find((n) => !taken.has(n)) || `บอท ${room.players.length + 1}`;
      addPlayer(room, name, true);
      return;
    }
    case 'kick': {
      hostOnly();
      if (room.phase !== 'lobby') throw new Error('เตะผู้เล่นได้เฉพาะก่อนเริ่มเกม');
      if (body.id === p.id) throw new Error('เตะตัวเองไม่ได้');
      room.players = room.players.filter((x) => x.id !== body.id);
      if (room.settings.autoRoles) room.settings.roles = suggestedRoles(Math.max(MIN_PLAYERS, room.players.length));
      return;
    }
    case 'leave': {
      if (room.phase !== 'lobby') throw new Error('ออกจากห้องได้เฉพาะก่อนเริ่มเกม');
      room.players = room.players.filter((x) => x.id !== p.id);
      const human = room.players.find((x) => !x.bot);
      if (!human) {
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === p.id) room.hostId = human.id;
      if (room.settings.autoRoles) room.settings.roles = suggestedRoles(Math.max(MIN_PLAYERS, room.players.length));
      return;
    }
    case 'ready': {
      if (room.phase !== 'reveal') return;
      room.ready.add(p.id);
      if (room.ready.size === room.players.length) startNight(room);
      return;
    }
    case 'night':
      if (room.phase !== 'night') throw new Error('ตอนนี้ไม่ใช่กลางคืน');
      return nightAct(room, p, body.target ?? null);
    case 'witch':
      if (room.phase !== 'night') throw new Error('ตอนนี้ไม่ใช่กลางคืน');
      return witchAct(room, p, body);
    case 'vote':
      return castVote(room, p, body.target);
    case 'shoot':
      return hunterShoot(room, p, body.target || null);
    case 'advance':
      hostOnly();
      return advance(room);
    case 'restart':
      hostOnly();
      if (room.phase !== 'end') throw new Error('เกมยังไม่จบ');
      return backToLobby(room);
    default:
      throw new Error('ไม่รู้จักคำสั่งนี้');
  }
}

// ---------- http ----------

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('ข้อมูลไม่ถูกต้อง'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return json(res, 404, { error: 'not found' });
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === 'POST /api/create') {
      const body = await readJson(req);
      const name = cleanName(body.name);
      if (!name) return json(res, 400, { error: 'กรุณาใส่ชื่อ' });
      const { room, player } = createRoom(name);
      return json(res, 200, { code: room.code, token: player.token });
    }

    if (route === 'POST /api/join') {
      const body = await readJson(req);
      const room = rooms.get(String(body.code || '').toUpperCase().trim());
      if (!room) return json(res, 404, { error: 'ไม่พบห้องนี้ ตรวจรหัสห้องอีกครั้ง' });
      const existing = body.token && findByToken(room, body.token);
      if (existing) return json(res, 200, { code: room.code, token: existing.token });
      const name = cleanName(body.name);
      if (!name) return json(res, 400, { error: 'กรุณาใส่ชื่อ' });
      if (room.phase !== 'lobby') return json(res, 409, { error: 'เกมในห้องนี้เริ่มไปแล้ว รอรอบถัดไปนะ' });
      if (room.players.length >= MAX_PLAYERS) return json(res, 409, { error: `ห้องเต็มแล้ว (สูงสุด ${MAX_PLAYERS} คน)` });
      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return json(res, 409, { error: 'มีคนใช้ชื่อนี้ในห้องแล้ว' });
      const p = addPlayer(room, name);
      broadcast(room);
      return json(res, 200, { code: room.code, token: p.token });
    }

    if (route === 'GET /api/stream') {
      const room = rooms.get(url.searchParams.get('code'));
      const p = room && findByToken(room, url.searchParams.get('token'));
      if (!p) return json(res, 404, { error: 'ไม่พบห้องหรือผู้เล่น' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const conn = { playerId: p.id, res };
      room.conns.add(conn);
      p.conns += 1;
      p.connected = true;
      broadcast(room);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ping);
        room.conns.delete(conn);
        p.conns = Math.max(0, p.conns - 1);
        p.connected = p.conns > 0;
        broadcast(room);
      });
      return;
    }

    if (route === 'POST /api/action') {
      const body = await readJson(req);
      const room = rooms.get(body.code);
      const p = room && findByToken(room, body.token);
      if (!p) return json(res, 404, { error: 'ไม่พบห้องหรือผู้เล่น' });
      try {
        handleAction(room, p, body);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
      broadcast(room);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'เซิร์ฟเวอร์ขัดข้อง' });
  }
});

// Drop rooms nobody has touched for 3 hours.
setInterval(() => {
  const cutoff = Date.now() - 3 * 3600 * 1000;
  for (const [code, room] of rooms) {
    if (room.conns.size === 0 && room.lastActive < cutoff) {
      clearTimeout(room.timer);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  มนุษย์หมาป่า พร้อมเล่นแล้ว\n`);
  console.log(`  เครื่องนี้:      http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  มือถือในวง Wi-Fi เดียวกัน: ${u}`);
  console.log('');
});
