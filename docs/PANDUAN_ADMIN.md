# 📖 PANDUAN LENGKAP ADMIN DASHBOARD

**EduSky Learning Platform - Admin System User Guide**

---

## 📑 Table of Contents

1. [Akses Dashboard](#akses-dashboard)
2. [Dashboard Overview](#dashboard-overview)
3. [Kelola Modul](#kelola-modul)
4. [Kelola Tugas](#kelola-tugas)
5. [Kelola Game Edukasi](#kelola-game-edukasi)
6. [Data Siswa](#data-siswa)
7. [Profil Siswa](#profil-siswa)
8. [Laporan Pembelajaran](#laporan-pembelajaran)
9. [Pengaturan Sistem](#pengaturan-sistem)
10. [Tips & Trik](#tips--trik)
11. [FAQ](#faq)

---

## Kelola Game Edukasi

1. Pilih **Kelola Game**, lalu tekan **Tambah Game**.
2. Tentukan mata pelajaran, nomor level, kesulitan, jenis game, nilai minimal
   lulus, waktu, dan poin/koin hadiah. Level kelipatan empat menjadi **Boss Challenge**.
3. Tambahkan soal. Editor otomatis menyesuaikan format **Pilihan Ganda**,
   **Benar / Salah**, **Susun Kata**, atau **Puzzle Pasangan**.
4. Isi petunjuk bantuan dan pembahasan agar siswa mendapatkan arahan bertahap.
5. Pilih **Aktif** agar tampil kepada siswa atau **Draft** untuk menyimpannya.

Level terbuka berurutan per mata pelajaran. Admin juga dapat mengedit,
menduplikasi, dan menghapus game beserta seluruh soalnya. Jalankan
`supabase/game_edukasi_setup.sql` setelah setup akun/profil siswa agar progres
beserta misi harian dan koin tersinkron lintas perangkat; tanpa migrasi, fitur
memakai data demo browser.

Setiap game yang selesai masuk ke **Laporan Nilai → Analitik Game**. Admin dapat
melihat seluruh percobaan per siswa, nilai otomatis, akurasi, benar/salah, durasi,
kecepatan per respons, dan status kelulusan. Pemeriksaan tugas juga menampilkan
waktu mulai, durasi pengerjaan, jumlah membuka, serta status tepat waktu/terlambat.

---

## 🚀 Akses Dashboard

### Step 1: Buka File
```
Lokasi: /WEB EDU/admin/admin.html
```

### Step 2: Buka di Browser
- Double-click file `admin.html`
- Atau drag ke browser window
- Atau copy-paste path ke address bar

### Step 3: Admin Panel Ready!
Dashboard akan tampil otomatis dengan layout responsive

### Desktop vs Mobile
- **Desktop**: Sidebar kiri + content utama
- **Mobile**: Sidebar collapsible + full-width content

---

## 📊 Dashboard Overview

### What You See

```
┌─────────────────────────────────────────┐
│  ADMIN HEADER (Nama + Logout)          │
├─────┬───────────────────────────────────┤
│     │  STAT CARDS:                      │
│ NAV │  • Total Modul                    │
│     │  • Total Tugas                    │
│     │  • Total Siswa                    │
│     │  • Total Video                    │
│     │  • Tugas Selesai                  │
│     │  • Rata-rata Nilai                │
│     │                                   │
│     │  RECENT ACTIVITY:                 │
│     │  • Log aktivitas terbaru          │
│     │  • Timestamp setiap aksi          │
└─────┴───────────────────────────────────┘
```

### Statistics Cards

**Total Modul**
- Jumlah keseluruhan modul pembelajaran
- Update otomatis saat add/delete modul

**Total Tugas**
- Jumlah seluruh tugas yang tersedia
- Include tugas aktif dan tidak aktif

**Total Siswa**
- Daftar siswa terdaftar di sistem
- Status aktif/tidak aktif

**Total Video**
- Video pembelajaran yang tersimpan
- Terintegrasi dengan video admin

**Tugas Selesai**
- Jumlah tugas yang sudah diselesaikan siswa
- Real-time update

**Rata-rata Nilai**
- Persentase rata-rata nilai seluruh siswa
- Calculated from nilaiSiswa data

---

## 📚 Kelola Modul

### Akses Menu
1. Click "Kelola Modul" di sidebar kiri
2. Page akan menampilkan list semua modul

### Tambah Modul Baru

**Click Button "Tambah Modul"**

Modal akan terbuka dengan form:

```
┌──────────────────────────────┐
│  TAMBAH MODUL               │
├──────────────────────────────┤
│ Nama Modul *                 │
│ [________________________]   │
│                              │
│ Mata Pelajaran *             │
│ [- Pilih -              ▼]   │
│ ├─ Matematika               │
│ ├─ Bahasa Indonesia         │
│ ├─ Bahasa Inggris           │
│ ├─ IPAS                      │
│ └─ Seni & Budaya            │
│                              │
│ Deskripsi                    │
│ [________________________]   │
│ [________________________]   │
│                              │
│ ☐ Modul Aktif               │
│                              │
│ [Batal]  [Simpan Modul]     │
└──────────────────────────────┘
```

**Field Penjelasan**:
- **Nama Modul**: Nama pembelajaran (e.g., "Penjumlahan & Pengurangan")
- **Mata Pelajaran**: Pilih dari dropdown (required)
- **Deskripsi**: Penjelasan singkat modul (opsional)
- **Modul Aktif**: Check untuk aktif di sistem

**Klik "Simpan Modul"** → Modul akan ditambahkan ke database

### View Modul List

**Tabel menampilkan**:
- ID: Nomor ID otomatis
- Nama Modul: Judul pembelajaran
- Mata Pelajaran: Subject
- Deskripsi: Short description
- Status: Aktif/Tidak Aktif (badge)
- Aksi: Edit & Delete buttons

**Contoh Tabel**:
```
┌────┬─────────────┬────────────┬──────────┬─────────┬─────────┐
│ ID │ Nama Modul  │ Pelajaran  │ Deskripsi│ Status  │ Aksi    │
├────┼─────────────┼────────────┼──────────┼─────────┼─────────┤
│ 1  │ Penjumlahan │ Matematika │ Belajar  │ ✓ Aktif │ E | D   │
│ 2  │ Pecahan     │ Matematika │ Dasar... │ ✓ Aktif │ E | D   │
│ 3  │ Animals     │ B. Inggris │ Vocab   │ ✗ Tidak │ E | D   │
└────┴─────────────┴────────────┴──────────┴─────────┴─────────┘
```

### Search & Filter

**Search by Name**:
```
[🔍 Cari modul...]
Ketik nama modul → hasil instantly filtered
```

**Filter by Subject**:
```
[- Semua Mata Pelajaran ▼]
├─ Matematika
├─ Bahasa Indonesia
├─ Bahasa Inggris
├─ IPAS
└─ Seni & Budaya
Pilih subject → tabel terupdate
```

### Edit Modul

**Steps**:
1. Click button "Edit" pada baris modul
2. Modal akan terbuka dengan data terisi
3. Ubah field sesuai kebutuhan
4. Click "Simpan Modul" → update

### Delete Modul

**Steps**:
1. Click button "Hapus" pada baris modul
2. Confirmation dialog akan muncul:
   ```
   "Apakah Anda yakin ingin menghapus modul ini?"
   [Cancel]  [OK]
   ```
3. Click "OK" → modul dihapus

---

## 📋 Kelola Tugas

### Akses Menu
1. Click "Kelola Tugas" di sidebar
2. Page akan menampilkan list semua tugas

### Tambah Tugas Baru

**Click "Tambah Tugas"** → Modal form terbuka

```
┌──────────────────────────────┐
│  TAMBAH TUGAS               │
├──────────────────────────────┤
│ Judul Tugas *                │
│ [________________________]   │
│                              │
│ Modul *                      │
│ [- Pilih Modul -        ▼]   │
│                              │
│ Deadline *       │ Nilai Max │
│ [__________]     │ [______]  │
│                              │
│ Deskripsi Tugas              │
│ [________________________]   │
│ [________________________]   │
│                              │
│ ☐ Tugas Aktif               │
│                              │
│ [Batal]  [Simpan Tugas]     │
└──────────────────────────────┘
```

**Field Penjelasan**:
- **Judul Tugas**: Nama tugas (e.g., "Quiz Penjumlahan")
- **Modul**: Pilih modul terkait (required)
- **Deadline**: Tanggal batas kumpul (required)
- **Nilai Maksimal**: Nilai tertinggi (default: 100)
- **Deskripsi**: Penjelasan tugas (opsional)
- **Tugas Aktif**: Check untuk aktif di sistem

### View & Filter Tugas

**Search by Title**:
```
[🔍 Cari tugas...]
Real-time filtering hasil
```

**Filter by Module**:
```
[- Semua Modul ▼]
Pilih modul → tampilkan tugas terkait
```

### Edit Tugas
1. Click button "Edit"
2. Ubah data di modal
3. Click "Simpan Tugas"

### Delete Tugas
1. Click button "Hapus"
2. Confirm → Tugas dihapus

---

## 👥 Data Siswa

### Akses Menu
Click "Data Siswa" di sidebar

### Tambah Siswa Baru

**Click "Tambah Siswa"** → Modal form

```
┌──────────────────────────────┐
│  TAMBAH SISWA               │
├──────────────────────────────┤
│ Nama Lengkap * │ Email *    │
│ [____________] │ [________] │
│                              │
│ Kelas *        │ Jenis K. * │
│ [____________] │ [Pilih ▼] │
│                              │
│ Nomor Induk Siswa (NIS)      │
│ [________________________]   │
│                              │
│ Nomor Telepon Orang Tua      │
│ [________________________]   │
│                              │
│ ☐ Siswa Aktif               │
│                              │
│ [Batal]  [Simpan Siswa]     │
└──────────────────────────────┘
```

**Field Penjelasan**:
- **Nama Lengkap**: Nama siswa (required)
- **Email**: Email siswa (required)
- **Kelas**: Kelas siswa (required)
- **Jenis Kelamin**: Laki-laki/Perempuan (required)
- **NIS**: Nomor Induk Siswa (opsional)
- **No. Telepon**: Nomor kontak orang tua (opsional)
- **Siswa Aktif**: Status aktif di sistem

### View Siswa List

Tabel menampilkan:
```
┌────┬─────────┬────────────────┬────────┬──────────┬──────────┐
│ No │ Nama    │ Email          │ Kelas  │ JK       │ Status   │
├────┼─────────┼────────────────┼────────┼──────────┼──────────┤
│ 1  │ Adi     │ adi@email.com  │ 3A     │ L-L      │ ✓ Aktif  │
│ 2  │ Budi    │ budi@email.com │ 3A     │ L-L      │ ✓ Aktif  │
│ 3  │ Citra   │ citra@email.com│ 3B     │ P        │ ✓ Aktif  │
└────┴─────────┴────────────────┴────────┴──────────┴──────────┘
```

### Search Siswa
```
[🔍 Cari siswa...]
Search by nama atau email → instant filter
```

### Edit Siswa
1. Click "Edit"
2. Update data
3. Click "Simpan Siswa"

### Delete Siswa
1. Click "Hapus"
2. Confirm → Siswa dihapus dari sistem

---

## 👤 Profil Siswa

### Akses Menu
Click "Profil Siswa" di sidebar

### Search Siswa
```
[🔍 Cari siswa untuk edit profil...]
```

### View & Edit Profil

Akan menampilkan card profil siswa:
```
┌─────────────────────────────┐
│ PROFIL SISWA                │
├─────────────────────────────┤
│ Nama: Adi Prasetyo          │
│ Email: adi@email.com        │
│ Kelas: 3A                   │
│ Jenis Kelamin: Laki-laki    │
│ NIS: 001234                 │
│ Telepon: 081234567890       │
│ Status: Aktif               │
│                             │
│ [Edit Profil]  [Hapus]     │
└─────────────────────────────┘
```

---

## 📊 Laporan Pembelajaran

### Akses Menu
Click "Laporan" di sidebar

### Tab 1: Laporan Nilai

Menampilkan tabel nilai siswa:

```
┌──────────┬──────────┬────────┬──────┬──────────┬───────┐
│ Nama     │ Modul    │ Tugas  │ Kuis │ Rata-rat │ Grade │
├──────────┼──────────┼────────┼──────┼──────────┼───────┤
│ Adi      │ Matik    │ 85     │ 78   │ 81.5     │ B     │
│ Budi     │ Matik    │ 92     │ 88   │ 90       │ A     │
│ Citra    │ B.Indo   │ 75     │ 80   │ 77.5     │ C     │
└──────────┴──────────┴────────┴──────┴──────────┴───────┘
```

### Tab 2: Kehadiran

Data kehadiran siswa:

```
┌──────────┬────────┬──────┬──────┬──────┬──────────┐
│ Nama     │ Hadir  │ Alpa │ Sakit│ Izin │ %        │
├──────────┼────────┼──────┼──────┼──────┼──────────┤
│ Adi      │ 18     │ 1    │ 0    │ 1    │ 90%      │
│ Budi     │ 20     │ 0    │ 0    │ 0    │ 100%     │
│ Citra    │ 17     │ 2    │ 1    │ 0    │ 85%      │
└──────────┴────────┴──────┴──────┴──────┴──────────┘
```

### Tab 3: Progress Pembelajaran

Visual progress per siswa dan modul

---

## ⚙️ Pengaturan Sistem

### Akses Menu
Click "Pengaturan" di sidebar

### Pengaturan Dasar

**Nama Aplikasi**
```
Nama Aplikasi
[EduSky Learning          ]
```

**Tahun Ajaran**
```
Tahun Ajaran
[2024/2025                ]
```

### Tema Gelap
```
Tema Gelap
☐ Non-aktif
Check untuk enable dark mode
```

### Simpan Pengaturan
```
[Reset ke Default]  [Simpan Pengaturan]
```

### Backup & Export

**Export Data**
- Click "Export Semua Data"
- File JSON akan didownload
- Nama: `edusky-backup-YYYY-MM-DD.json`
- Include: modul, tugas, siswa data

**Import Data**
- Click "Import Data"
- Pilih file JSON dari backup
- Data akan di-restore

**Reset Data**
- Click "Reset Semua Data"
- Confirmation: "Apakah yakin?"
- Warning: Permanen & tidak bisa di-undo!

---

## 💡 Tips & Trik

### Navigasi Cepat
- Click sidebar menu untuk quick navigation
- Mobile: Use hamburger menu di top-left

### Search Tips
- Search case-insensitive
- Partial name matching works
- Filter combines dengan search

### Keyboard Shortcuts
- Tab: Navigate form fields
- Enter: Submit form
- Escape: Close modal

### Data Management
- Regular backup ke JSON
- Use export untuk archive
- Import untuk restore

### Performance
- Table optimized untuk 1000+ rows
- Lazy loading enabled
- Efficient queries

---

## ❓ FAQ

### Q: Data saya hilang. Bagaimana recover?
**A:** 
- Check jika backup file ada
- Use "Import Data" untuk restore
- Or contact IT support untuk recovery database

### Q: Bagaimana add nilai siswa?
**A:** 
- Go to "Profil Siswa"
- Edit profil siswa
- Add nilai di section nilai

### Q: Bisakah export data per modul?
**A:** 
- Saat ini export keseluruhan
- Upcoming feature: selective export

### Q: Mobile app tersedia?
**A:** 
- Responsive web works di mobile
- Native app: planned untuk future

### Q: Bagaimana reset password?
**A:** 
- Admin panel tidak punya password feature
- Planned untuk production version

### Q: Apakah data aman?
**A:** 
- Data tersimpan local di browser
- Encrypted per browser
- Recommend: Add server auth untuk production

### Q: Berapa capacity penyimpanan?
**A:** 
- IndexedDB: Unlimited (or 50MB+)
- localStorage: ~5MB fallback

### Q: Bagaimana backup otomatis?
**A:** 
- Saat ini manual export
- Auto-backup: planned feature

### Q: Support multi-user admin?
**A:** 
- Single admin saat ini
- Multi-admin: future version

### Q: Integrasi dengan sistem lain?
**A:** 
- API export/import tersedia
- Planned: REST API

---

## 🎯 Quick Checklist

### Setup Admin
- [ ] Open admin.html
- [ ] Familiarize dengan dashboard
- [ ] Create test modul
- [ ] Create test tugas
- [ ] Add test siswa
- [ ] View laporan

### Regular Maintenance
- [ ] Check dashboard stats
- [ ] Review laporan
- [ ] Backup data weekly
- [ ] Monitor siswa progress
- [ ] Update tugas deadlines

### Before Going Live
- [ ] Test all CRUD operations
- [ ] Verify data export/import
- [ ] Test on mobile/tablet
- [ ] Create backup
- [ ] Document custom settings

---

## 📞 Dukungan

### Issues?
1. Check browser console (F12)
2. Clear cache & refresh
3. Try export/import data
4. Contact support jika masalah berlanjut

### Suggestions?
- Submit feature requests
- Report bugs dengan detail
- Share feedback untuk improvements

---

**Happy Managing! Admin Dashboard siap membantu Anda! 🚀**

*Last Updated: 14 Juli 2024*
