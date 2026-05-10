// ------------------------------------------------------------
// Bunmahon CGU Access Map – Full Feature Version (FINAL)
// ------------------------------------------------------------
//
let tracking = true;
let lastLocation = null;
let map;
const userIcon = L.divIcon({
    className: "user-location-icon",
    iconSize: [28, 28],   // size of the dot
    iconAnchor: [14, 14]  // center the dot on the location
});

async function checkTokenStatus() {
  const el = document.getElementById("token-status");
  const debugEl = document.getElementById("token-debug");

  try {
    const res = await fetch("https://shiny-math-8471.bunmahoncgu.workers.dev/token-health", {
      method: "POST"
    });

    const data = await res.json();
    const payload = data.raw || data;  // 👈 key line

    if (debugEl) {
      debugEl.textContent = JSON.stringify(payload, null, 2);
    }

    if (payload.status === "ok") {
      const days = payload.days_remaining;

      if (days > 14) {
        el.textContent = `Token Status: Healthy (${days} days remaining)`;
        el.style.color = "green";
      } else if (days > 0) {
        el.textContent = `Token Status: WARNING (${days} days remaining)`;
        el.style.color = "orange";
      } else {
        el.textContent = "Token Status: EXPIRED — renewal required";
        el.style.color = "red";
      }

      el.title = `Expires at: ${payload.expires_at}`;

    } else if (payload.status === "unknown") {
      el.textContent = "Token Status: Unknown — GitHub does not provide expiry for this token type";
      el.style.color = "orange";
      el.title = payload.message || "";

    } else {
      el.textContent = `Token Status: ERROR — ${payload.error || "Unknown error"}`;
      el.style.color = "red";
      //el.title = JSON.stringify(payload, null, 2);
    }

  } catch (err) {
    el.textContent = `Token Status: ERROR — ${err.toString()}`;
    el.style.color = "red";
    if (debugEl) debugEl.textContent = err.toString();
  }
}


// Disable Leaflet HTML sanitization so <img> tags are not stripped
L.Popup.prototype.options.sanitize = false;

// Extract label safely (iconUrl → label → name)
function getFeatureLabel(feature) {
    const props = feature.properties || {};

    if (props._umap_options && props._umap_options.iconUrl) {
        return props._umap_options.iconUrl;
    }

    if (props.label) return props.label;

    return props.name || "";
}

// Extract prefix safely: leading letters only (e.g. WAP4a → WAP)
function getFeaturePrefixFromName(name) {
    const match = (name || "").match(/^[A-Za-z]+/);
    return match ? match[0] : "";
}

// ------------------------------------------------------------
// uMap-style popup formatter (FINAL)
// ------------------------------------------------------------
function formatUmapPopup(raw) {
    if (!raw) return "";
    raw = raw.replace(/^"(.*)"$/s, "$1");

    let out = raw;

    // --- 0) Extract iframes so they don't get <br/> inserted ---
    const iframes = [];
    out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, (match) => {
        const token = `__IFRAME_${iframes.length}__`;
        iframes.push(match);
        return token;
    });

    // --- 1) uMap {{image}} syntax ---
    out = out.replace(
        /\{\{\s*(https?:\/\/[^}\s]+)\s*\}\}/gi,
        '<img src="$1" style="max-width:100%; margin-top:6px;"/>'
    );

    // --- 2) Remove Markdown image syntax ---
    out = out.replace(/!\[[^\]]*\]\([^)]+\)/g, "");

    // --- 3) Remove escaped <img> ---
    out = out.replace(/&lt;img[^&]*&gt;/gi, "");

    // --- 4) Convert line breaks ---
    out = out.replace(/\n/g, "<br/>");
    out = out.replace(/##/g, "<br/>");

    // --- 5) Bold ---
    out = out.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // --- 6) Auto‑link remaining URLs ---
    out = out.replace(
        /(?<!["'=])(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank">$1</a>'
    );

    // --- 7) Restore iframe blocks (clean, untouched) ---
    iframes.forEach((iframe, i) => {
        out = out.replace(`__IFRAME_${i}__`, iframe);
    });

    return out;
}



// ------------------------------------------------------------
// SVG Icon Factory (40×40, minified SVG strings)
// ------------------------------------------------------------
function makeSvgIcon(shape, color, label) {
    let svg = "";

    if (shape === "circle-pin") {
        svg = '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 3 C11 3 5 9 5 17 C5 27 20 38 20 38 C20 38 35 27 35 17 C35 9 29 3 20 3 Z" fill="'+color+'" stroke="black" stroke-width="2"/><text x="20" y="17" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">'+label+'</text></svg>';
    }

    if (shape === "square-pin") {
        svg = '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M10 5 H30 V17 C30 27 20 38 20 38 C20 38 10 27 10 17 Z" fill="'+color+'" stroke="black" stroke-width="2"/><text x="20" y="15" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">'+label+'</text></svg>';
    }

    if (shape === "defib-pin") {
        svg = '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 3 C11 3 5 9 5 17 C5 27 20 38 20 38 C20 38 35 27 35 17 C35 9 29 3 20 3 Z" fill="'+color+'" stroke="black" stroke-width="2"/><path d="M12 22l4-6 2 4 2-3 6 5" stroke="white" stroke-width="2" fill="none"/><text x="20" y="17" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">'+label+'</text></svg>';
    }

    if (shape === "monument") {
        svg = '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M14 32h12v-3H14zm3-6h6V10h-6z" fill="'+color+'" stroke="black" stroke-width="2"/></svg>';
    }

    return L.divIcon({
        html: svg,
        className: "",
        iconSize: [40, 40],
        iconAnchor: [20, 38],
        popupAnchor: [0, -38]
    });
}
// ------------------------------------------------------------
// Fix error on admin button
// ------------------------------------------------------------

const adminBtn = document.getElementById("adminButton");
if (adminBtn) {
    adminBtn.onclick = () => {
        document.getElementById("adminPanel").classList.toggle("open");
    };
}

// ------------------------------------------------------------
// Icon definitions by prefix
// ------------------------------------------------------------
const iconMap = {
    CWA: { shape: "monument",  color: "white" },
    LA:  { shape: "circle-pin", color: "orange" },
    D:   { shape: "defib-pin",  color: "red" },
    WAP: { shape: "circle-pin", color: "blue" },
    WJ:  { shape: "square-pin", color: "blue" },
    EAP: { shape: "circle-pin", color: "pink" },
    EJ:  { shape: "square-pin", color: "pink" }
};

//function normalizeGroupName(group) {
//    if (!group) return null;
//    const match = group.match(/^[A-Za-z]+/);
//    return match ? match[0] : null;
//}

const geojsonOptions = {

    style: feature => {
        const name = feature.properties.name || "";
        const prefix = getFeaturePrefixFromName(name);

        if (feature.geometry.type === "LineString") {
            if (prefix === "WR")  return { color: "blue",   weight: 4 };
            if (prefix === "ER")  return { color: "pink",   weight: 4 };
            if (prefix === "LR")  return { color: "orange", weight: 4 };
            if (prefix === "CAP") return { color: "white",  weight: 4 };
        }
        return {};
    },

    pointToLayer: (feature, latlng) => {
        if (feature.geometry.type !== "Point") return;

        const props  = feature.properties || {};
        const name   = props.name || "";
        const prefix = getFeaturePrefixFromName(name);
        const label  = getFeatureLabel(feature);

        const iconDef = iconMap[prefix] || { shape: "circle-pin", color: "blue" };
        const icon    = makeSvgIcon(iconDef.shape, iconDef.color, label);

        const marker = L.marker(latlng, { icon });

        // ⬅️ back to prefix-based grouping (your earlier behaviour)
        if (layerGroups[prefix]) {
            layerGroups[prefix].addLayer(marker);
        }

        return marker;
    },

    onEachFeature: (feature, layer) => {
        // ⬅️ back to prefix-based grouping for lines
        if (feature.geometry && feature.geometry.type === "LineString") {
            const name   = (feature.properties && feature.properties.name) || "";
            const prefix = getFeaturePrefixFromName(name);
            if (layerGroups[prefix]) {
                layerGroups[prefix].addLayer(layer);
            }
        }

        // ---------- POPUP LOGIC ----------
        if (feature.properties) {
            const props = feature.properties;

            const raw =
                props.description ||
                props.popupContent ||
                (props._umap_options && props._umap_options.description) ||
                (props._umap_options && props._umap_options.popupContent) ||
                "";

            console.log("RAW POPUP INPUT >>>", JSON.stringify(raw));

            let popup = formatUmapPopup(raw);

            if (feature.geometry && feature.geometry.type === "Point") {
                const [lon, lat] = feature.geometry.coordinates;
                popup = popup
                    .replaceAll("{lat}", lat)
                    .replaceAll("{lng}", lon)
                    .replaceAll("{lon}", lon);
            }

            if (feature.geometry.type === "LineString") {
                if (/\{(measure|length|distance)\}/i.test(popup)) {
                    const coords = feature.geometry.coordinates;

                    if (Array.isArray(coords) && coords.length > 1) {
                        const latlngs = coords.map(c => L.latLng(c[1], c[0]));

                        const R = 6371000;
                        function segmentDistance(a, b) {
                            const rad  = Math.PI / 180;
                            const dLat = (b.lat - a.lat) * rad;
                            const dLon = (b.lng - a.lng) * rad;
                            const lat1 = a.lat * rad;
                            const lat2 = b.lat * rad;
                            const sinDLat = Math.sin(dLat / 2);
                            const sinDLon = Math.sin(dLon / 2);
                            const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
                            return 2 * R * Math.asin(Math.sqrt(h));
                        }

                        let lengthMeters = 0;
                        for (let i = 0; i < latlngs.length - 1; i++) {
                            lengthMeters += segmentDistance(latlngs[i], latlngs[i + 1]);
                        }

                        const lengthRounded = Math.round(lengthMeters);
                        popup = popup.replace(/\{(measure|length|distance)\}/gi, lengthRounded + " m");
                    }
                }
            }

            if (feature.geometry.type === "Polygon" && /\{area\}/i.test(popup)) {
                const rings = feature.geometry.coordinates[0];
                if (Array.isArray(rings) && rings.length > 2) {
                    const R = 6371000;
                    function toRad(d) { return d * Math.PI / 180; }

                    let area = 0;
                    for (let i = 0; i < rings.length - 1; i++) {
                        const [lon1, lat1] = rings[i];
                        const [lon2, lat2] = rings[i + 1];
                        area += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
                    }
                    area = Math.abs(area * R * R / 2);

                    const areaRounded = Math.round(area);
                    popup = popup.replace(/\{area\}/gi, areaRounded + " m²");
                }
            }

            if (popup.includes("{Elevation}") || popup.includes("{elevation}") || popup.includes("{ele}")) {
                let elevation = null;

                if (feature.geometry && feature.geometry.type === "Point") {
                    const coords = feature.geometry.coordinates;
                    if (coords.length >= 3 && typeof coords[2] === "number") {
                        elevation = coords[2];
                    }
                }

                if (elevation === null && typeof props.ele === "number")       elevation = props.ele;
                if (elevation === null && typeof props.elevation === "number") elevation = props.elevation;

                const elevationText = elevation !== null ? elevation + " m" : "N/A";

                popup = popup
                    .replaceAll("{Elevation}", elevationText)
                    .replaceAll("{elevation}", elevationText)
                    .replaceAll("{ele}", elevationText);
            }

            console.log("FINAL POPUP HTML >>>", popup);
            layer.bindPopup(popup, { maxWidth: 400, className: "custom-popup" });
        }
    }
};


// ------------------------------------------------------------
// Layer groups (toggleable)
// ------------------------------------------------------------
const layerGroups = {
    CWA: L.layerGroup(),
    CAP: L.layerGroup(),
    LR: L.layerGroup(),
    LA: L.layerGroup(),
    D: L.layerGroup(),
    WR: L.layerGroup(),
    WJ: L.layerGroup(),
    WAP: L.layerGroup(),
    ER: L.layerGroup(),
    EJ: L.layerGroup(),
    EAP: L.layerGroup()
};

// ------------------------------------------------------------
// Enable GPS tracking
// ------------------------------------------------------------
let userMarker = null;
let accuracyCircle = null;
let followMode = true;

// ------------------------------------------------------------
// Load uMap JSON (local PWA copy)
// ------------------------------------------------------------
async function loadUmapFile(url) {
    const response = await fetch(url);
    const umap = await response.json();

    // Flatten all features from all layers
    let allFeatures = umap.layers.flatMap(layer => layer.features);

    // Remove uMap's top panel (the fake feature that contains W1 W2 W3…)
    allFeatures = allFeatures.filter(f => {
        const desc = f.properties?.description || "";
        // The panel always contains MANY abbreviations in one blob
        return !desc.match(/W1\b/) && !desc.match(/W2\b/);
    });

    return {
        type: "FeatureCollection",
        features: allFeatures
    };
}

// ------------------------------------------------------------
// Map initialisation
// ------------------------------------------------------------
async function initMap() {

    // --------------------------------------------------------
    // 1. Create map + initial view
    // --------------------------------------------------------
    map = L.map("map").setView([52.1031, -7.3498], 12);

    // --------------------------------------------------------
    // 2. Load uMap file
    // --------------------------------------------------------
    const geojson = await loadUmapFile("data/bunmahon-latest.umap");

    // --------------------------------------------------------
    // 3. Build GeoJSON layer (populates layerGroups)
    // --------------------------------------------------------
    window.umapLayer = L.geoJSON(geojson, geojsonOptions);
    // NOTE: Do NOT addTo(map) — layers start OFF

    // --------------------------------------------------------
    // 4. Build grouped, human‑readable layer control
    // --------------------------------------------------------
    const layerDisplayNames = {
        "Cliff Walks":        ["CWA", "CAP"],
        "Lake Access":        ["LA", "LR"],
        "Defibrillator":      ["D"],
        "West Roads":         ["WR", "WJ"],
        "West Access Points": ["WAP"],
        "East Roads":         ["ER", "EJ"],
        "East Access Points": ["EAP"]
    };

    const overlays = {};

    for (const [displayName, codes] of Object.entries(layerDisplayNames)) {
        const group = L.layerGroup();

        codes.forEach(code => {
            if (layerGroups[code]) {
                group.addLayer(layerGroups[code]);
            }
        });

        overlays[displayName] = group;
    }

    // --------------------------------------------------------
    // 5. Add layer control to map
    // --------------------------------------------------------
    L.control.layers(null, overlays, { collapsed: true }).addTo(map);

    // ------------------------------------------------------------
    // 6. Inject Alerts Toggle into Layer List (safe retry loop)
    // ------------------------------------------------------------
    function attachAlertsToggle() {
        const layerList = document.querySelector(".leaflet-control-layers-list");
        if (!layerList) {
            requestAnimationFrame(attachAlertsToggle);
            return;
        }
        const toggleContainer = document.createElement("div");
        toggleContainer.style.marginTop = "10px";
        toggleContainer.innerHTML = `
            <label style="cursor:pointer;">
                <input type="checkbox" id="alerts-toggle">
                Show Updates
            </label>
        `;
        layerList.appendChild(toggleContainer);
        document.getElementById("alerts-toggle").addEventListener("change", (e) => {
    const panel = document.getElementById("alerts-panel");

    panel.classList.toggle("hidden", !e.target.checked);

    if (!panel.classList.contains("hidden")) {
        enableAlertsOutsideClose();
    }
});

    }
    map.whenReady(() => {
        requestAnimationFrame(attachAlertsToggle);
    });

    // ------------------------------------------------------------
    // 7. GPS button handler (waits for DOM insertion)
    // ------------------------------------------------------------
    function attachGpsButtonHandler() {
        const locateBtn = document.querySelector('.gps-button');
        if (!locateBtn) {
            requestAnimationFrame(attachGpsButtonHandler);
            return;
        }
        locateBtn.addEventListener('click', () => {
            tracking = !tracking;
            if (tracking) {
                map.locate({
                    watch: true,
                    enableHighAccuracy: true,
                    maximumAge: 1000,
                    timeout: 10000
                });
                followMode = true;

                if (lastLocation) {
                    map.setView(lastLocation, map.getZoom());
                }

                locateBtn.classList.add('locate-active');
            } else {
                map.stopLocate();
                followMode = false;
                locateBtn.classList.remove('locate-active');
            }
        });
    }

    attachGpsButtonHandler();



    // ------------------------------------------------------------
    // 8. GPS locationfound handler
    // ------------------------------------------------------------
    map.on("locationfound", (e) => {
        lastLocation = e.latlng;

        if (!tracking) return;

        // User marker
        if (!userMarker) {
            userMarker = L.marker(e.latlng, { icon: userIcon }).addTo(map);
        } else {
            userMarker.setLatLng(e.latlng);
        }

        // Accuracy circle
        if (!accuracyCircle) {
            accuracyCircle = L.circle(e.latlng, {
                radius: e.accuracy,
                color: "#136AEC",
                fillColor: "#136AEC",
                fillOpacity: 0.15,
                weight: 2
            }).addTo(map);
        } else {
            accuracyCircle.setLatLng(e.latlng);
            accuracyCircle.setRadius(e.accuracy);
        }

        // Follow mode
        if (followMode) {
            map.setView(e.latlng, map.getZoom());
        }
    });



    // ------------------------------------------------------------
    // 9. Stop following if user manually pans
    // ------------------------------------------------------------
    map.on("dragstart", () => {
        followMode = false;
    });



    // ------------------------------------------------------------
    // 10. Base layers (OSM + Satellite)
    // ------------------------------------------------------------
    const osm = L.tileLayer('//{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 20, attribution: 'Tiles © Esri' }
    );

    map.on("zoomend", () => {
        const z = map.getZoom();
        if (z >= 16) {
            if (!map.hasLayer(sat)) { map.removeLayer(osm); map.addLayer(sat); }
        } else {
            if (!map.hasLayer(osm)) { map.removeLayer(sat); map.addLayer(osm); }
        }
    });



    // ------------------------------------------------------------
    // 11. Refresh uMap layer
    // ------------------------------------------------------------
    async function refreshUmapLayer() {
        for (const key in layerGroups) {
            layerGroups[key].clearLayers();
        }

        if (window.umapLayer) {
            map.removeLayer(window.umapLayer);
        }

        const newData = await loadUmapFile("data/bunmahon-latest.umap?cachebust=" + Date.now());
        window.umapLayer = L.geoJSON(newData, geojsonOptions);
    }

    navigator.serviceWorker.addEventListener("message", e => {
        if (e.data?.type === "umap-updated") {
            refreshUmapLayer();
        }
    });



    // ------------------------------------------------------------
    // 12. Alerts refresh + refresh button
    // ------------------------------------------------------------
    refreshAlerts();

    document.getElementById("refreshMapBtn")
        .addEventListener("click", () => {
            refreshUmapLayer();
            refreshAlerts();
        });



    // ------------------------------------------------------------
    // 13. Enable GPS tracking
    // ------------------------------------------------------------
    map.locate({
        watch: true,
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
    });



    // ------------------------------------------------------------
    // 14. Add GPS button (bottom-right)
    // ------------------------------------------------------------
    const gpsButton = L.control({ position: "bottomright" });

    gpsButton.onAdd = function () {
        const div = L.DomUtil.create("div", "gps-button");
        div.innerHTML = "📍";
        div.style.cursor = "pointer";
        div.style.fontSize = "28px";
        div.style.background = "white";
        div.style.padding = "6px 10px";
        div.style.borderRadius = "6px";
        div.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";

        div.onclick = () => {
            followMode = true;
            map.locate({ setView: true, maxZoom: 17 });
        };

        return div;
    };

    gpsButton.addTo(map);

    // Enable swipe-down-to-close for popups
map.on("popupopen", function (e) {
    const popupEl = e.popup._container;
    const contentEl = popupEl.querySelector(".leaflet-popup-content");

    // Add grab handle if missing
    if (!popupEl.querySelector(".popup-grab")) {
        popupEl.insertAdjacentHTML("afterbegin", "<div class='popup-grab'></div>");
    }

    // -------------------------------
    // Swipe‑down‑to‑close (only when at top)
    // -------------------------------
    let startY = null;
    let isDragging = false;

    popupEl.addEventListener("touchstart", function (ev) {
        startY = ev.touches[0].clientY;
        isDragging = true;
    });

    popupEl.addEventListener("touchmove", function (ev) {
        if (!isDragging) return;

        const currentY = ev.touches[0].clientY;
        const diff = currentY - startY;

        // Only close if user is at top of scroll
        const atTop = contentEl.scrollTop === 0;

        if (diff > 40 && atTop) {
            map.closePopup();
            isDragging = false;
        }
    });

    popupEl.addEventListener("touchend", function () {
        isDragging = false;
    });

    // -------------------------------
    // Tap‑outside‑to‑close (document‑scoped)
    // -------------------------------
    function handleOutsideTap(ev) {
        if (!popupEl.contains(ev.target)) {
            map.closePopup();
            document.removeEventListener("touchstart", handleOutsideTap);
            document.removeEventListener("mousedown", handleOutsideTap);
        }
    }

    document.addEventListener("touchstart", handleOutsideTap);
    document.addEventListener("mousedown", handleOutsideTap);
});


map.on("blur", () => {
    // Prevent Leaflet from hiding controls on mobile
    const controls = document.querySelectorAll(".leaflet-control");
    controls.forEach(c => c.style.display = "block");
});

}
// ============================================================
// ALERTS PANEL — TAP OUTSIDE TO CLOSE (SAFE, SCOPED)
// ============================================================
function enableAlertsOutsideClose() {
    function handler(e) {
        const panel = document.getElementById("alerts-panel");

        // If click is outside the panel → close it
        if (!panel.contains(e.target)) {
            panel.classList.add("hidden");

            // Uncheck the toggle
            const toggle = document.getElementById("alerts-toggle");
            if (toggle) toggle.checked = false;

            document.removeEventListener("click", handler);
        }
    }

    document.addEventListener("click", handler);
}


// ------------------------------------------------------------
// Initialise map
// ------------------------------------------------------------
initMap();

// ------------------------------------------------------------
// Optional: Auto-download latest .umap file
// ------------------------------------------------------------
//async function autoDownloadUmap() {
  //  const url = "https://umap.openstreetmap.fr/en/map/1393298/export/?format=umap";
  //  const response = await fetch(url);
  //  return await response.blob();
//}
// ------------------------------------------------------------
// Alerts: load alerts.json and show latest update
// ------------------------------------------------------------

async function loadAlerts() {
  try {
    const url = "https://raw.githubusercontent.com/BunmahonCGU/cgu-map-pwa/main/data/alerts.json?cb=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      console.warn("Failed to load alerts.json:", res.status);
      return;
    }

    const json = await res.json();
    if (json.updates && json.updates.length > 0) {
      //showLatestAlert(json.updates[0]);
    }
  } catch (err) {
    console.error("Error loading alerts:", err);
  }
}

function showLatestAlert(alert) {
  if (!alert || !alert.message || !map) return;

  const html = `
    <div style="font-size:14px; line-height:1.4;">
      <strong>Latest Update:</strong><br>
      ${alert.message}<br>
      <small style="color:#666;">${new Date(alert.timestamp).toLocaleString()}</small>
    </div>
  `;

  L.popup()
    .setLatLng(map.getCenter())
    .setContent(html)
    .openOn(map);
}

async function refreshAlerts() {
    try {
        const url = "data/alerts.json?cb=" + Date.now();
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) return;

        const json = await res.json();
        const updates = json.updates || [];

        const now = Date.now();
        const cutoff = now - 24 * 60 * 60 * 1000;

        // newest first
        const recent = updates
            .filter(a => new Date(a.timestamp).getTime() >= cutoff)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const list = document.getElementById("alerts-list");
        list.innerHTML = "";

        recent.forEach(a => {
            const li = document.createElement("li");
            li.className = "alert-row";

            // --- Format timestamp as hh:mm:ss ---
            const ts = new Date(a.timestamp);
            const hh = ts.getHours().toString().padStart(2, '0');
            const mm = ts.getMinutes().toString().padStart(2, '0');
            const ss = ts.getSeconds().toString().padStart(2, '0');
            const timeOnly = `${hh}:${mm}:${ss}`;

            li.innerHTML = `
                <div class="alert-time">${timeOnly}</div>
                <div class="alert-body">${a.message}</div>
            `;

            list.appendChild(li);
        });

    } catch (err) {
        console.error("Error loading alerts:", err);
    }
}

// ------------------------------------------------------------
// Admin panel → Cloudflare Worker → GitHub alerts.json
// ------------------------------------------------------------

const ALERT_ENDPOINT = "https://shiny-math-8471.bunmahoncgu.workers.dev/update";
let adminPin = null;

const LOCAL_ADMIN_PIN = "9112";   // set your real PIN here

// ------------------------------------------------------------
// OPEN ADMIN PANEL
// ------------------------------------------------------------
document.getElementById("admin-open").onclick = () => {
    const pin = prompt("Enter admin PIN");

    if (!pin || !pin.trim()) {
        alert("PIN required");
        return;
    }

    if (pin.trim() !== LOCAL_ADMIN_PIN) {
        alert("Incorrect PIN");
        return;
    }

    adminPin = pin.trim();
    document.getElementById("admin-panel").classList.remove("hidden");
    checkTokenStatus();
};

// ------------------------------------------------------------
// CLOSE ADMIN PANEL (mobile‑safe)
// ------------------------------------------------------------
const adminPanel = document.getElementById("admin-panel");
const adminClose = document.getElementById("admin-close");

// Prevent Leaflet from hiding controls when tapping inside the panel
adminPanel.addEventListener("touchstart", e => {
    e.stopPropagation();
}, { passive: false });

// Prevent the close button tap from bubbling into Leaflet
adminClose.addEventListener("touchstart", e => {
    e.stopPropagation();
    e.preventDefault();
}, { passive: false });

// Actual close logic
adminClose.addEventListener("click", () => {
    adminPanel.classList.add("hidden");

    // Restore Leaflet controls on mobile (Leaflet hides them on touch)
    setTimeout(() => {
        document.querySelectorAll('.leaflet-control').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.visibility = 'visible';
        });
    }, 50);
});

// ------------------------------------------------------------
// SUBMIT ADMIN ALERT
// ------------------------------------------------------------
document.getElementById("admin-submit").onclick = async () => {
    const title = document.getElementById("admin-title").value.trim();
    const message = document.getElementById("admin-message").value.trim();

    if (!adminPin) {
        alert("PIN not set. Use the Admin button first.");
        return;
    }
    if (!title || !message) {
        alert("Title and message required");
        return;
    }

    const combinedMessage = `${title}: ${message}`;

    try {
        const res = await fetch(ALERT_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: combinedMessage, pin: adminPin })
        });

        const data = await res.json();

        if (data.status !== "ok") {
            alert("Failed to post update: " + (data.error || "Unknown error"));
            return;
        }

        alert("Update posted");
        document.getElementById("admin-title").value = "";
        document.getElementById("admin-message").value = "";
    } catch (e) {
        console.error(e);
        alert("Network error");
    }
};


