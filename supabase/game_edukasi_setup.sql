-- =========================================================
-- EDUSKY - GAME EDUKASI KELAS 5
-- Jalankan seluruh file ini melalui Supabase SQL Editor.
-- =========================================================

begin;

create table if not exists public.game_edukasi (
  id uuid primary key default gen_random_uuid(),
  judul varchar(120) not null,
  mata_pelajaran varchar(40) not null,
  kelas varchar(30),
  deskripsi varchar(240),
  urutan_level integer not null default 1,
  kesulitan varchar(20) not null default 'Mudah',
  jenis_game varchar(30) not null default 'quiz',
  nilai_lulus integer not null default 70,
  batas_waktu integer not null default 90,
  poin integer not null default 100,
  status varchar(20) not null default 'aktif',
  soal jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_mapel_check check (mata_pelajaran in ('Matematika', 'Bahasa Inggris')),
  constraint game_kesulitan_check check (kesulitan in ('Mudah', 'Sedang', 'Sulit')),
  constraint game_jenis_check check (jenis_game in ('quiz', 'true_false', 'scramble', 'puzzle')),
  constraint game_status_check check (status in ('aktif', 'draft')),
  constraint game_level_check check (urutan_level between 1 and 50),
  constraint game_nilai_check check (nilai_lulus between 1 and 100),
  constraint game_waktu_check check (batas_waktu between 15 and 1800),
  constraint game_poin_check check (poin between 0 and 10000),
  constraint game_soal_array_check check (jsonb_typeof(soal) = 'array')
);

-- Aman untuk instalasi lama: perluas jenis game dengan Puzzle Pasangan.
alter table public.game_edukasi add column if not exists kelas varchar(30);
alter table public.game_edukasi drop constraint if exists game_jenis_check;
alter table public.game_edukasi add constraint game_jenis_check
  check (jenis_game in ('quiz', 'true_false', 'scramble', 'puzzle'));
alter table public.game_edukasi drop constraint if exists game_mapel_level_unique;
create unique index if not exists game_kelas_mapel_level_unique_idx
  on public.game_edukasi (lower(coalesce(btrim(kelas), '')), mata_pelajaran, urutan_level);

create table if not exists public.progres_game_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.akunsiswa(id) on delete cascade,
  game_id uuid not null references public.game_edukasi(id) on delete cascade,
  nilai_terbaik integer not null default 0,
  bintang integer not null default 0,
  jumlah_percobaan integer not null default 1,
  selesai boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint progres_nilai_check check (nilai_terbaik between 0 and 100),
  constraint progres_bintang_check check (bintang between 0 and 3),
  constraint progres_siswa_game_unique unique (siswa_id, game_id)
);

create table if not exists public.reward_game_siswa (
  siswa_id uuid primary key references public.akunsiswa(id) on delete cascade,
  koin integer not null default 0,
  aktivitas_harian jsonb not null default '{}'::jsonb,
  misi_diklaim jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint reward_game_koin_check check (koin between 0 and 10000000),
  constraint reward_game_aktivitas_check check (jsonb_typeof(aktivitas_harian) = 'object'),
  constraint reward_game_misi_check check (jsonb_typeof(misi_diklaim) = 'object')
);

create table if not exists public.hasil_game_siswa (
  id uuid primary key default gen_random_uuid(),
  client_event_id varchar(80),
  siswa_id uuid not null references public.akunsiswa(id) on delete cascade,
  game_id uuid not null references public.game_edukasi(id) on delete cascade,
  nilai integer not null,
  bintang integer not null default 0,
  jumlah_benar integer not null default 0,
  jumlah_salah integer not null default 0,
  total_soal integer not null default 1,
  akurasi numeric(5,2) not null default 0,
  durasi_detik integer not null default 0,
  lulus boolean not null default false,
  selesai_at timestamptz not null default now(),
  constraint hasil_game_nilai_check check (nilai between 0 and 100),
  constraint hasil_game_bintang_check check (bintang between 0 and 3),
  constraint hasil_game_jumlah_check check (jumlah_benar >= 0 and jumlah_salah >= 0 and total_soal >= 1),
  constraint hasil_game_akurasi_check check (akurasi between 0 and 100),
  constraint hasil_game_durasi_check check (durasi_detik between 0 and 86400)
);

alter table public.hasil_game_siswa add column if not exists client_event_id varchar(80);
update public.hasil_game_siswa set client_event_id='legacy-'||id::text where client_event_id is null;
alter table public.hasil_game_siswa alter column client_event_id set not null;
create unique index if not exists hasil_game_client_event_idx on public.hasil_game_siswa(client_event_id);
create index if not exists hasil_game_siswa_game_idx on public.hasil_game_siswa(game_id,siswa_id,selesai_at desc);
create index if not exists hasil_game_siswa_waktu_idx on public.hasil_game_siswa(selesai_at desc);

create or replace function public.update_game_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trigger_update_game on public.game_edukasi;
create trigger trigger_update_game before update on public.game_edukasi
for each row execute function public.update_game_updated_at();

alter table public.game_edukasi enable row level security;
alter table public.progres_game_siswa enable row level security;
alter table public.reward_game_siswa enable row level security;
alter table public.hasil_game_siswa enable row level security;
revoke all on table public.game_edukasi, public.progres_game_siswa, public.reward_game_siswa, public.hasil_game_siswa from anon, authenticated;

drop function if exists public.list_game_siswa();
drop function if exists public.admin_list_game();
drop function if exists public.admin_upsert_game(uuid,text,text,text,integer,text,text,integer,integer,integer,text,jsonb);
drop function if exists public.admin_upsert_game(uuid,text,text,text,text,integer,text,text,integer,integer,integer,text,jsonb);
drop function if exists public.admin_delete_game(uuid);
drop function if exists public.list_progres_game_siswa(uuid,text);
drop function if exists public.simpan_progres_game(uuid,text,uuid,integer,integer);
drop function if exists public.list_reward_game_siswa(uuid,text);
drop function if exists public.simpan_reward_game_siswa(uuid,text,integer,jsonb,jsonb);
drop function if exists public.simpan_hasil_game(uuid,text,uuid,text,integer,integer,integer,integer,integer,integer);
drop function if exists public.admin_list_hasil_game();

create function public.list_game_siswa()
returns table (
  id uuid, judul varchar, mata_pelajaran varchar, kelas varchar, deskripsi varchar,
  urutan_level integer, kesulitan varchar, jenis_game varchar,
  nilai_lulus integer, batas_waktu integer, poin integer, status varchar, soal jsonb
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.judul, g.mata_pelajaran, g.kelas, g.deskripsi, g.urutan_level,
    g.kesulitan, g.jenis_game, g.nilai_lulus, g.batas_waktu, g.poin, g.status, g.soal
  from public.game_edukasi g where g.status = 'aktif'
  order by g.mata_pelajaran, g.urutan_level;
$$;

create function public.admin_list_game()
returns table (
  id uuid, judul varchar, mata_pelajaran varchar, kelas varchar, deskripsi varchar,
  urutan_level integer, kesulitan varchar, jenis_game varchar,
  nilai_lulus integer, batas_waktu integer, poin integer, status varchar, soal jsonb
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.judul, g.mata_pelajaran, g.kelas, g.deskripsi, g.urutan_level,
    g.kesulitan, g.jenis_game, g.nilai_lulus, g.batas_waktu, g.poin, g.status, g.soal
  from public.game_edukasi g order by g.mata_pelajaran, g.urutan_level;
$$;

create function public.admin_upsert_game(
  p_id uuid, p_judul text, p_mata_pelajaran text, p_kelas text, p_deskripsi text,
  p_urutan_level integer, p_kesulitan text, p_jenis_game text,
  p_nilai_lulus integer, p_batas_waktu integer, p_poin integer,
  p_status text, p_soal jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_game public.game_edukasi%rowtype;
begin
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul game wajib diisi.' using errcode = '22023'; end if;
  if p_mata_pelajaran not in ('Matematika', 'Bahasa Inggris') then raise exception 'Mata pelajaran tidak valid.' using errcode = '22023'; end if;
  if p_id is null and btrim(coalesce(p_kelas, '')) = '' then raise exception 'Kelas game wajib dipilih.' using errcode = '22023'; end if;
  if p_soal is null or jsonb_typeof(p_soal) <> 'array' or jsonb_array_length(p_soal) < 1 then raise exception 'Tambahkan minimal satu soal.' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.game_edukasi (judul,mata_pelajaran,kelas,deskripsi,urutan_level,kesulitan,jenis_game,nilai_lulus,batas_waktu,poin,status,soal)
    values (btrim(p_judul),p_mata_pelajaran,btrim(p_kelas),nullif(btrim(coalesce(p_deskripsi,'')),''),p_urutan_level,p_kesulitan,p_jenis_game,p_nilai_lulus,p_batas_waktu,p_poin,p_status,p_soal)
    returning * into v_game;
  else
    update public.game_edukasi set judul=btrim(p_judul),mata_pelajaran=p_mata_pelajaran,kelas=nullif(btrim(coalesce(p_kelas,'')),''),deskripsi=nullif(btrim(coalesce(p_deskripsi,'')),''),
      urutan_level=p_urutan_level,kesulitan=p_kesulitan,jenis_game=p_jenis_game,nilai_lulus=p_nilai_lulus,
      batas_waktu=p_batas_waktu,poin=p_poin,status=p_status,soal=p_soal where id=p_id returning * into v_game;
    if not found then raise exception 'Game tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return to_jsonb(v_game);
end;
$$;

create function public.admin_delete_game(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_game public.game_edukasi%rowtype;
begin
  delete from public.game_edukasi where id=p_id returning * into v_game;
  if not found then raise exception 'Game tidak ditemukan.' using errcode = 'P0002'; end if;
  return to_jsonb(v_game);
end;
$$;

create function public.list_progres_game_siswa(p_siswa_id uuid,p_session_token text)
returns table(game_id uuid,nilai_terbaik integer,bintang integer,jumlah_percobaan integer,selesai boolean,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.validasi_sesi_siswa(p_siswa_id,p_session_token) then raise exception 'Sesi siswa tidak valid.' using errcode='42501'; end if;
  return query select p.game_id,p.nilai_terbaik,p.bintang,p.jumlah_percobaan,p.selesai,p.updated_at
  from public.progres_game_siswa p where p.siswa_id=p_siswa_id;
end;
$$;

create function public.simpan_progres_game(p_siswa_id uuid,p_session_token text,p_game_id uuid,p_nilai integer,p_bintang integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target integer; v_progress public.progres_game_siswa%rowtype;
begin
  if not public.validasi_sesi_siswa(p_siswa_id,p_session_token) then raise exception 'Sesi siswa tidak valid.' using errcode='42501'; end if;
  select nilai_lulus into v_target from public.game_edukasi where id=p_game_id and status='aktif';
  if not found then raise exception 'Game tidak ditemukan.' using errcode='P0002'; end if;
  insert into public.progres_game_siswa(siswa_id,game_id,nilai_terbaik,bintang,jumlah_percobaan,selesai)
  values(p_siswa_id,p_game_id,greatest(0,least(p_nilai,100)),greatest(0,least(p_bintang,3)),1,p_nilai>=v_target)
  on conflict(siswa_id,game_id) do update set nilai_terbaik=greatest(public.progres_game_siswa.nilai_terbaik,excluded.nilai_terbaik),
    bintang=greatest(public.progres_game_siswa.bintang,excluded.bintang),jumlah_percobaan=public.progres_game_siswa.jumlah_percobaan+1,
    selesai=public.progres_game_siswa.selesai or excluded.selesai,updated_at=now()
  returning * into v_progress;
  return to_jsonb(v_progress);
end;
$$;

create function public.simpan_hasil_game(
  p_siswa_id uuid,
  p_session_token text,
  p_game_id uuid,
  p_client_event_id text,
  p_nilai integer,
  p_bintang integer,
  p_jumlah_benar integer,
  p_jumlah_salah integer,
  p_total_soal integer,
  p_durasi_detik integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_target integer;
  v_nilai integer := greatest(0,least(coalesce(p_nilai,0),100));
  v_bintang integer := greatest(0,least(coalesce(p_bintang,0),3));
  v_benar integer := greatest(0,coalesce(p_jumlah_benar,0));
  v_salah integer := greatest(0,coalesce(p_jumlah_salah,0));
  v_total integer := greatest(1,coalesce(p_total_soal,1));
  v_durasi integer := greatest(0,least(coalesce(p_durasi_detik,0),86400));
  v_akurasi numeric(5,2);
  v_result public.hasil_game_siswa%rowtype;
begin
  if not public.validasi_sesi_siswa(p_siswa_id,p_session_token) then raise exception 'Sesi siswa tidak valid.' using errcode='42501'; end if;
  if btrim(coalesce(p_client_event_id,'')) = '' then raise exception 'ID hasil game tidak valid.' using errcode='22023'; end if;
  select * into v_result from public.hasil_game_siswa where client_event_id=btrim(p_client_event_id) and siswa_id=p_siswa_id;
  if found then return to_jsonb(v_result); end if;
  select nilai_lulus into v_target from public.game_edukasi where id=p_game_id and status='aktif';
  if not found then raise exception 'Game tidak ditemukan.' using errcode='P0002'; end if;
  v_benar := least(v_benar,v_total);
  v_akurasi := round(case when v_benar+v_salah > 0 then v_benar::numeric/(v_benar+v_salah)*100 else v_nilai end,2);
  insert into public.hasil_game_siswa(client_event_id,siswa_id,game_id,nilai,bintang,jumlah_benar,jumlah_salah,total_soal,akurasi,durasi_detik,lulus)
  values(btrim(p_client_event_id),p_siswa_id,p_game_id,v_nilai,v_bintang,v_benar,v_salah,v_total,v_akurasi,v_durasi,v_nilai>=v_target)
  returning * into v_result;
  insert into public.progres_game_siswa(siswa_id,game_id,nilai_terbaik,bintang,jumlah_percobaan,selesai)
  values(p_siswa_id,p_game_id,v_nilai,v_bintang,1,v_nilai>=v_target)
  on conflict(siswa_id,game_id) do update set
    nilai_terbaik=greatest(public.progres_game_siswa.nilai_terbaik,excluded.nilai_terbaik),
    bintang=greatest(public.progres_game_siswa.bintang,excluded.bintang),
    jumlah_percobaan=public.progres_game_siswa.jumlah_percobaan+1,
    selesai=public.progres_game_siswa.selesai or excluded.selesai,
    updated_at=now();
  return to_jsonb(v_result);
end;
$$;

create function public.admin_list_hasil_game()
returns table(
  id uuid, siswa_id uuid, nama_siswa varchar, nis varchar, foto text, kelas varchar,
  game_id uuid, judul_game varchar, mata_pelajaran varchar, level integer,
  kesulitan varchar, jenis_game varchar, nilai_lulus integer, batas_waktu integer,
  nilai integer, bintang integer, jumlah_benar integer, jumlah_salah integer,
  total_soal integer, akurasi numeric, durasi_detik integer, lulus boolean,
  selesai_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select h.id,h.siswa_id,s.nama_siswa,s.nis,s.foto,s.kelas,
    g.id,g.judul,g.mata_pelajaran,g.urutan_level,g.kesulitan,g.jenis_game,
    g.nilai_lulus,g.batas_waktu,h.nilai,h.bintang,h.jumlah_benar,h.jumlah_salah,
    h.total_soal,h.akurasi,h.durasi_detik,h.lulus,h.selesai_at
  from public.hasil_game_siswa h
  join public.akunsiswa s on s.id=h.siswa_id
  join public.game_edukasi g on g.id=h.game_id
  order by lower(s.kelas),lower(g.mata_pelajaran),g.urutan_level,lower(s.nama_siswa),h.selesai_at desc;
$$;

create function public.list_reward_game_siswa(p_siswa_id uuid,p_session_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_reward public.reward_game_siswa%rowtype;
begin
  if not public.validasi_sesi_siswa(p_siswa_id,p_session_token) then raise exception 'Sesi siswa tidak valid.' using errcode='42501'; end if;
  select * into v_reward from public.reward_game_siswa where siswa_id=p_siswa_id;
  if not found then
    return jsonb_build_object('coins',0,'activity','{}'::jsonb,'claimedMissions','{}'::jsonb);
  end if;
  return jsonb_build_object('coins',v_reward.koin,'activity',v_reward.aktivitas_harian,'claimedMissions',v_reward.misi_diklaim,'updatedAt',v_reward.updated_at);
end;
$$;

create function public.simpan_reward_game_siswa(
  p_siswa_id uuid,
  p_session_token text,
  p_koin integer,
  p_aktivitas_harian jsonb,
  p_misi_diklaim jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_reward public.reward_game_siswa%rowtype;
begin
  if not public.validasi_sesi_siswa(p_siswa_id,p_session_token) then raise exception 'Sesi siswa tidak valid.' using errcode='42501'; end if;
  if p_koin < 0 or p_koin > 10000000 then raise exception 'Jumlah koin tidak valid.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_aktivitas_harian,'{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_misi_diklaim,'{}'::jsonb)) <> 'object' then
    raise exception 'Data petualangan tidak valid.' using errcode='22023';
  end if;
  insert into public.reward_game_siswa(siswa_id,koin,aktivitas_harian,misi_diklaim,updated_at)
  values(p_siswa_id,p_koin,coalesce(p_aktivitas_harian,'{}'::jsonb),coalesce(p_misi_diklaim,'{}'::jsonb),now())
  on conflict(siswa_id) do update set koin=excluded.koin,aktivitas_harian=excluded.aktivitas_harian,misi_diklaim=excluded.misi_diklaim,updated_at=now()
  returning * into v_reward;
  return jsonb_build_object('coins',v_reward.koin,'activity',v_reward.aktivitas_harian,'claimedMissions',v_reward.misi_diklaim,'updatedAt',v_reward.updated_at);
end;
$$;

revoke execute on function public.list_game_siswa() from public;
revoke execute on function public.admin_list_game() from public;
revoke execute on function public.admin_upsert_game(uuid,text,text,text,text,integer,text,text,integer,integer,integer,text,jsonb) from public;
revoke execute on function public.admin_delete_game(uuid) from public;
revoke execute on function public.list_progres_game_siswa(uuid,text) from public;
revoke execute on function public.simpan_progres_game(uuid,text,uuid,integer,integer) from public;
revoke execute on function public.list_reward_game_siswa(uuid,text) from public;
revoke execute on function public.simpan_reward_game_siswa(uuid,text,integer,jsonb,jsonb) from public;
revoke execute on function public.simpan_hasil_game(uuid,text,uuid,text,integer,integer,integer,integer,integer,integer) from public;
revoke execute on function public.admin_list_hasil_game() from public;
grant execute on function public.list_game_siswa() to anon, authenticated;
grant execute on function public.admin_list_game() to anon, authenticated;
grant execute on function public.admin_upsert_game(uuid,text,text,text,text,integer,text,text,integer,integer,integer,text,jsonb) to anon, authenticated;
grant execute on function public.admin_delete_game(uuid) to anon, authenticated;
grant execute on function public.list_progres_game_siswa(uuid,text) to anon, authenticated;
grant execute on function public.simpan_progres_game(uuid,text,uuid,integer,integer) to anon, authenticated;
grant execute on function public.list_reward_game_siswa(uuid,text) to anon, authenticated;
grant execute on function public.simpan_reward_game_siswa(uuid,text,integer,jsonb,jsonb) to anon, authenticated;
grant execute on function public.simpan_hasil_game(uuid,text,uuid,text,integer,integer,integer,integer,integer,integer) to anon, authenticated;
grant execute on function public.admin_list_hasil_game() to anon, authenticated;

-- Paket awal siap main. Seluruh isinya dapat diubah dari dashboard admin.
insert into public.game_edukasi
  (judul,mata_pelajaran,deskripsi,urutan_level,kesulitan,jenis_game,nilai_lulus,batas_waktu,poin,status,soal)
values
  ('Misi Hitung Cepat','Matematika','Taklukkan operasi hitung bilangan cacah.',1,'Mudah','quiz',60,90,100,'aktif',
   '[{"prompt":"Hasil dari 2.450 + 1.275 adalah ...","options":["3.625","3.725","3.825","4.725"],"answer":"3.725","explanation":"2.450 + 1.275 = 3.725."},{"prompt":"125 × 8 = ...","options":["900","1.000","1.080","1.200"],"answer":"1.000","explanation":"100 × 8 + 25 × 8 = 1.000."}]'::jsonb),
  ('Pecahan Pizza','Matematika','Bandingkan dan hitung pecahan senilai.',2,'Sedang','quiz',70,80,150,'aktif',
   '[{"prompt":"Pecahan yang senilai dengan 3/4 adalah ...","options":["4/5","6/8","8/10","9/16"],"answer":"6/8","explanation":"Pembilang dan penyebut dikali 2."},{"prompt":"1/2 + 1/4 = ...","options":["2/6","2/4","3/4","1/6"],"answer":"3/4","explanation":"1/2 sama dengan 2/4."}]'::jsonb),
  ('Detektif Bangun Ruang','Matematika','Uji pemahaman volume dan sifat bangun ruang.',3,'Sulit','true_false',75,65,200,'aktif',
   '[{"prompt":"Kubus memiliki 12 rusuk yang sama panjang.","options":["Benar","Salah"],"answer":"Benar","explanation":"Kubus mempunyai 12 rusuk."},{"prompt":"Volume balok dihitung dengan panjang + lebar + tinggi.","options":["Benar","Salah"],"answer":"Salah","explanation":"Rumusnya panjang × lebar × tinggi."}]'::jsonb),
  ('Word Explorer','Bahasa Inggris','Pilih kosakata untuk kegiatan sehari-hari.',1,'Mudah','quiz',60,90,100,'aktif',
   '[{"prompt":"I ... breakfast every morning.","options":["eat","drink","sleep","write"],"answer":"eat","explanation":"We eat breakfast."},{"prompt":"The opposite of big is ...","options":["tall","small","long","wide"],"answer":"small","explanation":"Big is the opposite of small."}]'::jsonb),
  ('Sentence Builder','Bahasa Inggris','Susun huruf acak menjadi kosakata.',2,'Sedang','scramble',70,80,150,'aktif',
   '[{"prompt":"Tempat untuk belajar","options":[],"answer":"school","hint":"school"},{"prompt":"Bahasa Inggris dari keluarga","options":[],"answer":"family","hint":"family"}]'::jsonb),
  ('Grammar Guardian','Bahasa Inggris','Pilih Simple Present yang benar.',3,'Sulit','quiz',75,65,200,'aktif',
   '[{"prompt":"She ... to school every day.","options":["go","goes","going","went"],"answer":"goes","explanation":"She memakai verb + s/es."},{"prompt":"Which sentence is correct?","options":["They plays football.","They play football.","They playing football.","They is play football."],"answer":"They play football.","explanation":"They memakai bentuk dasar kata kerja."}]'::jsonb),
  ('Puzzle Pasangan Angka','Matematika','Cocokkan operasi hitung dengan hasil yang benar.',4,'Sulit','puzzle',70,75,250,'aktif',
   '[{"prompt":"25 × 4","options":[],"answer":"100","explanation":"25 × 4 = 100."},{"prompt":"3/4 dari 40","options":[],"answer":"30","explanation":"40 ÷ 4 × 3 = 30."},{"prompt":"Volume kubus sisi 4 cm","options":[],"answer":"64 cm³","explanation":"4 × 4 × 4 = 64 cm³."},{"prompt":"Keliling persegi sisi 9 cm","options":[],"answer":"36 cm","explanation":"4 × 9 = 36 cm."}]'::jsonb),
  ('Vocabulary Match Puzzle','Bahasa Inggris','Cocokkan kata bahasa Inggris dengan arti Indonesianya.',4,'Sulit','puzzle',70,75,250,'aktif',
   '[{"prompt":"Library","options":[],"answer":"Perpustakaan","explanation":"Library berarti perpustakaan."},{"prompt":"Beautiful","options":[],"answer":"Indah","explanation":"Beautiful berarti indah."},{"prompt":"Mountain","options":[],"answer":"Gunung","explanation":"Mountain berarti gunung."},{"prompt":"Tomorrow","options":[],"answer":"Besok","explanation":"Tomorrow berarti besok."}]'::jsonb)
on conflict do nothing;

commit;
notify pgrst, 'reload schema';

-- Catatan keamanan: RPC admin mengikuti pola modul yang sudah ada pada project.
-- Sebelum produksi, batasi RPC admin memakai validasi_sesi_admin/Supabase Auth.
