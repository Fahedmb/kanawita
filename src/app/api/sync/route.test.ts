import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

describe('/api/sync Route Handler', () => {
  it('GET /api/sync returns status 200 and configured state', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      configured: boolean;
      serverTime: number;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.configured).toBe('boolean');
    expect(typeof body.serverTime).toBe('number');
  });

  it('POST /api/sync handles missing MONGODB_URI gracefully (offline phone mode)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ outbox: [] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      configured: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.configured).toBe(false);
    expect(body.error).toBe('MONGODB_URI_MISSING');
  });

  it('POST /api/sync rejects invalid MongoDB URI protocols with status 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        mongodbUri: 'http://not-a-mongo-uri.com',
        outbox: [],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('INVALID_MONGODB_URI');
  });
});
