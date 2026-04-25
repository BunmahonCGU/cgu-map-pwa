// SVG icon factory with pin shapes and labels
function makeSvgIcon(shape, color, label) {
    let svg = "";

    if (shape === "circle-pin") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32">'
            + '<path d="M16 2 C9 2 4 7 4 14 C4 22 16 30 16 30 C16 30 28 22 28 14 C28 7 23 2 16 2 Z" fill="' + color + '" stroke="black" stroke-width="2"/>'
            + '<text x="16" y="16" text-anchor="middle" font-size="9" fill="white" font-family="sans-serif">' + label + '</text>'
            + '</svg>';
    }

    if (shape === "square-pin") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32">'
            + '<rect x="8" y="4" width="16" height="14" fill="' + color + '" stroke="black" stroke-width="2"/>'
            + '<path d="M16 30 L8 18 L24 18 Z" fill="' + color + '" stroke="black" stroke-width="2"/>'
            + '<text x="16" y="14" text-anchor="middle" font-size="9" fill="white" font-family="sans-serif">' + label + '</text>'
            + '</svg>';
    }

    if (shape === "defib-pin") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32">'
            + '<path d="M16 2 C9 2 4 7 4 14 C4 22 16 30 16 30 C16 30 28 22 28 14 C28 7 23 2 16 2 Z" fill="' + color + '" stroke="black" stroke-width="2"/>'
            + '<path d="M10 18l3-5 2 4 2-3 5 4" stroke="white" stroke-width="2" fill="none"/>'
            + '<text x="16" y="16" text-anchor="middle" font-size="9" fill="white" font-family="sans-serif">' + label + '</text>'
            + '</svg>';
    }

    if (shape === "monument") {
        svg = '<svg width="32" height="32" viewBox="0 0 32 32">'
            + '<path d="M10 26h12v-2H10zm2-4h8V8h-8z" fill="' + color + '" stroke="black" stroke-width="2"/>'
            + '</svg>';
    }

    return L.divIcon({
        html: svg,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 30],
        popupAnchor: [0, -30]
    });
}

// Icon definitions by prefix (point features)
const iconMap = {
    "CWA": { shape: "monument",   color: "white"  },
    "LA":  { shape: "circle-pin", color: "orange" },
    "D":   { shape: "defib-pin",  color: "red"    },
    "WAP": { shape: "circle-pin", color: "blue"   },
    "WJ":  { shape: "square-pin", color: "blue"   },
    "EAP": { shape: "circle-pin", color: "pink"   },
    "EJ":  { shape: "square-pin", color: "pink"   }
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
                if (prefix === "WR")  return { color: "blue",  weight: 4 };
                if (prefix === "ER")  return { color: "pink",  weight: 4 };
                if (prefix === "LR")  return { color: "orange",weight: 4 };
                if (prefix === "CAP") return { color: "white", weight: 4 };
            }

            return {};
        },

        pointToLayer: function (feature, latlng) {
            if (feature.geometry.type !== "Point") return;

            const name = feature.properties.name || "";
            const prefix = name.replace(/[0-9]/g, "");

            const iconDef = iconMap[prefix] || { shape: "circle-pin", color: "blue" };
            const icon = makeSvgIcon(iconDef.shape, iconDef.color, name);

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
