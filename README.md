# ODDS Sensor Logger (Vercel + Firebase)

Merekam data **realtime** dari HiveMQ (`odds/sensor/realtime`) ke **Firebase Realtime Database**
secara otomatis, tanpa perlu membuka web. Dashboard hanya untuk melihat hasil rekaman.

```
ESP32 -> HiveMQ -> /api/collect (dipanggil tiap menit) -> Realtime Database -> dashboard (/)
```

## Struktur
- `api/collect.js` : subscribe MQTT ~50 detik, simpan 1 data tiap 30 detik ke Realtime Database
- `api/delete.js`  : hapus satu data / semua data (butuh `ADMIN_PASSWORD`)
- `api/data.js`    : membaca data dari Realtime Database untuk dashboard
- `public/index.html` : dashboard (grafik, statistik, tabel, export CSV)
- `vercel.json`, `package.json`, `.env.example`

## Langkah 1 - Firebase (Realtime Database)
1. Buka https://console.firebase.google.com -> pilih project Anda.
2. **Build -> Realtime Database** (sudah Anda buat). Salin URL database di bagian atas halaman data,
   misalnya `https://nama-project-default-rtdb.firebaseio.com` -> isi ke `FIREBASE_DATABASE_URL`.
3. **Project settings -> Service accounts -> Generate new private key** -> unduh file JSON.
4. Salin **seluruh isi JSON jadi satu baris** (untuk env `FIREBASE_SERVICE_ACCOUNT`).
5. Rules database biarkan terkunci (`".read": false, ".write": false`). Server memakai service account,
   jadi tetap bisa menulis dan membaca.

Data tersimpan di `readings/<timestamp_ms>` dan status perekam di `meta/collector`.

## Langkah 2 - Deploy ke Vercel
1. Upload folder ini ke repo GitHub (jangan upload file `.env` asli).
2. Di Vercel: **Add New -> Project** -> pilih repo -> Deploy.
3. **Settings -> Environment Variables**, isi semua variabel dari `.env.example`:
   - `MQTT_BROKER`, `MQTT_USERNAME`, `MQTT_PASSWORD` (user HiveMQ)
   - `CRON_SECRET` (kata sandi acak buatan Anda)
   - `ADMIN_PASSWORD` (password untuk tombol Hapus di dashboard)
   - `FIREBASE_DATABASE_URL` (URL Realtime Database)
   - `FIREBASE_SERVICE_ACCOUNT` (JSON satu baris)
4. **Redeploy** agar variabel terbaca.

## Langkah 3 - Otomatisasi (agar tetap merekam saat web tidak dibuka)
Cron bawaan Vercel paket **Hobby hanya 1x per hari**, jadi gunakan layanan gratis **cron-job.org**:

1. Daftar di https://cron-job.org -> **Create cronjob**.
2. URL: `https://NAMA-PROJECT.vercel.app/api/collect?key=ISI_CRON_SECRET`
3. Jadwal: **setiap 1 menit**.
4. Di **Advanced**, biarkan **Request timeout = 30 detik** (batas maksimum akun gratis). Tidak masalah: endpoint membalas langsung, perekaman berjalan di latar belakang.
5. Simpan dan aktifkan.

Setiap panggilan mendengarkan MQTT ~50 detik lalu menyimpan data, sehingga rekaman nyaris tanpa celah
(1 data tiap 30 detik, bisa diubah lewat `SAVE_INTERVAL_SECONDS`).

Cek manual: buka `/api/collect?key=...&wait=1` di browser, tunggu ~50 detik, hasilnya mirip `{"ok":true,"received":25,"saved":2}`.
Tanpa `&wait=1`, endpoint hanya membalas `{"ok":true,"started":true}` (ini yang dipakai cron).

## Catatan
- Jika `received` = 0, berarti ESP32 sedang offline atau topik/kredensial MQTT salah.
- Timestamp memakai waktu server (epoch ms) sehingga tidak bergantung jam ESP32.
- 1 data/30 detik ~ 2.880 data/hari (~250 KB/hari). Free tier Realtime Database (1 GB) cukup untuk beberapa tahun.
- Kredensial HiveMQ sebelumnya tertulis di HTML ESP32 (`Odds1234`). Sebaiknya buat user HiveMQ baru khusus
  untuk logger ini dan ganti password lama.
