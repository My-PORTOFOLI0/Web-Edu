# Setup Supabase EduSky

Frontend sudah memakai project Supabase berikut:

- URL: `https://viwbkbrikocybvqlgwoy.supabase.co`
- Tabel: `public.akunsiswa`

## Mengaktifkan game edukasi kelas 5

Jalankan `game_edukasi_setup.sql` di Supabase SQL Editor untuk memasang tabel game,
bank soal, progres dan hadiah siswa, RPC halaman siswa/admin, serta delapan level awal Matematika
dan Bahasa Inggris. Tanpa migrasi ini fitur tetap dapat dicoba memakai data demo
yang tersimpan di browser (`localStorage`).

Jalankan kembali file tersebut setelah pembaruan katalog kelas agar setiap game baru
tersimpan untuk kelas yang dipilih. Game lama tanpa kelas tetap dapat digunakan
di dalam setiap kelas tanpa label khusus.

Versi terbaru juga menyimpan koin, misi harian, rangkaian belajar, dan klaim hadiah
ke tabel `reward_game_siswa`. Level 4, 8, 12, dan seterusnya otomatis ditampilkan
sebagai **Boss Challenge**. Jalankan kembali seluruh file setelah pembaruan ini;
data progres game lama tidak dihapus.

Setiap permainan yang selesai juga dicatat ke `hasil_game_siswa`, termasuk nilai,
akurasi, jawaban benar/salah, durasi, kecepatan per respons, bintang, dan status
lulus. Riwayat ini dapat dibuka admin melalui **Laporan Nilai → Analitik Game**.

## Cara mengaktifkan CRUD

1. Buka dashboard Supabase milik Anda.
2. Pilih **SQL Editor** lalu **New query**.
3. Salin seluruh isi `akunsiswa_setup.sql`.
4. Tekan **Run** dan pastikan hasilnya `Success`.
5. Buka `pages/admin-login/index.html`, login, lalu pilih menu **Data Siswa**.
6. Tambahkan satu akun dan periksa **Table Editor > akunsiswa**.

Script tersebut membuat fungsi berikut:

- `admin_list_akun_siswa`
- `admin_get_akun_siswa`
- `admin_create_akun_siswa`
- `admin_update_akun_siswa`
- `admin_delete_akun_siswa`
- `login_siswa`

Password siswa di-hash dengan bcrypt di database. Nilai `password_hash`
tidak dikirim kembali ke browser.

## Mengaktifkan Katalog Kelas Siswa

1. Pastikan `akunsiswa_setup.sql` sudah dijalankan.
2. Jalankan seluruh isi `kelas_siswa_setup.sql` melalui Supabase SQL Editor.
3. Muat ulang halaman admin lalu buka **Data Siswa**.
4. Klik **Tambah Kelas**, buka kelas yang dibuat, kemudian klik **Tambah Siswa**.

Script ini menyimpan kelas kosong, memindahkan daftar kelas lama dari data akun,
dan menyediakan RPC untuk menambah serta membaca katalog kelas. Tanpa script ini,
alur tetap dapat dicoba karena kelas baru disimpan sementara di browser.

## Mengaktifkan Login Admin dan Pengaturan Global

1. Jalankan `pengaturan_aplikasi_setup.sql` melalui Supabase SQL Editor.
2. Login awal menggunakan username `admin` dan password `Admin123`.
3. Segera ubah password awal melalui perintah yang tersedia di bagian bawah file SQL.
4. Buka **Admin > Pengaturan** untuk menyimpan identitas platform, logo beserta ukuran
   dan posisinya, tahun ajaran, tema dashboard, nama administrator, dan nomor WhatsApp
   ke Supabase.

Jika `pengaturan_aplikasi_setup.sql` pernah dijalankan sebelum fitur logo tersedia,
jalankan kembali seluruh file tersebut. Script aman dijalankan ulang dan akan
menambahkan kolom logo, skala, serta posisi logo dan memperbarui RPC tanpa menghapus
pengaturan lama.

Password admin disimpan sebagai hash bcrypt. Token sesi admin hanya disimpan dalam
bentuk hash di database, berlaku selama delapan jam, dan wajib disertakan ketika
mengubah pengaturan. Halaman siswa hanya memperoleh konfigurasi publik melalui RPC.

Perlindungan token di atas berlaku untuk RPC pengaturan yang dibuat oleh
`pengaturan_aplikasi_setup.sql`. RPC CRUD lama pada file setup lainnya masih perlu
migrasi otorisasi tersendiri sebelum digunakan pada lingkungan produksi publik.

## Mengaktifkan modul PDF dan YouTube

1. Buka **SQL Editor** lalu buat query baru.
2. Salin seluruh isi `modul_setup.sql` dan tekan **Run**.
3. Script akan membuat tabel `public.modul`, bucket Storage publik
   `modul-pdf`, policy upload PDF, dan seluruh RPC modul.
4. Muat ulang halaman admin lalu buka **Kelola Modul**.
5. Tambahkan PDF, link YouTube, atau keduanya dan aktifkan opsi publikasi.

Modul yang dipublikasikan otomatis muncul di `pages/modul/index.html`.
Siswa dapat membaca PDF dan memutar video YouTube langsung di dalam halaman.

## Mengaktifkan Profil Siswa

1. Pastikan `akunsiswa_setup.sql` sudah pernah dijalankan.
2. Buka **SQL Editor** dan jalankan seluruh isi `profil_setup.sql`.
3. Pastikan query menampilkan status **Success**.
4. Logout dari akun siswa lama, kemudian login kembali agar token sesi profil dibuat.
5. Buka `pages/profil/index.html`.

Script Profil menambahkan preferensi akun, sesi siswa yang disimpan dalam bentuk
hash, serta RPC berikut:

- `siswa_get_profil`
- `siswa_update_profil`
- `siswa_change_password`
- `siswa_logout`
- `siswa_logout_semua`

Nama, username, foto, preferensi, dan password dapat diubah siswa. NIS, jenjang,
kelas, sekolah, dan status tetap dikendalikan administrator.

## Mengaktifkan Tugas, Pengumpulan, dan Penilaian

1. Pastikan `akunsiswa_setup.sql` dan `modul_setup.sql` sudah dijalankan.
2. Jalankan seluruh isi `tugas_setup.sql` melalui Supabase SQL Editor.
3. Muat ulang `admin.html`, lalu buka menu **Kelola Tugas**.
4. Buat tugas dengan mata pelajaran, kelas tujuan, deadline, dan nilai maksimal.
5. Siswa pada kelas yang sesuai dapat membuka tugas dari halaman Home > Kelas > Tugas.

Script membuat tabel `tugas`, `pengumpulan_tugas`, bucket `tugas-siswa`, serta RPC
untuk CRUD tugas, pengumpulan siswa, penilaian admin, dan laporan nilai. Kelas
tugas dicocokkan di database dengan `akunsiswa.kelas`, sehingga siswa tidak
memilih kelas sendiri.

Tabel `aktivitas_tugas_siswa` mencatat waktu pertama tugas dibuka, jumlah membuka,
durasi sampai dikumpulkan, dan ketepatan terhadap deadline. Metrik tersebut tampil
bersama jawaban siswa pada pemeriksaan tugas admin.

Setelah pembaruan laporan nilai bertingkat, jalankan kembali seluruh isi
`tugas_setup.sql`. Versi ini menambahkan RPC `admin_list_pengumpulan_nilai`
untuk alur **Kelas → Mata Pelajaran → Tugas → Siswa → Pemeriksaan** tanpa
menghapus tugas maupun pengumpulan yang sudah tersimpan.

Urutan setup yang disarankan:

1. `pengaturan_aplikasi_setup.sql`
2. `akunsiswa_setup.sql`
3. `kelas_siswa_setup.sql`
4. `modul_setup.sql`
5. `tugas_setup.sql`
6. `profil_setup.sql`
7. `laporan_siswa_setup.sql`
8. `game_edukasi_setup.sql`

Sebelum hosting, jalankan `hosting_readiness_check.sql`. Pemeriksaan ini hanya
membaca metadata database dan tidak mengubah data.

## Mengaktifkan Pusat Bantuan dan Laporan Siswa

1. Pastikan `akunsiswa_setup.sql` dan `profil_setup.sql` sudah dijalankan.
2. Jalankan seluruh isi `laporan_siswa_setup.sql` melalui Supabase SQL Editor.
3. Muat ulang halaman Profil siswa, halaman Login, dan `admin.html`.
4. Laporan dari siswa akan muncul pada **Admin > Laporan > Pertanyaan Siswa**.

Script membuat tabel `laporan_siswa` dan RPC untuk mengirim laporan dari sesi
siswa, bantuan sebelum login, riwayat laporan siswa, daftar laporan admin, serta
pembaruan status dan balasan admin.
