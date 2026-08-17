// Protobuf encoder for the public-overlay broadcasts (liveMatchUpdate /
// overallDataUpdate on round:${tid}:${rid}:* rooms). Generated from
// proto/overlay.proto via `npm run proto:gen` (pbjs + pbts) — see that file
// for the schema and the reasoning behind each field.
//
// Unlike msgpackCodec.js's encodeMsgpack, this is NOT a generic "encode
// whatever object you hand it" function — protobuf requires the input to
// already match the message definition (right field names, right types,
// `id` normalized from teamId ?? _id, etc.), same allowlisting
// Bulkpublic.controller.js's slimMatchDataForList already does for a
// different tier. That's what the toProto* mappers below do.
const proto = require('../proto/overlay.pb.js').overlay;
const { normalizeWireValue } = require('./wireNormalize');

// int32 proto fields require an exact integer; upstream data (game telemetry,
// summed aggregates) isn't guaranteed to be — truncate at the wire boundary
// so a stray float never breaks encoding regardless of which layer let it through.
const toInt32 = (v) => Math.trunc(Number(v)) || 0;

function toProtoPlayer(p) {
  if (!p) return null;
  const loc = p.location || {};
  return {
    uId: String(p.uId ?? ''),
    playerName: p.playerName || '',
    playerOpenId: p.playerOpenId || '',
    picUrl: p.picUrl || '',
    showPicUrl: p.showPicUrl || '',
    character: p.character || '',
    teamIdfromApi: toInt32(p.teamIdfromApi),
    teamId: toInt32(p.teamId),
    teamName: p.teamName || '',
    location: { x: Number(loc.x) || 0, y: Number(loc.y) || 0, z: Number(loc.z) || 0 },
    health: toInt32(p.health),
    healthMax: toInt32(p.healthMax),
    liveState: toInt32(p.liveState),
    isFiring: !!p.isFiring,
    bHasDied: !!p.bHasDied,
    isOutsideBlueCircle: !!p.isOutsideBlueCircle,
    killNum: toInt32(p.killNum),
    killNumBeforeDie: toInt32(p.killNumBeforeDie),
    gotAirDropNum: toInt32(p.gotAirDropNum),
    maxKillDistance: toInt32(p.maxKillDistance),
    damage: toInt32(p.damage),
    killNumInVehicle: toInt32(p.killNumInVehicle),
    killNumByGrenade: toInt32(p.killNumByGrenade),
    // These 7 fields are confirmed dead weight: no front/src/Themes view
    // component reads any of them, on any view — grepped all of front/src,
    // only the mirrored proto schema files reference the names. proto3
    // omits a scalar field from the wire entirely at its zero default, so
    // hardcoding 0 here (instead of toInt32(p.field)) is a guaranteed,
    // unconditional size cut on every protobuf tick. Scoped to this mapper
    // only — DB persistence and the dashboard's own raw-object msgpack feed
    // (pubgApiMatchData.controller.js's emitUpdates) are untouched.
    AIKillNum: 0,
    BossKillNum: 0,
    rank: toInt32(p.rank),
    inDamage: 0,
    headShotNum: toInt32(p.headShotNum),
    survivalTime: toInt32(p.survivalTime),
    driveDistance: toInt32(p.driveDistance),
    marchDistance: toInt32(p.marchDistance),
    assists: toInt32(p.assists),
    outsideBlueCircleTime: 0,
    knockouts: toInt32(p.knockouts),
    rescueTimes: toInt32(p.rescueTimes),
    useSmokeGrenadeNum: toInt32(p.useSmokeGrenadeNum),
    useFragGrenadeNum: toInt32(p.useFragGrenadeNum),
    useBurnGrenadeNum: toInt32(p.useBurnGrenadeNum),
    useFlashGrenadeNum: toInt32(p.useFlashGrenadeNum),
    PoisonTotalDamage: 0,
    UseSelfRescueTime: 0,
    UseEmergencyCallTime: 0,
    contribution: toInt32(p.contribution),
    heal: toInt32(p.heal),
    // p._id is a Mongoose ObjectId instance here (pre-normalization) or
    // already a hex string if this player object was itself already
    // normalized upstream — String() handles both.
    docId: String(p._id ?? ''),
  };
}

function toProtoTeam(t) {
  if (!t) return null;
  const normalized = normalizeWireValue(t);
  return {
    teamId: String(normalized.teamId ?? ''),
    docId: String(normalized._id ?? ''),
    teamName: normalized.teamName || '',
    teamTag: normalized.teamTag || '',
    teamLogo: normalized.teamLogo || '',
    slot: toInt32(normalized.slot),
    placePoints: toInt32(normalized.placePoints),
    rank: toInt32(normalized.rank),
    wwcd: toInt32(normalized.wwcd),
    matchesPlayed: toInt32(normalized.matchesPlayed),
    players: (normalized.players || []).map(toProtoPlayer).filter(Boolean),
  };
}

function toProtoMatchDataPayload(memoryMatch) {
  return {
    matchId: String(memoryMatch.matchId ?? ''),
    teams: (memoryMatch.teams || []).map(toProtoTeam).filter(Boolean),
  };
}

function toProtoOverallDataPayload(overallPayload) {
  const normalized = normalizeWireValue(overallPayload);
  return {
    tournamentId: String(normalized.tournamentId ?? ''),
    roundId: String(normalized.roundId ?? ''),
    matchId: String(normalized.matchId ?? ''),
    teams: (normalized.teams || []).map(toProtoTeam).filter(Boolean),
    createdAt: normalized.createdAt || '',
  };
}

const MESSAGE_TYPES = {
  MatchDataPayload: proto.MatchDataPayload,
  OverallDataPayload: proto.OverallDataPayload,
};

// A socket can be a member of BOTH a round:...:matchData/overall room
// (protobuf, if negotiated) AND the user:${userId} dashboard room
// (msgpack, if negotiated — see pubgApiMatchData.controller.js) AT THE
// SAME TIME, e.g. an operator viewing the public overlay in the same
// logged-in browser tab. Both rooms reuse the exact same event names
// ('liveMatchUpdate'/'overallDataUpdate'), and socket.io-client's
// `socket.on(event, ...)` can't tell which room a given broadcast came
// from — so the client sees plain binary data either way and needs a way
// to tell msgpack and protobuf apart. Prefixing every protobuf payload
// with 0xC1 solves this safely: the msgpack spec formally reserves 0xC1 as
// "never used" (https://github.com/msgpack/msgpack/blob/master/spec.md),
// so no genuine msgpack stream this codebase produces can ever start with
// that byte — zero collision risk. Client: check byte 0 before decoding;
// see PublicThemeRenderer.tsx's decodeWireMessage.
const PROTOBUF_MARKER_BYTE = 0xc1;

// encodeProtobuf('MatchDataPayload', toProtoMatchDataPayload(memoryMatch))
function encodeProtobuf(messageTypeName, mappedData) {
  const MessageType = MESSAGE_TYPES[messageTypeName];
  if (!MessageType) {
    throw new Error(`[protobufCodec] unknown message type "${messageTypeName}"`);
  }
  const verifyError = MessageType.verify(mappedData);
  if (verifyError) {
    // Fail loudly rather than silently shipping a corrupt/truncated frame —
    // this is the hot per-tick emit path, so a bad mapper output here would
    // otherwise show up as a confusing client-side decode/render bug much
    // later, far from its actual cause.
    console.error(`[bw][protobuf] ${messageTypeName}.verify() failed: ${verifyError}`, mappedData);
    throw new Error(`[protobufCodec] ${messageTypeName} verify failed: ${verifyError}`);
  }
  const message = MessageType.create(mappedData);
  const body = MessageType.encode(message).finish();
  return Buffer.concat([Buffer.from([PROTOBUF_MARKER_BYTE]), Buffer.from(body)]);
}

module.exports = {
  encodeProtobuf,
  toProtoPlayer,
  toProtoTeam,
  toProtoMatchDataPayload,
  toProtoOverallDataPayload,
};
