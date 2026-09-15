(function () {
  "use strict";

  if (window.__EDUSKY_ADMIN_GAME_GRADE_REPORTS__) return;
  window.__EDUSKY_ADMIN_GAME_GRADE_REPORTS__ = true;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const CACHE_KEY = "edusky_admin_game_result_cache";
  const $ = id => document.getElementById(id);
  const state = { level: "classes", className: "", subject: "", gameId: "", studentId: "", attemptId: "" };
  let client = null;
  let results = [];
  let loaded = false;
  let loading = false;
  let searchTimer = null;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string") { try { return normalizeArray(JSON.parse(value)); } catch (_) { return []; } }
    return value && typeof value === "object" ? [value] : [];
  }

  function same(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Number(value || 0));
    const minutes = Math.floor(seconds / 60); const rest = Math.floor(seconds % 60);
    return minutes ? `${minutes} menit ${rest} detik` : `${rest} detik`;
  }

  function average(items, key) {
    return items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : 0;
  }

  function uniqueGroups(items, valueOf) {
    const groups = new Map();
    items.forEach(item => {
      const value = String(valueOf(item) || "").trim(); if (!value) return;
      const key = value.toLowerCase(); if (!groups.has(key)) groups.set(key, { value, items: [] }); groups.get(key).items.push(item);
    });
    return [...groups.values()].sort((a, b) => a.value.localeCompare(b.value, "id", { numeric: true, sensitivity: "base" }));
  }

  function ensureClient() {
    if (!client) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return client;
  }

  function hasAdminSession() {
    try {
      const session = JSON.parse(localStorage.getItem("edusky_admin_session") || "null");
      return Boolean(session?.isLoggedIn === true && session?.role === "admin" && !(Number(session.expiresAt) > 0 && Number(session.expiresAt) <= Date.now()));
    } catch (_) { return false; }
  }

  function readCache() {
    try { return normalizeArray(JSON.parse(localStorage.getItem(CACHE_KEY) || "[]")); } catch (_) { return []; }
  }

  function writeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(results)); } catch (_) {}
  }

  function emptyState(icon, title, message) {
    return `<div class="grade-report-empty"><i class="fas ${icon}"></i><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
  }

  function filteredResults() {
    const keyword = String($("gradeReportSearch")?.value || "").trim().toLowerCase();
    if (!keyword) return results;
    return results.filter(item => [item.kelas, item.nama_siswa, item.nis, item.mata_pelajaran, item.judul_game, item.kesulitan, item.jenis_game]
      .some(value => String(value || "").toLowerCase().includes(keyword)));
  }

  function gameForState() {
    return results.find(item => String(item.game_id) === String(state.gameId));
  }

  function studentForState() {
    return results.find(item => String(item.game_id) === String(state.gameId) && String(item.siswa_id) === String(state.studentId));
  }

  function renderBreadcrumb() {
    const node = $("gameGradeBreadcrumb"); if (!node) return;
    const game = gameForState(); const student = studentForState();
    const parts = ['<button type="button" data-game-grade-nav="classes"><i class="fas fa-school"></i> Semua Kelas</button>'];
    if (state.className) parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-game-grade-nav="subjects">Kelas ${escapeHTML(state.className)}</button>`);
    if (state.subject) parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-game-grade-nav="games">${escapeHTML(state.subject)}</button>`);
    if (state.gameId) parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-game-grade-nav="students">${escapeHTML(game?.judul_game || "Game")}</button>`);
    if (state.studentId) parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-game-grade-nav="attempts">${escapeHTML(student?.nama_siswa || "Siswa")}</button>`);
    if (state.attemptId) parts.push('<i class="fas fa-chevron-right"></i><span>Detail Percobaan</span>');
    node.innerHTML = parts.join("");
  }

  function renderClasses(items) {
    const groups = uniqueGroups(items, item => item.kelas || "Belum Ditentukan");
    if (!groups.length) return emptyState("fa-gamepad", "Belum ada hasil game", "Hasil akan muncul setelah siswa menyelesaikan permainan.");
    return `<div class="grade-report-grid">${groups.map(group => {
      const students = new Set(group.items.map(item => item.siswa_id)).size;
      return `<button type="button" class="grade-report-folder" data-game-grade-class="${escapeHTML(group.value)}"><span class="grade-report-folder-icon class"><i class="fas fa-school"></i></span><span class="grade-report-folder-copy"><small>Analitik permainan</small><strong>Kelas ${escapeHTML(group.value)}</strong><span>${students} siswa • ${group.items.length} permainan selesai</span></span><span class="grade-report-folder-stats"><b>${Math.round(average(group.items, "akurasi"))}%<small>Akurasi</small></b><b>${Math.round(average(group.items, "nilai"))}<small>Nilai</small></b><i class="fas fa-arrow-right"></i></span></button>`;
    }).join("")}</div>`;
  }

  function renderSubjects(items) {
    const groups = uniqueGroups(items.filter(item => same(item.kelas, state.className)), item => item.mata_pelajaran);
    if (!groups.length) return emptyState("fa-book-open", "Mata pelajaran tidak ditemukan", "Belum ada hasil game pada mata pelajaran ini.");
    return `<div class="grade-report-grid">${groups.map(group => `<button type="button" class="grade-report-folder" data-game-grade-subject="${escapeHTML(group.value)}"><span class="grade-report-folder-icon subject"><i class="fas fa-${group.value === "Matematika" ? "calculator" : "language"}"></i></span><span class="grade-report-folder-copy"><small>Mata pelajaran</small><strong>${escapeHTML(group.value)}</strong><span>${new Set(group.items.map(item => item.game_id)).size} game • ${group.items.length} percobaan</span></span><span class="grade-report-folder-stats"><b>${Math.round(average(group.items, "akurasi"))}%<small>Akurasi</small></b><b>${group.items.filter(item => item.lulus).length}<small>Lulus</small></b><i class="fas fa-arrow-right"></i></span></button>`).join("")}</div>`;
  }

  function renderGames(items) {
    const groups = uniqueGroups(items.filter(item => same(item.kelas, state.className) && same(item.mata_pelajaran, state.subject)), item => item.game_id);
    if (!groups.length) return emptyState("fa-gamepad", "Game tidak ditemukan", "Tidak ada hasil game yang sesuai pencarian.");
    return `<div class="grade-report-task-list">${groups.map(group => {
      const game = group.items[0];
      return `<button type="button" class="grade-report-task" data-game-grade-game="${escapeHTML(game.game_id)}"><span class="grade-report-task-icon"><i class="fas fa-gamepad"></i></span><span><small>Level ${Number(game.level)} • ${escapeHTML(game.kesulitan)}</small><strong>${escapeHTML(game.judul_game)}</strong><em>${new Set(group.items.map(item => item.siswa_id)).size} siswa • ${group.items.length} percobaan</em></span><span class="grade-report-task-result"><span class="grade-report-status ${average(group.items, "akurasi") >= 70 ? "scored" : "pending"}"><i class="fas fa-bullseye"></i>${Math.round(average(group.items, "akurasi"))}% akurat</span><b>Nilai rata-rata ${Math.round(average(group.items, "nilai"))}</b></span><i class="fas fa-chevron-right"></i></button>`;
    }).join("")}</div>`;
  }

  function renderStudents(items) {
    const groups = uniqueGroups(items.filter(item => String(item.game_id) === String(state.gameId)), item => item.siswa_id);
    if (!groups.length) return emptyState("fa-user-graduate", "Belum ada siswa", "Siswa akan tampil setelah menyelesaikan game ini.");
    return `<div class="grade-report-grid">${groups.map(group => {
      const student = group.items[0]; const best = Math.max(...group.items.map(item => Number(item.nilai || 0)));
      const bestTime = Math.min(...group.items.map(item => Number(item.durasi_detik || 0)).filter(Boolean));
      return `<button type="button" class="grade-report-folder" data-game-grade-student="${escapeHTML(student.siswa_id)}"><span class="grade-report-avatar">${escapeHTML(String(student.nama_siswa || "S").split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase())}</span><span class="grade-report-folder-copy"><small>${escapeHTML(student.nis || "Siswa")}</small><strong>${escapeHTML(student.nama_siswa)}</strong><span>${group.items.length} percobaan • Tercepat ${formatDuration(Number.isFinite(bestTime) ? bestTime : 0)}</span></span><span class="grade-report-folder-stats"><b>${best}<small>Terbaik</small></b><b>${Math.round(average(group.items, "akurasi"))}%<small>Akurasi</small></b><i class="fas fa-arrow-right"></i></span></button>`;
    }).join("")}</div>`;
  }

  function renderAttempts(items) {
    const attempts = items.filter(item => String(item.game_id) === String(state.gameId) && String(item.siswa_id) === String(state.studentId)).sort((a,b) => new Date(b.selesai_at)-new Date(a.selesai_at));
    if (!attempts.length) return emptyState("fa-chart-line", "Riwayat belum tersedia", "Belum ada percobaan yang tersimpan.");
    return `<div class="game-attempt-list">${attempts.map((item, index) => `<button type="button" class="game-attempt-card" data-game-grade-attempt="${escapeHTML(item.id)}"><span class="game-attempt-number">${attempts.length-index}</span><span class="game-attempt-copy"><small>${escapeHTML(formatDate(item.selesai_at))}</small><strong>Nilai ${Number(item.nilai)} • Akurasi ${Number(item.akurasi).toFixed(1)}%</strong><em>${Number(item.jumlah_benar)} benar, ${Number(item.jumlah_salah)} salah • ${formatDuration(item.durasi_detik)}</em></span><span class="grade-report-status ${item.lulus ? "scored" : "pending"}"><i class="fas fa-${item.lulus ? "check" : "rotate"}"></i>${item.lulus ? "Lulus" : "Belum lulus"}</span><i class="fas fa-chevron-right"></i></button>`).join("")}</div>`;
  }

  function renderDetail(item) {
    if (!item) return emptyState("fa-triangle-exclamation", "Hasil tidak ditemukan", "Pilih ulang percobaan siswa.");
    const secondsPerAnswer = Number(item.durasi_detik || 0) / Math.max(1, Number(item.jumlah_benar || 0) + Number(item.jumlah_salah || 0));
    return `<article class="game-result-detail"><header><span><i class="fas fa-gamepad"></i></span><div><small>${escapeHTML(item.mata_pelajaran)} • Level ${Number(item.level)} • Kelas ${escapeHTML(item.kelas)}</small><h3>${escapeHTML(item.judul_game)}</h3><p>${escapeHTML(item.nama_siswa)} • ${escapeHTML(item.nis || "-")}</p></div><span class="grade-report-status ${item.lulus ? "scored" : "pending"}">${item.lulus ? "Lulus" : "Belum lulus"}</span></header><div class="game-result-metrics"><span><small>Nilai otomatis</small><strong>${Number(item.nilai)}</strong></span><span><small>Akurasi</small><strong>${Number(item.akurasi).toFixed(1)}%</strong></span><span><small>Jawaban</small><strong>${Number(item.jumlah_benar)} benar / ${Number(item.jumlah_salah)} salah</strong></span><span><small>Durasi</small><strong>${formatDuration(item.durasi_detik)}</strong></span><span><small>Kecepatan</small><strong>${secondsPerAnswer.toFixed(1)} detik/respons</strong></span><span><small>Bintang</small><strong>${"★".repeat(Number(item.bintang || 0)) || "-"}</strong></span><span><small>Target lulus</small><strong>${Number(item.nilai_lulus)}</strong></span><span><small>Waktu selesai</small><strong>${escapeHTML(formatDate(item.selesai_at))}</strong></span></div><button type="button" class="btn btn-secondary" data-game-grade-nav="attempts"><i class="fas fa-arrow-left"></i> Kembali ke Riwayat Percobaan</button></article>`;
  }

  function render() {
    const node = $("gameGradeExplorer"); if (!node) return;
    renderBreadcrumb(); const items = filteredResults();
    if (state.level === "subjects") node.innerHTML = renderSubjects(items);
    else if (state.level === "games") node.innerHTML = renderGames(items);
    else if (state.level === "students") node.innerHTML = renderStudents(items);
    else if (state.level === "attempts") node.innerHTML = renderAttempts(items);
    else if (state.level === "detail") node.innerHTML = renderDetail(results.find(item => String(item.id) === String(state.attemptId)));
    else node.innerHTML = renderClasses(items);
  }

  function navigate(level) {
    state.level = level;
    if (level === "classes") Object.assign(state,{className:"",subject:"",gameId:"",studentId:"",attemptId:""});
    if (level === "subjects") Object.assign(state,{subject:"",gameId:"",studentId:"",attemptId:""});
    if (level === "games") Object.assign(state,{gameId:"",studentId:"",attemptId:""});
    if (level === "students") Object.assign(state,{studentId:"",attemptId:""});
    if (level === "attempts") state.attemptId="";
    render();
  }

  function updateSummary() {
    $("gameAttemptTotal").textContent = String(results.length);
    $("gameAccuracyAverage").textContent = `${Math.round(average(results,"akurasi"))}%`;
    $("gamePassTotal").textContent = String(results.filter(item => item.lulus).length);
  }

  async function loadResults(silent=false) {
    if (loading) return; loading=true;
    const node=$("gameGradeExplorer"); if (!silent) node.innerHTML=emptyState("fa-spinner fa-spin","Memuat analitik game...","Mengambil seluruh riwayat permainan siswa.");
    try {
      const {data,error}=await ensureClient().rpc("admin_list_hasil_game"); if(error) throw error;
      results=normalizeArray(data); loaded=true; writeCache(); updateSummary(); render();
    } catch(error) {
      const cached=readCache();
      if(cached.length){results=cached;updateSummary();render();}
      else node.innerHTML=emptyState("fa-triangle-exclamation","Analitik game belum aktif",String(error?.code)==="PGRST202"?"Jalankan kembali supabase/game_edukasi_setup.sql di Supabase SQL Editor.":String(error?.message||error));
    } finally {loading=false;}
  }

  function switchSource(source) {
    const games=source==="games";
    document.querySelectorAll("[data-grade-source]").forEach(button=>button.classList.toggle("active",button.dataset.gradeSource===source));
    $("taskGradeSummary").hidden=games; $("gradeReportBreadcrumb").hidden=games; $("gradeReportExplorer").hidden=games;
    $("gameGradeSummary").hidden=!games; $("gameGradeBreadcrumb").hidden=!games; $("gameGradeExplorer").hidden=!games;
    if(games&&!loaded) loadResults(); else if(games) render();
  }

  function bindEvents() {
    $("gradeSourceSwitch")?.addEventListener("click",event=>{const button=event.target.closest("[data-grade-source]");if(button)switchSource(button.dataset.gradeSource);});
    $("gameGradeExplorer")?.addEventListener("click",event=>{
      const classButton=event.target.closest("[data-game-grade-class]"); const subjectButton=event.target.closest("[data-game-grade-subject]"); const gameButton=event.target.closest("[data-game-grade-game]"); const studentButton=event.target.closest("[data-game-grade-student]"); const attemptButton=event.target.closest("[data-game-grade-attempt]"); const nav=event.target.closest("[data-game-grade-nav]");
      if(classButton){state.className=classButton.dataset.gameGradeClass;return navigate("subjects");}
      if(subjectButton){state.subject=subjectButton.dataset.gameGradeSubject;return navigate("games");}
      if(gameButton){state.gameId=gameButton.dataset.gameGradeGame;return navigate("students");}
      if(studentButton){state.studentId=studentButton.dataset.gameGradeStudent;return navigate("attempts");}
      if(attemptButton){state.attemptId=attemptButton.dataset.gameGradeAttempt;return navigate("detail");}
      if(nav)navigate(nav.dataset.gameGradeNav);
    });
    $("gameGradeBreadcrumb")?.addEventListener("click",event=>{const button=event.target.closest("[data-game-grade-nav]");if(button)navigate(button.dataset.gameGradeNav);});
    $("gradeReportSearch")?.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(!$("gameGradeExplorer").hidden)render();},180);});
    $("refreshGradeReports")?.addEventListener("click",()=>{if(!$("gameGradeExplorer").hidden)loadResults();});
  }

  function initialize() { if(!$("gameGradeExplorer")||!hasAdminSession()||!window.supabase?.createClient)return;bindEvents(); }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();
})();
