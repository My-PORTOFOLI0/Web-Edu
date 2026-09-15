(function () {
  "use strict";

  if (window.EduSkyGameStore) return;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const GAME_KEY = "edusky_game_levels_v1";
  const PROGRESS_KEY = "edusky_game_progress_v1";
  const PUZZLE_SEED_KEY = "edusky_game_puzzle_seed_v1";
  const ACTIVITY_KEY = "edusky_game_daily_activity_v1";
  const REWARD_KEY = "edusky_game_rewards_v1";
  const RESULT_KEY = "edusky_game_results_v1";
  const PENDING_RESULT_KEY = "edusky_game_pending_results_v1";
  let client = null;
  let remoteAvailable = null;

  const defaults = [
    {
      id: "demo-math-1", subject: "Matematika", title: "Misi Hitung Cepat", description: "Taklukkan operasi hitung bilangan cacah.",
      level: 1, difficulty: "Mudah", type: "quiz", passingScore: 60, timeLimit: 90, points: 100, status: "aktif",
      questions: [
        { prompt: "Hasil dari 2.450 + 1.275 adalah ...", options: ["3.625", "3.725", "3.825", "4.725"], answer: "3.725", explanation: "Susun nilai tempat lalu jumlahkan: 2.450 + 1.275 = 3.725." },
        { prompt: "Hasil dari 8.000 - 3.675 adalah ...", options: ["4.225", "4.325", "5.325", "4.425"], answer: "4.325", explanation: "8.000 dikurangi 3.675 sama dengan 4.325." },
        { prompt: "125 × 8 = ...", options: ["900", "1.000", "1.080", "1.200"], answer: "1.000", explanation: "100 × 8 + 25 × 8 = 800 + 200." }
      ]
    },
    {
      id: "demo-math-2", subject: "Matematika", title: "Pecahan Pizza", description: "Bandingkan dan hitung pecahan senilai.",
      level: 2, difficulty: "Sedang", type: "quiz", passingScore: 70, timeLimit: 80, points: 150, status: "aktif",
      questions: [
        { prompt: "Pecahan yang senilai dengan 3/4 adalah ...", options: ["4/5", "6/8", "8/10", "9/16"], answer: "6/8", explanation: "Pembilang dan penyebut 3/4 dikali 2 menjadi 6/8." },
        { prompt: "1/2 + 1/4 = ...", options: ["2/6", "2/4", "3/4", "1/6"], answer: "3/4", explanation: "1/2 diubah menjadi 2/4, kemudian ditambah 1/4." },
        { prompt: "Manakah pecahan terbesar?", options: ["2/5", "3/5", "1/2", "1/4"], answer: "3/5", explanation: "3/5 = 0,6 dan merupakan nilai terbesar." }
      ]
    },
    {
      id: "demo-math-3", subject: "Matematika", title: "Detektif Bangun Ruang", description: "Uji pemahaman volume dan sifat bangun ruang.",
      level: 3, difficulty: "Sulit", type: "true_false", passingScore: 75, timeLimit: 65, points: 200, status: "aktif",
      questions: [
        { prompt: "Kubus memiliki 12 rusuk yang sama panjang.", options: ["Benar", "Salah"], answer: "Benar", explanation: "Kubus mempunyai 12 rusuk sama panjang." },
        { prompt: "Volume balok dihitung dengan panjang + lebar + tinggi.", options: ["Benar", "Salah"], answer: "Salah", explanation: "Volume balok adalah panjang × lebar × tinggi." },
        { prompt: "Kubus dengan sisi 5 cm memiliki volume 125 cm³.", options: ["Benar", "Salah"], answer: "Benar", explanation: "5 × 5 × 5 = 125 cm³." }
      ]
    },
    {
      id: "demo-math-4", subject: "Matematika", title: "Puzzle Pasangan Angka", description: "Cocokkan operasi hitung dengan hasil yang benar.",
      level: 4, difficulty: "Sulit", type: "puzzle", passingScore: 70, timeLimit: 75, points: 250, status: "aktif",
      questions: [
        { prompt: "25 × 4", answer: "100", options: [], explanation: "25 × 4 = 100." },
        { prompt: "3/4 dari 40", answer: "30", options: [], explanation: "40 ÷ 4 × 3 = 30." },
        { prompt: "Volume kubus sisi 4 cm", answer: "64 cm³", options: [], explanation: "4 × 4 × 4 = 64 cm³." },
        { prompt: "Keliling persegi sisi 9 cm", answer: "36 cm", options: [], explanation: "4 × 9 = 36 cm." }
      ]
    },
    {
      id: "demo-english-1", subject: "Bahasa Inggris", title: "Word Explorer", description: "Pilih kosakata yang tepat untuk kegiatan sehari-hari.",
      level: 1, difficulty: "Mudah", type: "quiz", passingScore: 60, timeLimit: 90, points: 100, status: "aktif",
      questions: [
        { prompt: "I ... breakfast every morning.", options: ["eat", "drink", "sleep", "write"], answer: "eat", explanation: "Kata kerja yang tepat untuk breakfast adalah eat." },
        { prompt: "The opposite of 'big' is ...", options: ["tall", "small", "long", "wide"], answer: "small", explanation: "Big berlawanan arti dengan small." },
        { prompt: "'Perpustakaan' in English is ...", options: ["laboratory", "canteen", "library", "classroom"], answer: "library", explanation: "Perpustakaan berarti library." }
      ]
    },
    {
      id: "demo-english-2", subject: "Bahasa Inggris", title: "Sentence Builder", description: "Susun huruf acak menjadi kosakata bahasa Inggris.",
      level: 2, difficulty: "Sedang", type: "scramble", passingScore: 70, timeLimit: 80, points: 150, status: "aktif",
      questions: [
        { prompt: "Tempat untuk belajar", hint: "school", answer: "school", options: [] },
        { prompt: "Hari setelah Monday", hint: "tuesday", answer: "tuesday", options: [] },
        { prompt: "Bahasa Inggris dari 'keluarga'", hint: "family", answer: "family", options: [] }
      ]
    },
    {
      id: "demo-english-3", subject: "Bahasa Inggris", title: "Grammar Guardian", description: "Pilih bentuk kalimat Simple Present yang benar.",
      level: 3, difficulty: "Sulit", type: "quiz", passingScore: 75, timeLimit: 65, points: 200, status: "aktif",
      questions: [
        { prompt: "She ... to school by bicycle every day.", options: ["go", "goes", "going", "went"], answer: "goes", explanation: "Subjek she memakai verb + s/es pada Simple Present." },
        { prompt: "Which sentence is correct?", options: ["They plays football.", "They play football.", "They playing football.", "They is play football."], answer: "They play football.", explanation: "Subjek they memakai bentuk dasar kata kerja." },
        { prompt: "... your brother like mangoes?", options: ["Do", "Does", "Is", "Are"], answer: "Does", explanation: "Pertanyaan untuk subjek tunggal he/she memakai Does." }
      ]
    },
    {
      id: "demo-english-4", subject: "Bahasa Inggris", title: "Vocabulary Match Puzzle", description: "Cocokkan kata bahasa Inggris dengan arti Indonesianya.",
      level: 4, difficulty: "Sulit", type: "puzzle", passingScore: 70, timeLimit: 75, points: 250, status: "aktif",
      questions: [
        { prompt: "Library", answer: "Perpustakaan", options: [], explanation: "Library berarti perpustakaan." },
        { prompt: "Beautiful", answer: "Indah", options: [], explanation: "Beautiful berarti indah." },
        { prompt: "Mountain", answer: "Gunung", options: [], explanation: "Mountain berarti gunung." },
        { prompt: "Tomorrow", answer: "Besok", options: [], explanation: "Tomorrow berarti besok." }
      ]
    }
  ];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (_) { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function ensureSeed() {
    const current = read(GAME_KEY, null);
    if (!Array.isArray(current)) {
      write(GAME_KEY, defaults);
      localStorage.setItem(PUZZLE_SEED_KEY, "1");
      return;
    }
    if (!localStorage.getItem(PUZZLE_SEED_KEY)) {
      const puzzleGames = defaults.filter(game => game.type === "puzzle");
      const merged = current.concat(puzzleGames.filter(game => !current.some(item => item.id === game.id)));
      write(GAME_KEY, merged);
      localStorage.setItem(PUZZLE_SEED_KEY, "1");
    }
  }
  function getClient() {
    if (!client && window.supabase?.createClient) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }
    return client;
  }
  function normalize(row) {
    return {
      id: row.id, subject: row.subject || row.mata_pelajaran, title: row.title || row.judul,
      className: row.className || row.kelas || "",
      description: row.description || row.deskripsi || "", level: Number(row.level || row.urutan_level || 1),
      difficulty: row.difficulty || row.kesulitan || "Mudah", type: row.type || row.jenis_game || "quiz",
      passingScore: Number(row.passingScore ?? row.nilai_lulus ?? 70), timeLimit: Number(row.timeLimit ?? row.batas_waktu ?? 90),
      points: Number(row.points ?? row.poin ?? 100), status: row.status || "aktif", questions: row.questions || row.soal || []
    };
  }
  function toPayload(game) {
    return {
      p_id: game.id && !String(game.id).startsWith("local-") && !String(game.id).startsWith("demo-") ? game.id : null,
      p_judul: game.title, p_mata_pelajaran: game.subject, p_kelas: game.className || null, p_deskripsi: game.description || "",
      p_urutan_level: Number(game.level), p_kesulitan: game.difficulty, p_jenis_game: game.type,
      p_nilai_lulus: Number(game.passingScore), p_batas_waktu: Number(game.timeLimit), p_poin: Number(game.points),
      p_status: game.status, p_soal: game.questions
    };
  }
  function sortGames(items) { return items.map(normalize).sort((a, b) => a.className.localeCompare(b.className, "id", { numeric: true }) || a.subject.localeCompare(b.subject) || a.level - b.level); }

  function gamesForStudent(items) {
    const user = read("edusky_user", {});
    const studentClass = String(user.kelas || user.className || "").trim().toLowerCase();
    return items.filter(item => {
      if (item.status !== "aktif") return false;
      const gameClass = String(item.className || "").trim().toLowerCase();
      return !gameClass || (studentClass && gameClass === studentClass);
    });
  }

  async function list(mode) {
    ensureSeed();
    const api = getClient();
    if (api && remoteAvailable !== false) {
      const rpc = mode === "admin" ? "admin_list_game" : "list_game_siswa";
      const { data, error } = await api.rpc(rpc);
      if (!error) {
        remoteAvailable = true;
        if (Array.isArray(data)) {
          const remote = sortGames(data);
          return mode === "admin" ? remote : gamesForStudent(remote);
        }
      } else if (["PGRST202", "42883"].includes(String(error.code))) remoteAvailable = false;
      else console.warn("Game memakai data lokal:", error.message);
    }
    const local = read(GAME_KEY, clone(defaults));
    const normalized = sortGames(local);
    return mode === "admin" ? normalized : gamesForStudent(normalized);
  }

  async function save(game) {
    const clean = normalize(game);
    clean.questions = (clean.questions || []).map(q => ({
      prompt: String(q.prompt || "").trim(), options: Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [],
      answer: String(q.answer || "").trim(), explanation: String(q.explanation || "").trim(), hint: String(q.hint || "").trim()
    }));
    const api = getClient();
    if (api && remoteAvailable !== false) {
      const { data, error } = await api.rpc("admin_upsert_game", toPayload(clean));
      if (!error) { remoteAvailable = true; return normalize(data); }
      if (!["PGRST202", "42883"].includes(String(error.code))) throw error;
      remoteAvailable = false;
    }
    const items = await list("admin");
    if (!clean.id) clean.id = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const index = items.findIndex(item => item.id === clean.id);
    if (index >= 0) items[index] = clean; else items.push(clean);
    write(GAME_KEY, items);
    return clean;
  }

  async function remove(id) {
    const api = getClient();
    if (api && remoteAvailable !== false && !String(id).startsWith("local-") && !String(id).startsWith("demo-")) {
      const { error } = await api.rpc("admin_delete_game", { p_id: id });
      if (!error) return true;
      if (!["PGRST202", "42883"].includes(String(error.code))) throw error;
      remoteAvailable = false;
    }
    write(GAME_KEY, (await list("admin")).filter(item => item.id !== id));
    return true;
  }

  function studentId() {
    const user = read("edusky_user", {});
    return String(user.id || user.nis || user.username || "demo-student");
  }
  function appendLocalResult(result) {
    const all = read(RESULT_KEY, {}); const sid = studentId();
    all[sid] = [result, ...(all[sid] || [])].slice(0, 500); write(RESULT_KEY, all);
    const pending = read(PENDING_RESULT_KEY, {}); pending[sid] = [...(pending[sid] || []), result]; write(PENDING_RESULT_KEY, pending);
  }
  function removePendingResult(eventId) {
    const pending = read(PENDING_RESULT_KEY, {}); const sid = studentId();
    pending[sid] = (pending[sid] || []).filter(item => item.eventId !== eventId); write(PENDING_RESULT_KEY, pending);
  }
  async function sendGameResult(result) {
    const api = getClient(); const user = read("edusky_user", {});
    if (!api || remoteAvailable !== true || !user.id || !user.session_token) return false;
    const { error } = await api.rpc("simpan_hasil_game", {
      p_siswa_id: user.id,
      p_session_token: user.session_token,
      p_game_id: result.gameId,
      p_client_event_id: result.eventId,
      p_nilai: result.score,
      p_bintang: result.stars,
      p_jumlah_benar: result.correct,
      p_jumlah_salah: result.wrong,
      p_total_soal: result.total,
      p_durasi_detik: result.durationSeconds
    });
    if (!error) { removePendingResult(result.eventId); return true; }
    if (["PGRST202", "42883"].includes(String(error.code))) {
      const fallback = await api.rpc("simpan_progres_game", { p_siswa_id: user.id, p_session_token: user.session_token, p_game_id: result.gameId, p_nilai: result.score, p_bintang: result.stars });
      if (!fallback.error) { removePendingResult(result.eventId); return true; }
    }
    console.warn("Riwayat hasil game menunggu sinkronisasi:", error.message);
    return false;
  }
  async function flushPendingResults() {
    const pending = read(PENDING_RESULT_KEY, {})[studentId()] || [];
    for (const result of pending) await sendGameResult(result);
  }
  function getProgress() { return read(PROGRESS_KEY, {})[studentId()] || {}; }
  function getActivity(dateKey = localDateKey()) {
    const studentActivity = read(ACTIVITY_KEY, {})[studentId()] || {};
    return dateKey ? (studentActivity[dateKey] || { attempts: 0, stars: 0, gameIds: [], subjects: [] }) : studentActivity;
  }
  function recordActivity(game, stars) {
    const all = read(ACTIVITY_KEY, {}); const sid = studentId(); const dayKey = localDateKey();
    all[sid] = all[sid] || {};
    const day = all[sid][dayKey] || { attempts: 0, stars: 0, gameIds: [], subjects: [] };
    day.attempts = Number(day.attempts || 0) + 1;
    day.stars = Number(day.stars || 0) + Number(stars || 0);
    day.gameIds = [...new Set([...(day.gameIds || []), game.id])];
    day.subjects = [...new Set([...(day.subjects || []), game.subject])];
    day.updatedAt = new Date().toISOString();
    all[sid][dayKey] = day; write(ACTIVITY_KEY, all); return day;
  }
  function getRewards() {
    const rewards = read(REWARD_KEY, {})[studentId()] || {};
    return { coins: Number(rewards.coins || 0), initialized: Boolean(rewards.initialized), claimedMissions: rewards.claimedMissions || {} };
  }
  function writeRewards(reward) {
    const all = read(REWARD_KEY, {}); all[studentId()] = reward; write(REWARD_KEY, all); return reward;
  }
  function syncRewards(games) {
    const reward = getRewards();
    if (reward.initialized) return reward;
    const progress = getProgress();
    reward.coins = (games || []).reduce((total, game) => {
      const item = progress[game.id];
      if (!item) return total;
      const starCoins = Number(item.stars || 0) * Math.round(Number(game.points || 0) / 3);
      return total + starCoins + (item.completed ? 20 : 0);
    }, 0);
    reward.initialized = true;
    return writeRewards(reward);
  }
  function claimDailyRewards(completedMissionIds) {
    const values = { play: 20, stars: 30, explore: 50 };
    const reward = getRewards(); const dayKey = localDateKey();
    reward.claimedMissions[dayKey] = reward.claimedMissions[dayKey] || [];
    let earned = 0;
    (completedMissionIds || []).forEach(id => {
      if (!values[id] || reward.claimedMissions[dayKey].includes(id)) return;
      reward.claimedMissions[dayKey].push(id); earned += values[id];
    });
    if (earned) reward.coins += earned;
    writeRewards(reward);
    if (earned) persistAdventure();
    return { earned, reward };
  }
  function mergeDailyActivity(localActivity, remoteActivity) {
    const merged = { ...(remoteActivity || {}) };
    Object.entries(localActivity || {}).forEach(([dayKey, localDay]) => {
      const remoteDay = merged[dayKey] || {};
      merged[dayKey] = {
        attempts: Math.max(Number(localDay?.attempts || 0), Number(remoteDay?.attempts || 0)),
        stars: Math.max(Number(localDay?.stars || 0), Number(remoteDay?.stars || 0)),
        gameIds: [...new Set([...(remoteDay?.gameIds || []), ...(localDay?.gameIds || [])])],
        subjects: [...new Set([...(remoteDay?.subjects || []), ...(localDay?.subjects || [])])],
        updatedAt: localDay?.updatedAt || remoteDay?.updatedAt || new Date().toISOString()
      };
    });
    return merged;
  }
  function mergeMissionClaims(localClaims, remoteClaims) {
    const merged = { ...(remoteClaims || {}) };
    Object.entries(localClaims || {}).forEach(([dayKey, ids]) => {
      merged[dayKey] = [...new Set([...(merged[dayKey] || []), ...(ids || [])])];
    });
    return merged;
  }
  function persistAdventure() {
    const api = getClient(); const user = read("edusky_user", {});
    if (!api || remoteAvailable !== true || !user.id || !user.session_token) return;
    const reward = getRewards();
    api.rpc("simpan_reward_game_siswa", {
      p_siswa_id: user.id,
      p_session_token: user.session_token,
      p_koin: reward.coins,
      p_aktivitas_harian: getActivity(""),
      p_misi_diklaim: reward.claimedMissions
    }).then(({ error }) => { if (error && !["PGRST202", "42883"].includes(String(error.code))) console.warn("Hadiah game tersimpan lokal:", error.message); });
  }
  async function syncAdventure() {
    const api = getClient(); const user = read("edusky_user", {});
    if (!api || remoteAvailable !== true || !user.id || !user.session_token) return getRewards();
    const { data, error } = await api.rpc("list_reward_game_siswa", { p_siswa_id: user.id, p_session_token: user.session_token });
    if (error) {
      if (!["PGRST202", "42883"].includes(String(error.code))) console.warn("Hadiah game memakai data lokal:", error.message);
      return getRewards();
    }
    const localReward = getRewards(); const allActivity = read(ACTIVITY_KEY, {}); const sid = studentId();
    const mergedActivity = mergeDailyActivity(allActivity[sid] || {}, data?.activity || {});
    allActivity[sid] = mergedActivity; write(ACTIVITY_KEY, allActivity);
    const mergedReward = {
      coins: Math.max(localReward.coins, Number(data?.coins || 0)),
      initialized: true,
      claimedMissions: mergeMissionClaims(localReward.claimedMissions, data?.claimedMissions || {})
    };
    writeRewards(mergedReward); persistAdventure(); return mergedReward;
  }
  async function syncProgress() {
    const api = getClient(); const user = read("edusky_user", {});
    if (!api || remoteAvailable !== true || !user.id || !user.session_token) return getProgress();
    const { data, error } = await api.rpc("list_progres_game_siswa", { p_siswa_id: user.id, p_session_token: user.session_token });
    if (error) { console.warn("Progres game memakai data lokal:", error.message); return getProgress(); }
    const all = read(PROGRESS_KEY, {}); const sid = studentId(); all[sid] = all[sid] || {};
    (data || []).forEach(row => {
      const local = all[sid][row.game_id] || {};
      all[sid][row.game_id] = {
        score: Math.max(Number(local.score || 0), Number(row.nilai_terbaik || 0)),
        stars: Math.max(Number(local.stars || 0), Number(row.bintang || 0)),
        attempts: Math.max(Number(local.attempts || 0), Number(row.jumlah_percobaan || 0)),
        completed: Boolean(local.completed || row.selesai),
        updatedAt: new Date(local.updatedAt || 0) > new Date(row.updated_at || 0) ? local.updatedAt : row.updated_at
      };
    });
    write(PROGRESS_KEY, all); flushPendingResults(); return all[sid];
  }
  async function saveProgress(game, score, stars, metrics = {}) {
    const all = read(PROGRESS_KEY, {}); const sid = studentId(); const before = all[sid]?.[game.id] || {};
    all[sid] = all[sid] || {};
    const bestStars = Math.max(Number(before.stars || 0), Number(stars || 0));
    const completed = Boolean(before.completed) || score >= game.passingScore;
    all[sid][game.id] = { score: Math.max(Number(before.score || 0), score), stars: bestStars, attempts: Number(before.attempts || 0) + 1, completed, updatedAt: new Date().toISOString() };
    write(PROGRESS_KEY, all);
    const result = {
      eventId: `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      gameId: game.id,
      subject: game.subject,
      score: Number(score || 0),
      stars: Number(stars || 0),
      correct: Math.max(0, Number(metrics.correct || 0)),
      wrong: Math.max(0, Number(metrics.wrong || 0)),
      total: Math.max(1, Number(metrics.total || game.questions?.length || 1)),
      durationSeconds: Math.max(0, Number(metrics.durationSeconds || 0)),
      completedAt: new Date().toISOString()
    };
    appendLocalResult(result);
    recordActivity(game, stars);
    const reward = getRewards();
    const improvedStars = Math.max(0, bestStars - Number(before.stars || 0));
    const coinsEarned = improvedStars * Math.round(Number(game.points || 0) / 3) + (!before.completed && completed ? 20 : 0);
    if (coinsEarned) { reward.coins += coinsEarned; reward.initialized = true; writeRewards(reward); }
    sendGameResult(result);
    persistAdventure();
    return { ...all[sid][game.id], coinsEarned };
  }

  ensureSeed();
  window.EduSkyGameStore = { list, save, remove, getProgress, syncProgress, saveProgress, flushPendingResults, getActivity, getRewards, syncRewards, syncAdventure, claimDailyRewards, localDateKey, defaults: clone(defaults), typeNames: { quiz: "Pilihan Ganda", true_false: "Benar / Salah", scramble: "Susun Kata", puzzle: "Puzzle Pasangan" } };
})();
