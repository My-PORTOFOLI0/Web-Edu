/* =========================================================
   CRUD AKUN SISWA - SUPABASE + SESI ADMIN DATABASE
   Tempelkan di PALING BAWAH admin.js.
   Hapus blok CRUD siswa lama agar event tidak berjalan dua kali.
   ========================================================= */

(function () {
    "use strict";

    /*
     * Mencegah kode dijalankan lebih dari satu kali.
     */
    if (window.__EDUSKY_STUDENT_CRUD_LOADED__) {
        return;
    }

    window.__EDUSKY_STUDENT_CRUD_LOADED__ = true;

    /* =====================================================
       KONFIGURASI
       ===================================================== */

    const SUPABASE_URL =
        "https://viwbkbrikocybvqlgwoy.supabase.co";

    const SUPABASE_KEY =
        "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";

    /*
     * Struktur folder:
     *
     * WEB EDU/
     * ├── admin.html
     * └── pages/admin-login/index.html
     */
    const ADMIN_LOGIN_PAGE =
        "pages/admin-login/index.html";

    const ADMIN_SESSION_KEY =
        "edusky_admin_session";

    const ADMIN_ACTIVE_PAGE_KEY =
        "edusky_admin_active_page";

    const PROFILE_UPDATE_KEY =
        "edusky_profile_updated";

    const SYNC_CHANNEL_NAME =
        "edusky-sync";

    const STUDENT_CLASS_STORAGE_KEY =
        "edusky_student_classes";

    const STUDENT_LIST_CACHE_KEY =
        "edusky_admin_student_cache";

    const STUDENT_PASSWORD_STORAGE_KEY =
        "edusky_admin_student_passwords";

    let supabaseClient = null;
    let editingId = null;
    let studentCache = [];
    let studentClassCache = [];
    let selectedStudentClass = "";
    let studentClassBackendReady = false;
    let studentClassBackendChecked = false;
    let isSavingClass = false;

    let isSaving = false;
    let isDeleting = false;
    let isRefreshing = false;

    let queuedKeyword = null;
    let searchTimer = null;
    let profileSyncStarted = false;
    let lastProfileSyncStamp = "";

    const $ = function (id) {
        return document.getElementById(id);
    };

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

    function normalizeArray(data) {
        if (data == null) {
            return [];
        }

        if (typeof data === "string") {
            try {
                return normalizeArray(
                    JSON.parse(data)
                );
            } catch (error) {
                return [];
            }
        }

        if (Array.isArray(data)) {
            return data.filter(Boolean);
        }

        if (typeof data === "object") {
            if (Array.isArray(data.data)) {
                return data.data.filter(Boolean);
            }

            return [data];
        }

        return [];
    }

    function isNetworkDatabaseError(error) {
        const message = String(
            error?.message || error || ""
        ).toLowerCase();

        return (
            message.includes("failed to fetch") ||
            message.includes("networkerror") ||
            message.includes("load failed") ||
            message.includes("network request")
        );
    }

    function readStudentCache() {
        try {
            return normalizeArray(
                JSON.parse(
                    localStorage.getItem(
                        STUDENT_LIST_CACHE_KEY
                    ) || "[]"
                )
            );
        } catch (error) {
            return [];
        }
    }

    function writeStudentCache(students) {
        try {
            localStorage.setItem(
                STUDENT_LIST_CACHE_KEY,
                JSON.stringify(students)
            );
        } catch (error) {
            console.warn(
                "Cache siswa tidak dapat disimpan:",
                error
            );
        }
    }

    function readStudentPasswords() {
        try {
            const records = JSON.parse(
                localStorage.getItem(
                    STUDENT_PASSWORD_STORAGE_KEY
                ) || "{}"
            );

            return (
                records &&
                typeof records === "object" &&
                !Array.isArray(records)
            )
                ? records
                : {};
        } catch (error) {
            return {};
        }
    }

    function writeStudentPasswords(records) {
        try {
            localStorage.setItem(
                STUDENT_PASSWORD_STORAGE_KEY,
                JSON.stringify(records || {})
            );
        } catch (error) {
            console.warn(
                "Catatan password siswa tidak dapat disimpan:",
                error
            );
        }
    }

    function rememberStudentPassword(student, password) {
        const cleanPassword =
            String(password || "");

        if (!student?.id || !cleanPassword) {
            return;
        }

        const records =
            readStudentPasswords();

        records[String(student.id)] = {
            password: cleanPassword,
            username: student.username || "",
            nis: student.nis || "",
            updatedAt: new Date().toISOString()
        };

        writeStudentPasswords(records);
    }

    function updateStudentPasswordIdentity(student) {
        if (!student?.id) {
            return;
        }

        const records =
            readStudentPasswords();

        const key =
            String(student.id);

        if (!records[key]) {
            return;
        }

        records[key].username =
            student.username || records[key].username || "";

        records[key].nis =
            student.nis || records[key].nis || "";

        writeStudentPasswords(records);
    }

    function forgetStudentPassword(id) {
        const records =
            readStudentPasswords();

        const key =
            String(id || "");

        if (!records[key]) {
            return;
        }

        delete records[key];
        writeStudentPasswords(records);
    }

    function studentPasswordRecord(studentOrId) {
        const id =
            typeof studentOrId === "object"
                ? studentOrId?.id
                : studentOrId;

        if (!id) {
            return null;
        }

        const record =
            readStudentPasswords()[String(id)];

        return record?.password
            ? record
            : null;
    }

    function formatStudentPasswordDate(value) {
        const date =
            new Date(value || "");

        if (Number.isNaN(date.getTime())) {
            return "belum diketahui";
        }

        try {
            return new Intl.DateTimeFormat(
                "id-ID",
                {
                    dateStyle: "medium",
                    timeStyle: "short"
                }
            ).format(date);
        } catch (error) {
            return date.toLocaleString("id-ID");
        }
    }

    function normalizeObject(data) {
        if (data == null) {
            return null;
        }

        if (typeof data === "string") {
            try {
                return normalizeObject(
                    JSON.parse(data)
                );
            } catch (error) {
                return null;
            }
        }

        if (Array.isArray(data)) {
            return normalizeObject(
                data[0] ?? null
            );
        }

        if (typeof data === "object") {
            if (
                data.data &&
                typeof data.data === "object" &&
                !Array.isArray(data.data)
            ) {
                return data.data;
            }

            return data;
        }

        return null;
    }

    function publishStudentUpdate(account) {
        if (!account?.id) {
            return;
        }

        const payload = {
            type: "profile-updated",
            account: account,
            studentId: account.id,
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem(
            PROFILE_UPDATE_KEY,
            JSON.stringify(payload)
        );

        try {
            const activeStudent = JSON.parse(
                localStorage.getItem("edusky_user") || "null"
            );

            if (
                activeStudent &&
                String(activeStudent.id) === String(account.id)
            ) {
                const updatedStudent = {
                    ...activeStudent,
                    ...account,
                    nama: account.nama_siswa || activeStudent.nama,
                    nama_siswa: account.nama_siswa || activeStudent.nama_siswa,
                    session_token: activeStudent.session_token,
                    session_expires_at: activeStudent.session_expires_at
                };

                delete updatedStudent.password_hash;

                localStorage.setItem(
                    "edusky_user",
                    JSON.stringify(updatedStudent)
                );
            }
        } catch (error) {
            console.warn(
                "Sesi siswa lokal tidak dapat disinkronkan:",
                error
            );
        }

        if ("BroadcastChannel" in window) {
            try {
                const channel = new BroadcastChannel(
                    SYNC_CHANNEL_NAME
                );

                channel.postMessage(payload);
                channel.close();
            } catch (error) {
                console.warn(
                    "Perubahan siswa tidak dapat dikirim ke tab lain:",
                    error
                );
            }
        }
    }

    function databaseError(error) {
        const code =
            String(error?.code || "");

        const message =
            String(
                error?.message ||
                "Terjadi kesalahan saat mengakses database."
            );

        const text =
            message.toLowerCase();

        if (
            code === "23505" ||
            text.includes("duplicate") ||
            text.includes("already exists")
        ) {
            if (
                text.includes("nis") ||
                text.includes(
                    "akunsiswa_nis_unique"
                )
            ) {
                return "NIS sudah digunakan oleh akun lain.";
            }

            if (
                text.includes("username") ||
                text.includes(
                    "akunsiswa_username_unique"
                )
            ) {
                return "Username sudah digunakan oleh akun lain.";
            }

            return "NIS atau username sudah digunakan oleh akun lain.";
        }

        if (
            code === "23514" ||
            text.includes(
                "akunsiswa_status_check"
            )
        ) {
            return "Status akun siswa tidak valid.";
        }

        if (
            code === "PGRST202" ||
            text.includes(
                "could not find the function"
            )
        ) {
            return "Fungsi CRUD akun siswa belum tersedia. Jalankan file supabase/akunsiswa_setup.sql di Supabase SQL Editor.";
        }

        if (
            code === "PGRST203" ||
            text.includes(
                "multiple functions"
            ) ||
            text.includes("ambiguous")
        ) {
            return "Terdapat fungsi CRUD akun siswa yang duplikat di Supabase.";
        }

        if (
            code === "42501" ||
            text.includes(
                "permission denied"
            ) ||
            text.includes(
                "row-level security"
            )
        ) {
            return "Akses database ditolak. Periksa izin fungsi CRUD dan RLS Supabase.";
        }

        if (
            text.includes("failed to fetch") ||
            text.includes("networkerror") ||
            text.includes("load failed")
        ) {
            return "Tidak dapat terhubung ke database. Periksa koneksi internet.";
        }

        return message;
    }

    /* =====================================================
       NOTIFIKASI
       ===================================================== */

    function showAlert(
        message,
        type = "success"
    ) {
        let container =
            $(
                "studentCrudAlertContainer"
            );

        if (!container) {
            container =
                document.createElement("div");

            container.id =
                "studentCrudAlertContainer";

            const target =
                document.querySelector(
                    ".admin-content"
                ) || document.body;

            target.prepend(container);
        }

        const alert =
            document.createElement("div");

        const icon =
            type === "success"
                ? "check-circle"
                : type === "error"
                    ? "exclamation-circle"
                    : "info-circle";

        alert.className =
            `alert alert-${type}`;

        alert.innerHTML = `
            <i class="fas fa-${icon}"></i>

            <span>
                ${escapeHTML(message)}
            </span>

            <button
                type="button"
                class="alert-close"
                aria-label="Tutup"
            >
                <i class="fas fa-times"></i>
            </button>
        `;

        let removed = false;

        function removeAlert() {
            if (removed) {
                return;
            }

            removed = true;
            alert.remove();
        }

        alert
            .querySelector(
                ".alert-close"
            )
            ?.addEventListener(
                "click",
                removeAlert
            );

        container.prepend(alert);

        window.setTimeout(
            removeAlert,
            5000
        );
    }

    /* =====================================================
       MODAL DAN TOMBOL
       ===================================================== */

    function setValue(id, value) {
        const element = $(id);

        if (element) {
            element.value =
                value ?? "";
        }
    }

    function openModal() {
        $("siswaModal")
            ?.classList.add("active");
    }

    function closeModal() {
        $("siswaModal")
            ?.classList.remove("active");
    }

    function openStudentClassModal() {
        $("kelasSiswaForm")?.reset();
        $("kelasSiswaModal")
            ?.classList.add("active");

        window.setTimeout(function () {
            $("kelasSiswaNama")?.focus();
        }, 50);
    }

    function closeStudentClassModal() {
        $("kelasSiswaModal")
            ?.classList.remove("active");
    }

    function setClassSaveLoading(loading) {
        const button = $("saveKelasSiswaBtn");

        if (!button) {
            return;
        }

        button.disabled = loading;
        button.innerHTML = loading
            ? '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'
            : '<i class="fas fa-save"></i> Simpan Kelas';
    }

    function setSaveLoading(loading) {
        const button =
            $("saveSiswaBtn");

        if (!button) {
            return;
        }

        button.disabled = loading;

        button.classList.toggle(
            "loading",
            loading
        );

        button.innerHTML =
            loading
                ? `
                    <i class="fas fa-spinner fa-spin"></i>
                    Menyimpan...
                  `
                : `
                    <i class="fas fa-save"></i>
                    Simpan Siswa
                  `;
    }

    /* =====================================================
       SESSION ADMIN SUPABASE
       ===================================================== */

    function readAdminSession() {
        const raw =
            localStorage.getItem(
                ADMIN_SESSION_KEY
            );

        if (!raw) {
            return null;
        }

        try {
            const session =
                JSON.parse(raw);

            const valid =
                session &&
                session.isLoggedIn === true &&
                session.role === "admin" &&
                Boolean(session.admin_id) &&
                Boolean(session.session_token) &&
                !(
                    typeof session.expiresAt ===
                        "number" &&
                    session.expiresAt <=
                        Date.now()
                );

            if (!valid) {
                throw new Error(
                    "Session admin tidak valid."
                );
            }

            return session;
        } catch (error) {
            localStorage.removeItem(
                ADMIN_SESSION_KEY
            );

            return null;
        }
    }

    function checkAdmin() {
        const session =
            readAdminSession();

        if (!session) {
            window.location.replace(
                ADMIN_LOGIN_PAGE
            );

            return false;
        }

        const adminName =
            session.nama ||
            session.username ||
            "Administrator";

        const nameElement =
            document.querySelector(
                ".user-profile span"
            );

        const avatarElement =
            document.querySelector(
                ".user-avatar"
            );

        if (nameElement) {
            nameElement.textContent =
                adminName;
        }

        if (avatarElement) {
            avatarElement.textContent =
                String(adminName)
                    .trim()
                    .charAt(0)
                    .toUpperCase() ||
                "A";
        }

        return true;
    }

    async function logoutAdmin() {
        const session = readAdminSession();
        try {
            if (session?.admin_id && session?.session_token && supabaseClient) {
                await supabaseClient.rpc("logout_admin", {
                    p_admin_id: session.admin_id,
                    p_session_token: session.session_token
                });
            }
        } catch (error) {
            console.warn("Sesi admin database belum dapat diakhiri:", error);
        } finally {
            localStorage.removeItem(ADMIN_SESSION_KEY);
            window.location.replace(ADMIN_LOGIN_PAGE);
        }
    }

    /* =====================================================
       MEMUAT SUPABASE
       ===================================================== */

    function waitForSupabase(
        timeout = 8000
    ) {
        return new Promise(
            function (resolve, reject) {
                const startedAt =
                    Date.now();

                const timer =
                    window.setInterval(
                        function () {
                            if (
                                window.supabase &&
                                typeof window
                                    .supabase
                                    .createClient ===
                                    "function"
                            ) {
                                window.clearInterval(
                                    timer
                                );

                                resolve(
                                    window.supabase
                                );

                                return;
                            }

                            if (
                                Date.now() -
                                    startedAt >=
                                timeout
                            ) {
                                window.clearInterval(
                                    timer
                                );

                                reject(
                                    new Error(
                                        "Library Supabase gagal dimuat."
                                    )
                                );
                            }
                        },
                        50
                    );
            }
        );
    }

    async function loadSupabase() {
        if (
            window.supabase &&
            typeof window.supabase
                .createClient === "function"
        ) {
            return window.supabase;
        }

        let script =
            document.querySelector(
                'script[src*="@supabase/supabase-js"]'
            );

        if (!script) {
            script =
                document.createElement(
                    "script"
                );

            script.src =
                "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

            script.async = true;

            document.head.appendChild(
                script
            );
        }

        return waitForSupabase();
    }

    function ensureSupabaseReady() {
        if (!supabaseClient) {
            throw new Error(
                "Koneksi database belum tersedia."
            );
        }
    }

    /* =====================================================
       MENYIAPKAN FORM SISWA
       ===================================================== */

    function prepareForm() {
        const form =
            $("siswaForm");

        if (!form) {
            throw new Error(
                "Form siswa dengan ID siswaForm tidak ditemukan."
            );
        }

        form.innerHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label for="siswaNama">
                        Nama Lengkap *
                    </label>

                    <input
                        type="text"
                        id="siswaNama"
                        maxlength="150"
                        placeholder="Masukkan nama lengkap"
                        required
                    >
                </div>

                <div class="form-group">
                    <label for="siswaNIS">
                        Nomor Induk Siswa (NIS) *
                    </label>

                    <input
                        type="text"
                        id="siswaNIS"
                        maxlength="50"
                        placeholder="Contoh: SD2026001"
                        required
                    >
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="siswaUsername">
                        Username *
                    </label>

                    <input
                        type="text"
                        id="siswaUsername"
                        maxlength="50"
                        placeholder="Contoh: siswa01"
                        autocomplete="off"
                        required
                    >
                </div>

                <div class="form-group">
                    <label for="siswaPassword">
                        Password

                        <span id="passwordRequiredMark">
                            *
                        </span>
                    </label>

                    <input
                        type="password"
                        id="siswaPassword"
                        minlength="6"
                        placeholder="Minimal 6 karakter"
                        autocomplete="new-password"
                    >

                    <small
                        id="passwordHelp"
                        class="text-muted"
                    >
                        Password wajib untuk akun baru. Password lama tidak dapat dipulihkan dari database.
                    </small>

                    <div
                        id="siswaSavedPasswordBox"
                        class="student-password-current"
                        hidden
                    ></div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="siswaJenjang">
                        Jenjang *
                    </label>

                    <select
                        id="siswaJenjang"
                        required
                    >
                        <option value="SD">
                            SD
                        </option>

                        <option value="SMP">
                            SMP
                        </option>

                        <option value="SMA">
                            SMA
                        </option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="siswaKelas">
                        Kelas *
                    </label>

                    <input
                        type="text"
                        id="siswaKelas"
                        list="studentClassOptions"
                        maxlength="30"
                        placeholder="Contoh: 5A"
                        required
                    >
                    <datalist id="studentClassOptions"></datalist>
                </div>
            </div>

            <div class="form-group">
                <label for="siswaSekolah">
                    Nama Sekolah
                </label>

                <input
                    type="text"
                    id="siswaSekolah"
                    maxlength="200"
                    placeholder="Contoh: SD EduSky Indonesia"
                >
            </div>

            <div class="form-group">
                <label for="siswaFoto">
                    URL Foto Profil
                </label>

                <input
                    type="text"
                    id="siswaFoto"
                    placeholder="https://contoh.com/foto.jpg"
                >
            </div>

            <div class="form-group">
                <label
                    style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    "
                >
                    <input
                        type="checkbox"
                        id="siswaAktif"
                        checked
                    >

                    <span>
                        Akun Siswa Aktif
                    </span>
                </label>
            </div>
        `;
    }

    function prepareTable() {
        const tableHead =
            document.querySelector(
                "#siswaPage table.table thead"
            );

        if (!tableHead) {
            return;
        }

        tableHead.innerHTML = `
            <tr>
                <th>No</th>
                <th>Nama Siswa</th>
                <th>NIS/Username</th>
                <th>Jenjang/Kelas</th>
                <th>Sekolah</th>
                <th>Status</th>
                <th>Aksi</th>
            </tr>
        `;
    }

    /* =====================================================
       CRUD SUPABASE
       ===================================================== */

    async function fetchStudents() {
        ensureSupabaseReady();

        let response;

        try {
            response = await supabaseClient.rpc(
                "admin_list_akun_siswa",
                {
                    p_search: ""
                }
            );
        } catch (error) {
            if (isNetworkDatabaseError(error)) {
                studentCache = readStudentCache();
                return studentCache;
            }

            throw error;
        }

        const { data, error } = response;

        if (error) {
            if (isNetworkDatabaseError(error)) {
                studentCache = readStudentCache();
                return studentCache;
            }

            throw new Error(
                databaseError(error)
            );
        }

        studentCache =
            normalizeArray(data);

        writeStudentCache(studentCache);

        return studentCache;
    }

    async function getStudent(id) {
        ensureSupabaseReady();

        if (!id) {
            throw new Error(
                "ID siswa tidak valid."
            );
        }

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "admin_get_akun_siswa",
                {
                    p_id: id
                }
            );

        if (error) {
            throw new Error(
                databaseError(error)
            );
        }

        return normalizeObject(data);
    }

    async function createStudent(
        student
    ) {
        ensureSupabaseReady();

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "admin_create_akun_siswa",
                {
                    p_nis:
                        student.nis,

                    p_username:
                        student.username,

                    p_password:
                        student.password,

                    p_nama_siswa:
                        student.nama_siswa,

                    p_jenjang:
                        student.jenjang,

                    p_kelas:
                        student.kelas ||
                        null,

                    p_sekolah:
                        student.sekolah ||
                        null,

                    p_foto:
                        student.foto ||
                        null,

                    p_status:
                        student.status
                }
            );

        if (error) {
            throw new Error(
                databaseError(error)
            );
        }

        return normalizeObject(data);
    }

    async function updateStudent(
        id,
        student
    ) {
        ensureSupabaseReady();

        if (!id) {
            throw new Error(
                "ID siswa tidak valid."
            );
        }

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "admin_update_akun_siswa",
                {
                    p_id:
                        id,

                    p_nis:
                        student.nis,

                    p_username:
                        student.username,

                    /*
                     * Kosong/null berarti password lama
                     * tidak diubah.
                     */
                    p_password:
                        student.password ||
                        null,

                    p_nama_siswa:
                        student.nama_siswa,

                    p_jenjang:
                        student.jenjang,

                    p_kelas:
                        student.kelas ||
                        null,

                    p_sekolah:
                        student.sekolah ||
                        null,

                    p_foto:
                        student.foto ||
                        null,

                    p_status:
                        student.status
                }
            );

        if (error) {
            throw new Error(
                databaseError(error)
            );
        }

        return normalizeObject(data);
    }

    async function removeStudent(id) {
        ensureSupabaseReady();

        if (!id) {
            throw new Error(
                "ID siswa tidak valid."
            );
        }

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "admin_delete_akun_siswa",
                {
                    p_id: id
                }
            );

        if (error) {
            throw new Error(
                databaseError(error)
            );
        }

        return data;
    }

    /* =====================================================
       KATALOG KELAS SISWA
       ===================================================== */

    function normalizeStudentClass(item) {
        const name = String(
            item?.nama || item?.name || ""
        ).trim();

        if (!name) {
            return null;
        }

        const level = String(
            item?.jenjang || "SD"
        ).trim().toUpperCase();

        return {
            id: String(
                item?.id ||
                "local-" + name.toLowerCase()
            ),
            nama: name,
            jenjang: ["SD", "SMP", "SMA"].includes(level)
                ? level
                : "SD",
            local: Boolean(item?.local)
        };
    }

    function readLocalStudentClasses() {
        try {
            const parsed = JSON.parse(
                localStorage.getItem(
                    STUDENT_CLASS_STORAGE_KEY
                ) || "[]"
            );

            return normalizeArray(parsed)
                .map(normalizeStudentClass)
                .filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    function writeLocalStudentClasses(classes) {
        try {
            localStorage.setItem(
                STUDENT_CLASS_STORAGE_KEY,
                JSON.stringify(classes)
            );
        } catch (error) {
            console.warn(
                "Katalog kelas lokal tidak dapat disimpan:",
                error
            );
        }
    }

    function mergeStudentClasses(classes) {
        const unique = new Map();

        classes
            .map(normalizeStudentClass)
            .filter(Boolean)
            .forEach(function (item) {
                const key = item.nama.toLowerCase();

                if (!unique.has(key)) {
                    unique.set(key, item);
                }
            });

        return Array.from(unique.values());
    }

    function studentClassCatalog() {
        const derived = studentCache
            .map(function (student) {
                const name = String(
                    student?.kelas || ""
                ).trim();

                if (!name) {
                    return null;
                }

                return {
                    id: "derived-" + name.toLowerCase(),
                    nama: name,
                    jenjang: student?.jenjang || "SD"
                };
            })
            .filter(Boolean);

        return mergeStudentClasses([
            ...studentClassCache,
            ...derived
        ]);
    }

    function isMissingStudentClassBackend(error) {
        const code = String(error?.code || "");
        const message = String(
            error?.message || ""
        ).toLowerCase();

        return (
            code === "PGRST202" ||
            message.includes("admin_list_kelas_siswa") ||
            message.includes("admin_create_kelas_siswa") ||
            message.includes("could not find the function")
        );
    }

    async function fetchStudentClasses() {
        const localClasses =
            readLocalStudentClasses();

        if (
            studentClassBackendChecked &&
            !studentClassBackendReady
        ) {
            studentClassCache =
                mergeStudentClasses(localClasses);
            return studentClassCache;
        }

        ensureSupabaseReady();

        let response;

        try {
            response = await supabaseClient.rpc(
                "admin_list_kelas_siswa"
            );
        } catch (error) {
            if (isNetworkDatabaseError(error)) {
                studentClassBackendChecked = false;
                studentClassCache =
                    mergeStudentClasses(localClasses);
                return studentClassCache;
            }

            throw error;
        }

        const { data, error } = response;

        studentClassBackendChecked = true;

        if (error) {
            if (isMissingStudentClassBackend(error)) {
                studentClassBackendReady = false;
                studentClassCache =
                    mergeStudentClasses(localClasses);
                return studentClassCache;
            }

            if (isNetworkDatabaseError(error)) {
                studentClassBackendChecked = false;
                studentClassCache =
                    mergeStudentClasses(localClasses);
                return studentClassCache;
            }

            throw new Error(databaseError(error));
        }

        studentClassBackendReady = true;
        studentClassCache = mergeStudentClasses([
            ...normalizeArray(data),
            ...localClasses
        ]);

        return studentClassCache;
    }

    async function createStudentClass(name, level) {
        const normalizedName = String(name || "").trim();
        const normalizedLevel = String(level || "SD")
            .trim()
            .toUpperCase();

        if (!normalizedName) {
            throw new Error("Nama kelas wajib diisi.");
        }

        if (normalizedName.length > 30) {
            throw new Error("Nama kelas maksimal 30 karakter.");
        }

        if (
            normalizedName.toLowerCase() ===
            "belum ditentukan"
        ) {
            throw new Error(
                "Gunakan nama kelas lain. Nama tersebut khusus untuk siswa lama yang belum memiliki kelas."
            );
        }

        if (!["SD", "SMP", "SMA"].includes(normalizedLevel)) {
            throw new Error("Jenjang kelas tidak valid.");
        }

        const duplicate = studentClassCatalog().some(
            function (item) {
                return (
                    item.nama.toLowerCase() ===
                    normalizedName.toLowerCase()
                );
            }
        );

        if (duplicate) {
            throw new Error("Kelas tersebut sudah tersedia.");
        }

        let created = null;

        if (studentClassBackendReady) {
            const { data, error } =
                await supabaseClient.rpc(
                    "admin_create_kelas_siswa",
                    {
                        p_nama: normalizedName,
                        p_jenjang: normalizedLevel
                    }
                );

            if (error) {
                if (String(error?.code || "") === "23505") {
                    throw new Error(
                        "Kelas tersebut sudah tersedia."
                    );
                }

                throw new Error(databaseError(error));
            }

            created = normalizeStudentClass(
                normalizeObject(data)
            );
        } else {
            created = normalizeStudentClass({
                id: "local-" + Date.now(),
                nama: normalizedName,
                jenjang: normalizedLevel,
                local: true
            });

            const localClasses =
                mergeStudentClasses([
                    ...readLocalStudentClasses(),
                    created
                ]);

            writeLocalStudentClasses(localClasses);
        }

        studentClassCache = mergeStudentClasses([
            ...studentClassCache,
            created
        ]);

        return created;
    }

    async function saveStudentClassForm() {
        if (isSavingClass) {
            return;
        }

        const name = $("kelasSiswaNama")
            ?.value.trim() || "";
        const level = $("kelasSiswaJenjang")
            ?.value || "SD";

        try {
            isSavingClass = true;
            setClassSaveLoading(true);

            const created = await createStudentClass(
                name,
                level
            );

            selectedStudentClass = created.nama;
            closeStudentClassModal();

            if ($("searchSiswa")) {
                $("searchSiswa").value = "";
            }

            renderRows(
                filterStudents(
                    "",
                    $("filterStatusSiswa")?.value || ""
                )
            );

            showAlert(
                `Kelas ${created.nama} berhasil dibuat. Sekarang tambahkan siswa ke kelas ini.`,
                "success"
            );
        } catch (error) {
            showAlert(
                error.message || "Kelas gagal disimpan.",
                "error"
            );
        } finally {
            isSavingClass = false;
            setClassSaveLoading(false);
        }
    }

    /* =====================================================
       FILTER DAN FOTO SISWA
       ===================================================== */

    function filterStudents(
        keyword = "",
        status = ""
    ) {
        const search =
            String(keyword)
                .trim()
                .toLowerCase();

        const normalizedStatus =
            String(status)
                .trim()
                .toLowerCase();

        return studentCache.filter(
            function (student) {
                const matchesStatus =
                    !normalizedStatus ||
                    String(student?.status || "")
                        .toLowerCase() ===
                        normalizedStatus;

                const matchesSearch =
                    !search ||
                    [
                        student?.nama_siswa,
                        student?.nis,
                        student?.username,
                        student?.jenjang,
                        studentClassName(student),
                        student?.sekolah,
                        student?.status
                    ]
                        .map(function (value) {
                            return String(
                                value ?? ""
                            );
                        })
                        .join(" ")
                        .toLowerCase()
                        .includes(search);

                return (
                    matchesStatus &&
                    matchesSearch
                );
            }
        );
    }

    function studentPhoto(student) {
        const photo =
            String(
                student?.foto || ""
            ).trim();

        if (
            /^(https?:\/\/|data:image\/)/i
                .test(photo)
        ) {
            return photo;
        }

        const name =
            student?.nama_siswa ||
            student?.username ||
            "Siswa";

        const initials =
            String(name)
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map(function (word) {
                    return word
                        .charAt(0)
                        .toUpperCase();
                })
                .join("") ||
            "SW";

        return (
            "https://placehold.co/100/38BDF8/FFFFFF?text=" +
            encodeURIComponent(initials)
        );
    }

    /* =====================================================
       RENDER DATA SISWA BERDASARKAN KELAS
       ===================================================== */

    function studentClassName(student) {
        return (
            String(student?.kelas || "").trim() ||
            "Belum Ditentukan"
        );
    }

    function renderStudentPasswordControl(student) {
        const record =
            studentPasswordRecord(student);

        if (record) {
            return `
                <div class="admin-student-password has-password">
                    <span class="admin-student-password-icon">
                        <i class="fas fa-key"></i>
                    </span>
                    <div>
                        <small>Password tersimpan</small>
                        <strong data-password-value>••••••••</strong>
                        <em>Diubah ${escapeHTML(formatStudentPasswordDate(record.updatedAt))}</em>
                    </div>
                    <button
                        type="button"
                        class="btn btn-sm btn-secondary"
                        data-student-action="reveal-password"
                        data-student-id="${escapeHTML(student?.id || "")}"
                        aria-pressed="false"
                    >
                        <i class="fas fa-eye"></i> Lihat
                    </button>
                </div>
            `;
        }

        return `
            <div class="admin-student-password missing-password">
                <span class="admin-student-password-icon">
                    <i class="fas fa-lock"></i>
                </span>
                <div>
                    <small>Password</small>
                    <strong>Belum tersedia</strong>
                    <em>Edit akun lalu isi password baru agar bisa dilihat kembali di admin ini.</em>
                </div>
            </div>
        `;
    }

    function renderFormStoredPassword(student) {
        const box =
            $("siswaSavedPasswordBox");

        if (!box) {
            return;
        }

        if (!student?.id) {
            box.hidden = true;
            box.innerHTML = "";
            return;
        }

        const record =
            studentPasswordRecord(student);

        box.hidden = false;
        box.innerHTML = record
            ? `
                <span class="admin-student-password-icon">
                    <i class="fas fa-key"></i>
                </span>
                <div>
                    <small>Password yang tercatat</small>
                    <strong data-password-value>••••••••</strong>
                    <em>Diubah ${escapeHTML(formatStudentPasswordDate(record.updatedAt))}</em>
                </div>
                <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    data-student-password-toggle
                    data-student-id="${escapeHTML(student.id)}"
                    aria-pressed="false"
                >
                    <i class="fas fa-eye"></i> Lihat
                </button>
            `
            : `
                <span class="admin-student-password-icon">
                    <i class="fas fa-lock"></i>
                </span>
                <div>
                    <small>Password saat ini</small>
                    <strong>Tidak dapat ditampilkan</strong>
                    <em>Password lama tersimpan sebagai hash. Isi password baru jika perlu melihatnya kembali.</em>
                </div>
            `;
    }

    function toggleStoredStudentPassword(button, id) {
        const record =
            studentPasswordRecord(id);

        if (!record) {
            showAlert(
                "Password belum tercatat di admin ini. Edit akun lalu isi password baru.",
                "warning"
            );
            return;
        }

        const panel =
            button.closest(
                ".admin-student-password, .student-password-current"
            );

        const value =
            panel?.querySelector(
                "[data-password-value]"
            );

        const isVisible =
            button.getAttribute("aria-pressed") === "true";

        if (value) {
            value.textContent =
                isVisible
                    ? "••••••••"
                    : record.password;
        }

        button.setAttribute(
            "aria-pressed",
            String(!isVisible)
        );

        button.innerHTML =
            isVisible
                ? '<i class="fas fa-eye"></i> Lihat'
                : '<i class="fas fa-eye-slash"></i> Sembunyikan';
    }

    function syncStudentClassOptions() {
        const options = $("studentClassOptions");

        if (!options) {
            return;
        }

        options.innerHTML = studentClassCatalog()
            .sort(function (left, right) {
                return left.nama.localeCompare(
                    right.nama,
                    "id",
                    { numeric: true }
                );
            })
            .map(function (item) {
                return `<option value="${escapeHTML(item.nama)}">${escapeHTML(item.jenjang)}</option>`;
            })
            .join("");
    }

    function syncStudentManagerChrome() {
        const title = $("studentManagerTitle");
        const subtitle = $("studentManagerSubtitle");
        const search = $("searchSiswa");
        const addButton = $("addSiswaBtn");

        if (selectedStudentClass) {
            if (title) {
                title.textContent =
                    "Siswa Kelas " + selectedStudentClass;
            }

            if (subtitle) {
                subtitle.textContent =
                    "Kelola akun siswa di dalam kelas ini";
            }

            if (search) {
                search.placeholder =
                    "Cari siswa di kelas " +
                    selectedStudentClass +
                    "...";
            }

            if (addButton) {
                addButton.hidden = true;
            }

            return;
        }

        if (title) {
            title.textContent = "Kelas Siswa";
        }

        if (subtitle) {
            subtitle.textContent =
                "Buat kelas terlebih dahulu, lalu tambahkan siswa di dalamnya";
        }

        if (search) {
            search.placeholder =
                "Cari kelas, nama, NIS, atau sekolah...";
        }

        if (addButton) {
            addButton.hidden = false;
            addButton.innerHTML =
                '<i class="fas fa-plus"></i> Tambah Kelas';
        }
    }

    function renderStudentClassOverview(
        students,
        container
    ) {
        const grouped = new Map();
        const catalog = studentClassCatalog();
        const keyword = String(
            $("searchSiswa")?.value || ""
        ).trim().toLowerCase();
        const status = String(
            $("filterStatusSiswa")?.value || ""
        ).trim();

        catalog.forEach(function (item) {
            if (
                !status &&
                (
                    !keyword ||
                    item.nama.toLowerCase().includes(keyword)
                )
            ) {
                grouped.set(item.nama, []);
            }
        });

        students.forEach(function (student) {
            const rawClassName =
                studentClassName(student);
            const registeredClass = catalog.find(
                function (item) {
                    return (
                        item.nama.toLowerCase() ===
                        rawClassName.toLowerCase()
                    );
                }
            );
            const className =
                registeredClass?.nama || rawClassName;

            if (!grouped.has(className)) {
                grouped.set(className, []);
            }

            grouped.get(className).push(student);
        });

        const classes =
            Array.from(grouped.entries())
                .sort(function (left, right) {
                    if (left[0] === "Belum Ditentukan") {
                        return 1;
                    }

                    if (right[0] === "Belum Ditentukan") {
                        return -1;
                    }

                    return left[0].localeCompare(
                        right[0],
                        "id",
                        {
                            numeric: true,
                            sensitivity: "base"
                        }
                    );
                });

        if (!classes.length) {
            container.innerHTML = `
                <div class="admin-student-class-empty">
                    <i class="fas fa-user-graduate"></i>
                    <strong>Belum ada kelas siswa</strong>
                    <span>Klik Tambah Kelas untuk membuat kelas pertama.</span>
                </div>
            `;

            return;
        }

        container.innerHTML =
            classes.map(function ([className, members]) {
                const classInfo = catalog.find(
                    function (item) {
                        return (
                            item.nama.toLowerCase() ===
                            className.toLowerCase()
                        );
                    }
                );
                const active = members.filter(
                    function (student) {
                        return String(
                            student?.status || ""
                        ).toLowerCase() === "aktif";
                    }
                ).length;

                const schools = new Set(
                    members
                        .map(function (student) {
                            return String(
                                student?.sekolah || ""
                            ).trim();
                        })
                        .filter(Boolean)
                ).size;

                return `
                    <button
                        type="button"
                        class="admin-student-class-entry"
                        data-open-student-class="${escapeHTML(className)}"
                    >
                        <span class="admin-student-class-icon">
                            <i class="fas fa-folder-open"></i>
                        </span>

                        <span class="admin-student-class-copy">
                            <small>KELAS</small>
                            <strong>${escapeHTML(className)}</strong>
                            <span>${escapeHTML(classInfo?.jenjang || members[0]?.jenjang || "SD")} · ${schools || 0} sekolah terdaftar</span>
                        </span>

                        <span class="admin-student-class-stats">
                            <span><b>${members.length}</b><small>Total</small></span>
                            <span><b>${active}</b><small>Aktif</small></span>
                            <i class="fas fa-chevron-right"></i>
                        </span>
                    </button>
                `;
            }).join("");
    }

    function renderStudentClassDetail(
        students,
        container
    ) {
        const members = students.filter(
            function (student) {
                return (
                    studentClassName(student).toLowerCase() ===
                    selectedStudentClass.toLowerCase()
                );
            }
        ).sort(function (left, right) {
            return String(
                left?.nama_siswa || ""
            ).localeCompare(
                String(right?.nama_siswa || ""),
                "id",
                { sensitivity: "base" }
            );
        });

        const allMembers = studentCache.filter(
            function (student) {
                return (
                    studentClassName(student).toLowerCase() ===
                    selectedStudentClass.toLowerCase()
                );
            }
        );

        const active = allMembers.filter(
            function (student) {
                return String(
                    student?.status || ""
                ).toLowerCase() === "aktif";
            }
        ).length;

        const targetClass =
            selectedStudentClass === "Belum Ditentukan"
                ? ""
                : selectedStudentClass;

        const addStudentButton = targetClass
            ? `
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    data-add-student-class="${escapeHTML(targetClass)}"
                >
                    <i class="fas fa-user-plus"></i> Tambah Siswa
                </button>
            `
            : "";

        const cards = members.length
            ? members.map(function (student) {
                const isActive =
                    String(
                        student?.status || ""
                    ).toLowerCase() === "aktif";

                return `
                    <article class="admin-student-card">
                        <div class="admin-student-card-head">
                            <img
                                src="${escapeHTML(studentPhoto(student))}"
                                alt="Foto ${escapeHTML(student?.nama_siswa || "Siswa")}"
                                onerror="this.onerror=null;this.src='https://placehold.co/100/38BDF8/FFFFFF?text=SW';"
                            >

                            <div>
                                <h4>${escapeHTML(student?.nama_siswa || "-")}</h4>
                                <p>@${escapeHTML(student?.username || "-")}</p>
                            </div>

                            <span class="badge ${isActive ? "badge-success" : "badge-danger"}">
                                ${isActive ? "Aktif" : "Nonaktif"}
                            </span>
                        </div>

                        <dl class="admin-student-card-data">
                            <div><dt>NIS</dt><dd>${escapeHTML(student?.nis || "-")}</dd></div>
                            <div><dt>Jenjang</dt><dd>${escapeHTML(student?.jenjang || "SD")}</dd></div>
                            <div><dt>Sekolah</dt><dd>${escapeHTML(student?.sekolah || "-")}</dd></div>
                        </dl>

                        <div class="admin-student-card-actions">
                            <button
                                type="button"
                                class="btn btn-sm btn-warning"
                                data-student-action="edit"
                                data-student-id="${escapeHTML(student?.id || "")}"
                            >
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button
                                type="button"
                                class="btn btn-sm btn-danger"
                                data-student-action="delete"
                                data-student-id="${escapeHTML(student?.id || "")}"
                            >
                                <i class="fas fa-trash"></i> Hapus
                            </button>
                        </div>
                    </article>
                `;
            }).join("")
            : `
                <div class="admin-student-class-empty">
                    <i class="fas ${allMembers.length ? "fa-search" : "fa-user-plus"}"></i>
                    <strong>${allMembers.length ? "Tidak ada siswa yang cocok" : "Belum ada siswa di kelas ini"}</strong>
                    <span>${allMembers.length ? "Ubah kata pencarian atau filter status." : "Klik Tambah Siswa untuk membuat akun pertama."}</span>
                </div>
            `;

        container.innerHTML = `
            <section class="admin-student-class-detail">
                <div class="admin-student-class-detail-nav">
                    <button type="button" class="btn btn-secondary" data-back-student-classes>
                        <i class="fas fa-arrow-left"></i> Semua Kelas
                    </button>
                    <span>DATA SISWA / ${escapeHTML(selectedStudentClass.toUpperCase())}</span>
                </div>

                <div class="admin-student-class-detail-header">
                    <span class="admin-student-class-icon">
                        <i class="fas fa-users"></i>
                    </span>
                    <div>
                        <small>DAFTAR SISWA</small>
                        <h3>Kelas ${escapeHTML(selectedStudentClass)}</h3>
                        <p>Tambahkan dan kelola akun siswa untuk kelas ini.</p>
                    </div>
                    <div class="admin-student-detail-stats">
                        <span><b>${allMembers.length}</b><small>Total</small></span>
                        <span><b>${active}</b><small>Aktif</small></span>
                    </div>
                </div>

                <div class="admin-student-class-content">
                    <div class="admin-student-class-content-head">
                        <span>${members.length} siswa ditampilkan</span>
                        ${addStudentButton}
                    </div>
                    <div class="admin-student-card-list">${cards}</div>
                </div>
            </section>
        `;
    }

    function renderRows(students) {
        const container = $("siswaClassGrid");

        if (!container) {
            return;
        }

        syncStudentManagerChrome();
        syncStudentClassOptions();

        if (selectedStudentClass) {
            renderStudentClassDetail(
                students,
                container
            );
            return;
        }

        renderStudentClassOverview(
            students,
            container
        );
    }

    /* =====================================================
       RENDER PROFIL SISWA
       ===================================================== */

    function renderProfiles(students) {
        const container =
            $("profilListContainer");

        if (!container) {
            return;
        }

        if (!students.length) {
            container.innerHTML = `
                <p
                    class="text-center text-muted"
                >
                    Tidak ada profil siswa
                </p>
            `;

            return;
        }

        container.innerHTML = `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Profil</th>
                            <th>NIS</th>
                            <th>Username</th>
                            <th>Kelas</th>
                            <th>Sekolah</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${students
                            .map(
                                function (
                                    student
                                ) {
                                    const active =
                                        student?.status ===
                                        "aktif";

                                    return `
                                        <tr>
                                            <td>
                                                <div
                                                    style="
                                                        display: flex;
                                                        align-items: center;
                                                        gap: 10px;
                                                    "
                                                >
                                                    <img
                                                        src="${escapeHTML(
                                                            studentPhoto(
                                                                student
                                                            )
                                                        )}"
                                                        alt="Foto siswa"
                                                        style="
                                                            width: 44px;
                                                            height: 44px;
                                                            border-radius: 50%;
                                                            object-fit: cover;
                                                        "
                                                        onerror="
                                                            this.onerror = null;
                                                            this.src =
                                                            'https://placehold.co/100/38BDF8/FFFFFF?text=SW';
                                                        "
                                                    >

                                                    <strong>
                                                        ${escapeHTML(
                                                            student
                                                                ?.nama_siswa ||
                                                            "-"
                                                        )}
                                                    </strong>
                                                </div>
                                            </td>

                                            <td>
                                                ${escapeHTML(
                                                    student?.nis ||
                                                    "-"
                                                )}
                                            </td>

                                            <td>
                                                ${escapeHTML(
                                                    student
                                                        ?.username ||
                                                    "-"
                                                )}
                                            </td>

                                            <td>
                                                ${escapeHTML(
                                                    student
                                                        ?.jenjang ||
                                                    "SD"
                                                )}

                                                -

                                                ${escapeHTML(
                                                    student
                                                        ?.kelas ||
                                                    "-"
                                                )}
                                            </td>

                                            <td>
                                                ${escapeHTML(
                                                    student
                                                        ?.sekolah ||
                                                    "-"
                                                )}
                                            </td>

                                            <td>
                                                <span
                                                    class="badge ${
                                                        active
                                                            ? "badge-success"
                                                            : "badge-danger"
                                                    }"
                                                >
                                                    ${
                                                        active
                                                            ? "Aktif"
                                                            : "Nonaktif"
                                                    }
                                                </span>
                                            </td>

                                            <td>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-warning"
                                                    data-profile-action="edit"
                                                    data-student-id="${escapeHTML(
                                                        student?.id ||
                                                        ""
                                                    )}"
                                                >
                                                    <i
                                                        class="fas fa-edit"
                                                    ></i>

                                                    Edit Profil
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }
                            )
                            .join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function updateTotal() {
        const total =
            studentCache.length;

        const active =
            studentCache.filter(
                function (student) {
                    return (
                        student?.status ===
                        "aktif"
                    );
                }
            ).length;

        const inactive =
            total - active;

        [
            ["totalSiswa", total],
            ["siswaTotalAkun", total],
            ["siswaAktifCount", active],
            ["siswaNonaktifCount", inactive]
        ].forEach(
            function ([id, value]) {
                const element = $(id);

                if (element) {
                    element.textContent =
                        String(value);
                }
            }
        );
    }

    async function refreshStudents(
        keyword = ""
    ) {
        const normalizedKeyword =
            String(keyword || "");

        if (isRefreshing) {
            queuedKeyword =
                normalizedKeyword;

            return studentCache;
        }

        isRefreshing = true;

        try {
            await fetchStudents();
            await fetchStudentClasses();

            renderRows(
                filterStudents(
                    normalizedKeyword,
                    $("filterStatusSiswa")
                        ?.value || ""
                )
            );

            const profileKeyword =
                $(
                    "searchProfilSiswa"
                )?.value || "";

            renderProfiles(
                filterStudents(
                    profileKeyword
                )
            );

            updateTotal();

            return studentCache;
        } finally {
            isRefreshing = false;

            if (
                queuedKeyword !== null
            ) {
                const nextKeyword =
                    queuedKeyword;

                queuedKeyword = null;

                window.setTimeout(
                    function () {
                        refreshStudents(
                            nextKeyword
                        ).catch(
                            function (error) {
                                showAlert(
                                    error.message,
                                    "error"
                                );
                            }
                        );
                    },
                    0
                );
            }
        }
    }

    /* =====================================================
       TAMBAH DAN EDIT SISWA
       ===================================================== */

    function openCreateForm(targetClass = "") {
        if (!String(targetClass || "").trim()) {
            showAlert(
                "Buat dan pilih kelas terlebih dahulu sebelum menambahkan siswa.",
                "info"
            );
            return;
        }

        editingId = null;

        $("siswaForm")
            ?.reset();

        const modalTitle =
            $("siswaModalTitle");

        const passwordInput =
            $("siswaPassword");

        const requiredMark =
            $(
                "passwordRequiredMark"
            );

        const passwordHelp =
            $("passwordHelp");

        const activeInput =
            $("siswaAktif");

        const levelInput =
            $("siswaJenjang");

        const classInput =
            $("siswaKelas");

        if (modalTitle) {
            modalTitle.textContent =
                targetClass
                    ? "Tambah Siswa Kelas " + targetClass
                    : "Tambah Akun Siswa";
        }

        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.required = true;

            passwordInput.placeholder =
                "Minimal 6 karakter";
        }

        if (requiredMark) {
            requiredMark.style.display =
                "inline";
        }

        if (passwordHelp) {
            passwordHelp.textContent =
                "Password wajib untuk akun baru.";
        }

        renderFormStoredPassword(null);

        if (activeInput) {
            activeInput.checked = true;
        }

        if (levelInput) {
            const selectedClass =
                studentClassCatalog().find(
                    function (item) {
                        return (
                            item.nama.toLowerCase() ===
                            targetClass.toLowerCase()
                        );
                    }
                );

            levelInput.value =
                selectedClass?.jenjang || "SD";
        }

        if (classInput) {
            classInput.value = targetClass;
            classInput.readOnly = true;
        }

        openModal();

        window.setTimeout(
            function () {
                $("siswaNama")
                    ?.focus();
            },
            50
        );
    }

    async function openEditForm(id) {
        try {
            const student =
                await getStudent(id);

            if (!student) {
                throw new Error(
                    "Data siswa tidak ditemukan."
                );
            }

            editingId = id;

            const modalTitle =
                $("siswaModalTitle");

            if (modalTitle) {
                modalTitle.textContent =
                    "Edit Akun Siswa";
            }

            setValue(
                "siswaNama",
                student.nama_siswa
            );

            setValue(
                "siswaNIS",
                student.nis
            );

            setValue(
                "siswaUsername",
                student.username
            );

            setValue(
                "siswaJenjang",
                student.jenjang || "SD"
            );

            setValue(
                "siswaKelas",
                student.kelas
            );

            if ($("siswaKelas")) {
                $("siswaKelas").readOnly = false;
            }

            setValue(
                "siswaSekolah",
                student.sekolah
            );

            setValue(
                "siswaFoto",
                student.foto
            );

            const activeInput =
                $("siswaAktif");

            if (activeInput) {
                activeInput.checked =
                    student.status ===
                    "aktif";
            }

            const passwordInput =
                $("siswaPassword");

            if (passwordInput) {
                passwordInput.value = "";
                passwordInput.required = false;

                passwordInput.placeholder =
                    "Kosongkan jika tidak diganti";
            }

            const requiredMark =
                $(
                    "passwordRequiredMark"
                );

            if (requiredMark) {
                requiredMark.style.display =
                    "none";
            }

            const passwordHelp =
                $("passwordHelp");

            if (passwordHelp) {
                passwordHelp.textContent =
                    "Kosongkan password jika tidak ingin mengubahnya.";
            }

            renderFormStoredPassword(student);

            openModal();
        } catch (error) {
            console.error(error);

            showAlert(
                error.message ||
                "Data siswa gagal dimuat.",
                "error"
            );
        }
    }

    function readForm() {
        return {
            nama_siswa:
                $("siswaNama")
                    ?.value
                    .trim() || "",

            nis:
                $("siswaNIS")
                    ?.value
                    .trim() || "",

            username:
                $("siswaUsername")
                    ?.value
                    .trim() || "",

            password:
                $("siswaPassword")
                    ?.value || "",

            jenjang:
                $("siswaJenjang")
                    ?.value || "SD",

            kelas:
                $("siswaKelas")
                    ?.value
                    .trim() || "",

            sekolah:
                $("siswaSekolah")
                    ?.value
                    .trim() || "",

            foto:
                $("siswaFoto")
                    ?.value
                    .trim() || "",

            status:
                $("siswaAktif")
                    ?.checked
                    ? "aktif"
                    : "nonaktif"
        };
    }

    function validateStudent(student) {
        if (!student.nama_siswa) {
            throw new Error(
                "Nama siswa wajib diisi."
            );
        }

        if (!student.nis) {
            throw new Error(
                "NIS wajib diisi."
            );
        }

        if (!student.username) {
            throw new Error(
                "Username wajib diisi."
            );
        }

        if (!student.kelas) {
            throw new Error(
                "Kelas siswa wajib dipilih."
            );
        }

        if (
            !studentClassCatalog().some(
                function (item) {
                    return (
                        item.nama.toLowerCase() ===
                        student.kelas.toLowerCase()
                    );
                }
            )
        ) {
            throw new Error(
                "Kelas belum tersedia. Tambahkan kelas terlebih dahulu."
            );
        }

        if (
            /\s/.test(
                student.username
            )
        ) {
            throw new Error(
                "Username tidak boleh mengandung spasi."
            );
        }

        if (
            student.username.length < 3
        ) {
            throw new Error(
                "Username minimal 3 karakter."
            );
        }

        if (
            !editingId &&
            student.password.length < 6
        ) {
            throw new Error(
                "Password akun baru minimal 6 karakter."
            );
        }

        if (
            editingId &&
            student.password &&
            student.password.length < 6
        ) {
            throw new Error(
                "Password baru minimal 6 karakter."
            );
        }

        if (
            ![
                "SD",
                "SMP",
                "SMA"
            ].includes(
                student.jenjang
            )
        ) {
            throw new Error(
                "Jenjang siswa tidak valid."
            );
        }

        if (
            student.foto &&
            !/^(https?:\/\/|data:image\/)/i
                .test(student.foto)
        ) {
            throw new Error(
                "URL foto profil tidak valid."
            );
        }
    }

    async function saveForm() {
        if (isSaving) {
            return;
        }

        const student =
            readForm();

        const wasEditing =
            Boolean(editingId);

        const targetId =
            editingId;

        let savedAccount = null;

        try {
            validateStudent(student);

            isSaving = true;

            setSaveLoading(true);

            if (wasEditing) {
                savedAccount = await updateStudent(
                    targetId,
                    student
                );
            } else {
                savedAccount = await createStudent(
                    student
                );
            }

            if (student.password) {
                rememberStudentPassword(
                    savedAccount,
                    student.password
                );
            } else {
                updateStudentPasswordIdentity(
                    savedAccount
                );
            }

            publishStudentUpdate(savedAccount);

            renderFormStoredPassword(null);

            editingId = null;

            closeModal();

            $("siswaForm")
                ?.reset();

            showAlert(
                wasEditing
                    ? "Akun siswa berhasil diperbarui."
                    : "Akun siswa berhasil ditambahkan.",
                "success"
            );

            const keyword =
                $("searchSiswa")
                    ?.value || "";

            try {
                await refreshStudents(
                    keyword
                );
            } catch (refreshError) {
                console.error(
                    "Daftar siswa gagal dimuat ulang:",
                    refreshError
                );

                showAlert(
                    "Data tersimpan, tetapi daftar siswa belum berhasil dimuat ulang.",
                    "info"
                );
            }
        } catch (error) {
            console.error(
                "Gagal menyimpan siswa:",
                error
            );

            showAlert(
                error.message ||
                "Akun siswa gagal disimpan.",
                "error"
            );
        } finally {
            isSaving = false;

            setSaveLoading(false);
        }
    }

    async function deleteAccount(id) {
        if (
            isDeleting ||
            !id
        ) {
            return;
        }

        const student =
            studentCache.find(
                function (item) {
                    return (
                        String(item?.id) ===
                        String(id)
                    );
                }
            );

        const name =
            student?.nama_siswa ||
            "siswa ini";

        const confirmed =
            window.confirm(
                `Hapus akun ${name} dari database?\n\nData yang dihapus tidak dapat dikembalikan.`
            );

        if (!confirmed) {
            return;
        }

        try {
            isDeleting = true;

            await removeStudent(id);

            showAlert(
                "Akun siswa berhasil dihapus.",
                "success"
            );

            await refreshStudents(
                $("searchSiswa")
                    ?.value || ""
            );
        } catch (error) {
            console.error(error);

            showAlert(
                error.message ||
                "Akun siswa gagal dihapus.",
                "error"
            );
        } finally {
            isDeleting = false;
        }
    }

    /* =====================================================
       EVENT LISTENER
       ===================================================== */

    function stopOldEvent(event) {
        event.preventDefault();

        event.stopImmediatePropagation();
    }

    function attachEvents() {
        const sidebar = document.querySelector(".admin-sidebar");
        const sidebarToggle = $("toggleSidebar");
        const sidebarBackdrop = $("sidebarBackdrop");

        function setSidebarOpen(open) {
            const shouldOpen = Boolean(open) && window.innerWidth <= 980;
            sidebar?.classList.toggle("open", shouldOpen);
            document.body.classList.toggle("admin-sidebar-open", shouldOpen);
            sidebarToggle?.setAttribute("aria-expanded", String(shouldOpen));
            sidebarBackdrop?.setAttribute("aria-hidden", String(!shouldOpen));
        }

        const pageTitles = {
            dashboard: "Dashboard",
            modul: "Kelola Modul",
            tugas: "Kelola Tugas",
            game: "Kelola Game Edukasi",
            siswa: "Data Siswa",
            profil: "Profil Siswa",
            laporan: "Laporan",
            pengaturan: "Pengaturan"
        };

        function activateAdminPage(
            page,
            persist = true
        ) {
            const targetPage =
                pageTitles[page]
                    ? page
                    : "dashboard";

            const targetLink =
                document.querySelector(
                    `.nav-link[data-page="${targetPage}"]`
                );

            const targetSection =
                $(`${targetPage}Page`);

            if (!targetLink || !targetSection) {
                return;
            }

            document
                .querySelectorAll(
                    ".nav-link[data-page]"
                )
                .forEach(function (item) {
                    item.classList.remove("active");
                });

            document
                .querySelectorAll(".page-section")
                .forEach(function (section) {
                    section.classList.remove("active");
                });

            targetLink.classList.add("active");
            targetSection.classList.add("active");

            if ($("pageTitle")) {
                $("pageTitle").textContent =
                    pageTitles[targetPage];
            }

            if (persist) {
                try {
                    localStorage.setItem(
                        ADMIN_ACTIVE_PAGE_KEY,
                        targetPage
                    );
                } catch (error) {
                    console.warn(
                        "Halaman aktif tidak dapat disimpan:",
                        error
                    );
                }
            }

            setSidebarOpen(false);
        }

        document
            .querySelectorAll(
                ".nav-link[data-page]"
            )
            .forEach(function (link) {
                link.addEventListener(
                    "click",
                    function () {
                        const page =
                            link.dataset.page;

                        activateAdminPage(page);
                    }
                );
            });

        try {
            activateAdminPage(
                localStorage.getItem(
                    ADMIN_ACTIVE_PAGE_KEY
                ) || "dashboard",
                false
            );
        } catch (error) {
            activateAdminPage(
                "dashboard",
                false
            );
        }

        $("toggleSidebar")
            ?.addEventListener(
                "click",
                function () {
                    setSidebarOpen(!sidebar?.classList.contains("open"));
                }
            );

        $("closeSidebar")
            ?.addEventListener("click", function () {
                setSidebarOpen(false);
            });

        sidebarBackdrop
            ?.addEventListener("click", function () {
                setSidebarOpen(false);
            });

        window.addEventListener("resize", function () {
            if (window.innerWidth > 980) {
                setSidebarOpen(false);
            }
        });

        document
            .querySelectorAll(
                '[data-modal="siswaModal"]'
            )
            .forEach(function (button) {
                button.addEventListener(
                    "click",
                    function (event) {
                        event.preventDefault();
                        closeModal();
                    }
                );
            });

        $("siswaModal")
            ?.addEventListener(
                "click",
                function (event) {
                    if (
                        event.target ===
                        $("siswaModal")
                    ) {
                        closeModal();
                    }
                }
            );

        document
            .querySelectorAll(
                "[data-class-modal-close]"
            )
            .forEach(function (button) {
                button.addEventListener(
                    "click",
                    function (event) {
                        event.preventDefault();
                        closeStudentClassModal();
                    }
                );
            });

        $("kelasSiswaModal")
            ?.addEventListener(
                "click",
                function (event) {
                    if (
                        event.target ===
                        $("kelasSiswaModal")
                    ) {
                        closeStudentClassModal();
                    }
                }
            );

        document.addEventListener(
            "keydown",
            function (event) {
                if (event.key === "Escape") {
                    closeModal();
                    closeStudentClassModal();
                    setSidebarOpen(false);
                }
            }
        );

        $("addSiswaBtn")
            ?.addEventListener(
                "click",
                function (event) {
                    stopOldEvent(event);
                    openStudentClassModal();
                },
                true
            );

        $("saveKelasSiswaBtn")
            ?.addEventListener(
                "click",
                function (event) {
                    stopOldEvent(event);
                    saveStudentClassForm();
                },
                true
            );

        $("kelasSiswaForm")
            ?.addEventListener(
                "submit",
                function (event) {
                    stopOldEvent(event);
                    saveStudentClassForm();
                },
                true
            );

        $("saveSiswaBtn")
            ?.addEventListener(
                "click",
                function (event) {
                    stopOldEvent(event);

                    saveForm();
                },
                true
            );

        $("siswaForm")
            ?.addEventListener(
                "submit",
                function (event) {
                    stopOldEvent(event);

                    saveForm();
                },
                true
            );

        $("searchSiswa")
            ?.addEventListener(
                "input",
                function (event) {
                    event.stopImmediatePropagation();

                    window.clearTimeout(
                        searchTimer
                    );

                    searchTimer =
                        window.setTimeout(
                            function () {
                                renderRows(
                                    filterStudents(
                                        $("searchSiswa")
                                            ?.value ||
                                        "",
                                        $("filterStatusSiswa")
                                            ?.value ||
                                        ""
                                    )
                                );
                            },
                            250
                        );
                },
                true
            );

        $("filterStatusSiswa")
            ?.addEventListener(
                "change",
                function () {
                    renderRows(
                        filterStudents(
                            $("searchSiswa")
                                ?.value || "",
                            $("filterStatusSiswa")
                                ?.value || ""
                        )
                    );
                }
            );

        $("searchProfilSiswa")
            ?.addEventListener(
                "input",
                function (event) {
                    event.stopImmediatePropagation();

                    renderProfiles(
                        filterStudents(
                            $(
                                "searchProfilSiswa"
                            )?.value ||
                            ""
                        )
                    );
                },
                true
            );

        $("siswaClassGrid")
            ?.addEventListener(
                "click",
                function (event) {
                    const openClassButton =
                        event.target.closest(
                            "[data-open-student-class]"
                        );

                    if (openClassButton) {
                        event.preventDefault();
                        selectedStudentClass =
                            openClassButton.dataset
                                .openStudentClass || "";

                        if ($("searchSiswa")) {
                            $("searchSiswa").value = "";
                        }

                        renderRows(
                            filterStudents(
                                "",
                                $("filterStatusSiswa")
                                    ?.value || ""
                            )
                        );
                        return;
                    }

                    if (
                        event.target.closest(
                            "[data-back-student-classes]"
                        )
                    ) {
                        event.preventDefault();
                        selectedStudentClass = "";

                        if ($("searchSiswa")) {
                            $("searchSiswa").value = "";
                        }

                        renderRows(
                            filterStudents(
                                "",
                                $("filterStatusSiswa")
                                    ?.value || ""
                            )
                        );
                        return;
                    }

                    const addButton =
                        event.target.closest(
                            "[data-add-student-class]"
                        );

                    if (addButton) {
                        event.preventDefault();
                        openCreateForm(
                            addButton.dataset
                                .addStudentClass || ""
                        );
                        return;
                    }

                    const button =
                        event.target.closest(
                            "[data-student-action]"
                        );

                    if (!button) {
                        return;
                    }

                    event.preventDefault();

                    const id =
                        button.dataset
                            .studentId;

                    const action =
                        button.dataset
                            .studentAction;

                    if (!id) {
                        showAlert(
                            "ID siswa tidak ditemukan.",
                            "error"
                        );

                        return;
                    }

                    if (
                        action === "edit"
                    ) {
                        openEditForm(id);
                    }

                    if (
                        action === "reveal-password"
                    ) {
                        toggleStoredStudentPassword(button, id);
                    }

                    if (
                        action === "delete"
                    ) {
                        deleteAccount(id);
                    }
                }
            );

        $("profilListContainer")
            ?.addEventListener(
                "click",
                function (event) {
                    const button =
                        event.target.closest(
                            "[data-profile-action='edit']"
                        );

                    if (!button) {
                        return;
                    }

                    event.preventDefault();

                    const id =
                        button.dataset
                            .studentId;

                    if (id) {
                        openEditForm(id);
                    }
                }
            );

        document
            .querySelector(
                '[data-page="siswa"]'
            )
            ?.addEventListener(
                "click",
                function () {
                    window.setTimeout(
                        function () {
                            refreshStudents(
                                $("searchSiswa")
                                    ?.value ||
                                ""
                            ).catch(
                                function (error) {
                                    showAlert(
                                        error.message,
                                        "error"
                                    );
                                }
                            );
                        },
                        50
                    );
                }
            );

        document
            .querySelector(
                '[data-page="profil"]'
            )
            ?.addEventListener(
                "click",
                function () {
                    window.setTimeout(
                        function () {
                            refreshStudents("")
                                .catch(
                                    function (
                                        error
                                    ) {
                                        showAlert(
                                            error.message,
                                            "error"
                                        );
                                    }
                                );
                        },
                        50
                    );
                }
            );

        $("logoutBtn")
            ?.addEventListener(
                "click",
                async function (event) {
                    stopOldEvent(event);

                    const confirmed = window.EduSkyLogoutConfirm
                        ? await window.EduSkyLogoutConfirm.ask({
                            title: "Keluar dari Dashboard Admin?",
                            message: "Sesi administrator akan diakhiri. Anda harus login kembali untuk mengelola EduSky.",
                            confirmLabel: "Ya, Logout"
                        })
                        : window.confirm("Apakah Anda yakin ingin logout?");

                    if (!confirmed) {
                        return;
                    }

                    await logoutAdmin();
                },
                true
            );
    }

    /* =====================================================
       KOMPATIBILITAS DENGAN ADMIN.JS LAMA
       ===================================================== */

    window.getAllSiswa =
        fetchStudents;

    window.addSiswa =
        createStudent;

    window.updateSiswa =
        updateStudent;

    window.deleteSiswa =
        deleteAccount;

    window.editSiswa =
        openEditForm;

    window.renderSiswaTable =
        refreshStudents;

    function setupProfileSynchronization() {
        if (profileSyncStarted) {
            return;
        }

        profileSyncStarted = true;

        const handleUpdate = function (payload) {
            const stamp = String(
                payload?.updatedAt || ""
            );

            if (
                !payload ||
                payload.type !== "profile-updated" ||
                (stamp && stamp === lastProfileSyncStamp)
            ) {
                return;
            }

            lastProfileSyncStamp = stamp;

            refreshStudents(
                $("searchSiswa")?.value || ""
            ).then(function () {
                showAlert(
                    "Perubahan profil siswa dari database sudah dimuat.",
                    "info"
                );
            }).catch(function (error) {
                console.error(
                    "Sinkronisasi profil siswa gagal:",
                    error
                );
            });
        };

        window.addEventListener(
            "storage",
            function (event) {
                if (
                    event.key !== PROFILE_UPDATE_KEY ||
                    !event.newValue
                ) {
                    return;
                }

                try {
                    handleUpdate(
                        JSON.parse(event.newValue)
                    );
                } catch (error) {
                    console.warn(
                        "Sinyal perubahan profil tidak valid:",
                        error
                    );
                }
            }
        );

        if ("BroadcastChannel" in window) {
            try {
                const channel = new BroadcastChannel(
                    SYNC_CHANNEL_NAME
                );

                channel.addEventListener(
                    "message",
                    function (event) {
                        handleUpdate(event.data);
                    }
                );
            } catch (error) {
                console.warn(
                    "Sinkronisasi admin lintas tab tidak tersedia:",
                    error
                );
            }
        }

        window.addEventListener(
            "focus",
            function () {
                refreshStudents(
                    $("searchSiswa")?.value || ""
                ).catch(function (error) {
                    console.warn(
                        "Data siswa belum dapat diperbarui saat fokus:",
                        error
                    );
                });
            }
        );
    }

    /* =====================================================
       INISIALISASI
       ===================================================== */

    async function initialize() {
        try {
            if (!checkAdmin()) {
                return;
            }

            prepareForm();
            prepareTable();
            attachEvents();

            const supabase =
                await loadSupabase();

            supabaseClient =
                supabase.createClient(
                    SUPABASE_URL,
                    SUPABASE_KEY,
                    {
                        auth: {
                            persistSession:
                                false,

                            autoRefreshToken:
                                false,

                            detectSessionInUrl:
                                false
                        }
                    }
                );

            await refreshStudents();
            setupProfileSynchronization();
        } catch (error) {
            console.error(
                "Inisialisasi CRUD siswa gagal:",
                error
            );

            showAlert(
                databaseError(error),
                "error"
            );
        }
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            {
                once: true
            }
        );
    } else {
        initialize();
    }
})();
