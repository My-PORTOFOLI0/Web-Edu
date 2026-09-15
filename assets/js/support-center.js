(function () {
  "use strict";

  if (window.EduSkySupport) return;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";

  const DEFAULT_ADMIN_WHATSAPP = "";

  const CATEGORIES = [
    ["akun_login", "Akun & Login", "fa-key"],
    ["data_profil", "Data Profil", "fa-id-card"],
    ["modul", "Modul Belajar", "fa-book-open"],
    ["tugas", "Tugas", "fa-clipboard-check"],
    ["nilai", "Nilai", "fa-chart-column"],
    ["teknis", "Kendala Teknis", "fa-screwdriver-wrench"],
    ["lainnya", "Pertanyaan Lain", "fa-message"]
  ];

  let client = null;
  let modal = null;
  let lastFocused = null;
  let user = readUser();
  let mode = user?.id && user?.session_token ? "student" : "guest";
  let activeCategory = mode === "guest" ? "akun_login" : "lainnya";

  function readUser() {
    try {
      return JSON.parse(localStorage.getItem("edusky_user") || "null");
    } catch (error) {
      return null;
    }
  }

  function initials(name) {
    return String(name || "Siswa")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join("") || "SW";
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function categoryLabel(value) {
    return CATEGORIES.find(item => item[0] === value)?.[1] || "Pertanyaan Lain";
  }

  function questionTitle(message) {
    const text = String(message || "").replace(/\s+/g, " ").trim();
    if (text.length <= 90) return text;
    return `${text.slice(0, 87).trim()}...`;
  }

  function getWhatsAppNumber() {
    let savedNumber = "";
    try {
      const settings = JSON.parse(localStorage.getItem("edusky_admin_settings") || "null");
      savedNumber = settings?.whatsapp || localStorage.getItem("edusky_admin_whatsapp") || "";
    } catch (error) {
      savedNumber = localStorage.getItem("edusky_admin_whatsapp") || "";
    }
    const configured = String(window.EDUSKY_ADMIN_WHATSAPP || savedNumber || DEFAULT_ADMIN_WHATSAPP);
    return configured.replace(/\D/g, "");
  }

  function ensureClient() {
    if (client) return client;
    if (!window.supabase?.createClient) {
      throw new Error("Library Supabase belum tersedia. Muat ulang halaman lalu coba kembali.");
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  function databaseMessage(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "Laporan belum dapat dikirim.");
    if (code === "PGRST202" || message.toLowerCase().includes("could not find the function")) {
      return "Fitur laporan belum tersedia. Jalankan supabase/laporan_siswa_setup.sql di Supabase SQL Editor.";
    }
    if (code === "28000") return "Sesi siswa berakhir. Silakan login kembali.";
    return message;
  }

  function createModal() {
    if (modal) return modal;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <section class="support-modal" id="supportModal" role="dialog" aria-modal="true" aria-labelledby="supportTitle" hidden>
        <button class="support-backdrop" type="button" data-support-close aria-label="Tutup pusat bantuan"></button>
        <div class="support-dialog">
          <header class="support-header">
            <div class="support-heading-icon"><i class="fas fa-headset"></i></div>
            <div><span>Pusat bantuan EduSky</span><h2 id="supportTitle">Apa yang ingin kamu tanyakan?</h2><p>Tulis pertanyaanmu dan sistem akan menyertakan profil akun secara otomatis.</p></div>
            <button class="support-close" type="button" data-support-close aria-label="Tutup">&times;</button>
          </header>

          <div class="support-body">
            <div class="support-contact-strip">
              <div><i class="fab fa-whatsapp"></i><span><strong>Butuh jawaban cepat?</strong><small>Hubungi admin langsung melalui WhatsApp.</small></span></div>
              <button type="button" data-support-whatsapp><i class="fab fa-whatsapp"></i> Buka WhatsApp</button>
            </div>

            <section class="support-reporter" id="supportReporter"></section>

            <form id="supportForm" novalidate>
              <div class="support-guest-fields" id="supportGuestFields" hidden>
                <label><span>Nama siswa <b>*</b></span><input id="supportGuestName" maxlength="150" autocomplete="name" placeholder="Masukkan nama lengkap" /></label>
                <label><span>NIS/NIM siswa <b>*</b></span><input id="supportIdentifier" maxlength="100" inputmode="numeric" autocomplete="username" placeholder="Masukkan nomor siswa" /></label>
              </div>

              <label class="support-field support-question-field"><span>Pertanyaan untuk admin <b>*</b></span><textarea id="supportMessage" minlength="10" maxlength="3000" rows="6" placeholder="Tuliskan pertanyaan atau kendalamu secara jelas..." required></textarea><small><span id="supportCharacterCount">0</span>/3000 karakter</small></label>
              <div class="support-status" id="supportStatus" role="status" aria-live="polite" hidden></div>
              <div class="support-actions"><button type="button" class="support-secondary" data-support-close>Batal</button><button type="submit" class="support-submit" id="supportSubmit"><i class="fas fa-paper-plane"></i><span>Kirim ke Admin</span></button></div>
            </form>

            <section class="support-history" id="supportHistory" hidden>
              <div class="support-history-heading"><div><span>Riwayat laporan</span><h3>Laporan saya</h3></div><button type="button" id="refreshSupportHistory" aria-label="Muat ulang riwayat"><i class="fas fa-rotate"></i></button></div>
              <div id="supportHistoryList"><p class="support-empty">Belum ada laporan.</p></div>
            </section>
          </div>
        </div>
      </section>`;

    modal = wrapper.firstElementChild;
    document.body.appendChild(modal);
    bindModalEvents();
    syncReporter();
    return modal;
  }

  function syncReporter() {
    if (!modal) return;
    user = readUser();
    mode = user?.id && user?.session_token ? "student" : "guest";
    const reporter = modal.querySelector("#supportReporter");
    const guestFields = modal.querySelector("#supportGuestFields");
    const history = modal.querySelector("#supportHistory");

    guestFields.hidden = mode !== "guest";
    history.hidden = mode !== "student";

    if (mode === "student") {
      const name = user.nama_siswa || user.nama || user.username || "Siswa EduSky";
      reporter.innerHTML = `
        <div class="support-avatar"></div>
        <div><span>Laporan dikirim sebagai</span><strong></strong><small></small></div>
        <i class="fas fa-circle-check" title="Sesi terverifikasi"></i>`;
      reporter.querySelector(".support-avatar").textContent = initials(name);
      reporter.querySelector("strong").textContent = name;
      reporter.querySelector("small").textContent = `${user.nis || "Tanpa NIS"} • ${user.kelas ? `Kelas ${user.kelas}` : user.jenjang || "Siswa"} • ${user.sekolah || "Sekolah belum diatur"}`;
    } else {
      reporter.innerHTML = `<i class="fas fa-circle-info"></i><div><strong>Bantuan sebelum login</strong><small>Masukkan nama dan NIS/NIM agar admin dapat mengenali akunmu.</small></div>`;
    }
  }

  function setCategory(value) {
    activeCategory = CATEGORIES.some(item => item[0] === value)
      ? value
      : mode === "guest" ? "akun_login" : "lainnya";
  }

  function setStatus(message, type = "info") {
    const status = modal?.querySelector("#supportStatus");
    if (!status) return;
    status.hidden = !message;
    status.className = `support-status ${type}`;
    status.textContent = message || "";
  }

  function setLoading(loading) {
    const button = modal?.querySelector("#supportSubmit");
    if (!button) return;
    button.disabled = loading;
    button.querySelector("i").className = loading ? "fas fa-spinner fa-spin" : "fas fa-paper-plane";
    button.querySelector("span").textContent = loading ? "Mengirim..." : "Kirim ke Admin";
  }

  async function loadHistory() {
    const list = modal?.querySelector("#supportHistoryList");
    if (mode !== "student" || !list) return;
    list.innerHTML = '<p class="support-empty"><i class="fas fa-spinner fa-spin"></i> Memuat laporan...</p>';
    try {
      const { data, error } = await ensureClient().rpc("siswa_list_laporan", {
        p_id: user.id,
        p_session_token: user.session_token
      });
      if (error) throw error;
      const reports = Array.isArray(data) ? data : [];
      if (!reports.length) {
        list.innerHTML = '<p class="support-empty">Belum ada laporan yang dikirim.</p>';
        return;
      }
      list.replaceChildren(...reports.map(report => {
        const article = document.createElement("article");
        article.className = "support-history-item";
        const top = document.createElement("div");
        const title = document.createElement("strong");
        const badge = document.createElement("span");
        title.textContent = "Pertanyaan";
        badge.className = `support-status-badge ${report.status || "baru"}`;
        badge.textContent = ({ baru: "Baru", dibaca: "Dibaca", diproses: "Diproses", selesai: "Selesai" })[report.status] || report.status;
        top.append(title, badge);
        const meta = document.createElement("small");
        meta.textContent = `${categoryLabel(report.kategori)} • ${formatDate(report.created_at)}`;
        const message = document.createElement("p");
        message.textContent = report.pesan || "";
        article.append(top, meta, message);
        if (report.balasan_admin) {
          const reply = document.createElement("blockquote");
          reply.innerHTML = "<strong>Balasan Admin</strong>";
          const replyText = document.createElement("span");
          replyText.textContent = report.balasan_admin;
          reply.append(replyText);
          article.append(reply);
        }
        return article;
      }));
    } catch (error) {
      list.innerHTML = "";
      const text = document.createElement("p");
      text.className = "support-empty error";
      text.textContent = databaseMessage(error);
      list.appendChild(text);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    const message = modal.querySelector("#supportMessage").value.trim();
    const identifier = modal.querySelector("#supportIdentifier").value.trim();
    const guestName = modal.querySelector("#supportGuestName").value.trim();
    const subject = questionTitle(message);

    if (message.length < 10) {
      setStatus("Tuliskan pertanyaan minimal 10 karakter.", "error");
      return;
    }
    if (mode === "guest" && guestName.length < 3) {
      setStatus("Masukkan nama lengkap siswa.", "error");
      modal.querySelector("#supportGuestName").focus();
      return;
    }
    if (mode === "guest" && identifier.length < 2) {
      setStatus("Masukkan NIS/NIM siswa.", "error");
      modal.querySelector("#supportIdentifier").focus();
      return;
    }

    setLoading(true);
    setStatus("", "info");
    try {
      const rpc = mode === "student" ? "siswa_kirim_laporan" : "publik_kirim_laporan_login";
      const params = mode === "student" ? {
        p_id: user.id,
        p_session_token: user.session_token,
        p_kategori: activeCategory,
        p_subjek: subject,
        p_pesan: message
      } : {
        p_identifier: identifier,
        p_nama: guestName,
        p_kontak: "",
        p_kategori: activeCategory,
        p_subjek: subject,
        p_pesan: message
      };
      const { error } = await ensureClient().rpc(rpc, params);
      if (error) throw error;
      setStatus("Pertanyaan berhasil dikirim. Admin dapat melihat laporan dan profil pengirim.", "success");
      modal.querySelector("#supportMessage").value = "";
      modal.querySelector("#supportCharacterCount").textContent = "0";
      if (mode === "student") await loadHistory();
    } catch (error) {
      setStatus(databaseMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }

  function openWhatsApp() {
    const number = getWhatsAppNumber();
    if (!/^\d{10,15}$/.test(number)) {
      open();
      setStatus("Nomor WhatsApp admin belum diatur. Silakan atur melalui Admin > Pengaturan > Bantuan Siswa.", "error");
      return;
    }
    const name = mode === "student"
      ? user.nama_siswa || user.nama || user.username || "Siswa"
      : modal?.querySelector("#supportGuestName")?.value.trim() || "Siswa";
    const identifier = mode === "student"
      ? user.nis || user.username || "-"
      : modal?.querySelector("#supportIdentifier")?.value.trim() || document.getElementById("username")?.value.trim() || "-";
    const message = modal?.querySelector("#supportMessage")?.value.trim();
    const text = [
      "Halo Admin EduSky, saya membutuhkan bantuan.",
      `Nama: ${name}`,
      `NIS/Username: ${identifier}`,
      `Topik: ${categoryLabel(activeCategory)}`,
      message ? `Pertanyaan: ${message}` : "Mohon bantuannya terkait akun/pembelajaran saya."
    ].join("\n");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function bindModalEvents() {
    modal.querySelectorAll("[data-support-close]").forEach(button => button.addEventListener("click", close));
    modal.querySelector("#supportForm").addEventListener("submit", submitReport);
    modal.querySelector("#supportMessage").addEventListener("input", event => {
      modal.querySelector("#supportCharacterCount").textContent = String(event.target.value.length);
    });
    modal.querySelector("[data-support-whatsapp]").addEventListener("click", openWhatsApp);
    modal.querySelector("#refreshSupportHistory").addEventListener("click", loadHistory);
  }

  function open(options = {}) {
    createModal();
    syncReporter();
    lastFocused = document.activeElement;
    const loginIdentifier = document.getElementById("username")?.value.trim();
    if (mode === "guest" && loginIdentifier) modal.querySelector("#supportIdentifier").value = loginIdentifier;
    setCategory(options.category || (mode === "guest" ? "akun_login" : "lainnya"));
    setStatus("", "info");
    modal.hidden = false;
    document.body.classList.add("support-open");
    requestAnimationFrame(() => {
      modal.classList.add("open");
      modal.querySelector(mode === "guest" ? "#supportGuestName" : "#supportMessage")?.focus();
    });
    if (mode === "student") loadHistory();
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.classList.remove("open");
    document.body.classList.remove("support-open");
    window.setTimeout(() => { modal.hidden = true; }, 180);
    lastFocused?.focus?.();
  }

  function attachTriggers() {
    createModal();
    document.querySelectorAll("[data-support-open]").forEach(button => {
      button.addEventListener("click", () => open({
        category: button.dataset.supportCategory
      }));
    });
    document.querySelectorAll("[data-support-whatsapp]").forEach(button => {
      if (!button.closest("#supportModal")) button.addEventListener("click", openWhatsApp);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && modal && !modal.hidden) close();
    });
  }

  window.EduSkySupport = { open, close, openWhatsApp, refresh: loadHistory };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachTriggers, { once: true });
  } else {
    attachTriggers();
  }
})();
