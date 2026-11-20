//#region Arena
const HEAP_OFFSET = 0x10000;

let heap_top = HEAP_OFFSET;

function malloc(size) {
  if (!native_context || !stage_view) throw new Error('stage is not ready');
  const length = to_number(size);
  if (length <= 0) throw new RangeError('allocation size must be positive');

  const offset = (heap_top + 15) & ~15;
  if (offset + length > STAGE_SIZE) throw new RangeError('stage heap exhausted');
  heap_top = offset + length;

  for (let i = 0; i < length; i++) stage_view.setUint8(offset + i, 0);
  return native_context.stage.backing + offset;
}

function free(addr) {}

function arena_mark() {
  return heap_top;
}

function arena_release(mark) {
  const value = to_number(mark);
  if (value < HEAP_OFFSET || value > heap_top) throw new RangeError('invalid arena mark');
  heap_top = value;
}

function with_arena(callback) {
  const mark = arena_mark();
  try {
    return callback();
  } finally {
    arena_release(mark);
  }
}
//#endregion

//#region Access
function stage_offset(addr, size) {
  if (!native_context || !stage_view) throw new Error('stage is not ready');
  const value = to_number(addr);
  const length = to_number(size);
  const base = native_context.stage.backing;
  if (value < base + HEAP_OFFSET || value + length > base + STAGE_SIZE) throw new RangeError('write outside stage arena');
  return value - base;
}

function alloc_string(text) {
  const bytes = new TextEncoder().encode(String(text));
  const addr = malloc(bytes.length + 1);
  write_string(addr, text);
  return addr;
}

function write_string(addr, text) {
  const bytes = new TextEncoder().encode(String(text));
  const offset = stage_offset(addr, bytes.length + 1);
  for (let i = 0; i < bytes.length; i++) stage_view.setUint8(offset + i, bytes[i]);
  stage_view.setUint8(offset + bytes.length, 0);
}

function read_string(addr, limit = 0x10000) {
  const max = to_number(limit);
  const bytes = [];
  let cursor = to_number(addr);
  while (bytes.length < max) {
    const chunk = read_memory(cursor, 8, 'READ_STRING');
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === 0) return new TextDecoder().decode(new Uint8Array(bytes));
      bytes.push(chunk[i]);
    }
    cursor += 8;
  }
  throw new Error('string is not null-terminated');
}

function read_buffer(addr, len) {
  const base = to_number(addr);
  const length = to_number(len);
  const buffer = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const chunk = Math.min(read_chunk_size, length - offset);
    buffer.set(read_memory(base + offset, chunk, 'READ_BUFFER'), offset);
    offset += chunk;
  }
  return buffer;
}

function write_buffer(addr, buffer) {
  if (!buffer || typeof buffer.length !== 'number') throw new TypeError('write_buffer expects an array-like buffer');
  const offset = stage_offset(addr, buffer.length);
  for (let i = 0; i < buffer.length; i++) stage_view.setUint8(offset + i, buffer[i] & 0xff);
}

function find_pattern(buffer, pattern_string) {
  if (typeof pattern_string !== 'string') throw new TypeError('find_pattern expects a string pattern');
  const parts = pattern_string.split(' ').map((token) => (token === '?' || token === '??' ? null : parseInt(token, 16)));
  const matches = [];

  for (let i = 0; i <= buffer.length - parts.length; i++) {
    let match = true;
    for (let j = 0; j < parts.length; j++) {
      if (parts[j] !== null && buffer[i + j] !== parts[j]) {
        match = false;
        break;
      }
    }
    if (match) matches.push(i);
  }

  return matches;
}

function read8(addr) {
  return read_memory(to_number(addr), 1, 'READ8')[0];
}

function read16(addr) {
  const bytes = read_memory(to_number(addr), 2, 'READ16');
  return bytes[0] | (bytes[1] << 8);
}

function read32(addr) {
  return read_uint32(read_memory(to_number(addr), 4, 'READ32'), 0);
}

function read64(addr) {
  const bytes = read_memory(to_number(addr), 8, 'READ64');
  return BigInt(read_uint32(bytes, 0)) | (BigInt(read_uint32(bytes, 4)) << 32n);
}

function write8(addr, value) {
  stage_view.setUint8(stage_offset(addr, 1), Number(to_bigint(value) & 0xffn));
}

function write16(addr, value) {
  stage_view.setUint16(stage_offset(addr, 2), Number(to_bigint(value) & 0xffffn), true);
}

function write32(addr, value) {
  stage_view.setUint32(stage_offset(addr, 4), Number(to_bigint(value) & 0xffffffffn), true);
}

function write64(addr, value) {
  const offset = stage_offset(addr, 8);
  const raw = BigInt.asUintN(64, to_bigint(value));
  stage_view.setUint32(offset, Number(raw & 0xffffffffn), true);
  stage_view.setUint32(offset + 4, Number((raw >> 32n) & 0xffffffffn), true);
}
//#endregion
