import { notFound } from 'next/navigation';
import E01Client from './e01-client';
export const dynamic = 'force-dynamic';
export default function Page() {
  if (process.env.NODE_ENV === 'production' || process.env.AI_WORKSPACE_DEMO !== 'true') notFound();
  return <E01Client />;
}
