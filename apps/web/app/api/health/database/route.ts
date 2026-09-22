import { NextResponse } from 'next/server';
import { getDatabaseHealth } from '@ips/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getDatabaseHealth();
  return NextResponse.json(health, { status: health.connected ? 200 : 503 });
}
