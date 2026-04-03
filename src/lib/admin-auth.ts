import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

export function checkAdminAuth(req: NextRequest): NextResponse | null {
  if (!ADMIN_TOKEN) {
    if (process.env.NODE_ENV === 'development') return null;
    return NextResponse.json({ error: 'ADMIN_TOKEN not configured' }, { status: 503 });
  }

  const token =
    req.headers.get('x-admin-token') ||
    new URL(req.url).searchParams.get('token');

  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
