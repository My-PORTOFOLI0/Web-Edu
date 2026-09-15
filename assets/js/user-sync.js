(function () {
  "use strict";

  if (window.__EDUSKY_USER_SYNC__) return;
  window.__EDUSKY_USER_SYNC__ = true;

  const SESSION_KEY = "edusky_user";
  const CHANNEL_NAME = "edusky-sync";
  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";

  function readUser() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function initials(name) {
    const words = String(name || "Siswa").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "SW";
    return `${words[0][0] || ""}${words.length > 1 ? words.at(-1)[0] : ""}`.toUpperCase();
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 11) return "Selamat Pagi";
    if (hour < 15) return "Selamat Siang";
    if (hour < 18) return "Selamat Sore";
    return "Selamat Malam";
  }

  function fallbackAvatar(name) {
    const label = initials(name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#38bdf8"/><text x="48" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="white">${label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(element => {
      element.textContent = value;
    });
  }

  function applyUser(user) {
    if (!user) return;
    const name = user.nama_siswa || user.nama || user.username || "Siswa EduSky";
    const firstName = name.split(/\s+/)[0] || name;
    const studentClass = user.kelas || "-";
    const level = user.jenjang || "SD";

    setText("[data-nav-user-name]", name);
    setText("[data-nav-grade]", level);
    setText("[data-student-name]", name);
    setText("[data-student-avatar]", initials(name));
    setText("[data-student-class]", studentClass);
    setText("[data-student-class-title]", studentClass === "-" ? "Kelas Siswa" : `Kelas ${studentClass}`);

    document.querySelectorAll("[data-nav-avatar]").forEach(image => {
      image.src = user.foto || fallbackAvatar(name);
      image.alt = `Foto ${name}`;
    });

    const moduleName = document.getElementById("studentName");
    const moduleAvatar = document.getElementById("studentAvatar");
    const moduleClass = document.getElementById("studentClassBadge");
    if (moduleName) moduleName.textContent = name;
    if (moduleAvatar) moduleAvatar.textContent = initials(name);
    if (moduleClass) moduleClass.textContent = studentClass;

    const homeGreeting = document.getElementById("greeting-text");
    const homeClass = document.getElementById("hero-class-info");
    const homeClassTitle = document.getElementById("class-title");
    const homeProfileClass = document.getElementById("prof-class");
    if (homeGreeting) homeGreeting.textContent = `${greeting()}, ${firstName}!`;
    if (homeClass) homeClass.textContent = [studentClass, user.sekolah].filter(Boolean).join(" | ") || "Kelas belum diatur";
    if (homeClassTitle) homeClassTitle.textContent = studentClass === "-" ? "Kelas belum ditentukan" : `Kelas ${studentClass}`;
    if (homeProfileClass) homeProfileClass.textContent = studentClass === "-" ? "Kelas belum ditentukan" : `Kelas ${studentClass}`;
  }

  function mergeExternalAccount(account) {
    const current = readUser();
    if (!current || !account || String(current.id) !== String(account.id)) return;
    const updated = {
      ...current,
      ...account,
      nama: account.nama_siswa || account.nama || current.nama,
      nama_siswa: account.nama_siswa || account.nama || current.nama_siswa,
      session_token: current.session_token,
      session_expires_at: current.session_expires_at
    };
    delete updated.password_hash;
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    applyUser(updated);
  }

  async function refreshFromDatabase() {
    const current = readUser();
    if (!current?.id || current.isLoggedIn === false) return current;
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_get_akun_siswa`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_id: current.id })
      });
      if (!response.ok) return current;
      const data = await response.json();
      const account = Array.isArray(data) ? data[0] : data;
      if (!account?.id) return current;
      mergeExternalAccount(account);
      return readUser();
    } catch (error) {
      console.warn("Data akun terbaru tidak dapat dimuat:", error);
      return current;
    }
  }

  window.addEventListener("storage", event => {
    if (event.key === SESSION_KEY) applyUser(readUser());
  });

  window.addEventListener("edusky:profile-updated", event => {
    mergeExternalAccount(event.detail);
  });

  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", event => {
        if (event.data?.type === "profile-updated") mergeExternalAccount(event.data.account);
      });
    } catch (error) {
      console.warn("Sinkronisasi profil lintas tab tidak tersedia:", error);
    }
  }

  window.EduSkyUserSync = { apply: applyUser, merge: mergeExternalAccount, refresh: refreshFromDatabase };
  applyUser(readUser());
  refreshFromDatabase();
})();
