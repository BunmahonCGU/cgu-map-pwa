// Compact SVG icon factory (no whitespace/newlines)
function makeSvgIcon(shape, color) {
    let svg = "";

    if (shape === "circle") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="' + color + '" stroke="black" stroke-width="2"/></svg>';
    }

    if (shape === "square") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32"><rect x="6" y="6" width="20" height="20" fill="' + color + '" stroke="black" stroke-width="2"/></svg>';
    }

    if (shape === "monument") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32"><path d="M10 26h12v-2H10zm2-4h8V8h-8z" fill="' + color + '" stroke="black" stroke-width="2"/></svg>';
    }

    if (shape === "defib") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="' + color + '" stroke="black" stroke-width="2"/><path d="M10 18l4-6 2 4 2-2 4 4" stroke="white" stroke-width="3" fill="none"/></svg>';
    }

    return L.divIcon({
        html: svg,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

// Icon definitions for point features
const iconMap = {
    "CWA": { shape: "monument", color: "white" },
    "LA":  { shape: "circle",   color: "orange" },
    "D":   { shape: "defib",    color: "red" },
    "WAP": { shape: "circle",   color: "blue" },
    "WJ":  { shape: "square",   color: "blue" },
    "EAP": { shape: "circle",   color: "pink" },
    "EJ":  { shape: "square",   color: "pink" }
};

// Load uMap JSON
async function loadUmapFile(url) {
    const response = await fetch(url);
    const umap = await response.json();
    const allFeatures = umap.layers.flatMap(layer => layer.features);

    return {
        type: "FeatureCollection",
        features: allFeatures
    };
}

async function initMap() {
    const map = L.map('map').setView(
        [52.10309691240007, -7.349853515625001],
        10
    );

    L.tileLayer('//{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const geojson = await loadUmapFile('data/bunmahon-latest.umap');

    L.geoJSON(geojson, {
        style: function (feature) {
            const name = feature.properties.name || "";
            const prefix = name.replace(/[0-9]/g, "");

            if (feature.geometry.type === "LineString") {
                if (prefix === "WR") return { color: "blue", weight: 4 };
                if (prefix === "ER") return { color: "pink", weight: 4 };
                if (prefix === "LR") return { color: "orange", weight: 4 };
                if (prefix === "CAP") return { color: "white", weight: 4 };
            }

            return {};
        },

        pointToLayer: function (feature, latlng) {
            if (feature.geometry.type !== "Point") return;

            const name = feature.properties.name || "";
            const prefix = name.replace(/[0-9]/g, "");

            const iconDef = iconMap[prefix] || { shape: "circle", color: "blue" };
            const icon = makeSvgIcon(iconDef.shape, iconDef.color);

            return L.marker(latlng, { icon: icon });
        },

        onEachFeature: function (feature, layer) {
            if (feature.properties && feature.properties.description) {
                let popup = feature.properties.description;

                if (feature.geometry && feature.geometry.coordinates) {
                    const [lon, lat] = feature.geometry.coordinates;
                    popup = popup
                        .replaceAll("{lat}", lat)
                        .replaceAll("{lng}", lon)
                        .replaceAll("{lon}", lon);
                }

                layer.bindPopup(popup);
            }
        }
    }).addTo(map);
}

initMap();
