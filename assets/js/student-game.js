(function () {
  "use strict";

  const store = window.EduSkyGameStore;
  if (!store) return;

  const $ = id => document.getElementById(id);
  const state = { games: [], subject: "Matematika", current: null, index: 0, correct: 0, selected: "", checked: false, seconds: 0, timer: null, scramble: [], letters: [], puzzleTiles: [], puzzleOpen: [], puzzleLocked: false, mistakes: 0, finishing: false, hintsUsed: 0, puzzleHintTimer: null };
  const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const progress = () => store.getProgress();

  function toast(message) {
    const node = $("gameToast"); node.textContent = message; node.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
  }

  function applyTheme(theme, persist = false) {
    const dark = theme === "dark";
    document.documentElement.toggleAttribute("data-theme", dark);
    document.body.toggleAttribute("data-theme", dark);
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.setAttribute("data-theme", "dark");
    }
    if (persist) localStorage.setItem("edusky_theme", dark ? "dark" : "light");
    const button = $("gameThemeToggle");
    if (button) {
      const label = dark ? "Aktifkan tema terang" : "Aktifkan tema gelap";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = `<i class="fas fa-${dark ? "sun" : "moon"}" aria-hidden="true"></i>`;
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f172a" : "#5b5bd6");
  }

  function toggleTheme() {
    const dark = document.documentElement.getAttribute("data-theme") !== "dark";
    applyTheme(dark ? "dark" : "light", true);
  }

  function renderStats() {
    const items = Object.values(progress());
    $("totalStars").textContent = items.reduce((sum, item) => sum + Number(item.stars || 0), 0);
    $("totalCoins").textContent = Number(store.getRewards?.().coins || 0).toLocaleString("id-ID");
    $("completedLevels").textContent = items.filter(item => item.completed).length;
    $("bestScore").textContent = items.length ? Math.max(...items.map(item => Number(item.score || 0))) : 0;
  }

  function stars(count) {
    return Array.from({ length: 3 }, (_, index) => `<i class="${index < count ? "fas" : "far"} fa-star"></i>`).join("");
  }

  function todayProgress() {
    const dayKey = store.localDateKey?.() || "";
    return Object.entries(progress()).filter(([, item]) => store.localDateKey?.(item.updatedAt) === dayKey);
  }

  function learningStreak() {
    const activity = store.getActivity?.("") || {};
    const activeDays = new Set(Object.keys(activity).filter(key => Number(activity[key]?.attempts || 0) > 0));
    if (todayProgress().length) activeDays.add(store.localDateKey());
    let streak = 0; const cursor = new Date();
    while (activeDays.has(store.localDateKey(cursor))) {
      streak += 1; cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function renderMissions() {
    const activity = store.getActivity?.() || {};
    const recent = todayProgress();
    const recentGames = recent.map(([id]) => state.games.find(game => game.id === id)).filter(Boolean);
    const attempts = Math.max(Number(activity.attempts || 0), recent.length);
    const todayStars = Math.max(Number(activity.stars || 0), recent.reduce((sum, [, item]) => sum + Number(item.stars || 0), 0));
    const subjects = new Set([...(activity.subjects || []), ...recentGames.map(game => game.subject)]).size;
    const missions = [
      { id: "play", icon: "fa-gamepad", title: "Mulai petualangan", text: "Mainkan minimal 1 level", value: attempts, target: 1, reward: 20 },
      { id: "stars", icon: "fa-star", title: "Pemburu bintang", text: "Raih 2 bintang hari ini", value: todayStars, target: 2, reward: 30 },
      { id: "explore", icon: "fa-compass", title: "Jelajahi dua dunia", text: "Mainkan Matematika dan Bahasa Inggris", value: subjects, target: 2, reward: 50 }
    ];
    const completed = missions.filter(item => item.value >= item.target).map(item => item.id);
    const claim = store.claimDailyRewards?.(completed) || { earned: 0, reward: store.getRewards?.() || {} };
    const claimed = new Set(claim.reward?.claimedMissions?.[store.localDateKey?.()] || []);
    $("dailyMissions").innerHTML = missions.map(item => {
      const done = item.value >= item.target;
      const percentage = Math.min(100, Math.round(item.value / item.target * 100));
      return `<article class="daily-mission-card${done ? " completed" : ""}">
        <span class="mission-check"><i class="fas ${done ? "fa-check" : item.icon}"></i></span>
        <div class="mission-copy"><small>${done ? "Misi selesai" : "Misi harian"}</small><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text)}</p><div class="mission-progress"><span style="width:${percentage}%"></span></div><em>${Math.min(item.value, item.target)} / ${item.target}</em></div>
        <span class="mission-reward${claimed.has(item.id) ? " claimed" : ""}"><i class="fas fa-coins"></i> ${claimed.has(item.id) ? "Diterima" : `+${item.reward}`}</span>
      </article>`;
    }).join("");
    $("learningStreak").textContent = `${learningStreak()} hari`;
    renderStats();
    return Number(claim.earned || 0);
  }

  function renderAchievements() {
    const saved = progress();
    const completedGames = state.games.filter(game => saved[game.id]?.completed);
    const totalStars = Object.values(saved).reduce((sum, item) => sum + Number(item.stars || 0), 0);
    const subjects = new Set(completedGames.map(game => game.subject));
    const achievements = [
      { icon: "🚀", name: "Langkah Pertama", text: "Selesaikan satu level", unlocked: completedGames.length >= 1 },
      { icon: "⭐", name: "Pemburu Bintang", text: "Kumpulkan enam bintang", unlocked: totalStars >= 6 },
      { icon: "🧭", name: "Penjelajah Hebat", text: "Selesaikan kedua mata pelajaran", unlocked: subjects.size >= 2 },
      { icon: "👑", name: "Penakluk Boss", text: "Selesaikan Level Boss", unlocked: completedGames.some(game => game.level % 4 === 0) }
    ];
    $("achievementGrid").innerHTML = achievements.map(item => `<article class="achievement-card${item.unlocked ? " unlocked" : " locked"}"><span>${item.unlocked ? item.icon : '<i class="fas fa-lock"></i>'}</span><div><small>${item.unlocked ? "Badge terbuka" : "Belum terbuka"}</small><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.text)}</p></div></article>`).join("");
  }

  function renderLevels() {
    const games = state.games.filter(game => game.subject === state.subject && game.status === "aktif").sort((a, b) => a.level - b.level);
    const saved = progress();
    $("levelTitle").textContent = `Level ${state.subject}`;
    if (!games.length) {
      $("levelPath").innerHTML = '<div class="game-loading"><i class="fas fa-gamepad"></i><br>Belum ada level aktif untuk mata pelajaran ini.</div>';
      return;
    }
      const completedLevels = new Set(games.filter(game => saved[game.id]?.completed).map(game => Number(game.level)));
      const recommended = games.find(game => (Number(game.level) === 1 || completedLevels.has(Number(game.level) - 1)) && !saved[game.id]?.completed);
    $("levelPath").innerHTML = games.map((game, index) => {
      const result = saved[game.id] || {};
        const level = Number(game.level);
        const unlocked = level === 1 || completedLevels.has(level - 1);
      const completed = Boolean(result.completed);
      const boss = game.level % 4 === 0;
      const classes = `${completed ? " completed" : ""}${unlocked ? "" : " locked"}${boss ? " boss-level" : ""}${recommended?.id === game.id ? " recommended" : ""}`;
      const type = store.typeNames[game.type] || "Kuis";
      return `<article class="level-card${classes}">
        ${boss ? '<span class="boss-ribbon"><i class="fas fa-crown"></i> Boss Challenge</span>' : recommended?.id === game.id ? '<span class="recommended-ribbon"><i class="fas fa-location-arrow"></i> Lanjutkan di sini</span>' : ""}
        <div class="level-top"><span class="level-number">${completed ? '<i class="fas fa-check"></i>' : boss ? '<i class="fas fa-crown"></i>' : game.level}</span>${unlocked ? `<span class="difficulty ${game.difficulty.toLowerCase()}">${escapeHTML(game.difficulty)}</span>` : '<span class="level-lock"><i class="fas fa-lock"></i></span>'}</div>
        <h3>${escapeHTML(game.title)}</h3><p>${escapeHTML(game.description)}</p>
        <div class="level-info"><span><i class="fas fa-puzzle-piece"></i> ${escapeHTML(type)}</span><span><i class="fas fa-coins"></i> ${Number(game.points || 0)} poin</span><span><i class="fas fa-list"></i> ${game.questions.length} soal</span></div>
        ${result.attempts ? `<div class="best-result"><span>Terbaik: ${result.score}</span><span class="stars">${stars(result.stars)}</span></div>` : ""}
        <div class="level-progress"><span style="width:${Math.min(100, Number(result.score || 0))}%"></span></div>
        <button class="play-level" data-game-id="${escapeHTML(game.id)}" ${unlocked ? "" : "disabled"}>${completed ? '<i class="fas fa-play"></i> Main Lagi' : unlocked && boss ? '<i class="fas fa-crown"></i> Hadapi Boss' : unlocked ? '<i class="fas fa-rocket"></i> Mulai Level' : '<i class="fas fa-lock"></i> Selesaikan level sebelumnya'}</button>
      </article>`;
    }).join("");
  }

  function shuffleWord(word) {
    const letters = String(word).toUpperCase().split("");
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    if (letters.join("") === String(word).toUpperCase() && letters.length > 1) [letters[0], letters[1]] = [letters[1], letters[0]];
    return letters;
  }

  function renderQuestion() {
    const game = state.current; const question = game.questions[state.index];
    state.selected = ""; state.checked = false; state.scramble = []; state.hintsUsed = 0;
    if (game.type === "puzzle") { renderPuzzle(); return; }
    $("playFooter").hidden = false;
    $("questionCount").textContent = `Soal ${state.index + 1} dari ${game.questions.length}`;
    $("questionBar").style.width = `${((state.index + 1) / game.questions.length) * 100}%`;
    $("answerFeedback").className = "answer-feedback"; $("answerFeedback").textContent = "";
    const next = $("nextQuestion"); next.disabled = true; next.textContent = "Periksa Jawaban";
    let content = `<h2>${escapeHTML(question.prompt)}</h2><div class="learning-help"><button type="button" id="useHint"><i class="fas fa-lightbulb"></i><span>Bantuan 1 dari 3</span></button><p id="hintMessage">Kamu boleh meminta petunjuk tanpa takut mencoba.</p></div>`;
    if (game.type === "scramble") {
      state.letters = shuffleWord(question.answer);
      content += `<p class="scramble-help"><i class="fas fa-lightbulb"></i> Susun huruf menjadi jawaban yang tepat.</p><div class="scramble-word" id="scrambleWord" aria-label="Jawaban"></div><div class="answer-grid" id="letterPool">${state.letters.map((letter, index) => `<button class="letter-button" data-letter-index="${index}">${escapeHTML(letter)}</button>`).join("")}</div><button class="scramble-reset" id="scrambleReset"><i class="fas fa-undo"></i> Ulangi susunan</button>`;
    } else {
      const options = game.type === "true_false" ? ["Benar", "Salah"] : question.options;
      content += `<div class="answer-grid">${options.map((option, index) => `<button class="answer-option" data-answer="${escapeHTML(option)}"><b>${String.fromCharCode(65 + index)}</b><span>${escapeHTML(option)}</span></button>`).join("")}</div>`;
    }
    $("questionStage").innerHTML = content;
  }

  function renderPuzzle() {
    const game = state.current;
    state.puzzleOpen = []; state.puzzleLocked = false; state.puzzleTiles = []; state.hintsUsed = 0;
    game.questions.forEach((pair, pairIndex) => {
      state.puzzleTiles.push({ pairIndex, text: pair.prompt, side: "question" }, { pairIndex, text: pair.answer, side: "answer" });
    });
    for (let index = state.puzzleTiles.length - 1; index > 0; index--) {
      const random = Math.floor(Math.random() * (index + 1));
      [state.puzzleTiles[index], state.puzzleTiles[random]] = [state.puzzleTiles[random], state.puzzleTiles[index]];
    }
    $("playFooter").hidden = true; $("questionCount").textContent = `Pasangan 0 dari ${game.questions.length}`; $("questionBar").style.width = "0%";
    $("questionStage").innerHTML = `<div class="puzzle-heading"><span><i class="fas fa-puzzle-piece"></i></span><div><h2>Cocokkan semua pasangan!</h2><p>Buka dua kartu. Temukan soal dan jawaban yang saling berhubungan.</p></div><button type="button" class="puzzle-hint" id="puzzleHint"><i class="fas fa-lightbulb"></i> Intip pasangan <small>3x</small></button></div><div class="puzzle-board">${state.puzzleTiles.map((tile, index) => `<button class="puzzle-card" data-puzzle-card="${index}" aria-label="Kartu tertutup"><span class="puzzle-front"><i class="fas fa-question"></i></span><span class="puzzle-back">${escapeHTML(tile.text)}</span></button>`).join("")}</div><div class="puzzle-status" id="puzzleStatus"><span><i class="fas fa-check-circle"></i> <b>0</b> cocok</span><span><i class="fas fa-heart-crack"></i> <b>0</b> percobaan salah</span></div>`;
  }

  function usePuzzleHint() {
    if (state.puzzleLocked || state.hintsUsed >= 3) return;
    const available = state.puzzleTiles.map((tile, index) => ({ ...tile, index })).filter(tile => !document.querySelector(`[data-puzzle-card="${tile.index}"]`)?.classList.contains("matched"));
    const first = available[0];
    const second = available.find(tile => tile.pairIndex === first?.pairIndex && tile.side !== first?.side);
    if (!first || !second) return;
    state.hintsUsed += 1; state.puzzleLocked = true;
    const buttons = [first, second].map(tile => document.querySelector(`[data-puzzle-card="${tile.index}"]`));
    buttons.forEach(button => button?.classList.add("revealed", "hinted"));
    const hintButton = $("puzzleHint");
    if (hintButton) { hintButton.innerHTML = `<i class="fas fa-lightbulb"></i> Intip pasangan <small>${3 - state.hintsUsed}x</small>`; hintButton.disabled = state.hintsUsed >= 3; }
    clearTimeout(state.puzzleHintTimer);
    state.puzzleHintTimer = setTimeout(() => { buttons.forEach(button => button?.classList.remove("revealed", "hinted")); state.puzzleLocked = false; }, 1500);
  }

  function choosePuzzleCard(button) {
    if (state.puzzleLocked || button.classList.contains("matched") || button.classList.contains("revealed")) return;
    button.classList.add("revealed"); state.puzzleOpen.push(Number(button.dataset.puzzleCard));
    if (state.puzzleOpen.length < 2) return;
    state.puzzleLocked = true; const [firstIndex, secondIndex] = state.puzzleOpen;
    const first = state.puzzleTiles[firstIndex]; const second = state.puzzleTiles[secondIndex];
    const firstButton = document.querySelector(`[data-puzzle-card="${firstIndex}"]`); const secondButton = document.querySelector(`[data-puzzle-card="${secondIndex}"]`);
    if (first.pairIndex === second.pairIndex && first.side !== second.side) {
      firstButton.classList.add("matched"); secondButton.classList.add("matched"); state.correct += 1; state.puzzleOpen = []; state.puzzleLocked = false;
      updatePuzzleStatus();
      if (state.correct === state.current.questions.length) setTimeout(finishGame, 650);
    } else {
      state.mistakes += 1; updatePuzzleStatus();
      setTimeout(() => { firstButton?.classList.remove("revealed"); secondButton?.classList.remove("revealed"); state.puzzleOpen = []; state.puzzleLocked = false; }, 700);
    }
  }

  function updatePuzzleStatus() {
    $("questionCount").textContent = `Pasangan ${state.correct} dari ${state.current.questions.length}`;
    $("questionBar").style.width = `${(state.correct / state.current.questions.length) * 100}%`;
    const status = $("puzzleStatus"); if (status) status.innerHTML = `<span><i class="fas fa-check-circle"></i> <b>${state.correct}</b> cocok</span><span><i class="fas fa-heart-crack"></i> <b>${state.mistakes}</b> percobaan salah</span>`;
  }

  function updateScramble() {
    state.selected = state.scramble.map(index => state.letters[index]).join("");
    $("scrambleWord").innerHTML = state.scramble.map((index, position) => `<button class="letter-button" data-remove-position="${position}">${escapeHTML(state.letters[index])}</button>`).join("");
    document.querySelectorAll("[data-letter-index]").forEach(button => button.classList.toggle("used", state.scramble.includes(Number(button.dataset.letterIndex))));
    $("nextQuestion").disabled = !state.selected;
  }

  function chooseAnswer(button) {
    if (state.checked) return;
    document.querySelectorAll(".answer-option").forEach(node => node.classList.remove("selected"));
    button.classList.add("selected"); state.selected = button.dataset.answer; $("nextQuestion").disabled = false;
  }

  function revealAnswerWithHelp(question) {
    state.checked = true;
    document.querySelectorAll(".answer-option").forEach(button => {
      if (button.dataset.answer.trim().toLowerCase() === String(question.answer).trim().toLowerCase()) button.classList.add("correct");
      button.disabled = true;
    });
    document.querySelectorAll(".letter-button").forEach(button => { button.disabled = true; });
    const feedback = $("answerFeedback"); feedback.className = "answer-feedback help";
    feedback.innerHTML = `<i class="fas fa-book-open"></i> Jawabannya <strong>${escapeHTML(question.answer)}</strong>${question.explanation ? ` — ${escapeHTML(question.explanation)}` : ""}`;
    $("nextQuestion").disabled = false;
    $("nextQuestion").textContent = state.index === state.current.questions.length - 1 ? "Lihat Hasil" : "Saya Mengerti, Lanjut";
  }

  function useHint() {
    if (state.checked || state.hintsUsed >= 3) return;
    const question = state.current.questions[state.index];
    state.hintsUsed += 1;
    const message = $("hintMessage"); const button = $("useHint");
    if (state.hintsUsed === 1) {
      const customHint = String(question.hint || "").trim();
      const exposesAnswer = customHint.toLowerCase() === String(question.answer || "").trim().toLowerCase();
      message.innerHTML = state.current.type === "scramble"
        ? `<i class="fas fa-spell-check"></i> Kata terdiri dari <strong>${String(question.answer).length} huruf</strong> dan dimulai dengan <strong>${escapeHTML(String(question.answer).charAt(0).toUpperCase())}</strong>.`
        : customHint && !exposesAnswer ? `<i class="fas fa-lightbulb"></i> ${escapeHTML(customHint)}` : '<i class="fas fa-lightbulb"></i> Baca kembali kata kunci pada pertanyaan, lalu singkirkan pilihan yang tidak sesuai.';
    } else if (state.hintsUsed === 2) {
      if (state.current.type === "quiz") {
        const wrong = [...document.querySelectorAll(".answer-option")].find(option => option.dataset.answer.trim().toLowerCase() !== String(question.answer).trim().toLowerCase() && !option.classList.contains("selected"));
        wrong?.classList.add("eliminated"); if (wrong) wrong.disabled = true;
        message.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Satu pilihan yang kurang tepat sudah disingkirkan.';
      } else if (state.current.type === "scramble") {
        message.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> Dua huruf awalnya adalah <strong>${escapeHTML(String(question.answer).slice(0, 2).toUpperCase())}</strong>.`;
      } else {
        message.innerHTML = '<i class="fas fa-magnifying-glass"></i> Periksa apakah seluruh pernyataan benar, bukan hanya salah satu bagiannya.';
      }
    } else {
      message.innerHTML = '<i class="fas fa-book-open"></i> Pelajari jawaban dan pembahasannya, lalu coba lagi nanti.';
      revealAnswerWithHelp(question);
    }
    if (button) {
      button.classList.toggle("final", state.hintsUsed === 2);
      button.disabled = state.hintsUsed >= 3;
      button.querySelector("span").textContent = state.hintsUsed >= 3 ? "Jawaban ditampilkan" : `Bantuan ${state.hintsUsed + 1} dari 3`;
    }
  }

  function checkAnswer() {
    if (!state.selected || state.checked) return;
    state.checked = true;
    const question = state.current.questions[state.index];
    const correct = state.selected.trim().toLowerCase() === String(question.answer).trim().toLowerCase();
    if (correct) state.correct += 1;
    document.querySelectorAll(".answer-option").forEach(button => {
      if (button.dataset.answer.trim().toLowerCase() === String(question.answer).trim().toLowerCase()) button.classList.add("correct");
      else if (button.classList.contains("selected")) button.classList.add("wrong");
      button.disabled = true;
    });
    document.querySelectorAll(".letter-button").forEach(button => { button.disabled = true; });
    const feedback = $("answerFeedback"); feedback.className = `answer-feedback ${correct ? "good" : "bad"}`;
    feedback.innerHTML = correct ? '<i class="fas fa-check-circle"></i> Benar! Kerja bagus.' : `<i class="fas fa-times-circle"></i> Jawaban: ${escapeHTML(question.answer)}${question.explanation ? ` — ${escapeHTML(question.explanation)}` : ""}`;
    $("nextQuestion").disabled = false; $("nextQuestion").textContent = state.index === state.current.questions.length - 1 ? "Lihat Hasil" : "Soal Berikutnya";
  }

  function nextQuestion() {
    if (!state.checked) { checkAnswer(); return; }
    if (state.index < state.current.questions.length - 1) { state.index += 1; renderQuestion(); } else finishGame();
  }

  function tick() {
    state.seconds -= 1; $("timer").querySelector("span").textContent = Math.max(0, state.seconds); $("timer").classList.toggle("urgent", state.seconds <= 10);
    if (state.seconds <= 0) finishGame();
  }

  function startGame(game) {
    if (!game.questions?.length) { toast("Level ini belum memiliki soal."); return; }
    state.current = game; state.index = 0; state.correct = 0; state.mistakes = 0; state.finishing = false; state.seconds = game.timeLimit;
    $("playLevel").textContent = `${game.level % 4 === 0 ? "Boss Level" : `Level ${game.level}`} • ${game.difficulty}`; $("playTitle").textContent = game.title;
    $("timer").querySelector("span").textContent = state.seconds; $("timer").classList.remove("urgent");
    $("playOverlay").classList.add("show"); $("playOverlay").setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
    clearInterval(state.timer); state.timer = setInterval(tick, 1000); renderQuestion();
  }

  async function finishGame() {
    if (!state.current || state.finishing) return;
    state.finishing = true;
    clearInterval(state.timer); const game = state.current; const baseScore = Math.round((state.correct / game.questions.length) * 100); const score = game.type === "puzzle" ? Math.max(0, baseScore - state.mistakes * 5) : baseScore;
    const passed = score >= game.passingScore; const starCount = !passed ? 0 : score >= 90 ? 3 : score >= 75 ? 2 : 1;
    const durationSeconds = Math.max(1, Number(game.timeLimit || 0) - Math.max(0, Number(state.seconds || 0)));
    const wrongAnswers = game.type === "puzzle"
      ? state.mistakes + Math.max(0, game.questions.length - state.correct)
      : Math.max(0, game.questions.length - state.correct);
    const savedResult = await store.saveProgress(game, score, starCount, {
      correct: state.correct,
      wrong: wrongAnswers,
      total: game.questions.length,
      durationSeconds
    });
    const missionCoins = renderMissions();
    const earnedCoins = Number(savedResult?.coinsEarned || 0) + missionCoins;
    const boss = game.level % 4 === 0;
    $("playOverlay").classList.remove("show"); $("playOverlay").setAttribute("aria-hidden", "true");
    $("resultIcon").textContent = passed ? boss ? "👑" : "🏆" : "💪"; $("resultTitle").textContent = passed ? boss ? "Boss Ditaklukkan!" : "Level Berhasil!" : "Sedikit Lagi!";
    $("resultMessage").textContent = passed ? boss ? "Luar biasa! Kamu berhasil menaklukkan tantangan besar ini." : "Keren! Level berikutnya sudah terbuka." : `Capai nilai ${game.passingScore} untuk membuka level berikutnya.`;
    $("resultScore").textContent = score; $("resultStars").innerHTML = stars(starCount); $("resultCoins").textContent = earnedCoins;
    $("resultOverlay").classList.add("show"); $("resultOverlay").setAttribute("aria-hidden", "false"); renderStats(); renderLevels(); renderAchievements();
  }

  function closePlay() {
    if (state.current && !window.confirm("Keluar dari permainan? Progres soal saat ini tidak disimpan.")) return;
    clearInterval(state.timer); clearTimeout(state.puzzleHintTimer); state.current = null; $("playOverlay").classList.remove("show"); document.body.style.overflow = "";
  }

  function closeResult() { $("resultOverlay").classList.remove("show"); $("resultOverlay").setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; state.current = null; }

  function attachEvents() {
    $("gameThemeToggle")?.addEventListener("click", toggleTheme);
    $("subjectTabs").addEventListener("click", event => { const button = event.target.closest("[data-subject]"); if (!button) return; state.subject = button.dataset.subject; document.querySelectorAll("[data-subject]").forEach(node => node.classList.toggle("active", node === button)); renderLevels(); });
    $("levelPath").addEventListener("click", event => { const button = event.target.closest("[data-game-id]"); if (!button || button.disabled) return; const game = state.games.find(item => item.id === button.dataset.gameId); if (game) startGame(game); });
    $("questionStage").addEventListener("click", event => {
      if (event.target.closest("#useHint")) useHint();
      if (event.target.closest("#puzzleHint")) usePuzzleHint();
      const answer = event.target.closest("[data-answer]"); if (answer) chooseAnswer(answer);
      const puzzleCard = event.target.closest("[data-puzzle-card]"); if (puzzleCard) choosePuzzleCard(puzzleCard);
      const letter = event.target.closest("[data-letter-index]"); if (letter && !state.checked) { state.scramble.push(Number(letter.dataset.letterIndex)); updateScramble(); }
      const remove = event.target.closest("[data-remove-position]"); if (remove && !state.checked) { state.scramble.splice(Number(remove.dataset.removePosition), 1); updateScramble(); }
      if (event.target.closest("#scrambleReset") && !state.checked) { state.scramble = []; updateScramble(); }
    });
    $("nextQuestion").addEventListener("click", nextQuestion); $("closeGame").addEventListener("click", closePlay);
    $("finishGame").addEventListener("click", closeResult); $("retryGame").addEventListener("click", () => { const game = state.current; closeResult(); startGame(game); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && $("playOverlay").classList.contains("show")) closePlay(); });
    window.addEventListener("storage", event => { if (event.key === "edusky_theme") applyTheme(event.newValue === "dark" ? "dark" : "light"); });
  }

  async function initialize() {
    applyTheme(localStorage.getItem("edusky_theme") === "dark" ? "dark" : "light"); attachEvents(); renderStats();
    try { state.games = await store.list("student"); await store.syncProgress(); store.syncRewards?.(state.games); await store.syncAdventure?.(); renderStats(); renderMissions(); renderLevels(); renderAchievements(); } catch (error) { console.error(error); $("levelPath").innerHTML = '<div class="game-loading">Game belum dapat dimuat. Coba segarkan halaman.</div>'; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true }); else initialize();
})();
