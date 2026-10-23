// 시험용 가짜 토스 SDK: 토스 앱 없이 bridge.js 의 동작(저장·식별키·뒤로가기·닫기·안전 영역)을 확인한다.
const NATIVE = '__fake_native_storage__';
export const Environment = { environment: 'sandbox' };
export const Storage = {
  getItem: async (k) => { const o = JSON.parse(localStorage.getItem(NATIVE) || '{}'); return o[k] ?? null; },
  setItem: async (k, v) => { const o = JSON.parse(localStorage.getItem(NATIVE) || '{}'); o[k] = v; localStorage.setItem(NATIVE, JSON.stringify(o)); },
};
export const User = { getAnonymousKey: async () => ({ type: 'HASH', hash: 'fakehash123' }) };
export const graniteEvent = { addEventListener: (name, { onEvent }) => { window.__fakeBack = onEvent; return () => {}; } };
export const closeView = () => { window.__closed = (window.__closed || 0) + 1; };
export const SafeArea = { get: () => ({ top: 54, bottom: 20, left: 0, right: 0 }), subscribe: () => () => {} };
export const generateHapticFeedback = (o) => { (window.__haptics = window.__haptics || []).push(o.type); };
