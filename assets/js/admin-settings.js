(function () {
  "use strict";

  if (window.__EDUSKY_ADMIN_SETTINGS__) return;
  window.__EDUSKY_ADMIN_SETTINGS__ = true;

  const STORAGE_KEY = "edusky_admin_settings";
  const LOCAL_OVERRIDE_KEY = "edusky_settings_local_override";
  const ADMIN_SESSION_KEY = "edusky_admin_session";
  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const DEFAULTS = {
    appName: "EduSky Learning",
    academicYear: "2026/2027",
    adminName: "Administrator",
    theme: "light",
    whatsapp: "",
    logo: "",
    logoScale: 1,
    logoX: 0,
    logoY: 0
  };
  const THEME_LABELS = { light: "Terang", dark: "Gelap", system: "Otomatis" };
  const PANEL_STORAGE_KEY = "edusky_admin_settings_panel";
  const $ = id => document.getElementById(id);
  let savedSettings = { ...DEFAULTS };
  let toastTimer = null;
  let client = null;
  let isSaving = false;
  let databaseConnected = false;
  let draftLogo = "";
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
      return {
        appName: String(parsed.appName || DEFAULTS.appName).slice(0, 80),
        academicYear: String(parsed.academicYear || DEFAULTS.academicYear).slice(0, 20),
        adminName: String(parsed.adminName || DEFAULTS.adminName).slice(0, 80),
        theme: ["light", "dark", "system"].includes(parsed.theme) ? parsed.theme : "light",
        whatsapp: String(parsed.whatsapp || "").replace(/\D/g, "").slice(0, 15),
        logo: normalizeLogo(parsed.logo),
        logoScale: clampNumber(parsed.logoScale, .5, 3, 1),
        logoX: clampNumber(parsed.logoX, -100, 100, 0),
        logoY: clampNumber(parsed.logoY, -100, 100, 0),
        updatedAt: parsed.updatedAt || null
      };
    } catch (error) {
      return { ...DEFAULTS };
    }
  }

  function normalizeLogo(value) {
    const logo = String(value || "").trim();
    return /^(?:data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(logo) && logo.length <= 500000
      ? logo
      : "";
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function readAdminSession() {
    try {
      const session = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || "null");
      if (!session?.admin_id || !session?.session_token || session.role !== "admin") return null;
      if (Number(session.expiresAt || 0) <= Date.now()) return null;
      return session;
    } catch (error) {
      return null;
    }
  }

  function ensureClient() {
    if (client) return client;
    if (!window.supabase?.createClient) throw new Error("Library Supabase belum tersedia.");
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  function normalizeRemote(data) {
    const value = Array.isArray(data) ? data[0] : data;
    if (!value || typeof value !== "object") return null;
    return {
      appName: String(value.app_name || DEFAULTS.appName).slice(0, 80),
      academicYear: String(value.academic_year || DEFAULTS.academicYear).slice(0, 20),
      adminName: String(value.admin_name || DEFAULTS.adminName).slice(0, 80),
      theme: ["light", "dark", "system"].includes(value.admin_theme) ? value.admin_theme : "light",
      whatsapp: String(value.whatsapp || "").replace(/\D/g, "").slice(0, 15),
      logo: normalizeLogo(value.logo),
      logoScale: clampNumber(value.logo_scale ?? value.logoScale, .5, 3, 1),
      logoX: clampNumber(value.logo_x ?? value.logoX, -100, 100, 0),
      logoY: clampNumber(value.logo_y ?? value.logoY, -100, 100, 0),
      updatedAt: value.updated_at || null
    };
  }

  function databaseMessage(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "Pengaturan belum dapat disinkronkan.");
    const text = message.toLowerCase();
    if (code === "PGRST202" || text.includes("could not find the function")) {
      return "Sinkronisasi Supabase belum tersedia. Pengaturan akan disimpan di perangkat ini.";
    }
    if (code === "28000") return "Sesi admin berakhir. Silakan login kembali.";
    return message;
  }

  function cacheSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem("edusky_admin_whatsapp", settings.whatsapp || "");
    localStorage.setItem("edusky_public_settings", JSON.stringify(settings));
    window.EDUSKY_ADMIN_WHATSAPP = settings.whatsapp || "";
    window.dispatchEvent(new CustomEvent("edusky:settings", { detail: settings }));
  }

  async function loadRemoteSettings() {
    const session = readAdminSession();
    if (!session) throw new Error("Sesi admin tidak valid. Silakan login kembali.");
    const { data, error } = await ensureClient().rpc("admin_get_pengaturan_aplikasi", {
      p_admin_id: session.admin_id,
      p_session_token: session.session_token
    });
    if (error) throw error;
    const settings = normalizeRemote(data);
    if (!settings) throw new Error("Data pengaturan dari Supabase tidak valid.");
    return settings;
  }

  async function persistRemote(settings) {
    const session = readAdminSession();
    if (!session) throw new Error("Sesi admin tidak valid. Silakan login kembali.");
    const { data, error } = await ensureClient().rpc("admin_update_pengaturan_aplikasi", {
      p_admin_id: session.admin_id,
      p_session_token: session.session_token,
      p_nama_aplikasi: settings.appName,
      p_tahun_ajaran: settings.academicYear,
      p_nama_admin: settings.adminName,
      p_tema_admin: settings.theme,
      p_whatsapp_admin: settings.whatsapp || null,
      p_logo_aplikasi: settings.logo || null,
      p_logo_scale: settings.logoScale,
      p_logo_position_x: Math.round(settings.logoX),
      p_logo_position_y: Math.round(settings.logoY)
    });
    if (error) throw error;
    return normalizeRemote(data) || { ...settings, updatedAt: new Date().toISOString() };
  }

  function currentSettings() {
    return {
      appName: $("namaAplikasi").value.trim(),
      academicYear: $("tahunAjaran").value.trim(),
      adminName: $("namaAdmin").value.trim(),
      theme: document.querySelector('input[name="adminTheme"]:checked')?.value || "light",
      whatsapp: $("adminWhatsapp").value.replace(/\D/g, ""),
      logo: draftLogo,
      logoScale: clampNumber(Number($("logoScale").value) / 100, .5, 3, 1),
      logoX: clampNumber($("logoPositionX").value, -100, 100, 0),
      logoY: clampNumber($("logoPositionY").value, -100, 100, 0)
    };
  }

  function sameSettings(a, b) {
    return ["appName", "academicYear", "adminName", "theme", "whatsapp", "logo", "logoScale", "logoX", "logoY"]
      .every(key => String(a[key] ?? "") === String(b[key] ?? ""));
  }

  function resolveDark(theme) {
    return theme === "dark" || (theme === "system" && Boolean(media?.matches));
  }

  function applyTheme(theme) {
    const dark = resolveDark(theme);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.body.toggleAttribute("data-theme", dark);
    if (dark) document.body.setAttribute("data-theme", "dark");
  }

  function formatSavedTime(value) {
    if (!value) return "Belum pernah disimpan";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Tersimpan";
    return `Disimpan ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)}`;
  }

  function setFields(settings) {
    $("namaAplikasi").value = settings.appName;
    $("tahunAjaran").value = settings.academicYear;
    $("namaAdmin").value = settings.adminName;
    $("adminWhatsapp").value = settings.whatsapp;
    draftLogo = normalizeLogo(settings.logo);
    $("logoScale").value = Math.round(clampNumber(settings.logoScale, .5, 3, 1) * 100);
    $("logoPositionX").value = Math.round(clampNumber(settings.logoX, -100, 100, 0));
    $("logoPositionY").value = Math.round(clampNumber(settings.logoY, -100, 100, 0));
    const radio = document.querySelector(`input[name="adminTheme"][value="${settings.theme}"]`)
      || document.querySelector('input[name="adminTheme"][value="light"]');
    radio.checked = true;
    applyTheme(settings.theme);
    updateLogoPreview();
    updatePreview();
    updateDirtyState();
  }

  function updateThemeCards() {
    document.querySelectorAll(".settings-theme-card").forEach(card => {
      card.classList.toggle("selected", Boolean(card.querySelector("input:checked")));
    });
  }

  function formatWhatsapp(value) {
    const number = String(value || "").replace(/\D/g, "");
    if (!number) return "Belum diatur";
    return `+${number}`;
  }

  function setLogoImage(image, fallback, logo, settings = currentSettings()) {
    if (!image || !fallback) return;
    image.hidden = !logo;
    image.src = logo || "";
    fallback.hidden = Boolean(logo);
    image.style.transform = logo
      ? `translate(${settings.logoX}%, ${settings.logoY}%) scale(${settings.logoScale})`
      : "";
    image.style.transformOrigin = logo ? "center" : "";
  }

  function formatPosition(value, negative, positive) {
    const number = Math.round(Number(value) || 0);
    if (!number) return "Tengah";
    return `${Math.abs(number)}% ${number < 0 ? negative : positive}`;
  }

  function updateLogoControlState() {
    const scale = Number($("logoScale").value) || 100;
    const x = Number($("logoPositionX").value) || 0;
    const y = Number($("logoPositionY").value) || 0;
    $("logoScaleValue").textContent = `${Math.round(scale)}%`;
    $("logoPositionXValue").textContent = formatPosition(x, "kiri", "kanan");
    $("logoPositionYValue").textContent = formatPosition(y, "atas", "bawah");
    $("settingsLogoAdjustments").classList.toggle("is-disabled", !draftLogo);
    [$("logoScale"), $("logoPositionX"), $("logoPositionY"), $("resetLogoPosition")]
      .forEach(control => { control.disabled = !draftLogo; });
  }

  function updateLogoPreview() {
    setLogoImage($("settingsLogoPreview"), $("settingsLogoFallback"), draftLogo);
    setLogoImage($("settingsPreviewLogo"), $("settingsPreviewLogoFallback"), draftLogo);
    updateLogoControlState();
    const removeButton = $("removeLogoButton");
    if (removeButton) removeButton.disabled = !draftLogo;
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("File gambar tidak dapat dibaca.")); };
      image.src = url;
    });
  }

  async function resizeLogo(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Logo harus menggunakan format JPEG, PNG, atau WebP.");
    }
    if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran file logo maksimal 5 MB.");
    const image = await loadImageFile(file);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 512 / Math.max(1, longest));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar logo.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL("image/webp", .86);
    if (result.length > 480000) result = canvas.toDataURL("image/webp", .68);
    if (result.length > 500000) throw new Error("Logo masih terlalu besar setelah diperkecil. Pilih gambar yang lebih sederhana.");
    return result;
  }

  function updatePreview() {
    const settings = currentSettings();
    $("settingsPreviewName").textContent = settings.appName || "Nama aplikasi";
    $("settingsPreviewYear").textContent = settings.academicYear || "-";
    $("settingsPreviewAdmin").textContent = settings.adminName || "-";
    $("settingsPreviewTheme").textContent = THEME_LABELS[settings.theme] || "Terang";
    $("whatsappPreview").textContent = formatWhatsapp(settings.whatsapp);
    updateThemeCards();
  }

  function updateDirtyState() {
    const dirty = !sameSettings(currentSettings(), savedSettings);
    const state = $("settingsSaveState");
    state.classList.toggle("dirty", dirty);
    state.querySelector("strong").textContent = dirty
      ? "Perubahan belum disimpan"
      : databaseConnected ? "Tersinkron Supabase" : "Tersimpan di perangkat";
    $("settingsLastSaved").textContent = dirty
      ? "Simpan untuk menerapkan perubahan"
      : databaseConnected ? formatSavedTime(savedSettings.updatedAt) : `${formatSavedTime(savedSettings.updatedAt)} • menunggu sinkronisasi`;
    $("settingsDirtyDot").classList.toggle("dirty", dirty);
    $("settingsChangeText").textContent = dirty ? "Ada perubahan yang belum disimpan." : "Tidak ada perubahan yang belum disimpan.";
    $("savePengaturan").disabled = !dirty || isSaving;
  }

  function showToast(message, type = "success") {
    let toast = $("adminSettingsToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "adminSettingsToast";
      toast.className = "admin-settings-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `admin-settings-toast ${type} show`;
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function activatePanel(panelId, options = {}) {
    const target = $(panelId) || $("settingsGeneral");
    if (!target?.matches("[data-settings-panel]")) return;

    document.querySelectorAll("[data-settings-panel]").forEach(panel => {
      const active = panel === target;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    document.querySelectorAll("[data-settings-target]").forEach(button => {
      const active = button.dataset.settingsTarget === target.id;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    sessionStorage.setItem(PANEL_STORAGE_KEY, target.id);
    if (options.focus) target.querySelector("input, button")?.focus({ preventScroll: true });
    if (options.scroll) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validate(settings) {
    document.querySelectorAll(".settings-input-wrap").forEach(element => element.classList.remove("invalid"));
    if (settings.appName.length < 3) {
      activatePanel("settingsGeneral");
      $("namaAplikasi").closest(".settings-input-wrap").classList.add("invalid");
      $("namaAplikasi").focus();
      return "Nama aplikasi minimal 3 karakter.";
    }
    if (!/^\d{4}\s*\/\s*\d{4}$/.test(settings.academicYear)) {
      activatePanel("settingsGeneral");
      $("tahunAjaran").closest(".settings-input-wrap").classList.add("invalid");
      $("tahunAjaran").focus();
      return "Tahun ajaran harus menggunakan format 2026/2027.";
    }
    if (settings.adminName.length < 3) {
      activatePanel("settingsGeneral");
      $("namaAdmin").closest(".settings-input-wrap").classList.add("invalid");
      $("namaAdmin").focus();
      return "Nama administrator minimal 3 karakter.";
    }
    if (settings.whatsapp && !/^\d{10,15}$/.test(settings.whatsapp)) {
      activatePanel("settingsHelp");
      $("adminWhatsapp").closest(".settings-input-wrap").classList.add("invalid");
      $("adminWhatsapp").focus();
      return "Nomor WhatsApp harus berisi 10 sampai 15 digit.";
    }
    return "";
  }

  function applyIdentity(settings) {
    document.title = `Admin Dashboard - ${settings.appName}`;
    const adminLabel = document.querySelector(".admin-user-label");
    if (adminLabel) adminLabel.textContent = settings.adminName;
    const brand = $("adminBrandName");
    if (brand) brand.textContent = settings.appName;
    setLogoImage($("adminBrandLogo"), $("adminBrandFallback"), settings.logo, settings);
  }

  async function saveSettings() {
    const settings = currentSettings();
    const error = validate(settings);
    if (error) {
      showToast(error, "error");
      return false;
    }
    isSaving = true;
    updateDirtyState();
    const saveButton = $("savePengaturan");
    const originalHTML = saveButton.innerHTML;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    try {
      savedSettings = await persistRemote(settings);
      databaseConnected = true;
      localStorage.removeItem(LOCAL_OVERRIDE_KEY);
      cacheSettings(savedSettings);
      applyTheme(savedSettings.theme);
      applyIdentity(savedSettings);
      const session = readAdminSession();
      if (session) {
        session.nama = savedSettings.adminName;
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      }
      setFields(savedSettings);
      showToast("Pengaturan tersimpan dan tersinkron ke Supabase.", "success");
      return true;
    } catch (error) {
      console.warn("Sinkronisasi pengaturan menggunakan mode lokal:", databaseMessage(error));
      savedSettings = { ...settings, updatedAt: new Date().toISOString() };
      databaseConnected = false;
      localStorage.setItem(LOCAL_OVERRIDE_KEY, "1");
      cacheSettings(savedSettings);
      applyTheme(savedSettings.theme);
      applyIdentity(savedSettings);
      const session = readAdminSession();
      if (session) {
        session.nama = savedSettings.adminName;
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      }
      setFields(savedSettings);
      showToast("Pengaturan dan logo berhasil disimpan serta langsung diaktifkan di perangkat ini.", "success");
      return true;
    } finally {
      isSaving = false;
      saveButton.innerHTML = originalHTML;
      updateDirtyState();
    }
  }

  function exportSettings() {
    const payload = { type: "edusky-admin-settings", version: 1, exportedAt: new Date().toISOString(), settings: currentSettings() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `edusky-pengaturan-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("Konfigurasi berhasil diexport.");
  }

  async function importSettings(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const settings = parsed?.settings || parsed;
      if (!settings || typeof settings !== "object") throw new Error("Format file tidak dikenali.");
      const imported = {
        appName: String(settings.appName || DEFAULTS.appName).slice(0, 80),
        academicYear: String(settings.academicYear || DEFAULTS.academicYear).slice(0, 20),
        adminName: String(settings.adminName || DEFAULTS.adminName).slice(0, 80),
        theme: ["light", "dark", "system"].includes(settings.theme) ? settings.theme : "light",
        whatsapp: String(settings.whatsapp || "").replace(/\D/g, "").slice(0, 15),
        logo: normalizeLogo(settings.logo),
        logoScale: clampNumber(settings.logoScale, .5, 3, 1),
        logoX: clampNumber(settings.logoX, -100, 100, 0),
        logoY: clampNumber(settings.logoY, -100, 100, 0)
      };
      setFields(imported);
      updateDirtyState();
      showToast("Konfigurasi dimuat. Periksa lalu klik Simpan Perubahan.");
    } catch (error) {
      showToast(error.message || "File konfigurasi tidak valid.", "error");
    }
  }

  async function resetToDefaults() {
    const confirmed = window.EduSkyLogoutConfirm
      ? await window.EduSkyLogoutConfirm.ask({
          title: "Reset seluruh pengaturan?",
          message: "Nama aplikasi, logo, tema, tahun ajaran, dan nomor WhatsApp akan dikembalikan ke nilai awal. Data siswa dan modul tidak akan dihapus.",
          confirmLabel: "Ya, Reset Pengaturan"
        })
      : window.confirm("Reset seluruh pengaturan dashboard?");
    if (!confirmed) return;
    setFields(DEFAULTS);
    const saved = await saveSettings();
    if (saved) showToast("Pengaturan berhasil dikembalikan ke default.");
  }

  function testWhatsapp() {
    const number = $("adminWhatsapp").value.replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(number)) {
      $("adminWhatsapp").closest(".settings-input-wrap").classList.add("invalid");
      showToast("Isi nomor WhatsApp yang valid sebelum melakukan pengujian.", "error");
      return;
    }
    window.open(`https://wa.me/${number}?text=${encodeURIComponent("Tes kanal bantuan EduSky")}`, "_blank", "noopener,noreferrer");
  }

  function bindEvents() {
    document.querySelectorAll("[data-settings-target]").forEach(button => {
      button.addEventListener("click", () => activatePanel(button.dataset.settingsTarget, { scroll: true }));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...document.querySelectorAll("[data-settings-target]")];
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        const next = buttons[(buttons.indexOf(button) + direction + buttons.length) % buttons.length];
        activatePanel(next.dataset.settingsTarget);
        next.focus();
      });
    });
    [$("namaAplikasi"), $("tahunAjaran"), $("namaAdmin"), $("adminWhatsapp")].forEach(input => {
      input.addEventListener("input", () => {
        if (input === $("adminWhatsapp")) input.value = input.value.replace(/\D/g, "").slice(0, 15);
        input.closest(".settings-input-wrap")?.classList.remove("invalid");
        updatePreview();
        updateDirtyState();
      });
    });
    document.querySelectorAll('input[name="adminTheme"]').forEach(input => input.addEventListener("change", () => {
      applyTheme(input.value);
      updatePreview();
      updateDirtyState();
    }));
    $("savePengaturan").addEventListener("click", saveSettings);
    $("resetPengaturan").addEventListener("click", () => setFields(savedSettings));
    $("resetAllBtn").addEventListener("click", resetToDefaults);
    $("exportDataBtn").addEventListener("click", exportSettings);
    $("importDataBtn").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) importSettings(file);
      event.target.value = "";
    });
    $("testWhatsapp").addEventListener("click", testWhatsapp);
    $("logoAplikasiInput").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        draftLogo = await resizeLogo(file);
        $("logoScale").value = "100";
        $("logoPositionX").value = "0";
        $("logoPositionY").value = "0";
        updateLogoPreview();
        updateDirtyState();
        showToast("Logo siap digunakan. Klik Simpan Perubahan untuk menerapkannya.");
      } catch (error) {
        showToast(error.message || "Logo gagal diproses.", "error");
      }
    });
    $("removeLogoButton").addEventListener("click", () => {
      draftLogo = "";
      updateLogoPreview();
      updateDirtyState();
    });
    [$("logoScale"), $("logoPositionX"), $("logoPositionY")].forEach(input => {
      input.addEventListener("input", () => {
        updateLogoPreview();
        updateDirtyState();
      });
    });
    $("resetLogoPosition").addEventListener("click", () => {
      $("logoScale").value = "100";
      $("logoPositionX").value = "0";
      $("logoPositionY").value = "0";
      updateLogoPreview();
      updateDirtyState();
    });
    media?.addEventListener?.("change", () => {
      if (currentSettings().theme === "system") applyTheme("system");
    });
  }

  async function initialize() {
    if (!$("pengaturanPage") || !$("namaAplikasi")) return;
    savedSettings = readSettings();
    setFields(savedSettings);
    applyIdentity(savedSettings);
    bindEvents();
    const lastPanel = sessionStorage.getItem(PANEL_STORAGE_KEY);
    activatePanel($(lastPanel) ? lastPanel : "settingsGeneral");
    $("settingsSaveState").querySelector("strong").textContent = "Menyinkronkan...";
    $("settingsLastSaved").textContent = "Mengambil pengaturan dari Supabase";
    try {
      const hasLocalOverride = localStorage.getItem(LOCAL_OVERRIDE_KEY) === "1";
      savedSettings = hasLocalOverride
        ? await persistRemote(savedSettings)
        : await loadRemoteSettings();
      databaseConnected = true;
      localStorage.removeItem(LOCAL_OVERRIDE_KEY);
      cacheSettings(savedSettings);
      setFields(savedSettings);
      applyIdentity(savedSettings);
    } catch (error) {
      databaseConnected = false;
      console.warn("Backend pengaturan belum tersinkron:", databaseMessage(error));
      showToast("Mode lokal aktif. Logo dan pengaturan dapat langsung digunakan.", "success");
      updateDirtyState();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
