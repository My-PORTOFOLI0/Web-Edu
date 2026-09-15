-- =========================================================
-- EDUSKY - KATALOG KELAS SISWA
-- Jalankan file ini melalui Supabase SQL Editor agar kelas
-- kosong tetap tersimpan dan tersedia pada semua perangkat.
-- =========================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.kelas_siswa (
    id uuid primary key default extensions.gen_random_uuid(),
    nama varchar(30) not null,
    jenjang varchar(20) not null default 'SD',
    created_at timestamptz not null default now(),
    constraint kelas_siswa_nama_not_blank check (btrim(nama) <> ''),
    constraint kelas_siswa_jenjang_valid check (jenjang in ('SD', 'SMP', 'SMA'))
);

create unique index if not exists kelas_siswa_nama_unique_idx
on public.kelas_siswa (lower(btrim(nama)));

-- Masukkan kelas dari akun yang sudah ada agar data lama tetap terhubung.
insert into public.kelas_siswa (nama, jenjang)
select
    min(btrim(a.kelas)) as nama,
    max(
        case
            when upper(btrim(coalesce(a.jenjang, 'SD'))) in ('SD', 'SMP', 'SMA')
                then upper(btrim(a.jenjang))
            else 'SD'
        end
    ) as jenjang
from public.akunsiswa as a
where btrim(coalesce(a.kelas, '')) <> ''
group by lower(btrim(a.kelas))
on conflict do nothing;

alter table public.kelas_siswa enable row level security;
revoke all on table public.kelas_siswa from anon, authenticated;

drop function if exists public.admin_list_kelas_siswa();
drop function if exists public.admin_create_kelas_siswa(text, text);
drop function if exists public.admin_delete_kelas_siswa(uuid);

create function public.admin_list_kelas_siswa()
returns table (
    id uuid,
    nama varchar(30),
    jenjang varchar(20),
    total_siswa bigint,
    siswa_aktif bigint,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        k.id,
        k.nama,
        k.jenjang,
        count(a.id) as total_siswa,
        count(a.id) filter (where lower(a.status) = 'aktif') as siswa_aktif,
        k.created_at
    from public.kelas_siswa as k
    left join public.akunsiswa as a
        on lower(btrim(a.kelas)) = lower(btrim(k.nama))
    group by k.id, k.nama, k.jenjang, k.created_at
    order by k.nama;
$$;

create function public.admin_create_kelas_siswa(
    p_nama text,
    p_jenjang text default 'SD'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_class public.kelas_siswa%rowtype;
    v_name text := btrim(coalesce(p_nama, ''));
    v_level text := upper(btrim(coalesce(p_jenjang, 'SD')));
begin
    if v_name = '' then
        raise exception using errcode = '22023', message = 'Nama kelas wajib diisi.';
    end if;

    if char_length(v_name) > 30 then
        raise exception using errcode = '22023', message = 'Nama kelas maksimal 30 karakter.';
    end if;

    if lower(v_name) = 'belum ditentukan' then
        raise exception using errcode = '22023', message = 'Nama kelas tersebut tidak dapat digunakan.';
    end if;

    if v_level not in ('SD', 'SMP', 'SMA') then
        raise exception using errcode = '22023', message = 'Jenjang kelas tidak valid.';
    end if;

    if exists (
        select 1
        from public.kelas_siswa as k
        where lower(btrim(k.nama)) = lower(v_name)
    ) then
        raise exception using errcode = '23505', message = 'Kelas tersebut sudah tersedia.';
    end if;

    insert into public.kelas_siswa (nama, jenjang)
    values (v_name, v_level)
    returning * into v_class;

    return to_jsonb(v_class);
end;
$$;

create function public.admin_delete_kelas_siswa(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_name text;
begin
    select k.nama into v_name
    from public.kelas_siswa as k
    where k.id = p_id;

    if not found then
        raise exception using errcode = 'P0002', message = 'Kelas tidak ditemukan.';
    end if;

    if exists (
        select 1
        from public.akunsiswa as a
        where lower(btrim(a.kelas)) = lower(btrim(v_name))
    ) then
        raise exception using errcode = '23503', message = 'Kelas masih memiliki siswa dan tidak dapat dihapus.';
    end if;

    delete from public.kelas_siswa where id = p_id;
    return true;
end;
$$;

revoke execute on function public.admin_list_kelas_siswa() from public;
revoke execute on function public.admin_create_kelas_siswa(text, text) from public;
revoke execute on function public.admin_delete_kelas_siswa(uuid) from public;

grant execute on function public.admin_list_kelas_siswa() to anon, authenticated;
grant execute on function public.admin_create_kelas_siswa(text, text) to anon, authenticated;
grant execute on function public.admin_delete_kelas_siswa(uuid) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
