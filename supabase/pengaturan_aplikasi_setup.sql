-- =========================================================
-- EDUSKY - PENGATURAN GLOBAL APLIKASI DAN SESI ADMIN
-- Jalankan satu kali melalui Supabase SQL Editor.
-- =========================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_akun (
    id uuid primary key default extensions.gen_random_uuid(),
    username varchar(50) not null,
    password_hash text not null,
    nama_admin varchar(100) not null default 'Administrator EduSky',
    status varchar(20) not null default 'aktif',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint admin_akun_status_check check (status in ('aktif', 'nonaktif'))
);

create unique index if not exists admin_akun_username_unique
on public.admin_akun (lower(username));

create table if not exists public.admin_sesi (
    token_hash text primary key,
    admin_id uuid not null references public.admin_akun(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists admin_sesi_admin_idx
on public.admin_sesi (admin_id, expires_at desc);

create table if not exists public.pengaturan_aplikasi (
    id smallint primary key default 1,
    nama_aplikasi varchar(80) not null default 'EduSky Learning',
    tahun_ajaran varchar(20) not null default '2026/2027',
    nama_admin varchar(80) not null default 'Administrator',
    tema_admin varchar(20) not null default 'light',
    whatsapp_admin varchar(15) null,
    logo_aplikasi text null,
    logo_scale numeric(4,2) not null default 1.00,
    logo_position_x smallint not null default 0,
    logo_position_y smallint not null default 0,
    updated_by uuid null references public.admin_akun(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pengaturan_aplikasi_singleton_check check (id = 1),
    constraint pengaturan_aplikasi_tema_check check (tema_admin in ('light', 'dark', 'system')),
    constraint pengaturan_aplikasi_whatsapp_check check (
        whatsapp_admin is null or whatsapp_admin ~ '^[0-9]{10,15}$'
    ),
    constraint pengaturan_aplikasi_logo_scale_check check (logo_scale between 0.50 and 3.00),
    constraint pengaturan_aplikasi_logo_position_x_check check (logo_position_x between -100 and 100),
    constraint pengaturan_aplikasi_logo_position_y_check check (logo_position_y between -100 and 100),
    constraint pengaturan_aplikasi_logo_check check (
        logo_aplikasi is null or (
            char_length(logo_aplikasi) <= 500000
            and (
                logo_aplikasi ~ '^data:image/(png|jpeg|webp);base64,'
                or logo_aplikasi ~ '^https://'
            )
        )
    )
);

-- Tetap menambahkan kolom ketika script ini dijalankan ulang pada instalasi lama.
alter table public.pengaturan_aplikasi
add column if not exists logo_aplikasi text null,
add column if not exists logo_scale numeric(4,2) not null default 1.00,
add column if not exists logo_position_x smallint not null default 0,
add column if not exists logo_position_y smallint not null default 0;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'pengaturan_aplikasi_logo_check'
          and conrelid = 'public.pengaturan_aplikasi'::regclass
    ) then
        alter table public.pengaturan_aplikasi
        add constraint pengaturan_aplikasi_logo_check check (
            logo_aplikasi is null or (
                char_length(logo_aplikasi) <= 500000
                and (
                    logo_aplikasi ~ '^data:image/(png|jpeg|webp);base64,'
                    or logo_aplikasi ~ '^https://'
                )
            )
        );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'pengaturan_aplikasi_logo_scale_check'
          and conrelid = 'public.pengaturan_aplikasi'::regclass
    ) then
        alter table public.pengaturan_aplikasi
        add constraint pengaturan_aplikasi_logo_scale_check
        check (logo_scale between 0.50 and 3.00);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'pengaturan_aplikasi_logo_position_x_check'
          and conrelid = 'public.pengaturan_aplikasi'::regclass
    ) then
        alter table public.pengaturan_aplikasi
        add constraint pengaturan_aplikasi_logo_position_x_check
        check (logo_position_x between -100 and 100);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'pengaturan_aplikasi_logo_position_y_check'
          and conrelid = 'public.pengaturan_aplikasi'::regclass
    ) then
        alter table public.pengaturan_aplikasi
        add constraint pengaturan_aplikasi_logo_position_y_check
        check (logo_position_y between -100 and 100);
    end if;
end;
$$;

create or replace function public.update_pengaturan_updated_at()
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

drop trigger if exists trigger_update_admin_akun on public.admin_akun;
create trigger trigger_update_admin_akun
before update on public.admin_akun
for each row execute function public.update_pengaturan_updated_at();

drop trigger if exists trigger_update_pengaturan_aplikasi on public.pengaturan_aplikasi;
create trigger trigger_update_pengaturan_aplikasi
before update on public.pengaturan_aplikasi
for each row execute function public.update_pengaturan_updated_at();

-- Akun awal mengikuti kredensial prototype lama. Segera ganti password_hash
-- melalui SQL Editor sebelum website dipublikasikan.
insert into public.admin_akun (username, password_hash, nama_admin)
select
    'admin',
    extensions.crypt('Admin123', extensions.gen_salt('bf', 12)),
    'Administrator EduSky'
where not exists (select 1 from public.admin_akun);

insert into public.pengaturan_aplikasi (id)
values (1)
on conflict (id) do nothing;

alter table public.admin_akun enable row level security;
alter table public.admin_sesi enable row level security;
alter table public.pengaturan_aplikasi enable row level security;

revoke all on table public.admin_akun from anon, authenticated;
revoke all on table public.admin_sesi from anon, authenticated;
revoke all on table public.pengaturan_aplikasi from anon, authenticated;

drop function if exists public.validasi_sesi_admin(uuid, text);
drop function if exists public.login_admin(text, text);
drop function if exists public.logout_admin(uuid, text);
drop function if exists public.publik_get_pengaturan_aplikasi();
drop function if exists public.admin_get_pengaturan_aplikasi(uuid, text);
drop function if exists public.admin_update_pengaturan_aplikasi(uuid, text, text, text, text, text, text);
drop function if exists public.admin_update_pengaturan_aplikasi(uuid, text, text, text, text, text, text, text);
drop function if exists public.admin_update_pengaturan_aplikasi(uuid, text, text, text, text, text, text, text, numeric, integer, integer);

create function public.validasi_sesi_admin(
    p_admin_id uuid,
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
        from public.admin_sesi as s
        join public.admin_akun as a on a.id = s.admin_id
        where s.admin_id = p_admin_id
          and s.token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
          and s.expires_at > now()
          and a.status = 'aktif'
    );
$$;

create function public.login_admin(
    p_username text,
    p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_admin public.admin_akun%rowtype;
    v_token text;
    v_expires_at timestamptz := now() + interval '8 hours';
begin
    delete from public.admin_sesi where expires_at <= now();

    select a.* into v_admin
    from public.admin_akun as a
    where lower(a.username) = lower(btrim(coalesce(p_username, '')))
      and a.status = 'aktif'
    limit 1;

    if not found
       or v_admin.password_hash <> extensions.crypt(coalesce(p_password, ''), v_admin.password_hash) then
        return null;
    end if;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.admin_sesi (token_hash, admin_id, expires_at)
    values (
        encode(extensions.digest(v_token, 'sha256'), 'hex'),
        v_admin.id,
        v_expires_at
    );

    return jsonb_build_object(
        'admin_id', v_admin.id,
        'username', v_admin.username,
        'nama', v_admin.nama_admin,
        'role', 'admin',
        'isLoggedIn', true,
        'session_token', v_token,
        'expires_at', v_expires_at
    );
end;
$$;

create function public.logout_admin(
    p_admin_id uuid,
    p_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.admin_sesi
    where admin_id = p_admin_id
      and token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex');
    return found;
end;
$$;

create function public.publik_get_pengaturan_aplikasi()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'app_name', p.nama_aplikasi,
        'academic_year', p.tahun_ajaran,
        'admin_name', p.nama_admin,
        'admin_theme', p.tema_admin,
        'whatsapp', coalesce(p.whatsapp_admin, ''),
        'logo', coalesce(p.logo_aplikasi, ''),
        'logo_scale', p.logo_scale,
        'logo_x', p.logo_position_x,
        'logo_y', p.logo_position_y,
        'updated_at', p.updated_at
    )
    from public.pengaturan_aplikasi as p
    where p.id = 1;
$$;

create function public.admin_get_pengaturan_aplikasi(
    p_admin_id uuid,
    p_session_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.validasi_sesi_admin(p_admin_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi admin tidak valid atau sudah berakhir.';
    end if;

    return public.publik_get_pengaturan_aplikasi();
end;
$$;

create function public.admin_update_pengaturan_aplikasi(
    p_admin_id uuid,
    p_session_token text,
    p_nama_aplikasi text,
    p_tahun_ajaran text,
    p_nama_admin text,
    p_tema_admin text,
    p_whatsapp_admin text default null,
    p_logo_aplikasi text default null,
    p_logo_scale numeric default 1.00,
    p_logo_position_x integer default 0,
    p_logo_position_y integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_app_name text := btrim(coalesce(p_nama_aplikasi, ''));
    v_year text := btrim(coalesce(p_tahun_ajaran, ''));
    v_admin_name text := btrim(coalesce(p_nama_admin, ''));
    v_theme text := lower(btrim(coalesce(p_tema_admin, 'light')));
    v_whatsapp text := nullif(regexp_replace(coalesce(p_whatsapp_admin, ''), '[^0-9]', '', 'g'), '');
    v_logo text := nullif(btrim(coalesce(p_logo_aplikasi, '')), '');
    v_logo_scale numeric := coalesce(p_logo_scale, 1.00);
    v_logo_x integer := coalesce(p_logo_position_x, 0);
    v_logo_y integer := coalesce(p_logo_position_y, 0);
begin
    if not public.validasi_sesi_admin(p_admin_id, p_session_token) then
        raise exception using errcode = '28000', message = 'Sesi admin tidak valid atau sudah berakhir.';
    end if;

    if char_length(v_app_name) < 3 or char_length(v_app_name) > 80 then
        raise exception using errcode = '22023', message = 'Nama aplikasi harus berisi 3 sampai 80 karakter.';
    end if;

    if v_year !~ '^[0-9]{4}[[:space:]]*/[[:space:]]*[0-9]{4}$' then
        raise exception using errcode = '22023', message = 'Tahun ajaran harus menggunakan format 2026/2027.';
    end if;

    if char_length(v_admin_name) < 3 or char_length(v_admin_name) > 80 then
        raise exception using errcode = '22023', message = 'Nama administrator harus berisi 3 sampai 80 karakter.';
    end if;

    if v_theme not in ('light', 'dark', 'system') then
        raise exception using errcode = '22023', message = 'Tema dashboard tidak valid.';
    end if;

    if v_whatsapp is not null and v_whatsapp !~ '^[0-9]{10,15}$' then
        raise exception using errcode = '22023', message = 'Nomor WhatsApp harus berisi 10 sampai 15 digit.';
    end if;

    if v_logo is not null and (
        char_length(v_logo) > 500000
        or (
            v_logo !~ '^data:image/(png|jpeg|webp);base64,'
            and v_logo !~ '^https://'
        )
    ) then
        raise exception using errcode = '22023', message = 'Logo harus berupa JPEG, PNG, WebP, atau URL HTTPS dengan ukuran yang sesuai.';
    end if;

    if v_logo_scale < 0.50 or v_logo_scale > 3.00 then
        raise exception using errcode = '22023', message = 'Ukuran logo harus berada antara 50% sampai 300%.';
    end if;

    if v_logo_x < -100 or v_logo_x > 100 or v_logo_y < -100 or v_logo_y > 100 then
        raise exception using errcode = '22023', message = 'Posisi logo harus berada antara -100 sampai 100.';
    end if;

    update public.pengaturan_aplikasi
    set nama_aplikasi = v_app_name,
        tahun_ajaran = regexp_replace(v_year, '[[:space:]]', '', 'g'),
        nama_admin = v_admin_name,
        tema_admin = v_theme,
        whatsapp_admin = v_whatsapp,
        logo_aplikasi = v_logo,
        logo_scale = v_logo_scale,
        logo_position_x = v_logo_x,
        logo_position_y = v_logo_y,
        updated_by = p_admin_id
    where id = 1;

    update public.admin_akun
    set nama_admin = v_admin_name
    where id = p_admin_id;

    return public.publik_get_pengaturan_aplikasi();
end;
$$;

revoke execute on function public.validasi_sesi_admin(uuid, text) from public;
revoke execute on function public.login_admin(text, text) from public;
revoke execute on function public.logout_admin(uuid, text) from public;
revoke execute on function public.publik_get_pengaturan_aplikasi() from public;
revoke execute on function public.admin_get_pengaturan_aplikasi(uuid, text) from public;
revoke execute on function public.admin_update_pengaturan_aplikasi(uuid, text, text, text, text, text, text, text, numeric, integer, integer) from public;

grant execute on function public.login_admin(text, text) to anon, authenticated;
grant execute on function public.logout_admin(uuid, text) to anon, authenticated;
grant execute on function public.publik_get_pengaturan_aplikasi() to anon, authenticated;
grant execute on function public.admin_get_pengaturan_aplikasi(uuid, text) to anon, authenticated;
grant execute on function public.admin_update_pengaturan_aplikasi(uuid, text, text, text, text, text, text, text, numeric, integer, integer) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Login awal setelah instalasi:
-- username: admin
-- password: Admin123
-- Ganti password sebelum hosting dengan:
-- update public.admin_akun
-- set password_hash = extensions.crypt('PASSWORD_BARU', extensions.gen_salt('bf', 12))
-- where lower(username) = 'admin';
