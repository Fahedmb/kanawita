import { MongoClient, type Db } from 'mongodb';

interface CachedConnection {
  uri: string;
  dbName: string;
  client: MongoClient;
  db: Db;
}

declare global {
  // eslint-disable-next-line no-var
  var __kanawitaMongoCache: CachedConnection | undefined;
}

export const isValidMongoUri = (uri: string): boolean => {
  const trimmed = uri.trim();
  return (
    trimmed.startsWith('mongodb://') || trimmed.startsWith('mongodb+srv://')
  );
};

export const getMongoDatabase = async (
  uri: string,
  dbName: string
): Promise<Db> => {
  const cached = global.__kanawitaMongoCache;
  if (cached && cached.uri === uri && cached.dbName === dbName) {
    return cached.db;
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(dbName);

  global.__kanawitaMongoCache = {
    uri,
    dbName,
    client,
    db,
  };

  return db;
};
