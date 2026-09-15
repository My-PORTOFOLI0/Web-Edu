(function () {
  "use strict";

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const LOGIN_PAGE = "../../index.html";
  const SESSION_KEY = "edusky_user";

  const $ = id => document.getElementById(id);
  let client = null;
  let storedUser = readStoredUser();
  let currentAccount = storedUser ? { ...storedUser } : null;
  let pendingPhoto = currentAccount?.foto || "";
  let toastTimer = null;
  let successTimer = null;
  const photoCrop = {
    image: null,
    zoom: 1,
    x: 0,
    y: 0,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startX: 0,
    startY: 0,
    lastFocused: null,
    closeTimer: null
  };

  function readStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (error) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function normalizeObject(data) {
    if (data == null) return null;
    if (typeof data === "string") {
      try {
        return normalizeObject(JSON.parse(data));
      } catch (error) {
        return null;
      }
    }
    if (Array.isArray(data)) return normalizeObject(data[0] || null);
    return typeof data === "object" ? data : null;
  }

  function getInitials(name) {
    const words = String(name || "Siswa").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "SW";
    return `${words[0][0] || ""}${words.length > 1 ? words.at(-1)[0] : ""}`.toUpperCase();
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function shortDate(value) {
    if (!value) return "Belum ada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const difference = Date.now() - date.getTime();
    const days = Math.floor(difference / 86400000);
    if (days <= 0) return "Hari ini";
    if (days === 1) return "Kemarin";
    if (days < 7) return `${days} hari lalu`;
    return formatDate(value);
  }

  function databaseMessage(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "Terjadi kesalahan pada database.");
    const lower = message.toLowerCase();

    if ((code === "PGRST202" || lower.includes("could not find the function")) && lower.includes("admin_")) {
      return "Fungsi CRUD siswa belum tersedia. Jalankan supabase/akunsiswa_setup.sql di Supabase SQL Editor.";
    }
    if (code === "PGRST202" || lower.includes("could not find the function")) {
      return "Fungsi Profil belum tersedia. Jalankan supabase/profil_setup.sql di Supabase SQL Editor.";
    }
    if (code === "28000" || lower.includes("sesi siswa")) {
      return "Sesi profil sudah berakhir. Silakan logout lalu login kembali.";
    }
    if (code === "28P01" || lower.includes("password saat ini")) {
      return "Password saat ini tidak sesuai.";
    }
    if (code === "23505" || lower.includes("duplicate")) {
      return "Username sudah digunakan oleh siswa lain.";
    }
    if (code === "42501" || lower.includes("permission denied")) {
      return "Akses profil ditolak. Jalankan ulang supabase/profil_setup.sql.";
    }
    if (lower.includes("failed to fetch") || lower.includes("load failed")) {
      return "Tidak dapat terhubung ke Supabase. Periksa koneksi internet.";
    }
    return message;
  }

  function showAlert(message, type = "info") {
    const alert = $("profileAlert");
    $("profileAlertText").textContent = message;
    alert.className = `profile-alert ${type}`;
    alert.hidden = false;
  }

  function hideAlert() {
    $("profileAlert").hidden = true;
  }

  function showToast(message, type = "success") {
    const toast = $("profileToast");
    toast.textContent = message;
    toast.className = `profile-toast ${type} show`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function closeSuccessAnimation() {
    const success = $("saveSuccess");
    success.classList.remove("show");
    window.clearTimeout(successTimer);
    window.setTimeout(() => { success.hidden = true; }, 220);
  }

  function showSuccessAnimation(message, compatibilityMode = false) {
    const success = $("saveSuccess");
    $("saveSuccessMessage").textContent = compatibilityMode
      ? `${message} Data profil utama sudah sinkron dengan database, admin, dan halaman siswa lainnya.`
      : `${message} Data sudah sinkron dengan database, admin, dan halaman siswa lainnya.`;
    success.hidden = false;
    window.requestAnimationFrame(() => success.classList.add("show"));
    window.clearTimeout(successTimer);
    successTimer = window.setTimeout(closeSuccessAnimation, 3200);
  }

  function broadcastProfileUpdate(account) {
    const payload = {
      type: "profile-updated",
      account,
      studentId: account.id,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem("edusky_profile_updated", JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("edusky:profile-updated", { detail: account }));

    if ("BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel("edusky-sync");
        channel.postMessage(payload);
        channel.close();
      } catch (error) {
        console.warn("Perubahan profil tidak dapat disiarkan ke tab lain:", error);
      }
    }
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    if (!button.dataset.defaultHtml) button.dataset.defaultHtml = button.innerHTML;
    button.disabled = loading;
    button.innerHTML = loading
      ? `<i class="fas fa-spinner fa-spin"></i><span>${loadingText}</span>`
      : button.dataset.defaultHtml;
  }

  function preferencesOf(account) {
    let preferences = account?.preferensi;
    if (typeof preferences === "string") {
      try { preferences = JSON.parse(preferences); } catch (error) { preferences = null; }
    }
    return {
      tema: ["light", "dark", "system"].includes(preferences?.tema) ? preferences.tema : "light",
      notifikasi: preferences?.notifikasi !== false,
      suara: preferences?.suara !== false
    };
  }

  function selectedPreferences() {
    return {
      tema: $("themePreference").value,
      notifikasi: $("notificationPreference").checked,
      suara: $("soundPreference").checked
    };
  }

  function applyTheme(theme) {
    const dark = theme === "dark" || (
      theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    );
    const resolvedTheme = dark ? "dark" : "light";
    const themeColor = document.querySelector('meta[name="theme-color"]');

    document.body.toggleAttribute("data-theme", dark);
    if (dark) document.body.setAttribute("data-theme", "dark");
    document.documentElement.dataset.theme = resolvedTheme;
    themeColor?.setAttribute("content", dark ? "#07131f" : "#f4f8fc");
    localStorage.setItem("edusky_theme", dark ? "dark" : "light");
  }

  function setPhoto(photo, name) {
    const image = $("profilePhoto");
    const initials = $("profileInitials");
    initials.textContent = getInitials(name);

    if (!photo) {
      image.hidden = true;
      image.removeAttribute("src");
      initials.hidden = false;
      return;
    }

    image.onload = () => {
      image.hidden = false;
      initials.hidden = true;
    };
    image.onerror = () => {
      image.hidden = true;
      initials.hidden = false;
    };
    image.src = photo;
  }

  function completedModuleCount() {
    let count = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (key.startsWith("edusky_modul_progress_") && Number(localStorage.getItem(key)) >= 100) {
        count += 1;
      }
    }
    return count;
  }

  function populate(account) {
    if (!account) return;
    currentAccount = { ...currentAccount, ...account };
    pendingPhoto = currentAccount.foto || "";

    const name = currentAccount.nama_siswa || currentAccount.nama || currentAccount.username || "Siswa EduSky";
    const username = currentAccount.username || "siswa";
    const status = String(currentAccount.status || "aktif").toLowerCase();
    const preferences = preferencesOf(currentAccount);
    const savedTheme = localStorage.getItem("edusky_theme");
    const activeTheme = ["light", "dark"].includes(savedTheme)
      ? savedTheme
      : preferences.tema;

    $("overviewName").textContent = name;
    $("overviewUsername").textContent = `@${username}`;
    $("overviewNis").textContent = currentAccount.nis || "-";
    $("overviewLevel").textContent = currentAccount.jenjang || "-";
    $("overviewClass").textContent = currentAccount.kelas || "-";
    $("profileName").value = name;
    $("profileUsername").value = username;
    $("profileNis").value = currentAccount.nis || "-";
    $("profileLevel").value = currentAccount.jenjang || "-";
    $("profileClass").value = currentAccount.kelas || "-";
    $("profileSchool").value = currentAccount.sekolah || "Belum diatur";
    $("themePreference").value = activeTheme;
    $("notificationPreference").checked = preferences.notifikasi;
    $("soundPreference").checked = preferences.suara;

    const statusElement = $("accountStatus");
    statusElement.classList.toggle("active", status === "aktif");
    statusElement.innerHTML = `<i class="fas fa-circle"></i> ${status === "aktif" ? "Aktif" : "Nonaktif"}`;
    $("detailStatus").textContent = status === "aktif" ? "Aktif" : "Nonaktif";
    $("lastLoginShort").textContent = shortDate(currentAccount.terakhir_login);
    $("detailLastLogin").textContent = formatDate(currentAccount.terakhir_login, true);
    $("detailCreatedAt").textContent = formatDate(currentAccount.created_at);
    $("detailUpdatedAt").textContent = formatDate(currentAccount.updated_at, true);
    $("completedModules").textContent = String(completedModuleCount());

    const completenessFields = [
      name,
      username,
      currentAccount.nis,
      currentAccount.jenjang,
      currentAccount.kelas,
      currentAccount.sekolah,
      currentAccount.foto
    ];
    const percentage = Math.round(completenessFields.filter(Boolean).length / completenessFields.length * 100);
    $("profilePercent").textContent = `${percentage}%`;
    $("profileProgress").style.width = `${percentage}%`;
    setPhoto(pendingPhoto, name);
    applyTheme(activeTheme);
    $("photoNote").hidden = true;
  }

  function updateLocalSession(account) {
    const updated = {
      ...storedUser,
      ...account,
      nama: account.nama_siswa || account.nama || storedUser.nama,
      nama_siswa: account.nama_siswa || account.nama || storedUser.nama_siswa,
      session_token: storedUser.session_token,
      session_expires_at: storedUser.session_expires_at,
      isLoggedIn: true,
      source: "supabase-akunsiswa"
    };
    delete updated.password_hash;
    storedUser = updated;
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));

    document.querySelectorAll("[data-nav-user-name]").forEach(element => {
      element.textContent = updated.nama_siswa || updated.username || "Siswa";
    });
    document.querySelectorAll("[data-nav-grade]").forEach(element => {
      element.textContent = updated.jenjang || "SD";
    });
    document.querySelectorAll("[data-nav-avatar]").forEach(element => {
      if (updated.foto) element.src = updated.foto;
    });

    window.EduSkyUserSync?.apply(updated);
  }

  function hasSecureSession() {
    if (!storedUser?.session_token) {
      showAlert(
        "Sesi profil aman belum tersedia. Jalankan supabase/profil_setup.sql, lalu logout dan login kembali sebelum menyimpan perubahan.",
        "warning"
      );
      return false;
    }
    return true;
  }

  async function callRpc(name, parameters) {
    const { data, error } = await client.rpc(name, parameters);
    if (error) throw error;
    return normalizeObject(data) ?? data;
  }

  function isMissingRpc(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();
    return code === "PGRST202" || message.includes("could not find the function");
  }

  async function getAccountFromDatabase() {
    if (storedUser?.session_token) {
      try {
        const account = await callRpc("siswa_get_profil", {
          p_id: storedUser.id,
          p_session_token: storedUser.session_token
        });
        return { account, compatibilityMode: false };
      } catch (error) {
        if (!isMissingRpc(error)) throw error;
      }
    }

    const account = await callRpc("admin_get_akun_siswa", { p_id: storedUser.id });
    if (!account?.id) throw new Error("Data siswa tidak ditemukan di database.");
    return {
      account: { ...account, preferensi: preferencesOf(currentAccount) },
      compatibilityMode: true
    };
  }

  async function updateAccountInDatabase(name, username, preferences) {
    if (storedUser?.session_token) {
      try {
        const account = await callRpc("siswa_update_profil", {
          p_id: storedUser.id,
          p_session_token: storedUser.session_token,
          p_nama_siswa: name,
          p_username: username,
          p_foto: pendingPhoto || null,
          p_preferensi: preferences
        });
        return { account, compatibilityMode: false };
      } catch (error) {
        if (!isMissingRpc(error)) throw error;
      }
    }

    const account = await callRpc("admin_update_akun_siswa", {
      p_id: storedUser.id,
      p_nis: currentAccount?.nis || storedUser.nis,
      p_username: username,
      p_password: null,
      p_nama_siswa: name,
      p_jenjang: currentAccount?.jenjang || storedUser.jenjang || "SD",
      p_kelas: currentAccount?.kelas || storedUser.kelas || null,
      p_sekolah: currentAccount?.sekolah || storedUser.sekolah || null,
      p_foto: pendingPhoto || null,
      p_status: currentAccount?.status || storedUser.status || "aktif"
    });
    if (!account?.id) throw new Error("Data siswa tidak ditemukan di database.");

    return {
      account: { ...account, preferensi: preferences },
      compatibilityMode: true
    };
  }

  async function saveAccount(button, successMessage) {
    const name = $("profileName").value.trim();
    const username = $("profileUsername").value.trim();

    document.querySelectorAll(".input-wrap.invalid").forEach(element => element.classList.remove("invalid"));
    if (!name) {
      $("profileName").closest(".input-wrap").classList.add("invalid");
      $("profileName").focus();
      showToast("Nama lengkap wajib diisi.", "error");
      return null;
    }
    if (username.length < 3 || /\s/.test(username)) {
      $("profileUsername").closest(".input-wrap").classList.add("invalid");
      $("profileUsername").focus();
      showToast("Username minimal 3 karakter tanpa spasi.", "error");
      return null;
    }

    setButtonLoading(button, true, "Menyimpan...");
    try {
      const result = await updateAccountInDatabase(name, username, selectedPreferences());
      const { account, compatibilityMode } = result;
      updateLocalSession(account);
      populate(account);
      broadcastProfileUpdate(account);
      if (compatibilityMode) {
        showAlert(
          "Perubahan profil utama sudah tersimpan ke database. Jalankan supabase/profil_setup.sql agar preferensi juga tersimpan lintas perangkat dan keamanan sesi aktif.",
          "info"
        );
      } else {
        hideAlert();
      }
      showToast(successMessage, "success");
      showSuccessAnimation(successMessage, compatibilityMode);
      return account;
    } catch (error) {
      const message = databaseMessage(error);
      showAlert(message, error?.code === "28000" ? "warning" : "error");
      showToast(message, "error");
      return null;
    } finally {
      setButtonLoading(button, false);
    }
  }

  function loadPhotoFile(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        reject(new Error("Gunakan foto JPG, PNG, atau WebP."));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error("Ukuran foto maksimal 5 MB."));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Foto tidak dapat dibaca."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Format foto tidak valid."));
        image.onload = () => resolve(image);
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function cropScale() {
    const canvas = $("photoCropCanvas");
    if (!photoCrop.image) return 1;
    const minimum = Math.max(
      canvas.width / photoCrop.image.naturalWidth,
      canvas.height / photoCrop.image.naturalHeight
    );
    return minimum * photoCrop.zoom;
  }

  function clampPhotoPosition() {
    if (!photoCrop.image) return;
    const canvas = $("photoCropCanvas");
    const scale = cropScale();
    const width = photoCrop.image.naturalWidth * scale;
    const height = photoCrop.image.naturalHeight * scale;
    const maximumX = Math.max(0, (width - canvas.width) / 2);
    const maximumY = Math.max(0, (height - canvas.height) / 2);
    photoCrop.x = Math.max(-maximumX, Math.min(maximumX, photoCrop.x));
    photoCrop.y = Math.max(-maximumY, Math.min(maximumY, photoCrop.y));
  }

  function drawPhotoCrop() {
    if (!photoCrop.image) return;
    const canvas = $("photoCropCanvas");
    const context = canvas.getContext("2d");
    const scale = cropScale();
    const width = photoCrop.image.naturalWidth * scale;
    const height = photoCrop.image.naturalHeight * scale;
    clampPhotoPosition();

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      photoCrop.image,
      (canvas.width - width) / 2 + photoCrop.x,
      (canvas.height - height) / 2 + photoCrop.y,
      width,
      height
    );
  }

  function setPhotoZoom(value) {
    const previousZoom = photoCrop.zoom || 1;
    const nextZoom = Math.max(1, Math.min(3, Number(value) || 1));
    const ratio = nextZoom / previousZoom;
    photoCrop.zoom = nextZoom;
    photoCrop.x *= ratio;
    photoCrop.y *= ratio;
    $("photoZoom").value = String(nextZoom);
    $("photoZoomValue").textContent = `${Math.round(nextZoom * 100)}%`;
    drawPhotoCrop();
  }

  function resetPhotoCrop() {
    photoCrop.zoom = 1;
    photoCrop.x = 0;
    photoCrop.y = 0;
    $("photoZoom").value = "1";
    $("photoZoomValue").textContent = "100%";
    drawPhotoCrop();
  }

  function movePhotoCrop(deltaX, deltaY) {
    photoCrop.x += deltaX;
    photoCrop.y += deltaY;
    drawPhotoCrop();
  }

  function closePhotoEditor() {
    const editor = $("photoEditor");
    if (editor.hidden) return;
    editor.classList.remove("open");
    document.body.classList.remove("photo-editor-open");
    window.clearTimeout(photoCrop.closeTimer);
    photoCrop.closeTimer = window.setTimeout(() => {
      editor.hidden = true;
      photoCrop.image = null;
      photoCrop.pointerId = null;
    }, 220);
    photoCrop.lastFocused?.focus?.();
  }

  async function openPhotoEditor(file) {
    const image = await loadPhotoFile(file);
    const editor = $("photoEditor");
    window.clearTimeout(photoCrop.closeTimer);
    photoCrop.image = image;
    photoCrop.lastFocused = document.activeElement;
    resetPhotoCrop();
    editor.hidden = false;
    document.body.classList.add("photo-editor-open");
    window.requestAnimationFrame(() => {
      editor.classList.add("open");
      $("photoCropCanvas").focus();
      drawPhotoCrop();
    });
  }

  async function applyPhotoCrop() {
    if (!photoCrop.image) return;
    drawPhotoCrop();
    const croppedPhoto = $("photoCropCanvas").toDataURL("image/jpeg", 0.86);
    if (croppedPhoto.length > 680000) {
      showToast("Hasil foto terlalu besar. Coba gunakan foto lain.", "error");
      return;
    }

    const previousPhoto = pendingPhoto;
    const button = $("applyPhotoCrop");
    pendingPhoto = croppedPhoto;
    setButtonLoading(button, true, "Menyimpan...");

    try {
      const name = currentAccount?.nama_siswa || currentAccount?.nama || storedUser.nama_siswa || storedUser.username;
      const username = currentAccount?.username || storedUser.username;
      const { account, compatibilityMode } = await updateAccountInDatabase(
        name,
        username,
        preferencesOf(currentAccount)
      );

      updateLocalSession(account);
      populate(account);
      broadcastProfileUpdate(account);
      closePhotoEditor();

      if (compatibilityMode) {
        showAlert("Foto profil sudah tersimpan permanen ke database Supabase.", "info");
      } else {
        hideAlert();
      }
      showToast("Foto profil berhasil disimpan ke database.");
      showSuccessAnimation("Foto profil berhasil disimpan.", compatibilityMode);
    } catch (error) {
      pendingPhoto = previousPhoto;
      const message = databaseMessage(error);
      showAlert(message, "error");
      showToast(message, "error");
    } finally {
      setButtonLoading(button, false);
    }
  }

  function bindPhotoEditor() {
    const stage = $("photoCropStage");
    const canvas = $("photoCropCanvas");
    const finishPointer = event => {
      if (photoCrop.pointerId !== event.pointerId) return;
      photoCrop.pointerId = null;
      stage.classList.remove("dragging");
      if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    };

    stage.addEventListener("pointerdown", event => {
      if (!photoCrop.image) return;
      photoCrop.pointerId = event.pointerId;
      photoCrop.startClientX = event.clientX;
      photoCrop.startClientY = event.clientY;
      photoCrop.startX = photoCrop.x;
      photoCrop.startY = photoCrop.y;
      stage.classList.add("dragging");
      stage.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    stage.addEventListener("pointermove", event => {
      if (photoCrop.pointerId !== event.pointerId) return;
      const rectangle = canvas.getBoundingClientRect();
      const ratio = canvas.width / rectangle.width;
      photoCrop.x = photoCrop.startX + (event.clientX - photoCrop.startClientX) * ratio;
      photoCrop.y = photoCrop.startY + (event.clientY - photoCrop.startClientY) * ratio;
      drawPhotoCrop();
      event.preventDefault();
    });
    stage.addEventListener("pointerup", finishPointer);
    stage.addEventListener("pointercancel", finishPointer);

    stage.addEventListener("wheel", event => {
      if (!photoCrop.image) return;
      event.preventDefault();
      setPhotoZoom(photoCrop.zoom + (event.deltaY < 0 ? 0.08 : -0.08));
    }, { passive: false });

    canvas.addEventListener("keydown", event => {
      const movements = {
        ArrowLeft: [event.shiftKey ? -18 : -6, 0],
        ArrowRight: [event.shiftKey ? 18 : 6, 0],
        ArrowUp: [0, event.shiftKey ? -18 : -6],
        ArrowDown: [0, event.shiftKey ? 18 : 6]
      };
      if (!movements[event.key]) return;
      event.preventDefault();
      movePhotoCrop(...movements[event.key]);
    });

    $("photoZoom").addEventListener("input", event => setPhotoZoom(event.target.value));
    $("photoZoomOut").addEventListener("click", () => setPhotoZoom(photoCrop.zoom - 0.1));
    $("photoZoomIn").addEventListener("click", () => setPhotoZoom(photoCrop.zoom + 0.1));
    $("resetPhotoPosition").addEventListener("click", resetPhotoCrop);
    $("applyPhotoCrop").addEventListener("click", applyPhotoCrop);
    $("closePhotoEditor").addEventListener("click", closePhotoEditor);
    $("closePhotoEditorBackdrop").addEventListener("click", closePhotoEditor);
    $("cancelPhotoEditor").addEventListener("click", closePhotoEditor);

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !$("photoEditor").hidden) closePhotoEditor();
    });
  }

  async function loadProfile() {
    populate(currentAccount);

    try {
      const { account, compatibilityMode } = await getAccountFromDatabase();
      updateLocalSession(account);
      populate(account);
      if (compatibilityMode) {
        showAlert(
          "Mode kompatibilitas aktif: profil utama dapat disimpan ke database. Jalankan supabase/profil_setup.sql lalu login ulang untuk sinkronisasi preferensi dan keamanan sesi.",
          "info"
        );
      } else {
        hideAlert();
      }
    } catch (error) {
      showAlert(databaseMessage(error), error?.code === "28000" ? "warning" : "error");
    }
  }

  function bindEvents() {
    const tabs = Array.from(document.querySelectorAll("[data-profile-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-profile-panel]"));

    function openProfilePanel(name, updateHash = true) {
      const selected = panels.find(panel => panel.dataset.profilePanel === name) ? name : "personal";
      tabs.forEach(tab => {
        const active = tab.dataset.profileTab === selected;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      panels.forEach(panel => {
        const active = panel.dataset.profilePanel === selected;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
      });
      if (updateHash) history.replaceState(null, "", `#${selected}`);
    }

    tabs.forEach(tab => {
      tab.addEventListener("click", () => openProfilePanel(tab.dataset.profileTab));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        const target = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
        target.focus();
        target.click();
      });
    });
    openProfilePanel(location.hash.replace("#", ""), false);

    $("closeProfileAlert").addEventListener("click", hideAlert);
    $("closeSaveSuccess").addEventListener("click", closeSuccessAnimation);
    $("saveSuccess").querySelector(".save-success-backdrop").addEventListener("click", closeSuccessAnimation);
    $("profileForm").addEventListener("submit", event => {
      event.preventDefault();
      saveAccount($("saveProfile"), "Profil berhasil diperbarui.");
    });
    $("savePreferences").addEventListener("click", () => {
      saveAccount($("savePreferences"), "Preferensi berhasil disimpan.");
    });
    $("resetProfile").addEventListener("click", () => populate(currentAccount));
    $("themePreference").addEventListener("change", event => applyTheme(event.target.value));
    bindPhotoEditor();

    $("profilePhotoInput").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await openPhotoEditor(file);
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        event.target.value = "";
      }
    });

    $("removePhoto").addEventListener("click", () => {
      pendingPhoto = "";
      setPhoto("", $("profileName").value);
      $("photoNote").hidden = false;
      $("photoNote").querySelector("span").textContent = "Foto akan dihapus setelah perubahan disimpan.";
    });

    document.querySelectorAll(".toggle-password").forEach(button => {
      button.addEventListener("click", () => {
        const input = button.parentElement.querySelector("input");
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.innerHTML = `<i class="far fa-${visible ? "eye" : "eye-slash"}"></i>`;
        button.setAttribute("aria-label", visible ? "Tampilkan password" : "Sembunyikan password");
      });
    });

    $("newPassword").addEventListener("input", event => {
      const value = event.target.value;
      let score = 0;
      if (value.length >= 6) score += 1;
      if (value.length >= 10) score += 1;
      if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
      if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
      const widths = [0, 25, 50, 75, 100];
      const colors = ["#ef4444", "#ef4444", "#f59e0b", "#38bdf8", "#16a56a"];
      const labels = ["Minimal 6 karakter.", "Lemah", "Cukup", "Baik", "Kuat"];
      $("passwordStrengthBar").style.width = `${widths[score]}%`;
      $("passwordStrengthBar").style.background = colors[score];
      $("passwordStrengthText").textContent = labels[score];
    });

    $("passwordForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (!hasSecureSession()) return;
      const currentPassword = $("currentPassword").value;
      const newPassword = $("newPassword").value;
      const confirmation = $("confirmPassword").value;
      if (!currentPassword || newPassword.length < 6) {
        showToast("Lengkapi password saat ini dan password baru minimal 6 karakter.", "error");
        return;
      }
      if (newPassword !== confirmation) {
        showToast("Konfirmasi password baru tidak sama.", "error");
        $("confirmPassword").focus();
        return;
      }

      const button = $("changePassword");
      setButtonLoading(button, true, "Memperbarui...");
      try {
        await callRpc("siswa_change_password", {
          p_id: storedUser.id,
          p_session_token: storedUser.session_token,
          p_current_password: currentPassword,
          p_new_password: newPassword
        });
        event.target.reset();
        $("passwordStrengthBar").style.width = "0";
        $("passwordStrengthText").textContent = "Minimal 6 karakter.";
        showToast("Password berhasil diperbarui.");
      } catch (error) {
        showToast(databaseMessage(error), "error");
      } finally {
        setButtonLoading(button, false);
      }
    });

    $("logoutButton").addEventListener("click", async () => {
      const confirmed = window.EduSkyLogoutConfirm
        ? await window.EduSkyLogoutConfirm.ask({
            title: "Yakin ingin keluar?",
            message: "Sesi belajarmu akan diakhiri. Kamu harus login kembali untuk membuka akun EduSky.",
            confirmLabel: "Ya, Logout"
          })
        : window.confirm("Apakah kamu yakin ingin logout?");
      if (!confirmed) return;

      const button = $("logoutButton");
      setButtonLoading(button, true, "Keluar...");
      try {
        if (client && storedUser?.session_token) {
          await client.rpc("siswa_logout", {
            p_id: storedUser.id,
            p_session_token: storedUser.session_token
          });
        }
      } catch (error) {
        console.warn("Sesi database tidak dapat dicabut:", error);
      } finally {
        localStorage.removeItem(SESSION_KEY);
        window.location.replace(LOGIN_PAGE);
      }
    });

    $("logoutAllButton").addEventListener("click", async () => {
      if (!hasSecureSession()) return;
      const confirmed = window.EduSkyLogoutConfirm
        ? await window.EduSkyLogoutConfirm.ask({
            title: "Keluar dari semua perangkat?",
            message: "Seluruh sesi akunmu akan diakhiri, termasuk perangkat lain yang sedang digunakan.",
            confirmLabel: "Ya, Keluar Semua",
            allDevices: true
          })
        : window.confirm("Keluar dari semua perangkat?");
      if (!confirmed) return;

      const button = $("logoutAllButton");
      setButtonLoading(button, true, "Mengakhiri sesi...");
      try {
        await callRpc("siswa_logout_semua", {
          p_id: storedUser.id,
          p_session_token: storedUser.session_token
        });
        localStorage.removeItem(SESSION_KEY);
        window.location.replace(LOGIN_PAGE);
      } catch (error) {
        showToast(databaseMessage(error), "error");
        setButtonLoading(button, false);
      }
    });
  }

  async function initialize() {
    if (!storedUser?.id || storedUser.isLoggedIn === false) {
      window.location.replace(LOGIN_PAGE);
      return;
    }

    applyTheme(localStorage.getItem("edusky_theme") === "dark" ? "dark" : "light");
    bindEvents();
    try {
      if (!window.supabase?.createClient) throw new Error("Library Supabase tidak tersedia.");
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      await loadProfile();
    } catch (error) {
      populate(currentAccount);
      showAlert(databaseMessage(error), "error");
    } finally {
      $("profileLoader").classList.add("hidden");
    }
  }

  initialize();
})();
