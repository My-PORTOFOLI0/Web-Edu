(function () {
  "use strict";

  const store = window.EduSkyGameStore;
  const root = document.getElementById("gameAdminApp");
  if (!store || !root) return;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const CLASS_STORAGE_KEY = "edusky_student_classes";
  const state = { games: [], classes: [], students: [], selectedClass: "", editing: null, filter: "", subject: "", difficulty: "" };
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const clone = value => JSON.parse(JSON.stringify(value));

  function notify(message, type = "success") {
    document.querySelector(".game-admin-alert")?.remove(); const node = document.createElement("div");
    node.className = `game-admin-alert ${type}`; node.innerHTML = `<i class="fas fa-${type === "error" ? "exclamation-circle" : "check-circle"}"></i> ${escapeHTML(message)}`;
    document.body.appendChild(node); setTimeout(() => node.remove(), 3500);
  }

  function shell() {
    root.innerHTML = `<div class="game-admin-header"><div class="game-admin-title"><span class="game-admin-title-icon"><i class="fas fa-gamepad"></i></span><div><h2 id="gameManagerTitle">Pilih Kelas</h2><p id="gameManagerSubtitle">Masuk ke kelas terlebih dahulu untuk melihat dan menambahkan game.</p></div></div><button class="btn btn-primary" id="addGameBtn" disabled><i class="fas fa-folder-open"></i> Pilih Kelas Dahulu</button></div>
      <div class="game-admin-summary" id="gameSummary"></div>
      <div class="card"><div class="game-admin-notice"><i class="fas fa-lightbulb"></i><span>Level siswa terbuka secara berurutan per mata pelajaran. Pastikan nomor level dimulai dari 1 dan target kelulusannya sesuai.</span></div>
      <div class="game-admin-toolbar"><div class="search-input"><i class="fas fa-search"></i><input id="gameSearch" type="search" placeholder="Cari kelas, game, atau mata pelajaran..."></div><select id="gameSubjectFilter"><option value="">Semua mapel</option><option>Matematika</option><option>Bahasa Inggris</option></select><select id="gameDifficultyFilter"><option value="">Semua kesulitan</option><option>Mudah</option><option>Sedang</option><option>Sulit</option></select></div>
      <div class="admin-task-class-grid" id="gameClassGrid" aria-live="polite"></div></div>`;
    if (!$("gameModal")) createModal();
  }

  function createModal() {
    const node = document.createElement("div"); node.className = "modal game-modal"; node.id = "gameModal";
    node.innerHTML = `<div class="modal-content"><div class="modal-header"><div><h2 class="modal-title" id="gameModalTitle">Tambah Game</h2><p class="card-subtitle">Pengaturan arena belajar siswa</p></div><button class="modal-close" data-game-close><i class="fas fa-times"></i></button></div>
      <div class="modal-body"><form id="gameForm"><div class="game-form-guide"><i class="fas fa-circle-info"></i><div><strong>Panduan cepat pembuatan soal</strong><span id="gameTypeGuide">Pilihan Ganda: tulis pertanyaan, minimal dua opsi, lalu isi jawaban yang sama persis dengan salah satu opsi.</span></div></div><div class="game-form-grid">
        <div><label for="gameClass">Kelas *</label><input id="gameClass" required readonly placeholder="Kelas dipilih dari folder"><p class="game-form-help">Kelas dikunci sesuai folder yang dipilih.</p></div>
        <div><label for="gameTitle">Judul Game *</label><input id="gameTitle" maxlength="120" required placeholder="Contoh: Misi Pecahan"></div>
        <div><label for="gameSubject">Mata Pelajaran *</label><select id="gameSubject" required><option>Matematika</option><option>Bahasa Inggris</option></select></div>
        <div class="full"><label for="gameDescription">Deskripsi singkat</label><textarea id="gameDescription" maxlength="240" placeholder="Apa yang akan dipelajari siswa?"></textarea></div>
        <div><label for="gameLevel">Nomor Level *</label><input id="gameLevel" type="number" min="1" max="50" value="1" required><p class="game-form-help">Urutan pembukaan level dalam mapel.</p></div>
        <div><label for="gameDifficulty">Tingkat Kesulitan</label><select id="gameDifficulty"><option>Mudah</option><option>Sedang</option><option>Sulit</option></select></div>
        <div><label for="gameType">Jenis Game</label><select id="gameType"><option value="quiz">Pilihan Ganda</option><option value="true_false">Benar / Salah</option><option value="scramble">Susun Kata</option><option value="puzzle">Puzzle Pasangan</option></select><p class="game-form-help">Pilih format yang sesuai dengan cara siswa menjawab.</p></div>
        <div><label for="gameStatus">Status Publikasi</label><select id="gameStatus"><option value="aktif">Aktif</option><option value="draft">Draft</option></select></div>
        <div><label for="gamePassingScore">Nilai Minimal Lulus</label><input id="gamePassingScore" type="number" min="1" max="100" value="70"></div>
        <div><label for="gameTimeLimit">Batas Waktu (detik)</label><input id="gameTimeLimit" type="number" min="15" max="1800" value="90"></div>
        <div><label for="gamePoints">Poin/Koin Hadiah</label><input id="gamePoints" type="number" min="0" max="10000" value="100"><p class="game-form-help">Menentukan hadiah saat bintang dan level berhasil diraih.</p></div>
      </div><div class="question-builder"><div class="question-builder-head"><div><h3>Bank Soal</h3><p class="card-subtitle">Minimal satu soal untuk setiap game.</p></div><button class="btn btn-secondary" type="button" id="addQuestionBtn"><i class="fas fa-plus"></i> Tambah Soal</button></div><div id="questionList"></div></div></form></div>
      <div class="modal-footer"><button class="btn btn-secondary" type="button" data-game-close>Batal</button><button class="btn btn-primary" type="button" id="saveGameBtn"><i class="fas fa-save"></i> Simpan Game</button></div></div>`;
    document.body.appendChild(node);
  }

  function summary() {
    const active = state.games.filter(game => game.status === "aktif").length;
    $("gameSummary").innerHTML = [
      ["fa-gamepad", state.games.length, "Total game"], ["fa-calculator", state.games.filter(g => g.subject === "Matematika").length, "Game Matematika"],
      ["fa-language", state.games.filter(g => g.subject === "Bahasa Inggris").length, "Game B. Inggris"], ["fa-circle-check", active, "Game aktif"]
    ].map(item => `<div class="game-summary-card"><i class="fas ${item[0]}"></i><div><strong>${item[1]}</strong><span>${item[2]}</span></div></div>`).join("");
  }

  function sameClass(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function localClasses() {
    try { return JSON.parse(localStorage.getItem(CLASS_STORAGE_KEY) || "[]"); } catch (_) { return []; }
  }

  function availableClasses() {
    const unique = new Map();
    [
      ...state.classes.map(item => item?.nama),
      ...state.students.map(item => item?.kelas),
      ...state.games.map(game => game?.className)
    ].map(value => String(value || "").trim()).filter(Boolean).forEach(value => {
      const key = value.toLowerCase();
      if (!unique.has(key)) unique.set(key, value);
    });
    return [...unique.values()].sort((a, b) => a.localeCompare(b, "id", { numeric: true, sensitivity: "base" }));
  }

  function matchesGame(game) {
    const keyword = state.filter.trim().toLowerCase();
    return (!state.subject || game.subject === state.subject)
      && (!state.difficulty || game.difficulty === state.difficulty)
      && (!keyword || [game.title, game.description, game.subject, game.difficulty, store.typeNames[game.type]]
        .some(value => String(value || "").toLowerCase().includes(keyword)));
  }

  function gamesInClass(className, filtered = false) {
    return state.games.filter(game => {
      const target = String(game?.className || "").trim();
      const appliesToClass = !target || sameClass(target, className);
      return appliesToClass && (!filtered || matchesGame(game));
    });
  }

  function syncGameManagerChrome() {
    const canAdd = Boolean(state.selectedClass);
    if (state.selectedClass) {
      $("gameManagerTitle").textContent = `Game Kelas ${state.selectedClass}`;
      $("gameManagerSubtitle").textContent = "Kelola game, level kesulitan, dan bank soal di kelas ini.";
      $("gameSearch").placeholder = `Cari game di Kelas ${state.selectedClass}...`;
      $("addGameBtn").disabled = !canAdd;
      $("addGameBtn").innerHTML = '<i class="fas fa-plus"></i> Tambah Game';
      return;
    }
    $("gameManagerTitle").textContent = "Pilih Kelas";
    $("gameManagerSubtitle").textContent = "Masuk ke kelas terlebih dahulu untuk melihat dan menambahkan game.";
    $("gameSearch").placeholder = "Cari kelas, game, atau mata pelajaran...";
    $("addGameBtn").disabled = true;
    $("addGameBtn").innerHTML = '<i class="fas fa-folder-open"></i> Pilih Kelas Dahulu';
  }

  function renderClassOverview() {
    const keyword = state.filter.trim().toLowerCase();
    const classes = availableClasses().filter(className => {
      const games = gamesInClass(className);
      return (!state.subject || games.some(game => game.subject === state.subject))
        && (!state.difficulty || games.some(game => game.difficulty === state.difficulty))
        && (!keyword || className.toLowerCase().includes(keyword) || games.some(matchesGame));
    });
    if (!classes.length) {
      $("gameClassGrid").innerHTML = '<div class="admin-task-class-empty"><i class="fas fa-search"></i><strong>Tidak ada kelas yang cocok</strong><span>Coba kata kunci game atau mata pelajaran lainnya.</span></div>';
      return;
    }
    $("gameClassGrid").innerHTML = classes.map(className => {
      const games = gamesInClass(className);
      const visible = games.filter(matchesGame);
      const subjects = [...new Set(games.map(game => game.subject).filter(Boolean))];
      const active = games.filter(game => game.status === "aktif").length;
      return `<button type="button" class="admin-task-class-entry" data-open-game-class="${escapeHTML(className)}">
        <span class="admin-task-class-icon"><i class="fas fa-gamepad"></i></span>
        <span class="admin-task-class-copy"><strong>Kelas ${escapeHTML(className)}</strong><span>${games.length} game tersedia</span><span class="admin-task-class-subjects">${subjects.length ? subjects.map(item => `<b>${escapeHTML(item)}</b>`).join("") : "<b>Belum ada game</b>"}</span></span>
        <span class="admin-task-class-count"><span><strong>${visible.length}</strong><small>Game</small></span><span><strong>${active}</strong><small>Aktif</small></span><i class="fas fa-arrow-right"></i></span>
      </button>`;
    }).join("");
  }

  function renderGameRows(items) {
    return items.length ? items.map((game, index) => `<tr>
      <td><span class="game-order-number">${index + 1}</span></td>
      <td><div class="game-title-cell"><span class="game-title-icon">${game.subject === "Matematika" ? "🔢" : "🔤"}</span><div><strong>${escapeHTML(game.title)}</strong><span>${escapeHTML(game.description || "Tanpa deskripsi")}</span></div></div></td>
      <td>${escapeHTML(game.subject)}</td><td><span class="game-level-badge">${game.level}</span></td><td><span class="game-difficulty ${game.difficulty.toLowerCase()}">${escapeHTML(game.difficulty)}</span></td>
      <td>${escapeHTML(store.typeNames[game.type] || game.type)}</td><td><b>${game.questions.length}</b> soal</td><td><span class="badge ${game.status === "aktif" ? "badge-success" : "badge-warning"}">${game.status === "aktif" ? "Aktif" : "Draft"}</span></td>
      <td><div class="game-actions"><button title="Edit" data-game-action="edit" data-id="${escapeHTML(game.id)}"><i class="fas fa-pen"></i></button>${game.className ? `<button title="Duplikat" data-game-action="duplicate" data-id="${escapeHTML(game.id)}"><i class="fas fa-copy"></i></button>` : ""}<button class="delete" title="Hapus" data-game-action="delete" data-id="${escapeHTML(game.id)}"><i class="fas fa-trash"></i></button></div></td></tr>`).join("") : '<tr><td colspan="9"><div class="game-admin-empty"><i class="fas fa-puzzle-piece"></i><strong>Game tidak ditemukan</strong><br>Tambah game baru atau ubah pencarian.</div></td></tr>';
  }

  function renderSelectedClass() {
    const items = gamesInClass(state.selectedClass, true);
    const allItems = gamesInClass(state.selectedClass);
    $("gameClassGrid").innerHTML = `<section class="admin-task-class-detail">
      <div class="admin-task-class-detail-nav"><button type="button" class="btn btn-secondary" data-back-game-classes><i class="fas fa-arrow-left"></i> Kembali ke Daftar Kelas</button><span><i class="fas fa-users"></i> ${state.students.filter(student => sameClass(student.kelas, state.selectedClass) && student.status === "aktif").length} siswa aktif</span></div>
      <header class="admin-task-class-detail-header"><span class="admin-task-class-icon"><i class="fas fa-folder-open"></i></span><div><small>Ruang game</small><h3>Kelas ${escapeHTML(state.selectedClass)}</h3><p>Game dibuat setelah kelas dipilih dan tersedia untuk siswa kelas ini.</p></div><div class="admin-task-detail-stats"><span><b>${allItems.length}</b><small>Game</small></span><span><b>${allItems.filter(game => game.status === "aktif").length}</b><small>Aktif</small></span></div></header>
      <div class="admin-task-class-content"><div class="admin-task-class-content-head"><span><strong>Daftar game</strong><small>${items.length} game ditampilkan</small></span><button type="button" class="btn btn-primary btn-sm" data-add-game-class="${escapeHTML(state.selectedClass)}"><i class="fas fa-plus"></i> Tambah Game</button></div>
      <div class="table-container"><table class="table"><thead><tr><th>No</th><th>Game</th><th>Mapel</th><th>Level</th><th>Kesulitan</th><th>Jenis</th><th>Soal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${renderGameRows(items)}</tbody></table></div></div>
    </section>`;
  }

  function renderGames() {
    syncGameManagerChrome();
    if (state.selectedClass) renderSelectedClass();
    else renderClassOverview();
  }

  function blankQuestion(type) {
    if (type === "true_false") return { prompt: "", options: ["Benar", "Salah"], answer: "Benar", hint: "", explanation: "" };
    if (type === "scramble") return { prompt: "", options: [], answer: "", hint: "", explanation: "" };
    return { prompt: "", options: ["", "", "", ""], answer: "", hint: "", explanation: "" };
  }

  function gameTypeGuide(type) {
    return {
      quiz: "Pilihan Ganda: tulis pertanyaan, minimal dua opsi, lalu isi jawaban yang sama persis dengan salah satu opsi.",
      true_false: "Benar / Salah: tulis satu pernyataan, lalu tentukan apakah pernyataan itu Benar atau Salah.",
      scramble: "Susun Kata: tulis petunjuk pada pertanyaan dan jawaban berupa satu kata/frasa yang harus disusun siswa.",
      puzzle: "Puzzle Pasangan: setiap soal adalah satu pasangan. Isi Kartu A dengan istilah/pertanyaan dan Kartu B dengan pasangan jawabannya."
    }[type] || "Sesuaikan isi soal dengan format game yang dipilih.";
  }

  function updateGameTypeGuide() {
    const guide = $("gameTypeGuide");
    if (guide) guide.textContent = gameTypeGuide($("gameType").value);
  }

  function collectQuestions(validate = false) {
    const type = $("gameType").value;
    return [...document.querySelectorAll(".question-editor")].map((card, index) => {
      const prompt = card.querySelector('[data-field="prompt"]').value.trim();
      const answer = card.querySelector('[data-field="answer"]').value.trim();
      const explanation = card.querySelector('[data-field="explanation"]')?.value.trim() || "";
      const hint = card.querySelector('[data-field="hint"]')?.value.trim() || "";
      let options = [...card.querySelectorAll('[data-field="option"]')].map(input => input.value.trim()).filter(Boolean);
      if (type === "true_false") options = ["Benar", "Salah"];
      if (validate && (!prompt || !answer || (type === "quiz" && (options.length < 2 || !options.includes(answer))))) throw new Error(`Soal ${index + 1} belum lengkap. Untuk pilihan ganda, jawaban benar harus sama dengan salah satu opsi.`);
      return { prompt, answer, explanation, hint, options };
    });
  }

  function renderQuestions(questions) {
    const type = $("gameType").value; const list = questions.length ? questions : [blankQuestion(type)];
    $("questionList").innerHTML = list.map((question, index) => {
      const options = type === "quiz" ? (question.options?.length ? [...question.options, "", "", ""].slice(0, 4) : ["", "", "", ""]) : [];
      const promptPlaceholder = type === "puzzle" ? "Contoh: 25 x 4 atau Library" : type === "scramble" ? "Contoh: Bahasa Inggris dari keluarga" : type === "true_false" ? "Contoh: Kubus memiliki 12 rusuk." : "Contoh: Hasil dari 25 x 4 adalah ...";
      return `<div class="question-editor" data-question-index="${index}"><div class="question-editor-head"><strong>Soal ${index + 1}</strong><button type="button" class="remove-question" data-remove-question="${index}" title="Hapus soal"><i class="fas fa-trash"></i></button></div>
        <label>${type === "puzzle" ? "Kartu Pasangan A *" : "Pertanyaan / Petunjuk *"}</label><textarea data-field="prompt" rows="2" placeholder="${promptPlaceholder}">${escapeHTML(question.prompt || "")}</textarea>
        ${type === "quiz" ? `<div class="question-option-grid">${options.map((option, optionIndex) => `<div><label>Opsi ${String.fromCharCode(65 + optionIndex)}</label><input data-field="option" value="${escapeHTML(option)}" placeholder="Pilihan jawaban"></div>`).join("")}</div><div class="question-extra"><div><label>Jawaban Benar *</label><input data-field="answer" value="${escapeHTML(question.answer || "")}" placeholder="Harus sama dengan salah satu opsi"></div><div><label>Penjelasan</label><input data-field="explanation" value="${escapeHTML(question.explanation || "")}" placeholder="Pembahasan setelah menjawab"></div></div><label style="margin-top:10px">Petunjuk Bantuan Siswa</label><input data-field="hint" value="${escapeHTML(question.hint || "")}" placeholder="Petunjuk ringan tanpa membocorkan jawaban">` : type === "true_false" ? `<div class="question-extra"><div><label>Jawaban Benar *</label><select data-field="answer"><option ${question.answer === "Benar" ? "selected" : ""}>Benar</option><option ${question.answer === "Salah" ? "selected" : ""}>Salah</option></select></div><div><label>Penjelasan</label><input data-field="explanation" value="${escapeHTML(question.explanation || "")}" placeholder="Mengapa benar atau salah?"></div></div><label style="margin-top:10px">Petunjuk Bantuan Siswa</label><input data-field="hint" value="${escapeHTML(question.hint || "")}" placeholder="Arahkan siswa pada kata kunci soal">` : type === "puzzle" ? `<div class="question-extra"><div><label>Kartu Pasangan B *</label><input data-field="answer" value="${escapeHTML(question.answer || "")}" placeholder="Jawaban atau pasangan kartu A"></div><div><label>Penjelasan</label><input data-field="explanation" value="${escapeHTML(question.explanation || "")}" placeholder="Hubungan kedua kartu"></div></div><input data-field="hint" type="hidden" value="">` : `<div class="question-extra"><div><label>Jawaban Kata *</label><input data-field="answer" value="${escapeHTML(question.answer || "")}" placeholder="Contoh: school"></div><div><label>Petunjuk tambahan</label><input data-field="hint" value="${escapeHTML(question.hint || "")}" placeholder="Opsional"></div></div><label style="margin-top:10px">Penjelasan</label><input data-field="explanation" value="${escapeHTML(question.explanation || "")}" placeholder="Pembahasan jawaban">`}
      </div>`;
    }).join("");
  }

  function openModal(game = null, targetClass = "") {
    const className = String(game?.className || targetClass || state.selectedClass || "").trim();
    if (!game && !className) return notify("Pilih salah satu kelas terlebih dahulu.", "error");
    const isEditing = Boolean(game?.id);
    state.editing = isEditing ? clone(game) : null; $("gameModalTitle").textContent = isEditing ? "Edit Game" : `Tambah Game Kelas ${className}`;
    $("gameClass").value = className;
    $("gameTitle").value = game?.title || ""; $("gameSubject").value = game?.subject || "Matematika"; $("gameDescription").value = game?.description || "";
    $("gameLevel").value = game?.level || nextLevel($("gameSubject").value, className); $("gameDifficulty").value = game?.difficulty || "Mudah"; $("gameType").value = game?.type || "quiz"; updateGameTypeGuide();
    $("gameStatus").value = game?.status || "aktif"; $("gamePassingScore").value = game?.passingScore || 70; $("gameTimeLimit").value = game?.timeLimit || 90; $("gamePoints").value = game?.points || 100;
    renderQuestions(game?.questions || []); $("gameModal").classList.add("active");
  }

  function closeModal() { $("gameModal").classList.remove("active"); state.editing = null; }
  function nextLevel(subject, className = state.selectedClass) { return Math.max(0, ...gamesInClass(className).filter(game => game.subject === subject).map(game => game.level)) + 1; }

  async function saveGame() {
    try {
      const title = $("gameTitle").value.trim(); if (!title) throw new Error("Judul game wajib diisi.");
      const questions = collectQuestions(true); if (!questions.length) throw new Error("Tambahkan minimal satu soal.");
      const className = $("gameClass").value.trim();
      if (!state.editing && !className) throw new Error("Kelas game wajib dipilih.");
      const payload = { id: state.editing?.id, className, title, subject: $("gameSubject").value, description: $("gameDescription").value.trim(), level: Number($("gameLevel").value), difficulty: $("gameDifficulty").value, type: $("gameType").value, status: $("gameStatus").value, passingScore: Number($("gamePassingScore").value), timeLimit: Number($("gameTimeLimit").value), points: Number($("gamePoints").value), questions };
      const duplicateLevel = state.games.find(game => game.id !== payload.id && (!game.className || sameClass(game.className, payload.className)) && game.subject === payload.subject && game.level === payload.level);
      if (duplicateLevel) throw new Error(`Level ${payload.level} untuk ${payload.subject} sudah digunakan oleh “${duplicateLevel.title}”.`);
      $("saveGameBtn").disabled = true; await store.save(payload); await loadGames(); closeModal(); notify("Game dan bank soal berhasil disimpan.");
    } catch (error) { console.error(error); notify(error.message || "Game gagal disimpan.", "error"); } finally { $("saveGameBtn").disabled = false; }
  }

  async function handleAction(action, id) {
    const game = state.games.find(item => item.id === id); if (!game) return;
    if (action === "edit") openModal(game);
    if (action === "duplicate") { const copy = clone(game); copy.id = null; copy.title += " (Salinan)"; copy.level = nextLevel(copy.subject, copy.className); openModal(copy, copy.className); }
    if (action === "delete" && window.confirm(`Hapus “${game.title}” beserta semua soalnya?`)) { try { await store.remove(id); await loadGames(); notify("Game berhasil dihapus."); } catch (error) { notify(error.message || "Game gagal dihapus.", "error"); } }
  }

  function openClass(className) {
    state.selectedClass = String(className || "").trim();
    state.filter = "";
    $("gameSearch").value = "";
    renderGames();
  }

  function closeClass() {
    state.selectedClass = "";
    state.filter = "";
    $("gameSearch").value = "";
    renderGames();
  }

  function attachEvents() {
    root.addEventListener("click", event => {
      const open = event.target.closest("[data-open-game-class]");
      const back = event.target.closest("[data-back-game-classes]");
      const add = event.target.closest("[data-add-game-class]");
      if (open) return openClass(open.dataset.openGameClass);
      if (back) return closeClass();
      if (add) return openModal(null, add.dataset.addGameClass);
      if (event.target.closest("#addGameBtn")) return openModal(null, state.selectedClass);
      const action = event.target.closest("[data-game-action]");
      if (action) handleAction(action.dataset.gameAction, action.dataset.id);
    });
    root.addEventListener("input", event => { if (event.target.id === "gameSearch") { state.filter = event.target.value; renderGames(); } });
    root.addEventListener("change", event => { if (event.target.id === "gameSubjectFilter") { state.subject = event.target.value; renderGames(); } if (event.target.id === "gameDifficultyFilter") { state.difficulty = event.target.value; renderGames(); } });
    $("gameModal").addEventListener("click", event => {
      if (event.target === $("gameModal") || event.target.closest("[data-game-close]")) closeModal();
      if (event.target.closest("#addQuestionBtn")) { let questions; try { questions = collectQuestions(); } catch (_) { questions = []; } questions.push(blankQuestion($("gameType").value)); renderQuestions(questions); }
      const remove = event.target.closest("[data-remove-question]"); if (remove) { const questions = collectQuestions(); questions.splice(Number(remove.dataset.removeQuestion), 1); renderQuestions(questions); }
    });
    $("gameType").addEventListener("change", () => { const count = document.querySelectorAll(".question-editor").length || 1; updateGameTypeGuide(); renderQuestions(Array.from({ length: count }, () => blankQuestion($("gameType").value))); notify("Format soal disesuaikan dengan jenis game."); });
    $("gameSubject").addEventListener("change", () => { if (!state.editing) $("gameLevel").value = nextLevel($("gameSubject").value, $("gameClass").value); });
    $("saveGameBtn").addEventListener("click", saveGame); document.querySelector('[data-page="game"]')?.addEventListener("click", async () => { await loadClassCatalog(); await loadGames(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && $("gameModal").classList.contains("active")) closeModal(); });
  }

  async function loadGames() {
    try { state.games = await store.list("admin"); summary(); renderGames(); } catch (error) { notify(error.message || "Data game gagal dimuat.", "error"); }
  }

  async function loadClassCatalog() {
    state.classes = localClasses();
    state.students = [];
    if (!window.supabase?.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    try {
      const { data, error } = await client.rpc("admin_list_kelas_siswa");
      if (!error) state.classes = [...(data || []), ...state.classes];
    } catch (_) {}
    try {
      const { data, error } = await client.rpc("admin_list_akun_siswa", { p_search: "" });
      if (!error) state.students = data || [];
    } catch (_) {}
  }

  async function initialize() { shell(); attachEvents(); await loadClassCatalog(); await loadGames(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true }); else initialize();
})();
