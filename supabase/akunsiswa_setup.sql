-- =========================================================
-- EDUSKY - BACKEND CRUD DAN LOGIN SISWA
-- Jalankan seluruh file ini satu kali melalui Supabase SQL Editor.
-- Tabel public.akunsiswa harus sudah dibuat terlebih dahulu.
-- =========================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Memastikan updated_at selalu berubah ketika akun diperbarui.
create or replace function public.update_akunsiswa_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trigger_update_akunsiswa on public.akunsiswa;

create trigger trigger_update_akunsiswa
before update on public.akunsiswa
for each row
execute function public.update_akunsiswa_updated_at();

-- Tabel tidak boleh diakses langsung dari publishable key karena
-- berisi password_hash. Akses hanya diberikan melalui RPC di bawah.
alter table public.akunsiswa enable row level security;
revoke all on table public.akunsiswa from anon, authenticated;

-- Hapus versi fungsi dengan signature yang sama agar script dapat
-- dijalankan ulang tanpa menghasilkan function overload yang ambigu.
drop function if exists public.admin_list_akun_siswa(text);
drop function if exists public.admin_get_akun_siswa(uuid);
drop function if exists public.admin_create_akun_siswa(
    text, text, text, text, text, text, text, text, text
);
drop function if exists public.admin_update_akun_siswa(
    uuid, text, text, text, text, text, text, text, text, text
);
drop function if exists public.admin_delete_akun_siswa(uuid);
drop function if exists public.login_siswa(text, text);

-- =========================================================
-- READ: DAFTAR AKUN SISWA (password_hash tidak dikembalikan)
-- =========================================================

create function public.admin_list_akun_siswa(p_search text default '')
returns table (
    id uuid,
    nis varchar(50),
    username varchar(50),
    nama_siswa varchar(150),
    jenjang varchar(20),
    kelas varchar(30),
    sekolah varchar(200),
    foto text,
    status varchar(20),
    terakhir_login timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        a.id,
        a.nis,
        a.username,
        a.nama_siswa,
        a.jenjang,
        a.kelas,
        a.sekolah,
        a.foto,
        a.status,
        a.terakhir_login,
        a.created_at,
        a.updated_at
    from public.akunsiswa as a
    where
        coalesce(btrim(p_search), '') = ''
        or a.nis ilike '%' || btrim(p_search) || '%'
        or a.username ilike '%' || btrim(p_search) || '%'
        or a.nama_siswa ilike '%' || btrim(p_search) || '%'
        or coalesce(a.kelas, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(a.sekolah, '') ilike '%' || btrim(p_search) || '%'
    order by a.created_at desc;
$$;

-- =========================================================
-- READ: SATU AKUN SISWA
-- =========================================================

create function public.admin_get_akun_siswa(p_id uuid)
returns table (
    id uuid,
    nis varchar(50),
    username varchar(50),
    nama_siswa varchar(150),
    jenjang varchar(20),
    kelas varchar(30),
    sekolah varchar(200),
    foto text,
    status varchar(20),
    terakhir_login timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        a.id,
        a.nis,
        a.username,
        a.nama_siswa,
        a.jenjang,
        a.kelas,
        a.sekolah,
        a.foto,
        a.status,
        a.terakhir_login,
        a.created_at,
        a.updated_at
    from public.akunsiswa as a
    where a.id = p_id
    limit 1;
$$;

-- =========================================================
-- CREATE: PASSWORD DI-HASH DENGAN BCRYPT
-- =========================================================

create function public.admin_create_akun_siswa(
    p_nis text,
    p_username text,
    p_password text,
    p_nama_siswa text,
    p_jenjang text default 'SD',
    p_kelas text default null,
    p_sekolah text default null,
    p_foto text default null,
    p_status text default 'aktif'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
    v_nis text := btrim(coalesce(p_nis, ''));
    v_username text := btrim(coalesce(p_username, ''));
    v_name text := btrim(coalesce(p_nama_siswa, ''));
    v_level text := upper(btrim(coalesce(p_jenjang, 'SD')));
    v_status text := lower(btrim(coalesce(p_status, 'aktif')));
begin
    if v_nis = '' then
        raise exception using errcode = '22023', message = 'NIS wajib diisi.';
    end if;

    if v_username = '' or v_username ~ '[[:space:]]' then
        raise exception using errcode = '22023', message = 'Username wajib diisi dan tidak boleh mengandung spasi.';
    end if;

    if char_length(v_username) < 3 then
        raise exception using errcode = '22023', message = 'Username minimal 3 karakter.';
    end if;

    if v_name = '' then
        raise exception using errcode = '22023', message = 'Nama siswa wajib diisi.';
    end if;

    if char_length(coalesce(p_password, '')) < 6 then
        raise exception using errcode = '22023', message = 'Password minimal 6 karakter.';
    end if;

    if v_level not in ('SD', 'SMP', 'SMA') then
        raise exception using errcode = '22023', message = 'Jenjang siswa tidak valid.';
    end if;

    if v_status not in ('aktif', 'nonaktif') then
        raise exception using errcode = '22023', message = 'Status akun siswa tidak valid.';
    end if;

    insert into public.akunsiswa (
        nis,
        username,
        password_hash,
        nama_siswa,
        jenjang,
        kelas,
        sekolah,
        foto,
        status
    )
    values (
        v_nis,
        v_username,
        extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
        v_name,
        v_level,
        nullif(btrim(coalesce(p_kelas, '')), ''),
        nullif(btrim(coalesce(p_sekolah, '')), ''),
        nullif(btrim(coalesce(p_foto, '')), ''),
        v_status
    )
    returning * into v_student;

    return to_jsonb(v_student) - 'password_hash';
end;
$$;

-- =========================================================
-- UPDATE: PASSWORD KOSONG BERARTI PASSWORD LAMA DIPERTAHANKAN
-- =========================================================

create function public.admin_update_akun_siswa(
    p_id uuid,
    p_nis text,
    p_username text,
    p_password text,
    p_nama_siswa text,
    p_jenjang text,
    p_kelas text,
    p_sekolah text,
    p_foto text,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
    v_nis text := btrim(coalesce(p_nis, ''));
    v_username text := btrim(coalesce(p_username, ''));
    v_name text := btrim(coalesce(p_nama_siswa, ''));
    v_level text := upper(btrim(coalesce(p_jenjang, 'SD')));
    v_status text := lower(btrim(coalesce(p_status, 'aktif')));
begin
    if p_id is null then
        raise exception using errcode = '22023', message = 'ID siswa tidak valid.';
    end if;

    if v_nis = '' or v_username = '' or v_name = '' then
        raise exception using errcode = '22023', message = 'Nama siswa, NIS, dan username wajib diisi.';
    end if;

    if v_username ~ '[[:space:]]' or char_length(v_username) < 3 then
        raise exception using errcode = '22023', message = 'Username minimal 3 karakter dan tidak boleh mengandung spasi.';
    end if;

    if p_password is not null
       and p_password <> ''
       and char_length(p_password) < 6 then
        raise exception using errcode = '22023', message = 'Password baru minimal 6 karakter.';
    end if;

    if v_level not in ('SD', 'SMP', 'SMA') then
        raise exception using errcode = '22023', message = 'Jenjang siswa tidak valid.';
    end if;

    if v_status not in ('aktif', 'nonaktif') then
        raise exception using errcode = '22023', message = 'Status akun siswa tidak valid.';
    end if;

    update public.akunsiswa as a
    set
        nis = v_nis,
        username = v_username,
        password_hash = case
            when p_password is null or p_password = ''
                then a.password_hash
            else extensions.crypt(p_password, extensions.gen_salt('bf', 12))
        end,
        nama_siswa = v_name,
        jenjang = v_level,
        kelas = nullif(btrim(coalesce(p_kelas, '')), ''),
        sekolah = nullif(btrim(coalesce(p_sekolah, '')), ''),
        foto = nullif(btrim(coalesce(p_foto, '')), ''),
        status = v_status
    where a.id = p_id
    returning a.* into v_student;

    if not found then
        raise exception using errcode = 'P0002', message = 'Data siswa tidak ditemukan.';
    end if;

    return to_jsonb(v_student) - 'password_hash';
end;
$$;

-- =========================================================
-- DELETE
-- =========================================================

create function public.admin_delete_akun_siswa(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_deleted boolean;
begin
    delete from public.akunsiswa
    where id = p_id;

    v_deleted := found;

    if not v_deleted then
        raise exception using errcode = 'P0002', message = 'Data siswa tidak ditemukan.';
    end if;

    return true;
end;
$$;

-- =========================================================
-- LOGIN SISWA DENGAN NIS ATAU USERNAME
-- =========================================================

create function public.login_siswa(
    p_identifier text,
    p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
    v_identifier text := btrim(coalesce(p_identifier, ''));
begin
    if v_identifier = '' or coalesce(p_password, '') = '' then
        return null;
    end if;

    select a.*
    into v_student
    from public.akunsiswa as a
    where
        a.status = 'aktif'
        and (
            a.nis = v_identifier
            or lower(a.username) = lower(v_identifier)
        )
        and a.password_hash = extensions.crypt(p_password, a.password_hash)
    limit 1;

    if not found then
        return null;
    end if;

    update public.akunsiswa as a
    set terakhir_login = now()
    where a.id = v_student.id
    returning a.* into v_student;

    return to_jsonb(v_student) - 'password_hash';
end;
$$;

-- Hanya RPC yang dapat dipanggil dari browser. Hak tabel tetap dicabut.
revoke execute on function public.admin_list_akun_siswa(text) from public;
revoke execute on function public.admin_get_akun_siswa(uuid) from public;
revoke execute on function public.admin_create_akun_siswa(text, text, text, text, text, text, text, text, text) from public;
revoke execute on function public.admin_update_akun_siswa(uuid, text, text, text, text, text, text, text, text, text) from public;
revoke execute on function public.admin_delete_akun_siswa(uuid) from public;
revoke execute on function public.login_siswa(text, text) from public;

grant execute on function public.admin_list_akun_siswa(text) to anon, authenticated;
grant execute on function public.admin_get_akun_siswa(uuid) to anon, authenticated;
grant execute on function public.admin_create_akun_siswa(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_update_akun_siswa(uuid, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_akun_siswa(uuid) to anon, authenticated;
grant execute on function public.login_siswa(text, text) to anon, authenticated;

commit;

-- Meminta PostgREST membaca fungsi baru tanpa menunggu cache otomatis.
notify pgrst, 'reload schema';

-- Setelah berhasil, buka halaman admin dan coba tambah satu akun siswa.
-- Data akan langsung tersimpan ke public.akunsiswa dan password_hash
-- berisi hash bcrypt, bukan password asli.
-- Untuk mengaktifkan edit Profil oleh siswa, lanjutkan dengan menjalankan
-- supabase/profil_setup.sql setelah file ini.
