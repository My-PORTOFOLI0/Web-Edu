-- =========================================================
-- EDUSKY - MODUL PDF + VIDEO YOUTUBE
-- Jalankan seluruh file melalui Supabase SQL Editor.
-- =========================================================

begin;

create table if not exists public.modul (
    id uuid primary key default gen_random_uuid(),
    judul varchar(180) not null,
    mata_pelajaran varchar(80) not null,
    deskripsi text,
    kelas varchar(30),
    durasi_menit integer not null default 15,
    pdf_path text,
    youtube_url text,
    youtube_id varchar(20),
    status varchar(20) not null default 'aktif',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint modul_status_check check (status in ('aktif', 'draft')),
    constraint modul_durasi_check check (durasi_menit between 1 and 600),
    constraint modul_konten_check check (
        nullif(btrim(coalesce(pdf_path, '')), '') is not null
        or nullif(btrim(coalesce(youtube_id, '')), '') is not null
    )
);

create index if not exists modul_status_index
    on public.modul (status);

create index if not exists modul_subject_index
    on public.modul (mata_pelajaran);

create or replace function public.update_modul_updated_at()
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

drop trigger if exists trigger_update_modul on public.modul;

create trigger trigger_update_modul
before update on public.modul
for each row
execute function public.update_modul_updated_at();

alter table public.modul enable row level security;
revoke all on table public.modul from anon, authenticated;

-- Bucket publik untuk PDF. Upload tetap dibatasi oleh policy di bawah.
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'modul-pdf',
    'modul-pdf',
    true,
    20971520,
    array['application/pdf']::text[]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists modul_pdf_public_read on storage.objects;
drop policy if exists modul_pdf_anon_insert on storage.objects;
drop policy if exists modul_pdf_anon_update on storage.objects;
drop policy if exists modul_pdf_anon_delete on storage.objects;

create policy modul_pdf_public_read
on storage.objects for select
to public
using (bucket_id = 'modul-pdf');

create policy modul_pdf_anon_insert
on storage.objects for insert
to anon, authenticated
with check (
    bucket_id = 'modul-pdf'
    and lower(storage.extension(name)) = 'pdf'
);

create policy modul_pdf_anon_update
on storage.objects for update
to anon, authenticated
using (bucket_id = 'modul-pdf')
with check (
    bucket_id = 'modul-pdf'
    and lower(storage.extension(name)) = 'pdf'
);

create policy modul_pdf_anon_delete
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'modul-pdf');

drop function if exists public.list_modul_siswa(text, text, text);
drop function if exists public.list_modul_siswa_akun(uuid, text, text);
drop function if exists public.admin_list_modul(text, text);
drop function if exists public.admin_get_modul(uuid);
drop function if exists public.admin_create_modul(text, text, text, text, integer, text, text, text, text);
drop function if exists public.admin_update_modul(uuid, text, text, text, text, integer, text, text, text, text);
drop function if exists public.admin_delete_modul(uuid);

-- Daftar modul aktif untuk siswa.
create function public.list_modul_siswa(
    p_search text default '',
    p_subject text default '',
    p_grade text default ''
)
returns table (
    id uuid,
    judul varchar(180),
    mata_pelajaran varchar(80),
    deskripsi text,
    kelas varchar(30),
    durasi_menit integer,
    pdf_path text,
    youtube_url text,
    youtube_id varchar(20),
    status varchar(20),
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        m.id,
        m.judul,
        m.mata_pelajaran,
        m.deskripsi,
        m.kelas,
        m.durasi_menit,
        m.pdf_path,
        m.youtube_url,
        m.youtube_id,
        m.status,
        m.created_at,
        m.updated_at
    from public.modul as m
    where
        m.status = 'aktif'
        and (
            coalesce(btrim(p_search), '') = ''
            or m.judul ilike '%' || btrim(p_search) || '%'
            or m.mata_pelajaran ilike '%' || btrim(p_search) || '%'
            or coalesce(m.deskripsi, '') ilike '%' || btrim(p_search) || '%'
        )
        and (
            coalesce(btrim(p_subject), '') = ''
            or lower(m.mata_pelajaran) = lower(btrim(p_subject))
        )
        and (
            coalesce(btrim(p_grade), '') = ''
            or m.kelas is null
            or btrim(m.kelas) = ''
            or lower(coalesce(m.kelas, '')) = lower(btrim(p_grade))
        )
    order by m.created_at desc;
$$;

-- Versi aman berbasis akun: kelas selalu dibaca dari akunsiswa,
-- bukan menerima kelas pilihan dari halaman siswa.
create function public.list_modul_siswa_akun(
    p_siswa_id uuid,
    p_search text default '',
    p_subject text default ''
)
returns table (
    id uuid,
    judul varchar(180),
    mata_pelajaran varchar(80),
    deskripsi text,
    kelas varchar(30),
    durasi_menit integer,
    pdf_path text,
    youtube_url text,
    youtube_id varchar(20),
    status varchar(20),
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        m.id, m.judul, m.mata_pelajaran, m.deskripsi, m.kelas,
        m.durasi_menit, m.pdf_path, m.youtube_url, m.youtube_id,
        m.status, m.created_at, m.updated_at
    from public.modul m
    join public.akunsiswa s
      on s.id = p_siswa_id
     and s.status = 'aktif'
     and (
        m.kelas is null
        or btrim(m.kelas) = ''
        or lower(btrim(m.kelas)) = lower(btrim(s.kelas))
     )
    where
        m.status = 'aktif'
        and (
            btrim(coalesce(p_search, '')) = ''
            or m.judul ilike '%' || btrim(p_search) || '%'
            or m.mata_pelajaran ilike '%' || btrim(p_search) || '%'
            or coalesce(m.deskripsi, '') ilike '%' || btrim(p_search) || '%'
        )
        and (
            btrim(coalesce(p_subject, '')) = ''
            or lower(m.mata_pelajaran) = lower(btrim(p_subject))
        )
    order by m.created_at desc;
$$;

-- Daftar semua modul untuk admin, termasuk draft.
create function public.admin_list_modul(
    p_search text default '',
    p_subject text default ''
)
returns table (
    id uuid,
    judul varchar(180),
    mata_pelajaran varchar(80),
    deskripsi text,
    kelas varchar(30),
    durasi_menit integer,
    pdf_path text,
    youtube_url text,
    youtube_id varchar(20),
    status varchar(20),
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        m.id,
        m.judul,
        m.mata_pelajaran,
        m.deskripsi,
        m.kelas,
        m.durasi_menit,
        m.pdf_path,
        m.youtube_url,
        m.youtube_id,
        m.status,
        m.created_at,
        m.updated_at
    from public.modul as m
    where
        (
            coalesce(btrim(p_search), '') = ''
            or m.judul ilike '%' || btrim(p_search) || '%'
            or m.mata_pelajaran ilike '%' || btrim(p_search) || '%'
            or coalesce(m.deskripsi, '') ilike '%' || btrim(p_search) || '%'
        )
        and (
            coalesce(btrim(p_subject), '') = ''
            or lower(m.mata_pelajaran) = lower(btrim(p_subject))
        )
    order by m.created_at desc;
$$;

create function public.admin_get_modul(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select to_jsonb(m)
    from public.modul as m
    where m.id = p_id
    limit 1;
$$;

create function public.admin_create_modul(
    p_judul text,
    p_mata_pelajaran text,
    p_deskripsi text,
    p_kelas text,
    p_durasi_menit integer,
    p_pdf_path text,
    p_youtube_url text,
    p_youtube_id text,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_modul public.modul%rowtype;
    v_judul text := btrim(coalesce(p_judul, ''));
    v_subject text := btrim(coalesce(p_mata_pelajaran, ''));
    v_status text := lower(btrim(coalesce(p_status, 'aktif')));
begin
    if v_judul = '' or v_subject = '' then
        raise exception using errcode = '22023', message = 'Judul dan mata pelajaran wajib diisi.';
    end if;

    if v_status not in ('aktif', 'draft') then
        raise exception using errcode = '22023', message = 'Status modul tidak valid.';
    end if;

    if nullif(btrim(coalesce(p_pdf_path, '')), '') is null
       and nullif(btrim(coalesce(p_youtube_id, '')), '') is null then
        raise exception using errcode = '22023', message = 'Tambahkan file PDF atau link video YouTube.';
    end if;

    insert into public.modul (
        judul,
        mata_pelajaran,
        deskripsi,
        kelas,
        durasi_menit,
        pdf_path,
        youtube_url,
        youtube_id,
        status
    ) values (
        v_judul,
        v_subject,
        nullif(btrim(coalesce(p_deskripsi, '')), ''),
        nullif(btrim(coalesce(p_kelas, '')), ''),
        greatest(1, least(coalesce(p_durasi_menit, 15), 600)),
        nullif(btrim(coalesce(p_pdf_path, '')), ''),
        nullif(btrim(coalesce(p_youtube_url, '')), ''),
        nullif(btrim(coalesce(p_youtube_id, '')), ''),
        v_status
    )
    returning * into v_modul;

    return to_jsonb(v_modul);
end;
$$;

create function public.admin_update_modul(
    p_id uuid,
    p_judul text,
    p_mata_pelajaran text,
    p_deskripsi text,
    p_kelas text,
    p_durasi_menit integer,
    p_pdf_path text,
    p_youtube_url text,
    p_youtube_id text,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_modul public.modul%rowtype;
    v_status text := lower(btrim(coalesce(p_status, 'aktif')));
begin
    if p_id is null then
        raise exception using errcode = '22023', message = 'ID modul tidak valid.';
    end if;

    if btrim(coalesce(p_judul, '')) = ''
       or btrim(coalesce(p_mata_pelajaran, '')) = '' then
        raise exception using errcode = '22023', message = 'Judul dan mata pelajaran wajib diisi.';
    end if;

    if nullif(btrim(coalesce(p_pdf_path, '')), '') is null
       and nullif(btrim(coalesce(p_youtube_id, '')), '') is null then
        raise exception using errcode = '22023', message = 'Tambahkan file PDF atau link video YouTube.';
    end if;

    update public.modul as m
    set
        judul = btrim(p_judul),
        mata_pelajaran = btrim(p_mata_pelajaran),
        deskripsi = nullif(btrim(coalesce(p_deskripsi, '')), ''),
        kelas = nullif(btrim(coalesce(p_kelas, '')), ''),
        durasi_menit = greatest(1, least(coalesce(p_durasi_menit, 15), 600)),
        pdf_path = nullif(btrim(coalesce(p_pdf_path, '')), ''),
        youtube_url = nullif(btrim(coalesce(p_youtube_url, '')), ''),
        youtube_id = nullif(btrim(coalesce(p_youtube_id, '')), ''),
        status = v_status
    where m.id = p_id
    returning m.* into v_modul;

    if not found then
        raise exception using errcode = 'P0002', message = 'Modul tidak ditemukan.';
    end if;

    return to_jsonb(v_modul);
end;
$$;

create function public.admin_delete_modul(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_modul public.modul%rowtype;
begin
    delete from public.modul as m
    where m.id = p_id
    returning m.* into v_modul;

    if not found then
        raise exception using errcode = 'P0002', message = 'Modul tidak ditemukan.';
    end if;

    return to_jsonb(v_modul);
end;
$$;

revoke execute on function public.list_modul_siswa(text, text, text) from public;
revoke execute on function public.list_modul_siswa_akun(uuid, text, text) from public;
revoke execute on function public.admin_list_modul(text, text) from public;
revoke execute on function public.admin_get_modul(uuid) from public;
revoke execute on function public.admin_create_modul(text, text, text, text, integer, text, text, text, text) from public;
revoke execute on function public.admin_update_modul(uuid, text, text, text, text, integer, text, text, text, text) from public;
revoke execute on function public.admin_delete_modul(uuid) from public;

grant execute on function public.list_modul_siswa(text, text, text) to anon, authenticated;
grant execute on function public.list_modul_siswa_akun(uuid, text, text) to anon, authenticated;
grant execute on function public.admin_list_modul(text, text) to anon, authenticated;
grant execute on function public.admin_get_modul(uuid) to anon, authenticated;
grant execute on function public.admin_create_modul(text, text, text, text, integer, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_update_modul(uuid, text, text, text, text, integer, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_modul(uuid) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- CATATAN: RPC admin masih dipanggil dengan publishable key karena login
-- admin project saat ini bersifat lokal. Sebelum produksi, gunakan Supabase
-- Auth dan batasi policy/RPC admin hanya untuk role admin terautentikasi.
