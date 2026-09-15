(function () {
  "use strict";

  if (window.__EDUSKY_STUDENT_TASKS__) return;
  window.__EDUSKY_STUDENT_TASKS__ = true;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const BUCKET = "tugas-siswa";
  const $ = id => document.getElementById(id);
  let client = null;
  let user = null;
  let tasks = [];
  let activeTask = null;
  let activeTaskStartPromise = null;
  let selectedFile = null;
  let activeFilter = "Semua";
  let toastTimer = null;

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function notify(message, type = "success") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }
    const toast = $("studentTaskToast");
    if (!toast) return console.log(message);
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `student-task-toast ${type === "error" ? "error" : "success"} show`;
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function normalizeArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data.filter(Boolean);
    if (typeof data === "string") {
      try { return normalizeArray(JSON.parse(data)); } catch (error) { return []; }
    }
    return typeof data === "object" ? [data] : [];
  }

  function taskError(error) {
    const message = String(error?.message || "Tugas gagal dimuat.");
    if (error?.code === "PGRST202" || message.toLowerCase().includes("could not find the function")) {
      return "Fitur tugas belum diaktifkan oleh admin. Jalankan supabase/tugas_setup.sql.";
    }
    return message;
  }

  function formatDate(value, time = false) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      ...(time ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(new Date(value));
  }

  function statusOf(task) {
    if (task.submission_status === "dinilai") return "Selesai";
    if (task.submission_status === "dikumpulkan") return "Sedang dikerjakan";
    return new Date(task.deadline).getTime() < Date.now() ? "Terlambat" : "Baru";
  }

  function filteredTasks() {
    if (activeFilter === "Semua") return tasks;
    return tasks.filter(task => statusOf(task) === activeFilter);
  }

  function gradeSummary() {
    const summary = $("student-grade-summary");
    if (!summary) return;
    const grouped = {};
    tasks.filter(task => task.submission_status === "dinilai" && task.nilai != null).forEach(task => {
      const subject = task.mata_pelajaran || "Lainnya";
      const percentage = Number(task.nilai) / Math.max(1, Number(task.nilai_maksimal)) * 100;
      grouped[subject] ||= [];
      grouped[subject].push(percentage);
    });
    const entries = Object.entries(grouped);
    const allPercentages = entries.flatMap(([, values]) => values);
    if ($("stat-score")) {
      $("stat-score").textContent = allPercentages.length
        ? (allPercentages.reduce((sum, value) => sum + value, 0) / allPercentages.length).toFixed(1)
        : "-";
    }
    summary.hidden = !entries.length;
    summary.innerHTML = entries.map(([subject, values]) => {
      const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      return `<article class="student-grade-card"><span>${escapeHTML(subject)}</span><strong>${average}</strong><small>Rata-rata dari ${values.length} tugas dinilai</small></article>`;
    }).join("");
  }

  function taskCard(task) {
    const status = statusOf(task);
    const badge = status === "Selesai" ? "badge-success" : status === "Terlambat" ? "badge-danger" : status === "Sedang dikerjakan" ? "badge-warning" : "badge-primary";
    const overdue = status === "Terlambat";
    const scored = task.submission_status === "dinilai";
    return `<article class="student-inner-task-card ${overdue ? "task-urgent" : ""}">
      <div class="flex justify-between items-center" style="margin-bottom:10px;gap:10px;flex-wrap:wrap">
        <span class="badge badge-primary">${escapeHTML(task.mata_pelajaran)}</span>
        <span class="badge ${badge}">${status}</span>
      </div>
      <h3 style="margin-bottom:5px">${escapeHTML(task.judul)}</h3>
      <p class="text-sm text-muted" style="margin-bottom:12px">Kelas ${escapeHTML(task.kelas)} • Nilai maksimal ${Number(task.nilai_maksimal)}</p>
      ${scored ? `<p class="student-task-score"><i class="fas fa-star"></i> Nilai ${Number(task.nilai)} / ${Number(task.nilai_maksimal)}</p>` : ""}
      ${scored && task.umpan_balik ? `<div class="student-task-feedback"><b>Umpan balik admin:</b> ${escapeHTML(task.umpan_balik)}</div>` : ""}
      <div class="flex justify-between items-center" style="margin-top:13px;padding-top:10px;border-top:1px solid var(--border-color);gap:10px;flex-wrap:wrap">
        <span class="${overdue ? "text-danger font-bold" : "text-muted"} text-sm"><i class="fas fa-clock"></i> ${formatDate(task.deadline, true)}</span>
        <button class="btn ${scored ? "btn-success" : "btn-outline"}" style="padding:6px 14px;font-size:.82rem" onclick="openTaskSubmit('${task.id}')">${scored ? "Lihat Nilai" : task.submission_id ? "Lihat / Perbarui" : "Kerjakan"}</button>
      </div>
    </article>`;
  }

  function renderTasks(filter = activeFilter) {
    activeFilter = filter;
    document.querySelectorAll("[data-student-task-filter]").forEach(button => {
      button.classList.toggle("active", button.dataset.studentTaskFilter === activeFilter);
    });
    const container = $("class-tasks-container");
    if (!container) return;
    const result = filteredTasks();
    const className = user?.kelas || tasks[0]?.kelas || "-";
    const completed = tasks.filter(task => statusOf(task) === "Selesai").length;
    const pending = tasks.length - completed;
    container.innerHTML = `<section class="student-class-task-folder">
      <header class="student-class-task-header">
        <span class="student-class-folder-icon"><i class="fas fa-folder-open"></i></span>
        <div class="student-class-task-heading"><span>Folder tugas siswa</span><strong>Kelas ${escapeHTML(className)}</strong><small>${result.length} tugas ditampilkan dari ${tasks.length} tugas</small></div>
        <div class="student-class-task-stats"><span><b>${tasks.length}</b><small>Total</small></span><span><b>${pending}</b><small>Belum selesai</small></span><span><b>${completed}</b><small>Selesai</small></span></div>
      </header>
      <div class="student-class-task-content">${result.length
        ? result.map(taskCard).join("")
        : '<div class="student-class-task-empty"><i class="fas fa-clipboard-check"></i><strong>Tidak ada tugas pada kategori ini</strong><span>Coba pilih filter tugas lainnya.</span></div>'}
      </div>
    </section>`;
    gradeSummary();
  }

  function renderDashboardTasks() {
    const container = $("dash-tasks-container");
    if (!container) return;
    const pending = tasks.filter(task => task.submission_status !== "dinilai").slice(0, 3);
    if ($("stat-tasks-pending")) $("stat-tasks-pending").textContent = String(tasks.filter(task => task.submission_status !== "dinilai").length);
    container.innerHTML = pending.length ? pending.map(task => `<div class="list-item">
      <div class="item-meta"><div class="item-icon bg-blue"><i class="fas fa-clipboard-list"></i></div><div class="item-details"><h4>${escapeHTML(task.judul)}</h4><p class="text-muted"><i class="fas fa-calendar-alt"></i> ${formatDate(task.deadline)}</p></div></div>
      <button class="btn btn-primary" style="padding:5px 13px;font-size:.8rem" onclick="navigateTo('class');setTimeout(()=>openTaskSubmit('${task.id}'),100)">Kerjakan</button>
    </div>`).join("") : '<p class="text-center text-muted">Semua tugas sudah selesai.</p>';
  }

  async function loadTasks() {
    if (!user?.kelas) {
      $("class-tasks-container").innerHTML = '<div class="student-class-task-empty"><i class="fas fa-lock"></i><strong>Kelas belum ditentukan</strong><span>Hubungi admin agar folder tugas kelas dapat ditampilkan.</span></div>';
      return;
    }
    const { data, error } = await client.rpc("siswa_list_tugas", { p_siswa_id: user.id });
    if (error) throw error;
    tasks = normalizeArray(data);
    renderTasks();
    renderDashboardTasks();
  }

  function publicFileUrl(path) {
    return path ? client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";
  }

  function renderSelectedFile(task) {
    const list = $("upload-file-list");
    if (selectedFile) {
      list.innerHTML = `<div class="file-item"><div class="flex items-center gap-2"><i class="fas fa-file-alt text-primary"></i><div><div class="font-bold text-sm">${escapeHTML(selectedFile.name)}</div><div class="text-muted" style="font-size:.7rem">${(selectedFile.size / 1024).toFixed(1)} KB</div></div></div><button class="btn btn-icon text-danger" type="button" id="remove-selected-task-file"><i class="fas fa-trash"></i></button></div>`;
      $("remove-selected-task-file").onclick = () => { selectedFile = null; renderSelectedFile(task); };
    } else if (task?.file_path) {
      list.innerHTML = `<a class="file-item" href="${publicFileUrl(task.file_path)}" target="_blank" rel="noopener"><div class="flex items-center gap-2"><i class="fas fa-paperclip text-primary"></i><strong>${escapeHTML(task.file_name || "Lampiran tugas")}</strong></div><i class="fas fa-arrow-up-right-from-square"></i></a>`;
    } else list.innerHTML = "";
  }

  function openTaskSubmit(id) {
    activeTask = tasks.find(task => String(task.id) === String(id));
    if (!activeTask) return;
    selectedFile = null;
    $("task-list-view").classList.add("hidden");
    $("task-submit-view").classList.remove("hidden");
    $("submit-task-title").textContent = activeTask.judul;
    $("submit-task-mapel").textContent = activeTask.mata_pelajaran;
    $("submit-task-due").innerHTML = `<i class="fas fa-clock"></i> Tenggat: ${formatDate(activeTask.deadline, true)}`;
    $("submit-task-desc").textContent = activeTask.deskripsi || "Kerjakan sesuai petunjuk admin.";
    $("task-answer").value = activeTask.jawaban || "";
    const scored = activeTask.submission_status === "dinilai";
    $("task-answer").readOnly = scored;
    $("fake-file-input").disabled = scored;
    $("submit-task-button").disabled = scored;
    $("submit-task-button").innerHTML = scored
      ? `<i class="fas fa-check-circle"></i> Sudah Dinilai: ${Number(activeTask.nilai)} / ${Number(activeTask.nilai_maksimal)}`
      : `<i class="fas fa-paper-plane"></i> ${activeTask.submission_id ? "Perbarui Pengumpulan" : "Kumpulkan Tugas"}`;
    renderSelectedFile(activeTask);
    if (!scored) {
      const openedTask = activeTask;
      activeTaskStartPromise = client.rpc("siswa_mulai_tugas", { p_siswa_id: user.id, p_tugas_id: activeTask.id }).then(({ data, error }) => {
        if (error) return console.warn("Waktu mulai tugas belum tersimpan:", error.message);
        const activity = Array.isArray(data) ? data[0] : data;
        if (activity) {
          openedTask.mulai_dikerjakan_at = activity.mulai_dikerjakan_at;
          openedTask.jumlah_buka = activity.jumlah_buka;
        }
      });
    } else activeTaskStartPromise = null;
  }

  function closeTaskSubmit() {
    activeTask = null;
    selectedFile = null;
    $("task-submit-view").classList.add("hidden");
    $("task-list-view").classList.remove("hidden");
  }

  function handleFile(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) return notify("Gunakan PDF, JPG, PNG, atau DOCX.", "error");
    if (file.size > 5 * 1024 * 1024) return notify("Ukuran file maksimal 5 MB.", "error");
    selectedFile = file;
    renderSelectedFile(activeTask);
    notify("File siap dikumpulkan.");
  }

  function safeFileName(name) {
    const extension = String(name).split(".").pop().toLowerCase();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  }

  async function submitTask() {
    if (!activeTask || activeTask.submission_status === "dinilai") return;
    const answer = $("task-answer").value.trim();
    if (!answer && !selectedFile && !activeTask.file_path) return notify("Tuliskan jawaban atau lampirkan file.", "error");
    const button = $("submit-task-button");
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengumpulkan...';
    try {
      if (activeTaskStartPromise) await activeTaskStartPromise;
      let filePath = activeTask.file_path || null;
      let fileName = activeTask.file_name || null;
      if (selectedFile) {
        filePath = `${user.id}/${activeTask.id}/${safeFileName(selectedFile.name)}`;
        const { error: uploadError } = await client.storage.from(BUCKET).upload(filePath, selectedFile, { upsert: false });
        if (uploadError) throw uploadError;
        fileName = selectedFile.name;
      }
      const { error } = await client.rpc("siswa_kumpulkan_tugas", {
        p_siswa_id: user.id,
        p_tugas_id: activeTask.id,
        p_jawaban: answer || null,
        p_file_path: filePath,
        p_file_name: fileName
      });
      if (error) throw error;
      notify("Tugas berhasil dikumpulkan ke database!", "success");
      closeTaskSubmit();
      await loadTasks();
    } catch (error) {
      notify(taskError(error), "error");
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  async function initialize() {
    try { user = JSON.parse(localStorage.getItem("edusky_user") || "null"); } catch (error) { user = null; }
    if (!user?.id || !window.supabase?.createClient) return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    try {
      const { data: freshData } = await client.rpc("admin_get_akun_siswa", { p_id: user.id });
      const freshUser = Array.isArray(freshData) ? freshData[0] : freshData;
      if (freshUser?.id) {
        user = {
          ...user,
          ...freshUser,
          nama: freshUser.nama_siswa || user.nama,
          session_token: user.session_token,
          session_expires_at: user.session_expires_at,
          isLoggedIn: true
        };
        localStorage.setItem("edusky_user", JSON.stringify(user));
        window.EduSkyUserSync?.apply(user);
      }
    } catch (error) {
      console.warn("Kelas terbaru tidak dapat dimuat:", error);
    }
    window.renderTasks = renderTasks;
    window.filterTasks = renderTasks;
    window.openTaskSubmit = openTaskSubmit;
    window.closeTaskSubmit = closeTaskSubmit;
    window.handleFakeUpload = handleFile;
    window.submitTask = submitTask;
    document.querySelectorAll("[data-student-task-filter]").forEach(button => {
      button.addEventListener("click", () => renderTasks(button.dataset.studentTaskFilter));
    });
    try {
      await loadTasks();
    } catch (error) {
      const message = taskError(error);
      if ($("class-tasks-container")) $("class-tasks-container").innerHTML = `<div class="task-database-message"><i class="fas fa-triangle-exclamation"></i><p>${escapeHTML(message)}</p></div>`;
      if ($("dash-tasks-container")) $("dash-tasks-container").innerHTML = `<p class="text-center text-muted">${escapeHTML(message)}</p>`;
      console.warn(message);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
