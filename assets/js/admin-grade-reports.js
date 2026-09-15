(function () {
  "use strict";

  if (window.__EDUSKY_ADMIN_GRADE_REPORTS__) return;
  window.__EDUSKY_ADMIN_GRADE_REPORTS__ = true;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const CACHE_KEY = "edusky_admin_grade_submission_cache";
  const TASK_CACHE_KEY = "edusky_admin_grade_task_cache";
  const BUCKET = "tugas-siswa";
  const $ = id => document.getElementById(id);

  let client = null;
  let submissions = [];
  let tasks = [];
  let searchTimer = null;
  let toastTimer = null;
  let loading = false;
  const state = {
    level: "classes",
    className: "",
    subject: "",
    taskId: "",
    submissionId: ""
  };

  function normalizeArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string") {
      try { return normalizeArray(JSON.parse(value)); } catch (error) { return []; }
    }
    return value && typeof value === "object" ? [value] : [];
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function same(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function formatDate(value, withTime = true) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Number(value || 0));
    if (!seconds) return "Belum tercatat";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = Math.floor(seconds % 60);
    if (hours) return `${hours} jam ${minutes} menit`;
    if (minutes) return `${minutes} menit ${rest} detik`;
    return `${rest} detik`;
  }

  function initials(name) {
    return String(name || "Siswa").trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(part => part.charAt(0).toUpperCase()).join("") || "SW";
  }

  function safePhoto(value) {
    const photo = String(value || "");
    return /^(https?:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(photo) ? photo : "";
  }

  function isNetworkError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("failed to fetch")
      || message.includes("networkerror")
      || message.includes("load failed")
      || message.includes("network request");
  }

  function errorMessage(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "Laporan nilai gagal diakses.");
    if (code === "PGRST202" || message.toLowerCase().includes("could not find the function")) {
      return "Laporan pengumpulan belum aktif. Jalankan ulang supabase/tugas_setup.sql di Supabase SQL Editor.";
    }
    return message;
  }

  function readCache() {
    try { return normalizeArray(JSON.parse(localStorage.getItem(CACHE_KEY) || "[]")); }
    catch (error) { return []; }
  }

  function writeCache(value) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); }
    catch (error) { console.warn("Cache laporan nilai tidak dapat disimpan:", error); }
  }

  function readTaskCache() {
    try { return normalizeArray(JSON.parse(localStorage.getItem(TASK_CACHE_KEY) || "[]")); }
    catch (error) { return []; }
  }

  function writeTaskCache(value) {
    try { localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(value)); }
    catch (error) { console.warn("Cache tugas laporan tidak dapat disimpan:", error); }
  }

  function ensureClient() {
    if (client) return client;
    if (!window.supabase?.createClient) throw new Error("Library Supabase belum tersedia.");
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  function hasAdminSession() {
    try {
      const session = JSON.parse(localStorage.getItem("edusky_admin_session") || "null");
      return Boolean(session?.isLoggedIn === true && session?.role === "admin"
        && !(typeof session.expiresAt === "number" && session.expiresAt <= Date.now()));
    } catch (error) {
      return false;
    }
  }

  function showToast(message, type = "success") {
    let toast = $("adminGradeReportToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "adminGradeReportToast";
      toast.className = "admin-report-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `admin-report-toast ${type} show`;
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
  }

  function filteredSubmissions() {
    const keyword = String($("gradeReportSearch")?.value || "").trim().toLowerCase();
    if (!keyword) return submissions;
    return submissions.filter(item => [
      item.kelas,
      item.nama_siswa,
      item.nis,
      item.mata_pelajaran,
      item.judul_tugas,
      item.jawaban
    ].some(value => String(value || "").toLowerCase().includes(keyword)));
  }

  function filteredTasks() {
    const keyword = String($("gradeReportSearch")?.value || "").trim().toLowerCase();
    const publishedTasks = tasks.filter(item => item.status !== "draft");
    if (!keyword) return publishedTasks;
    const matchedSubmissionTaskIds = new Set(filteredSubmissions().map(item => String(item.tugas_id)));
    return publishedTasks.filter(item => matchedSubmissionTaskIds.has(String(item.id)) || [
      item.kelas,
      item.mata_pelajaran,
      item.judul,
      item.deskripsi,
      item.status
    ].some(value => String(value || "").toLowerCase().includes(keyword)));
  }

  function uniqueGroups(items, keyOf) {
    const groups = new Map();
    items.forEach(item => {
      const value = String(keyOf(item) || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!groups.has(key)) groups.set(key, { value, items: [] });
      groups.get(key).items.push(item);
    });
    return [...groups.values()].sort((left, right) => left.value.localeCompare(right.value, "id", {
      numeric: true,
      sensitivity: "base"
    }));
  }

  function updateCounts() {
    const total = submissions.length;
    const scored = submissions.filter(item => item.status === "dinilai").length;
    const pending = total - scored;
    if ($("gradeSubmissionTotal")) $("gradeSubmissionTotal").textContent = String(total);
    if ($("gradeSubmissionPending")) $("gradeSubmissionPending").textContent = String(pending);
    if ($("gradeSubmissionScored")) $("gradeSubmissionScored").textContent = String(scored);

    const detail = { section: "grades", total, unread: pending, read: scored };
    window.EDUSKY_REPORT_COUNTS = { ...(window.EDUSKY_REPORT_COUNTS || {}), grades: detail };
    window.dispatchEvent(new CustomEvent("edusky:report-counts", { detail }));
  }

  function taskForState() {
    return tasks.find(item => String(item.id) === String(state.taskId))
      || submissions.find(item => String(item.tugas_id) === String(state.taskId));
  }

  function renderBreadcrumb() {
    const nav = $("gradeReportBreadcrumb");
    if (!nav) return;
    const task = taskForState();
    const parts = [
      `<button type="button" data-grade-nav="classes"><i class="fas fa-school"></i> Semua Kelas</button>`
    ];
    if (state.className) {
      parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-grade-nav="subjects">Kelas ${escapeHTML(state.className)}</button>`);
    }
    if (state.subject) {
      parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-grade-nav="tasks">${escapeHTML(state.subject)}</button>`);
    }
    if (state.taskId) {
      parts.push(`<i class="fas fa-chevron-right"></i><button type="button" data-grade-nav="students">${escapeHTML(task?.judul || task?.judul_tugas || "Tugas")}</button>`);
    }
    if (state.submissionId) {
      const item = submissions.find(entry => String(entry.id) === String(state.submissionId));
      parts.push(`<i class="fas fa-chevron-right"></i><span>${escapeHTML(item?.nama_siswa || "Pemeriksaan")}</span>`);
    }
    nav.innerHTML = parts.join("");
  }

  function emptyState(icon, title, message) {
    return `<div class="grade-report-empty"><i class="fas ${icon}"></i><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
  }

  function statusBadge(item) {
    const scored = item.status === "dinilai";
    return `<span class="grade-report-status ${scored ? "scored" : "pending"}"><i class="fas ${scored ? "fa-check" : "fa-hourglass-half"}"></i>${scored ? "Sudah dinilai" : "Perlu diperiksa"}</span>`;
  }

  function renderClasses(items) {
    const groups = uniqueGroups(items, item => item.kelas || "Belum Ditentukan");
    if (!groups.length) return emptyState("fa-inbox", "Belum ada tugas", "Tugas yang diberikan kepada kelas akan muncul di sini.");
    return `<div class="grade-report-grid">${groups.map(group => {
      const taskIds = new Set(group.items.map(item => String(item.id)));
      const classSubmissions = submissions.filter(item => taskIds.has(String(item.tugas_id)));
      const students = new Set(classSubmissions.map(item => item.siswa_id)).size;
      const pending = classSubmissions.filter(item => item.status !== "dinilai").length;
      return `<button type="button" class="grade-report-folder" data-grade-class="${escapeHTML(group.value)}">
        <span class="grade-report-folder-icon class"><i class="fas fa-school"></i></span>
        <span class="grade-report-folder-copy"><small>Ruang laporan nilai</small><strong>Kelas ${escapeHTML(group.value)}</strong><span>${students} siswa telah mengumpulkan tugas</span></span>
        <span class="grade-report-folder-stats"><b>${group.items.length}<small>Tugas</small></b><b class="${pending ? "attention" : ""}">${pending}<small>Belum dinilai</small></b><i class="fas fa-arrow-right"></i></span>
      </button>`;
    }).join("")}</div>`;
  }

  function renderStudents(items) {
    const studentItems = items
      .filter(item => String(item.tugas_id) === String(state.taskId))
      .sort((left, right) => String(left.nama_siswa || "").localeCompare(String(right.nama_siswa || ""), "id"));
    if (!studentItems.length) return emptyState("fa-user-graduate", "Belum ada siswa yang mengumpulkan", "Daftar siswa akan muncul setelah mereka menyelesaikan dan mengirim tugas ini.");
    return `<div class="grade-report-grid">${studentItems.map(student => {
      const photo = safePhoto(student.foto);
      const scored = student.status === "dinilai";
      const avatar = photo ? `<img src="${escapeHTML(photo)}" alt="">` : escapeHTML(initials(student.nama_siswa));
      return `<button type="button" class="grade-report-folder" data-grade-submission="${escapeHTML(student.id)}">
        <span class="grade-report-avatar">${avatar}</span>
        <span class="grade-report-folder-copy"><small>${escapeHTML(student.nis || "Siswa")}</small><strong>${escapeHTML(student.nama_siswa || "Siswa")}</strong><span>Dikumpulkan ${escapeHTML(formatDate(student.dikumpulkan_at))} • ${student.tepat_waktu ? "Tepat waktu" : "Terlambat"}</span></span>
        <span class="grade-report-folder-stats"><b class="${scored ? "" : "attention"}">${scored ? `${Number(student.nilai)} / ${Number(student.nilai_maksimal)}` : "Periksa"}<small>${scored ? "Nilai" : "Belum dinilai"}</small></b><i class="fas fa-arrow-right"></i></span>
      </button>`;
    }).join("")}</div>`;
  }

  function renderSubjects(items) {
    const classItems = items.filter(item => same(item.kelas || "Belum Ditentukan", state.className));
    const groups = uniqueGroups(classItems, item => item.mata_pelajaran || "Tanpa Mata Pelajaran");
    if (!groups.length) return emptyState("fa-book-open", "Mata pelajaran tidak ditemukan", "Belum ada tugas pada mata pelajaran yang sesuai.");
    return `<div class="grade-report-grid">${groups.map(group => {
      const taskIds = new Set(group.items.map(item => String(item.id)));
      const subjectSubmissions = submissions.filter(item => taskIds.has(String(item.tugas_id)));
      const pending = subjectSubmissions.filter(item => item.status !== "dinilai").length;
      return `<button type="button" class="grade-report-folder" data-grade-subject="${escapeHTML(group.value)}">
        <span class="grade-report-folder-icon subject"><i class="fas fa-book-open"></i></span>
        <span class="grade-report-folder-copy"><small>Mata pelajaran</small><strong>${escapeHTML(group.value)}</strong><span>${subjectSubmissions.length} pengumpulan dari ${group.items.length} tugas</span></span>
        <span class="grade-report-folder-stats"><b>${group.items.length}<small>Tugas</small></b><b class="${pending ? "attention" : ""}">${pending}<small>Belum dinilai</small></b><i class="fas fa-arrow-right"></i></span>
      </button>`;
    }).join("")}</div>`;
  }

  function renderTasks(items) {
    const subjectItems = items.filter(item => same(item.kelas || "Belum Ditentukan", state.className) && same(item.mata_pelajaran, state.subject));
    const taskItems = [...subjectItems].sort((left, right) => new Date(right.deadline || 0) - new Date(left.deadline || 0));
    if (!taskItems.length) return emptyState("fa-clipboard-check", "Tugas tidak ditemukan", "Tidak ada tugas yang sesuai dengan pencarian.");
    return `<div class="grade-report-task-list">${taskItems.map(task => {
      const completed = submissions.filter(item => String(item.tugas_id) === String(task.id));
      const pending = completed.filter(item => item.status !== "dinilai").length;
      const resultLabel = !completed.length ? "Belum dikumpulkan" : pending ? `${pending} perlu diperiksa` : "Semua dinilai";
      const resultClass = pending || !completed.length ? "pending" : "scored";
      const resultIcon = !completed.length ? "fa-clock" : pending ? "fa-hourglass-half" : "fa-check";
      return `<button type="button" class="grade-report-task" data-grade-task="${escapeHTML(task.id)}">
        <span class="grade-report-task-icon"><i class="fas fa-clipboard-list"></i></span>
        <span><small>Deadline ${escapeHTML(formatDate(task.deadline))}</small><strong>${escapeHTML(task.judul)}</strong><em>${escapeHTML(task.deskripsi || "Tugas kelas")} • ${completed.length} siswa sudah menyelesaikan</em></span>
        <span class="grade-report-task-result"><span class="grade-report-status ${resultClass}"><i class="fas ${resultIcon}"></i>${resultLabel}</span><b>Nilai maks. ${Number(task.nilai_maksimal)}</b></span>
        <i class="fas fa-chevron-right"></i>
      </button>`;
    }).join("")}</div>`;
  }

  function publicFileUrl(path) {
    if (!path) return "";
    return ensureClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function renderSubmissionDetail(item) {
    if (!item) return emptyState("fa-triangle-exclamation", "Pengumpulan tidak ditemukan", "Kembali ke daftar tugas lalu pilih ulang pekerjaan siswa.");
    const fileUrl = publicFileUrl(item.file_path);
    const percentage = item.status === "dinilai"
      ? Math.round(Number(item.nilai) / Math.max(1, Number(item.nilai_maksimal)) * 100)
      : null;
    return `<article class="grade-review" data-grade-review="${escapeHTML(item.id)}">
      <header class="grade-review-header">
        <span class="grade-report-task-icon"><i class="fas fa-clipboard-check"></i></span>
        <div><small>${escapeHTML(item.mata_pelajaran)} • Kelas ${escapeHTML(item.kelas)}</small><h3>${escapeHTML(item.judul_tugas)}</h3><p>${escapeHTML(item.nama_siswa)} • ${escapeHTML(item.nis || "-")}</p></div>
        ${statusBadge(item)}
      </header>
      <div class="grade-review-meta">
        <span><small>Mulai dikerjakan</small><strong>${escapeHTML(formatDate(item.mulai_dikerjakan_at))}</strong></span>
        <span><small>Dikumpulkan</small><strong>${escapeHTML(formatDate(item.dikumpulkan_at))}</strong></span>
        <span><small>Deadline</small><strong>${escapeHTML(formatDate(item.deadline))}</strong></span>
        <span><small>Ketepatan waktu</small><strong>${item.tepat_waktu ? "Tepat waktu" : "Terlambat"}</strong></span>
        <span><small>Durasi pengerjaan</small><strong>${escapeHTML(formatDuration(item.durasi_pengerjaan_detik))}</strong></span>
        <span><small>Jumlah membuka</small><strong>${Number(item.jumlah_buka || 0)} kali</strong></span>
        <span><small>Nilai maksimal</small><strong>${Number(item.nilai_maksimal)}</strong></span>
        <span><small>Hasil</small><strong>${percentage === null ? "Belum dinilai" : `${percentage}%`}</strong></span>
      </div>
      ${item.deskripsi_tugas ? `<section class="grade-review-instruction"><small>Petunjuk tugas</small><p>${escapeHTML(item.deskripsi_tugas)}</p></section>` : ""}
      <section class="grade-review-answer"><div><small>Jawaban siswa</small><h4>Pekerjaan yang dikumpulkan</h4></div><p>${item.jawaban ? escapeHTML(item.jawaban) : "Siswa tidak menuliskan jawaban teks."}</p>${fileUrl ? `<a href="${escapeHTML(fileUrl)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i><span><strong>${escapeHTML(item.file_name || "Buka lampiran tugas")}</strong><small>Buka file pada tab baru</small></span><i class="fas fa-arrow-up-right-from-square"></i></a>` : ""}</section>
      <section class="grade-review-form">
        <div><small>Pemeriksaan admin</small><h4>Berikan nilai dan umpan balik</h4></div>
        <label><span>Nilai <small>Maksimal ${Number(item.nilai_maksimal)}</small></span><input id="gradeReviewScore" type="number" min="0" max="${Number(item.nilai_maksimal)}" step="0.01" value="${item.nilai ?? ""}" placeholder="0"></label>
        <label><span>Umpan balik untuk siswa</span><textarea id="gradeReviewFeedback" rows="5" maxlength="3000" placeholder="Tuliskan koreksi, apresiasi, atau hal yang perlu diperbaiki...">${escapeHTML(item.umpan_balik || "")}</textarea></label>
        <div class="grade-review-actions"><button type="button" class="btn btn-secondary" data-grade-nav="students"><i class="fas fa-arrow-left"></i> Kembali ke Daftar Siswa</button><button type="button" class="btn btn-primary" data-save-grade-report="${escapeHTML(item.id)}"><i class="fas fa-check"></i> ${item.status === "dinilai" ? "Perbarui Nilai" : "Simpan Nilai"}</button></div>
      </section>
    </article>`;
  }

  function renderExplorer() {
    const container = $("gradeReportExplorer");
    if (!container) return;
    renderBreadcrumb();
    const submissionItems = filteredSubmissions();
    const taskItems = filteredTasks();
    if (state.level === "subjects") container.innerHTML = renderSubjects(taskItems);
    else if (state.level === "tasks") container.innerHTML = renderTasks(taskItems);
    else if (state.level === "students") container.innerHTML = renderStudents(submissionItems);
    else if (state.level === "detail") container.innerHTML = renderSubmissionDetail(submissions.find(item => String(item.id) === String(state.submissionId)));
    else container.innerHTML = renderClasses(taskItems);
  }

  function navigate(level) {
    state.level = level;
    if (level === "classes") Object.assign(state, { className: "", subject: "", taskId: "", submissionId: "" });
    if (level === "subjects") Object.assign(state, { subject: "", taskId: "", submissionId: "" });
    if (level === "tasks") Object.assign(state, { taskId: "", submissionId: "" });
    if (level === "students") state.submissionId = "";
    renderExplorer();
  }

  async function loadSubmissions(options = {}) {
    if (loading) return;
    const container = $("gradeReportExplorer");
    if (!container) return;
    loading = true;
    if (!options.silent) container.innerHTML = emptyState("fa-spinner fa-spin", "Memuat laporan nilai...", "Mengambil pengumpulan terbaru dari database.");
    try {
      const [submissionResult, taskResult] = await Promise.all([
        ensureClient().rpc("admin_list_pengumpulan_nilai"),
        ensureClient().rpc("admin_list_tugas", { p_search: "", p_kelas: "" })
      ]);
      if (submissionResult.error) throw submissionResult.error;
      if (taskResult.error) throw taskResult.error;
      submissions = normalizeArray(submissionResult.data);
      tasks = normalizeArray(taskResult.data);
      writeCache(submissions);
      writeTaskCache(tasks);
      updateCounts();
      renderExplorer();
    } catch (error) {
      if (isNetworkError(error) && (readCache().length || readTaskCache().length)) {
        submissions = readCache();
        tasks = readTaskCache();
        updateCounts();
        renderExplorer();
      } else {
        container.innerHTML = emptyState("fa-triangle-exclamation", "Laporan nilai belum dapat dimuat", errorMessage(error));
        if (!options.silent) showToast(errorMessage(error), "error");
      }
    } finally {
      loading = false;
    }
  }

  async function saveGrade(submissionId, button) {
    const item = submissions.find(entry => String(entry.id) === String(submissionId));
    if (!item) return;
    const scoreInput = $("gradeReviewScore");
    const feedbackInput = $("gradeReviewFeedback");
    const rawScore = scoreInput?.value;
    if (rawScore === "") {
      scoreInput?.focus();
      return showToast("Masukkan nilai siswa terlebih dahulu.", "error");
    }
    const score = Number(rawScore);
    if (!Number.isFinite(score) || score < 0 || score > Number(item.nilai_maksimal)) {
      scoreInput?.focus();
      return showToast(`Nilai harus berada antara 0 dan ${Number(item.nilai_maksimal)}.`, "error");
    }

    const oldHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    try {
      const feedback = feedbackInput?.value.trim() || null;
      const { data, error } = await ensureClient().rpc("admin_nilai_pengumpulan", {
        p_id: item.id,
        p_nilai: score,
        p_umpan_balik: feedback
      });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      submissions = submissions.map(entry => String(entry.id) === String(item.id) ? {
        ...entry,
        ...updated,
        status: "dinilai",
        nilai: score,
        umpan_balik: feedback,
        dinilai_at: updated?.dinilai_at || new Date().toISOString()
      } : entry);
      writeCache(submissions);
      updateCounts();
      renderExplorer();
      showToast("Nilai dan umpan balik berhasil disimpan.", "success");
      window.dispatchEvent(new CustomEvent("edusky:grade-saved", { detail: { submissionId: item.id } }));
    } catch (error) {
      showToast(errorMessage(error), "error");
      button.disabled = false;
      button.innerHTML = oldHTML;
    }
  }

  function bindEvents() {
    $("gradeReportExplorer")?.addEventListener("click", event => {
      const classButton = event.target.closest("[data-grade-class]");
      const subjectButton = event.target.closest("[data-grade-subject]");
      const taskButton = event.target.closest("[data-grade-task]");
      const submissionButton = event.target.closest("[data-grade-submission]");
      const navButton = event.target.closest("[data-grade-nav]");
      const saveButton = event.target.closest("[data-save-grade-report]");

      if (saveButton) return saveGrade(saveButton.dataset.saveGradeReport, saveButton);
      if (classButton) {
        state.className = classButton.dataset.gradeClass;
        return navigate("subjects");
      }
      if (subjectButton) {
        state.subject = subjectButton.dataset.gradeSubject;
        return navigate("tasks");
      }
      if (taskButton) {
        state.taskId = taskButton.dataset.gradeTask;
        return navigate("students");
      }
      if (submissionButton) {
        state.submissionId = submissionButton.dataset.gradeSubmission;
        return navigate("detail");
      }
      if (navButton) navigate(navButton.dataset.gradeNav);
    });

    $("gradeReportBreadcrumb")?.addEventListener("click", event => {
      const button = event.target.closest("[data-grade-nav]");
      if (button) navigate(button.dataset.gradeNav);
    });

    $("gradeReportSearch")?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderExplorer, 180);
    });
    $("refreshGradeReports")?.addEventListener("click", () => loadSubmissions());
    document.querySelector('[data-tab="laporan-nilai"]')?.addEventListener("click", () => loadSubmissions({ silent: submissions.length > 0 }));
    document.querySelector('[data-page="laporan"]')?.addEventListener("click", () => window.setTimeout(() => loadSubmissions({ silent: true }), 80));
    window.addEventListener("focus", () => {
      if ($("laporan-nilai")?.classList.contains("active")) loadSubmissions({ silent: true });
    });
  }

  function initialize() {
    if (!$("gradeReportExplorer") || !hasAdminSession()) return;
    bindEvents();
    loadSubmissions({ silent: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
