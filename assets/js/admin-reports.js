(function () {
  "use strict";

  if (window.__EDUSKY_ADMIN_REPORTS__) return;
  window.__EDUSKY_ADMIN_REPORTS__ = true;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const STATUS_LABELS = { baru: "Baru", dibaca: "Dibaca", diproses: "Diproses", selesai: "Selesai" };
  const CATEGORY_LABELS = {
    akun_login: "Akun & Login",
    data_profil: "Data Profil",
    modul: "Modul Belajar",
    tugas: "Tugas",
    nilai: "Nilai",
    teknis: "Kendala Teknis",
    lainnya: "Pertanyaan Lain"
  };

  const $ = id => document.getElementById(id);
  let client = null;
  let reports = [];
  let activeReport = null;
  let searchTimer = null;
  let toastTimer = null;
  const unreadBySection = { questions: 0, grades: 0, attendance: 0, progress: 0 };

  const COUNT_IDS = {
    grades: ["reportGradeTotalCount", "reportGradeUnreadCount", "reportGradeReadCount"],
    attendance: ["reportAttendanceTotalCount", "reportAttendanceUnreadCount", "reportAttendanceReadCount"],
    progress: ["reportProgressTotalCount", "reportProgressUnreadCount", "reportProgressReadCount"]
  };
  const PASSIVE_SECTIONS = {
    attendance: { target: "kehadiranTableBody", panel: "laporan-kehadiran" },
    progress: { target: "progresContainer", panel: "laporan-progres" }
  };

  function normalizeArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string") {
      try { return normalizeArray(JSON.parse(value)); } catch (error) { return []; }
    }
    if (value && typeof value === "object") return [value];
    return [];
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initials(name) {
    return String(name || "Siswa")
      .trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(word => word.charAt(0).toUpperCase()).join("") || "SW";
  }

  function formatDate(value, withTime = true) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function safePhoto(value) {
    const photo = String(value || "");
    return /^(https?:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(photo) ? photo : "";
  }

  function excerpt(value, length = 90) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > length ? `${text.slice(0, length - 3).trim()}...` : text;
  }

  function errorMessage(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "Laporan siswa gagal dimuat.");
    if (code === "PGRST202" || message.toLowerCase().includes("could not find the function")) {
      return "Fungsi laporan belum tersedia. Jalankan supabase/laporan_siswa_setup.sql di Supabase SQL Editor.";
    }
    return message;
  }

  function showToast(message, type = "success") {
    let toast = $("adminReportToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "adminReportToast";
      toast.className = "admin-report-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `admin-report-toast ${type} show`;
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
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
      return Boolean(
        session?.isLoggedIn === true &&
        session?.role === "admin" &&
        !(typeof session.expiresAt === "number" && session.expiresAt <= Date.now())
      );
    } catch (error) {
      return false;
    }
  }

  function updateNavigationBadge() {
    const unread = Object.values(unreadBySection).reduce((sum, value) => sum + Number(value || 0), 0);
    const badge = $("reportNavBadge");
    if (!badge) return;
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  }

  function setSectionCounts(section, values = {}) {
    const ids = COUNT_IDS[section];
    if (!ids) return;
    const total = Math.max(0, Number(values.total || 0));
    const unread = Math.max(0, Number(values.unread || 0));
    const read = Math.max(0, Number(values.read ?? (total - unread)));
    [total, unread, read].forEach((value, index) => {
      const element = $(ids[index]);
      if (element) element.textContent = String(value);
    });
    const unreadElement = $(ids[1]);
    if (unreadElement?.parentElement) unreadElement.parentElement.hidden = unread === 0;
    unreadBySection[section] = unread;
    updateNavigationBadge();
  }

  function passiveItemCount(section) {
    const config = PASSIVE_SECTIONS[section];
    const container = config ? $(config.target) : null;
    if (!container) return 0;
    if (section === "attendance") {
      return [...container.querySelectorAll("tr")]
        .filter(row => !row.querySelector("td[colspan]")).length;
    }
    return container.children.length;
  }

  function syncPassiveSection(section, markRead = false) {
    const total = passiveItemCount(section);
    const storageKey = `edusky_admin_report_seen_${section}`;
    let read = Math.min(total, Math.max(0, Number(localStorage.getItem(storageKey) || 0)));
    if (markRead) {
      read = total;
      localStorage.setItem(storageKey, String(total));
    }
    setSectionCounts(section, { total, unread: Math.max(0, total - read), read });
  }

  function observePassiveSections() {
    Object.entries(PASSIVE_SECTIONS).forEach(([section, config]) => {
      const target = $(config.target);
      if (!target) return;
      syncPassiveSection(section);
      new MutationObserver(() => syncPassiveSection(section))
        .observe(target, { childList: true, subtree: true });
    });
  }

  function updateSummary() {
    const counts = reports.reduce((result, report) => {
      result.total += 1;
      result[report.status] = (result[report.status] || 0) + 1;
      return result;
    }, { total: 0, baru: 0, dibaca: 0, diproses: 0, selesai: 0 });
    $("reportTotalCount").textContent = String(counts.total);
    $("reportNewCount").textContent = String(counts.baru);
    $("reportProcessCount").textContent = String(counts.diproses);
    $("reportDoneCount").textContent = String(counts.selesai);
    $("reportTabCount").textContent = String(counts.total);
    $("reportQuestionUnreadCount").textContent = String(counts.baru);
    $("reportQuestionUnreadCount").parentElement.hidden = counts.baru === 0;
    $("reportQuestionReadCount").textContent = String(Math.max(0, counts.total - counts.baru));
    unreadBySection.questions = counts.baru;
    updateNavigationBadge();
  }

  function filteredReports() {
    const keyword = String($("reportSearch")?.value || "").trim().toLowerCase();
    const status = $("reportStatusFilter")?.value || "";
    return reports.filter(report => {
      if (status && report.status !== status) return false;
      if (!keyword) return true;
      return [report.nama_siswa, report.nis, report.username, report.subjek, report.pesan, report.kategori]
        .some(value => String(value || "").toLowerCase().includes(keyword));
    });
  }

  function renderReports() {
    const tbody = $("studentReportTableBody");
    if (!tbody) return;
    const rows = filteredReports();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-report-empty"><i class="far fa-folder-open"></i><strong>Tidak ada laporan</strong><span>Belum ada laporan yang sesuai dengan pencarian atau filter.</span></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(report => {
      const name = report.nama_siswa || "Pelapor sebelum login";
      const photo = safePhoto(report.foto);
      const avatar = photo
        ? `<img src="${escapeHTML(photo)}" alt="">`
        : escapeHTML(initials(name));
      const account = report.nis || report.username || report.identifier_login || "Tanpa identitas akun";
      const sourceClass = report.sumber === "login" ? "login" : "profile";
      const sourceLabel = report.sumber === "login" ? "Halaman Login" : "Profil Siswa";
      const sourceIcon = report.sumber === "login" ? "fa-right-to-bracket" : "fa-user-check";
      return `<tr>
        <td><div class="report-student-cell"><span class="report-list-avatar">${avatar}</span><div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(account)}${report.kelas ? ` • Kelas ${escapeHTML(report.kelas)}` : ""}</small></div></div></td>
        <td><div class="report-question-cell"><strong>${escapeHTML(excerpt(report.pesan))}</strong><small>${escapeHTML(CATEGORY_LABELS[report.kategori] || "Pertanyaan Lain")}</small></div></td>
        <td><span class="report-source ${sourceClass}"><i class="fas ${sourceIcon}"></i>${sourceLabel}</span></td>
        <td><span class="report-status ${escapeHTML(report.status)}">${escapeHTML(STATUS_LABELS[report.status] || report.status)}</span></td>
        <td>${escapeHTML(formatDate(report.created_at))}</td>
        <td><button class="report-view-btn" type="button" data-report-id="${escapeHTML(report.id)}"><i class="far fa-eye"></i> Detail</button></td>
      </tr>`;
    }).join("");
  }

  async function loadReports(options = {}) {
    const tbody = $("studentReportTableBody");
    if (tbody && !options.silent) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Memuat laporan siswa...</td></tr>';
    try {
      const { data, error } = await ensureClient().rpc("admin_list_laporan_siswa", { p_status: "", p_search: "" });
      if (error) throw error;
      reports = normalizeArray(data);
      updateSummary();
      renderReports();
    } catch (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="admin-report-empty"><i class="fas fa-triangle-exclamation"></i><strong>Laporan belum dapat dimuat</strong><span>${escapeHTML(errorMessage(error))}</span></td></tr>`;
      if (!options.silent) showToast(errorMessage(error), "error");
    }
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value || "-";
  }

  function openReport(report) {
    const modal = $("studentReportModal");
    if (!modal || !report) return;
    activeReport = report;
    const name = report.nama_siswa || "Pelapor sebelum login";
    const photo = safePhoto(report.foto);
    const image = $("reportStudentPhoto");
    image.hidden = !photo;
    image.src = photo || "";
    $("reportStudentInitials").hidden = Boolean(photo);
    setText("reportStudentInitials", initials(name));
    setText("reportStudentName", name);
    setText("reportStudentAccount", report.sumber === "login" ? "Laporan dikirim dari halaman login" : "Sesi siswa terverifikasi");
    setText(
      "reportAccountStatus",
      report.sumber === "login"
        ? "Belum terverifikasi"
        : report.status_akun ? `Akun ${report.status_akun}` : "Akun siswa"
    );
    setText("reportStudentNis", report.nis || report.identifier_login);
    setText("reportStudentUsername", report.username);
    setText("reportStudentClass", [report.jenjang, report.kelas ? `Kelas ${report.kelas}` : ""].filter(Boolean).join(" • "));
    setText("reportStudentSchool", report.sekolah);
    setText("reportStudentContact", report.kontak);
    setText("reportStudentLastLogin", formatDate(report.terakhir_login));
    setText("reportStudentAccountCreated", formatDate(report.akun_created_at, false));
    setText("reportStudentUpdated", formatDate(report.akun_updated_at));
    setText("reportQuestionCategory", CATEGORY_LABELS[report.kategori] || "Pertanyaan Lain");
    setText("reportQuestionDate", formatDate(report.created_at));
    setText("reportQuestionSubject", "Pertanyaan siswa");
    setText("reportQuestionMessage", report.pesan);
    $("reportDetailStatus").value = report.status || "baru";
    $("reportAdminReply").value = report.balasan_admin || "";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (report.status === "baru") markReportRead(report);
  }

  async function markReportRead(report) {
    try {
      const { data, error } = await ensureClient().rpc("admin_update_laporan_siswa", {
        p_id: report.id,
        p_status: "dibaca",
        p_balasan: null
      });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      reports = reports.map(item => item.id === report.id ? { ...item, ...updated, status: "dibaca" } : item);
      activeReport = activeReport?.id === report.id ? { ...activeReport, ...updated, status: "dibaca" } : activeReport;
      if ($("reportDetailStatus")) $("reportDetailStatus").value = "dibaca";
      updateSummary();
      renderReports();
    } catch (error) {
      console.warn("Laporan baru belum dapat ditandai sebagai dibaca:", errorMessage(error));
    }
  }

  function closeReport() {
    const modal = $("studentReportModal");
    modal?.classList.remove("active");
    modal?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    activeReport = null;
  }

  async function saveReport() {
    if (!activeReport) return;
    const button = $("saveStudentReport");
    const status = $("reportDetailStatus").value;
    const reply = $("reportAdminReply").value.trim();
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    try {
      const { data, error } = await ensureClient().rpc("admin_update_laporan_siswa", {
        p_id: activeReport.id,
        p_status: status,
        p_balasan: reply || null
      });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      reports = reports.map(report => report.id === activeReport.id ? { ...report, ...updated } : report);
      updateSummary();
      renderReports();
      closeReport();
      showToast("Penanganan laporan berhasil disimpan.", "success");
    } catch (error) {
      showToast(errorMessage(error), "error");
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan Penanganan';
    }
  }

  function bindTabs() {
    $("laporanPage")?.querySelectorAll(".report-menu-card[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        const target = button.dataset.tab;
        $("laporanPage").querySelectorAll(".report-menu-card").forEach(item => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", String(active));
        });
        $("laporanPage").querySelectorAll(".tab-content").forEach(panel => panel.classList.toggle("active", panel.id === target));
        if (target === "laporan-bantuan") loadReports({ silent: true });
        const passive = Object.entries(PASSIVE_SECTIONS).find(([, config]) => config.panel === target)?.[0];
        if (passive) syncPassiveSection(passive, true);
        document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function bindEvents() {
    bindTabs();
    window.addEventListener("edusky:report-counts", event => {
      const detail = event.detail || {};
      if (detail.section) setSectionCounts(detail.section, detail);
    });
    $("studentReportTableBody")?.addEventListener("click", event => {
      const button = event.target.closest("[data-report-id]");
      if (!button) return;
      openReport(reports.find(report => report.id === button.dataset.reportId));
    });
    $("reportSearch")?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderReports, 180);
    });
    $("reportStatusFilter")?.addEventListener("change", renderReports);
    $("refreshStudentReports")?.addEventListener("click", () => loadReports());
    $("saveStudentReport")?.addEventListener("click", saveReport);
    document.querySelectorAll("[data-report-close]").forEach(button => button.addEventListener("click", closeReport));
    $("studentReportModal")?.addEventListener("click", event => {
      if (event.target === $("studentReportModal")) closeReport();
    });
    document.querySelector('[data-page="laporan"]')?.addEventListener("click", () => setTimeout(() => loadReports({ silent: true }), 60));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && $("studentReportModal")?.classList.contains("active")) closeReport();
    });
    window.addEventListener("focus", () => loadReports({ silent: true }));
    window.setInterval(() => {
      if (!document.hidden) loadReports({ silent: true });
    }, 60000);
  }

  function initialize() {
    if (!$("studentReportTableBody") || !hasAdminSession()) return;
    bindEvents();
    const gradeCounts = window.EDUSKY_REPORT_COUNTS?.grades;
    if (gradeCounts) setSectionCounts("grades", gradeCounts);
    observePassiveSections();
    loadReports();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
