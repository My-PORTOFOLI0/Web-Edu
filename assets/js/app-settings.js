(function () {
  "use strict";

  if (window.EduSkySettings) return;

  const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";
  const CACHE_KEY = "edusky_public_settings";
  const LOCAL_OVERRIDE_KEY = "edusky_settings_local_override";
  const TITLE_TEMPLATE = document.title;
  const DEFAULTS = {
    appName: "EduSky Learning",
    academicYear: "2026/2027",
    adminName: "Administrator",
    theme: "light",
    whatsapp: "",
    logo: "",
    logoScale: 1,
    logoX: 0,
    logoY: 0,
    updatedAt: null
  };

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalize(value) {
    if (!value || typeof value !== "object") return { ...DEFAULTS };
    return {
      appName: String(value.app_name || value.appName || DEFAULTS.appName).slice(0, 80),
      academicYear: String(value.academic_year || value.academicYear || DEFAULTS.academicYear).slice(0, 20),
      adminName: String(value.admin_name || value.adminName || DEFAULTS.adminName).slice(0, 80),
      theme: ["light", "dark", "system"].includes(value.admin_theme || value.theme)
        ? (value.admin_theme || value.theme)
        : "light",
      whatsapp: String(value.whatsapp || "").replace(/\D/g, "").slice(0, 15),
      logo: String(value.logo || "").trim().match(/^(?:data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i)
        ? String(value.logo).trim().slice(0, 500000)
        : "",
      logoScale: clampNumber(value.logo_scale ?? value.logoScale, .5, 3, 1),
      logoX: clampNumber(value.logo_x ?? value.logoX, -100, 100, 0),
      logoY: clampNumber(value.logo_y ?? value.logoY, -100, 100, 0),
      updatedAt: value.updated_at || value.updatedAt || null
    };
  }

  function readCache() {
    try {
      return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) || "null"));
    } catch (error) {
      return { ...DEFAULTS };
    }
  }

  function apply(settings, source) {
    const value = normalize(settings);
    window.EDUSKY_APP_SETTINGS = value;
    window.EDUSKY_ADMIN_WHATSAPP = value.whatsapp;
    document.documentElement.dataset.settingsSource = source;

    document.querySelectorAll("[data-app-name], .nav-brand-name").forEach(element => {
      element.textContent = value.appName;
    });
    document.querySelectorAll("[data-academic-year]").forEach(element => {
      element.textContent = value.academicYear;
    });
    document.querySelectorAll("[data-admin-name]").forEach(element => {
      element.textContent = value.adminName;
    });

    document.querySelectorAll(".nav-brand img, .login-logo img, [data-app-logo]").forEach(image => {
      if (!image.dataset.defaultLogo) image.dataset.defaultLogo = image.getAttribute("src") || "";
      image.src = value.logo || image.dataset.defaultLogo;
      image.alt = `Logo ${value.appName}`;
      image.classList.toggle("edusky-custom-logo", Boolean(value.logo));
      if (value.logo) {
        Object.assign(image.style, {
          display: "block",
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          objectPosition: "center",
          boxSizing: "border-box",
          padding: "2px",
          backgroundColor: "white",
          transform: `translate(${value.logoX}%, ${value.logoY}%) scale(${value.logoScale})`,
          transformOrigin: "center"
        });
      } else {
        ["display", "maxWidth", "maxHeight", "objectFit", "objectPosition", "boxSizing", "padding", "backgroundColor", "transform", "transformOrigin"]
          .forEach(property => { image.style[property] = ""; });
      }
    });

    document.querySelectorAll(".information-logo, .mobile-brand-icon").forEach(container => {
      let image = container.querySelector("[data-generated-app-logo]");
      const fallback = container.querySelector("i");
      container.classList.toggle("has-custom-app-logo", Boolean(value.logo));
      if (value.logo) {
        if (!image) {
          image = document.createElement("img");
          image.dataset.generatedAppLogo = "true";
          image.alt = `Logo ${value.appName}`;
          Object.assign(image.style, {
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: "0",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            objectPosition: "center",
            boxSizing: "border-box",
            padding: "3px",
            borderRadius: "inherit",
            background: "white"
          });
          container.appendChild(image);
        }
        image.src = value.logo;
        image.style.transform = `translate(${value.logoX}%, ${value.logoY}%) scale(${value.logoScale})`;
        image.style.transformOrigin = "center";
        image.hidden = false;
        if (fallback) fallback.hidden = true;
      } else {
        if (image) image.hidden = true;
        if (fallback) fallback.hidden = false;
      }
    });

    let favicon = document.querySelector('link[data-edusky-favicon]');
    if (value.logo) {
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        favicon.dataset.eduskyFavicon = "true";
        document.head.appendChild(favicon);
      }
      favicon.href = value.logo;
    } else {
      favicon?.remove();
    }

    const loginBrand = document.querySelector(".login-logo h2");
    if (loginBrand) loginBrand.textContent = value.appName;
    const adminLoginBrands = document.querySelectorAll(".information-brand h2, .mobile-brand h2");
    adminLoginBrands.forEach(element => { element.textContent = value.appName; });

    if (/EduSky(?: Learning)?/i.test(TITLE_TEMPLATE)) {
      document.title = TITLE_TEMPLATE.replace(/EduSky(?: Learning)?/gi, value.appName);
    }

    window.dispatchEvent(new CustomEvent("edusky:settings", { detail: value }));
    return value;
  }

  async function fetchRemote() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/publik_get_pengaturan_aplikasi`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Pengaturan gagal dimuat (${response.status}).`);
    }
    const settings = normalize(await response.json());
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
    localStorage.setItem("edusky_admin_whatsapp", settings.whatsapp || "");
    return apply(settings, "database");
  }

  const cached = apply(readCache(), localStorage.getItem(LOCAL_OVERRIDE_KEY) === "1" ? "local" : "cache");
  const ready = localStorage.getItem(LOCAL_OVERRIDE_KEY) === "1"
    ? Promise.resolve(cached)
    : fetchRemote().catch(error => {
        console.warn("Pengaturan global menggunakan cache lokal:", error.message);
        return cached;
      });

  window.addEventListener("storage", event => {
    if (event.key === CACHE_KEY || event.key === LOCAL_OVERRIDE_KEY) {
      apply(readCache(), localStorage.getItem(LOCAL_OVERRIDE_KEY) === "1" ? "local" : "cache");
    }
  });

  window.EduSkySettings = {
    defaults: { ...DEFAULTS },
    get: () => ({ ...(window.EDUSKY_APP_SETTINGS || cached) }),
    refresh: fetchRemote,
    ready
  };
})();
