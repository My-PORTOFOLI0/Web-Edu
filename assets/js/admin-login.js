"use strict";

document.addEventListener("DOMContentLoaded", function () {
    const SUPABASE_URL = "https://viwbkbrikocybvqlgwoy.supabase.co";
    const SUPABASE_KEY = "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";

    /*
     * Halaman login admin berada di pages/admin-login/index.html
     * dan dashboard admin berada di root project.
     */
    const ADMIN_PAGE = "../../admin.html";

    const SESSION_KEY = "edusky_admin_session";
    const REMEMBER_KEY = "edusky_admin_username";

    /* =====================================================
       ELEMEN HTML
       ===================================================== */

    const loginForm =
        document.getElementById(
            "admin-login-form"
        );

    const usernameInput =
        document.getElementById(
            "admin-username"
        );

    const passwordInput =
        document.getElementById(
            "admin-password"
        );

    const rememberAdmin =
        document.getElementById(
            "remember-admin"
        );

    const loginButton =
        document.getElementById(
            "login-button"
        );

    const togglePassword =
        document.getElementById(
            "toggle-password"
        );

    const forgotPassword =
        document.getElementById(
            "forgot-password"
        );

    const loginMessage =
        document.getElementById(
            "login-message"
        );

    const loginCard =
        document.querySelector(
            ".login-card"
        );

    let loginInProgress = false;
    let supabaseClient = null;

    function getSupabaseClient() {
        if (supabaseClient) return supabaseClient;
        if (!window.supabase?.createClient) {
            throw new Error("Library Supabase belum tersedia. Periksa koneksi internet lalu muat ulang halaman.");
        }
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        return supabaseClient;
    }

    function databaseMessage(error) {
        const message = String(error?.message || "Login admin gagal.");
        const text = message.toLowerCase();
        if (String(error?.code || "") === "PGRST202" || text.includes("could not find the function")) {
            return "Backend admin belum dipasang. Jalankan supabase/pengaturan_aplikasi_setup.sql di Supabase SQL Editor.";
        }
        return message;
    }

    /* =====================================================
       VALIDASI ELEMEN HTML
       ===================================================== */

    if (
        !loginForm ||
        !usernameInput ||
        !passwordInput ||
        !loginButton
    ) {
        console.error(
            "Elemen login admin tidak lengkap. Pastikan ID HTML sudah sesuai."
        );

        return;
    }

    /* =====================================================
       MEMBUAT KONTAINER NOTIFIKASI
       ===================================================== */

    let toastContainer =
        document.getElementById(
            "toast-container"
        );

    if (!toastContainer) {
        toastContainer =
            document.createElement("div");

        toastContainer.id =
            "toast-container";

        toastContainer.className =
            "toast-container";

        toastContainer.setAttribute(
            "aria-live",
            "polite"
        );

        toastContainer.setAttribute(
            "aria-atomic",
            "true"
        );

        document.body.appendChild(
            toastContainer
        );
    }

    /* =====================================================
       MEMBUAT PERINGATAN CAPS LOCK
       ===================================================== */

    let capsWarning =
        passwordInput
            .closest(".form-group")
            ?.querySelector(
                ".caps-lock-warning"
            );

    if (!capsWarning) {
        capsWarning =
            document.createElement("div");

        capsWarning.className =
            "caps-lock-warning";

        capsWarning.innerHTML = `
            <i class="fas fa-arrow-up"></i>
            <span>Caps Lock sedang aktif</span>
        `;

        passwordInput
            .closest(".form-group")
            ?.appendChild(capsWarning);
    }

    /* =====================================================
       UTILITAS
       ===================================================== */

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clearToasts() {
        toastContainer
            .querySelectorAll(
                ".login-toast"
            )
            .forEach(function (toast) {
                toast.remove();
            });
    }

    /* =====================================================
       NOTIFIKASI TOAST
       ===================================================== */

    function showToast(
        title,
        message,
        type = "error",
        duration = 3500
    ) {
        clearToasts();

        const toast =
            document.createElement("div");

        const icon =
            type === "success"
                ? "check"
                : "times";

        toast.className =
            `login-toast ${type}`;

        toast.style.setProperty(
            "--toast-duration",
            `${duration}ms`
        );

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${icon}"></i>
            </div>

            <div class="toast-content">
                <strong>
                    ${escapeHTML(title)}
                </strong>

                <span>
                    ${escapeHTML(message)}
                </span>
            </div>

            <button
                type="button"
                class="toast-close"
                aria-label="Tutup notifikasi"
            >
                <i class="fas fa-times"></i>
            </button>

            <div class="toast-progress"></div>
        `;

        toastContainer.appendChild(
            toast
        );

        let removed = false;
        let removeTimer = null;

        function removeToast() {
            if (removed) {
                return;
            }

            removed = true;

            if (removeTimer) {
                window.clearTimeout(
                    removeTimer
                );
            }

            toast.classList.remove(
                "show"
            );

            toast.classList.add(
                "hide"
            );

            window.setTimeout(
                function () {
                    toast.remove();
                },
                350
            );
        }

        toast
            .querySelector(
                ".toast-close"
            )
            ?.addEventListener(
                "click",
                removeToast
            );

        window.requestAnimationFrame(
            function () {
                toast.classList.add(
                    "show"
                );
            }
        );

        removeTimer =
            window.setTimeout(
                removeToast,
                duration
            );
    }

    /* =====================================================
       PESAN DI DALAM FORM
       ===================================================== */

    function showInlineMessage(
        message,
        type = "error"
    ) {
        if (!loginMessage) {
            return;
        }

        const icon =
            type === "success"
                ? "check-circle"
                : "exclamation-circle";

        loginMessage.innerHTML = `
            <i class="fas fa-${icon}"></i>

            <span>
                ${escapeHTML(message)}
            </span>
        `;

        loginMessage.className =
            `login-message show ${type}`;
    }

    function clearInlineMessage() {
        if (!loginMessage) {
            return;
        }

        loginMessage.innerHTML = "";

        loginMessage.className =
            "login-message";
    }

    /* =====================================================
       KONDISI INPUT
       ===================================================== */

    function setFieldState(
        input,
        state = ""
    ) {
        if (!input) {
            return;
        }

        input.classList.remove(
            "field-error",
            "field-success",
            "invalid"
        );

        if (state === "error") {
            input.classList.add(
                "field-error"
            );

            input.setAttribute(
                "aria-invalid",
                "true"
            );

            return;
        }

        if (state === "success") {
            input.classList.add(
                "field-success"
            );
        }

        input.setAttribute(
            "aria-invalid",
            "false"
        );
    }

    /* =====================================================
       ANIMASI FORM
       ===================================================== */

    function animateCard(
        animationClass
    ) {
        if (!loginCard) {
            return;
        }

        loginCard.classList.remove(
            "login-shake",
            "login-success"
        );

        /*
         * Memulai ulang animasi saat
         * class digunakan kembali.
         */
        void loginCard.offsetWidth;

        loginCard.classList.add(
            animationClass
        );

        window.setTimeout(
            function () {
                loginCard.classList.remove(
                    animationClass
                );
            },
            800
        );
    }

    /* =====================================================
       KONDISI TOMBOL LOGIN
       ===================================================== */

    function setLoading(
        isLoading,
        success = false
    ) {
        const buttonText =
            loginButton.querySelector(
                "span"
            );

        const buttonIcon =
            loginButton.querySelector(
                "i"
            );

        loginButton.disabled =
            isLoading;

        loginButton.classList.toggle(
            "loading",
            isLoading
        );

        loginButton.classList.toggle(
            "login-button-success",
            success
        );

        if (success) {
            if (buttonText) {
                buttonText.textContent =
                    "Login Berhasil";
            }

            if (buttonIcon) {
                buttonIcon.className =
                    "fas fa-check";
            }

            return;
        }

        if (buttonText) {
            buttonText.textContent =
                isLoading
                    ? "Memeriksa Akun..."
                    : "Masuk ke Dashboard";
        }

        if (buttonIcon) {
            buttonIcon.className =
                isLoading
                    ? "fas fa-spinner fa-spin"
                    : "fas fa-arrow-right";
        }
    }

    /* =====================================================
       MENYIMPAN SESSION ADMIN
       ===================================================== */

    function saveAdminSession(data) {
        const loginTime = Date.now();
        const expiresAt = new Date(data.expires_at).getTime();
        const session = {
            admin_id: data.admin_id,
            username: data.username,
            nama: data.nama || "Administrator EduSky",
            role: "admin",
            isLoggedIn: true,
            session_token: data.session_token,
            loginTime: loginTime,
            expiresAt: Number.isFinite(expiresAt) ? expiresAt : loginTime + (8 * 60 * 60 * 1000)
        };

        localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(session)
        );
    }

    /* =====================================================
       MEMBACA SESSION ADMIN
       ===================================================== */

    function readAdminSession() {
        const storedSession =
            localStorage.getItem(
                SESSION_KEY
            );

        if (!storedSession) {
            return null;
        }

        try {
            const session =
                JSON.parse(
                    storedSession
                );

            const validSession =
                session &&
                session.isLoggedIn === true &&
                session.role === "admin" &&
                Boolean(session.admin_id) &&
                Boolean(session.session_token) &&
                typeof session.expiresAt ===
                    "number" &&
                session.expiresAt >
                    Date.now();

            if (!validSession) {
                localStorage.removeItem(
                    SESSION_KEY
                );

                return null;
            }

            return session;
        } catch (error) {
            console.error(
                "Session admin tidak dapat dibaca:",
                error
            );

            localStorage.removeItem(
                SESSION_KEY
            );

            return null;
        }
    }

    /* =====================================================
       CEK SESSION LAMA
       ===================================================== */

    const existingSession =
        readAdminSession();

    if (existingSession) {
        window.location.replace(
            ADMIN_PAGE
        );

        return;
    }

    /* =====================================================
       USERNAME YANG DIINGAT
       ===================================================== */

    const rememberedUsername =
        localStorage.getItem(
            REMEMBER_KEY
        );

    if (rememberedUsername) {
        usernameInput.value =
            rememberedUsername;

        if (rememberAdmin) {
            rememberAdmin.checked =
                true;
        }
    }

    /* =====================================================
       TAMPILKAN ATAU SEMBUNYIKAN PASSWORD
       ===================================================== */

    togglePassword?.addEventListener(
        "click",
        function () {
            const passwordVisible =
                passwordInput.type ===
                "text";

            passwordInput.type =
                passwordVisible
                    ? "password"
                    : "text";

            const icon =
                togglePassword
                    .querySelector("i");

            if (icon) {
                icon.className =
                    passwordVisible
                        ? "far fa-eye"
                        : "far fa-eye-slash";
            }

            togglePassword.setAttribute(
                "aria-label",
                passwordVisible
                    ? "Tampilkan password"
                    : "Sembunyikan password"
            );
        }
    );

    /* =====================================================
       PERINGATAN CAPS LOCK
       ===================================================== */

    function updateCapsLock(
        event
    ) {
        const capsActive =
            event.getModifierState?.(
                "CapsLock"
            ) || false;

        capsWarning?.classList.toggle(
            "show",
            capsActive
        );
    }

    passwordInput.addEventListener(
        "keydown",
        updateCapsLock
    );

    passwordInput.addEventListener(
        "keyup",
        updateCapsLock
    );

    passwordInput.addEventListener(
        "blur",
        function () {
            capsWarning?.classList.remove(
                "show"
            );
        }
    );

    /* =====================================================
       HAPUS ERROR SAAT PENGGUNA MENGETIK
       ===================================================== */

    usernameInput.addEventListener(
        "input",
        function () {
            setFieldState(
                usernameInput
            );

            clearInlineMessage();
            clearToasts();
        }
    );

    passwordInput.addEventListener(
        "input",
        function () {
            setFieldState(
                passwordInput
            );

            clearInlineMessage();
            clearToasts();
        }
    );

    /* =====================================================
       PROSES LOGIN ADMIN
       ===================================================== */

    loginForm.addEventListener(
        "submit",
        async function (event) {
            event.preventDefault();

            if (loginInProgress) {
                return;
            }

            clearInlineMessage();
            clearToasts();

            setFieldState(
                usernameInput
            );

            setFieldState(
                passwordInput
            );

            const username =
                usernameInput.value.trim();

            const password =
                passwordInput.value;

            /* ---------------------------------------------
               USERNAME DAN PASSWORD KOSONG
               --------------------------------------------- */

            if (!username && !password) {
                setFieldState(
                    usernameInput,
                    "error"
                );

                setFieldState(
                    passwordInput,
                    "error"
                );

                animateCard(
                    "login-shake"
                );

                usernameInput.focus();

                showInlineMessage(
                    "Username dan password admin wajib diisi.",
                    "error"
                );

                showToast(
                    "Data Belum Lengkap",
                    "Masukkan username dan password admin.",
                    "error"
                );

                return;
            }

            /* ---------------------------------------------
               USERNAME KOSONG
               --------------------------------------------- */

            if (!username) {
                setFieldState(
                    usernameInput,
                    "error"
                );

                animateCard(
                    "login-shake"
                );

                usernameInput.focus();

                showInlineMessage(
                    "Username admin belum diisi.",
                    "error"
                );

                showToast(
                    "Username Belum Diisi",
                    "Masukkan username admin terlebih dahulu.",
                    "error"
                );

                return;
            }

            /* ---------------------------------------------
               PASSWORD KOSONG
               --------------------------------------------- */

            if (!password) {
                setFieldState(
                    passwordInput,
                    "error"
                );

                animateCard(
                    "login-shake"
                );

                passwordInput.focus();

                showInlineMessage(
                    "Password admin belum diisi.",
                    "error"
                );

                showToast(
                    "Password Belum Diisi",
                    "Masukkan password admin terlebih dahulu.",
                    "error"
                );

                return;
            }

            loginInProgress = true;
            setLoading(true);
            try {
                const { data, error } = await getSupabaseClient().rpc("login_admin", {
                    p_username: username,
                    p_password: password
                });
                if (error) throw error;
                if (!data?.admin_id || !data?.session_token) {
                    throw new Error("Username atau password admin tidak sesuai.");
                }

                if (rememberAdmin?.checked) localStorage.setItem(REMEMBER_KEY, username);
                else localStorage.removeItem(REMEMBER_KEY);

                saveAdminSession(data);
                setFieldState(usernameInput, "success");
                setFieldState(passwordInput, "success");
                setLoading(true, true);
                animateCard("login-success");
                showInlineMessage("Login berhasil. Mengalihkan ke dashboard admin...", "success");
                showToast("Login Berhasil", `Selamat datang, ${data.nama || "Administrator EduSky"}.`, "success", 4000);
                window.setTimeout(() => window.location.replace(ADMIN_PAGE), 700);
            } catch (error) {
                loginInProgress = false;
                setLoading(false);
                setFieldState(usernameInput, "error");
                setFieldState(passwordInput, "error");
                passwordInput.value = "";
                animateCard("login-shake");
                passwordInput.focus();
                const message = databaseMessage(error);
                showInlineMessage(message, "error");
                showToast("Login Admin Gagal", message, "error");
            }
        }
    );

    /* =====================================================
       TOMBOL LUPA PASSWORD
       ===================================================== */

    forgotPassword?.addEventListener(
        "click",
        function (event) {
            event.preventDefault();

            passwordInput.focus();
        }
    );
});
