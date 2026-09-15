(function () {
  "use strict";

  const headers = document.querySelectorAll(".student-welcome");
  if (!headers.length) return;

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("edusky_user") || "null") || {};
    } catch (error) {
      console.warn("Data siswa pada header tidak dapat dibaca:", error);
      return {};
    }
  }

  function getInitials(name) {
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "SW";
    return `${words[0][0] || ""}${words.length > 1 ? words.at(-1)[0] : ""}`.toUpperCase();
  }

  const user = getUser();
  const name = user.nama_siswa || user.nama || user.username || "Siswa EduSky";
  const studentClass = user.kelas || user.jenjang || "-";

  if (localStorage.getItem("edusky_theme") === "dark") {
    document.body.setAttribute("data-theme", "dark");
  }

  document.querySelectorAll("[data-student-class-title]").forEach(element => {
    element.textContent = studentClass === "-" ? "Kelas Siswa" : `Kelas ${studentClass}`;
  });

  headers.forEach(header => {
    header.querySelectorAll("[data-student-name]").forEach(element => {
      element.textContent = name;
    });
    header.querySelectorAll("[data-student-avatar]").forEach(element => {
      element.textContent = getInitials(name);
    });
    header.querySelectorAll("[data-student-class]").forEach(element => {
      element.textContent = studentClass;
    });

    const themeButton = header.querySelector("[data-student-theme]");
    const syncThemeButton = () => {
      themeButton?.setAttribute(
        "aria-pressed",
        String(document.body.getAttribute("data-theme") === "dark")
      );
    };

    themeButton?.addEventListener("click", () => {
      const dark = document.body.getAttribute("data-theme") !== "dark";
      document.body.toggleAttribute("data-theme", dark);
      if (dark) document.body.setAttribute("data-theme", "dark");
      localStorage.setItem("edusky_theme", dark ? "dark" : "light");

      const existingToggle = document.getElementById("theme-toggle");
      if (existingToggle) existingToggle.checked = dark;
      syncThemeButton();
    });
    syncThemeButton();

    header.querySelector("[data-student-notifications]")?.addEventListener("click", () => {
      if (window.EduSkyNotifications?.open) {
        window.EduSkyNotifications.open();
        return;
      }

      const existingButton = document.getElementById("notif-toggle");
      if (existingButton) {
        existingButton.click();
        return;
      }

      const destination = header.dataset.notificationHref;
      if (destination) window.location.assign(destination);
    });
  });
})();
