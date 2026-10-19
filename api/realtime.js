import mqtt from 'mqtt';

// GET /api/realtime
// Menyambung ke HiveMQ, menunggu 1 pesan realtime (maks 8 detik), lalu mengembalikannya.
// Kredensial MQTT tetap di server, tidak terlihat di browser.
export default async function handler(req, res) {
  const TOPIC = process.env.MQTT_TOPIC_REALTIME || 'odds/sensor/realtime';
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await new Promise((resolve, reject) => {
      const client = mqtt.connect(`mqtts://${process.env.MQTT_BROKER}:8883`, {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clientId: 'odds-rt-' + Math.random().toString(36).slice(2, 10),
        reconnectPeriod: 0,
        connectTimeout: 6000,
        clean: true
      });

      let done = false;
      const finish = (fn, val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        client.end(true);
        fn(val);
      };
      const timer = setTimeout(() => finish(resolve, null), 8000);

      client.on('connect', () => client.subscribe(TOPIC, { qos: 0 }));
      client.on('message', (_t, buf) => {
        try {
          const d = JSON.parse(buf.toString());
          finish(resolve, { temp: parseFloat(d.temp), hum: parseFloat(d.hum), wind: parseFloat(d.wind) });
        } catch { /* abaikan pesan rusak, tunggu berikutnya */ }
      });
      client.on('error', err => finish(reject, err));
    });

    if (!result) return res.status(200).json({ ok: true, data: null, note: 'Tidak ada pesan realtime dalam 8 detik (sensor offline?)' });
    return res.status(200).json({ ok: true, data: result, ts: Date.now() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
