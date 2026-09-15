# Panduan Publikasi EduSky

## 1. Siapkan Supabase

Jalankan file berikut melalui Supabase SQL Editor sesuai urutan:

1. `supabase/pengaturan_aplikasi_setup.sql`
2. `supabase/akunsiswa_setup.sql`
3. `supabase/kelas_siswa_setup.sql`
4. `supabase/modul_setup.sql`
5. `supabase/tugas_setup.sql`
6. `supabase/profil_setup.sql`
7. `supabase/laporan_siswa_setup.sql`
8. `supabase/game_edukasi_setup.sql`

Setelah itu jalankan `supabase/hosting_readiness_check.sql`. Semua komponen wajib seharusnya berstatus `OK`.

Sebelum deploy, ganti password admin awal `Admin123` menggunakan perintah yang disediakan di bagian bawah `pengaturan_aplikasi_setup.sql`.

## 2. Buat paket static

```bash
bash scripts/build-static.sh
```

Folder hasil: `dist/`.

Periksa secara lokal melalui server HTTP statis, lalu buka alamat yang ditampilkan:

```bash
npx serve dist
```

Uji minimal:

- login admin dan siswa;
- tambah kelas dan siswa;
- tambah modul PDF/video;
- buat dan kumpulkan tugas;
- buat serta mainkan game;
- logout dan login kembali;
- tampilan mobile serta tema gelap/terang.

## 3A. Netlify

Cara tercepat untuk uji coba:

1. Jalankan build lokal.
2. Buka Netlify Drop.
3. Seret folder `dist/` ke area upload.

Untuk deploy melalui Git, impor repository. Netlify akan membaca `netlify.toml`, menjalankan build, dan memublikasikan folder `dist` otomatis.

## 3B. Vercel

Impor repository ke Vercel. Konfigurasi `vercel.json` sudah menentukan build command dan output directory. Tidak perlu memilih framework.

## 3C. Cloudflare Pages

Gunakan konfigurasi:

- Framework preset: `None`
- Build command: `bash scripts/build-static.sh`
- Build output directory: `dist`

File `_headers` dan `_redirects` ikut dimasukkan ke hasil build.

## 3D. cPanel atau hosting biasa

Unggah seluruh isi `dist/`—bukan folder proyek mentah—ke `public_html`. Pastikan `index.html`, `admin.html`, `assets/`, dan `pages/` berada pada tingkat yang sama.

## 4. Setelah website aktif

1. Pastikan situs selalu menggunakan HTTPS.
2. Buka `/index.html` untuk siswa dan `/admin` untuk administrator.
3. Periksa Console dan Network pada browser jika data Supabase tidak muncul.
4. Jangan unggah file `.env`, SQL, backup data, atau service-role key.
5. Gunakan data percobaan saja sampai pengamanan RPC admin selesai.

## Batas keamanan versi demo

Login admin dan pengaturan global sudah memakai sesi yang divalidasi database. Namun CRUD siswa, kelas, modul, tugas, game, dan laporan admin masih memiliki RPC lama yang diberikan kepada role `anon`. Policy upload PDF dan lampiran juga belum memakai Supabase Auth.

Artinya, menyembunyikan URL admin tidak cukup untuk produksi. Untuk website sekolah dengan data nyata, langkah berikutnya adalah migrasi Supabase Auth/role admin atau Edge Function sebelum domain diumumkan secara umum.
