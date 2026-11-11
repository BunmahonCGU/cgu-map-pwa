// ------------------------------------------------------------
// IRCG TREATMENT CHECK CARDS (V2.22)
// A scrollable PDF.js view of docs/ircg-treatment-check-cards.pdf that
// opens behind the Handover Notes panel whenever that panel is open
// (js/handover.js calls checkCards.open / checkCards.close).
//
// PDF.js (js/vendor/pdf.min.js) is only loaded the first time the cards
// are opened, so it costs nothing at app start. Pages are drawn as they
// scroll into view, and redrawn sharper when zoomed.
// ------------------------------------------------------------

const CHECKCARDS_PDF = "docs/ircg-treatment-check-cards.pdf";
const CHECKCARDS_ZOOMS = [1, 1.5, 2, 3];

const checkCards = (() => {
  const viewer = document.getElementById("checkcards-viewer");
  const pagesEl = document.getElementById("checkcards-pages");
  const statusEl = document.getElementById("checkcards-status");
  const zoomOutBtn = document.getElementById("checkcards-zoom-out");
  const zoomInBtn = document.getElementById("checkcards-zoom-in");

  let libPromise = null;
  let docPromise = null;
  let zoomIndex = 0;
  let observer = null;
  const pages = []; // { wrap, canvas, page, drawnWidth }

  function loadLib() {
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "js/vendor/pdf.min.js";
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        };
        s.onerror = () => {
          libPromise = null;
          reject(new Error("Couldn't load the PDF viewer"));
        };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  // Width every page is drawn at, in CSS pixels.
  function pageWidth() {
    const base = Math.min(pagesEl.clientWidth - 16, 600);
    return Math.max(200, base) * CHECKCARDS_ZOOMS[zoomIndex];
  }

  async function drawPage(p) {
    const width = pageWidth();
    if (p.drawnWidth === width) return;
    p.drawnWidth = width;
    const unscaled = p.page.getViewport({ scale: 1 });
    const scale = width / unscaled.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const viewport = p.page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = width + "px";
    canvas.style.height = (unscaled.height * scale) + "px";
    await p.page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    if (p.drawnWidth !== width) return; // zoom changed while drawing
    if (p.canvas) p.canvas.replaceWith(canvas);
    else p.wrap.appendChild(canvas);
    p.canvas = canvas;
  }

  // Placeholder size before a page is drawn, so the scrollbar is right.
  function sizeWrap(p) {
    const unscaled = p.page.getViewport({ scale: 1 });
    const width = pageWidth();
    p.wrap.style.width = width + "px";
    p.wrap.style.height = (unscaled.height * width / unscaled.width) + "px";
  }

  async function build() {
    statusEl.textContent = "Loading check cards…";
    const pdfjsLib = await loadLib();
    const doc = await pdfjsLib.getDocument(CHECKCARDS_PDF).promise;
    observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) drawPage(pages[Number(e.target.dataset.index)]).catch(() => {});
      }
    }, { root: pagesEl, rootMargin: "100% 0px" });
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const wrap = document.createElement("div");
      wrap.className = "checkcards-page";
      wrap.dataset.index = String(pages.length);
      const p = { wrap, page, canvas: null, drawnWidth: 0 };
      pages.push(p);
      sizeWrap(p);
      pagesEl.appendChild(wrap);
      observer.observe(wrap);
    }
    statusEl.textContent = "";
    return doc;
  }

  function setZoom(index) {
    if (index < 0 || index >= CHECKCARDS_ZOOMS.length || !pages.length) return;
    // Keep the same point of the document in view across the zoom.
    const frac = pagesEl.scrollTop / Math.max(1, pagesEl.scrollHeight);
    zoomIndex = index;
    pages.forEach(sizeWrap);
    pagesEl.scrollTop = frac * pagesEl.scrollHeight;
    zoomOutBtn.disabled = zoomIndex === 0;
    zoomInBtn.disabled = zoomIndex === CHECKCARDS_ZOOMS.length - 1;
    // Redraw what's on screen now; the observer handles the rest on scroll.
    const view = pagesEl.getBoundingClientRect();
    for (const p of pages) {
      const r = p.wrap.getBoundingClientRect();
      if (r.bottom > view.top - view.height && r.top < view.bottom + view.height) {
        drawPage(p).catch(() => {});
      }
    }
  }

  zoomOutBtn.addEventListener("click", () => setZoom(zoomIndex - 1));
  zoomInBtn.addEventListener("click", () => setZoom(zoomIndex + 1));
  zoomOutBtn.disabled = true;

  return {
    open() {
      viewer.classList.remove("hidden");
      if (!docPromise) {
        docPromise = build().catch(err => {
          docPromise = null;
          statusEl.textContent = "Couldn't load the check cards" +
            (navigator.onLine ? "." : ": no signal, and they haven't been saved on this phone yet.");
          console.warn("Check cards:", err);
        });
      }
    },
    close() {
      viewer.classList.add("hidden");
    },
  };
})();
