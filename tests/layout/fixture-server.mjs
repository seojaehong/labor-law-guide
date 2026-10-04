// Local read-only PostgREST-shaped fixture. Unknown routes/mutations fail closed.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { tables } from './fixture-data.mjs';
export const FIXTURE_PORT = 4320;
export function selectRows(rows, params) {
  let selected = [...rows];
  for (const [key, value] of params) {
    if (['select', 'order', 'offset', 'limit', 'or'].includes(key)) continue;
    if (value.startsWith('eq.')) selected = selected.filter(row => String(row[key]) === value.slice(3));
    else if (value.startsWith('neq.')) selected = selected.filter(row => String(row[key]) !== value.slice(4));
    else if (value === 'not.is.null') selected = selected.filter(row => row[key] != null);
    else if (value === 'not.is.true') selected = selected.filter(row => row[key] !== true);
    else if (value.startsWith('gte.')) selected = selected.filter(row => Number(row[key]) >= Number(value.slice(4)));
    else if (value.startsWith('cs.{')) {
      const values = value.slice(4, -1).split(',').map(value => value.replaceAll('"', ''));
      selected = selected.filter(row => Array.isArray(row[key]) && values.every(value => row[key].includes(value)));
    }
  }
  const order = params.get('order');
  if (order) selected.sort((a, b) => {
    for (const part of order.split(',')) {
      const [key, direction] = part.split('.');
      const comparison = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
      if (comparison) return direction === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
  const count = selected.length;
  const offset = Number(params.get('offset') || 0);
  const limit = Number(params.get('limit') || count);
  return { rows: selected.slice(offset, offset + limit), count, offset };
}
export function createFixtureServer(fixtureTables = tables) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${FIXTURE_PORT}`);
    const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(req.method === 'HEAD' ? '' : JSON.stringify(data)); };
    if (url.pathname === '/health' && req.method === 'GET') return send(200, { fixture: 'layout', synthetic: true });
    if (url.pathname.startsWith('/rest/v1/rpc/') && req.method === 'POST') {
      const rpc = url.pathname.split('/').at(-1);
      const table = { search_nlrc: 'nlrc_decisions', search_cases: 'cases', search_admin: 'admin_interpretations' }[rpc];
      if (!table) return send(404, { error: 'Unknown read-only RPC' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) return send(413, { error: 'Too large' }); }
      let args; try { args = JSON.parse(body || '{}'); } catch { return send(400, { error: 'Invalid JSON' }); }
      return send(200, fixtureTables[table].slice(args.page_offset || 0, (args.page_offset || 0) + (args.result_limit || 21)));
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) return send(405, { error: 'Fixture is read-only' });
    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    if (!table || !Object.hasOwn(fixtureTables, table)) return send(404, { error: 'Unknown fixture resource' });
    const selection = selectRows(fixtureTables[table], url.searchParams);
    res.setHeader('Content-Range', `${selection.offset}-${Math.max(selection.offset, selection.offset + selection.rows.length - 1)}/${selection.count}`);
    if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      return selection.rows.length === 1 ? send(200, selection.rows[0]) : send(406, { code: 'PGRST116', details: `${selection.rows.length} rows`, message: 'Expected one row' });
    }
    return send(200, selection.rows);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createFixtureServer().listen(FIXTURE_PORT, '127.0.0.1', () => console.log(`Layout fixture: http://127.0.0.1:${FIXTURE_PORT}`));
}
