-- =========================================================
-- EDUSKY - PUSAT BANTUAN DAN LAPORAN SISWA
-- Jalankan setelah akunsiswa_setup.sql dan profil_setup.sql.
-- =========================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.laporan_siswa (
    id uuid primary key default extensions.gen_random_uuid(),
    siswa_id uuid null references public.akunsiswa(id) on delete set null,
    sumber varchar(20) not null default 'profil',
    kategori varchar(40) not null,
    subjek varchar(160) not null,
    pesan text not null,
    status varchar(20) not null default 'baru',
    balasan_admin text null,
    identifier_login varchar(100) null,
    kontak varchar(120) null,
    nama_siswa varchar(150) null,
    nis varchar(50) null,
    username varchar(50) null,
    jenjang varchar(20) null,
    kelas varchar(30) null,
    sekolah varchar(200) null,
    foto text null,
    ditanggapi_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint laporan_siswa_sumber_check check (sumber in ('profil', 'login')),
    constraint laporan_siswa_status_check check (status in ('baru', 'dibaca', 'diproses', 'selesai')),
    constraint laporan_siswa_kategori_check check (
        kategori in ('akun_login', 'data_profil', 'modul', 'tugas', 'nilai', 'teknis', 'lainnya')
    ),
    constraint laporan_siswa_pesan_length check (char_length(pesan) between 10 and 3000),
    constraint laporan_siswa_subjek_length check (char_length(subjek) between 3 and 160)
);

create index if not exists laporan_siswa_created_at_idx
on public.laporan_siswa (created_at desc);

create index if not exists laporan_siswa_status_idx
on public.laporan_siswa (status, created_at desc);

create index if not exists laporan_siswa_siswa_id_idx
on public.laporan_siswa (siswa_id, created_at desc);

create or replace function public.update_laporan_siswa_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trigger_update_laporan_siswa on public.laporan_siswa;
create trigger trigger_update_laporan_siswa
before update on public.laporan_siswa
for each row execute function public.update_laporan_siswa_updated_at();

alter table public.laporan_siswa enable row level security;
revoke all on table public.laporan_siswa from anon, authenticated;

drop function if exists public.siswa_kirim_laporan(uuid, text, text, text, text);
drop function if exists public.siswa_list_laporan(uuid, text);
drop function if exists public.publik_kirim_laporan_login(text, text, text, text, text, text);
drop function if exists public.admin_list_laporan_siswa(text, text);
drop function if exists public.admin_update_laporan_siswa(uuid, text, text);

create function public.siswa_kirim_laporan(
    p_id uuid,
    p_session_token text,
    p_kategori text,
    p_subjek text,
    p_pesan text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
    v_report public.laporan_siswa%rowtype;
    v_category text := lower(btrim(coalesce(p_kategori, 'lainnya')));
    v_subject text := btrim(coalesce(p_subjek, ''));
    v_message text := btrim(coalesce(p_pesan, ''));
begin
    if not public.validasi_sesi_siswa(p_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi siswa tidak valid atau sudah berakhir.';
    end if;

    if v_category not in ('akun_login', 'data_profil', 'modul', 'tugas', 'nilai', 'teknis', 'lainnya') then
        v_category := 'lainnya';
    end if;

    if char_length(v_subject) < 3 or char_length(v_subject) > 160 then
        raise exception using errcode = '22023', message = 'Subjek harus berisi 3 sampai 160 karakter.';
    end if;

    if char_length(v_message) < 10 or char_length(v_message) > 3000 then
        raise exception using errcode = '22023', message = 'Pertanyaan harus berisi 10 sampai 3000 karakter.';
    end if;

    if (
        select count(*)
        from public.laporan_siswa as l
        where l.siswa_id = p_id
          and l.created_at > now() - interval '1 hour'
    ) >= 8 then
        raise exception using errcode = 'P0001', message = 'Batas pengiriman laporan tercapai. Coba lagi satu jam kemudian.';
    end if;

    select a.* into v_student
    from public.akunsiswa as a
    where a.id = p_id
    limit 1;

    if not found then
        raise exception using errcode = 'P0002', message = 'Profil siswa tidak ditemukan.';
    end if;

    insert into public.laporan_siswa (
        siswa_id, sumber, kategori, subjek, pesan,
        nama_siswa, nis, username, jenjang, kelas, sekolah, foto
    ) values (
        v_student.id, 'profil', v_category, v_subject, v_message,
        v_student.nama_siswa, v_student.nis, v_student.username,
        v_student.jenjang, v_student.kelas, v_student.sekolah, v_student.foto
    ) returning * into v_report;

    return to_jsonb(v_report);
end;
$$;

create function public.siswa_list_laporan(
    p_id uuid,
    p_session_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_result jsonb;
begin
    if not public.validasi_sesi_siswa(p_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi siswa tidak valid atau sudah berakhir.';
    end if;

    select coalesce(jsonb_agg(to_jsonb(report_row) order by report_row.created_at desc), '[]'::jsonb)
    into v_result
    from (
        select l.id, l.kategori, l.subjek, l.pesan, l.status,
               l.balasan_admin, l.ditanggapi_at, l.created_at, l.updated_at
        from public.laporan_siswa as l
        where l.siswa_id = p_id
        order by l.created_at desc
        limit 30
    ) as report_row;

    return v_result;
end;
$$;

create function public.publik_kirim_laporan_login(
    p_identifier text,
    p_nama text,
    p_kontak text,
    p_kategori text,
    p_subjek text,
    p_pesan text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
    v_report public.laporan_siswa%rowtype;
    v_identifier text := btrim(coalesce(p_identifier, ''));
    v_name text := btrim(coalesce(p_nama, ''));
    v_contact text := btrim(coalesce(p_kontak, ''));
    v_category text := lower(btrim(coalesce(p_kategori, 'akun_login')));
    v_subject text := btrim(coalesce(p_subjek, ''));
    v_message text := btrim(coalesce(p_pesan, ''));
begin
    if char_length(v_identifier) < 2 or char_length(v_identifier) > 100 then
        raise exception using errcode = '22023', message = 'Masukkan NIS atau username yang bermasalah.';
    end if;

    if char_length(v_name) > 150 or char_length(v_contact) > 120 then
        raise exception using errcode = '22023', message = 'Nama atau kontak terlalu panjang.';
    end if;

    if v_category not in ('akun_login', 'data_profil', 'modul', 'tugas', 'nilai', 'teknis', 'lainnya') then
        v_category := 'akun_login';
    end if;

    if char_length(v_subject) < 3 or char_length(v_subject) > 160 then
        raise exception using errcode = '22023', message = 'Subjek harus berisi 3 sampai 160 karakter.';
    end if;

    if char_length(v_message) < 10 or char_length(v_message) > 3000 then
        raise exception using errcode = '22023', message = 'Pertanyaan harus berisi 10 sampai 3000 karakter.';
    end if;

    if exists (
        select 1
        from public.laporan_siswa as l
        where l.sumber = 'login'
          and lower(coalesce(l.identifier_login, '')) = lower(v_identifier)
          and l.created_at > now() - interval '2 minutes'
    ) then
        raise exception using errcode = 'P0001', message = 'Laporan baru saja dikirim. Tunggu dua menit sebelum mengirim lagi.';
    end if;

    select a.* into v_student
    from public.akunsiswa as a
    where a.nis = v_identifier
       or lower(a.username) = lower(v_identifier)
    limit 1;

    insert into public.laporan_siswa (
        siswa_id, sumber, kategori, subjek, pesan, identifier_login, kontak,
        nama_siswa, nis, username, jenjang, kelas, sekolah, foto
    ) values (
        v_student.id,
        'login', v_category, v_subject, v_message, v_identifier, nullif(v_contact, ''),
        coalesce(v_student.nama_siswa, nullif(v_name, '')),
        v_student.nis,
        v_student.username,
        v_student.jenjang,
        v_student.kelas,
        v_student.sekolah,
        v_student.foto
    ) returning * into v_report;

    return jsonb_build_object(
        'id', v_report.id,
        'status', v_report.status,
        'created_at', v_report.created_at
    );
end;
$$;

create function public.admin_list_laporan_siswa(
    p_status text default '',
    p_search text default ''
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_agg(to_jsonb(report_row) order by report_row.created_at desc), '[]'::jsonb)
    from (
        select
            l.id, l.siswa_id, l.sumber, l.kategori, l.subjek, l.pesan,
            l.status, l.balasan_admin, l.identifier_login, l.kontak,
            coalesce(a.nama_siswa, l.nama_siswa) as nama_siswa,
            coalesce(a.nis, l.nis) as nis,
            coalesce(a.username, l.username) as username,
            coalesce(a.jenjang, l.jenjang) as jenjang,
            coalesce(a.kelas, l.kelas) as kelas,
            coalesce(a.sekolah, l.sekolah) as sekolah,
            coalesce(a.foto, l.foto) as foto,
            a.status as status_akun,
            a.terakhir_login,
            a.created_at as akun_created_at,
            a.updated_at as akun_updated_at,
            l.ditanggapi_at, l.created_at, l.updated_at
        from public.laporan_siswa as l
        left join public.akunsiswa as a on a.id = l.siswa_id
        where (btrim(coalesce(p_status, '')) = '' or l.status = lower(btrim(p_status)))
          and (
              btrim(coalesce(p_search, '')) = ''
              or coalesce(a.nama_siswa, l.nama_siswa, '') ilike '%' || btrim(p_search) || '%'
              or coalesce(a.nis, l.nis, '') ilike '%' || btrim(p_search) || '%'
              or coalesce(a.username, l.username, '') ilike '%' || btrim(p_search) || '%'
              or l.subjek ilike '%' || btrim(p_search) || '%'
              or l.pesan ilike '%' || btrim(p_search) || '%'
          )
        order by l.created_at desc
        limit 300
    ) as report_row;
$$;

create function public.admin_update_laporan_siswa(
    p_id uuid,
    p_status text,
    p_balasan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_status text := lower(btrim(coalesce(p_status, 'dibaca')));
    v_reply text := nullif(btrim(coalesce(p_balasan, '')), '');
    v_report public.laporan_siswa%rowtype;
begin
    if v_status not in ('baru', 'dibaca', 'diproses', 'selesai') then
        raise exception using errcode = '22023', message = 'Status laporan tidak valid.';
    end if;

    if v_reply is not null and char_length(v_reply) > 3000 then
        raise exception using errcode = '22023', message = 'Balasan admin maksimal 3000 karakter.';
    end if;

    update public.laporan_siswa
    set status = v_status,
        balasan_admin = v_reply,
        ditanggapi_at = case
            when v_reply is not null or v_status in ('diproses', 'selesai') then now()
            else ditanggapi_at
        end
    where id = p_id
    returning * into v_report;

    if not found then
        raise exception using errcode = 'P0002', message = 'Laporan siswa tidak ditemukan.';
    end if;

    return to_jsonb(v_report);
end;
$$;

revoke execute on function public.siswa_kirim_laporan(uuid, text, text, text, text) from public;
revoke execute on function public.siswa_list_laporan(uuid, text) from public;
revoke execute on function public.publik_kirim_laporan_login(text, text, text, text, text, text) from public;
revoke execute on function public.admin_list_laporan_siswa(text, text) from public;
revoke execute on function public.admin_update_laporan_siswa(uuid, text, text) from public;

grant execute on function public.siswa_kirim_laporan(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.siswa_list_laporan(uuid, text) to anon, authenticated;
grant execute on function public.publik_kirim_laporan_login(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_list_laporan_siswa(text, text) to anon, authenticated;
grant execute on function public.admin_update_laporan_siswa(uuid, text, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Setelah query berhasil, muat ulang halaman Profil/Login dan Admin.
