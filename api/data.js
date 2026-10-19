import admin from 'firebase-admin';

function getDb() {
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin.firestore();
}

// GET /api/data?limit=500&from=<epoch_ms>&to=<epoch_ms>
export default async function handler(req, res) {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const from = Number(req.query.from) || 0;
    const to = Number(req.query.to) || 0;

    let q = db.collection('readings').orderBy('ts', 'desc');
    if (from) q = q.where('ts', '>=', from);
    if (to) q = q.where('ts', '<=', to);
    const snap = await q.limit(limit).get();

    const data = snap.docs.map(d => {
      const v = d.data();
      return { ts: v.ts, temp: v.temp, hum: v.hum, wind: v.wind };
    });

    const metaDoc = await db.collection('meta').doc('collector').get();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, count: data.length, meta: metaDoc.exists ? metaDoc.data() : null, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
