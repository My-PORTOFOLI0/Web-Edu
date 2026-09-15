-- =========================================================
-- EDUSKY - TUGAS, PENGUMPULAN, DAN PENILAIAN PER KELAS
-- Jalankan setelah akunsiswa_setup.sql dan modul_setup.sql.
-- =========================================================

begin;

create table if not exists public.tugas (
    id uuid primary key default gen_random_uuid(),
    modul_id uuid references public.modul(id) on delete set null,
    judul varchar(180) not null,
    mata_pelajaran varchar(80) not null,
    kelas varchar(30) not null,
    deskripsi text,
    deadline timestamptz not null,
    nilai_maksimal integer not null default 100,
    status varchar(20) not null default 'aktif',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tugas_nilai_maksimal_check check (nilai_maksimal between 1 and 1000),
    constraint tugas_status_check check (status in ('aktif', 'draft', 'selesai'))
);

create table if not exists public.pengumpulan_tugas (
    id uuid primary key default gen_random_uuid(),
    tugas_id uuid not null references public.tugas(id) on delete cascade,
    siswa_id uuid not null references public.akunsiswa(id) on delete cascade,
    jawaban text,
    file_path text,
    file_name text,
    status varchar(20) not null default 'dikumpulkan',
    dikumpulkan_at timestamptz not null default now(),
    nilai numeric(8,2),
    umpan_balik text,
    dinilai_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint pengumpulan_tugas_unique unique (tugas_id, siswa_id),
    constraint pengumpulan_status_check check (status in ('dikumpulkan', 'dinilai', 'dikembalikan')),
    constraint pengumpulan_nilai_check check (nilai is null or nilai >= 0)
);

create table if not exists public.aktivitas_tugas_siswa (
    siswa_id uuid not null references public.akunsiswa(id) on delete cascade,
    tugas_id uuid not null references public.tugas(id) on delete cascade,
    mulai_dikerjakan_at timestamptz not null default now(),
    terakhir_dibuka_at timestamptz not null default now(),
    jumlah_buka integer not null default 1,
    primary key (siswa_id, tugas_id),
    constraint aktivitas_tugas_jumlah_buka_check check (jumlah_buka >= 1)
);

create index if not exists tugas_kelas_status_idx
on public.tugas (lower(kelas), status, deadline);

create index if not exists pengumpulan_siswa_idx
on public.pengumpulan_tugas (siswa_id, dikumpulkan_at desc);

create or replace function public.update_tugas_updated_at()
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

drop trigger if exists trigger_update_tugas on public.tugas;
create trigger trigger_update_tugas
before update on public.tugas
for each row execute function public.update_tugas_updated_at();

drop trigger if exists trigger_update_pengumpulan_tugas on public.pengumpulan_tugas;
create trigger trigger_update_pengumpulan_tugas
before update on public.pengumpulan_tugas
for each row execute function public.update_tugas_updated_at();

alter table public.tugas enable row level security;
alter table public.pengumpulan_tugas enable row level security;
alter table public.aktivitas_tugas_siswa enable row level security;
revoke all on table public.tugas from anon, authenticated;
revoke all on table public.pengumpulan_tugas from anon, authenticated;
revoke all on table public.aktivitas_tugas_siswa from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'tugas-siswa',
    'tugas-siswa',
    true,
    5242880,
    array[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tugas_siswa_public_read on storage.objects;
create policy tugas_siswa_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'tugas-siswa');

drop policy if exists tugas_siswa_public_insert on storage.objects;
create policy tugas_siswa_public_insert
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'tugas-siswa');

drop policy if exists tugas_siswa_public_update on storage.objects;
create policy tugas_siswa_public_update
on storage.objects for update
to anon, authenticated
using (bucket_id = 'tugas-siswa')
with check (bucket_id = 'tugas-siswa');

drop function if exists public.admin_list_tugas(text, text);
drop function if exists public.admin_create_tugas(uuid, text, text, text, text, timestamptz, integer, text);
drop function if exists public.admin_update_tugas(uuid, uuid, text, text, text, text, timestamptz, integer, text);
drop function if exists public.admin_delete_tugas(uuid);
drop function if exists public.siswa_list_tugas(uuid);
drop function if exists public.siswa_mulai_tugas(uuid, uuid);
drop function if exists public.siswa_kumpulkan_tugas(uuid, uuid, text, text, text);
drop function if exists public.admin_list_pengumpulan(uuid);
drop function if exists public.admin_list_pengumpulan_nilai();
drop function if exists public.admin_nilai_pengumpulan(uuid, numeric, text);
drop function if exists public.admin_list_nilai();

create function public.admin_list_tugas(
    p_search text default '',
    p_kelas text default ''
)
returns table (
    id uuid,
    modul_id uuid,
    judul varchar(180),
    mata_pelajaran varchar(80),
    kelas varchar(30),
    deskripsi text,
    deadline timestamptz,
    nilai_maksimal integer,
    status varchar(20),
    jumlah_pengumpulan bigint,
    jumlah_dinilai bigint,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        t.id, t.modul_id, t.judul, t.mata_pelajaran, t.kelas,
        t.deskripsi, t.deadline, t.nilai_maksimal, t.status,
        count(p.id) as jumlah_pengumpulan,
        count(p.id) filter (where p.status = 'dinilai') as jumlah_dinilai,
        t.created_at, t.updated_at
    from public.tugas t
    left join public.pengumpulan_tugas p on p.tugas_id = t.id
    where
        (btrim(coalesce(p_search, '')) = ''
         or t.judul ilike '%' || btrim(p_search) || '%'
         or t.mata_pelajaran ilike '%' || btrim(p_search) || '%')
        and (btrim(coalesce(p_kelas, '')) = '' or lower(t.kelas) = lower(btrim(p_kelas)))
    group by t.id
    order by t.created_at desc;
$$;

create function public.admin_create_tugas(
    p_modul_id uuid,
    p_judul text,
    p_mata_pelajaran text,
    p_kelas text,
    p_deskripsi text,
    p_deadline timestamptz,
    p_nilai_maksimal integer,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tugas public.tugas%rowtype;
begin
    if btrim(coalesce(p_judul, '')) = ''
       or btrim(coalesce(p_mata_pelajaran, '')) = ''
       or btrim(coalesce(p_kelas, '')) = ''
       or p_deadline is null then
        raise exception using errcode = '22023', message = 'Judul, mata pelajaran, kelas, dan deadline wajib diisi.';
    end if;

    insert into public.tugas (
        modul_id, judul, mata_pelajaran, kelas, deskripsi,
        deadline, nilai_maksimal, status
    ) values (
        p_modul_id,
        btrim(p_judul),
        btrim(p_mata_pelajaran),
        btrim(p_kelas),
        nullif(btrim(coalesce(p_deskripsi, '')), ''),
        p_deadline,
        greatest(1, least(coalesce(p_nilai_maksimal, 100), 1000)),
        case when lower(coalesce(p_status, 'aktif')) in ('aktif', 'draft', 'selesai')
             then lower(coalesce(p_status, 'aktif')) else 'aktif' end
    ) returning * into v_tugas;

    return to_jsonb(v_tugas);
end;
$$;

create function public.admin_update_tugas(
    p_id uuid,
    p_modul_id uuid,
    p_judul text,
    p_mata_pelajaran text,
    p_kelas text,
    p_deskripsi text,
    p_deadline timestamptz,
    p_nilai_maksimal integer,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tugas public.tugas%rowtype;
begin
    if btrim(coalesce(p_judul, '')) = ''
       or btrim(coalesce(p_mata_pelajaran, '')) = ''
       or btrim(coalesce(p_kelas, '')) = ''
       or p_deadline is null then
        raise exception using errcode = '22023', message = 'Judul, mata pelajaran, kelas, dan deadline wajib diisi.';
    end if;

    update public.tugas set
        modul_id = p_modul_id,
        judul = btrim(p_judul),
        mata_pelajaran = btrim(p_mata_pelajaran),
        kelas = btrim(p_kelas),
        deskripsi = nullif(btrim(coalesce(p_deskripsi, '')), ''),
        deadline = p_deadline,
        nilai_maksimal = greatest(1, least(coalesce(p_nilai_maksimal, 100), 1000)),
        status = case when lower(coalesce(p_status, 'aktif')) in ('aktif', 'draft', 'selesai')
                      then lower(coalesce(p_status, 'aktif')) else 'aktif' end
    where id = p_id
    returning * into v_tugas;

    if not found then
        raise exception using errcode = 'P0002', message = 'Tugas tidak ditemukan.';
    end if;
    return to_jsonb(v_tugas);
end;
$$;

create function public.admin_delete_tugas(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.tugas where id = p_id;
    if not found then
        raise exception using errcode = 'P0002', message = 'Tugas tidak ditemukan.';
    end if;
    return true;
end;
$$;

create function public.siswa_list_tugas(p_siswa_id uuid)
returns table (
    id uuid,
    modul_id uuid,
    judul varchar(180),
    mata_pelajaran varchar(80),
    kelas varchar(30),
    deskripsi text,
    deadline timestamptz,
    nilai_maksimal integer,
    submission_id uuid,
    submission_status varchar(20),
    jawaban text,
    file_path text,
    file_name text,
    dikumpulkan_at timestamptz,
    nilai numeric,
    umpan_balik text,
    dinilai_at timestamptz,
    mulai_dikerjakan_at timestamptz,
    jumlah_buka integer
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        t.id, t.modul_id, t.judul, t.mata_pelajaran, t.kelas,
        t.deskripsi, t.deadline, t.nilai_maksimal,
        p.id, p.status, p.jawaban, p.file_path, p.file_name,
        p.dikumpulkan_at, p.nilai, p.umpan_balik, p.dinilai_at,
        a.mulai_dikerjakan_at, coalesce(a.jumlah_buka, 0)
    from public.tugas t
    join public.akunsiswa s
      on s.id = p_siswa_id
     and s.status = 'aktif'
     and lower(btrim(s.kelas)) = lower(btrim(t.kelas))
    left join public.pengumpulan_tugas p
      on p.tugas_id = t.id and p.siswa_id = s.id
    left join public.aktivitas_tugas_siswa a
      on a.tugas_id = t.id and a.siswa_id = s.id
    where t.status = 'aktif'
    order by t.deadline asc;
$$;

create function public.siswa_mulai_tugas(p_siswa_id uuid, p_tugas_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_activity public.aktivitas_tugas_siswa%rowtype;
begin
    if not exists (
        select 1 from public.tugas t
        join public.akunsiswa s on s.id=p_siswa_id and s.status='aktif'
          and lower(btrim(s.kelas))=lower(btrim(t.kelas))
        where t.id=p_tugas_id and t.status='aktif'
    ) then
        raise exception using errcode='42501', message='Tugas tidak tersedia untuk kelas siswa ini.';
    end if;
    insert into public.aktivitas_tugas_siswa(siswa_id,tugas_id,mulai_dikerjakan_at,terakhir_dibuka_at,jumlah_buka)
    values(p_siswa_id,p_tugas_id,now(),now(),1)
    on conflict(siswa_id,tugas_id) do update set
      terakhir_dibuka_at=now(), jumlah_buka=public.aktivitas_tugas_siswa.jumlah_buka+1
    returning * into v_activity;
    return to_jsonb(v_activity);
end;
$$;

create function public.siswa_kumpulkan_tugas(
    p_siswa_id uuid,
    p_tugas_id uuid,
    p_jawaban text,
    p_file_path text,
    p_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_pengumpulan public.pengumpulan_tugas%rowtype;
begin
    if not exists (
        select 1
        from public.tugas t
        join public.akunsiswa s
          on s.id = p_siswa_id
         and s.status = 'aktif'
         and lower(btrim(s.kelas)) = lower(btrim(t.kelas))
        where t.id = p_tugas_id and t.status = 'aktif'
    ) then
        raise exception using errcode = '42501', message = 'Tugas tidak tersedia untuk kelas siswa ini.';
    end if;

    if btrim(coalesce(p_jawaban, '')) = '' and btrim(coalesce(p_file_path, '')) = '' then
        raise exception using errcode = '22023', message = 'Tuliskan jawaban atau lampirkan file tugas.';
    end if;

    insert into public.aktivitas_tugas_siswa(siswa_id,tugas_id,mulai_dikerjakan_at,terakhir_dibuka_at,jumlah_buka)
    values(p_siswa_id,p_tugas_id,now(),now(),1)
    on conflict(siswa_id,tugas_id) do nothing;

    insert into public.pengumpulan_tugas (
        tugas_id, siswa_id, jawaban, file_path, file_name,
        status, dikumpulkan_at, nilai, umpan_balik, dinilai_at
    ) values (
        p_tugas_id, p_siswa_id,
        nullif(btrim(coalesce(p_jawaban, '')), ''),
        nullif(btrim(coalesce(p_file_path, '')), ''),
        nullif(btrim(coalesce(p_file_name, '')), ''),
        'dikumpulkan', now(), null, null, null
    )
    on conflict (tugas_id, siswa_id) do update set
        jawaban = excluded.jawaban,
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        status = 'dikumpulkan',
        dikumpulkan_at = now(),
        nilai = null,
        umpan_balik = null,
        dinilai_at = null
    returning * into v_pengumpulan;

    return to_jsonb(v_pengumpulan);
end;
$$;

create function public.admin_list_pengumpulan(p_tugas_id uuid)
returns table (
    id uuid,
    tugas_id uuid,
    siswa_id uuid,
    nama_siswa varchar(150),
    nis varchar(50),
    kelas varchar(30),
    jawaban text,
    file_path text,
    file_name text,
    status varchar(20),
    dikumpulkan_at timestamptz,
    nilai numeric,
    umpan_balik text,
    dinilai_at timestamptz,
    nilai_maksimal integer
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id, p.tugas_id, p.siswa_id, s.nama_siswa, s.nis, s.kelas,
        p.jawaban, p.file_path, p.file_name, p.status, p.dikumpulkan_at,
        p.nilai, p.umpan_balik, p.dinilai_at, t.nilai_maksimal
    from public.pengumpulan_tugas p
    join public.akunsiswa s on s.id = p.siswa_id
    join public.tugas t on t.id = p.tugas_id
    where p.tugas_id = p_tugas_id
    order by p.dikumpulkan_at desc;
$$;

-- Seluruh pekerjaan siswa yang sudah dikumpulkan untuk laporan nilai
-- bertingkat: kelas -> mata pelajaran -> tugas -> siswa -> pemeriksaan.
create function public.admin_list_pengumpulan_nilai()
returns table (
    id uuid,
    tugas_id uuid,
    siswa_id uuid,
    nama_siswa varchar(150),
    nis varchar(50),
    foto text,
    kelas varchar(30),
    mata_pelajaran varchar(80),
    judul_tugas varchar(180),
    deskripsi_tugas text,
    deadline timestamptz,
    nilai_maksimal integer,
    status varchar(20),
    jawaban text,
    file_path text,
    file_name text,
    dikumpulkan_at timestamptz,
    nilai numeric,
    umpan_balik text,
    dinilai_at timestamptz,
    mulai_dikerjakan_at timestamptz,
    durasi_pengerjaan_detik bigint,
    tepat_waktu boolean,
    jumlah_buka integer
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id,
        p.tugas_id,
        p.siswa_id,
        s.nama_siswa,
        s.nis,
        s.foto,
        s.kelas,
        t.mata_pelajaran,
        t.judul,
        t.deskripsi,
        t.deadline,
        t.nilai_maksimal,
        p.status,
        p.jawaban,
        p.file_path,
        p.file_name,
        p.dikumpulkan_at,
        p.nilai,
        p.umpan_balik,
        p.dinilai_at,
        a.mulai_dikerjakan_at,
        greatest(0, extract(epoch from (p.dikumpulkan_at-coalesce(a.mulai_dikerjakan_at,p.dikumpulkan_at)))::bigint),
        p.dikumpulkan_at <= t.deadline,
        coalesce(a.jumlah_buka,0)
    from public.pengumpulan_tugas p
    join public.akunsiswa s on s.id = p.siswa_id
    join public.tugas t on t.id = p.tugas_id
    left join public.aktivitas_tugas_siswa a on a.siswa_id=p.siswa_id and a.tugas_id=p.tugas_id
    where p.status in ('dikumpulkan', 'dinilai')
    order by
        lower(s.kelas),
        lower(t.mata_pelajaran),
        lower(t.judul),
        lower(s.nama_siswa),
        p.dikumpulkan_at desc;
$$;

create function public.admin_nilai_pengumpulan(
    p_id uuid,
    p_nilai numeric,
    p_umpan_balik text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_pengumpulan public.pengumpulan_tugas%rowtype;
    v_maksimal integer;
begin
    select t.nilai_maksimal into v_maksimal
    from public.pengumpulan_tugas p
    join public.tugas t on t.id = p.tugas_id
    where p.id = p_id;

    if v_maksimal is null then
        raise exception using errcode = 'P0002', message = 'Pengumpulan tugas tidak ditemukan.';
    end if;
    if p_nilai is null or p_nilai < 0 or p_nilai > v_maksimal then
        raise exception using errcode = '22023', message = 'Nilai berada di luar rentang tugas.';
    end if;

    update public.pengumpulan_tugas set
        nilai = p_nilai,
        umpan_balik = nullif(btrim(coalesce(p_umpan_balik, '')), ''),
        status = 'dinilai',
        dinilai_at = now()
    where id = p_id
    returning * into v_pengumpulan;

    return to_jsonb(v_pengumpulan);
end;
$$;

create function public.admin_list_nilai()
returns table (
    pengumpulan_id uuid,
    siswa_id uuid,
    nama_siswa varchar(150),
    nis varchar(50),
    kelas varchar(30),
    tugas_id uuid,
    judul_tugas varchar(180),
    mata_pelajaran varchar(80),
    nilai numeric,
    nilai_maksimal integer,
    umpan_balik text,
    dinilai_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id, p.siswa_id, s.nama_siswa, s.nis, s.kelas,
        t.id, t.judul, t.mata_pelajaran, p.nilai,
        t.nilai_maksimal, p.umpan_balik, p.dinilai_at
    from public.pengumpulan_tugas p
    join public.akunsiswa s on s.id = p.siswa_id
    join public.tugas t on t.id = p.tugas_id
    where p.status = 'dinilai'
    order by p.dinilai_at desc;
$$;

revoke execute on function public.admin_list_tugas(text, text) from public;
revoke execute on function public.admin_create_tugas(uuid, text, text, text, text, timestamptz, integer, text) from public;
revoke execute on function public.admin_update_tugas(uuid, uuid, text, text, text, text, timestamptz, integer, text) from public;
revoke execute on function public.admin_delete_tugas(uuid) from public;
revoke execute on function public.siswa_list_tugas(uuid) from public;
revoke execute on function public.siswa_mulai_tugas(uuid, uuid) from public;
revoke execute on function public.siswa_kumpulkan_tugas(uuid, uuid, text, text, text) from public;
revoke execute on function public.admin_list_pengumpulan(uuid) from public;
revoke execute on function public.admin_list_pengumpulan_nilai() from public;
revoke execute on function public.admin_nilai_pengumpulan(uuid, numeric, text) from public;
revoke execute on function public.admin_list_nilai() from public;

grant execute on function public.admin_list_tugas(text, text) to anon, authenticated;
grant execute on function public.admin_create_tugas(uuid, text, text, text, text, timestamptz, integer, text) to anon, authenticated;
grant execute on function public.admin_update_tugas(uuid, uuid, text, text, text, text, timestamptz, integer, text) to anon, authenticated;
grant execute on function public.admin_delete_tugas(uuid) to anon, authenticated;
grant execute on function public.siswa_list_tugas(uuid) to anon, authenticated;
grant execute on function public.siswa_mulai_tugas(uuid, uuid) to anon, authenticated;
grant execute on function public.siswa_kumpulkan_tugas(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_list_pengumpulan(uuid) to anon, authenticated;
grant execute on function public.admin_list_pengumpulan_nilai() to anon, authenticated;
grant execute on function public.admin_nilai_pengumpulan(uuid, numeric, text) to anon, authenticated;
grant execute on function public.admin_list_nilai() to anon, authenticated;

commit;
notify pgrst, 'reload schema';

-- CATATAN: RPC admin masih mengikuti arsitektur login admin lokal project.
-- Sebelum produksi, gunakan Supabase Auth dan role admin terverifikasi.
