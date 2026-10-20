import mqtt from 'mqtt';
import admin from 'firebase-admin';
import { waitUntil } from '@vercel/functions';

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

// Mendengarkan MQTT selama COLLECT_SECONDS, lalu menyimpan hasilnya ke Firebase.
async function collect() {
  const BROKER = process.env.MQTT_BROKER;
  const TOPIC = process.env.MQTT_TOPIC_REALTIME || 'odds/sensor/realtime';
  const windowMs = Number(process.env.COLLECT_SECONDS || 50) * 1000;
  const saveEveryMs = Number(process.env.SAVE_INTERVAL_SECONDS || 30) * 1000;

  const records = [];
  let received = 0;
  let retainedSkipped = 0;
  let lastSaved = 0;
  let sensorStatus = null;

  try {
    await new Promise((resolve, reject) => {
      const client = mqtt.connect(`mqtts://${BROKER}:8883`, {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clientId: 'odds-vercel-' + Math.random().toString(36).slice(2, 10),
        reconnectPeriod: 0,
        connectTimeout: 10000,
        clean: true
      });

      const timer = setTimeout(() => client.end(true, () => resolve()), windowMs);

      client.on('connect', () => {
        client.subscribe([TOPIC, 'odds/sensor/status'], { qos: 0 });
      });

      client.on('message', (topic, buf, packet) => {
        let d;
        try { d = JSON.parse(buf.toString()); } catch { return; }

        if (topic === 'odds/sensor/status') {
          sensorStatus = d.status || null;
          return;
        }

        // Pesan "retained" = salinan lama yang disimpan broker, bukan data baru dari sensor.
        if (packet && packet.retain) { retainedSkipped++; return; }

        received++;
        const now = Date.now();
        if (now - lastSaved < saveEveryMs) return;

        const temp = parseFloat(d.temp);
        const hum = parseFloat(d.hum);
        const wind = parseFloat(d.wind);
        if (isNaN(temp) && isNaN(hum) && isNaN(wind)) return;

        lastSaved = now;
        records.push({
          ts: now,
          temp: isNaN(temp) ? null : temp,
          hum: isNaN(hum) ? null : hum,
          wind: isNaN(wind) ? null : wind
        });
      });

      client.on('error', (err) => {
        clearTimeout(timer);
        client.end(true);
        reject(err);
      });
    });

    const db = getDb();
    const updates = {};
    for (const r of records) updates['readings/' + r.ts] = r;
    updates['meta/collector'] = {
      lastRun: Date.now(),
      received,
      retainedSkipped,
      saved: records.length,
      sensorStatus
    };
    await db.ref().update(updates);

    return { ok: true, received, retainedSkipped, saved: records.length, sensorStatus };
  } catch (err) {
    console.error(err);
    try {
      await getDb().ref('meta/collector').update({ lastRun: Date.now(), lastError: String(err.message || err) });
    } catch { /* abaikan */ }
    return { ok: false, error: String(err.message || err) };
  }
}

export default async function handler(req, res) {
  // --- Autentikasi sederhana ---
  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const key = req.query.key || bearer;
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Uji manual: tambahkan &wait=1 untuk menunggu dan melihat hasil lengkap (~50 detik).
  if (req.query.wait) {
    const result = await collect();
    return res.status(result.ok ? 200 : 500).json(result);
  }

  // Panggilan cron: balas langsung (di bawah batas 30 detik cron-job.org),
  // pekerjaan perekaman tetap berjalan di latar belakang.
  waitUntil(collect());
  return res.status(202).json({ ok: true, started: true });
}