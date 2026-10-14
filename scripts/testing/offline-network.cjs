// Test/build isolation only. Never load this into a deployed server.
// Node --require preloads CommonJS before application imports.
/* eslint-disable @typescript-eslint/no-require-imports */
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' ? first.host || first.hostname : typeof args[1] === 'string' ? args[1] : undefined;
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`OFFLINE_NETWORK_BLOCKED:${host}`);
  }
  return originalConnect.apply(this, args);
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'offline-supabase.invalid') {
    const method = (init?.method || input?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/'))) {
      throw new Error('OFFLINE_DB_WRITE_BLOCKED');
    }
    return new Response(method === 'HEAD' ? null : '[]', {
      status: 200, headers: { 'content-type': 'application/json', 'content-range': '*/0' },
    });
  }
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) return nativeFetch(input, init);
  throw new Error(`OFFLINE_FETCH_BLOCKED:${url.hostname}`);
};
