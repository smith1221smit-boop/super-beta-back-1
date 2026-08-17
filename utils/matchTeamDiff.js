// Team-level change detection for the public overlay's liveMatchUpdate.
// Used to trim the outgoing `teams` array down to only the teams that
// actually changed since the last tick, instead of resending the entire
// roster every ~2s. Safe because PublicThemeRenderer.tsx's
// processLiveMatchUpdate already merges a partial `teams` array by team ID,
// keeping a team's last-known value when it's absent from a given tick —
// that merge logic exists today independent of this change.
function teamKey(team) {
  return String(team?.teamId ?? team?._id ?? '');
}

// Deliberately a full-object comparison (JSON.stringify), not a reuse of
// pubgApiMatchData.controller.js's TRACKED_FIELDS/computeFingerprintParts —
// that list exists only to cheaply gate "did ANYTHING change this tick" and
// deliberately excludes location/isFiring/isOutsideBlueCircle/character/
// picUrl/teamName (real fields that do ride on the wire) as "noise" for
// that narrower purpose. Reusing it here would silently omit a team whose
// only change is, say, position. A team is small (~4 players), so a full
// comparison is cheap — negligible next to the DB/roster work already done
// per tick — and has no field list to drift out of sync later.
function computeChangedTeams(currentTeams, previousTeams) {
  const prevByKey = new Map((previousTeams || []).map((t) => [teamKey(t), t]));
  const changed = [];
  for (const team of currentTeams || []) {
    const prevTeam = prevByKey.get(teamKey(team));
    if (!prevTeam || JSON.stringify(team) !== JSON.stringify(prevTeam)) {
      changed.push(team);
    }
  }
  return changed;
}

module.exports = { computeChangedTeams, teamKey };
