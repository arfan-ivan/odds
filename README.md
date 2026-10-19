# ODDS Sensor Logger (Vercel + Firebase)

Merekam data **realtime** dari HiveMQ (`odds/sensor/realtime`) ke **Firebase Firestore**
secara otomatis, tanpa perlu membuka web. Dashboard hanya untuk melihat hasil rekaman.

```
ESP32 -> HiveMQ -> /api/collect (dipanggil tiap menit) -> Firestore -> dashboard (/)
```

## Struktur
- `api/collect.js` : subscribe MQTT ~50 detik, simpan 1 data tiap 30 detik ke Firestore
- `api/data.js`    : membaca data dari Firestore untuk dashboard
- `public/index.html` : dashboard (grafik, statistik, tabel, export CSV)
- `vercel.json`, `package.json`, `.env.example`

## Langkah 1 - Firebase
1. Buka https://console.firebase.google.com -> buat project.
2. **Build -> Firestore Database -> Create database** (mode production).
3. **Project settings -> Service accounts -> Generate new private key** -> unduh file JSON.
4. Buka file JSON itu, salin **seluruh isinya jadi satu baris** (untuk env `FIREBASE_SERVICE_ACCOUNT`).
5. Aturan Firestore biarkan terkunci (default). Server memakai service account sehingga tidak terpengaruh.
6. Saat dashboard pertama kali meminta query dengan filter `ts` + urutan, Firestore tidak butuh index tambahan (satu field).

## Langkah 2 - Deploy ke Vercel
1. Upload folder ini ke repo GitHub (jangan upload file `.env` asli).
2. Di Vercel: **Add New -> Project** -> pilih repo -> Deploy.
3. **Settings -> Environment Variables**, isi semua variabel dari `.env.example`:
   - `MQTT_BROKER`, `MQTT_USERNAME`, `MQTT_PASSWORD` (user HiveMQ)
   - `CRON_SECRET` (kata sandi acak buatan Anda)
   - `FIREBASE_SERVICE_ACCOUNT` (JSON satu baris)
4. **Redeploy** agar variabel terbaca.

## Langkah 3 - Otomatisasi (agar tetap merekam saat web tidak dibuka)
Cron bawaan Vercel paket **Hobby hanya 1x per hari**, jadi gunakan layanan gratis **cron-job.org**:

1. Daftar di https://cron-job.org -> **Create cronjob**.
2. URL: `https://NAMA-PROJECT.vercel.app/api/collect?key=ISI_CRON_SECRET`
3. Jadwal: **setiap 1 menit**.
4. Di **Advanced**, atur **Request timeout = 60 detik** (default 30 detik akan memutus proses).
5. Simpan dan aktifkan.

Setiap panggilan mendengarkan MQTT ~50 detik lalu menyimpan data, sehingga rekaman nyaris tanpa celah
(1 data tiap 30 detik, bisa diubah lewat `SAVE_INTERVAL_SECONDS`).

Cek manual: buka URL `/api/collect?key=...` di browser, hasilnya mirip `{"ok":true,"received":25,"saved":2}`.

## Catatan
- Jika `received` = 0, berarti ESP32 sedang offline atau topik/kredensial MQTT salah.
- Timestamp memakai waktu server (epoch ms) sehingga tidak bergantung jam ESP32.
- Penyimpanan 1 data/30 detik ~ 2.880 dokumen/hari. Free tier Firestore (20 ribu tulis/hari) cukup.
- Kredensial HiveMQ sebelumnya tertulis di HTML ESP32 (`Odds1234`). Sebaiknya buat user HiveMQ baru khusus
  untuk logger ini dan ganti password lama.
# odds
