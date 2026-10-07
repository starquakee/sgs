import { installTablePageLifecycle } from '/sgs/page-lifecycle.mjs';
const host = new EventTarget(), state = { paused2: false };
let cleanups = 0;
const status = () => { document.querySelector('#fixture-status').textContent = `测试暂停门：${state.paused2 ? '暂停' : '运行'} · 清理次数 ${cleanups}`; };
const game = { pause2() { state.paused2 = true; status(); }, resume2() { state.paused2 = false; status(); } };
installTablePageLifecycle({ game, _status: state, host, document, cleanup() { cleanups++; }, navigate(restart) {
  document.querySelector('#destination').textContent = restart ? '已收到同配置重开请求（测试桩）' : '已收到返回点将台请求（测试桩）';
} });
document.querySelector('#restore').onclick = () => {
  host.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  host.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  status();
};
status();
