import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

export function checkAdminAuth(req: NextRequest): NextResponse | null {
  if (!ADMIN_TOKEN) return null; // no token configured = open (dev)

  const token =
    req.headers.get('x-admin-token') ||
    new URL(req.url).searchParams.get('token');

  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
