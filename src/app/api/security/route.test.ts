import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { AuthorizedIpDevice, DEFAULT_AUTHORIZED_IPS } from '@/domain/models';
import * as mongoServer from '@/data/mongoServer';

describe('/api/security Route Handler', () => {
  it('GET /api/security recognizes historical signup IPs and flags new unrecognized IPs', async () => {
    const oldIpReq = new NextRequest('http://localhost:3000/api/security', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '197.26.18.42',
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile/15E148 Safari/604.1',
      },
    });
    const oldIpRes = await GET(oldIpReq);
    expect(oldIpRes.status).toBe(200);
    const oldIpBody = (await oldIpRes.json()) as {
      ok: boolean;
      ip: string;
      recognized: boolean;
    };
    expect(oldIpBody.ok).toBe(true);
    expect(oldIpBody.ip).toBe('197.26.18.42');
    expect(oldIpBody.recognized).toBe(true);

    const newIpReq = new NextRequest('http://localhost:3000/api/security', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '102.159.44.12',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
      },
    });
    const newIpRes = await GET(newIpReq);
    expect(newIpRes.status).toBe(200);
    const newIpBody = (await newIpRes.json()) as {
      ok: boolean;
      ip: string;
      recognized: boolean;
    };
    expect(newIpBody.ok).toBe(true);
    expect(newIpBody.ip).toBe('102.159.44.12');
    expect(newIpBody.recognized).toBe(false);
  });

  it('POST /api/security enforces password 61854 on authorize and revokes access on delete', async () => {
    const badAuthReq = new NextRequest('http://localhost:3000/api/security', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '102.159.44.12',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
      },
      body: JSON.stringify({
        action: 'authorize',
        password: 'wrong',
        oldIps: DEFAULT_AUTHORIZED_IPS,
      }),
    });
    const badAuthRes = await POST(badAuthReq);
    expect(badAuthRes.status).toBe(401);

    const goodAuthReq = new NextRequest('http://localhost:3000/api/security', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '102.159.44.12',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
      },
      body: JSON.stringify({
        action: 'authorize',
        password: '61854',
        oldIps: DEFAULT_AUTHORIZED_IPS,
      }),
    });
    const goodAuthRes = await POST(goodAuthReq);
    expect(goodAuthRes.status).toBe(200);
    const goodAuthBody = (await goodAuthRes.json()) as {
      ok: boolean;
      recognized: boolean;
      record: { ip: string; deviceName: string };
    };
    expect(goodAuthBody.ok).toBe(true);
    expect(goodAuthBody.recognized).toBe(true);
    expect(goodAuthBody.record.ip).toBe('102.159.44.12');
    expect(goodAuthBody.record.deviceName).toBe('Windows PC • Chrome');

    // Revoking the IP prevents access immediately
    const revokeReq = new NextRequest('http://localhost:3000/api/security', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '102.159.44.12',
      },
      body: JSON.stringify({
        action: 'revoke',
        targetIp: '102.159.44.12',
      }),
    });
    const revokeRes = await POST(revokeReq);
    expect(revokeRes.status).toBe(200);
    const revokeBody = (await revokeRes.json()) as {
      ok: boolean;
      recognized: boolean;
    };
    expect(revokeBody.ok).toBe(true);
    expect(revokeBody.recognized).toBe(false);
  });

  it('registers old IPs into non-empty MongoDB and prevents cold-start resurrection of revoked IPs', async () => {
    const mongoAuthorized = new Map<string, AuthorizedIpDevice>([
      [
        'ip_102_159_44_12',
        {
          id: 'ip_102_159_44_12',
          ip: '102.159.44.12',
          deviceName: 'Windows PC • Chrome',
          os: 'Windows',
          browser: 'Chrome',
          deviceType: 'desktop',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          isInitialSignup: false,
          recognized: true,
          createdAt: 1730000000000,
          lastSeenAt: 1730000000000,
          signInCount: 1,
          updatedAt: 1730000000000,
        },
      ],
    ]);
    const mongoRevoked = new Map<string, { id: string; ip?: string; revokedAt: number }>();

    const spy = vi
      .spyOn(mongoServer, 'getMongoDatabase')
      .mockImplementation((async () => {
        return {
          collection: (name: string) => {
            if (name === 'authorizedIps') {
              return {
                find: () => ({
                  sort: () => ({
                    toArray: async () => Array.from(mongoAuthorized.values()),
                  }),
                }),
                bulkWrite: async (
                  ops: Array<{
                    updateOne?: {
                      filter: { id: string };
                      update: {
                        $set?: AuthorizedIpDevice;
                        $setOnInsert?: AuthorizedIpDevice;
                      };
                    };
                  }>
                ) => {
                  for (const op of ops) {
                    const id = op.updateOne?.filter.id;
                    if (!id) continue;
                    if (op.updateOne?.update.$set) {
                      mongoAuthorized.set(id, op.updateOne.update.$set);
                    } else if (
                      op.updateOne?.update.$setOnInsert &&
                      !mongoAuthorized.has(id)
                    ) {
                      mongoAuthorized.set(id, op.updateOne.update.$setOnInsert);
                    }
                  }
                },
                deleteMany: async (filter: {
                  id?: { $in?: string[] };
                  $or?: Array<{ id?: string; ip?: string }>;
                }) => {
                  if (filter.id?.$in) {
                    for (const id of filter.id.$in) {
                      mongoAuthorized.delete(id);
                    }
                  }
                  if (filter.$or) {
                    for (const [k, v] of Array.from(mongoAuthorized.entries())) {
                      if (
                        filter.$or.some(
                          (clause) => clause.id === k || clause.ip === v.ip
                        )
                      ) {
                        mongoAuthorized.delete(k);
                      }
                    }
                  }
                },
              };
            }
            if (name === 'revokedIps') {
              return {
                find: () => ({
                  toArray: async () => Array.from(mongoRevoked.values()),
                }),
                updateOne: async (
                  filter: { id: string },
                  update: { $set: { id: string; ip?: string; revokedAt: number } }
                ) => {
                  mongoRevoked.set(filter.id, update.$set);
                },
                deleteMany: async (filter: {
                  $or?: Array<{ id?: string; ip?: string }>;
                }) => {
                  if (filter.$or) {
                    for (const [k, v] of Array.from(mongoRevoked.entries())) {
                      if (
                        filter.$or.some(
                          (clause) => clause.id === k || clause.ip === v.ip
                        )
                      ) {
                        mongoRevoked.delete(k);
                      }
                    }
                  }
                },
              };
            }
            throw new Error(`Unexpected collection ${name}`);
          },
        } as unknown as Awaited<ReturnType<typeof mongoServer.getMongoDatabase>>;
      }) as typeof mongoServer.getMongoDatabase);

    try {
      global.__kanawitaSecurityState = undefined;
      const mongoUri = 'mongodb+srv://user:pass@cluster.mongodb.net/';

      // 1. Check with oldIps when MongoDB already has 102.159.44.12 -> must register oldIps alongside 102.159.44.12
      const checkReq = new NextRequest('http://localhost:3000/api/security', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '41.226.45.110',
        },
        body: JSON.stringify({
          action: 'check',
          oldIps: DEFAULT_AUTHORIZED_IPS,
          mongodbUri: mongoUri,
        }),
      });
      const checkRes = await POST(checkReq);
      const checkBody = (await checkRes.json()) as {
        ok: boolean;
        recognized: boolean;
        authorizedIps: AuthorizedIpDevice[];
      };
      expect(checkBody.ok).toBe(true);
      expect(checkBody.recognized).toBe(true);
      expect(mongoAuthorized.size).toBe(3);

      // 2. Revoke 41.226.45.110 in MongoDB
      const revokeReq = new NextRequest('http://localhost:3000/api/security', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '197.26.18.42',
        },
        body: JSON.stringify({
          action: 'revoke',
          targetIp: '41.226.45.110',
          mongodbUri: mongoUri,
        }),
      });
      await POST(revokeReq);
      expect(mongoAuthorized.has('ip_41_226_45_110')).toBe(false);
      expect(mongoRevoked.has('ip_41_226_45_110')).toBe(true);

      // 3. Simulate server cold start + second client sending stale oldIps containing 41.226.45.110
      global.__kanawitaSecurityState = undefined;
      const coldCheckReq = new NextRequest(
        'http://localhost:3000/api/security',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '41.226.45.110',
          },
          body: JSON.stringify({
            action: 'check',
            oldIps: DEFAULT_AUTHORIZED_IPS,
            mongodbUri: mongoUri,
          }),
        }
      );
      const coldCheckRes = await POST(coldCheckReq);
      const coldCheckBody = (await coldCheckRes.json()) as {
        ok: boolean;
        recognized: boolean;
        authorizedIps: AuthorizedIpDevice[];
      };
      expect(coldCheckBody.ok).toBe(true);
      expect(coldCheckBody.recognized).toBe(false);
      expect(mongoAuthorized.has('ip_41_226_45_110')).toBe(false);
    } finally {
      spy.mockRestore();
      global.__kanawitaSecurityState = undefined;
    }
  });
});

