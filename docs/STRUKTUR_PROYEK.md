# Struktur Proyek EduSky

## Entry point

- `index.html`: login siswa dan entry point utama hosting.
- `admin.html`: dashboard admin.
- `pages/admin-login/index.html`: login admin.

## Aset

- `assets/css/`: seluruh stylesheet halaman dan komponen bersama.
- `assets/js/`: seluruh logika halaman dan komponen bersama.
- `assets/js/legacy-ui.js`: kode UI lama yang tidak dimuat halaman aktif; disimpan sementara sebagai arsip.

## Halaman siswa

- `pages/home/index.html`: dashboard siswa.
- `pages/modul/index.html`: katalog modul dari Supabase.
- `pages/tugas/index.html`: halaman tugas.
- `pages/profil/index.html`: halaman profil.

## Database

- `supabase/akunsiswa_setup.sql`: tabel dan RPC akun siswa.
- `supabase/modul_setup.sql`: tabel, RPC, policy, dan bucket modul.

## Hosting

Upload seluruh isi folder root. Document root hosting harus menunjuk ke folder yang berisi `index.html` dan `admin.html`. Gunakan path relatif yang sudah tersedia; tidak diperlukan perubahan domain di HTML.
