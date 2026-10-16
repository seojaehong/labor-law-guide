import process from 'node:process';
export type ModelFactory = typeof import('../vertex/client').getGenerativeModel;
export type OfflineTransport = { kind: 'network-blocked-mock'; modelFactory: ModelFactory; anthropicFactory?: import('./anthropic-generator').AnthropicFactory; fetch: typeof fetch };
const key = Symbol.for('document-workspace.offline-transport');
export function requireOfflineTransport(): OfflineTransport {
  const transport = (process as unknown as Record<symbol, OfflineTransport>)[key];
  if (!transport || transport.kind !== 'network-blocked-mock' || typeof transport.modelFactory !== 'function' || typeof transport.fetch !== 'function') throw Error('mock-transport-not-installed');
  return transport;
}
