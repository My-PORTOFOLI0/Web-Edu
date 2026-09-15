(function () {
  "use strict";

  const API_URL = "https://www.youtube.com/iframe_api";
  let apiPromise = null;

  function validId(value) {
    const id = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  function watchUrl(videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  function embedUrl(videoId) {
    const params = new URLSearchParams({
      autoplay: "1",
      controls: "1",
      enablejsapi: "1",
      playsinline: "1",
      rel: "0",
      fs: "1"
    });

    if (/^https?:$/.test(window.location.protocol)) {
      params.set("origin", window.location.origin);
    }

    return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
  }

  function loadApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;

    apiPromise = new Promise((resolve, reject) => {
      const previousReady = window.onYouTubeIframeAPIReady;
      const timeout = window.setTimeout(() => {
        reject(new Error("YouTube Player API tidak merespons."));
      }, 15000);

      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReady === "function") previousReady();
        window.clearTimeout(timeout);
        resolve(window.YT);
      };

      if (!document.querySelector(`script[src="${API_URL}"]`)) {
        const script = document.createElement("script");
        script.src = API_URL;
        script.async = true;
        script.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("YouTube Player API gagal dimuat."));
        };
        document.head.appendChild(script);
      }
    });

    return apiPromise;
  }

  function create({ iframe, onFallback }) {
    if (!iframe?.id) {
      throw new Error("Iframe YouTube tidak ditemukan.");
    }

    let player = null;
    let activeVideoId = null;
    let isCreating = false;

    function fallback(videoId, errorCode) {
      const url = watchUrl(videoId);

      if (typeof onFallback === "function") {
        onFallback({ videoId, url, errorCode });
        return;
      }

      window.location.assign(url);
    }

    async function play(value) {
      const videoId = validId(value);
      if (!videoId) return;

      activeVideoId = videoId;

      if (player?.loadVideoById) {
        player.loadVideoById(videoId);
        return;
      }

      if (isCreating) return;
      isCreating = true;
      iframe.src = embedUrl(videoId);

      try {
        const YT = await loadApi();
        player = new YT.Player(iframe.id, {
          events: {
            onReady(event) {
              event.target.playVideo();
            },
            onError(event) {
              fallback(activeVideoId || videoId, Number(event.data));
            }
          }
        });
      } catch (error) {
        console.error("YouTube player:", error);
        fallback(activeVideoId || videoId, "api");
      } finally {
        isCreating = false;
      }
    }

    function stop() {
      try {
        player?.stopVideo?.();
      } catch (error) {
        console.warn("Video tidak dapat dihentikan:", error);
      }
    }

    return { play, stop, watchUrl };
  }

  window.EduSkyYoutubePlayer = { create, watchUrl, validId };
})();
