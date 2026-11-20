//#region Errors
window.onerror = function (message, source, line, column, error) {
  let msg = message;

  if (error && error.stack) {
    msg += `\n${error.stack}`;
  } else {
    msg += `\n@${source}:${line}:${column}`;
  }

  logger.error(msg);
  return true;
};

window.onunhandledrejection = function (event) {
  const err = event.reason;

  let msg = err && err.message ? err.message : String(err);

  if (err && err.stack) {
    msg += `\n${err.stack}`;
  }

  logger.error(msg);
};
//#endregion

//#region Loader
const LOAD_TIMEOUT_MS = 15000;
const CACHE_TAG = String(Date.now());

function load_script(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout loading script: ${src}`));
    }, LOAD_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
    }

    script.src = src.includes('?') ? src : `${src}?v=${CACHE_TAG}`;
    script.onload = () => {
      cleanup();
      resolve();
    };
    script.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load script: ${src}`));
    };

    document.head.appendChild(script);
  });
}
//#endregion

//#region Bootstrap
async function main() {
  await load_script('src/core.js');
  logger.init();

  version.init();

  if (version.console !== 5) throw new Error(`Unsupported console ${version.console}`);

  await load_script(`src/firmware/offsets/${FW_VERSION}.js`);
  if (typeof OFFSETS === 'undefined' || OFFSETS.firmware !== FW_VERSION) {
    throw new Error(`Offsets do not match firmware ${FW_VERSION}`);
  }
  if (OFFSETS.calibrated === false) {
    logger.info(`offsets: placeholder values for ${FW_VERSION}`);
  }
  await load_script(`src/firmware/calibration/${FW_VERSION}.js`);
  if (typeof GEOMETRY === 'undefined' || GEOMETRY.firmware !== FW_VERSION) {
    throw new Error(`Calibration does not match firmware ${FW_VERSION}`);
  }
  if (!GEOMETRY.calibrated) {
    logger.info(`geometry: placeholder values for ${FW_VERSION}`);
  }
  await load_script('src/firmware/impl.js');
  await load_script('src/webkit/arw.js');
  await load_script('src/native/boot.js');
  await load_script('src/native/rop.js');
  await load_script('src/native/call.js');
  await load_script('src/native/arena.js');
  await load_script('src/userland.js');

  const result = await arw_main();

  if (!result.ok) {
    logger.error(`verdict: ${result.verdict}`);
    return;
  }

  logger.info(`pid = ${result.verdict}`);
}
//#endregion

main().catch((error) => logger.error((error && error.stack) || error));
