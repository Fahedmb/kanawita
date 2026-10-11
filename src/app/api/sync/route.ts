import { NextRequest, NextResponse } from 'next/server';
import type { SyncCollectionName, SyncOutboxItem } from '@/domain/models';
import { getMongoDatabase, isValidMongoUri } from '@/data/mongoServer';

const ALLOWED_COLLECTIONS: SyncCollectionName[] = [
  'vaults',
  'categories',
  'friends',
  'transactions',
  'settings',
  'authorizedIps',
];

/**
 * GET /api/sync
 * Returns whether server-side MONGODB_URI is configured in `.env`.
 */
export async function GET() {
  const envUri = process.env.MONGODB_URI?.trim() || '';
  const configured = isValidMongoUri(envUri);

  return NextResponse.json(
    {
      ok: true,
      configured,
      source: configured ? 'env' : 'none',
      serverTime: Date.now(),
    },
    { status: 200 }
  );
}

interface SyncPostRequestBody {
  mongodbUri?: string;
  mongodbDbName?: string;
  outbox?: SyncOutboxItem[];
  pullCollections?: boolean;
}

/**
 * POST /api/sync
 * Flushes the phone's `syncOutbox` queue into MongoDB Atlas and returns
 * the latest remote collections for Last-Write-Wins reconciliation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SyncPostRequestBody;

    const clientUri = body.mongodbUri?.trim() || '';
    const envUri = process.env.MONGODB_URI?.trim() || '';
    const effectiveUri = clientUri || envUri;
    const effectiveDbName =
      body.mongodbDbName?.trim() ||
      process.env.MONGODB_DB_NAME?.trim() ||
      'kanawita';

    if (!effectiveUri) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          error: 'MONGODB_URI_MISSING',
          message:
            'No MONGODB_URI configured yet. App continues 100% offline on phone.',
        },
        { status: 200 }
      );
    }

    if (!isValidMongoUri(effectiveUri)) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          error: 'INVALID_MONGODB_URI',
          message:
            'MongoDB URI must start with mongodb:// or mongodb+srv://',
        },
        { status: 400 }
      );
    }

    const db = await getMongoDatabase(effectiveUri, effectiveDbName);
    const outbox = Array.isArray(body.outbox) ? body.outbox : [];

    // Group outbox operations by collection
    const grouped = new Map<SyncCollectionName, SyncOutboxItem[]>();
    for (const item of outbox) {
      if (!item || !ALLOWED_COLLECTIONS.includes(item.collection)) continue;
      if (!item.documentId) continue;
      const list = grouped.get(item.collection) ?? [];
      list.push(item);
      grouped.set(item.collection, list);
    }

    let flushedCount = 0;

    for (const [collectionName, items] of Array.from(grouped.entries())) {
      const col = db.collection<Record<string, unknown>>(collectionName);
      const ops = items.map((item: SyncOutboxItem) => {
        if (item.action === 'delete') {
          return {
            deleteOne: {
              filter: { id: item.documentId },
            },
          };
        }

        const payloadObj =
          item.payload && typeof item.payload === 'object'
            ? (item.payload as Record<string, unknown>)
            : { id: item.documentId };

        const cleanPayload = { ...payloadObj, id: item.documentId };
        delete (cleanPayload as { _id?: unknown })._id;

        return {
          updateOne: {
            filter: { id: item.documentId },
            update: { $set: cleanPayload },
            upsert: true,
          },
        };
      });

      if (ops.length > 0) {
        await col.bulkWrite(ops, { ordered: false });
        flushedCount += ops.length;
      }

      if (collectionName === 'authorizedIps') {
        const revokedCol = db.collection<Record<string, unknown>>('revokedIps');
        const revokedOps = items.map((item: SyncOutboxItem) => {
          if (item.action === 'delete') {
            global.__kanawitaSecurityState?.authorizedMap.delete(item.documentId);
            global.__kanawitaSecurityState?.revokedIds.add(item.documentId);
            return {
              updateOne: {
                filter: { id: item.documentId },
                update: {
                  $set: { id: item.documentId, revokedAt: Date.now() },
                },
                upsert: true,
              },
            };
          }
          global.__kanawitaSecurityState?.revokedIds.delete(item.documentId);
          return {
            deleteOne: {
              filter: { id: item.documentId },
            },
          };
        });
        if (revokedOps.length > 0) {
          await revokedCol.bulkWrite(revokedOps, { ordered: false });
        }
      }
    }

    let remoteData: Record<string, unknown[]> | undefined;
    if (body.pullCollections !== false) {
      const [vaults, categories, friends, transactions, authorizedIps] =
        await Promise.all([
          db
            .collection('vaults')
            .find({}, { projection: { _id: 0 } })
            .toArray(),
          db
            .collection('categories')
            .find({}, { projection: { _id: 0 } })
            .toArray(),
          db
            .collection('friends')
            .find({}, { projection: { _id: 0 } })
            .toArray(),
          db
            .collection('transactions')
            .find({}, { projection: { _id: 0 } })
            .sort({ timestamp: -1 })
            .limit(2000)
            .toArray(),
          db
            .collection('authorizedIps')
            .find({}, { projection: { _id: 0 } })
            .sort({ lastSeenAt: -1 })
            .toArray(),
        ]);

      remoteData = {
        vaults,
        categories,
        friends,
        transactions,
        authorizedIps,
      };
    }

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        flushedCount,
        serverTime: Date.now(),
        remoteData,
      },
      { status: 200 }
    );
  } catch (err) {
    const safeMessage =
      err instanceof Error
        ? err.message.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, 'mongodb://***')
        : 'Failed to connect to MongoDB Atlas';

    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: 'MONGO_SYNC_ERROR',
        message: safeMessage,
      },
      { status: 502 }
    );
  }
}
