function poc_syscall(id, args = []) {
  return { rax: id, address: native_context.targets.syscall_wrapper, args: args };
}

function poc_call(address, args = []) {
  return { address: address, args: args };
}

function poc_notify(request) {
  return poc_call(native_context.targets.notify_fn, [0, request, 0xc30, 0]);
}

function poc_run() {
  const request = malloc(0xc30);

  write32(request + 0x10, 0xffffffff);
  write32(request + 0x2c, 1);
  write_string(request + 0x2d, 'Galberik Userland. @Andriushkajs');
  write_string(request + 0x42d, 'cxml://psnotification/tex_icon_system');

  return [poc_notify(request)];
}
