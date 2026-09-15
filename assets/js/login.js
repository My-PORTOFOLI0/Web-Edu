"use strict";

document.addEventListener("DOMContentLoaded", async function () {
    /* =====================================================
       KONFIGURASI SUPABASE
       ===================================================== */

    const SUPABASE_URL =
        "https://viwbkbrikocybvqlgwoy.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";

    /*
     * Halaman tujuan setelah siswa berhasil login.
     */
    const HOME_PAGE = "pages/home/index.html";

    /* =====================================================
       ELEMEN HTML
       ===================================================== */

    const loginForm =
        document.getElementById("login-form");

    const usernameInput =
        document.getElementById("username");

    const passwordInput =
        document.getElementById("password");

    const rememberMe =
        document.getElementById("remember-me");

    const loginButton =
        document.getElementById("login-button");

    const loginMessage =
        document.getElementById("login-message");

    const togglePassword =
        document.getElementById("toggle-password");

    const forgotPassword =
        document.getElementById("forgot-password");

    const contactAdmin =
        document.getElementById("contact-admin");

    const levelButtons =
        document.querySelectorAll(
            ".level-btn:not(:disabled)"
        );

    /* =====================================================
       FUNGSI PESAN
       ===================================================== */

    function showMessage(
        message,
        type = "error"
    ) {
        if (!loginMessage) {
            return;
        }

        loginMessage.textContent = message;

        loginMessage.className =
            `login-message show ${type}`;
    }

    function clearMessage() {
        if (!loginMessage) {
            return;
        }

        loginMessage.textContent = "";

        loginMessage.className =
            "login-message";
    }

    /* =====================================================
       VALIDASI INPUT
       ===================================================== */

    function setInputInvalid(
        input,
        isInvalid
    ) {
        if (!input) {
            return;
        }

        input.classList.toggle(
            "invalid",
            isInvalid
        );

        input.setAttribute(
            "aria-invalid",
            String(isInvalid)
        );
    }

    /* =====================================================
       LOADING TOMBOL
       ===================================================== */

    function setLoading(isLoading) {
        if (!loginButton) {
            return;
        }

        const buttonText =
            loginButton.querySelector("span");

        const buttonIcon =
            loginButton.querySelector("i");

        loginButton.disabled = isLoading;

        loginButton.classList.toggle(
            "loading",
            isLoading
        );

        if (buttonText) {
            buttonText.textContent =
                isLoading
                    ? "Memeriksa Akun..."
                    : "Masuk Sekarang";
        }

        if (buttonIcon) {
            buttonIcon.className =
                isLoading
                    ? "fas fa-spinner fa-spin"
                    : "fas fa-arrow-right";
        }
    }

    /* =====================================================
       MEMUAT LIBRARY SUPABASE
       ===================================================== */

    async function loadSupabaseLibrary() {
        if (
            window.supabase &&
            typeof window.supabase.createClient ===
                "function"
        ) {
            return window.supabase;
        }

        await new Promise(function (
            resolve,
            reject
        ) {
            const existingScript =
                document.querySelector(
                    'script[src*="@supabase/supabase-js"]'
                );

            if (existingScript) {
                existingScript.addEventListener(
                    "load",
                    resolve,
                    { once: true }
                );

                existingScript.addEventListener(
                    "error",
                    function () {
                        reject(
                            new Error(
                                "Library Supabase gagal dimuat."
                            )
                        );
                    },
                    { once: true }
                );

                return;
            }

            const script =
                document.createElement("script");

            script.src =
                "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

            script.async = true;

            script.onload = resolve;

            script.onerror = function () {
                reject(
                    new Error(
                        "Library Supabase gagal dimuat."
                    )
                );
            };

            document.head.appendChild(script);
        });

        if (
            !window.supabase ||
            typeof window.supabase.createClient !==
                "function"
        ) {
            throw new Error(
                "Library Supabase tidak tersedia."
            );
        }

        return window.supabase;
    }

    /* =====================================================
       MEMBACA SESSION SISWA
       ===================================================== */

    function readStoredUser() {
        const storedUser =
            localStorage.getItem("edusky_user");

        if (!storedUser) {
            return null;
        }

        try {
            return JSON.parse(storedUser);
        } catch (error) {
            localStorage.removeItem(
                "edusky_user"
            );

            return null;
        }
    }

    /* =====================================================
       NORMALISASI HASIL RPC
       ===================================================== */

    function normalizeAccount(data) {
        let account = data;

        /*
         * Jika fungsi mengembalikan array.
         */
        if (Array.isArray(account)) {
            account = account[0] || null;
        }

        /*
         * Jika fungsi mengembalikan JSON string.
         */
        if (typeof account === "string") {
            try {
                account = JSON.parse(account);
            } catch (error) {
                return null;
            }
        }

        if (
            !account ||
            typeof account !== "object" ||
            Array.isArray(account)
        ) {
            return null;
        }

        return account;
    }

    /* =====================================================
       INISIAL NAMA SISWA
       ===================================================== */

    function createInitials(name) {
        return (
            String(name || "Siswa")
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map(function (word) {
                    return word
                        .charAt(0)
                        .toUpperCase();
                })
                .join("") || "SW"
        );
    }

    /* =====================================================
       MEMBENTUK DATA SESSION
       Sesuai tabel public.akunsiswa
       ===================================================== */

    function buildUserSession(account) {
        const namaSiswa =
            account.nama_siswa ||
            account.username ||
            "Siswa";

        const initials =
            createInitials(namaSiswa);

        const defaultPhoto =
            `https://placehold.co/150/38BDF8/FFFFFF?text=${encodeURIComponent(initials)}`;

        return {
            id:
                account.id || null,

            nis:
                account.nis || "",

            username:
                account.username || "",

            nama:
                namaSiswa,

            nama_siswa:
                namaSiswa,

            jenjang:
                account.jenjang || "SD",

            kelas:
                account.kelas || "",

            sekolah:
                account.sekolah || "",

            foto:
                account.foto || defaultPhoto,

            status:
                account.status || "aktif",

            terakhir_login:
                account.terakhir_login ||
                new Date().toISOString(),

            created_at:
                account.created_at || null,

            updated_at:
                account.updated_at || null,

            role:
                "siswa",

            source:
                "supabase-akunsiswa",

            isLoggedIn:
                true,

            loginTime:
                new Date().toISOString(),

            session_token:
                account.session_token || null,

            session_expires_at:
                account.session_expires_at || null,

            preferensi:
                account.preferensi || {
                    tema: "light",
                    notifikasi: true,
                    suara: true
                }
        };
    }

    /* =====================================================
       MEMERIKSA ELEMEN FORM
       ===================================================== */

    if (
        !loginForm ||
        !usernameInput ||
        !passwordInput ||
        !loginButton
    ) {
        console.error(
            "Elemen form login tidak lengkap."
        );

        showMessage(
            "Form login tidak dapat dijalankan karena elemen HTML tidak lengkap.",
            "error"
        );

        return;
    }

    /* =====================================================
       MEMERIKSA SESSION LAMA
       ===================================================== */

    const savedUser =
        readStoredUser();

    if (
        savedUser &&
        savedUser.isLoggedIn === true &&
        savedUser.source ===
            "supabase-akunsiswa" &&
        savedUser.status === "aktif"
    ) {
        window.location.replace(
            HOME_PAGE
        );

        return;
    }

    /*
     * Menghapus session lama yang bukan berasal
     * dari database Supabase.
     */
    if (
        savedUser &&
        savedUser.source !==
            "supabase-akunsiswa"
    ) {
        localStorage.removeItem(
            "edusky_user"
        );
    }

    /* =====================================================
       INGAT USERNAME
       ===================================================== */

    const rememberedUsername =
        localStorage.getItem(
            "edusky_remembered_username"
        );

    if (rememberedUsername) {
        usernameInput.value =
            rememberedUsername;

        if (rememberMe) {
            rememberMe.checked = true;
        }
    }

    /* =====================================================
       MEMBUAT KONEKSI SUPABASE
       ===================================================== */

    let supabaseClient;

    try {
        showMessage(
            "Menghubungkan ke database...",
            "info"
        );

        const supabaseLibrary =
            await loadSupabaseLibrary();

        supabaseClient =
            supabaseLibrary.createClient(
                SUPABASE_URL,
                SUPABASE_PUBLISHABLE_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

        clearMessage();
    } catch (error) {
        console.error(
            "Supabase initialization error:",
            error
        );

        showMessage(
            "Database gagal dimuat. Periksa koneksi internet dan konfigurasi Supabase.",
            "error"
        );

        loginButton.disabled = true;

        return;
    }

    /* =====================================================
       PILIHAN JENJANG
       ===================================================== */

    levelButtons.forEach(
        function (button) {
            button.addEventListener(
                "click",
                function () {
                    levelButtons.forEach(
                        function (item) {
                            item.classList.remove(
                                "active"
                            );

                            item.setAttribute(
                                "aria-pressed",
                                "false"
                            );
                        }
                    );

                    button.classList.add(
                        "active"
                    );

                    button.setAttribute(
                        "aria-pressed",
                        "true"
                    );
                }
            );
        }
    );

    /* =====================================================
       TAMPILKAN / SEMBUNYIKAN PASSWORD
       ===================================================== */

    if (togglePassword) {
        togglePassword.addEventListener(
            "click",
            function () {
                const passwordIsVisible =
                    passwordInput.type ===
                    "text";

                passwordInput.type =
                    passwordIsVisible
                        ? "password"
                        : "text";

                const icon =
                    togglePassword.querySelector(
                        "i"
                    );

                if (icon) {
                    icon.className =
                        passwordIsVisible
                            ? "far fa-eye"
                            : "far fa-eye-slash";
                }

                togglePassword.setAttribute(
                    "aria-label",
                    passwordIsVisible
                        ? "Tampilkan password"
                        : "Sembunyikan password"
                );
            }
        );
    }

    /* =====================================================
       MENGHAPUS ERROR SAAT MENGETIK
       ===================================================== */

    usernameInput.addEventListener(
        "input",
        function () {
            setInputInvalid(
                usernameInput,
                false
            );

            clearMessage();
        }
    );

    passwordInput.addEventListener(
        "input",
        function () {
            setInputInvalid(
                passwordInput,
                false
            );

            clearMessage();
        }
    );

    /* =====================================================
       PROSES LOGIN SISWA
       ===================================================== */

    loginForm.addEventListener(
        "submit",
        async function (event) {
            event.preventDefault();

            clearMessage();

            const identifier =
                usernameInput.value.trim();

            const password =
                passwordInput.value;

            let formIsValid = true;

            if (!identifier) {
                setInputInvalid(
                    usernameInput,
                    true
                );

                formIsValid = false;
            }

            if (!password) {
                setInputInvalid(
                    passwordInput,
                    true
                );

                formIsValid = false;
            }

            if (!formIsValid) {
                showMessage(
                    "NIS/username dan password wajib diisi.",
                    "error"
                );

                if (!identifier) {
                    usernameInput.focus();
                } else {
                    passwordInput.focus();
                }

                return;
            }

            setLoading(true);

            try {
                /*
                 * Memanggil fungsi:
                 *
                 * public.login_siswa(
                 *   p_identifier TEXT,
                 *   p_password TEXT
                 * )
                 */
                const {
                    data,
                    error
                } = await supabaseClient.rpc(
                    "login_siswa",
                    {
                        p_identifier:
                            identifier,

                        p_password:
                            password
                    }
                );

                if (error) {
                    console.error(
                        "Supabase login error:",
                        error
                    );

                    const errorCode =
                        String(
                            error.code || ""
                        );

                    const errorMessage =
                        String(
                            error.message || ""
                        ).toLowerCase();

                    if (
                        errorCode === "PGRST202" ||
                        errorMessage.includes(
                            "could not find the function"
                        )
                    ) {
                        throw new Error(
                            "Fungsi login_siswa belum ditemukan. Jalankan query fungsi login pada Supabase SQL Editor."
                        );
                    }

                    if (
                        errorCode === "42501" ||
                        errorMessage.includes(
                            "permission denied"
                        )
                    ) {
                        throw new Error(
                            "Fungsi login_siswa belum memiliki izin akses untuk pengguna anon."
                        );
                    }

                    if (
                        errorCode === "PGRST301" ||
                        errorMessage.includes("jwt")
                    ) {
                        throw new Error(
                            "Publishable key Supabase tidak valid."
                        );
                    }

                    throw new Error(
                        error.message ||
                        "Terjadi kesalahan ketika menghubungi database."
                    );
                }

                const account =
                    normalizeAccount(data);

                /*
                 * Data null berarti:
                 * - NIS/username tidak ditemukan
                 * - password salah
                 * - akun berstatus nonaktif
                 */
                if (!account) {
                    setInputInvalid(
                        usernameInput,
                        true
                    );

                    setInputInvalid(
                        passwordInput,
                        true
                    );

                    passwordInput.value = "";

                    passwordInput.focus();

                    showMessage(
                        "NIS/username atau password salah.",
                        "error"
                    );

                    return;
                }

                /*
                 * Pemeriksaan status akun.
                 */
                if (
                    account.status &&
                    account.status !== "aktif"
                ) {
                    localStorage.removeItem(
                        "edusky_user"
                    );

                    showMessage(
                        "Akun siswa sedang nonaktif. Silakan hubungi admin.",
                        "error"
                    );

                    return;
                }

                /*
                 * Simpan username jika pilihan
                 * Ingat Saya aktif.
                 */
                if (
                    rememberMe &&
                    rememberMe.checked
                ) {
                    localStorage.setItem(
                        "edusky_remembered_username",
                        identifier
                    );
                } else {
                    localStorage.removeItem(
                        "edusky_remembered_username"
                    );
                }

                /*
                 * Membentuk dan menyimpan session.
                 */
                const userSession =
                    buildUserSession(account);

                localStorage.setItem(
                    "edusky_user",
                    JSON.stringify(userSession)
                );

                showMessage(
                    `Login berhasil. Selamat datang, ${userSession.nama_siswa}!`,
                    "success"
                );

                /*
                 * Pindah ke halaman home siswa.
                 */
                window.setTimeout(
                    function () {
                        window.location.replace(
                            HOME_PAGE
                        );
                    },
                    700
                );
            } catch (error) {
                console.error(
                    "Login error:",
                    error
                );

                const message =
                    error instanceof Error
                        ? error.message
                        : "Terjadi kesalahan saat login.";

                const lowerMessage =
                    message.toLowerCase();

                if (
                    lowerMessage.includes(
                        "failed to fetch"
                    ) ||
                    lowerMessage.includes(
                        "networkerror"
                    ) ||
                    lowerMessage.includes(
                        "load failed"
                    )
                ) {
                    showMessage(
                        "Tidak dapat menghubungi Supabase. Periksa koneksi internet dan URL proyek.",
                        "error"
                    );
                } else {
                    showMessage(
                        message,
                        "error"
                    );
                }
            } finally {
                setLoading(false);
            }
        }
    );

    /* =====================================================
       LUPA PASSWORD
       ===================================================== */

    if (forgotPassword) {
        forgotPassword.addEventListener(
            "click",
            function () {
                if (window.EduSkySupport) {
                    window.EduSkySupport.open({
                        category: "akun_login"
                    });
                    return;
                }

                showMessage("Silakan hubungi admin atau guru untuk mengatur ulang password.", "info");
            }
        );
    }

    /* =====================================================
       HUBUNGI ADMIN
       ===================================================== */

    if (contactAdmin) {
        contactAdmin.addEventListener(
            "click",
            function () {
                if (window.EduSkySupport) {
                    window.EduSkySupport.open({ category: "akun_login" });
                    return;
                }

                showMessage("Silakan hubungi wali kelas atau administrator sekolah.", "info");
            }
        );
    }
});
