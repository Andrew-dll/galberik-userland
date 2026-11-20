// PS5 firmware 14.00 offsets: verified against dump/14.00 (Neko.1400).

//#region 14.00
const OFFSETS = {
  firmware: '14.00',
  calibrated: true,

  wk_client_ap: 0x324db28,
  wk_function_ap: 0x3145ab0,
  wk_function_slot2: 0x7e0b60,
  wk_fake_client_vtable: 0x324d8a0,
  wk_pivot: 0x2ab821e,
  wk_capture: 0x2ab81fb,
  wk_ret: 0x1750,
  wk_pop_rax_ret: 0x3c71e,
  wk_pop_rdi_ret: 0x288b2,
  wk_pop_rsi_ret: 0x1ee7a,
  wk_pop_rdx_ret: 0x29420c,
  wk_pop_rcx_ret: 0x80537,
  wk_pop_r8_ret: 0x8ce1c,
  wk_pop_r9_ret: 0x80536,
  wk_store_rax_ret: 0x385af,
  wk_pop_rsp_ret: 0xa1488,
  wk_errno_got: 0x3352240,
  wk_strerror_got: 0x3352260,
  lk_errno: 0x2e10,
  lk_close: 0x450,
  lk_notify: 0x1bf90,
  lc_strerror: 0x0, // unused: libc_strerror is read from wk_strerror_got
};
//#endregion
