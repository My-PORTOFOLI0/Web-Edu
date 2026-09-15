(function () {
  "use strict";

  if (window.EduSkyNotifications) return;

  const STORAGE_KEY = "edusky_notifications";
  const defaults = [
    {
      id: "module-latest",
      title: "Modul pembelajaran tersedia",
      description: "Buka katalog Modul untuk melihat materi PDF dan video terbaru.",
      time: "Hari ini",
      type: "primary",
      destination: "modul",
      read: false
    },
    {
      id: "task-reminder",
      title: "Jangan lupa belajar",
      description: "Periksa jadwal kelas dan selesaikan aktivitas belajarmu hari ini.",
      time: "Hari ini",
      type: "warning",
      destination: "kelas",
      read: false
    },
    {
      id: "profile-security",
      title: "Lengkapi profilmu",
      description: "Pastikan nama, foto, dan keamanan akun sudah diperbarui.",
      time: "2 hari lalu",
      type: "success",
      destination: "profil",
      read: false
    }
  ];

  let notifications = readNotifications();

  function readNotifications() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) return saved.filter(item => item && item.id);
    } catch (error) {
      console.warn("Notifikasi tersimpan tidak dapat dibaca:", error);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults.map(item => ({ ...item }));
  }

  function saveNotifications() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function destinationUrl(destination) {
    const pages = {
      home: "../home/index.html",
      modul: "../modul/index.html",
      kelas: "../kelas/index.html",
      profil: "../profil/index.html"
    };
    return pages[destination] || pages.home;
  }

  const overlay = document.createElement("div");
  overlay.className = "site-notification-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const panel = document.createElement("aside");
  panel.className = "site-notification-panel";
  panel.id = "siteNotificationPanel";
  panel.setAttribute("aria-label", "Notifikasi siswa");
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <header class="site-notification-header">
      <div class="site-notification-title">
        <span><i class="far fa-bell"></i></span>
        <div><h2>Notifikasi</h2><p id="siteNotificationSubtitle">Informasi belajar terbaru</p></div>
      </div>
      <button class="site-notification-close" type="button" aria-label="Tutup notifikasi">&times;</button>
    </header>
    <div class="site-notification-toolbar">
      <span id="siteNotificationSummary">0 belum dibaca</span>
      <button type="button" id="siteMarkAllRead"><i class="fas fa-check-double"></i> Tandai semua dibaca</button>
    </div>
    <div class="site-notification-list" id="siteNotificationList"></div>
    <footer class="site-notification-footer">Notifikasi tersimpan di perangkat ini dan dapat dibuka dari seluruh halaman siswa.</footer>
  `;

  document.body.append(overlay, panel);

  const list = panel.querySelector("#siteNotificationList");
  const summary = panel.querySelector("#siteNotificationSummary");
  const markAllButton = panel.querySelector("#siteMarkAllRead");

  function iconFor(type) {
    if (type === "danger") return "fa-triangle-exclamation";
    if (type === "success") return "fa-check";
    if (type === "warning") return "fa-clock";
    return "fa-info";
  }

  function updateBadges() {
    const unread = notifications.filter(item => !item.read).length;
    document.querySelectorAll(".notification-badge").forEach(badge => {
      badge.textContent = String(unread);
      badge.hidden = unread === 0;
    });
    document.querySelectorAll(".student-welcome-notification-dot").forEach(dot => {
      dot.hidden = unread === 0;
    });
    summary.textContent = unread ? `${unread} belum dibaca` : "Semua sudah dibaca";
    markAllButton.hidden = unread === 0;
  }

  function render() {
    if (!notifications.length) {
      list.innerHTML = `
        <div class="site-notification-empty">
          <i class="far fa-bell-slash"></i>
          <strong>Belum ada notifikasi</strong>
          <p>Informasi modul, kelas, dan akun akan muncul di sini.</p>
        </div>`;
      updateBadges();
      return;
    }

    list.innerHTML = notifications.map(item => `
      <article class="site-notification-item ${item.read ? "" : "unread"}" data-notification-id="${escapeHtml(item.id)}">
        <span class="site-notification-icon ${escapeHtml(item.type)}"><i class="fas ${iconFor(item.type)}"></i></span>
        <a class="site-notification-copy" href="${destinationUrl(item.destination)}" data-notification-open="${escapeHtml(item.id)}">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description || item.desc)}</p>
          <span class="site-notification-time"><i class="far fa-clock"></i> ${escapeHtml(item.time)}</span>
        </a>
        <button class="site-notification-dismiss" type="button" data-notification-dismiss="${escapeHtml(item.id)}" aria-label="Hapus notifikasi"><i class="fas fa-times"></i></button>
      </article>
    `).join("");
    updateBadges();
  }

  function open() {
    panel.classList.add("open");
    overlay.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("site-notifications-open");
    panel.querySelector(".site-notification-close").focus();
  }

  function close() {
    panel.classList.remove("open");
    overlay.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("site-notifications-open");
  }

  function markRead(id) {
    const item = notifications.find(notification => String(notification.id) === String(id));
    if (item) item.read = true;
    saveNotifications();
    render();
  }

  function setDefaults(items) {
    if (!Array.isArray(items)) return;
    const existing = new Map(notifications.map(item => [String(item.id), item]));
    items.forEach(item => {
      const id = String(item.id);
      if (!existing.has(id)) {
        notifications.push({
          id,
          title: item.title,
          description: item.description || item.desc,
          time: item.time || "Baru saja",
          type: item.type || "primary",
          destination: item.destination || "home",
          read: Boolean(item.read)
        });
      }
    });
    saveNotifications();
    render();
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest(".notification-btn, .notification-button, #notif-toggle, [data-student-notifications]");
    if (trigger && !panel.contains(trigger)) {
      event.preventDefault();
      open();
      return;
    }

    const openItem = event.target.closest("[data-notification-open]");
    if (openItem) markRead(openItem.dataset.notificationOpen);

    const dismiss = event.target.closest("[data-notification-dismiss]");
    if (dismiss) {
      event.preventDefault();
      notifications = notifications.filter(item => String(item.id) !== dismiss.dataset.notificationDismiss);
      saveNotifications();
      render();
    }
  });

  panel.querySelector(".site-notification-close").addEventListener("click", close);
  overlay.addEventListener("click", close);
  markAllButton.addEventListener("click", () => {
    notifications.forEach(item => { item.read = true; });
    saveNotifications();
    render();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel.classList.contains("open")) close();
  });

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    notifications = readNotifications();
    render();
  });

  window.EduSkyNotifications = { open, close, render, setDefaults };
  render();
})();
