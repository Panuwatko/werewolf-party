// Rule tests with fixed roles, run with `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../server');

// Deals the given roles in order to players named P0, P1, ... and starts night 1.
function game(roles) {
  const { room } = W.createRoom('P0');
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
