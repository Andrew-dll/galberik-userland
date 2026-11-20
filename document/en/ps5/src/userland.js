//#region fs
function file_exists(path) {
  return with_arena(() => {
    const name = alloc_string(path);
    const fd = native_syscall(SYSCALL.open, [name, O_RDONLY]);
    if (fd < 0n) return false;

    native_syscall(SYSCALL.close, [fd]);
    return true;
  });
}

function read_file(path) {
  return with_arena(() => {
    const name = alloc_string(path);
    const fd = native_syscall(SYSCALL.open, [name, O_RDONLY]);
    if (fd < 0n) throw new Error('open failed for ' + path + ': ' + to_hex(fd));

    try {
      const stat = malloc(0x100);
      const result = native_syscall(SYSCALL.fstat, [fd, stat]);
      if (result < 0n) throw new Error('fstat failed for ' + path + ': ' + to_hex(result));

      const size = read64(stat + 0x48);
      if (size === 0n) return new Uint8Array(0);

      const remaining = STAGE_SIZE - ((heap_top + 15) & ~15);
      if (size > BigInt(remaining)) throw new RangeError('file too large for the remaining arena: ' + path);

      const buffer = malloc(size);
      let done = 0n;
      while (done < size) {
        const count = native_syscall(SYSCALL.read, [fd, buffer + Number(done), size - done]);
        if (count <= 0n) throw new Error('short read for ' + path + ': ' + to_hex(count));
        done += count;
      }

      return read_buffer(buffer, size);
    } finally {
      native_syscall(SYSCALL.close, [fd]);
    }
  });
}

function write_file(path, text) {
  return with_arena(() => {
    const bytes = new TextEncoder().encode(String(text));
    const name = alloc_string(path);
    const data = malloc(bytes.length);
    write_buffer(data, bytes);

    const fd = native_syscall(SYSCALL.open, [name, O_CREAT | O_WRONLY | O_TRUNC, 0x1ff]);
    if (fd < 0n) throw new Error('open failed for ' + path + ': ' + to_hex(fd));

    try {
      let done = 0;
      while (done < bytes.length) {
        const written = native_syscall(SYSCALL.write, [fd, data + done, bytes.length - done]);
        if (written <= 0n) throw new Error('write failed for ' + path + ': ' + to_hex(written));
        done += Number(written);
      }
      return done;
    } finally {
      native_syscall(SYSCALL.close, [fd]);
    }
  });
}
//#endregion

//#region modules
function dlsym(handle, symbol) {
  return with_arena(() => {
    if (typeof symbol !== 'string') throw new TypeError('dlsym expects a string symbol name');

    const name = alloc_string(symbol);
    const out = malloc(8);
    const result = native_syscall(SYSCALL.dlsym, [to_number(handle), name, out]);
    if (result < 0n) throw new Error('dlsym failed for ' + symbol + ': ' + to_hex(result));

    return read64(out);
  });
}

function load_prx(path) {
  return with_arena(() => {
    const handle_out = malloc(4);
    const name = alloc_string(path);
    const result = native_syscall(SYSCALL.dynlib_load_prx, [name, 0, handle_out, 0]);
    if (result !== 0n) throw new Error('dynlib_load_prx failed for ' + path + ': ' + to_hex(result));

    return read32(handle_out);
  });
}

function get_nidpath() {
  return with_arena(() => {
    const path = malloc(0x256);
    const len = malloc(8);
    write64(len, 0x255);

    const result = native_syscall(SYSCALL.randomized_path, [0, path, len]);
    if (result < 0n) throw new Error('randomized_path failed: ' + to_hex(result));

    return read_string(path);
  });
}

function find_mod_by_name(name) {
  return with_arena(() => {
    const list_fn = dlsym(LIBKERNEL_HANDLE, 'sceKernelGetModuleListInternal');
    const info_fn = dlsym(LIBKERNEL_HANDLE, 'sceKernelGetModuleInfo');

    const handles = malloc(4 * 0x300);
    const count = malloc(8);
    const info = malloc(0x160);

    const list_status = native_call(list_fn, [handles, 0x300, count]);
    if (list_status !== 0n) throw new Error('sceKernelGetModuleListInternal failed: ' + to_hex(list_status));

    const total = Math.min(Number(read64(count)), 0x300);
    const zero = new Uint8Array(0x160);

    for (let i = 0; i < total; i++) {
      const handle = read32(handles + i * 4);
      write_buffer(info, zero);
      write64(info, 0x160);

      if (native_call(info_fn, [handle, info]) !== 0n) continue;

      if (read_string(info + 8) === name) {
        return { handle: handle, base_addr: read64(info + 0x108) };
      }
    }

    return null;
  });
}
//#endregion

//#region title
function get_title_id() {
  return with_arena(() => {
    const pid = Number(native_syscall(SYSCALL.getpid, []));

    const mib = malloc(0x10);
    write32(mib, 1);
    write32(mib + 4, 14);
    write32(mib + 8, 35);
    write32(mib + 12, pid);

    const app_info = malloc(0x100);
    const old_len = malloc(8);
    write64(old_len, 0x58);

    const result = native_syscall(SYSCALL.sysctl, [mib, 4, app_info, old_len, 0, 0]);
    if (result < 0n) throw new Error('sysctl failed: ' + to_hex(result));

    return read_string(app_info + 0x10);
  });
}
//#endregion

//#region system
function sysctlbyname(name, oldp, oldp_len, newp, newp_len) {
  return with_arena(() => {
    const translate = malloc(8);
    const mib = malloc(0x70);
    const size = malloc(8);

    write64(translate, 0x300000000);
    write64(size, 0x70);

    const name_addr = alloc_string(name);
    const name_length = new TextEncoder().encode(String(name)).length;

    if (native_syscall(SYSCALL.sysctl, [translate, 2, mib, size, name_addr, name_length]) < 0n)
      throw new Error('failed to translate sysctl name to mib (' + name + ')');

    const mib_bytes = Number(read64(size));
    if (mib_bytes <= 0 || mib_bytes > 0x70 || mib_bytes % 4 !== 0) throw new Error('invalid sysctl MIB length for ' + name);
    const mib_len = mib_bytes / 4;
    const result = native_syscall(SYSCALL.sysctl, [
      mib,
      mib_len,
      to_number(oldp ?? 0),
      to_number(oldp_len ?? 0),
      to_number(newp ?? 0),
      to_number(newp_len ?? 0),
    ]);

    return result === 0n;
  });
}

function get_fwversion() {
  return with_arena(() => {
    const buf = malloc(8);
    const size = malloc(8);
    write64(size, 8);

    if (!sysctlbyname('kern.sdk_version', buf, size, 0, 0)) return null;

    const bcd = (value) => (value >> 4) * 10 + (value & 0x0f);
    const minor = bcd(read8(buf + 2));
    const major = bcd(read8(buf + 3));
    return `${major}.${String(minor).padStart(2, '0')}`;
  });
}

function nanosleep(nsec) {
  return with_arena(() => {
    const value = to_number(nsec);
    const timespec = malloc(0x10);
    write64(timespec, Math.floor(value / 1e9));
    write64(timespec + 8, value % 1e9);

    native_syscall(SYSCALL.nanosleep, [timespec, 0]);
  });
}

function getpid() {
  return Number(native_syscall(SYSCALL.getpid, []));
}

function is_jailbroken() {
  return with_arena(() => {
    const uid = native_syscall(SYSCALL.getuid, []);
    const sandboxed = native_syscall(SYSCALL.is_in_sandbox, []);
    if (uid === 0n && sandboxed === 0n) return true;

    const sockaddr = malloc(16);
    const enable = malloc(4);
    const fd = native_syscall(SYSCALL.socket, [AF_INET, SOCK_STREAM, 0]);
    if (fd < 0n) throw new Error('socket failed: ' + to_hex(fd));

    try {
      write32(enable, 1);
      native_syscall(SYSCALL.setsockopt, [fd, SOL_SOCKET, SO_REUSEADDR, enable, 4]);

      write64(sockaddr, 0);
      write64(sockaddr + 8, 0);
      write8(sockaddr, 16);
      write8(sockaddr + 1, AF_INET);
      write16(sockaddr + 2, 0x3d23);
      write32(sockaddr + 4, 0x0100007f);

      return native_syscall(SYSCALL.connect, [fd, sockaddr, 16]) === 0n;
    } finally {
      native_syscall(SYSCALL.close, [fd]);
    }
  });
}

function check_jailbroken() {
  if (!is_jailbroken()) throw new Error('process is not jailbroken');
}

function create_pipe() {
  return with_arena(() => {
    const fildes = malloc(8);
    const result = native_syscall(SYSCALL.socketpair, [AF_UNIX, SOCK_STREAM, 0, fildes]);
    if (result < 0n) throw new Error('socketpair failed: ' + to_hex(result));
    return [read32(fildes), read32(fildes + 4)];
  });
}

function get_error_string() {
  if (!native_context) throw new Error('native context is not ready');

  const errno_ptr = native_call(native_context.targets.errno_fn, []);
  if (errno_ptr < 0x800000000n || errno_ptr >= 0x900000000n) throw new Error('ERRNO_PTR');
  const errno = read32(Number(errno_ptr));

  const message_ptr = native_call(native_context.targets.libc_strerror, [errno]);
  if (message_ptr < 0x800000000n || message_ptr >= 0x900000000n) throw new Error('STRERROR_PTR');
  const message = read_string(Number(message_ptr));
  return errno + ' ' + message;
}
//#endregion

//#region net
function get_current_ip() {
  const mark = arena_mark();
  try {
    const raw_count = native_syscall(SYSCALL.netgetiflist, [0, 10]);
    if (raw_count < 0n) return null;

    const count = Math.min(Number(raw_count), 10);
    if (count <= 0) return null;

    const iface_size = 0x1e0;
    const interfaces = malloc(iface_size * count);
    if (native_syscall(SYSCALL.netgetiflist, [interfaces, count]) < 0n) return null;

    for (let i = 0; i < count; i++) {
      const offset = stage_offset(interfaces + i * iface_size, 0x2c);

      let iface_name = '';
      for (let j = 0; j < 16; j++) {
        const c = stage_view.getUint8(offset + j);
        if (c === 0) break;
        iface_name += String.fromCharCode(c);
      }

      if (iface_name !== 'eth0' && iface_name !== 'wlan0') continue;

      const ip = [0, 1, 2, 3].map((k) => stage_view.getUint8(offset + 0x28 + k)).join('.');
      if (ip !== '0.0.0.0' && ip !== '127.0.0.1') return ip;
    }

    return null;
  } catch (error) {
    return null;
  } finally {
    arena_release(mark);
  }
}

function send_network(ip_address, port, sock_type, buffer) {
  const parse_ipv4 = (address) => {
    const parts = String(address).split('.');
    if (parts.length !== 4) return null;

    const octets = [];
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const value = Number(part);
      if (value > 255) return null;
      octets.push(value);
    }
    return octets;
  };

  const port_number = to_number(port);
  if (!Number.isInteger(port_number) || port_number < 0 || port_number > 65535) throw new RangeError('invalid port');

  const octets = parse_ipv4(ip_address);
  if (octets === null) throw new Error('invalid IPv4 address: ' + ip_address);

  const type = to_number(sock_type);
  if (type !== SOCK_STREAM && type !== SOCK_DGRAM) throw new Error('invalid socket type: ' + sock_type);

  let bytes;
  if (typeof buffer === 'string') bytes = new TextEncoder().encode(buffer);
  else if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
  else if (ArrayBuffer.isView(buffer)) bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  else throw new TypeError('buffer must be a string, ArrayBuffer or TypedArray');

  const make_sockaddr = () => {
    const sockaddr = malloc(16);
    write64(sockaddr, 0);
    write64(sockaddr + 8, 0);
    write8(sockaddr, 16); // sin_len
    write8(sockaddr + 1, AF_INET); // sin_family
    write16(sockaddr + 2, ((port_number & 0xff) << 8) | ((port_number >> 8) & 0xff)); // sin_port
    write32(sockaddr + 4, (octets[0] | (octets[1] << 8) | (octets[2] << 16) | (octets[3] << 24)) >>> 0); // sin_addr
    return sockaddr;
  };

  const mark = arena_mark();
  try {
    const sockaddr = make_sockaddr();
    const data = malloc(bytes.length || 1);
    write_buffer(data, bytes);

    const fd = native_syscall(SYSCALL.socket, [AF_INET, type, 0]);
    if (fd < 0n) throw new Error('socket failed: ' + to_hex(fd));

    try {
      if (type === SOCK_STREAM) {
        const enable = malloc(4);
        write32(enable, 1);
        native_syscall(SYSCALL.setsockopt, [fd, SOL_SOCKET, SO_NOSIGPIPE, enable, 4]);

        const result = native_syscall(SYSCALL.connect, [fd, sockaddr, 16]);
        if (result < 0n) throw new Error('connect failed: ' + to_hex(result));

        let offset = 0;
        while (offset < bytes.length) {
          const written = native_syscall(SYSCALL.write, [fd, data + offset, bytes.length - offset]);
          if (written <= 0n) throw new Error('write failed: ' + to_hex(written));
          offset += Number(written);
        }
      } else {
        const sent = native_syscall(SYSCALL.sendto, [fd, data, bytes.length, 0, sockaddr, 16]);
        if (sent < 0n || sent !== BigInt(bytes.length)) throw new Error('sendto failed: ' + to_hex(sent));
      }
    } finally {
      native_syscall(SYSCALL.close, [fd]);
    }
  } finally {
    arena_release(mark);
  }
}
//#endregion
