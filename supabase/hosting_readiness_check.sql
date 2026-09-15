-- =========================================================
-- EDUSKY - PEMERIKSAAN KESIAPAN HOSTING (READ ONLY)
-- File ini tidak mengubah database.
-- Jalankan melalui Supabase SQL Editor setelah seluruh setup.
-- =========================================================

with expected_tables(name) as (
  values
    ('akunsiswa'),
    ('kelas_siswa'),
    ('modul'),
    ('tugas'),
    ('pengumpulan_tugas'),
    ('aktivitas_tugas_siswa'),
    ('game_edukasi'),
    ('progres_game_siswa'),
    ('reward_game_siswa'),
    ('hasil_game_siswa'),
    ('laporan_siswa'),
    ('admin_akun'),
    ('admin_sesi'),
    ('pengaturan_aplikasi'),
    ('siswa_sessions')
)
select
  'table' as component_type,
  expected.name as component_name,
  case when tables.table_name is null then 'MISSING' else 'OK' end as status
from expected_tables expected
left join information_schema.tables tables
  on tables.table_schema = 'public'
 and tables.table_name = expected.name

union all

select
  'function',
  expected.name,
  case when routines.routine_name is null then 'MISSING' else 'OK' end
from (
  values
    ('login_admin'),
    ('login_siswa'),
    ('admin_list_akun_siswa'),
    ('admin_list_kelas_siswa'),
    ('admin_list_modul'),
    ('list_modul_siswa_akun'),
    ('admin_list_tugas'),
    ('admin_list_pengumpulan_nilai'),
    ('siswa_list_tugas'),
    ('siswa_mulai_tugas'),
    ('admin_list_game'),
    ('list_game_siswa'),
    ('list_reward_game_siswa'),
    ('simpan_reward_game_siswa'),
    ('simpan_hasil_game'),
    ('admin_list_hasil_game'),
    ('admin_list_laporan_siswa'),
    ('siswa_get_profil'),
    ('publik_get_pengaturan_aplikasi')
) as expected(name)
left join information_schema.routines routines
  on routines.routine_schema = 'public'
 and routines.routine_name = expected.name

union all

select
  'storage_bucket',
  expected.name,
  case when buckets.id is null then 'MISSING' else 'OK' end
from (values ('modul-pdf'), ('tugas-siswa')) as expected(name)
left join storage.buckets buckets
  on buckets.id = expected.name

order by component_type, component_name;

-- Audit risiko demo: hasil di bawah menunjukkan RPC admin yang masih
-- dapat dieksekusi role anon. Daftar ini harus dimigrasikan sebelum
-- platform memproses data sekolah yang nyata.
select distinct
  routine_name,
  privilege_type,
  grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee = 'anon'
  and left(routine_name, 6) = 'admin_'
order by routine_name;
