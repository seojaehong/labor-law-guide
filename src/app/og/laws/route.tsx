import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { shareCard } from '@/lib/share-card';
import { fmtDate, type LawIndex } from '@/lib/laws/format';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const index = JSON.parse(await readFile(path.join(process.cwd(), 'public/data/laws/index.json'), 'utf8')) as LawIndex;
  const event = index.events.find(e => e.id === new URL(req.url).searchParams.get('event'));
  return shareCard(event ? { title: event.headline || event.law, description: event.law + ' · ' + fmtDate(event.date) + ' 시행 · 법령 검수 전 자료', category:'달라지는 일' } : { title:'달라지는 일', description:'법 개정과 시행일을 살피고, 취업규칙에서 확인할 항목을 찾습니다.', category:'법률 개정' });
}
