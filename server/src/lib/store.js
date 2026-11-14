// Persistent storage for app data (X state + spend, posts, labels, Claude spend, knowledge, answer cache).
// - With MONGODB_URI set and reachable: MongoDB is the source of truth (collection "store", one doc per name).
// - Every save is also written to data/<name>.json, so the app keeps working offline and the files
//   stay inspectable. Without MongoDB, reads come from those files.
// - On first connect, any name missing in MongoDB is seeded from its local file (no data or spend is lost).
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { DATA, readJSON, writeJSON } from './paths.js';

export const NAMES = ['state', 'posts', 'labels', 'posts_clean', 'llm_spend', 'knowledge', 'answer_cache'];
const RETRY_MS = 30_000;

const fileOf = (name) => path.join(DATA, `${name}.json`);

let client = null;
let collection = null;
let connecting = null;
let lastFailure = 0;

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (collection) return collection;
  if (Date.now() - lastFailure < RETRY_MS) return null;
  if (!connecting) {
    connecting = (async () => {
      try {
        client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        const db = client.db(process.env.MONGODB_DB || 'kout');
        const col = db.collection('store');
        await seedFromFiles(col);
        collection = col;
        console.log(`[store] connected to MongoDB (db=${db.databaseName})`);
        return col;
      } catch (err) {
        lastFailure = Date.now();
        console.warn(`[store] MongoDB unavailable (${err.message}); using local JSON files.`);
        await client?.close().catch(() => {});
        client = null;
        return null;
      } finally {
        connecting = null;
      }
    })();
  }
  return connecting;
}

async function seedFromFiles(col) {
  const existing = new Set((await col.find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
  for (const name of NAMES) {
    if (existing.has(name) || !fs.existsSync(fileOf(name))) continue;
    const value = readJSON(fileOf(name), undefined);
    if (value === undefined) continue;
    await col.insertOne({ _id: name, value, updatedAt: new Date() });
    console.log(`[store] seeded "${name}" into MongoDB from data/${name}.json`);
  }
}

/** Read a stored value. MongoDB first (if connected), else the local file. */
export async function load(name, fallback) {
  const col = await connect();
  if (col) {
    try {
      const doc = await col.findOne({ _id: name });
      return doc ? doc.value : fallback;
    } catch (err) {
      console.warn(`[store] read "${name}" from MongoDB failed (${err.message}); using local file.`);
    }
  }
  return readJSON(fileOf(name), fallback);
}

/** Save a value to the local file and, if connected, to MongoDB. */
export async function save(name, value) {
  writeJSON(fileOf(name), value);
  const col = await connect();
  if (!col) return;
  try {
    await col.updateOne({ _id: name }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
  } catch (err) {
    console.warn(`[store] write "${name}" to MongoDB failed (${err.message}); saved to local file only.`);
  }
}

export async function storeStatus() {
  if (!process.env.MONGODB_URI) return { backend: 'files', detail: 'MONGODB_URI not set' };
  const col = await connect();
  return col ? { backend: 'mongodb', detail: client.db().databaseName } : { backend: 'files', detail: 'MongoDB unreachable' };
}

/** Close the connection so CLI scripts can exit. */
export async function closeStore() {
  await client?.close().catch(() => {});
  client = null;
  collection = null;
}
