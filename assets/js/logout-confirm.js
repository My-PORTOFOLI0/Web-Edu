(function () {
  "use strict";

  if (window.EduSkyLogoutConfirm) return;

  let activeResolve = null;
  let lastFocused = null;
  let closeTimer = null;

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "logout-confirm-modal";
    modal.id = "logoutConfirmModal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "logoutConfirmTitle");
    modal.setAttribute("aria-describedby", "logoutConfirmMessage");
    modal.innerHTML = `
      <button class="logout-confirm-backdrop" type="button" data-logout-cancel aria-label="Batalkan logout"></button>
      <section class="logout-confirm-card">
        <div class="logout-confirm-icon" id="logoutConfirmIcon" aria-hidden="true">
          <i class="fas fa-right-from-bracket"></i>
        </div>
        <span class="logout-confirm-kicker">Konfirmasi keamanan</span>
        <h2 id="logoutConfirmTitle">Yakin ingin keluar?</h2>
        <p id="logoutConfirmMessage">Kamu harus login kembali untuk mengakses akun ini.</p>
        <div class="logout-confirm-actions">
          <button class="logout-confirm-cancel" type="button" data-logout-cancel>Tetap di sini</button>
          <button class="logout-confirm-submit" id="logoutConfirmSubmit" type="button">
            <i class="fas fa-right-from-bracket"></i><span>Ya, Logout</span>
          </button>
        </div>
      </section>`;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-logout-cancel]").forEach(button => {
      button.addEventListener("click", () => finish(false));
    });
    modal.querySelector("#logoutConfirmSubmit").addEventListener("click", () => finish(true));
    return modal;
  }

  function getModal() {
    return document.getElementById("logoutConfirmModal") || createModal();
  }

  function finish(confirmed) {
    const modal = getModal();
    if (!activeResolve) return;
    const resolve = activeResolve;
    activeResolve = null;
    modal.classList.remove("show");
    document.body.classList.remove("logout-confirm-open");
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      modal.hidden = true;
    }, 220);
    lastFocused?.focus?.();
    resolve(confirmed);
  }

  function ask(options = {}) {
    if (activeResolve) return Promise.resolve(false);
    const modal = getModal();
    const allDevices = options.allDevices === true;
    window.clearTimeout(closeTimer);
    lastFocused = document.activeElement;

    modal.querySelector("#logoutConfirmTitle").textContent = options.title || "Yakin ingin keluar?";
    modal.querySelector("#logoutConfirmMessage").textContent = options.message || "Kamu harus login kembali untuk mengakses akun ini.";
    modal.querySelector("#logoutConfirmSubmit span").textContent = options.confirmLabel || "Ya, Logout";
    modal.querySelector("#logoutConfirmIcon").classList.toggle("all-devices", allDevices);
    modal.querySelector("#logoutConfirmIcon i").className = allDevices
      ? "fas fa-user-lock"
      : "fas fa-right-from-bracket";
    modal.querySelector("#logoutConfirmSubmit i").className = allDevices
      ? "fas fa-user-lock"
      : "fas fa-right-from-bracket";

    modal.hidden = false;
    document.body.classList.add("logout-confirm-open");

    return new Promise(resolve => {
      activeResolve = resolve;
      window.requestAnimationFrame(() => {
        modal.classList.add("show");
        modal.querySelector("[data-logout-cancel]:not(.logout-confirm-backdrop)")?.focus();
      });
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && activeResolve) {
      event.preventDefault();
      finish(false);
    }
  });

  window.EduSkyLogoutConfirm = { ask };
})();
