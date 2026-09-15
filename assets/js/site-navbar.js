(function () {
  "use strict";

  const nav = document.querySelector(".site-navbar");
  if (!nav) return;

  const menu = nav.querySelector(".nav-menu");
  const overlay = nav.querySelector(".mobile-menu-overlay");
  const openButton = nav.querySelector(".mobile-menu-btn");
  const closeButton = nav.querySelector(".close-mobile-menu");

  function openMenu() {
    menu?.classList.add("open");
    overlay?.classList.add("open");
    openButton?.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menu?.classList.remove("open");
    overlay?.classList.remove("open");
    openButton?.setAttribute("aria-expanded", "false");
  }

  openButton?.addEventListener("click", openMenu);
  closeButton?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);
  menu?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  try {
    const user = JSON.parse(localStorage.getItem("edusky_user") || "null");
    const name = user?.nama_siswa || user?.nama || user?.username || "Siswa";
    const grade = user?.jenjang || "SD";
    const avatar = user?.foto || `https://placehold.co/80x80/38BDF8/FFFFFF?text=${encodeURIComponent(name.charAt(0).toUpperCase())}`;

    nav.querySelectorAll("[data-nav-user-name]").forEach(element => {
      element.textContent = name;
    });
    nav.querySelectorAll("[data-nav-grade]").forEach(element => {
      element.textContent = grade;
    });
    nav.querySelectorAll("[data-nav-avatar]").forEach(element => {
      element.src = avatar;
      element.alt = `Foto ${name}`;
    });
  } catch (error) {
    console.warn("Profil navbar tidak dapat dimuat:", error);
  }
})();
