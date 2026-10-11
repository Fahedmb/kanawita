import { NextRequest, NextResponse } from 'next/server';
import {
  AuthorizedIpDevice,
  DEFAULT_AUTHORIZED_IPS,
} from '@/domain/models';
import {
  ipToDocumentId,
   isIpAuthorized,
  normalizeIpAddress,
  parseDeviceFromUserAgent,
  verifySecurityPassword,
} from '@/domain/securityEngine';
import { getMongoDatabase, isValidMongoUri } from '@/data/mongoServer';

interface ServerSecurityMemoryState {
  authorizedMap: Map<string, AuthorizedIpDevice>;
  revokedIds: Set<string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __kanawitaSecurityState: ServerSecurityMemoryState | undefined;
}

const getMemorySecurityState = (): ServerSecurityMemoryState => {
  if (!global.__kanawitaSecurityState) {
    const map = new Map<string, AuthorizedIpDevice>();
    for (const seed of DEFAULT_AUTHORIZED_IPS) {
      map.set(seed.id, { ...seed });
    }
    global.__kanawitaSecurityState = {
      authorizedMap: map,
      revokedIds: new Set<string>(),
    };
  }
  return global.__kanawitaSecurityState;
};

const extractClientIp = (
  request: NextRequest,
  simulatedIp?: string
): string => {
  const sim =
    simulatedIp?.trim() ||
    request.headers.get('x-kanawita-simulated-ip')?.trim();
  if (sim) {
    return normalizeIpAddress(sim);
  }

  const forwarded =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    '127.0.0.1';

  return normalizeIpAddress(forwarded);
};

/**
 * GET /api/security
 * Detects the client's current IP address and User-Agent device details,
 * and checks whether the IP is recognized in MongoDB (or fallback server memory).
 */
export async function GET(request: NextRequest) {
  const simulatedIp =
    request.nextUrl.searchParams.get('simulatedIp') || undefined;
  const ip = extractClientIp(request, simulatedIp);
  const userAgent = request.headers.get('user-agent') || '';
  const device = parseDeviceFromUserAgent(userAgent);

  const envUri = process.env.MONGODB_URI?.trim() || '';
  const dbName = process.env.MONGODB_DB_NAME?.trim() || 'kanawita';
  const configured = isValidMongoUri(envUri);

  const mem = getMemorySecurityState();
  let authorizedIps = Array.from(mem.authorizedMap.values());

  if (configured) {
    try {
      const db = await getMongoDatabase(envUri, dbName);
      const col = db.collection<AuthorizedIpDevice>('authorizedIps');
      const revokedCol = db.collection<{ id: string; ip?: string; revokedAt?: number }>(
        'revokedIps'
      );
      const [docs, revokedDocs] = await Promise.all([
        col.find({}, { projection: { _id: 0 } }).sort({ lastSeenAt: -1 }).toArray(),
        revokedCol.find({}, { projection: { _id: 0 } }).toArray(),
      ]);
      for (const rev of revokedDocs) {
        if (rev?.id) {
          mem.revokedIds.add(rev.id);
          mem.authorizedMap.delete(rev.id);
        }
      }
      if (docs.length > 0 || mem.revokedIds.size > 0) {
        authorizedIps = docs.filter((d) => !mem.revokedIds.has(d.id));
      }
    } catch {
      // Fallback to memory state if MongoDB is temporarily unreachable
    }
  }

  const recognized = isIpAuthorized(ip, authorizedIps);

  return NextResponse.json(
    {
      ok: true,
      ip,
      userAgent,
      device,
      configured,
      recognized,
      authorizedIps,
    },
    { status: 200 }
  );
}

interface SecurityPostBody {
  action?: 'check' | 'authorize' | 'revoke';
  password?: string;
  targetIp?: string;
  simulatedIp?: string;
  oldIps?: AuthorizedIpDevice[];
  revokedIpIds?: string[];
  mongodbUri?: string;
  mongodbDbName?: string;
}

/**
 * POST /api/security
 * - `check`: Detects client IP & device, registers any non-revoked old IPs in MongoDB, and returns whether IP is recognized.
 * - `authorize`: Verifies password (`61854`), registers old IPs + current IP & device in MongoDB `authorizedIps`.
 * - `revoke`: Deletes the specified IP from MongoDB `authorizedIps` and records it in `revokedIps` so that IP can no longer access the app.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SecurityPostBody;
    const action = body.action ?? 'check';
    const ip = extractClientIp(request, body.simulatedIp);
    const userAgent = request.headers.get('user-agent') || '';
    const device = parseDeviceFromUserAgent(userAgent);
    const now = Date.now();

    const clientUri = body.mongodbUri?.trim() || '';
    const envUri = process.env.MONGODB_URI?.trim() || '';
    const effectiveUri = clientUri || envUri;
    const effectiveDbName =
      body.mongodbDbName?.trim() ||
      process.env.MONGODB_DB_NAME?.trim() ||
      'kanawita';
    const mongoConfigured = isValidMongoUri(effectiveUri);

    const mem = getMemorySecurityState();

    // Apply any explicit client-side pending revocations first
    if (Array.isArray(body.revokedIpIds)) {
      for (const rawRevoked of body.revokedIpIds) {
        if (!rawRevoked || typeof rawRevoked !== 'string') continue;
        const revId = rawRevoked.startsWith('ip_')
          ? rawRevoked
          : ipToDocumentId(rawRevoked);
        mem.authorizedMap.delete(revId);
        mem.revokedIds.add(revId);
      }
    }

    // Load persisted revocations from MongoDB before merging oldIps so cold-starts never resurrect revoked IPs
    if (mongoConfigured) {
      try {
        const db = await getMongoDatabase(effectiveUri, effectiveDbName);
        const revokedCol = db.collection<{
          id: string;
          ip?: string;
          revokedAt?: number;
        }>('revokedIps');
        const persistedRevoked = await revokedCol
          .find({}, { projection: { _id: 0 } })
          .toArray();
        for (const rev of persistedRevoked) {
          if (rev?.id) {
            mem.revokedIds.add(rev.id);
            mem.authorizedMap.delete(rev.id);
          }
        }
      } catch {
        // Fallback to memory state if MongoDB is temporarily unreachable
      }
    }

    // Sync any non-revoked old IPs into server memory, and mark any omitted default seed IPs as revoked
    if (Array.isArray(body.oldIps)) {
      const clientOldIds = new Set(
        body.oldIps
          .filter((o): o is AuthorizedIpDevice => Boolean(o && o.ip))
          .map((o) => ipToDocumentId(o.ip))
      );

      for (const seed of DEFAULT_AUTHORIZED_IPS) {
        if (!clientOldIds.has(seed.id)) {
          mem.authorizedMap.delete(seed.id);
          mem.revokedIds.add(seed.id);
        }
      }

      for (const oldIp of body.oldIps) {
        if (oldIp && oldIp.ip && !mem.revokedIds.has(oldIp.id)) {
          const normId = ipToDocumentId(oldIp.ip);
          if (!mem.revokedIds.has(normId) && !mem.authorizedMap.has(normId)) {
            mem.authorizedMap.set(normId, {
              ...oldIp,
              id: normId,
              ip: normalizeIpAddress(oldIp.ip),
            });
          }
        }
      }
    }

    if (action === 'authorize') {
      if (!verifySecurityPassword(body.password)) {
        return NextResponse.json(
          {
            ok: false,
            ip,
            device,
            recognized: false,
            error: 'INVALID_PASSWORD',
            message: 'Invalid security password. Access denied.',
          },
          { status: 401 }
        );
      }

      const docId = ipToDocumentId(ip);
      const existing = mem.authorizedMap.get(docId);
      const hasInitial = Array.from(mem.authorizedMap.values()).some(
        (d) => d.isInitialSignup
      );

      const record: AuthorizedIpDevice = {
        id: docId,
        ip,
        deviceName: device.deviceName,
        os: device.os,
        browser: device.browser,
        deviceType: device.deviceType,
        userAgent,
        locationHint:
          existing?.locationHint ??
          (ip === '127.0.0.1'
            ? 'Localhost • Direct Device'
            : 'Verified IP Session'),
        isInitialSignup: existing?.isInitialSignup ?? !hasInitial,
        recognized: true,
        createdAt: existing?.createdAt ?? now,
        lastSeenAt: now,
        signInCount: (existing?.signInCount ?? 0) + 1,
        updatedAt: now,
      };

      mem.revokedIds.delete(docId);
      mem.authorizedMap.set(docId, record);

      if (mongoConfigured) {
        try {
          const db = await getMongoDatabase(effectiveUri, effectiveDbName);
          const col = db.collection<AuthorizedIpDevice>('authorizedIps');
          const revokedCol = db.collection<{
            id: string;
            ip?: string;
            revokedAt?: number;
          }>('revokedIps');

          await revokedCol.deleteMany({
            $or: [{ id: docId }, { ip }],
          });

          // Register old IPs ($setOnInsert) + newly authorized IP ($set) in MongoDB
          const allToUpsert = Array.from(mem.authorizedMap.values());
          if (allToUpsert.length > 0) {
            await col.bulkWrite(
              allToUpsert.map((item) =>
                item.id === docId
                  ? {
                      updateOne: {
                        filter: { id: item.id },
                        update: { $set: item },
                        upsert: true,
                      },
                    }
                  : {
                      updateOne: {
                        filter: { id: item.id },
                        update: { $setOnInsert: item },
                        upsert: true,
                      },
                    }
              ),
              { ordered: false }
            );
          }

          const remoteDocs = await col
            .find({}, { projection: { _id: 0 } })
            .sort({ lastSeenAt: -1 })
            .toArray();
          if (remoteDocs.length > 0) {
            mem.authorizedMap.clear();
            for (const doc of remoteDocs) {
              if (!mem.revokedIds.has(doc.id)) {
                mem.authorizedMap.set(doc.id, doc);
              }
            }
          }
        } catch {
          // Local & memory state still succeeds if MongoDB is unreachable
        }
      }

      return NextResponse.json(
        {
          ok: true,
          ip,
          userAgent,
          device,
          configured: mongoConfigured,
          recognized: true,
          record,
          authorizedIps: Array.from(mem.authorizedMap.values()),
        },
        { status: 200 }
      );
    }

    if (action === 'revoke') {
      const targetIp = normalizeIpAddress(body.targetIp || ip);
      const docId = ipToDocumentId(targetIp);

      mem.authorizedMap.delete(docId);
      mem.revokedIds.add(docId);
      for (const [k, v] of Array.from(mem.authorizedMap.entries())) {
        if (normalizeIpAddress(v.ip) === targetIp || k === body.targetIp) {
          mem.authorizedMap.delete(k);
          mem.revokedIds.add(k);
        }
      }

      if (mongoConfigured) {
        try {
          const db = await getMongoDatabase(effectiveUri, effectiveDbName);
          const col = db.collection<AuthorizedIpDevice>('authorizedIps');
          const revokedCol = db.collection<{
            id: string;
            ip: string;
            revokedAt: number;
          }>('revokedIps');
          await Promise.all([
            col.deleteMany({
              $or: [{ id: docId }, { ip: targetIp }],
            }),
            revokedCol.updateOne(
              { id: docId },
              { $set: { id: docId, ip: targetIp, revokedAt: now } },
              { upsert: true }
            ),
          ]);
        } catch {
          // Ignore transient network errors; outbox will also flush delete
        }
      }

      const authorizedIps = Array.from(mem.authorizedMap.values());
      return NextResponse.json(
        {
          ok: true,
          ip,
          revokedIp: targetIp,
          recognized: isIpAuthorized(ip, authorizedIps),
          authorizedIps,
        },
        { status: 200 }
      );
    }

    // Default: action === 'check'
    if (mongoConfigured) {
      try {
        const db = await getMongoDatabase(effectiveUri, effectiveDbName);
        const col = db.collection<AuthorizedIpDevice>('authorizedIps');
        const revokedCol = db.collection<{
          id: string;
          ip?: string;
          revokedAt: number;
        }>('revokedIps');

        if (Array.isArray(body.revokedIpIds) && body.revokedIpIds.length > 0) {
          const cleanRevokedIds = body.revokedIpIds
            .filter((r): r is string => Boolean(r && typeof r === 'string'))
            .map((r) => (r.startsWith('ip_') ? r : ipToDocumentId(r)));
          if (cleanRevokedIds.length > 0) {
            await Promise.all([
              col.deleteMany({ id: { $in: cleanRevokedIds } }),
              revokedCol.bulkWrite(
                cleanRevokedIds.map((rid) => ({
                  updateOne: {
                    filter: { id: rid },
                    update: { $set: { id: rid, revokedAt: now } },
                    upsert: true,
                  },
                })),
                { ordered: false }
              ),
            ]);
          }
        }

        // Register any non-revoked old IPs in MongoDB via $setOnInsert (even when MongoDB already has other IPs)
        if (Array.isArray(body.oldIps) && body.oldIps.length > 0) {
          const nonRevokedOld = body.oldIps.filter(
            (o) =>
              o &&
              o.ip &&
              !mem.revokedIds.has(o.id) &&
              !mem.revokedIds.has(ipToDocumentId(o.ip))
          );
          if (nonRevokedOld.length > 0) {
            await col.bulkWrite(
              nonRevokedOld.map((item) => {
                const normId = ipToDocumentId(item.ip);
                const normalizedItem: AuthorizedIpDevice = {
                  ...item,
                  id: normId,
                  ip: normalizeIpAddress(item.ip),
                };
                return {
                  updateOne: {
                    filter: { id: normId },
                    update: { $setOnInsert: normalizedItem },
                    upsert: true,
                  },
                };
              }),
              { ordered: false }
            );
          }
        }

        const remoteDocs = await col
          .find({}, { projection: { _id: 0 } })
          .sort({ lastSeenAt: -1 })
          .toArray();

        if (
          remoteDocs.length > 0 ||
          mem.revokedIds.size > 0 ||
          Array.isArray(body.oldIps)
        ) {
          mem.authorizedMap.clear();
          for (const doc of remoteDocs) {
            if (!mem.revokedIds.has(doc.id)) {
              mem.authorizedMap.set(doc.id, doc);
            }
          }
        }
      } catch {
        // Fallback to memory state
      }
    }

    const authorizedIps = Array.from(mem.authorizedMap.values());
    const recognized = isIpAuthorized(ip, authorizedIps);

    return NextResponse.json(
      {
        ok: true,
        ip,
        userAgent,
        device,
        configured: mongoConfigured,
        recognized,
        authorizedIps,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SECURITY_API_ERROR',
        message: err instanceof Error ? err.message : 'Security check failed',
      },
      { status: 500 }
    );
  }
}
