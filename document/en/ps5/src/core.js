//#region Logger
const logger = {
  init() {
    this.console = document.getElementById('console');
  },

  info(msg) {
    this.log('[+]', msg);
  },

  error(msg) {
    this.log('[-]', msg);
  },

  log(prefix, msg) {
    if (this.console) {
      this.console.append(`${prefix} ${String(msg).replace(/\n/g, `\n${prefix} `)}\n`);
      this.console.scrollTop = this.console.scrollHeight;
    }

    if (typeof beacon === 'function') {
      try {
        beacon('LOG', `${prefix} ${String(msg)}`.replace(/\n/g, ' ').slice(0, 400));
        flush_beacons();
      } catch (ignore_beacon) {}
    }
  },
};
//#endregion

//#region log
function log(message) {
  logger.info(String(message));
}
//#endregion

//#region convert
function to_number(value) {
  if (typeof value === 'bigint') {
    if (value < -9007199254740991n || value > 9007199254740991n) throw new RangeError('value outside safe integer range');
    return Number(value);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError('value must be a safe integer or BigInt');
  return value;
}

function to_bigint(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError('value must be a safe integer or BigInt');
}
function to_hex(value) {
  return '0x' + BigInt.asUintN(64, to_bigint(value)).toString(16).padStart(16, '0');
}

const toHex = to_hex;
//#endregion

//#region abi
const O_RDONLY = 0;
const O_WRONLY = 1;
const O_RDWR = 2;
const O_CREAT = 0x200;
const O_TRUNC = 0x400;
const O_APPEND = 0x8;
const O_NONBLOCK = 0x4;

const PROT_READ = 0x1;
const PROT_WRITE = 0x2;
const PROT_EXEC = 0x4;
const PROT_NONE = 0x0;
const PROT_RWX = PROT_READ | PROT_WRITE | PROT_EXEC;
const MAP_SHARED = 0x1;
const MAP_PRIVATE = 0x2;
const MAP_FIXED = 0x10;
const MAP_ANONYMOUS = 0x1000;

const AF_UNIX = 1;
const AF_INET = 2;
const AF_INET6 = 28;
const SOCK_STREAM = 1;
const SOCK_DGRAM = 2;
const SOL_SOCKET = 0xffff;
const SO_REUSEADDR = 4;
const SO_NOSIGPIPE = 0x800;

const LIBKERNEL_HANDLE = 0x2001;

const STDIN_FILENO = 0;
const STDOUT_FILENO = 1;
const STDERR_FILENO = 2;

const SYSCALL = {
  read: 0x3,
  write: 0x4,
  open: 0x5,
  close: 0x6,
  unlink: 0xa,
  chmod: 0xf,
  getpid: 0x14,
  setuid: 0x17,
  getuid: 0x18,
  recvfrom: 0x1d,
  accept: 0x1e,
  getsockname: 0x20,
  kill: 0x25,
  pipe: 0x2a,
  ioctl: 0x36,
  munmap: 0x49,
  mprotect: 0x4a,
  dup2: 0x5a,
  fcntl: 0x5c,
  select: 0x5d,
  fsync: 0x5f,
  socket: 0x61,
  connect: 0x62,
  bind: 0x68,
  setsockopt: 0x69,
  listen: 0x6a,
  getsockopt: 0x76,
  netgetiflist: 0x7d,
  rename: 0x80,
  sendto: 0x85,
  socketpair: 0x87,
  mkdir: 0x88,
  rmdir: 0x89,
  stat: 0xbc,
  fstat: 0xbd,
  sysctl: 0xca,
  nanosleep: 0xf0,
  getdents: 0x110,
  sched_yield: 0x14b,
  sigaction: 0x1a0,
  thr_exit: 0x1af,
  thr_self: 0x1b0,
  umtx_op: 0x1c6,
  thr_new: 0x1c7,
  rtprio_thread: 0x1d2,
  mmap: 0x1dd,
  lseek: 0x1de,
  ftruncate: 0x1e0,
  cpuset_getaffinity: 0x1e7,
  cpuset_setaffinity: 0x1e8,
  jitshm_create: 0x215,
  jitshm_alias: 0x216,
  is_in_sandbox: 0x249,
  dlsym: 0x24f,
  dynlib_load_prx: 0x252,
  dynlib_unload_prx: 0x253,
  randomized_path: 0x25a,
};
//#endregion

//#region version
const VERSION_STRING = 'Galberik Userland 1.0';
let FW_VERSION = '';

const version = {
  console: undefined,
  major: undefined,
  minor: undefined,

  init() {
    const ua = navigator.userAgent;

    logger.info(`Agent: ${ua}`);

    const match = /PlayStation\s+(\d+)[/ ](\d+)\.(\d+)/.exec(ua);
    if (!match) {
      throw new Error(`Unsupported user agent: ${ua}`);
    }

    const [, console, major, minor] = match;

    this.console = Number.parseInt(console, 10);
    this.major = Number.parseInt(major, 10);
    this.minor = Number.parseInt(minor, 16);
    FW_VERSION = this.toString();
  },
  toString() {
    if (this.major === undefined || this.minor === undefined) {
      throw new Error('Version has not been initialized');
    }

    return `${this.major}.${this.minor.toString(16).padStart(2, '0')}`;
  },
};
//#endregion

//#region syscall
function native_syscall(id, args = [], ret_slot = 0) {
  if (!native_context) throw new Error('native context is not ready');
  return BigInt.asIntN(64, native_call(native_context.targets.syscall_wrapper, args, RESULT_OFF, id, ret_slot));
}

function syscall(id, ...args) {
  return native_syscall(id, args);
}
function call(address, ...args) {
  return native_call(address, args);
}

function read_null_terminated_string(address) {
  return read_string(address);
}
//#endregion

//#region Result
class ExploitError extends Error {
  constructor(code, data) {
    super(code);
    this.name = 'ExploitError';
    this.code = code;
    this.data = data || {};
  }
}

function fields(data) {
  let out = '';
  if (data) for (const key of Object.keys(data)) out += `|${key}=${data[key]}`;
  return out;
}

function settle(value, ok) {
  if (terminal) return;
  terminal = true;
  beacon('VERDICT', value);
  flush_beacons();
  resolve_userland({ ok, verdict: value });
}
//#endregion
