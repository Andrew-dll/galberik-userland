// PS5 firmware 13.60 offsets: the wk_* (WebKit), lk_* (libkernel) and lc_* (libc) RVAs consumed by arw.js and userland/stage.js.

//#region 13.60
const OFFSETS = {
  firmware: '13.60',
  calibrated: true,

  // WebKit gadgets: CSSFontFace carrier, stack pivot and ROP
  wk_client_ap: 0x3249a78,
  wk_function_ap: 0x313e550,
  wk_function_slot2: 0x7e0c00,
  wk_fake_client_vtable: 0x32497f0,
  wk_pivot: 0x2ab6cbe,
  // wk_pivot - 0x23: mov [rdi], rsp; ... ; mov rsp, rdi; ret
  wk_capture: 0x2ab6c9b,
  wk_ret: 0x1750,
  wk_pop_rax_ret: 0x22a12c6,
  wk_pop_rdi_ret: 0x288b2,
  wk_pop_rsi_ret: 0x1ee7a,
  wk_pop_rdx_ret: 0xfa7a2,
  wk_pop_rcx_ret: 0x80597,
  wk_pop_r8_ret: 0x25624d0,
  wk_pop_r9_ret: 0x24535d2,
  wk_store_rax_ret: 0x3881f,
  wk_pop_rsp_ret: 0xa1138,

  // WebKit GOT slots
  wk_errno_got: 0x334e230,
  wk_strerror_got: 0x334e250,

  // libkernel
  lk_errno: 0xf7d0, // __error()
  lk_close: 0x1c310, // the syscall wrapper is libkernel_base + lk_close + 7
  lk_notify: 0x48b0, // sceKernelSendNotificationRequest(type, request, size, flags)

  // libc
  lc_strerror: 0x7b730,
};
//#endregion
