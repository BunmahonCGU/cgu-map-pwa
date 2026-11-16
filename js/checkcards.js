// ------------------------------------------------------------
// IRCG TREATMENT CHECK CARDS (V2.22)
// A scrollable PDF.js view of cards/ircg-treatment-check-cards.pdf that
// opens behind the Handover Notes panel whenever that panel is open
// (js/handover.js calls checkCards.open / checkCards.close).
//
// PDF.js (js/vendor/pdf.min.js) is only loaded the first time the cards
// are opened, so it costs nothing at app start. Pages are drawn as they
// scroll into view, and redrawn sharper when zoomed.
//
// V2.25: the fill-in boxes (js/cardfields.js) are tappable. A tap opens
// a picker for the casualty selected in the Handover panel; the value is
// drawn in the box and saved through window.cardStore (js/handover.js).
// ------------------------------------------------------------

// Not under docs/: the test site's .assetsignore hides that folder (V2.23).
const CHECKCARDS_PDF = "cards/ircg-treatment-check-cards.pdf";
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
    else p.wrap.insertBefore(canvas, p.wrap.firstChild);
    p.canvas = canvas;
  }

  // Placeholder size before a page is drawn, so the scrollbar is right.
  function sizeWrap(p) {
    const unscaled = p.page.getViewport({ scale: 1 });
    const width = pageWidth();
    p.wrap.style.width = width + "px";
    p.wrap.style.height = (unscaled.height * width / unscaled.width) + "px";
    p.wrap.style.setProperty("--pw", width + "px");
  }

  // ---- Fill-in boxes (V2.25) ----
  const bannerEl = document.getElementById("checkcards-banner");
  const boxEls = []; // { el, f }

  function addBoxes(p, pageNo) {
    const fields = CARD_FIELDS.filter(f => f.page === pageNo);
    if (!fields.length) return;
    const layer = document.createElement("div");
    layer.className = "ck-layer";
    for (const f of fields) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "ck-box" + (f.type === "text" ? " ck-text" : "") + (f.line ? " ck-line" : "") + (f.small ? " ck-small" : "") + (f.mark ? " ck-mark" : "");
      el.style.left = f.x * 100 + "%";
      el.style.top = f.y * 100 + "%";
      el.style.width = f.w * 100 + "%";
      el.style.height = f.h * 100 + "%";
      el.setAttribute("aria-label", f.label);
      el.addEventListener("click", () => openPicker(f));
      layer.appendChild(el);
      boxEls.push({ el, f });
    }
    p.wrap.appendChild(layer);
  }

  function refreshBoxes() {
    const store = window.cardStore;
    const tab = store && store.selectedTab();
    const values = tab ? store.values(tab.id) : {};
    if (bannerEl) {
      bannerEl.textContent = tab ? "Recording for: " + tab.name : "Add a casualty tab to fill in the cards";
      bannerEl.classList.toggle("none", !tab);
    }
    for (const { el, f } of boxEls) {
      if (f.mark) {
        el.classList.toggle("chosen", values[f.id] === f.mark);
        el.textContent = values[f.id] === f.mark ? "✓" : "";
        continue;
      }
      const shown = cardShownValue(f, values);
      el.textContent = cardDisplay(f, shown.value);
      el.classList.toggle("filled", !!shown.value);
      el.classList.toggle("auto", shown.auto);
      el.style.color = shown.auto ? "" : (cardValueColour(f, shown.value) || "");
    }
  }

  // ---- Picker ----
  const sheet = document.createElement("div");
  sheet.id = "ck-sheet";
  sheet.className = "hidden";
  document.body.appendChild(sheet);
  sheet.addEventListener("click", e => { if (e.target === sheet) closePicker(); });

  function closePicker() {
    sheet.classList.add("hidden");
    sheet.innerHTML = "";
  }

  // In Casualty Monitoring, saving a box moves on to the next empty box
  // in the same row; the row's time fills itself in.
  function nextInRow(f, values) {
    if (f.page !== 6) return null;
    const order = MON_COLS.map(c => c.key);
    for (let i = order.indexOf(f.col) + 1; i < order.length; i++) {
      const id = `mon.${f.row}.${order[i]}`;
      if (!values[id]) return cardFieldById(id);
    }
    return null;
  }

  const nowHM = () => new Date().toTimeString().slice(0, 5);

  function openPicker(f) {
    const store = window.cardStore;
    if (!store) return;
    const tab = store.selectedTab();
    if (!tab) {
      if (bannerEl) { bannerEl.classList.remove("flash"); void bannerEl.offsetWidth; bannerEl.classList.add("flash"); }
      alert("Pick or add a casualty tab in the Handover panel first.");
      return;
    }
    const readOnly = store.readOnly();
    const values = store.values(tab.id);
    const rec = store.record(tab.id, f.id);
    const shown = cardShownValue(f, values);
    const current = values[f.id] || "";
    let pending = current;

    const esc = escapeHtml;
    const hist = rec && rec.history && rec.history.length
      ? `<details class="ck-hist"><summary>History (${rec.history.length})</summary><ul>${
          rec.history.map(h => `<li>${esc(h.value ? cardDisplay(f, h.value) : "(cleared)")} <span>${fmtTime(h.t)} ${esc(h.by || "")}</span></li>`).join("")
        }</ul></details>` : "";
    const meta = rec && rec.value
      ? `<div class="ck-meta">Set ${fmtTime(rec.t)} by ${esc(rec.by || "")}</div>`
      : (shown.auto ? `<div class="ck-meta">Filled in for you from the cards: ${esc(cardDisplay(f, shown.value))}. Pick a value to change it.</div>` : "");

    let body = "";
    const optBtn = (o, on) => `<button type="button" class="ck-opt${on ? " on" : ""}" data-v="${esc(o.v)}"${o.c ? ` style="--c:${o.c}"` : ""}>${esc(o.label || o.v)}</button>`;
    if (f.type === "choice") {
      body = `<div class="ck-opts${f.options.length > 6 ? " many" : ""}">${f.options.map(o => optBtn(o, o.v === current)).join("")}</div>`;
    } else if (f.type === "multi") {
      const on = current.split(", ").filter(Boolean);
      body = `<div class="ck-opts">${f.options.map(o => optBtn(o, on.includes(o.v))).join("")}</div>`;
    } else if (f.type === "number") {
      body = (f.quick ? `<div class="ck-opts many">${f.quick.map(q => optBtn({ v: q, c: f.colour(q) }, q === current)).join("")}</div>` : "") +
        `<div class="ck-row"><input type="number" inputmode="numeric" min="0" max="400" id="pick-rate" name="pick-rate" autocomplete="off" placeholder="Rate${f.unit ? " " + f.unit : ""}" value="${/^\d+$/.test(current) ? esc(current) : ""}">` +
        (f.x6 ? `<label class="ck-x6"><input type="checkbox" id="ck-x6"> 10-sec count ×6</label>` : "") + `</div>`;
    } else if (f.type === "time") {
      body = `<div class="ck-row"><button type="button" class="ck-now">Now</button><input type="time" id="pick-clock" name="pick-clock" autocomplete="off" value="${/^\d\d:\d\d$/.test(current) ? current : ""}"></div>` +
        (f.extra ? `<div class="ck-opts">${f.extra.map(v => optBtn({ v }, v === current)).join("")}</div>` : "");
    } else {
      let text = current;
      if (!text && f.prefill) text = cardTreatmentSummary(values);
      body = (f.quick ? `<div class="ck-opts many">${f.quick.map(q => optBtn({ v: q }, q === current)).join("")}</div>` : "") +
        `<textarea id="pick-words" name="pick-words" autocomplete="off" rows="${f.line ? 2 : 4}">${esc(text)}</textarea>` +
        `<div class="ck-row">${f.stamp ? '<button type="button" class="ck-stamp">+ time</button>' : ""}<button type="button" id="ck-dictate" class="dictate-btn">🎙 Hold to record</button></div>` +
        `<div id="ck-dictate-status" class="dictate-status"></div>` +
        (f.prefill && !current && text ? `<div class="ck-meta">Suggested from the cards. Check it and add to it before saving.</div>` : "");
    }

    sheet.innerHTML = `<div class="ck-card">
      <div class="ck-who">${esc(tab.name)}</div>
      <h3>${esc(f.label)}</h3>
      ${meta}
      ${readOnly ? `<div class="ck-value">${esc(cardDisplay(f, shown.value) || "Empty")}</div>` : body}
      ${hist}
      <div class="dialog-buttons">
        ${readOnly ? "" : `<button type="button" class="ck-clear"${current ? "" : " disabled"}>Clear</button>`}
        <button type="button" class="ck-cancel">${readOnly ? "Close" : "Cancel"}</button>
        ${!readOnly && f.page === 6 && nextInRow(f, Object.assign({}, values, { [f.id]: "x" })) ? `<button type="button" class="ck-skip">Skip ›</button>` : ""}
        ${readOnly || f.type === "choice" ? "" : `<button type="button" class="primary ck-save">Save</button>`}
      </div>
    </div>`;
    sheet.classList.remove("hidden");

    const save = async value => {
      closePicker();
      const r = await store.save(tab.id, f.id, value);
      if (!r) return;
      // Monitoring: stamp the row's time, then go on along the row.
      if (value && f.page === 6 && f.col !== "time" && !store.values(tab.id)[`mon.${f.row}.time`]) {
        await store.save(tab.id, `mon.${f.row}.time`, nowHM());
      }
      const next = value ? nextInRow(f, store.values(tab.id)) : null;
      if (next) openPicker(next);
    };

    sheet.querySelector(".ck-cancel").addEventListener("click", closePicker);
    // Monitoring: leave this box empty and go on to the next one in the row.
    const skipBtn = sheet.querySelector(".ck-skip");
    if (skipBtn) skipBtn.addEventListener("click", () => {
      const next = nextInRow(f, Object.assign({}, store.values(tab.id), { [f.id]: "x" }));
      closePicker();
      if (next) openPicker(next);
    });
    if (readOnly) return;
    sheet.querySelector(".ck-clear").addEventListener("click", () => save(""));

    const opts = [...sheet.querySelectorAll(".ck-opt")];
    const num = sheet.querySelector("#pick-rate");
    const time = sheet.querySelector("#pick-clock");
    const text = sheet.querySelector("#pick-words");
    opts.forEach(b => b.addEventListener("click", () => {
      const v = b.dataset.v;
      if (f.type === "choice") return save(v);
      if (f.type === "multi") {
        b.classList.toggle("on");
        if (v === "None" && b.classList.contains("on")) opts.forEach(o => o !== b && o.classList.remove("on"));
        if (v !== "None") opts.forEach(o => o.dataset.v === "None" && o.classList.remove("on"));
        pending = opts.filter(o => o.classList.contains("on")).map(o => o.dataset.v).join(", ");
        return;
      }
      if (f.type === "text") {
        text.value = v;
        text.focus();
        return;
      }
      opts.forEach(o => o.classList.toggle("on", o === b));
      pending = v;
      if (num) num.value = "";
      if (time) time.value = "";
    }));
    if (num) num.addEventListener("input", () => { opts.forEach(o => o.classList.remove("on")); pending = ""; });
    if (time) {
      time.addEventListener("input", () => opts.forEach(o => o.classList.remove("on")));
      sheet.querySelector(".ck-now").addEventListener("click", () => { time.value = nowHM(); opts.forEach(o => o.classList.remove("on")); });
    }
    if (text) {
      attachDictation(sheet.querySelector("#ck-dictate"), text, sheet.querySelector("#ck-dictate-status"));
      const stamp = sheet.querySelector(".ck-stamp");
      if (stamp) stamp.addEventListener("click", () => {
        text.value = (text.value.trim() ? text.value.trim() + " " : "") + nowHM() + " ";
        text.focus();
      });
    }
    const saveBtn = sheet.querySelector(".ck-save");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      let v = pending;
      if (f.type === "number" && num && num.value !== "") {
        let n = Math.round(+num.value);
        if (sheet.querySelector("#ck-x6") && sheet.querySelector("#ck-x6").checked) n *= 6;
        v = String(Math.max(0, n));
      } else if (f.type === "time") {
        const on = opts.find(o => o.classList.contains("on"));
        v = on ? on.dataset.v : (time.value || "");
      } else if (f.type === "text") {
        v = text.value.trim();
      }
      if (v === current) return closePicker();
      save(v);
    });
    if (time && !current) time.value = nowHM();
  }

  async function build() {
    statusEl.textContent = "Loading check cards…";
    const pdfjsLib = await loadLib();
    // Whole-file load: the service worker answers from its cache with the
    // full file, which doesn't suit PDF.js's chunked (Range) loading.
    const doc = await pdfjsLib.getDocument({
      url: CHECKCARDS_PDF, disableRange: true, disableStream: true,
    }).promise;
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
      addBoxes(p, i);
      pagesEl.appendChild(wrap);
      observer.observe(wrap);
    }
    statusEl.textContent = "";
    refreshBoxes();
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
      closePicker();
    },
    // Redraw the boxes' values (js/handover.js calls this after a refresh
    // or a change of casualty tab).
    refresh() {
      refreshBoxes();
    },
  };
})();
