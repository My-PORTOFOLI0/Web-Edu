(function () {
    "use strict";

    const SUPABASE_URL =
        "https://viwbkbrikocybvqlgwoy.supabase.co";

    const SUPABASE_KEY =
        "sb_publishable_z7rTsuRFhIK2q4OoPivG1A_zpZa9Bdm";

    const PDF_BUCKET = "modul-pdf";
    const MAX_PDF_SIZE = 20 * 1024 * 1024;
    const CLASS_STORAGE_KEY = "edusky_student_classes";
    const STUDENT_CACHE_KEY = "edusky_admin_student_cache";
    const MODULE_CACHE_KEY = "edusky_admin_module_cache";

    let client = null;
    let moduleCache = [];
    let studentCache = [];
    let classCache = [];
    let selectedClass = "";
    let editingId = null;
    let currentPdfPath = null;
    let selectedPdf = null;
    let previewModule = null;
    let previewType = null;
    let pdfReader = null;
    let youtubeController = null;
    let isSaving = false;
    let searchTimer = null;

    const $ = function (id) {
        return document.getElementById(id);
    };

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalizeArray(data) {
        if (!data) {
            return [];
        }

        if (Array.isArray(data)) {
            return data.filter(Boolean);
        }

        if (typeof data === "string") {
            try {
                return normalizeArray(JSON.parse(data));
            } catch (error) {
                return [];
            }
        }

        return typeof data === "object" ? [data] : [];
    }

    function isNetworkError(error) {
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

    function readModuleCache() {
        try {
            return normalizeArray(
                JSON.parse(
                    localStorage.getItem(
                        MODULE_CACHE_KEY
                    ) || "[]"
                )
            );
        } catch (error) {
            return [];
        }
    }

    function readStudentCache() {
        try {
            return normalizeArray(
                JSON.parse(
                    localStorage.getItem(
                        STUDENT_CACHE_KEY
                    ) || "[]"
                )
            );
        } catch (error) {
            return [];
        }
    }

    function writeModuleCache(modules) {
        try {
            localStorage.setItem(
                MODULE_CACHE_KEY,
                JSON.stringify(modules)
            );
        } catch (error) {
            console.warn(
                "Cache modul tidak dapat disimpan:",
                error
            );
        }
    }

    function localClasses() {
        try {
            return normalizeArray(
                JSON.parse(
                    localStorage.getItem(
                        CLASS_STORAGE_KEY
                    ) || "[]"
                )
            );
        } catch (error) {
            return [];
        }
    }

    function availableClasses() {
        const unique = new Map();

        [
            ...classCache.map(item => ({
                nama: item?.nama,
                jenjang: item?.jenjang
            })),
            ...studentCache.map(item => ({
                nama: item?.kelas,
                jenjang: item?.jenjang
            })),
            ...moduleCache.map(item => ({
                nama: item?.kelas,
                jenjang: "SD"
            }))
        ].forEach(function (item) {
            const name = String(item?.nama || "").trim();

            if (!name) {
                return;
            }

            const key = name.toLowerCase();

            if (!unique.has(key)) {
                unique.set(key, {
                    nama: name,
                    jenjang: String(
                        item?.jenjang || "SD"
                    ).toUpperCase()
                });
            }
        });

        return Array.from(unique.values()).sort(
            function (left, right) {
                return left.nama.localeCompare(
                    right.nama,
                    "id",
                    {
                        numeric: true,
                        sensitivity: "base"
                    }
                );
            }
        );
    }

    async function loadClassCatalog() {
        let remoteClasses = [];

        try {
            const result = await client.rpc(
                "admin_list_kelas_siswa"
            );

            if (!result.error) {
                remoteClasses = normalizeArray(
                    result.data
                );
            }
        } catch (error) {
            remoteClasses = [];
        }

        try {
            const result = await client.rpc(
                "admin_list_akun_siswa",
                { p_search: "" }
            );

            studentCache = result.error
                ? readStudentCache()
                : normalizeArray(result.data);
        } catch (error) {
            studentCache = readStudentCache();
        }

        classCache = [
            ...remoteClasses,
            ...localClasses()
        ];
    }

    function sameClass(left, right) {
        return (
            String(left || "").trim().toLowerCase() ===
            String(right || "").trim().toLowerCase()
        );
    }

    function formatDate(value) {
        if (!value) {
            return "-";
        }

        return new Intl.DateTimeFormat(
            "id-ID",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        ).format(new Date(value));
    }

    function formatFileSize(bytes) {
        if (bytes < 1024 * 1024) {
            return `${Math.ceil(bytes / 1024)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function databaseError(error) {
        const code = String(error?.code || "");
        const message = String(
            error?.message ||
            "Terjadi kesalahan saat mengakses Supabase."
        );

        if (
            code === "PGRST202" ||
            message.toLowerCase().includes(
                "could not find the function"
            )
        ) {
            return "RPC modul belum tersedia. Jalankan supabase/modul_setup.sql di Supabase SQL Editor.";
        }

        if (
            code === "42501" ||
            message.toLowerCase().includes(
                "row-level security"
            )
        ) {
            return "Akses Supabase ditolak. Jalankan ulang supabase/modul_setup.sql untuk memasang policy modul.";
        }

        if (
            message.toLowerCase().includes("bucket not found") ||
            code === "404"
        ) {
            return "Bucket modul-pdf belum tersedia. Jalankan seluruh file supabase/modul_setup.sql di Supabase SQL Editor.";
        }

        if (
            message.toLowerCase().includes("failed to fetch") ||
            message.toLowerCase().includes("load failed")
        ) {
            return "Tidak dapat terhubung ke Supabase. Periksa koneksi internet.";
        }

        return message;
    }

    function showAlert(message, type = "success") {
        let container = $("moduleCrudAlertContainer");

        if (!container) {
            container = document.createElement("div");
            container.id = "moduleCrudAlertContainer";

            const page = $("modulPage");
            (page || document.querySelector(".admin-content") || document.body)
                .prepend(container);
        }

        const alert = document.createElement("div");
        const icon =
            type === "success"
                ? "check-circle"
                : type === "info"
                    ? "info-circle"
                    : "exclamation-circle";

        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${escapeHTML(message)}</span>
            <button type="button" class="alert-close" aria-label="Tutup">
                <i class="fas fa-times"></i>
            </button>
        `;

        alert.querySelector(".alert-close")
            ?.addEventListener("click", function () {
                alert.remove();
            });

        container.prepend(alert);

        window.setTimeout(function () {
            alert.remove();
        }, 6000);
    }

    function youtubeIdFromUrl(value) {
        const input = String(value || "").trim();

        if (!input) {
            return null;
        }

        try {
            const url = new URL(input);
            const host = url.hostname
                .replace(/^www\./, "")
                .replace(/^m\./, "");

            let id = null;

            if (host === "youtu.be") {
                id = url.pathname.split("/").filter(Boolean)[0];
            }

            if (
                host === "youtube.com" ||
                host === "youtube-nocookie.com"
            ) {
                id = url.searchParams.get("v");

                if (!id) {
                    const parts = url.pathname
                        .split("/")
                        .filter(Boolean);

                    if (
                        ["embed", "shorts", "live"]
                            .includes(parts[0])
                    ) {
                        id = parts[1];
                    }
                }
            }

            return /^[a-zA-Z0-9_-]{11}$/.test(id || "")
                ? id
                : null;
        } catch (error) {
            return null;
        }
    }

    function prepareAdminYoutubePoster() {
        if (!previewModule?.youtube_id) {
            return;
        }

        youtubeController?.stop();
        $("modulAdminYoutubeViewer").hidden = true;
        $("modulAdminYoutubePoster").hidden = false;
        $("modulAdminYoutubePosterImage").src =
            `https://i.ytimg.com/vi/${previewModule.youtube_id}/hqdefault.jpg`;
        $("modulAdminYoutubePosterTitle").textContent =
            previewModule.judul || "Video Modul";
    }

    function playAdminYoutube() {
        if (!previewModule?.youtube_id) {
            return;
        }

        $("modulAdminYoutubePoster").hidden = true;
        $("modulAdminYoutubeViewer").hidden = false;

        if (youtubeController) {
            youtubeController.play(previewModule.youtube_id);
        } else {
            window.location.assign(
                `https://www.youtube.com/watch?v=${encodeURIComponent(previewModule.youtube_id)}`
            );
        }
    }

    function updateYoutubePreview() {
        const preview = $("modulYoutubePreview");
        const id = youtubeIdFromUrl(
            $("modulYoutubeUrl")?.value
        );

        if (!preview) {
            return;
        }

        if (!id) {
            preview.hidden = true;
            preview.innerHTML = "";
            return;
        }

        preview.innerHTML = `
            <img
                src="https://i.ytimg.com/vi/${id}/hqdefault.jpg"
                alt="Pratinjau video YouTube"
            >
        `;
        preview.hidden = false;
    }

    function setPdfLabel() {
        const label = $("modulPdfLabel");

        if (!label) {
            return;
        }

        label.textContent = selectedPdf
            ? `${selectedPdf.name} (${formatFileSize(selectedPdf.size)})`
            : "Pilih file PDF";
    }

    function showCurrentPdf() {
        const element = $("modulCurrentPdf");

        if (!element) {
            return;
        }

        if (!currentPdfPath) {
            element.hidden = true;
            element.innerHTML = "";
            return;
        }

        element.innerHTML = `
            <i class="fas fa-check-circle"></i>
            PDF tersimpan: ${escapeHTML(
                currentPdfPath.split("/").pop()
            )}
            <button
                type="button"
                class="text-link"
                id="removeCurrentModulePdf"
            >
                Hapus
            </button>
        `;
        element.hidden = false;

        $("removeCurrentModulePdf")
            ?.addEventListener("click", function () {
                currentPdfPath = null;
                showCurrentPdf();
            });
    }

    function publicPdfUrl(path) {
        if (!path || !client) {
            return null;
        }

        return client.storage
            .from(PDF_BUCKET)
            .getPublicUrl(path)
            .data.publicUrl;
    }

    function showPreviewType(type) {
        if (!previewModule) {
            return;
        }

        const showPdf =
            type === "pdf" &&
            Boolean(previewModule.pdf_path);

        const showYoutube =
            type === "youtube" &&
            Boolean(previewModule.youtube_id);

        previewType = showPdf
            ? "pdf"
            : showYoutube
                ? "youtube"
                : previewModule.pdf_path
                    ? "pdf"
                    : "youtube";

        $("modulAdminPdfWrap").hidden =
            previewType !== "pdf";

        $("modulAdminYoutubeWrap").hidden =
            previewType !== "youtube";

        $("modulPreviewDownload").hidden =
            previewType !== "pdf";

        document
            .querySelectorAll(
                ".module-preview-tab"
            )
            .forEach(function (tab) {
                tab.classList.toggle(
                    "active",
                    tab.dataset.previewType ===
                        previewType
                );
            });

        if (previewType === "pdf") {
            $("modulAdminYoutubeViewer").hidden = true;
            $("modulAdminYoutubePoster").hidden = false;
            youtubeController?.stop();

            pdfReader?.load(
                publicPdfUrl(previewModule.pdf_path)
            ).catch(function () {
                showAlert(
                    "PDF belum dapat dibaca. Periksa akses file modul.",
                    "error"
                );
            });
        } else {
            prepareAdminYoutubePoster();

            pdfReader?.clear();
        }
    }

    function openPreview(id) {
        previewModule = moduleCache.find(
            function (module) {
                return String(module.id) ===
                    String(id);
            }
        );

        if (!previewModule) {
            showAlert(
                "Modul tidak ditemukan.",
                "error"
            );
            return;
        }

        $("modulPreviewTitle").textContent =
            previewModule.judul;

        $("modulPreviewTabs").innerHTML = `
            ${previewModule.pdf_path ? `
                <button
                    type="button"
                    class="module-preview-tab"
                    data-preview-type="pdf"
                >
                    <i class="fas fa-file-pdf"></i>
                    Baca PDF
                </button>
            ` : ""}

            ${previewModule.youtube_id ? `
                <button
                    type="button"
                    class="module-preview-tab"
                    data-preview-type="youtube"
                >
                    <i class="fab fa-youtube"></i>
                    Putar Video
                </button>
            ` : ""}
        `;

        $("modulPreviewModal")
            .classList.add("active");

        document.body.style.overflow = "hidden";

        showPreviewType(
            previewModule.pdf_path
                ? "pdf"
                : "youtube"
        );
    }

    function closePreview() {
        $("modulPreviewModal")
            ?.classList.remove("active");

        pdfReader?.clear();

        $("modulAdminYoutubeViewer").hidden = true;
        $("modulAdminYoutubePoster").hidden = false;
        youtubeController?.stop();
        $("modulPreviewDownload").hidden = true;

        document.body.style.overflow = "";
        previewModule = null;
        previewType = null;
    }

    async function downloadPreviewPdf() {
        if (!previewModule?.pdf_path) {
            return;
        }

        const button = $("modulPreviewDownload");
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyiapkan';

        try {
            await window.EduSkyPdfReader.download(
                publicPdfUrl(previewModule.pdf_path),
                previewModule.judul || "modul"
            );
            showAlert("Download PDF dimulai.", "success");
        } catch (error) {
            console.error("Download PDF gagal:", error);
            showAlert(
                "PDF gagal diunduh. Periksa koneksi dan akses Storage.",
                "error"
            );
        } finally {
            button.disabled = false;
            button.innerHTML = original;
        }
    }

    function syncModuleManagerChrome() {
        const addButton = $("addModulBtn");

        if (selectedClass) {
            $("moduleManagerTitle").textContent =
                `Modul Kelas ${selectedClass}`;
            $("moduleManagerSubtitle").textContent =
                "Kelola modul pembelajaran di dalam kelas ini";
            $("searchModul").placeholder =
                `Cari modul di Kelas ${selectedClass}...`;
            addButton.disabled = false;
            addButton.innerHTML =
                '<i class="fas fa-plus"></i> Tambah Modul';
            return;
        }

        $("moduleManagerTitle").textContent = "Pilih Kelas";
        $("moduleManagerSubtitle").textContent =
            "Masuk ke kelas terlebih dahulu untuk melihat dan menambahkan modul";
        $("searchModul").placeholder = "Cari kelas atau modul...";
        addButton.disabled = true;
        addButton.innerHTML =
            '<i class="fas fa-folder-open"></i> Pilih Kelas Dahulu';
    }

    function moduleActionButtons(module) {
        return `
            ${(module.pdf_path || module.youtube_id) ? `
                <button type="button" class="btn btn-sm btn-secondary" data-module-action="preview" data-module-id="${escapeHTML(module.id)}" title="Preview modul">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ""}
            <button type="button" class="btn btn-sm btn-warning" data-module-action="edit" data-module-id="${escapeHTML(module.id)}" title="Edit modul">
                <i class="fas fa-edit"></i>
            </button>
            <button type="button" class="btn btn-sm btn-danger" data-module-action="delete" data-module-id="${escapeHTML(module.id)}" title="Hapus modul">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }

    function renderModuleCard(module) {
        const active = module.status === "aktif";
        const description = String(
            module.deskripsi || "Tanpa deskripsi modul."
        ).slice(0, 150);

        return `
            <article class="admin-module-inner-card">
                <div class="admin-module-inner-top">
                    <span class="badge badge-accent">${escapeHTML(module.mata_pelajaran)}</span>
                    <span class="badge ${active ? "badge-success" : "badge-warning"}">${active ? "Aktif" : "Draft"}</span>
                </div>
                <h4>${escapeHTML(module.judul)}</h4>
                <p>${escapeHTML(description)}</p>
                <div class="admin-module-inner-meta">
                    ${module.pdf_path ? '<span><i class="fas fa-file-pdf"></i> PDF</span>' : ""}
                    ${module.youtube_id ? '<span><i class="fab fa-youtube"></i> Video</span>' : ""}
                    <span><i class="far fa-clock"></i> ${Number(module.durasi_menit || 0)} menit</span>
                </div>
                <div class="admin-module-inner-footer">
                    <small>Diperbarui ${formatDate(module.updated_at)}</small>
                    <span>${moduleActionButtons(module)}</span>
                </div>
            </article>
        `;
    }

    function renderClassOverview(modules) {
        const container = $("modulClassGrid");
        const keyword = String(
            $("searchModul")?.value || ""
        ).trim().toLowerCase();
        const subject = $("filterSubject")?.value || "";

        const classes = availableClasses().filter(
            function (classInfo) {
                const classModules = modules.filter(
                    module => sameClass(
                        module.kelas,
                        classInfo.nama
                    )
                );

                if (subject && !classModules.length) {
                    return false;
                }

                if (!keyword) {
                    return true;
                }

                return (
                    classInfo.nama.toLowerCase().includes(keyword) ||
                    classModules.length > 0
                );
            }
        );

        if (!classes.length) {
            container.innerHTML = `
                <div class="admin-task-class-empty">
                    <i class="fas fa-school"></i>
                    <strong>Belum ada kelas</strong>
                    <span>Buat kelas terlebih dahulu melalui menu Data Siswa.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = classes.map(function (classInfo) {
            const classModules = modules.filter(
                module => sameClass(
                    module.kelas,
                    classInfo.nama
                )
            );
            const active = classModules.filter(
                module => module.status === "aktif"
            ).length;
            const subjects = [
                ...new Set(
                    classModules
                        .map(module => module.mata_pelajaran)
                        .filter(Boolean)
                )
            ];

            return `
                <button type="button" class="admin-task-class-entry" data-open-module-class="${escapeHTML(classInfo.nama)}">
                    <span class="admin-task-class-icon"><i class="fas fa-book-open"></i></span>
                    <span class="admin-task-class-copy">
                        <strong>Kelas ${escapeHTML(classInfo.nama)}</strong>
                        <span>${escapeHTML(classInfo.jenjang || "SD")} · ${classModules.length} modul</span>
                        <span class="admin-task-class-subjects">${subjects.length ? subjects.slice(0, 3).map(item => `<b>${escapeHTML(item)}</b>`).join("") : "<b>Belum ada modul</b>"}</span>
                    </span>
                    <span class="admin-task-class-count">
                        <span><strong>${classModules.length}</strong><small>Modul</small></span>
                        <span><strong>${active}</strong><small>Aktif</small></span>
                        <i class="fas fa-arrow-right"></i>
                    </span>
                </button>
            `;
        }).join("");
    }

    function renderSelectedClassModules(modules) {
        const classModules = modules.filter(
            module => sameClass(module.kelas, selectedClass)
        );
        const allClassModules = moduleCache.filter(
            module => sameClass(module.kelas, selectedClass)
        );
        const active = allClassModules.filter(
            module => module.status === "aktif"
        ).length;

        $("modulClassGrid").innerHTML = `
            <section class="admin-task-class-detail">
                <div class="admin-task-class-detail-nav">
                    <button type="button" class="btn btn-secondary" data-back-module-classes><i class="fas fa-arrow-left"></i> Kembali ke Daftar Kelas</button>
                    <span><i class="fas fa-users"></i> ${studentCache.filter(student => sameClass(student.kelas, selectedClass) && student.status === "aktif").length} siswa aktif</span>
                </div>
                <header class="admin-task-class-detail-header">
                    <span class="admin-task-class-icon"><i class="fas fa-folder-open"></i></span>
                    <div><small>Ruang modul</small><h3>Kelas ${escapeHTML(selectedClass)}</h3><p>Modul dibuat setelah kelas dipilih dan hanya ditujukan untuk kelas ini.</p></div>
                    <div class="admin-task-detail-stats"><span><b>${allClassModules.length}</b><small>Modul</small></span><span><b>${active}</b><small>Aktif</small></span></div>
                </header>
                <div class="admin-task-class-content">
                    <div class="admin-task-class-content-head">
                        <span><strong>Daftar modul</strong><small>${classModules.length} modul ditampilkan</small></span>
                        <button type="button" class="btn btn-primary btn-sm" data-add-module-class="${escapeHTML(selectedClass)}"><i class="fas fa-plus"></i> Tambah Modul</button>
                    </div>
                    <div class="admin-module-inner-list">${classModules.length ? classModules.map(renderModuleCard).join("") : '<div class="admin-task-class-empty"><i class="fas fa-book-open"></i><strong>Belum ada modul di kelas ini</strong><span>Klik Tambah Modul untuk membuat modul pertama.</span></div>'}</div>
                </div>
            </section>
        `;
    }

    function renderRows(modules) {
        if (!$("modulClassGrid")) {
            return;
        }

        syncModuleManagerChrome();

        if (selectedClass) {
            renderSelectedClassModules(modules);
            return;
        }

        renderClassOverview(modules);
    }

    async function loadModules() {
        const grid = $("modulClassGrid");

        if (grid) {
            grid.innerHTML = `
                <div class="admin-task-class-empty">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Memuat folder kelas dan modul...</span>
                </div>
            `;
        }

        let response;

        try {
            response = await client.rpc(
                "admin_list_modul",
                {
                    p_search: $("searchModul")?.value.trim() || "",
                    p_subject: $("filterSubject")?.value || ""
                }
            );
        } catch (error) {
            if (!isNetworkError(error)) {
                throw error;
            }

            response = { data: null, error };
        }

        const { data, error } = response;

        if (error) {
            if (isNetworkError(error)) {
                moduleCache = readModuleCache();
                renderRows(moduleCache);

                if ($("totalModul")) {
                    $("totalModul").textContent =
                        String(moduleCache.length);
                }

                if ($("totalVideo")) {
                    $("totalVideo").textContent = String(
                        moduleCache.filter(function (module) {
                            return Boolean(module.youtube_id);
                        }).length
                    );
                }

                return moduleCache;
            }

            throw new Error(databaseError(error));
        }

        moduleCache = Array.isArray(data) ? data : [];
        writeModuleCache(moduleCache);
        renderRows(moduleCache);

        if ($("totalModul")) {
            $("totalModul").textContent = String(moduleCache.length);
        }

        if ($("totalVideo")) {
            $("totalVideo").textContent = String(
                moduleCache.filter(function (module) {
                    return Boolean(module.youtube_id);
                }).length
            );
        }
    }

    function openModal() {
        $("modulModal")?.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        $("modulModal")?.classList.remove("active");
        document.body.style.overflow = "";
    }

    function setModuleSubject(value) {
        const select = $("modulSubject");
        const subject = String(value || "").trim();

        if (!select) {
            return;
        }

        const exists = Array.from(select.options).some(function (option) {
            return option.value === subject;
        });

        if (subject && !exists) {
            const option = document.createElement("option");
            option.value = subject;
            option.textContent = `${subject} (dari database)`;
            select.appendChild(option);
        }

        select.value = subject;
    }

    function openCreate(targetClass = "") {
        const className = String(
            targetClass || selectedClass || ""
        ).trim();

        if (!className) {
            showAlert(
                "Pilih salah satu kelas terlebih dahulu.",
                "info"
            );
            return;
        }

        editingId = null;
        currentPdfPath = null;
        selectedPdf = null;

        $("modulForm")?.reset();
        $("modulModalTitle").textContent = "Tambah Modul Perpustakaan";
        $("modulKelas").value = className;
        $("modulKelas").readOnly = true;
        $("modulDurasi").value = "15";
        $("modulAktif").checked = true;

        setPdfLabel();
        showCurrentPdf();
        updateYoutubePreview();
        openModal();

        window.setTimeout(function () {
            $("modulNama")?.focus();
        }, 50);
    }

    function openEdit(id) {
        const module = moduleCache.find(function (item) {
            return String(item.id) === String(id);
        });

        if (!module) {
            showAlert("Data modul tidak ditemukan.", "error");
            return;
        }

        editingId = module.id;
        currentPdfPath = module.pdf_path || null;
        selectedPdf = null;

        $("modulModalTitle").textContent = "Edit Modul Perpustakaan";
        $("modulNama").value = module.judul || "";
        setModuleSubject(module.mata_pelajaran);
        $("modulKelas").value = module.kelas || "";
        $("modulKelas").readOnly = true;
        $("modulDurasi").value = String(module.durasi_menit || 15);
        $("modulDeskripsi").value = module.deskripsi || "";
        $("modulYoutubeUrl").value = module.youtube_url || "";
        $("modulAktif").checked = module.status === "aktif";
        $("modulPdfFile").value = "";

        setPdfLabel();
        showCurrentPdf();
        updateYoutubePreview();
        openModal();
    }

    function readForm() {
        const youtubeUrl = $("modulYoutubeUrl")?.value.trim() || "";

        return {
            judul: $("modulNama")?.value.trim() || "",
            mata_pelajaran: $("modulSubject")?.value || "",
            kelas: $("modulKelas")?.value.trim() || "",
            durasi_menit: Number($("modulDurasi")?.value || 15),
            deskripsi: $("modulDeskripsi")?.value.trim() || "",
            youtube_url: youtubeUrl,
            youtube_id: youtubeIdFromUrl(youtubeUrl),
            status: $("modulAktif")?.checked ? "aktif" : "draft"
        };
    }

    function validateForm(module) {
        if (!module.judul || !module.mata_pelajaran || !module.kelas) {
            throw new Error("Judul, mata pelajaran, dan kelas wajib diisi.");
        }

        if (
            !Number.isFinite(module.durasi_menit) ||
            module.durasi_menit < 1 ||
            module.durasi_menit > 600
        ) {
            throw new Error("Durasi harus antara 1 sampai 600 menit.");
        }

        if (module.youtube_url && !module.youtube_id) {
            throw new Error("Link video YouTube tidak valid.");
        }

        if (!selectedPdf && !currentPdfPath) {
            throw new Error("File PDF wajib ditambahkan agar modul tampil di perpustakaan siswa.");
        }
    }

    function safeFileName(name) {
        return String(name || "modul.pdf")
            .normalize("NFKD")
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "modul.pdf";
    }

    async function uploadPdf(file) {
        const uniqueId =
            window.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const path = `${uniqueId}/${safeFileName(file.name)}`;
        const { error } = await client.storage
            .from(PDF_BUCKET)
            .upload(path, file, {
                contentType: "application/pdf",
                cacheControl: "3600",
                upsert: false
            });

        if (error) {
            throw new Error(databaseError(error));
        }

        return path;
    }

    async function removePdf(path) {
        if (!path) {
            return;
        }

        const { error } = await client.storage
            .from(PDF_BUCKET)
            .remove([path]);

        if (error) {
            console.warn("PDF lama gagal dihapus:", error);
        }
    }

    function setSaveLoading(loading) {
        const button = $("saveModulBtn");

        if (!button) {
            return;
        }

        button.disabled = loading;
        button.innerHTML = loading
            ? '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'
            : '<i class="fas fa-save"></i> Simpan Modul';
    }

    async function saveModule() {
        if (isSaving) {
            return;
        }

        const module = readForm();
        let uploadedPath = null;
        const previousPdfPath = editingId
            ? moduleCache.find(function (item) {
                return String(item.id) === String(editingId);
            })?.pdf_path || null
            : null;

        try {
            validateForm(module);
            isSaving = true;
            setSaveLoading(true);

            if (selectedPdf) {
                uploadedPath = await uploadPdf(selectedPdf);
            }

            const pdfPath = uploadedPath || currentPdfPath || null;
            const rpcName = editingId
                ? "admin_update_modul"
                : "admin_create_modul";

            const payload = {
                p_judul: module.judul,
                p_mata_pelajaran: module.mata_pelajaran,
                p_deskripsi: module.deskripsi || null,
                p_kelas: module.kelas || null,
                p_durasi_menit: module.durasi_menit,
                p_pdf_path: pdfPath,
                p_youtube_url: module.youtube_url || null,
                p_youtube_id: module.youtube_id || null,
                p_status: module.status
            };

            if (editingId) {
                payload.p_id = editingId;
            }

            const { error } = await client.rpc(rpcName, payload);

            if (error) {
                throw new Error(databaseError(error));
            }

            if (
                previousPdfPath &&
                previousPdfPath !== pdfPath
            ) {
                await removePdf(previousPdfPath);
            }

            closeModal();
            showAlert(
                editingId
                    ? "Modul berhasil diperbarui."
                    : "Modul berhasil ditambahkan dan tersimpan di Supabase."
            );

            editingId = null;
            currentPdfPath = null;
            selectedPdf = null;
            await loadModules();
        } catch (error) {
            if (uploadedPath) {
                await removePdf(uploadedPath);
            }

            console.error("Gagal menyimpan modul:", error);
            showAlert(error.message, "error");
        } finally {
            isSaving = false;
            setSaveLoading(false);
        }
    }

    async function deleteModule(id) {
        const module = moduleCache.find(function (item) {
            return String(item.id) === String(id);
        });

        if (!module) {
            return;
        }

        if (!window.confirm(
            `Hapus modul “${module.judul}”?\n\nPDF dan data modul akan dihapus permanen.`
        )) {
            return;
        }

        try {
            const { data, error } = await client.rpc(
                "admin_delete_modul",
                { p_id: id }
            );

            if (error) {
                throw new Error(databaseError(error));
            }

            await removePdf(data?.pdf_path || module.pdf_path);
            showAlert("Modul berhasil dihapus.");
            await loadModules();
        } catch (error) {
            console.error("Gagal menghapus modul:", error);
            showAlert(error.message, "error");
        }
    }

    function openModuleClass(className) {
        selectedClass = String(className || "").trim();
        $("searchModul").value = "";
        renderRows(moduleCache);
    }

    function closeModuleClass() {
        selectedClass = "";
        $("searchModul").value = "";
        renderRows(moduleCache);
    }

    function attachEvents() {
        $("addModulBtn")?.addEventListener("click", function () {
            openCreate(selectedClass);
        });

        $("saveModulBtn")?.addEventListener("click", function (event) {
            event.preventDefault();
            saveModule();
        });

        $("modulForm")?.addEventListener("submit", function (event) {
            event.preventDefault();
            saveModule();
        });

        document.querySelectorAll('[data-modal="modulModal"]')
            .forEach(function (button) {
                button.addEventListener("click", closeModal);
            });

        $("modulModal")?.addEventListener("click", function (event) {
            if (event.target === $("modulModal")) {
                closeModal();
            }
        });

        $("modulPreviewClose")
            ?.addEventListener("click", closePreview);

        $("modulPreviewDownload")
            ?.addEventListener("click", downloadPreviewPdf);

        $("modulAdminYoutubePlay")
            ?.addEventListener("click", playAdminYoutube);

        $("modulPreviewModal")
            ?.addEventListener("click", function (event) {
                if (
                    event.target ===
                    $("modulPreviewModal")
                ) {
                    closePreview();
                }
            });

        $("modulPreviewTabs")
            ?.addEventListener("click", function (event) {
                const tab = event.target.closest(
                    "[data-preview-type]"
                );

                if (tab) {
                    showPreviewType(
                        tab.dataset.previewType
                    );
                }
            });

        $("modulPreviewFullscreen")
            ?.addEventListener("click", function () {
                const target =
                    previewType === "youtube"
                        ? $("modulAdminYoutubeWrap")
                        : $("modulAdminPdfWrap");

                target?.requestFullscreen?.();
            });

        $("modulPdfFile")?.addEventListener("change", function (event) {
            const file = event.target.files?.[0] || null;

            if (!file) {
                selectedPdf = null;
                setPdfLabel();
                return;
            }

            if (
                file.type !== "application/pdf" &&
                !file.name.toLowerCase().endsWith(".pdf")
            ) {
                event.target.value = "";
                selectedPdf = null;
                showAlert("File harus berformat PDF.", "error");
                setPdfLabel();
                return;
            }

            if (file.size > MAX_PDF_SIZE) {
                event.target.value = "";
                selectedPdf = null;
                showAlert("Ukuran PDF maksimal 20 MB.", "error");
                setPdfLabel();
                return;
            }

            selectedPdf = file;
            setPdfLabel();
        });

        $("modulYoutubeUrl")?.addEventListener(
            "input",
            updateYoutubePreview
        );

        $("searchModul")?.addEventListener("input", function () {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
                loadModules().catch(function (error) {
                    showAlert(error.message, "error");
                });
            }, 300);
        });

        $("filterSubject")?.addEventListener("change", function () {
            loadModules().catch(function (error) {
                showAlert(error.message, "error");
            });
        });

        $("modulClassGrid")?.addEventListener("click", function (event) {
            const openClass = event.target.closest(
                "[data-open-module-class]"
            );
            const back = event.target.closest(
                "[data-back-module-classes]"
            );
            const addToClass = event.target.closest(
                "[data-add-module-class]"
            );
            const button = event.target.closest("[data-module-action]");

            if (openClass) {
                openModuleClass(
                    openClass.dataset.openModuleClass
                );
                return;
            }

            if (back) {
                closeModuleClass();
                return;
            }

            if (addToClass) {
                openCreate(
                    addToClass.dataset.addModuleClass
                );
                return;
            }

            if (!button) {
                return;
            }

            const id = button.dataset.moduleId;

            if (button.dataset.moduleAction === "edit") {
                openEdit(id);
            }

            if (button.dataset.moduleAction === "preview") {
                openPreview(id);
            }

            if (button.dataset.moduleAction === "delete") {
                deleteModule(id);
            }
        });

        document.querySelector('[data-page="modul"]')
            ?.addEventListener("click", async function () {
                try {
                    await loadClassCatalog();
                    await loadModules();
                } catch (error) {
                    moduleCache = [];
                    renderRows(moduleCache);
                    showAlert(error.message, "error");
                }
            });

        document.addEventListener("keydown", function (event) {
            if (
                event.key === "Escape" &&
                $("modulModal")?.classList.contains("active")
            ) {
                closeModal();
            }

            if (
                event.key === "Escape" &&
                $("modulPreviewModal")
                    ?.classList.contains("active")
            ) {
                closePreview();
            }
        });
    }

    async function initialize() {
        if (!$("modulPage")) {
            return;
        }

        if (
            !window.supabase ||
            typeof window.supabase.createClient !== "function"
        ) {
            showAlert("Library Supabase gagal dimuat.", "error");
            return;
        }

        client = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        if (!window.EduSkyPdfReader) {
            showAlert(
                "Pembaca PDF gagal dimuat. Periksa koneksi internet.",
                "error"
            );
            return;
        }

        pdfReader = window.EduSkyPdfReader.create({
            container: $("modulAdminPdfViewer"),
            status: $("modulAdminPdfStatus")
        });

        if (window.EduSkyYoutubePlayer) {
            youtubeController = window.EduSkyYoutubePlayer.create({
                iframe: $("modulAdminYoutubeViewer"),
                onFallback({ url }) {
                    showAlert(
                        "Video tidak mendukung pemutaran embed. Membuka YouTube…",
                        "info"
                    );
                    window.location.assign(url);
                }
            });
        }

        attachEvents();

        try {
            await loadClassCatalog();
            await loadModules();
        } catch (error) {
            console.error("CRUD modul gagal dimuat:", error);
            moduleCache = [];
            renderRows(moduleCache);
            showAlert(error.message, "error");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }
})();
