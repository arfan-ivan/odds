import admin from 'firebase-admin';
import crypto from 'node:crypto';

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

function samePassword(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// POST /api/delete
// Header : x-admin-password: <ADMIN_PASSWORD>
// Body   : { "ts": 1760000000000 }   -> hapus satu data
//          { "all": true }           -> hapus semua data rekaman
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'gunakan POST' });

  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD belum diatur di Vercel' });
  if (!samePassword(req.headers['x-admin-password'] || '', adminPw)) {
    return res.status(401).json({ ok: false, error: 'Password admin salah' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const db = getDb();

    if (body.all === true) {
      await db.ref('readings').remove();
      return res.status(200).json({ ok: true, deleted: 'all' });
    }

    const ts = String(body.ts || '');
    if (!/^\d{10,15}$/.test(ts)) return res.status(400).json({ ok: false, error: 'ts tidak valid' });
    await db.ref('readings/' + ts).remove();
    return res.status(200).json({ ok: true, deleted: ts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
