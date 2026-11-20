//#region State
const SIZE_ADJUST = ['110%', '111%'];

let adjust_toggle = 0;

function next_size_adjust() {
  adjust_toggle ^= 1;
  return SIZE_ADJUST[adjust_toggle];
}
//#endregion

function arm_stage() {
  const { module, targets, callable } = native_context;
  arw_handoff.properties_context.setLineDash(FAKE_PROPERTIES);
  configure_map_face(arw_handoff.packed_properties);
  target.family = arw_handoff.family_name;
  pack_callback_graph(arw_handoff.backing, arw_handoff.packed_properties, module, callable);
  stage_write64(stage_view, STAGE_K, targets.ap);
}

function trigger_stage() {
  target.sizeAdjust = next_size_adjust();
}

function is_code(value) {
  return (value >= 0x1000000000 && value < 0x1003000000) || (value >= 0x800000000 && value < 0x900000000);
}

//#region Native call
function native_call(address, args, return_offset = RESULT_OFF, rax = null, forced_slot = 0) {
  if (!native_context) throw new Error('native context is not ready');
  if (!arw_handoff) throw new Error('ARW handoff is not ready');
  if (!stage_view) throw new Error('stage is not ready');
  if (!Array.isArray(args)) throw new TypeError('args must be an array');
  if (args.length > 6) throw new RangeError('more than 6 arguments is not supported');

  const offset = to_number(return_offset);
  if (offset % 8 !== 0 || offset < RESULT_OFF || offset + 8 > HEAP_OFFSET) throw new RangeError('invalid return offset');

  const { module, stage, targets, callable } = native_context;
  const snapshot = snapshot_carrier();

  const arm = arm_stage;
  const trigger = trigger_stage;

  const capture_stack = () => {
    stage_write64(stage_view, CAPTURE_MARK, 0xffffffffffffffffn);
    stage_write64(stage_view, STAGE_K + 8, stage.backing + CAPTURE_MARK);
    stage_write64(stage_view, STAGE_K + 16, targets.capture_target);
    trigger();

    const lo = stage_view.getUint32(CAPTURE_MARK, true);
    const hi = stage_view.getUint32(CAPTURE_MARK + 4, true);
    if (lo === 0xffffffff && hi === 0xffffffff) throw new Error('STACK_CAPTURE_NOT_EXECUTED');
    if (!hi || hi >= 0x80000000 || lo & 7) throw new Error('STACK_CAPTURE_INVALID');
    const rsp = hi * 4294967296 + lo;
    if (rsp >= stage.backing && rsp < stage.backing + STAGE_SIZE) throw new Error('STACK_CAPTURE_INVALID');

    const saved_return = read_qword(read_memory(rsp, 8, 'CAPTURE_RETURN'), 0);
    return { rsp, saved_return };
  };

  seed_result(offset);

  try {
    let return_slot = forced_slot;
    let restore = 0;
    if (!return_slot) {
      arm();
      const capture = capture_stack();
      restore_carrier(snapshot);
      if (!carrier_matches(snapshot)) throw new Error('CAPTURE_CARRIER_RESTORE');
      if (!is_code(capture.saved_return)) {
        beacon('NATIVE_RET', `rsp=0x${hex64(capture.rsp)}|value=0x${hex64(capture.saved_return)}`);
        flush_beacons();
        throw new Error('NATIVE_RETURN_ADDRESS');
      }
      return_slot = capture.rsp;
      restore = { slot: capture.rsp, value: capture.saved_return };
      beacon(
        'NATIVE',
        `addr=0x${hex64(address)}|args=${args.length}|rsp=0x${hex64(capture.rsp)}|ret=0x${hex64(capture.saved_return)}`,
      );
      flush_beacons();
    }

    arm();
    build_call_chain(stage, targets, address, args, return_slot, offset, rax, restore);
    trigger();
  } finally {
    disarm_stage();
    restore_carrier(snapshot);
    try {
      arw_handoff.properties_context.setLineDash(DASH);
    } catch (ignore_dash) {}
  }

  if (!carrier_matches(snapshot)) throw new Error('NATIVE_CARRIER_RESTORE');
  if (result_is_seeded(offset)) throw new Error('NATIVE_CHAIN_NOT_EXECUTED');

  const result_lo = stage_view.getUint32(offset, true);
  const result_hi = stage_view.getUint32(offset + 4, true);
  return (BigInt(result_hi) << 32n) | BigInt(result_lo);
}

//#endregion
