import admin from 'firebase-admin';

function getDb() {
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  }
  return admin.database();
}

// GET /api/data?limit=500&from=<epoch_ms>&to=<epoch_ms>
// Key tiap data = timestamp (13 digit), sehingga bisa difilter lewat key tanpa index tambahan.
export default async function handler(req, res) {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const from = Number(req.query.from) || 0;
    const to = Number(req.query.to) || 0;

    let q = db.ref('readings').orderByKey();
    if (from) q = q.startAt(String(from));
    if (to) q = q.endAt(String(to));
    const snap = await q.limitToLast(limit).once('value');

    const data = [];
    snap.forEach(child => {
      const v = child.val();
      data.push({ ts: v.ts, temp: v.temp ?? null, hum: v.hum ?? null, wind: v.wind ?? null });
    });
    data.reverse(); // terbaru dulu

    const metaSnap = await db.ref('meta/collector').once('value');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, count: data.length, meta: metaSnap.val(), data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
