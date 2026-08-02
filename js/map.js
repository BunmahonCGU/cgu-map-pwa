console.log("map.js loaded");
// ------------------------------------------------------------
// Bunmahon CGU Access Map – Full Feature Version (FINAL)
// ------------------------------------------------------------ //

document.addEventListener("DOMContentLoaded", () => { initMap(); });

let tracking = true;
let lastLocation = null;
let map;
const APP_VERSION = "V1.1";

// ===============================
// SCREEN WAKE LOCK (keeps location updates flowing while sharing)
// ===============================
let wakeLock = null;

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      console.log("Wake Lock released");
    });
    console.log("Wake Lock acquired");
  } catch (err) {
    console.warn("Wake Lock request failed:", err);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch (err) {
    // already released
  }
  wakeLock = null;
}

// Browsers auto-release the lock once the tab is hidden/backgrounded;
// re-acquire it when the tab becomes visible again, if still sharing.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && localStorage.getItem("shareLocation") === "true") {
    requestWakeLock();
  }
});

// ===============================
// USER ID (persistent anonymous)
// ===============================
// crypto.randomUUID() needs Safari 15.4+/iOS 15.4+; fall back to
// crypto.getRandomValues() (much broader support), and finally to
// Math.random() so an unsupported browser never fails to load the app.
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  // Last-resort fallback: not cryptographically strong, but keeps the
  // app usable on a browser/context with neither API available.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let userId = localStorage.getItem('userId');
if(!userId) {
  userId = generateUUID();
  localStorage.setItem('userId', userId);
}

const teamColors = {};

function getTeamColor(team) {
    if (!team) return "#ffffff"; // white for no-team

    if (!teamColors[team]) {
        const hue = Math.floor(Math.random() * 360);
        teamColors[team] = `hsl(${hue}, 70%, 80%)`;
    }

    return teamColors[team];
}

const liveUserIcon = L.divIcon({
    className: "live-user-icon",
    html: `
        <div class="live-user-wrapper">
            <div class="live-user-dot"></div>
            <div class="live-user-name"></div>
            <div class="live-user-time"></div>
        </div>
    `,
    iconSize: [80, 40],     // ⭐ REQUIRED for OMS
    iconAnchor: [40, 20]    // ⭐ REQUIRED for OMS
});

const userIcon = L.divIcon({
  className: "user-location-icon",
  iconSize: [28, 28], // size of the dot
  iconAnchor: [14, 14] // center the dot on the location
});
const blankIcon = L.icon({
    iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2gYf8AAAAASUVORK5CYII=",
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});


async function checkTokenStatus() {
  const el = document.getElementById("token-status");
  const debugEl = document.getElementById("token-debug");
  try {
    const res = await fetch("https://shiny-math-8471.bunmahoncgu.workers.dev/token-health", {
      method: "POST"
    });
    const data = await res.json();
    const payload = data.raw || data; // 👈 key line

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
// *** FIX: Block the next synthetic click after submit ***
function blockNextMapClick() {
  const blocker = e => {
    e.stopPropagation();
    map.off("click", blocker);
  };
  map.on("click", blocker);
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
    svg =
      '<svg width="40" height="40" viewBox="0 0 40 40">' +
      '<path d="M20 3 C11 3 5 9 5 17 C5 27 20 38 20 38 C20 38 35 27 35 17 C35 9 29 3 20 3 Z" fill="' +
      color +
      '" stroke="black" stroke-width="2"/>' +
      '<text x="20" y="17" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">' +
      label +
      "</text></svg>";
  }

  if (shape === "square-pin") {
    svg =
      '<svg width="40" height="40" viewBox="0 0 40 40">' +
      '<path d="M10 5 H30 V17 C30 27 20 38 20 38 C20 38 10 27 10 17 Z" fill="' +
      color +
      '" stroke="black" stroke-width="2"/>' +
      '<text x="20" y="15" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">' +
      label +
      "</text></svg>";
  }

  if (shape === "defib-pin") {
    svg =
      '<svg width="40" height="40" viewBox="0 0 40 40">' +
      '<path d="M20 3 C11 3 5 9 5 17 C5 27 20 38 20 38 C20 38 35 27 35 17 C35 9 29 3 20 3 Z" fill="' +
      color +
      '" stroke="black" stroke-width="2"/>' +
      '<path d="M12 22l4-6 2 4 2-3 6 5" stroke="white" stroke-width="2" fill="none"/>' +
      '<text x="20" y="17" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">' +
      label +
      "</text></svg>";
  }

  if (shape === "monument") {
    svg =
      '<svg width="40" height="40" viewBox="0 0 40 40">' +
      '<path d="M14 32h12v-3H14zm3-6h6V10h-6z" fill="' +
      color +
      '" stroke="black" stroke-width="2"/>' +
      "</svg>";
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
  CWA: { shape: "monument", color: "white" },
  LA: { shape: "circle-pin", color: "orange" },
  D: { shape: "defib-pin", color: "red" },
  WAP: { shape: "circle-pin", color: "blue" },
  WJ: { shape: "square-pin", color: "blue" },
  EAP: { shape: "circle-pin", color: "pink" },
  EJ: { shape: "square-pin", color: "pink" }
};

const geojsonOptions = {
  style: feature => {
    const name = feature.properties.name || "";
    const prefix = getFeaturePrefixFromName(name);

    if (feature.geometry.type === "LineString") {
      if (prefix === "WR") return { color: "blue", weight: 4 };
      if (prefix === "ER") return { color: "pink", weight: 4 };
      if (prefix === "LR") return { color: "orange", weight: 4 };
      if (prefix === "CAP") return { color: "white", weight: 4 };
    }
    return {};
  },

  pointToLayer: (feature, latlng) => {
    if (feature.geometry.type !== "Point") return;
    const props = feature.properties || {};
    const name = props.name || "";
    const prefix = getFeaturePrefixFromName(name);
    const label = getFeatureLabel(feature);
    const iconDef = iconMap[prefix] || { shape: "circle-pin", color: "blue" };
    const icon = makeSvgIcon(iconDef.shape, iconDef.color, label);
    const [lng, lat] = feature.geometry.coordinates;
    const marker = L.marker([lat, lng], { icon });
    if (layerGroups[prefix]) {
      layerGroups[prefix].addLayer(marker);
    }
    return marker;
  },

  onEachFeature: (feature, layer) => {
    // ⬅️ back to prefix-based grouping for lines
    if (feature.geometry && feature.geometry.type === "LineString") {
      const name = (feature.properties && feature.properties.name) || "";
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
      //console.log("RAW POPUP INPUT >>>", JSON.stringify(raw));

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
              const rad = Math.PI / 180;
              const dLat = (b.lat - a.lat) * rad;
              const dLon = (b.lng - a.lng) * rad;
              const lat1 = a.lat * rad;
              const lat2 = b.lat * rad;
              const sinDLat = Math.sin(dLat / 2);
              const sinDLon = Math.sin(dLon / 2);
              const h =
                sinDLat * sinDLat +
                Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
              return 2 * R * Math.asin(Math.sqrt(h));
            }

            let lengthMeters = 0;
            for (let i = 0; i < latlngs.length - 1; i++) {
              lengthMeters += segmentDistance(latlngs[i], latlngs[i + 1]);
            }
            const lengthRounded = Math.round(lengthMeters);
            popup = popup.replace(
              /\{(measure|length|distance)\}/gi,
              lengthRounded + " m"
            );
          }
        }
      }

      if (feature.geometry.type === "Polygon" && /\{area\}/i.test(popup)) {
        const rings = feature.geometry.coordinates[0];
        if (Array.isArray(rings) && rings.length > 2) {
          const R = 6371000;
          function toRad(d) {
            return (d * Math.PI) / 180;
          }
          let area = 0;
          for (let i = 0; i < rings.length - 1; i++) {
            const [lon1, lat1] = rings[i];
            const [lon2, lat2] = rings[i + 1];
            area +=
              toRad(lon2 - lon1) *
              (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
          }
          area = Math.abs((area * R * R) / 2);
          const areaRounded = Math.round(area);
          popup = popup.replace(/\{area\}/gi, areaRounded + " m²");
        }
      }

      if (
        popup.includes("{Elevation}") ||
        popup.includes("{elevation}") ||
        popup.includes("{ele}")
      ) {
        let elevation = null;
        if (feature.geometry && feature.geometry.type === "Point") {
          const coords = feature.geometry.coordinates;
          if (coords.length >= 3 && typeof coords[2] === "number") {
            elevation = coords[2];
          }
        }
        if (elevation === null && typeof props.ele === "number")
          elevation = props.ele;
        if (elevation === null && typeof props.elevation === "number")
          elevation = props.elevation;

        const elevationText = elevation !== null ? elevation + " m" : "N/A";
        popup = popup
          .replaceAll("{Elevation}", elevationText)
          .replaceAll("{elevation}", elevationText)
          .replaceAll("{ele}", elevationText);
      }

      //console.log("FINAL POPUP  >>>", popup);
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

// ===============================
// LIVE USER LOCATIONS LAYER
// ===============================
layerGroups["LIVE_USERS"] = L.layerGroup();


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

  return { type: "FeatureCollection", features: allFeatures };
}
// *** FIX: Override Leaflet's mobile blur behaviour ***
function forceControlsVisible() {
  const controls = document.querySelectorAll(".leaflet-control");

  controls.forEach(c => {
    c.style.display = "block";
    c.style.opacity = "1";
    c.style.visibility = "visible";

    // Remove Leaflet's hidden/fade classes
    c.classList.remove("leaflet-control-hidden");
    c.classList.remove("leaflet-fade-anim");
    c.classList.remove("leaflet-touching");
  });

  // Also force the control container visible
  if (map && map._controlContainer) {
    map._controlContainer.style.display = "block";
    map._controlContainer.style.opacity = "1";
    map._controlContainer.style.visibility = "visible";
  }
}
// *** FIX: Reset Leaflet's internal touch state ***
function resetLeafletTouchState() {
  if (map && map._touching) {
    map._touching = false;
  }

  // Force controls to re‑layout
  const controls = document.querySelectorAll(".leaflet-control");
  controls.forEach(c => {
    c.style.transform = "none";
    c.style.left = "";
    c.style.right = "";
    c.style.top = "";
    c.style.bottom = "";
    c.classList.remove("leaflet-touching");
    c.classList.remove("leaflet-fade-anim");
  });

  if (map._controlContainer) {
    map._controlContainer.style.transform = "none";
  }
}
// *** FIX: Reset Leaflet's map container transform ***
function resetMapTransform() {
  if (!map || !map._container) return;

  const container = map._container;

  // Reset any transform Leaflet applied
  container.style.transform = "none";

  // Also reset the control container transform
  if (map._controlContainer) {
    map._controlContainer.style.transform = "none";
  }
}
function forceEnableLeafletGestures() {
  if (!map) return;

  // Re-enable all gesture handlers
  map.touchZoom.enable();
  map.scrollWheelZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
  map.dragging.enable();

  // iOS Safari sometimes needs this twice
  setTimeout(() => {
    map.touchZoom.enable();
    map.dragging.enable();
  }, 50);
}

// *** FIX: Reset Leaflet's internal pan/zoom gesture state ***
function resetLeafletGestureState() {
  if (!map) return;

  // Reset pan state
  map._moved = false;
  map._moving = false;
  map._startPos = null;
  map._newPos = null;

  // Reset zoom state
  map._animatingZoom = false;
  map._zooming = false;
  map._startZoom = null;
  map._centerOffset = null;

  // Reset pan animation if present
  if (map._panAnim && map._panAnim._inProgress) {
    map._panAnim.stop();
  }

  // Reset transforms
  if (map._container) {
    map._container.style.transform = "none";
  }
  if (map._controlContainer) {
    map._controlContainer.style.transform = "none";
  }

  // Force controls visible and aligned
  const controls = document.querySelectorAll(".leaflet-control");
  controls.forEach(c => {
    c.style.transform = "none";
    c.style.left = "";
    c.style.right = "";
    c.style.top = "";
    c.style.bottom = "";
    c.style.opacity = "1";
    c.style.visibility = "visible";
    c.style.display = "block";
    c.classList.remove("leaflet-touching");
    c.classList.remove("leaflet-fade-anim");
    c.classList.remove("leaflet-control-hidden");
  });
}

// ------------------------------------------------------------
// Map initialisation
// ------------------------------------------------------------
async function initMap() {
  // --------------------------------------------------------
  // 1. Create map + initial view
  // --------------------------------------------------------

  // Ensure map container is not transformed before Leaflet initializes
  resetMapTransform();
  
  map = L.map("map").setView([52.1031, -7.3498], 12);
    // Add base map tiles
  // Spiderfier for overlapping markers

const oms = new OverlappingMarkerSpiderfier(map, {
    keepSpiderfied: true,
    nearbyDistance: 20   // pixels before spiderfy triggers
});

// Optional highlight effect
oms.addListener('spiderfy', function(markers) {
    markers.forEach(m => m.setOpacity(0.9));
});
oms.addListener('unspiderfy', function(markers) {
    markers.forEach(m => m.setOpacity(1));
});


 L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles © Esri"
}).addTo(map);
  // Fix invisible map on load
  setTimeout(() => map.invalidateSize(), 250);  
  window.addEventListener("load", () => map.invalidateSize());
  document.addEventListener("visibilitychange", () => map.invalidateSize());

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
    "Cliff Walks": ["CWA", "CAP"],
    "Lake Access": ["LA", "LR"],
    Defibrillator: ["D"],
    "West Roads": ["WR", "WJ"],
    "West Access Points": ["WAP"],
    "East Roads": ["ER", "EJ"],
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
    toggleContainer.innerHTML  = `
      <label style="cursor:pointer;">
        <input type="checkbox" id="alerts-toggle"> Show Updates
      </label>
    `;
    layerList.appendChild(toggleContainer);

    // ===============================
    // SHARE LOCATION TOGGLE
    // ===============================
    const shareContainer = document.createElement("div");
    shareContainer.style.marginTop = "6px";
    shareContainer.innerHTML  = `
        <label style="cursor:pointer;">
            <input type="checkbox" id="shareLocationOptIn">
            Share My Location
        </label>
    `;
    layerList.appendChild(shareContainer);
    
    const shareOptIn = document.getElementById("shareLocationOptIn");
    shareOptIn.checked = localStorage.getItem("shareLocation") === "true";
    if (shareOptIn.checked) {
        requestWakeLock();
    }

    shareOptIn.addEventListener("change", () => {
        localStorage.setItem("shareLocation", shareOptIn.checked ? "true" : "false");
        if (shareOptIn.checked) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

      localStorage.setItem("displayName", nameInput.value.trim());

    });

        // ===============================
        // LIVE USERS LAYER TOGGLE
        // ===============================
        const liveUsersContainer = document.createElement("div");
        liveUsersContainer.style.marginTop = "6px";
        liveUsersContainer.innerHTML  = `
            <label style="cursor:pointer;">
                <input type="checkbox" id="liveUsersToggle">
                Show Active Users
            </label>
        `;
        layerList.appendChild(liveUsersContainer);
        
        const liveUsersToggle = document.getElementById("liveUsersToggle");
        liveUsersToggle.checked = false;
        
        liveUsersToggle.addEventListener("change", () => {
            if (liveUsersToggle.checked) {
                map.addLayer(layerGroups["LIVE_USERS"]);
            } else {
                map.removeLayer(layerGroups["LIVE_USERS"]);
            }
        });

// ===============================
// DISPLAY NAME INPUT
// ===============================
const nameContainer = document.createElement("div");
nameContainer.style.marginTop = "6px";
nameContainer.innerHTML = `
    <label style="cursor:pointer;">
        <input type="text" id="displayNameInput" placeholder="Your name (optional)" style="width: 140px;">
    </label>
`;
layerList.appendChild(nameContainer);


const teamContainer = document.createElement("div");

// Make the row split into: [Team dropdown]    [Version]
teamContainer.style.display = "flex";
teamContainer.style.justifyContent = "space-between";
teamContainer.style.alignItems = "center";

teamContainer.innerHTML = `
  <label>
    <select id="teamSelect">
      <option value="">No Team</option>
      <option value="Alpha">Alpha</option>
      <option value="Bravo">Bravo</option>
      <option value="Charlie">Charlie</option>
      <option value="Delta">Delta</option>
      <option value="Echo">Echo</option>
      <option value="Foxtrot">Foxtrot</option>
      <option value="Golf">Golf</option>
      <option value="Hotel">Hotel</option>
    </select>
  </label>

  <span style="
      font-weight: bold;
      font-size: 12px;
      margin-left: 10px;
  ">
    ${APP_VERSION}
  </span>
`;

layerList.appendChild(teamContainer);

// Restore saved team on load (prevents mobile losing team)
const savedTeam = localStorage.getItem("team");
if (savedTeam) {
    document.getElementById("teamSelect").value = savedTeam;
}

    
    
const nameInput = document.getElementById("displayNameInput");
nameInput.value = localStorage.getItem("displayName") || "";
console.log("nameInput exists:", !!nameInput);
    
nameInput.addEventListener("input", () => {
    localStorage.setItem("displayName", nameInput.value.trim());
});

const teamSelect = document.getElementById("teamSelect");
teamSelect.value = localStorage.getItem("team") || "";

teamSelect.addEventListener("change", () => {
    localStorage.setItem("team", teamSelect.value);
});

    
// ⭐ FIX 2 — mobile‑safe fallback
nameInput.addEventListener("blur", () => {
    localStorage.setItem("displayName", nameInput.value.trim());
});
    
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

    // ===============================
    // LOCATION PUBLISHING (also feeds the desktop heartbeat below)
    // ===============================
    lastGPS = Date.now();
    lastLat = e.latlng.lat;
    lastLng = e.latlng.lng;
    sendLocationUpdate(lastLat, lastLng);


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
  //const osm = L.tileLayer('//{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
 //   maxZoom: 20,
 //   attribution: '© OpenStreetMap contributors'
 // }).addTo(map);

  const osm = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 17,
    attribution: 'Tiles © Esri'
});



  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 20,
      attribution: 'Tiles © Esri'
    }
  );

  map.on("zoomend", () => {
    const z = map.getZoom();
    if (z >= 16) {
      if (!map.hasLayer(sat)) {
        map.removeLayer(osm);
        map.addLayer(sat);
      }
    } else {
      if (!map.hasLayer(osm)) {
        map.removeLayer(sat);
        map.addLayer(osm);
      }
    }
  });

  // ------------------------------------------------------------
  // 11. Refresh uMap layer
  // ------------------------------------------------------------
  async function refreshUmapLayer() {
  for (const key in layerGroups) {
    if (key === "LIVE_USERS") continue;   // do not wipe live user markers
    layerGroups[key].clearLayers();
        }
    if (window.umapLayer) {
      map.removeLayer(window.umapLayer);
        }
    const newData = await loadUmapFile("data/bunmahon-latest.umap?cachebust=" + Date.now());
    window.umapLayer = L.geoJSON(newData, geojsonOptions);

      // Re-add LIVE_USERS layer if toggle is on
    const liveUsersToggle = document.getElementById("liveUsersToggle");
    if (liveUsersToggle && liveUsersToggle.checked) {
        map.addLayer(layerGroups["LIVE_USERS"]);
    }
}

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", e => {
      if (e.data?.type === "umap-updated") {
        refreshUmapLayer();
      }
    });
  }

  // ------------------------------------------------------------
  // 12. Alerts refresh + refresh button
  // ------------------------------------------------------------
  refreshAlerts();
  // Refresh button click feedback
const refreshBtn = document.getElementById("refreshMapBtn");
if (refreshBtn) {

  // ⭐ ADD THIS LINE
  L.DomEvent.disableClickPropagation(refreshBtn);

  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("refreshing");
    setTimeout(() => refreshBtn.classList.remove("refreshing"), 300);
  });
}

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

  // *** FIX: Disable Leaflet's default blur behaviour ***
map.off("blur"); // remove Leaflet's internal blur handler

map.on("blur", () => {
  forceControlsVisible();
});

// ===============================
// LIVE USER POLLING
// ===============================
let liveUserMarkers  = {};

// Builds the icon with name/color/time baked in, rather than patching
// marker._icon's DOM after the fact — that internal node doesn't exist
// until Leaflet actually renders the marker (i.e. once its layer group
// is on the map), which isn't guaranteed at update time.
function buildLiveUserIcon(displayName, team, formattedTime) {
    const color = getTeamColor(team);
    return L.divIcon({
        className: "live-user-icon",
        html: `
            <div class="live-user-wrapper" style="background-color:${color} !important;">
                <div class="live-user-dot" style="background-color:${color};"></div>
                <div class="live-user-name">${displayName}</div>
                <div class="live-user-time">${formattedTime}</div>
            </div>
        `,
        iconSize: [80, 40],
        iconAnchor: [40, 20]
    });
}

async function refreshLiveUsers() {
    try {
        const res = await fetch("https://shiny-math-8471.bunmahoncgu.workers.dev/location/all");
        const { users } = await res.json();
        const now = Date.now();

        // Remove stale markers (> 2 minutes)
        for (const uid in liveUserMarkers) {
            const user = users.find(u => u.userId === uid);

            if (!user || (now - user.timestamp) > 120000) {
                layerGroups["LIVE_USERS"].removeLayer(liveUserMarkers[uid]);
                delete liveUserMarkers[uid];
            }
        }

          for (const user of users) {
              const { userId, lat, lng, displayName, team } = user;

            // ----------------------------------------------------
              // HIDE USERS WITH NO NAME
              // ----------------------------------------------------
              if (!displayName || displayName.trim() === "") {          
                  // Remove existing marker if present
                  if (liveUserMarkers[userId]) {
                      oms.removeMarker(liveUserMarkers[userId]);
                      layerGroups["LIVE_USERS"].removeLayer(liveUserMarkers[userId]);
                      delete liveUserMarkers[userId];
                  }          
                  continue; // Skip rendering
              }

            const formattedTime = new Date(user.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
         
            // ----------------------------------------------------
            // NEW MARKER
            // ----------------------------------------------------
            if (!liveUserMarkers[userId]) {

                const marker = L.marker([lat, lng], {
                    icon: buildLiveUserIcon(displayName, team, formattedTime)
                }).addTo(layerGroups["LIVE_USERS"]);

                liveUserMarkers[userId] = marker;
                oms.addMarker(marker);

            // ----------------------------------------------------
            // UPDATE EXISTING MARKER
            // ----------------------------------------------------
            } else {

                const marker = liveUserMarkers[userId];
                marker.setLatLng([lat, lng]);
                marker.setIcon(buildLiveUserIcon(displayName, team, formattedTime));
            }
        
        }


        // ===============================
      // UPDATE USERS PANEL LIST
      // ===============================
      if (!users) return;
      const usersList = document.getElementById("users-list");
      usersList.innerHTML = ""; // clear old list

              const sortedUsers = users
          .filter(u => u.displayName && u.displayName.trim() !== "")
          .sort((a, b) => {
              const teamA = a.team || "";
              const teamB = b.team || "";
              if (teamA < teamB) return -1;
              if (teamA > teamB) return 1;
              return a.displayName.localeCompare(b.displayName);
          });

              sortedUsers
          .filter(u => u.displayName && u.displayName.trim() !== "")
          .forEach(user => {

          const { displayName, team, timestamp } = user;
      
          const li = document.createElement("li");
          li.className = "user-row";
            li.innerHTML = `
          <div class="user-name">${displayName}</div>
          <div class="user-team">
              <span style="
                  display:inline-block;
                  width:12px;
                  height:12px;
                  border-radius:50%;
                  background:${getTeamColor(team)};
                  margin-right:6px;
              "></span>
              ${team || "(none)"}
          </div>
          <div class="user-time">${new Date(timestamp).toLocaleTimeString()}</div>
      `;

          li.addEventListener("click", () => {
              const marker = liveUserMarkers[user.userId];
              if (marker) {
                  map.setView(marker.getLatLng(), 17, { animate: true });
              }
          });
      
          usersList.appendChild(li);
      });
    } catch (err) {
        console.warn("Live user refresh failed:", err);
    }
}



setInterval(refreshLiveUsers, 5000);
console.log("map.js loaded");

// ---------------------------------------------------------
// SIMPLE LOCATION UPDATES — driven by Leaflet's own GPS watch
// (see "8. GPS locationfound handler" above); no separate
// navigator.geolocation.watchPosition() call.
// ---------------------------------------------------------

let lastGPS = 0;
let lastLat = null;
let lastLng = null;

function sendLocationUpdate(lat, lng) {
  if (!tracking || localStorage.getItem("shareLocation") !== "true") return;

  console.log("sendLocationUpdate()", lat, lng);

  // ===============================
  // SANITIZE TEAM VALUE (mobile fix)
  // ===============================
  let teamValue = localStorage.getItem("team");

  // Mobile Safari/Chrome sometimes returns literal "undefined"
  if (teamValue === undefined || teamValue === null || teamValue === "undefined") {
      teamValue = "";
  }

  fetch("https://shiny-math-8471.bunmahoncgu.workers.dev/location/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: userId,   // always the GUID
      displayName: localStorage.getItem("displayName") || null,
      team: teamValue,  // <-- ALWAYS a valid string now
      lat,
      lng,
      timestamp: Date.now(),
      token: localStorage.getItem("locationToken") || null
    })
  })
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(({ status, data }) => {
      // Server mints a token on this userId's first-ever update; persist it
      // so every later update can prove it's the same device.
      if (data && data.token) {
        localStorage.setItem("locationToken", data.token);
      }
      if (data && data.status === "error") {
        console.error("Location update rejected:", data.error);
        // 403 means the server already has a different token on file for this
        // userId (e.g. this device's token was lost, or its very first mint
        // was never received). There's no way to recover the old token, so
        // re-register as a fresh device instead of retrying forever.
        if (status === 403) {
          console.warn("Resetting userId after rejected location token");
          localStorage.removeItem("locationToken");
          userId = generateUUID();
          localStorage.setItem("userId", userId);
        }
      }
    })
    .catch(err => console.error("Location update failed:", err));
}

function startLocationUpdates() {
  console.log("startLocationUpdates() called");

  // Desktop heartbeat (GPS idle)
  setInterval(() => {
    const now = Date.now();
  
    if (now - lastGPS > 10000 && lastLat !== null && lastLng !== null) {
      console.log("Desktop heartbeat (GPS idle)");
      sendLocationUpdate(lastLat, lastLng);   // <-- NO geolocation call
    }
  }, 5000);
}



// Start updates immediately
startLocationUpdates();



  // ---------------------------------------------------------
  // PREVENT TOUCH EVENTS INSIDE PANELS FROM REACHING THE MAP
  // *** CONSOLIDATED FIX: event shield for admin/alerts/submit ***
  // ---------------------------------------------------------
  ["touchstart", "touchend", "touchmove", "click"].forEach(evt => {
    const stop = e => {
      e.stopPropagation();
    };
    const adminPanel = document.getElementById("admin-panel");
    const alertsPanel = document.getElementById("alerts-panel");
    const adminSubmit = document.getElementById("admin-submit");
    if (adminPanel) adminPanel.addEventListener(evt, stop, { passive: false });
    if (alertsPanel) alertsPanel.addEventListener(evt, stop, { passive: false });
    if (adminSubmit) adminSubmit.addEventListener(evt, stop, { passive: false });
  });
}

// ============================================================
// ALERTS PANEL — TAP OUTSIDE TO CLOSE (SAFE, SCOPED)
// *** CONSOLIDATED FIX: avoid accumulating click listeners ***
// ============================================================
let alertsOutsideHandler = null;

function enableAlertsOutsideClose() {
  if (alertsOutsideHandler) return;

  alertsOutsideHandler = function handler(e) {
    const panel = document.getElementById("alerts-panel");
    if (!panel) {
      document.removeEventListener("click", alertsOutsideHandler);
      alertsOutsideHandler = null;
      return;
    }

    // If click is outside the panel → close it
    if (!panel.contains(e.target)) {
      panel.classList.add("hidden");
      // Uncheck the toggle
      const toggle = document.getElementById("alerts-toggle");
      if (toggle) toggle.checked = false;

      document.removeEventListener("click", alertsOutsideHandler);
      alertsOutsideHandler = null;
    }
  };

  document.addEventListener("click", alertsOutsideHandler);
}

// ------------------------------------------------------------
// Initialise map
// ------------------------------------------------------------
// (initMap is called via DOMContentLoaded at the top)

// ------------------------------------------------------------
// Optional: Auto-download latest .umap file
// ------------------------------------------------------------
// async function autoDownloadUmap() {
//   const url = "https://umap.openstreetmap.fr/en/map/1393298/export/?format=umap";
//   const response = await fetch(url);
//   return await response.blob();
// }

// ------------------------------------------------------------
// Alerts: load alerts.json and show latest update
// ------------------------------------------------------------
async function loadAlerts() {
  try {
    //const url =
   //   "https://raw.githubusercontent.com/BunmahonCGU/cgu-map-pwa/main/data/alerts.json?cb=" +
   //   Date.now();
   // const res = await fetch(url, { cache: "no-store" });
const url = "https://shiny-math-8471.bunmahoncgu.workers.dev/alerts?cb=" + Date.now();
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
    //const url = "data/alerts.json?cb=" + Date.now();
    //const url = "https://raw.githubusercontent.com/BunmahonCGU/cgu-map-pwa/main/data/alerts.json?cb=" + Date.now();
    const url = "https://shiny-math-8471.bunmahoncgu.workers.dev/alerts?cb=" + Date.now();
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
      const hh = ts.getHours().toString().padStart(2, "0");
      const mm = ts.getMinutes().toString().padStart(2, "0");
      const ss = ts.getSeconds().toString().padStart(2, "0");
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
// USERS PANEL TOGGLE
const usersPanel = document.getElementById("users-panel");
const usersOpen = document.getElementById("users-open");

usersOpen.addEventListener("click", () => {
    usersPanel.classList.toggle("hidden");
});

// ------------------------------------------------------------
// OPEN ADMIN PANEL
// ------------------------------------------------------------
document.getElementById("admin-open").onclick = () => {
  // PIN is verified server-side by the Cloudflare Worker on submit
  // (see ADMIN_PIN check in the /alerts handler) — nothing here can
  // be a real security boundary since it ships in client JS.
  const pin = prompt("Enter admin PIN");
  if (!pin || !pin.trim()) {
    alert("PIN required");
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
adminPanel.addEventListener(
  "touchstart",
  e => {
    e.stopPropagation();
  },
  { passive: false }
);

// ------------------------------------------------------------
// CLOSE ADMIN PANEL (mobile + desktop safe)
// ------------------------------------------------------------
function closeAdminPanel() {
  adminPanel.classList.add("hidden");

  // Restore Leaflet controls AFTER the panel transition finishes
  setTimeout(() => {
    document.querySelectorAll(".leaflet-control").forEach(el => {
      el.style.display = "block";
      el.style.opacity = "1";
      el.style.visibility = "visible";
    });

    // Belt + braces: force Leaflet control container visible
    if (map && map._controlContainer) {
      map._controlContainer.style.display = "block";
    }

    // First redraw (after panel animation)
    map.invalidateSize({ animate: false });

    // Second redraw (after iOS viewport reset)
    setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 200);   // 200–300ms is ideal for iOS PWAs

  }, 150); // must be > CSS transition time
}


// Desktop click
adminClose.addEventListener("click", e => {
  L.DomEvent.stopPropagation(e);
  closeAdminPanel();
});

// Mobile touch
adminClose.addEventListener(
  "touchend",
  e => {
    e.stopPropagation(); // DO NOT call preventDefault here — it breaks click synthesis
    closeAdminPanel();
  },
  { passive: false }
);

// ------------------------------------------------------------
// SUBMIT ADMIN ALERT
// ------------------------------------------------------------
const adminSubmit = document.getElementById("admin-submit");

// 1. BLOCK touch events from reaching the map (but DO NOT preventDefault)
["touchstart", "touchmove", "touchend"].forEach(evt => {
  adminSubmit.addEventListener(
    evt,
    e => {
      e.stopPropagation(); // stops Leaflet from hiding controls
      // DO NOT call preventDefault here — it breaks onclick
    },
    { passive: false }
  );
});

// 2. NORMAL CLICK HANDLER (works on desktop + mobile)
adminSubmit.addEventListener("click", async e => {
  resetMapTransform();
  e.stopPropagation(); // safety
  // DO NOT call preventDefault here — it breaks async submit
  resetLeafletTouchState();

  blockNextMapClick();
  

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
    const fullMessage = combinedMessage; // already title + message

    const res = await fetch("https://shiny-math-8471.bunmahoncgu.workers.dev/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: fullMessage,
        pin: adminPin
      })
    });

    const data = await res.json();

    if (data.status !== "ok") {
      alert("Failed to post update: " + (data.error || "Unknown error"));
      return;
    }

    alert("Update posted");
    document.getElementById("admin-title").value = "";
    document.getElementById("admin-message").value = "";
    refreshAlerts();
    closeAdminPanel();

} catch (e) {
    console.error(e);
    alert("Network error");
}

});
