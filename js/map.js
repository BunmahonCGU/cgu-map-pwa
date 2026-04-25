// ------------------------------------------------------------
// Bunmahon CGU Access Map – Full Feature Version
// ------------------------------------------------------------

// Extract label safely (iconURL → label → name)
function getFeatureLabel(feature) {
    const props = feature.properties || {};

    // 1) iconURL (new uMap stores "icon symbol" here)
    if (props._umap_options && props._umap_options.iconURL) {
        return props._umap_options.iconURL;
    }

    // 2) fallback: properties.label
    if (props.label) return props.label;

    // 3) fallback: name
    return props.name || "";
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
// Icon definitions by prefix
// ------------------------------------------------------------
const iconMap = {
    CWA: { shape: "monument", color: "white" },
    LA:  { shape: "circle-pin", color: "orange" },
    D:   { shape: "defib-pin",  color: "red" },
    WAP: { shape: "circle-pin", color: "blue" },
    WJ:  { shape: "square-pin", color: "blue" },
    EAP: { shape: "circle-pin", color: "pink" },
    EJ:  { shape: "square-pin", color: "pink" }
};

// ------------------------------------------------------------
// Layer groups (toggleable)
// ------------------------------------------------------------
const layerGroups = {
    // Cliff Walks
    CWA: L.layerGroup(),
    CAP: L.layerGroup(),

    // Lake Access
    LR: L.layerGroup(),
    LA: L.layerGroup(),

    // Defibrillator
    D: L.layerGroup(),

    // West Roads
    WR: L.layerGroup(),
    WJ: L.layerGroup(),

    // West Access Points
    WAP: L.layerGroup(),

    // East Roads
    ER: L.layerGroup(),
    EJ: L.layerGroup(),

    // East Access Points
    EAP: L.layerGroup()
};


// ------------------------------------------------------------
// Load uMap JSON (local PWA copy)
// ------------------------------------------------------------
async function loadUmapFile(url) {
    const response = await fetch(url);
    const umap = await response.json();
    const allFeatures = umap.layers.flatMap(layer => layer.features);
    return { type: "FeatureCollection", features: allFeatures };
}

// ------------------------------------------------------------
// Map initialisation
// ------------------------------------------------------------
async function initMap() {
    const map = L.map("map").setView([52.1031, -7.3498], 10);

    // Base layers
    const osm = L.tileLayer('//{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 20, attribution: 'Tiles © Esri' }
    );

    // Automatic basemap switching
    map.on("zoomend", () => {
        const z = map.getZoom();
        if (z >= 16) {
            if (!map.hasLayer(sat)) { map.removeLayer(osm); map.addLayer(sat); }
        } else {
            if (!map.hasLayer(osm)) { map.removeLayer(sat); map.addLayer(osm); }
        }
    });

    const geojson = await loadUmapFile("data/bunmahon-latest.umap");

    L.geoJSON(geojson, {
        // --------------------------------------------------------
        // Polyline styling (never labeled)
        // --------------------------------------------------------
        style: feature => {
            const name = feature.properties.name || "";
            const prefix = name.replace(/[0-9]/g, "");

            if (feature.geometry.type === "LineString") {
                if (prefix === "WR")  return { color: "blue",   weight: 4 };
                if (prefix === "ER")  return { color: "pink",   weight: 4 };
                if (prefix === "LR")  return { color: "orange", weight: 4 };
                if (prefix === "CAP") return { color: "white",  weight: 4 };
            }
            return {};
        },

        // --------------------------------------------------------
        // Point features → custom icons
        // --------------------------------------------------------
        pointToLayer: (feature, latlng) => {
            if (feature.geometry.type !== "Point") return;

            const name = feature.properties.name || "";
            const prefix = name.replace(/[0-9]/g, "");
            const label = getFeatureLabel(feature);

            const iconDef = iconMap[prefix] || { shape: "circle-pin", color: "blue" };
            const icon = makeSvgIcon(iconDef.shape, iconDef.color, label);

            const marker = L.marker(latlng, { icon });
            if (layerGroups[prefix]) layerGroups[prefix].addLayer(marker);
            return marker;
        },

        // --------------------------------------------------------
        // Popups (full HTML support)
        // --------------------------------------------------------
        onEachFeature: (feature, layer) => {
    if (feature.properties && feature.properties.description) {
        let popup = feature.properties.description;

        // Replace {lat}, {lng}, {lon}
        if (feature.geometry && feature.geometry.coordinates) {
            const [lon, lat] = feature.geometry.coordinates;
            popup = popup.replaceAll("{lat}", lat).replaceAll("{lng}", lon).replaceAll("{lon}", lon);
        }

        // Replace {Measure} for LineString
        if (popup.includes("{Measure}") && feature.geometry.type === "LineString") {
            const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
            const lengthMeters = L.GeometryUtil.length(coords);
            const lengthRounded = Math.round(lengthMeters);
            popup = popup.replace("{Measure}", lengthRounded + " m");
        }
// Replace {Elevation}
if (popup.includes("{Elevation}") || popup.includes("{elevation}") || popup.includes("{ele}")) {
    let elevation = null;

    // 1) Check GeoJSON coordinate triplet
    if (feature.geometry && feature.geometry.coordinates) {
        const coords = feature.geometry.coordinates;
        if (Array.isArray(coords) && coords.length >= 3 && typeof coords[2] === "number") {
            elevation = coords[2];
        }
    }

    // 2) Check properties
    const props = feature.properties || {};
    if (elevation === null && typeof props.ele === "number") elevation = props.ele;
    if (elevation === null && typeof props.elevation === "number") elevation = props.elevation;

    // 3) Format elevation
    const elevationText = elevation !== null ? elevation + " m" : "N/A";

    popup = popup
        .replaceAll("{Elevation}", elevationText)
        .replaceAll("{elevation}", elevationText)
        .replaceAll("{ele}", elevationText);
}

        layer.bindPopup(popup, { maxWidth: 400, className: "custom-popup" });
    }

    // Add polylines to layer groups
    if (feature.geometry.type === "LineString") {
        const name = feature.properties.name || "";
        const prefix = name.replace(/[0-9]/g, "");
        if (layerGroups[prefix]) layerGroups[prefix].addLayer(layer);
    }
}

    });

    // --------------------------------------------------------
    // Layer toggle control
    // --------------------------------------------------------
L.control.layers(null, {
    "Cliff Walks": L.layerGroup([layerGroups.CWA, layerGroups.CAP]),
    "Lake Access": L.layerGroup([layerGroups.LR, layerGroups.LA]),
    "Defibrillators": layerGroups.D,
    "West Roads": L.layerGroup([layerGroups.WR, layerGroups.WJ]),
    "West Access Points": layerGroups.WAP,
    "East Roads": L.layerGroup([layerGroups.ER, layerGroups.EJ]),
    "East Access Points": layerGroups.EAP
}).addTo(map);
}

initMap();

// ------------------------------------------------------------
// Optional: Auto-download latest .umap file (disabled by default)
// ------------------------------------------------------------
async function autoDownloadUmap() {
    const url = "https://umap.openstreetmap.fr/en/map/1393298/export/?format=umap";
    const response = await fetch(url);
    return await response.blob();
}
