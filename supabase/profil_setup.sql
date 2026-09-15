-- =========================================================
-- EDUSKY - PROFIL DAN SESI AMAN SISWA
-- Jalankan setelah supabase/akunsiswa_setup.sql.
-- =========================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.akunsiswa
add column if not exists preferensi jsonb not null default jsonb_build_object(
    'tema', 'light',
    'notifikasi', true,
    'suara', true
);

create table if not exists public.siswa_sessions (
    id uuid primary key default extensions.gen_random_uuid(),
    siswa_id uuid not null references public.akunsiswa(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index if not exists siswa_sessions_siswa_id_idx
on public.siswa_sessions (siswa_id);

create index if not exists siswa_sessions_expires_at_idx
on public.siswa_sessions (expires_at);

alter table public.siswa_sessions enable row level security;
revoke all on table public.siswa_sessions from anon, authenticated;

drop function if exists public.siswa_get_profil(uuid, text);
drop function if exists public.siswa_update_profil(uuid, text, text, text, text, jsonb);
drop function if exists public.siswa_change_password(uuid, text, text, text);
drop function if exists public.siswa_logout(uuid, text);
drop function if exists public.siswa_logout_semua(uuid, text);
drop function if exists public.login_siswa(text, text);
drop function if exists public.validasi_sesi_siswa(uuid, text);
drop function if exists public.siswa_hash_token(text);

create function public.siswa_hash_token(p_token text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
    select pg_catalog.encode(
        extensions.digest(
            pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'),
            'sha256'
        ),
        'hex'
    );
$$;

create function public.validasi_sesi_siswa(
    p_id uuid,
    p_session_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.siswa_sessions as s
        join public.akunsiswa as a on a.id = s.siswa_id
        where s.siswa_id = p_id
          and s.token_hash = public.siswa_hash_token(p_session_token)
          and s.expires_at > now()
          and a.status = 'aktif'
    );
$$;

-- Login mengembalikan token acak. Database hanya menyimpan hash token.
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
    v_token text;
    v_expires_at timestamptz := now() + interval '7 days';
begin
    if v_identifier = '' or coalesce(p_password, '') = '' then
        return null;
    end if;

    select a.*
    into v_student
    from public.akunsiswa as a
    where a.status = 'aktif'
      and (
          a.nis = v_identifier
          or lower(a.username) = lower(v_identifier)
      )
      and a.password_hash = extensions.crypt(p_password, a.password_hash)
    limit 1;

    if not found then
        return null;
    end if;

    delete from public.siswa_sessions
    where expires_at <= now();

    v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.siswa_sessions (siswa_id, token_hash, expires_at)
    values (v_student.id, public.siswa_hash_token(v_token), v_expires_at);

    update public.akunsiswa as a
    set terakhir_login = now()
    where a.id = v_student.id
    returning a.* into v_student;

    return (to_jsonb(v_student) - 'password_hash') || jsonb_build_object(
        'session_token', v_token,
        'session_expires_at', v_expires_at
    );
end;
$$;

create function public.siswa_get_profil(
    p_id uuid,
    p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
begin
    if not public.validasi_sesi_siswa(p_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi siswa tidak valid atau sudah berakhir.';
    end if;

    update public.siswa_sessions
    set last_seen_at = now()
    where siswa_id = p_id
      and token_hash = public.siswa_hash_token(p_session_token);

    select a.* into v_student
    from public.akunsiswa as a
    where a.id = p_id
    limit 1;

    if not found then
        raise exception using errcode = 'P0002', message = 'Profil siswa tidak ditemukan.';
    end if;

    return to_jsonb(v_student) - 'password_hash';
end;
$$;

create function public.siswa_update_profil(
    p_id uuid,
    p_session_token text,
    p_nama_siswa text,
    p_username text,
    p_foto text default null,
    p_preferensi jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student public.akunsiswa%rowtype;
    v_name text := btrim(coalesce(p_nama_siswa, ''));
    v_username text := btrim(coalesce(p_username, ''));
    v_photo text := nullif(btrim(coalesce(p_foto, '')), '');
    v_theme text := lower(coalesce(p_preferensi->>'tema', 'light'));
    v_preferences jsonb;
begin
    if not public.validasi_sesi_siswa(p_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi siswa tidak valid atau sudah berakhir.';
    end if;

    if v_name = '' then
        raise exception using errcode = '22023', message = 'Nama lengkap wajib diisi.';
    end if;

    if v_username = '' or char_length(v_username) < 3 or v_username ~ '[[:space:]]' then
        raise exception using errcode = '22023', message = 'Username minimal 3 karakter dan tidak boleh mengandung spasi.';
    end if;

    if v_photo is not null
       and char_length(v_photo) > 700000 then
        raise exception using errcode = '22023', message = 'Ukuran foto profil terlalu besar.';
    end if;

    if v_photo is not null
       and v_photo !~* '^(https?://|data:image/(jpeg|png|webp);base64,)' then
        raise exception using errcode = '22023', message = 'Format foto profil tidak valid.';
    end if;

    if v_theme not in ('light', 'dark', 'system') then
        v_theme := 'light';
    end if;

    v_preferences := jsonb_build_object(
        'tema', v_theme,
        'notifikasi', coalesce((p_preferensi->>'notifikasi')::boolean, true),
        'suara', coalesce((p_preferensi->>'suara')::boolean, true)
    );

    update public.akunsiswa as a
    set nama_siswa = v_name,
        username = v_username,
        foto = v_photo,
        preferensi = v_preferences
    where a.id = p_id
    returning a.* into v_student;

    if not found then
        raise exception using errcode = 'P0002', message = 'Profil siswa tidak ditemukan.';
    end if;

    return to_jsonb(v_student) - 'password_hash';
end;
$$;

create function public.siswa_change_password(
    p_id uuid,
    p_session_token text,
    p_current_password text,
    p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_password_hash text;
begin
    if not public.validasi_sesi_siswa(p_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi siswa tidak valid atau sudah berakhir.';
    end if;

    if char_length(coalesce(p_new_password, '')) < 6 then
        raise exception using errcode = '22023', message = 'Password baru minimal 6 karakter.';
    end if;

    select a.password_hash into v_password_hash
    from public.akunsiswa as a
    where a.id = p_id
      and a.status = 'aktif'
    limit 1;

    if not found
       or v_password_hash <> extensions.crypt(coalesce(p_current_password, ''), v_password_hash) then
        raise exception using errcode = '28P01', message = 'Password saat ini tidak sesuai.';
    end if;

    update public.akunsiswa
    set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12))
    where id = p_id;

    return true;
end;
$$;

create function public.siswa_logout(
    p_id uuid,
    p_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.siswa_sessions
    where siswa_id = p_id
      and token_hash = public.siswa_hash_token(p_session_token);

    return true;
end;
$$;

create function public.siswa_logout_semua(
    p_id uuid,
    p_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.validasi_sesi_siswa(p_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi siswa tidak valid atau sudah berakhir.';
    end if;

    delete from public.siswa_sessions
    where siswa_id = p_id;

    return true;
end;
$$;

revoke execute on function public.siswa_hash_token(text) from public;
revoke execute on function public.validasi_sesi_siswa(uuid, text) from public;
revoke execute on function public.login_siswa(text, text) from public;
revoke execute on function public.siswa_get_profil(uuid, text) from public;
revoke execute on function public.siswa_update_profil(uuid, text, text, text, text, jsonb) from public;
revoke execute on function public.siswa_change_password(uuid, text, text, text) from public;
revoke execute on function public.siswa_logout(uuid, text) from public;
revoke execute on function public.siswa_logout_semua(uuid, text) from public;

grant execute on function public.login_siswa(text, text) to anon, authenticated;
grant execute on function public.siswa_get_profil(uuid, text) to anon, authenticated;
grant execute on function public.siswa_update_profil(uuid, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.siswa_change_password(uuid, text, text, text) to anon, authenticated;
grant execute on function public.siswa_logout(uuid, text) to anon, authenticated;
grant execute on function public.siswa_logout_semua(uuid, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Setelah query sukses:
-- 1. Logout dari akun siswa lama.
-- 2. Login kembali agar session_token tersimpan di browser.
-- 3. Buka halaman pages/profil/index.html.
