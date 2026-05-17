import { NextResponse } from 'next/server';

// Force dynamic rendering - this route checks live database connectivity
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Check database connectivity
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok');

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
