// Manual, one-off verification for team-level delta encoding
// (utils/matchTeamDiff.js), following the same standalone-script convention
// as scripts/benchmark-deflate.js. NOT wired into npm start/CI.
//   Run: node scripts/verify-team-delta.js
const { computeChangedTeams } = require('../utils/matchTeamDiff');

const results = [];
const pass = (msg) => results.push(`PASS: ${msg}`);
const fail = (msg) => results.push(`FAIL: ${msg}`);

function synthTeam(slot, overrides = {}) {
  return {
    teamId: slot,
    teamName: `Team ${slot}`,
    slot,
    placePoints: 0,
    players: [
      { _id: `p${slot}-1`, uId: `u${slot}-1`, playerName: 'A', killNum: 0, health: 100, location: { x: 0, y: 0, z: 0 } },
      { _id: `p${slot}-2`, uId: `u${slot}-2`, playerName: 'B', killNum: 0, health: 100, location: { x: 0, y: 0, z: 0 } },
    ],
    ...overrides,
  };
}

// --- 1. First tick: no previous state -> every team is "changed" ---
const tick1 = Array.from({ length: 24 }, (_, i) => synthTeam(i + 1));
const firstTickResult = computeChangedTeams(tick1, undefined);
firstTickResult.length === 24
  ? pass(`First tick (no lastData): all 24 teams returned — got ${firstTickResult.length}`)
  : fail(`First tick: expected 24, got ${firstTickResult.length}`);

// --- 2. Second tick, nothing changed -> zero teams returned ---
const tick2Unchanged = tick1.map((t) => JSON.parse(JSON.stringify(t))); // deep clone, identical content
const noChangeResult = computeChangedTeams(tick2Unchanged, tick1);
noChangeResult.length === 0
  ? pass(`No-op tick: 0 teams returned — got ${noChangeResult.length}`)
  : fail(`No-op tick: expected 0, got ${noChangeResult.length}`);

// --- 3. Only a non-TRACKED_FIELDS field changes (location) -> still detected ---
const tick3 = tick1.map((t) => JSON.parse(JSON.stringify(t)));
tick3[5].players[0].location = { x: 999, y: 888, z: 1 }; // team slot 6, NOT in TRACKED_FIELDS
const locationChangeResult = computeChangedTeams(tick3, tick1);
(locationChangeResult.length === 1 && locationChangeResult[0].slot === 6)
  ? pass(`Location-only change on team 6: correctly detected (${locationChangeResult.length} team returned)`)
  : fail(`Location-only change: expected exactly team 6, got ${JSON.stringify(locationChangeResult.map((t) => t.slot))}`);

// --- 4. A real stat change (killNum) is also detected, unrelated teams excluded ---
const tick4 = tick1.map((t) => JSON.parse(JSON.stringify(t)));
tick4[10].players[1].killNum = 3; // team slot 11
const killChangeResult = computeChangedTeams(tick4, tick1);
(killChangeResult.length === 1 && killChangeResult[0].slot === 11)
  ? pass(`killNum change on team 11: correctly isolated (${killChangeResult.length} team returned, ${((1 - 1/24) * 100).toFixed(0)}% smaller than full snapshot)`)
  : fail(`killNum change: expected exactly team 11, got ${JSON.stringify(killChangeResult.map((t) => t.slot))}`);

// --- 5. Client-side merge contract: a team omitted from a delta retains its last-known value ---
// Ported verbatim (structure) from PublicThemeRenderer.tsx's processLiveMatchUpdate merge block.
function clientMerge(prevTeams, incomingTeams) {
  const incomingById = new Map(incomingTeams.map((t) => [String(t.teamId ?? t._id), t]));
  const mergedTeams = prevTeams.map((t) => {
    const key = String(t.teamId ?? t._id);
    return incomingById.has(key) ? incomingById.get(key) : t;
  });
  const knownIds = new Set(prevTeams.map((t) => String(t.teamId ?? t._id)));
  for (const t of incomingTeams) {
    const key = String(t.teamId ?? t._id);
    if (!knownIds.has(key)) mergedTeams.push(t);
  }
  return mergedTeams;
}

const clientPrevState = tick1; // client's last-known full state
const backendDelta = killChangeResult; // only team 11, per test 4
const merged = clientMerge(clientPrevState, backendDelta);
const mergedTeam11 = merged.find((t) => t.slot === 11);
const mergedTeam1 = merged.find((t) => t.slot === 1); // untouched, should be byte-identical to original

(merged.length === 24 && mergedTeam11.players[1].killNum === 3 && JSON.stringify(mergedTeam1) === JSON.stringify(tick1[0]))
  ? pass(`Client merge: 24 teams after merge, team 11 got the update, team 1 (omitted from delta) retained its exact prior value`)
  : fail(`Client merge: length=${merged.length}, team11.killNum=${mergedTeam11?.players[1]?.killNum}, team1 unchanged=${JSON.stringify(mergedTeam1) === JSON.stringify(tick1[0])}`);

console.log('\n=== TEAM DELTA VERIFICATION RESULTS ===');
results.forEach((r) => console.log(r));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
