//#region Selector
const impl = new Proxy(OFFSETS, {
  get(source, prop) {
    if (!(prop in source)) {
      throw new Error(`Firmware ${version.toString()} has no offset ${String(prop)} !!`);
    }
    return source[prop];
  },
});
//#endregion
