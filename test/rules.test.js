// Rule tests with fixed roles, run with `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../server');

// Deals the given roles in order to players named P0, P1, ... and starts night 1.
// Trials are off unless asked for, so day goes straight to the vote.
function game(roles, settings = { trial: false }) {
  const { room } = W.createRoom('P0');
  Object.assign(room.settings, settings);
  for (let i = 1; i < roles.length; i++) W.addPlayer(room, `P${i}`);
  W.startGame(room);
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.revealed = p.role === 'mayor';
  });
  room.rolesInGame = roles.reduce((m, r) => ((m[r] = (m[r] || 0) + 1), m), {});
  W.startNight(room);
  return room;
}

const P = (room, i) => room.players[i];

// Everyone acts; `picks` maps player index to a target index (or a pair for Cupid).
// Players without a pick tap their first option, as a villager would.
function night(room, picks = {}) {
  for (const [i, p] of room.players.entries()) {
    if (!p.alive || room.night.acts[p.id]) continue;
    const pick = picks[i];
    if (Array.isArray(pick)) W.nightAct(room, p, null, pick.map((j) => P(room, j).id));
    else if (pick !== undefined) W.nightAct(room, p, P(room, pick).id);
    else W.nightAct(room, p, null);
  }
  if (room.phase === 'night' && room.night.step === 'witch') W.advance(room);
}

// Day: go to the vote; `votes` maps voter index to target index or 'skip'.
function day(room, votes) {
  if (room.phase === 'day') W.advance(room);
  for (const [i, p] of room.players.entries()) {
    if (!p.alive) continue;
    const v = votes[i] ?? 'skip';
    W.castVote(room, p, v === 'skip' ? 'skip' : P(room, v).id);
  }
}

test('tough guy survives the bite for one day, then dies the next night', () => {
  const room = game(['werewolf', 'toughguy', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 1 });
  assert.equal(room.phase, 'day');
  assert.equal(P(room, 1).alive, true);
  assert.deepEqual(room.announcement.deaths, []);
  assert.equal(W.viewFor(room, P(room, 1)).me.wounded, true);
  assert.equal(W.viewFor(room, P(room, 2)).me.wounded, undefined, 'others are not told');

  day(room, {});
  W.finishVerdict(room);
  night(room, { 0: 2 });
  assert.equal(P(room, 1).alive, false);
  assert.equal(P(room, 2).alive, false);
  assert.deepEqual(new Set(room.announcement.deaths), new Set([P(room, 1).id, P(room, 2).id]));
});

test('tough guy dies on the second night even if guarded then', () => {
  const room = game(['werewolf', 'toughguy', 'bodyguard', 'villager', 'villager', 'villager']);
  night(room, { 0: 1, 2: 3 });
  day(room, {});
  W.finishVerdict(room);
  night(room, { 0: 3, 2: 1 });
  assert.equal(P(room, 1).alive, false);
});

test('a guarded tough guy is not wounded at all', () => {
  const room = game(['werewolf', 'toughguy', 'bodyguard', 'villager', 'villager', 'villager']);
  night(room, { 0: 1, 2: 1 });
  assert.equal(P(room, 1).doomNight, null);
  assert.equal(W.viewFor(room, P(room, 1)).me.wounded, undefined);
});

test("cupid's lovers die together", () => {
  const room = game(['werewolf', 'cupid', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 1: [2, 3], 0: 2 });
  assert.equal(P(room, 2).alive, false);
  assert.equal(P(room, 3).alive, false);
  assert.equal(room.announcement.deaths.length, 2);
  assert.equal(W.viewFor(room, P(room, 4)).players.some((p) => p.lover), false, 'lovers stay secret from others');
});

test('the prince survives his first lynch only', () => {
  const room = game(['werewolf', 'prince', 'villager', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 2 });
  day(room, { 3: 1, 4: 1, 5: 1, 6: 1 });
  assert.equal(room.verdict.princeSaved, true);
  assert.equal(P(room, 1).alive, true);
  W.finishVerdict(room);
  night(room, { 0: 3 });
  day(room, { 4: 1, 5: 1, 6: 1 });
  assert.equal(P(room, 1).alive, false);
});

test('the cursed turns into a werewolf instead of dying', () => {
  const room = game(['werewolf', 'cursed', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 1 });
  assert.equal(P(room, 1).alive, true);
  assert.equal(P(room, 1).role, 'werewolf');
  const wolfView = W.viewFor(room, P(room, 0));
  assert.equal(wolfView.players.find((p) => p.id === P(room, 1).id).role, 'werewolf', 'pack sees the new wolf');
});

test('the tanner wins alone when voted out', () => {
  const room = game(['werewolf', 'tanner', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 2 });
  day(room, { 0: 1, 3: 1, 4: 1 });
  W.finishVerdict(room);
  assert.equal(room.phase, 'end');
  assert.equal(room.winner, 'tanner');
});

test("the headman's vote counts twice", () => {
  const room = game(['werewolf', 'mayor', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 5 });
  // Headman + one villager on P0 (2 + 1), single votes spread elsewhere.
  day(room, { 1: 0, 2: 0, 3: 4, 4: 3, 0: 2 });
  assert.equal(room.verdict.tally[P(room, 0).id], 3);
  assert.equal(room.verdict.eliminated, P(room, 0).id);
  assert.equal(W.viewFor(room, P(room, 2)).players[1].role, 'mayor', 'everyone knows the headman');
});

test('the seer sees the lycan as a wolf and the minion as not', () => {
  const room = game(['werewolf', 'seer', 'lycan', 'minion', 'villager', 'villager']);
  night(room, { 0: 4, 1: 2 });
  assert.equal(P(room, 1).seerResults[0].isWolf, true);
  day(room, {});
  W.finishVerdict(room);
  night(room, { 0: 5, 1: 3 });
  assert.equal(P(room, 1).seerResults[1].isWolf, false);
});

test('the minion knows the wolves but the wolves do not know the minion', () => {
  const room = game(['werewolf', 'minion', 'villager', 'villager', 'villager', 'villager']);
  assert.equal(W.viewFor(room, P(room, 1)).players[0].role, 'werewolf');
  assert.equal(W.viewFor(room, P(room, 0)).players[1].role, null);
});

// ---------- trials, last words, reactions, timeline, presets ----------

function accuse(room, picks) {
  if (room.phase === 'day') W.advance(room);
  for (const [i, p] of room.players.entries()) {
    if (!p.alive || room.phase !== 'accuse') continue;
    const t = picks[i] ?? 'skip';
    W.nominate(room, p, t === 'skip' ? 'skip' : P(room, t).id);
  }
}

test('trial: the most-accused stands trial and only they can be voted', () => {
  const room = game(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], { trial: true });
  night(room, { 0: 5 });
  accuse(room, { 1: 0, 2: 0, 3: 4 });
  assert.equal(room.phase, 'defense');
  assert.deepEqual(room.accused, [P(room, 0).id]);
  W.advance(room);
  assert.equal(room.phase, 'vote');
  assert.throws(() => W.castVote(room, P(room, 1), P(room, 4).id), /ผู้ต้องหา/);
  day(room, { 1: 0, 2: 0, 3: 0, 4: 0 });
  assert.equal(room.verdict.eliminated, P(room, 0).id);
});

test('trial: nobody accused means no vote today', () => {
  const room = game(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'], { trial: true });
  night(room, { 0: 5 });
  accuse(room, {});
  assert.equal(room.phase, 'verdict');
  assert.equal(room.verdict.noAccused, true);
});

test('last words: only the executed player, once, readable by all', () => {
  const room = game(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 5 });
  day(room, { 1: 2, 3: 2, 4: 2 });
  const out = P(room, 2);
  assert.equal(room.phase, 'verdict');
  W.postChat(room, P(room, 5), 'ผีพูด');
  assert.equal(room.chat.at(-1).ch, 'ghost', 'the night victim only reaches the ghosts');
  assert.ok(!W.viewFor(room, P(room, 1)).chat.some((m) => m.text === 'ผีพูด'));
  W.postChat(room, out, 'ฉันบริสุทธิ์');
  const msg = room.chat.at(-1);
  assert.equal(msg.ch, 'last');
  assert.equal(W.viewFor(room, P(room, 1)).chat.at(-1).text, 'ฉันบริสุทธิ์');
  assert.equal(W.chatChannel(room, out), 'ghost', 'one message only');
});

test('reactions: the dead cannot react to village chat mid-game', () => {
  const room = game(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
  night(room, { 0: 5 });
  W.postChat(room, P(room, 1), 'สวัสดี');
  const id = room.chat.at(-1).id;
  W.react(room, P(room, 2), id, '👍');
  assert.deepEqual(room.chat.at(-1).reactions['👍'], [P(room, 2).id]);
  assert.throws(() => W.react(room, P(room, 5), id, '🐺'));
  W.react(room, P(room, 2), id, '👍');
  assert.equal(room.chat.at(-1).reactions['👍'], undefined, 'second tap removes it');
});

test('night timer resolves the night when someone never acts', () => {
  const room = game(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
  W.nightAct(room, P(room, 0), P(room, 3).id);
  W.advance(room); // what the timer does on timeout
  assert.equal(room.phase, 'day');
  assert.equal(P(room, 3).alive, false);
});

test('timeline records who did what each night and day', () => {
  const room = game(['werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'villager']);
  night(room, { 0: 4, 1: 0, 2: 4 });
  const n1 = room.history[0];
  assert.equal(n1.kind, 'night');
  assert.ok(n1.events.some((e) => e.type === 'bite' && e.target === P(room, 4).id));
  assert.ok(n1.events.some((e) => e.type === 'seer' && e.wolf === true));
  assert.ok(n1.events.some((e) => e.type === 'guarded'));
  assert.deepEqual(n1.deaths, []);
  day(room, { 1: 0, 2: 0, 3: 0, 4: 0 });
  assert.equal(room.history[1].kind, 'day');
  assert.equal(room.history[1].eliminated, P(room, 0).id);
  W.finishVerdict(room);
  assert.equal(room.phase, 'end');
  assert.equal(W.viewFor(room, P(room, 4)).room.history.length, 2, 'shown once the game ends');
});

test('every preset is a valid setup for 5 to 16 players', () => {
  for (const preset of ['beginner', 'classic', 'random', 'chaos']) {
    for (let n = 5; n <= 16; n++) {
      for (let k = 0; k < 20; k++) {
        const roles = W.presetRoles(preset, n);
        const specials = Object.values(roles).reduce((a, b) => a + b, 0);
        assert.ok(specials <= n, `${preset} n=${n} has ${specials} specials`);
        assert.ok(roles.werewolf >= 1 && roles.werewolf * 2 < n, `${preset} n=${n} wolves=${roles.werewolf}`);
      }
    }
  }
});
