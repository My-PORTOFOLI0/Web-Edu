(function () {
  "use strict";

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const PDF_BUCKET = "modul-pdf";

  const knownSubjectStyles = {
    Matematika: { color: "#2563eb", deep: "#1d4ed8", soft: "#dbeafe", emoji: "🧮" },
    "Bahasa Indonesia": { color: "#ec4899", deep: "#be185d", soft: "#fce7f3", emoji: "📖" },
    "Bahasa Inggris": { color: "#8b5cf6", deep: "#6d28d9", soft: "#ede9fe", emoji: "🌍" },
    IPAS: { color: "#10b981", deep: "#047857", soft: "#d1fae5", emoji: "🔬" },
    PKN: { color: "#f59e0b", deep: "#d97706", soft: "#fef3c7", emoji: "🇮🇩" },
    Seni: { color: "#f97316", deep: "#c2410c", soft: "#ffedd5", emoji: "🎨" },
    "Pendidikan Agama": { color: "#06b6d4", deep: "#0e7490", soft: "#cffafe", emoji: "🤲" },
    PJOK: { color: "#22c55e", deep: "#15803d", soft: "#dcfce7", emoji: "⚽" },
    Informatika: { color: "#64748b", deep: "#334155", soft: "#e2e8f0", emoji: "💻" }
  };

  const subjectTemplates = [
    "Matematika",
    "Bahasa Indonesia",
    "Bahasa Inggris",
    "IPAS",
    "PKN",
    "Seni",
    "Pendidikan Agama",
    "PJOK",
    "Informatika"
  ];

  const moduleTemplateTitles = {
    Matematika: [
      "Bilangan dan Nilai Tempat",
      "Operasi Hitung Dasar",
      "Pecahan Sederhana",
      "Bangun Datar",
      "Pengukuran Waktu dan Panjang",
      "Keliling dan Luas",
      "Penyajian Data Sederhana"
    ],
    "Bahasa Indonesia": ["Membaca dan Menulis"],
    "Bahasa Inggris": ["Kosakata Bahasa Inggris Dasar"],
    IPAS: ["Sains dan Lingkungan"],
    PKN: ["Pendidikan Pancasila"],
    Seni: ["Kreasi Seni dan Budaya"],
    "Pendidikan Agama": ["Nilai-Nilai Keagamaan"],
    PJOK: ["Kesehatan dan Olahraga"],
    Informatika: ["Dasar-Dasar Informatika"]
  };

  const fallbackStyles = [
    { color: "#0ea5e9", deep: "#0369a1", soft: "#e0f2fe", emoji: "📘" },
    { color: "#14b8a6", deep: "#0f766e", soft: "#ccfbf1", emoji: "📗" },
    { color: "#6366f1", deep: "#4338ca", soft: "#e0e7ff", emoji: "📙" },
    { color: "#e11d48", deep: "#be123c", soft: "#ffe4e6", emoji: "📕" }
  ];

  let client = null;
  let modules = [];
  let activeModule = null;
  let activeSubject = "all";
  let activeSort = "newest";
  let activeUser = null;
  let pdfReader = null;
  let toastTimer = null;
  let stickyAnimationFrame = 0;
  let verticalScrollAnimationFrame = 0;
  let previousScrollBehavior = null;

  const $ = id => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readUser() {
    try {
      const value = JSON.parse(localStorage.getItem("edusky_user"));
      return value?.isLoggedIn === true ? value : null;
    } catch (error) {
      localStorage.removeItem("edusky_user");
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
      year: "numeric"
    }).format(date);
  }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;

    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    const themeButton = $("themeButton");
    const themeColor = document.querySelector('meta[name="theme-color"]');

    document.body.classList.toggle("dark-mode", isDark);
    document.body.toggleAttribute("data-theme", isDark);
    if (isDark) document.body.setAttribute("data-theme", "dark");
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    themeColor?.setAttribute("content", isDark ? "#07131f" : "#f4f7fb");

    if (themeButton) {
      const label = isDark ? "Gunakan tema terang" : "Gunakan tema gelap";
      themeButton.setAttribute("aria-pressed", String(isDark));
      themeButton.setAttribute("aria-label", label);
      themeButton.title = label;
    }
  }

  function databaseError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "Perpustakaan modul gagal dimuat.");
    const normalized = message.toLowerCase();

    if (code === "PGRST202" || normalized.includes("could not find the function")) {
      return "Katalog modul belum aktif. Admin perlu menjalankan supabase/modul_setup.sql.";
    }

    if (normalized.includes("failed to fetch") || normalized.includes("load failed")) {
      return "Tidak dapat terhubung ke Supabase. Periksa koneksi internet.";
    }

    return message;
  }

  function styleFor(subject) {
    if (knownSubjectStyles[subject]) return knownSubjectStyles[subject];

    const hash = Array.from(String(subject || "Modul"))
      .reduce((total, character) => total + character.charCodeAt(0), 0);

    return fallbackStyles[hash % fallbackStyles.length];
  }

  function favoriteKey(id) {
    return `edusky_modul_favorite_${id}`;
  }

  function isFavorite(id) {
    return localStorage.getItem(favoriteKey(id)) === "true";
  }

  function pdfUrl(path) {
    if (!path || !client) return null;

    return client.storage
      .from(PDF_BUCKET)
      .getPublicUrl(path)
      .data.publicUrl;
  }

  function populateProfile(user) {
    activeUser = user;
    const name = user.nama_siswa || user.nama || user.username || "Siswa EduSky";
    const grade = user.kelas || "-";

    $("studentName").textContent = name;
    $("studentAvatar").textContent = initials(name);
    $("studentClassBadge").textContent = grade;
    $("gradeDisplay").textContent = grade;
    $("gradeSelect").value = grade !== "-" ? grade : "__kelas_belum_ditentukan__";
  }

  function subjectEntries() {
    const counts = modules.reduce((result, module) => {
      const subject = module.mata_pelajaran || "Lainnya";
      result[subject] = (result[subject] || 0) + 1;
      return result;
    }, {});

    const subjects = [
      ...subjectTemplates,
      ...Object.keys(counts).filter(subject => !subjectTemplates.includes(subject))
    ];

    return subjects.map(subject => [subject, counts[subject] || 0]);
  }

  function remainingTemplates(subject, moduleCount) {
    const titles = moduleTemplateTitles[subject] || [`Modul ${subject}`];
    const filledSlots = Math.min(Math.max(0, Number(moduleCount) || 0), titles.length);

    return titles.slice(filledSlots).map((title, index) => ({
      subject,
      title,
      slot: filledSlots + index + 1,
      totalSlots: titles.length
    }));
  }

  function updateSummary() {
    const subjects = subjectEntries();
    const favorites = modules.filter(module => isFavorite(module.id)).length;

    $("totalModule").textContent = String(modules.length);
    $("totalSubjects").textContent = String(subjects.length);
    $("favoriteModuleCount").textContent = String(favorites);
    $("categorySummary").textContent = `${subjects.length} mata pelajaran`;
  }

  function renderCategories() {
    const categories = subjectEntries();
    const container = $("libraryCategories");

    if (!categories.length) {
      container.innerHTML = '<p class="library-category-empty">Kategori akan tampil setelah guru menambahkan modul PDF.</p>';
      return;
    }

    container.innerHTML = categories.map(([subject, count]) => {
      const style = styleFor(subject);
      const active = activeSubject === subject;
      const templateCount = remainingTemplates(subject, count).length;
      const collectionLabel = templateCount
        ? `${count} PDF • ${templateCount} template`
        : `${count} modul PDF`;

      return `
        <button
          type="button"
          class="library-category-card ${active ? "active" : ""}"
          data-subject="${escapeHTML(subject)}"
          aria-pressed="${active}"
          style="--subject-color:${style.color};--subject-deep:${style.deep};--subject-soft:${style.soft}"
        >
          <span class="library-category-icon" aria-hidden="true">${style.emoji}</span>
          <span class="library-category-copy">
            <strong>${escapeHTML(subject)}</strong>
            <small>${collectionLabel}</small>
          </span>
          <span class="library-category-arrow" aria-hidden="true">→</span>
        </button>
      `;
    }).join("");

    window.requestAnimationFrame(updateCategoryScrollControls);
  }

  function updateCategoryScrollControls() {
    const track = $("libraryCategories");
    const previous = $("categoryScrollPrev");
    const next = $("categoryScrollNext");

    if (!track || !previous || !next) return;

    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= maximum - 2 || maximum <= 2;
  }

  function scrollCategories(direction) {
    const track = $("libraryCategories");
    if (!track) return;

    const distance = Math.max(230, Math.round(track.clientWidth * 0.78));
    track.scrollBy({
      left: direction * distance,
      behavior: "smooth"
    });
  }

  function updateStickyPanelState() {
    if (stickyAnimationFrame) return;

    stickyAnimationFrame = window.requestAnimationFrame(() => {
      stickyAnimationFrame = 0;
      const panel = document.querySelector(".library-category-panel");
      if (!panel) return;

      const stickyTop = window.matchMedia("(max-width: 900px)").matches ? 60 : 70;
      const isStuck = panel.getBoundingClientRect().top <= stickyTop + 1;
      panel.classList.toggle("is-stuck", isStuck);
    });
  }

  function stopAutomaticScroll() {
    if (verticalScrollAnimationFrame) {
      window.cancelAnimationFrame(verticalScrollAnimationFrame);
      verticalScrollAnimationFrame = 0;
    }

    if (previousScrollBehavior !== null) {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      previousScrollBehavior = null;
    }
  }

  function smoothScrollToModules() {
    stopAutomaticScroll();

    const target = $("moduleContainer");
    const panel = document.querySelector(".library-category-panel");
    const navbar = document.querySelector(".site-navbar");
    if (!target || !panel) return;

    const offset = (navbar?.offsetHeight || 0) + panel.offsetHeight + 14;
    const start = window.scrollY;
    const destination = Math.max(
      0,
      start + target.getBoundingClientRect().top - offset
    );
    const distance = destination - start;

    if (Math.abs(distance) < 2) return;

    const root = document.documentElement;
    previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo({ top: destination, behavior: "auto" });
      root.style.scrollBehavior = previousScrollBehavior;
      previousScrollBehavior = null;
      return;
    }

    const duration = Math.min(760, Math.max(460, Math.abs(distance) * 0.48));
    let startedAt = null;

    const animate = timestamp => {
      if (startedAt === null) startedAt = timestamp;

      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      window.scrollTo({ top: start + distance * eased, behavior: "auto" });

      if (progress < 1) {
        verticalScrollAnimationFrame = window.requestAnimationFrame(animate);
        return;
      }

      verticalScrollAnimationFrame = 0;
      root.style.scrollBehavior = previousScrollBehavior;
      previousScrollBehavior = null;
    };

    verticalScrollAnimationFrame = window.requestAnimationFrame(animate);
  }

  function renderSubjectFilters() {
    const favorites = modules.filter(module => isFavorite(module.id)).length;

    $("subjectFilters").innerHTML = `
      <button
        type="button"
        class="filter-chip ${activeSubject === "all" ? "active" : ""}"
        data-library-filter="all"
      >
        Semua <b>${modules.length}</b>
      </button>
      <button
        type="button"
        class="filter-chip ${activeSubject === "__favorites__" ? "active" : ""}"
        data-library-filter="favorites"
      >
        Pilihan Saya <b>${favorites}</b>
      </button>
      <button
        type="button"
        class="filter-chip ${activeSort === "oldest" ? "active" : ""}"
        data-library-sort="oldest"
      >
        <i class="fas fa-arrow-up-wide-short" aria-hidden="true"></i>
        Terlama
      </button>
      <button
        type="button"
        class="filter-chip ${activeSort === "newest" ? "active" : ""}"
        data-library-sort="newest"
      >
        <i class="fas fa-arrow-down-wide-short" aria-hidden="true"></i>
        Terbaru
      </button>
    `;
  }

  function filteredModules() {
    const keyword = $("searchInput").value.trim().toLocaleLowerCase("id");
    const selectedGrade = String(activeUser?.kelas || "").trim().toLocaleLowerCase("id");

    const result = modules.filter(module => {
      const moduleGrade = String(module.kelas || "").trim().toLocaleLowerCase("id");
      const matchesGrade = !moduleGrade || (selectedGrade && moduleGrade === selectedGrade);
      const matchesSubject =
        activeSubject === "all" ||
        (activeSubject === "__favorites__" && isFavorite(module.id)) ||
        module.mata_pelajaran === activeSubject;
      const haystack = [
        module.judul,
        module.mata_pelajaran,
        module.deskripsi,
        module.kelas
      ].join(" ").toLocaleLowerCase("id");

      return matchesGrade && matchesSubject && (!keyword || haystack.includes(keyword));
    });

    return result.sort((left, right) => {
      if (activeSort === "oldest") {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }

  function moduleCard(module) {
    const style = styleFor(module.mata_pelajaran);
    const favorite = isFavorite(module.id);

    return `
      <article
        class="module-card library-book-card"
        style="--subject-color:${style.color};--subject-deep:${style.deep};--subject-soft:${style.soft}"
      >
        <div class="module-cover library-book-cover">
          <div class="module-top">
            <div class="tag-group">
              <span class="mini-tag">${escapeHTML(module.kelas || "Semua Kelas")}</span>
              <span class="mini-tag">PDF</span>
            </div>
            <button
              type="button"
              class="favorite-btn ${favorite ? "active" : ""}"
              data-favorite-id="${module.id}"
              aria-label="${favorite ? "Hapus dari pilihan" : "Simpan sebagai pilihan"}"
              title="Simpan modul pilihan"
            >
              <svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>
            </button>
          </div>
          <div class="library-cover-art" aria-hidden="true">
            <span>${style.emoji}</span>
            <small>MODUL DIGITAL</small>
          </div>
        </div>

        <div class="module-content library-book-content">
          <span class="library-subject-label">${escapeHTML(module.mata_pelajaran || "Modul")}</span>
          <h3>${escapeHTML(module.judul)}</h3>
          <p>${escapeHTML(module.deskripsi || "Modul PDF dari guru untuk mendukung kegiatan belajar.")}</p>
          <div class="library-book-meta">
            <span><i class="far fa-calendar" aria-hidden="true"></i>${formatDate(module.created_at)}</span>
            <span><i class="far fa-file-pdf" aria-hidden="true"></i>PDF</span>
          </div>
          <div class="library-card-actions">
            <button type="button" class="library-preview-button" data-open-module="${module.id}">
              <i class="far fa-eye" aria-hidden="true"></i>
              Lihat
            </button>
            <button type="button" class="library-download-button" data-download-module="${module.id}">
              <i class="fas fa-download" aria-hidden="true"></i>
              Unduh
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function templateCard(template) {
    const { subject, title, slot, totalSlots } = template;
    const style = styleFor(subject);

    return `
      <article
        class="module-card library-book-card library-template-card"
        style="--subject-color:${style.color};--subject-deep:${style.deep};--subject-soft:${style.soft}"
        aria-label="Template ${escapeHTML(title)}, belum tersedia"
      >
        <div class="module-cover library-book-cover">
          <div class="module-top">
            <div class="tag-group">
              <span class="mini-tag">Template ${slot}/${totalSlots}</span>
              <span class="mini-tag">0 PDF</span>
            </div>
            <span class="library-template-lock" aria-hidden="true"><i class="fas fa-lock"></i></span>
          </div>
          <div class="library-cover-art" aria-hidden="true">
            <span>${style.emoji}</span>
            <small>RAK MATA PELAJARAN</small>
          </div>
        </div>

        <div class="module-content library-book-content">
          <span class="library-subject-label">${escapeHTML(subject)}</span>
          <h3>${escapeHTML(title)}</h3>
          <p>Slot modul ini menunggu file PDF yang akan ditambahkan oleh guru atau admin.</p>
          <div class="library-book-meta">
            <span><i class="far fa-folder-open" aria-hidden="true"></i>Menunggu koleksi</span>
          </div>
          <button type="button" class="library-template-button" disabled>
            <i class="fas fa-hourglass-half" aria-hidden="true"></i>
            Belum tersedia
          </button>
        </div>
      </article>
    `;
  }

  function visibleTemplates() {
    if (activeSubject === "__favorites__") return [];

    const keyword = $("searchInput").value.trim().toLocaleLowerCase("id");

    return subjectEntries()
      .flatMap(([subject, count]) => {
        const matchesSubject = activeSubject === "all" || activeSubject === subject;
        if (!matchesSubject) return [];

        return remainingTemplates(subject, count).filter(template => {
          const haystack = `${template.subject} ${template.title} modul`.toLocaleLowerCase("id");
          return !keyword || haystack.includes(keyword);
        });
      });
  }

  function renderModules() {
    const result = filteredModules();
    const templates = visibleTemplates();
    const container = $("moduleContainer");
    const emptyState = $("emptyState");
    const subjectLabel = activeSubject === "all"
      ? "Semua Modul"
      : activeSubject === "__favorites__"
        ? "Modul Pilihan Saya"
        : activeSubject;

    $("resultTitle").textContent = subjectLabel;
    $("resultCount").textContent = templates.length
      ? `${result.length} modul tersedia • ${templates.length} slot template`
      : `${result.length} modul ditemukan`;

    if (!result.length && !templates.length) {
      container.innerHTML = "";
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    container.innerHTML = `
      <div class="module-grid library-book-grid">
        ${result.map(moduleCard).join("")}
        ${templates.map(templateCard).join("")}
      </div>
    `;
  }

  function selectSubject(subject) {
    activeSubject = subject || "all";
    renderCategories();
    renderSubjectFilters();
    renderModules();
    smoothScrollToModules();
  }

  function openModule(id) {
    const module = modules.find(item => String(item.id) === String(id));
    if (!module) return;

    activeModule = module;
    const style = styleFor(module.mata_pelajaran);

    $("modalCover").style.setProperty("--modal-color", style.color);
    $("modalCover").style.setProperty("--modal-deep", style.deep);
    $("modalEmoji").textContent = style.emoji;
    $("modalSubject").textContent = module.mata_pelajaran || "Modul";
    $("modalGrade").textContent = module.kelas || "Semua Kelas";
    $("modalTitle").textContent = module.judul;
    $("modalDescription").textContent =
      module.deskripsi || "Modul PDF dari guru untuk mendukung kegiatan belajar.";
    $("modalPublishedDate").textContent = formatDate(module.created_at);
    $("viewerTitle").textContent = module.judul;
    $("learningViewer").hidden = true;
    $("moduleModal").querySelector(".modal-card")?.classList.remove("viewer-mode");
    pdfReader?.clear();

    $("moduleModal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function readActiveModule() {
    if (!activeModule?.pdf_path) return;

    $("learningViewer").hidden = false;
    $("moduleModal").querySelector(".modal-card")?.classList.add("viewer-mode");

    pdfReader?.load(pdfUrl(activeModule.pdf_path)).catch(error => {
      console.error("PDF gagal dibuka:", error);
      showToast("PDF belum dapat dibaca. Periksa akses file modul.");
    });

    $("learningViewer").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function currentFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isPdfViewerFullscreen() {
    const wrap = $("pdfViewerWrap");
    return currentFullscreenElement() === wrap || wrap?.classList.contains("is-pseudo-fullscreen");
  }

  function updatePdfFullscreenButton() {
    const active = isPdfViewerFullscreen();
    const button = $("viewerFullscreen");

    if (!button) return;

    button.setAttribute("aria-label", active ? "Keluar dari layar penuh" : "Buka layar penuh");
    button.setAttribute("aria-pressed", String(active));
    button.title = active ? "Keluar dari layar penuh" : "Buka layar penuh";
  }

  async function exitPdfFullscreen() {
    const wrap = $("pdfViewerWrap");
    if (!wrap) return;

    wrap.classList.remove("is-pseudo-fullscreen");
    document.body.classList.remove("pdf-pseudo-fullscreen");

    if (currentFullscreenElement() === wrap) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;

      try {
        await exit?.call(document);
      } catch (error) {
        console.warn("Layar penuh tidak dapat ditutup:", error);
      }
    }

    updatePdfFullscreenButton();
  }

  async function togglePdfFullscreen() {
    const wrap = $("pdfViewerWrap");
    if (!wrap) return;

    if (isPdfViewerFullscreen()) {
      await exitPdfFullscreen();
      return;
    }

    const request = wrap.requestFullscreen || wrap.webkitRequestFullscreen;

    if (request) {
      try {
        await request.call(wrap);
        updatePdfFullscreenButton();
        return;
      } catch (error) {
        console.warn("Fullscreen API tidak tersedia, memakai mode responsif:", error);
      }
    }

    wrap.classList.add("is-pseudo-fullscreen");
    document.body.classList.add("pdf-pseudo-fullscreen");
    updatePdfFullscreenButton();
  }

  function closeModal() {
    exitPdfFullscreen();
    $("moduleModal").hidden = true;
    $("moduleModal").querySelector(".modal-card")?.classList.remove("viewer-mode");
    $("learningViewer").hidden = true;
    pdfReader?.clear();
    document.body.style.overflow = "";
    activeModule = null;
  }

  async function downloadModule(module, button) {
    if (!module?.pdf_path) {
      showToast("File PDF modul belum tersedia.");
      return;
    }

    const original = button?.innerHTML;

    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Menyiapkan';
    }

    try {
      await window.EduSkyPdfReader.download(
        pdfUrl(module.pdf_path),
        module.judul || "modul-edusky"
      );
      showToast("Unduhan modul PDF dimulai.");
    } catch (error) {
      console.error("Download PDF gagal:", error);
      showToast("PDF gagal diunduh. Periksa koneksi dan akses file.");
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  async function loadModules() {
    $("moduleLoading").hidden = false;
    $("moduleContainer").hidden = true;
    $("emptyState").hidden = true;

    let data = null;
    let error = null;

    if (activeUser?.id) {
      ({ data, error } = await client.rpc("list_modul_siswa_akun", {
        p_siswa_id: activeUser.id,
        p_search: "",
        p_subject: ""
      }));
    }

    if (!activeUser?.id || (error && (
      error.code === "PGRST202" ||
      String(error.message).toLowerCase().includes("could not find the function")
    ))) {
      ({ data, error } = await client.rpc("list_modul_siswa", {
        p_search: "",
        p_subject: "",
        p_grade: activeUser?.kelas || "__kelas_belum_ditentukan__"
      }));
    }

    if (error) throw new Error(databaseError(error));

    modules = (Array.isArray(data) ? data : []).filter(module => Boolean(module.pdf_path));
    activeSubject = "all";
    activeSort = "newest";
    $("moduleLoading").hidden = true;
    $("moduleContainer").hidden = false;
    updateSummary();
    renderCategories();
    renderSubjectFilters();
    renderModules();
  }

  function attachEvents() {
    $("searchInput").addEventListener("input", event => {
      $("clearSearch").hidden = !event.target.value;
      renderModules();
    });

    $("clearSearch").addEventListener("click", () => {
      $("searchInput").value = "";
      $("clearSearch").hidden = true;
      renderModules();
      $("searchInput").focus();
    });

    $("libraryCategories").addEventListener("click", event => {
      const button = event.target.closest("[data-subject]");
      if (button) selectSubject(button.dataset.subject);
    });

    $("subjectFilters").addEventListener("click", event => {
      const filterButton = event.target.closest("[data-library-filter]");
      const sortButton = event.target.closest("[data-library-sort]");

      if (filterButton) {
        selectSubject(
          filterButton.dataset.libraryFilter === "favorites"
            ? "__favorites__"
            : "all"
        );
        return;
      }

      if (sortButton) {
        activeSort = sortButton.dataset.librarySort;
        renderSubjectFilters();
        renderModules();
      }
    });

    $("categoryScrollPrev").addEventListener("click", () => scrollCategories(-1));
    $("categoryScrollNext").addEventListener("click", () => scrollCategories(1));
    $("libraryCategories").addEventListener("scroll", updateCategoryScrollControls, { passive: true });
    window.addEventListener("resize", updateCategoryScrollControls, { passive: true });
    window.addEventListener("scroll", updateStickyPanelState, { passive: true });
    window.addEventListener("resize", updateStickyPanelState, { passive: true });
    window.addEventListener("wheel", stopAutomaticScroll, { passive: true });
    window.addEventListener("touchstart", stopAutomaticScroll, { passive: true });
    updateStickyPanelState();

    $("moduleContainer").addEventListener("click", event => {
      const favoriteButton = event.target.closest("[data-favorite-id]");
      const previewButton = event.target.closest("[data-open-module]");
      const downloadButton = event.target.closest("[data-download-module]");

      if (favoriteButton) {
        const id = favoriteButton.dataset.favoriteId;
        localStorage.setItem(favoriteKey(id), String(!isFavorite(id)));
        updateSummary();
        renderSubjectFilters();
        renderModules();
        showToast(isFavorite(id) ? "Modul disimpan sebagai pilihan." : "Modul dihapus dari pilihan.");
        return;
      }

      if (previewButton) {
        openModule(previewButton.dataset.openModule);
        return;
      }

      if (downloadButton) {
        const module = modules.find(item => String(item.id) === downloadButton.dataset.downloadModule);
        downloadModule(module, downloadButton);
      }
    });

    $("resetFilter").addEventListener("click", () => {
      activeSubject = "all";
      activeSort = "newest";
      $("searchInput").value = "";
      $("clearSearch").hidden = true;
      renderCategories();
      renderSubjectFilters();
      renderModules();
    });

    $("closeModal").addEventListener("click", closeModal);
    $("moduleModal").addEventListener("click", event => {
      if (event.target === $("moduleModal")) closeModal();
    });
    $("readModulePdf").addEventListener("click", readActiveModule);
    $("downloadModulePdf").addEventListener("click", event =>
      downloadModule(activeModule, event.currentTarget)
    );
    $("viewerFullscreen").addEventListener("click", togglePdfFullscreen);
    $("viewerExitFullscreen").addEventListener("click", exitPdfFullscreen);
    document.addEventListener("fullscreenchange", updatePdfFullscreenButton);
    document.addEventListener("webkitfullscreenchange", updatePdfFullscreenButton);

    $("themeButton").addEventListener("click", () => {
      const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
      applyTheme(nextTheme);
      localStorage.setItem("edusky_theme", nextTheme);
      localStorage.removeItem("edusky_modul_theme");
    });

    $("notificationButton").addEventListener("click", () => {
      showToast("Koleksi perpustakaan diperbarui oleh guru dan admin.");
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      if (isPdfViewerFullscreen()) {
        event.preventDefault();
        exitPdfFullscreen();
        return;
      }

      if (!$("moduleModal").hidden) closeModal();
    });
  }

  async function initialize() {
    const user = readUser();

    if (!user) {
      window.location.replace("../../index.html");
      return;
    }

    populateProfile(user);
    const savedTheme = localStorage.getItem("edusky_theme") ||
      localStorage.getItem("edusky_modul_theme") ||
      "light";
    applyTheme(savedTheme === "dark" ? "dark" : "light");
    localStorage.setItem("edusky_theme", savedTheme === "dark" ? "dark" : "light");
    localStorage.removeItem("edusky_modul_theme");

    if (!window.supabase?.createClient) {
      $("moduleLoading").innerHTML = "<p>Library Supabase gagal dimuat.</p>";
      return;
    }

    if (!window.EduSkyPdfReader) {
      $("moduleLoading").innerHTML = "<p>Pembaca PDF gagal dimuat. Periksa koneksi internet.</p>";
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    try {
      const { data: freshData } = await client.rpc("admin_get_akun_siswa", { p_id: user.id });
      const freshUser = Array.isArray(freshData) ? freshData[0] : freshData;

      if (freshUser?.id) {
        const updatedUser = {
          ...user,
          ...freshUser,
          nama: freshUser.nama_siswa || user.nama,
          session_token: user.session_token,
          session_expires_at: user.session_expires_at,
          isLoggedIn: true
        };

        localStorage.setItem("edusky_user", JSON.stringify(updatedUser));
        populateProfile(updatedUser);
      }
    } catch (error) {
      console.warn("Data siswa terbaru tidak dapat dimuat:", error);
    }

    pdfReader = window.EduSkyPdfReader.create({
      container: $("pdfViewer"),
      status: $("pdfReaderStatus")
    });

    attachEvents();

    try {
      await loadModules();
    } catch (error) {
      console.error("Perpustakaan modul gagal dimuat:", error);
      $("moduleLoading").innerHTML = `
        <div class="empty-illustration">⚠️</div>
        <p>${escapeHTML(error.message)}</p>
        <button type="button" class="primary-button" id="retryModules">Coba lagi</button>
      `;
      $("retryModules")?.addEventListener("click", () => {
        loadModules().catch(nextError => showToast(nextError.message));
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
