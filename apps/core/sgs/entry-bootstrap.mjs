import { installVolatileLocalStorage, storageNotice } from './storage.mjs';
import { createLoadingScreen } from './loading.mjs';

// This synchronous dependency must run before native util/index.js reads
// localStorage at module evaluation time. Ordinary Noname entry is untouched.
export let sgsLoading;
if (new URLSearchParams(globalThis.location?.search).get('sgs') === '1') {
  sgsLoading = createLoadingScreen();
  try { if (installVolatileLocalStorage()) sgsLoading.warn(storageNotice); }
  catch (error) { sgsLoading.fail(error); }
  sgsLoading.stage('正在初始化原生引擎');
  window.addEventListener('pagehide', () => sgsLoading.dispose(), { once: true });
}
