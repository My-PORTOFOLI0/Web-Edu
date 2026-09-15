(function () {
  "use strict";

  if (window.__EDUSKY_ADMIN_TASKS__) return;
  window.__EDUSKY_ADMIN_TASKS__ = true;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const CLASS_STORAGE_KEY = "edusky_student_classes";
  const STUDENT_CACHE_KEY = "edusky_admin_student_cache";
  const MODULE_CACHE_KEY = "edusky_admin_module_cache";
  const TASK_CACHE_KEY = "edusky_admin_task_cache";
  const $ = id => document.getElementById(id);
  let client = null;
  let tasks = [];
  let modules = [];
  let students = [];
  let classCatalog = [];
  let selectedClass = "";
  let editingId = null;
  let activeSubmissionTaskId = null;
  let searchTimer = null;

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data.filter(Boolean);
    if (typeof data === "string") {
      try { return normalizeArray(JSON.parse(data)); } catch (error) { return []; }
    }
    return typeof data === "object" ? [data] : [];
  }

  function normalizeObject(data) {
    if (!data) return null;
    if (Array.isArray(data)) return normalizeObject(data[0]);
    if (typeof data === "string") {
      try { return normalizeObject(JSON.parse(data)); } catch (error) { return null; }
    }
    return typeof data === "object" ? data : null;
  }

  function isNetworkError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("failed to fetch")
      || message.includes("networkerror")
      || message.includes("load failed")
      || message.includes("network request");
  }

  function readCache(key) {
    try {
      return normalizeArray(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch (error) {
      return [];
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Cache lokal tidak dapat disimpan:", error);
    }
  }

  function errorMessage(error) {
    const message = String(error?.message || "Fitur tugas gagal diakses.");
    if (error?.code === "PGRST202" || message.toLowerCase().includes("could not find the function")) {
      return "Fitur tugas belum diaktifkan. Jalankan supabase/tugas_setup.sql di Supabase SQL Editor.";
    }
    if (message.toLowerCase().includes("failed to fetch")) return "Tidak dapat terhubung ke Supabase.";
    return message;
  }

  function showTaskAlert(message, type = "success") {
    let alert = $("tugasAdminAlert");
    if (!alert) {
      alert = document.createElement("div");
      alert.id = "tugasAdminAlert";
      $("tugasPage")?.prepend(alert);
    }
    alert.className = `alert ${type === "error" ? "alert-error" : type === "warning" ? "alert-warning" : "alert-success"}`;
    alert.innerHTML = `<i class="fas fa-${type === "error" ? "circle-exclamation" : "circle-check"}"></i><span>${escapeHTML(message)}</span>`;
    window.setTimeout(() => alert.remove(), 5000);
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(value));
  }

  function datetimeLocal(value) {
    const date = value ? new Date(value) : new Date(Date.now() + 86400000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  async function rpc(name, params) {
    const { data, error } = await client.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async function loadModules() {
    try {
      modules = normalizeArray(await rpc("admin_list_modul", { p_search: "", p_subject: "" }));
    } catch (error) {
      modules = isNetworkError(error) ? readCache(MODULE_CACHE_KEY) : [];
    }
    renderTaskModuleOptions();
    renderSubjectFilter();
    renderClassSuggestions();
  }

  function sameClass(left, right) {
    return String(left || "").trim().toLowerCase()
      === String(right || "").trim().toLowerCase();
  }

  function renderTaskModuleOptions(targetClass = "", selectedId = "") {
    const select = $("tugasModul");
    if (!select) return;
    const relevantModules = targetClass
      ? modules.filter(module => sameClass(module.kelas, targetClass))
      : modules;
    select.innerHTML = '<option value="">Tanpa modul tertentu</option>' + relevantModules
      .map(module => `<option value="${module.id}">${escapeHTML(module.judul)} — ${escapeHTML(module.mata_pelajaran || "Modul")}</option>`)
      .join("");
    select.value = relevantModules.some(module => String(module.id) === String(selectedId))
      ? selectedId
      : "";
  }

  function localClasses() {
    try {
      return normalizeArray(JSON.parse(localStorage.getItem(CLASS_STORAGE_KEY) || "[]"));
    } catch (error) {
      return [];
    }
  }

  async function loadStudentClasses() {
    try {
      students = normalizeArray(await rpc("admin_list_akun_siswa", { p_search: "" }));
    } catch (error) {
      students = isNetworkError(error) ? readCache(STUDENT_CACHE_KEY) : [];
      console.warn("Daftar kelas siswa belum dapat dimuat:", errorMessage(error));
    }

    try {
      classCatalog = normalizeArray(await rpc("admin_list_kelas_siswa", {}));
    } catch (error) {
      classCatalog = [];
    }

    classCatalog = [...classCatalog, ...localClasses()];
  }

  function availableClasses() {
    const unique = new Map();
    [
      ...classCatalog.map(item => item.nama),
      ...students.map(student => student.kelas),
      ...tasks.map(task => task.kelas),
      ...modules.map(module => module.kelas)
    ].map(value => String(value || "").trim()).filter(Boolean)
      .forEach(value => {
        const key = value.toLowerCase();
        if (!unique.has(key)) unique.set(key, value);
      });
    return [...unique.values()]
      .sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
  }

  function renderClassSuggestions() {
    const target = $("tugasKelasOptions");
    if (!target) return;
    const values = availableClasses();
    target.innerHTML = values.map(value => `<option value="${escapeHTML(value)}"></option>`).join("");
  }

  function renderSubjectFilter() {
    const target = $("filterMapelTugas");
    if (!target) return;
    const selected = target.value;
    const subjects = [...new Set([
      ...modules.map(module => module.mata_pelajaran),
      ...tasks.map(task => task.mata_pelajaran)
    ].map(value => String(value || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "id"));
    target.innerHTML = '<option value="">Semua Mata Pelajaran</option>' + subjects
      .map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`)
      .join("");
    target.value = subjects.includes(selected) ? selected : "";
    renderClassSuggestions();
  }

  function visibleTasks() {
    const subject = $("filterMapelTugas")?.value || "";
    const className = selectedClass;
    const keyword = $("searchTugas").value.trim().toLowerCase();
    return tasks.filter(task => {
      const relatedModule = modules.find(module => String(module.id) === String(task.modul_id));
      const matchesSubject = !subject
        || String(task.mata_pelajaran || "").toLowerCase() === subject.toLowerCase()
        || String(relatedModule?.mata_pelajaran || "").toLowerCase() === subject.toLowerCase();
      const matchesKeyword = !keyword || [
        task.judul, task.mata_pelajaran, task.deskripsi, task.kelas,
        relatedModule?.judul, relatedModule?.mata_pelajaran
      ].some(value => String(value || "").toLowerCase().includes(keyword));
      return (!className || sameClass(task.kelas, className))
        && matchesSubject
        && matchesKeyword;
    });
  }

  function renderTasks() {
    syncTaskManagerChrome();
    if (!selectedClass) {
      renderClassOverview();
      return;
    }
    renderSelectedClassTasks();
  }

  function syncTaskManagerChrome() {
    const addButton = $("addTugasBtn");
    if (selectedClass) {
      $("taskManagerTitle").textContent = `Tugas Kelas ${selectedClass}`;
      $("taskManagerSubtitle").textContent = "Kelola tugas, pengumpulan, dan penilaian di dalam kelas ini";
      addButton.disabled = false;
      addButton.innerHTML = '<i class="fas fa-plus"></i> Tambah Tugas';
      $("searchTugas").placeholder = `Cari tugas atau mata pelajaran di Kelas ${selectedClass}...`;
    } else {
      $("taskManagerTitle").textContent = "Pilih Kelas";
      $("taskManagerSubtitle").textContent = "Masuk ke kelas terlebih dahulu untuk melihat dan menambahkan tugas";
      addButton.disabled = true;
      addButton.innerHTML = '<i class="fas fa-folder-open"></i> Pilih Kelas Dahulu';
      $("searchTugas").placeholder = "Cari kelas, modul, atau mata pelajaran...";
    }
  }

  function renderClassOverview() {
    const keyword = $("searchTugas").value.trim().toLowerCase();
    const subject = $("filterMapelTugas")?.value || "";
    const classes = availableClasses().filter(className => {
      const classTasks = tasks.filter(task => sameClass(task.kelas, className));
      const classModules = modules.filter(module => sameClass(module.kelas, className));
      const matchesSubject = !subject
        || classTasks.some(task => String(task.mata_pelajaran || "").toLowerCase() === subject.toLowerCase())
        || classModules.some(module => String(module.mata_pelajaran || "").toLowerCase() === subject.toLowerCase());
      const matchesKeyword = !keyword
        || className.toLowerCase().includes(keyword)
        || classTasks.some(task => [task.judul, task.mata_pelajaran, task.deskripsi]
          .some(value => String(value || "").toLowerCase().includes(keyword)))
        || classModules.some(module => [module.judul, module.mata_pelajaran, module.deskripsi]
          .some(value => String(value || "").toLowerCase().includes(keyword)));
      return matchesSubject && matchesKeyword;
    });
    if (!classes.length) {
      $("tugasClassGrid").innerHTML = '<div class="admin-task-class-empty"><i class="fas fa-search"></i><strong>Tidak ada kelas yang cocok</strong><span>Coba kata kunci modul atau mata pelajaran lainnya.</span></div>';
      return;
    }
    $("tugasClassGrid").innerHTML = classes.map(className => {
      const classTasks = tasks.filter(task => sameClass(task.kelas, className));
      const classModules = modules.filter(module => sameClass(module.kelas, className));
      const classStudents = students.filter(student => sameClass(student.kelas, className) && student.status === "aktif");
      const submissions = classTasks.reduce((sum, task) => sum + Number(task.jumlah_pengumpulan || 0), 0);
      const graded = classTasks.reduce((sum, task) => sum + Number(task.jumlah_dinilai || 0), 0);
      const subjects = [...new Set([
        ...classModules.map(module => module.mata_pelajaran),
        ...classTasks.map(task => task.mata_pelajaran)
      ].filter(Boolean))];
      return `<button type="button" class="admin-task-class-entry" data-open-task-class="${escapeHTML(className)}">
        <span class="admin-task-class-icon"><i class="fas fa-school"></i></span>
        <span class="admin-task-class-copy"><strong>Kelas ${escapeHTML(className)}</strong><span>${classStudents.length} siswa aktif · ${classModules.length} modul</span><span class="admin-task-class-subjects">${subjects.length ? subjects.slice(0, 3).map(item => `<b>${escapeHTML(item)}</b>`).join("") : "<b>Belum ada modul atau tugas</b>"}</span></span>
        <span class="admin-task-class-count"><span><strong>${classTasks.length}</strong><small>Tugas</small></span><span><strong>${classModules.length}</strong><small>Modul</small></span><span><strong>${Math.max(0, submissions - graded)}</strong><small>Belum dinilai</small></span><i class="fas fa-arrow-right"></i></span>
      </button>`;
    }).join("");
  }

  function renderSelectedClassTasks() {
    const classTasks = visibleTasks();
    const allClassTasks = tasks.filter(task => sameClass(task.kelas, selectedClass));
    const submissions = allClassTasks.reduce((sum, task) => sum + Number(task.jumlah_pengumpulan || 0), 0);
    const graded = allClassTasks.reduce((sum, task) => sum + Number(task.jumlah_dinilai || 0), 0);
    $("tugasClassGrid").innerHTML = `<section class="admin-task-class-detail">
      <div class="admin-task-class-detail-nav"><button type="button" class="btn btn-secondary" data-back-task-classes><i class="fas fa-arrow-left"></i> Kembali ke Daftar Kelas</button><span><i class="fas fa-users"></i> ${students.filter(student => sameClass(student.kelas, selectedClass) && student.status === "aktif").length} siswa aktif</span></div>
      <header class="admin-task-class-detail-header"><span class="admin-task-class-icon"><i class="fas fa-folder-open"></i></span><div><small>Ruang tugas</small><h3>Kelas ${escapeHTML(selectedClass)}</h3><p>Tugas dibuat setelah kelas dipilih dan otomatis hanya terlihat oleh siswa kelas ini.</p></div><div class="admin-task-detail-stats"><span><b>${allClassTasks.length}</b><small>Tugas</small></span><span><b>${submissions}</b><small>Masuk</small></span><span><b>${Math.max(0, submissions - graded)}</b><small>Belum dinilai</small></span></div></header>
      <div class="admin-task-class-content"><div class="admin-task-class-content-head"><span><strong>Daftar tugas</strong><small>${allClassTasks.filter(task => task.status === "aktif").length} aktif • ${allClassTasks.filter(task => task.status === "draft").length} draft</small></span><button type="button" class="btn btn-primary btn-sm" data-add-task-class="${escapeHTML(selectedClass)}"><i class="fas fa-plus"></i> Tambah Tugas</button></div>
      <div class="admin-task-inner-list">${classTasks.length ? classTasks.map(renderInnerTaskCard).join("") : '<div class="admin-task-class-empty"><i class="fas fa-clipboard-list"></i><strong>Belum ada tugas di kelas ini</strong><span>Klik Tambah Tugas untuk membuat tugas pertama.</span></div>'}</div></div>
    </section>`;
  }

  function renderInnerTaskCard(task) {
    const overdue = new Date(task.deadline).getTime() < Date.now();
    const statusClass = task.status === "aktif" ? "badge-success" : task.status === "draft" ? "badge-warning" : "badge-accent";
    return `<article class="admin-task-inner-card ${overdue ? "is-overdue" : ""}">
      <div class="admin-task-inner-top"><span class="badge badge-accent">${escapeHTML(task.mata_pelajaran)}</span><span class="badge ${statusClass}">${escapeHTML(task.status)}</span></div>
      <h4>${escapeHTML(task.judul)}</h4><p>${escapeHTML(task.deskripsi || "Tidak ada deskripsi tugas.")}</p>
      <div class="admin-task-inner-meta"><span class="${overdue ? "overdue" : ""}"><i class="far fa-clock"></i> ${formatDate(task.deadline)}</span><span><i class="fas fa-star"></i> Maks. ${Number(task.nilai_maksimal)}</span></div>
      <div class="admin-task-inner-footer"><span class="admin-task-submission-count"><strong>${Number(task.jumlah_pengumpulan || 0)}</strong> masuk • ${Number(task.jumlah_dinilai || 0)} dinilai</span><span class="task-action-cell"><button class="btn btn-sm btn-success" data-submissions="${task.id}" title="Lihat pengumpulan"><i class="fas fa-inbox"></i></button><button class="btn btn-sm btn-warning" data-edit-task="${task.id}" title="Edit tugas"><i class="fas fa-pen"></i></button><button class="btn btn-sm btn-danger" data-delete-task="${task.id}" title="Hapus tugas"><i class="fas fa-trash"></i></button></span></div>
    </article>`;
  }

  function openClass(className) {
    selectedClass = String(className || "").trim();
    $("searchTugas").value = "";
    renderTasks();
  }

  function closeClass() {
    selectedClass = "";
    $("searchTugas").value = "";
    renderTasks();
  }

  function publishGradeReportCounts() {
    const total = tasks.reduce((sum, task) => sum + Number(task.jumlah_pengumpulan || 0), 0);
    const read = tasks.reduce((sum, task) => sum + Number(task.jumlah_dinilai || 0), 0);
    const detail = { section: "grades", total, unread: Math.max(0, total - read), read };
    window.EDUSKY_REPORT_COUNTS = { ...(window.EDUSKY_REPORT_COUNTS || {}), grades: detail };
    window.dispatchEvent(new CustomEvent("edusky:report-counts", { detail }));
  }

  function scoreGrade(percentage) {
    if (percentage >= 90) return "A";
    if (percentage >= 80) return "B";
    if (percentage >= 70) return "C";
    if (percentage >= 60) return "D";
    return "E";
  }

  async function refreshGradeReport() {
    const body = $("nilaiTableBody");
    try {
      const grades = normalizeArray(await rpc("admin_list_nilai", {}));
      const percentages = grades.map(item => Number(item.nilai) / Math.max(1, Number(item.nilai_maksimal)) * 100);
      if ($("tugasSelesai")) $("tugasSelesai").textContent = String(grades.length);
      if ($("rataRataNilai")) $("rataRataNilai").textContent = percentages.length
        ? `${Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)}%`
        : "0%";
      if (body) {
        body.innerHTML = grades.length ? grades.map(item => {
          const percentage = Math.round(Number(item.nilai) / Math.max(1, Number(item.nilai_maksimal)) * 100);
          return `<tr><td>${escapeHTML(item.nama_siswa)}<br><small class="text-muted">${escapeHTML(item.kelas)}</small></td><td>${escapeHTML(item.mata_pelajaran)}<br><small class="text-muted">${escapeHTML(item.judul_tugas)}</small></td><td>${Number(item.nilai)} / ${Number(item.nilai_maksimal)}</td><td>-</td><td>${percentage}</td><td><span class="badge badge-accent">${scoreGrade(percentage)}</span></td></tr>`;
        }).join("") : '<tr><td colspan="6" class="text-center text-muted">Belum ada tugas yang dinilai.</td></tr>';
      }
    } catch (error) {
      if (body) {
        body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Laporan nilai tersedia setelah tugas_setup.sql dijalankan.</td></tr>';
      }
    }
  }

  async function refreshTasks() {
    $("tugasClassGrid").innerHTML = '<div class="admin-task-class-empty"><i class="fas fa-spinner fa-spin"></i><span>Memuat folder kelas dari Supabase...</span></div>';
    try {
      tasks = normalizeArray(await rpc("admin_list_tugas", {
        p_search: "", p_kelas: ""
      }));
      writeCache(TASK_CACHE_KEY, tasks);
      publishGradeReportCounts();
      renderSubjectFilter();
      renderTasks();
      refreshGradeReport();
      const total = $("totalTugas");
      if (total) total.textContent = String(tasks.length);
    } catch (error) {
      if (isNetworkError(error)) {
        tasks = readCache(TASK_CACHE_KEY);
        publishGradeReportCounts();
        renderSubjectFilter();
        renderTasks();
        const total = $("totalTugas");
        if (total) total.textContent = String(tasks.length);
        return;
      }

      tasks = [];
      publishGradeReportCounts();
      const message = errorMessage(error);
      renderSubjectFilter();
      renderTasks();
      showTaskAlert(message, "error");
    }
  }

  function openTaskModal(task = null, targetClass = "") {
    editingId = task?.id || null;
    $("tugasModalTitle").textContent = task ? "Edit Tugas" : "Tambah Tugas";
    $("tugasForm").reset();
    $("tugasJudul").value = task?.judul || "";
    renderTaskModuleOptions(task?.kelas || targetClass, task?.modul_id || "");
    $("tugasMapel").value = task?.mata_pelajaran || "";
    $("tugasKelas").value = task?.kelas || targetClass;
    $("tugasKelas").readOnly = true;
    $("tugasKelas").title = "Kelas ditentukan dari folder yang dipilih";
    $("tugasDeadline").value = datetimeLocal(task?.deadline);
    $("tugasNilaiMax").value = task?.nilai_maksimal || 100;
    $("tugasDeskripsi").value = task?.deskripsi || "";
    $("tugasAktif").checked = !task || task.status === "aktif";
    $("tugasModal").classList.add("active");
    $("tugasJudul").focus();
  }

  function closeTaskModal() {
    $("tugasModal").classList.remove("active");
    $("tugasKelas").readOnly = false;
    editingId = null;
  }

  async function saveTask() {
    if (!$("tugasForm").reportValidity()) return;
    const button = $("saveTugasBtn");
    button.disabled = true;
    const old = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    const payload = {
      p_modul_id: $("tugasModul").value || null,
      p_judul: $("tugasJudul").value.trim(),
      p_mata_pelajaran: $("tugasMapel").value.trim(),
      p_kelas: $("tugasKelas").value.trim(),
      p_deskripsi: $("tugasDeskripsi").value.trim() || null,
      p_deadline: new Date($("tugasDeadline").value).toISOString(),
      p_nilai_maksimal: Number($("tugasNilaiMax").value || 100),
      p_status: $("tugasAktif").checked ? "aktif" : "draft"
    };
    const wasEditing = Boolean(editingId);
    try {
      if (editingId) await rpc("admin_update_tugas", { p_id: editingId, ...payload });
      else await rpc("admin_create_tugas", payload);
      closeTaskModal();
      await refreshTasks();
      showTaskAlert(wasEditing ? "Tugas berhasil diperbarui." : "Tugas berhasil dibuat.");
    } catch (error) {
      showTaskAlert(errorMessage(error), "error");
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  async function deleteTask(id) {
    const task = tasks.find(item => item.id === id);
    if (!window.confirm(`Hapus tugas “${task?.judul || "ini"}” beserta seluruh pengumpulannya?`)) return;
    try {
      await rpc("admin_delete_tugas", { p_id: id });
      await refreshTasks();
      showTaskAlert("Tugas berhasil dihapus.");
    } catch (error) {
      showTaskAlert(errorMessage(error), "error");
    }
  }

  function submissionFileUrl(path) {
    if (!path) return "";
    return client.storage.from("tugas-siswa").getPublicUrl(path).data.publicUrl;
  }

  async function openSubmissions(id) {
    activeSubmissionTaskId = id;
    const task = tasks.find(item => item.id === id);
    $("pengumpulanModalTitle").textContent = task?.judul || "Pengumpulan Tugas";
    $("pengumpulanModalSubtitle").textContent = `${task?.mata_pelajaran || ""} • Kelas ${task?.kelas || "-"}`;
    $("pengumpulanList").innerHTML = '<p class="text-center text-muted">Memuat pengumpulan...</p>';
    $("pengumpulanModal").classList.add("active");
    try {
      const submissions = normalizeArray(await rpc("admin_list_pengumpulan", { p_tugas_id: id }));
      if (!submissions.length) {
        $("pengumpulanList").innerHTML = '<div class="submission-empty"><i class="fas fa-inbox"></i><strong>Belum ada pengumpulan</strong><span>Siswa kelas ini belum mengumpulkan tugas.</span></div>';
        return;
      }
      $("pengumpulanList").innerHTML = submissions.map(item => `<article class="submission-card" data-submission-card="${item.id}">
        <header><div><strong>${escapeHTML(item.nama_siswa)}</strong><span>${escapeHTML(item.nis)} • ${formatDate(item.dikumpulkan_at)}</span></div><span class="badge ${item.status === "dinilai" ? "badge-success" : "badge-warning"}">${escapeHTML(item.status)}</span></header>
        ${item.jawaban ? `<div class="submission-answer"><b>Jawaban siswa</b><p>${escapeHTML(item.jawaban)}</p></div>` : ""}
        ${item.file_path ? `<a class="submission-file" href="${submissionFileUrl(item.file_path)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i>${escapeHTML(item.file_name || "Buka lampiran")}</a>` : ""}
        <div class="submission-grade">
          <label>Nilai <span>(maks. ${Number(item.nilai_maksimal)})</span><input type="number" data-grade-value min="0" max="${Number(item.nilai_maksimal)}" step="0.01" value="${item.nilai ?? ""}" /></label>
          <label>Umpan balik<textarea data-grade-feedback rows="2" placeholder="Catatan untuk siswa...">${escapeHTML(item.umpan_balik || "")}</textarea></label>
          <button class="btn btn-primary" type="button" data-save-grade="${item.id}"><i class="fas fa-check"></i> Simpan Nilai</button>
        </div>
      </article>`).join("");
    } catch (error) {
      $("pengumpulanList").innerHTML = `<p class="text-center text-danger">${escapeHTML(errorMessage(error))}</p>`;
    }
  }

  async function saveGrade(id, button) {
    const card = button.closest("[data-submission-card]");
    const value = card.querySelector("[data-grade-value]").value;
    if (value === "") return showTaskAlert("Masukkan nilai siswa.", "warning");
    button.disabled = true;
    try {
      await rpc("admin_nilai_pengumpulan", {
        p_id: id,
        p_nilai: Number(value),
        p_umpan_balik: card.querySelector("[data-grade-feedback]").value.trim() || null
      });
      showTaskAlert("Nilai siswa berhasil disimpan.");
      if (activeSubmissionTaskId) await openSubmissions(activeSubmissionTaskId);
      await refreshTasks();
    } catch (error) {
      showTaskAlert(errorMessage(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  function attachEvents() {
    $("addTugasBtn").addEventListener("click", () => {
      if (!selectedClass) return showTaskAlert("Pilih salah satu kelas terlebih dahulu.", "warning");
      openTaskModal(null, selectedClass);
    });
    $("saveTugasBtn").addEventListener("click", saveTask);
    document.querySelectorAll('[data-modal="tugasModal"]').forEach(button => button.addEventListener("click", closeTaskModal));
    $("tugasModal").addEventListener("click", event => { if (event.target === $("tugasModal")) closeTaskModal(); });
    $("closePengumpulanModal").addEventListener("click", () => $("pengumpulanModal").classList.remove("active"));
    $("pengumpulanModal").addEventListener("click", event => { if (event.target === $("pengumpulanModal")) event.currentTarget.classList.remove("active"); });
    $("searchTugas").addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderTasks, 200);
    });
    $("filterMapelTugas").addEventListener("change", renderTasks);
    $("tugasModul").addEventListener("change", event => {
      const module = modules.find(item => item.id === event.target.value);
      if (!module) return;
      $("tugasMapel").value = module.mata_pelajaran || "";
      if (!$("tugasKelas").readOnly && module.kelas) $("tugasKelas").value = module.kelas;
    });
    $("tugasClassGrid").addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-task]");
      const remove = event.target.closest("[data-delete-task]");
      const submissions = event.target.closest("[data-submissions]");
      const addToClass = event.target.closest("[data-add-task-class]");
      const openTaskClass = event.target.closest("[data-open-task-class]");
      const backToClasses = event.target.closest("[data-back-task-classes]");
      if (openTaskClass) openClass(openTaskClass.dataset.openTaskClass);
      if (backToClasses) closeClass();
      if (addToClass) openTaskModal(null, addToClass.dataset.addTaskClass);
      if (edit) openTaskModal(tasks.find(item => item.id === edit.dataset.editTask));
      if (remove) deleteTask(remove.dataset.deleteTask);
      if (submissions) openSubmissions(submissions.dataset.submissions);
    });
    $("pengumpulanList").addEventListener("click", event => {
      const button = event.target.closest("[data-save-grade]");
      if (button) saveGrade(button.dataset.saveGrade, button);
    });
    window.addEventListener("edusky:grade-saved", () => refreshTasks());
    document.querySelector('[data-page="tugas"]')?.addEventListener("click", async () => {
      await Promise.all([loadModules(), loadStudentClasses()]);
      await refreshTasks();
    });
  }

  async function initialize() {
    if (!window.supabase?.createClient) return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    attachEvents();
    await Promise.all([loadModules(), loadStudentClasses()]);
    await refreshTasks();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
