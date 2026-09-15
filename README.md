# EduSky Learning Platform

EduSky adalah platform belajar berbasis HTML, CSS, JavaScript, dan Supabase. Situs dapat dipublikasikan sebagai static site tanpa server aplikasi tambahan.

## Halaman utama

- Login siswa: `/index.html`
- Login admin: `/pages/admin-login/index.html`
- Dashboard admin: `/admin.html`
- Home siswa: `/pages/home/index.html`
- Modul: `/pages/modul/index.html`
- Kelas dan tugas: `/pages/kelas/index.html`
- Game edukasi: `/pages/game/index.html`
- Profil: `/pages/profil/index.html`

## Menjalankan secara lokal

Gunakan Live Server atau server HTTP statis. Jangan membuka file HTML langsung melalui protokol `file://` karena modul PDF, YouTube, dan permintaan Supabase memerlukan origin HTTP/HTTPS.

## Membuat paket hosting

```bash
bash scripts/build-static.sh
```

Hasilnya tersedia di folder `dist/`. Folder ini sengaja tidak menyertakan `supabase/`, `docs/`, file konfigurasi pengembangan, dan rahasia lokal.

## Deploy

Konfigurasi berikut sudah tersedia:

- Netlify: `netlify.toml`
- Vercel: `vercel.json`
- Cloudflare Pages: build command `bash scripts/build-static.sh`, output `dist`
- Hosting biasa/cPanel: unggah isi folder `dist/` ke `public_html`

Petunjuk lengkap: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Supabase

Jalankan file SQL sesuai urutan pada [supabase/README.md](supabase/README.md), kemudian jalankan `supabase/hosting_readiness_check.sql` untuk memeriksa tabel, RPC, dan bucket yang dibutuhkan.

Kunci Supabase pada frontend adalah publishable/anon key dan memang dapat terlihat oleh browser. Jangan pernah menaruh `service_role` key di file HTML atau JavaScript.

## Peringatan keamanan

Versi saat ini layak untuk demo atau pengujian dengan data non-sensitif. Beberapa RPC CRUD admin lama masih menerima akses dari publishable key tanpa validasi sesi admin. Sebelum digunakan sebagai sistem produksi publik, migrasikan seluruh RPC admin dan policy upload Storage ke Supabase Auth/role admin atau Edge Function.
