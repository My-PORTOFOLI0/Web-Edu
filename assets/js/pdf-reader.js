(function () {
  "use strict";

  const PDFJS_VERSION = "5.7.284";
  const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
  const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;
  let libraryPromise = null;

  function loadLibrary() {
    if (!libraryPromise) {
      libraryPromise = import(PDFJS_URL).then(pdfjsLib => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjsLib;
      });
    }

    return libraryPromise;
  }

  function normalizeSource(source) {
    if (typeof source === "string") return { url: source };
    if (source instanceof ArrayBuffer) return { data: new Uint8Array(source) };
    if (source instanceof Uint8Array) return { data: source };
    if (source && (source.url || source.data)) return source;
    throw new Error("Sumber PDF tidak valid.");
  }

  function create({ container, status }) {
    if (!container) throw new Error("Container pembaca PDF tidak ditemukan.");

    container.classList.add("edusky-pdf-reader");
    const pages = document.createElement("div");
    pages.className = "edusky-pdf-pages";
    if (status && status.parentElement !== container) {
      container.appendChild(status);
    }
    container.appendChild(pages);

    let currentTask = null;
    let loadNumber = 0;

    function showStatus(message, isError = false) {
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
      status.classList.toggle("is-error", isError);
    }

    function hideStatus() {
      if (!status) return;
      status.hidden = true;
      status.classList.remove("is-error");
    }

    function clear() {
      loadNumber += 1;
      if (currentTask) {
        currentTask.destroy().catch(() => {});
        currentTask = null;
      }
      pages.replaceChildren();
      hideStatus();
    }

    async function load(source) {
      const thisLoad = ++loadNumber;
      pages.replaceChildren();
      showStatus("Menyiapkan PDF di dalam halaman…");

      try {
        const pdfjsLib = await loadLibrary();
        if (thisLoad !== loadNumber) return;

        if (currentTask) {
          await currentTask.destroy().catch(() => {});
        }

        const loadingTask = pdfjsLib.getDocument(normalizeSource(source));
        currentTask = loadingTask;
        const pdf = await loadingTask.promise;
        if (thisLoad !== loadNumber) return;

        const availableWidth = Math.max(280, container.clientWidth - 48);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (thisLoad !== loadNumber) return;

          showStatus(`Memuat halaman ${pageNumber} dari ${pdf.numPages}…`);
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const displayScale = Math.min(1.65, availableWidth / baseViewport.width);
          const viewport = page.getViewport({ scale: Math.max(0.65, displayScale) });
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);

          const shell = document.createElement("section");
          shell.className = "edusky-pdf-page";
          shell.setAttribute("aria-label", `Halaman ${pageNumber}`);

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const label = document.createElement("div");
          label.className = "edusky-pdf-page-number";
          label.textContent = `Halaman ${pageNumber} / ${pdf.numPages}`;

          shell.append(canvas, label);
          pages.appendChild(shell);

          await page.render({
            canvasContext: context,
            viewport,
            transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
          }).promise;
          page.cleanup();
        }

        if (thisLoad === loadNumber) hideStatus();
      } catch (error) {
        if (thisLoad !== loadNumber) return;
        console.error("PDF reader:", error);
        showStatus(
          "PDF tidak dapat ditampilkan. Periksa koneksi internet atau konfigurasi akses file di Supabase.",
          true
        );
        throw error;
      }
    }

    return { load, clear };
  }

  function safeFilename(value) {
    const name = String(value || "modul")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim();
    const normalized = name || "modul";
    return normalized.toLowerCase().endsWith(".pdf")
      ? normalized
      : `${normalized}.pdf`;
  }

  async function download(url, filename) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unduhan gagal (${response.status}).`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeFilename(filename);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }

  window.EduSkyPdfReader = { create, download, safeFilename };
})();
