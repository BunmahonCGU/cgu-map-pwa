const iconBase = "https://umap.openstreetmap.fr/static/img/umap/markers/";

const iconMap = {
    // Cliff Walks
    "CWA": iconBase + "monument.png",          // white stile icon
    "CAP": iconBase + "circle-white.png",   // white circle

    // Lake Access Points
    "LR": iconBase + "circle-orange.png",   // orange line / access
    "LA": iconBase + "circle-orange.png",   // orange circle with L#

    // Defibrillators
    "D": iconBase + "defibrillator.png",    // red heartbeat

    // West Roads / Access Points
    // WR = blue polyline (handled in style, no icon)
    "WAP": iconBase + "circle-blue.png",    // blue circle with W#
    "WJ": iconBase + "square-blue.png",     // blue square

    // East Roads / Access Points
    // ER = pink polyline (handled in style, no icon)
    "EAP": iconBase + "circle-pink.png",    // pink circle with E#
    "EJ": iconBase + "square-pink.png"      // pink square
};

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
                if (prefix === "WR") {
                    return { color: "blue", weight: 4 };
                }
                if (prefix === "ER") {
                    return { color: "pink", weight: 4 };
                }
                if (prefix === "LR") {
                    return { color: "orange", weight: 4 };
                }
            }

            return {};
        },

        pointToLayer: function (feature, latlng) {
            if (feature.geometry.type !== "Point") return;

            const name = feature.properties.name || "";
            const prefix = name.replace(/[0-9]/g, "");

            const iconUrl = iconMap[prefix] || iconBase + "circle-blue.png";

            const icon = L.icon({
                iconUrl: iconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });

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
