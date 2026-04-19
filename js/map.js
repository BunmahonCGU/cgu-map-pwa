async function loadUmapFile(url) {
    const response = await fetch(url);
    const umap = await response.json();

    // Flatten all features from all layers
    const allFeatures = umap.layers.flatMap(layer => layer.features);

    return {
        type: "FeatureCollection",
        features: allFeatures
    };
}

async function initMap() {
    // Create the map
    const map = L.map('map').setView(
        [52.10309691240007, -7.349853515625001], 
        10
    );

    // Base layer (OSM France)
    L.tileLayer('//{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load the uMap JSON file
    const geojson = await loadUmapFile('data/bunmahon-latest.umap');

    // Render features
    L.geoJSON(geojson, {
        pointToLayer: function (feature, latlng) {
            const opts = feature.properties._umap_options || {};
            let iconUrl = opts.iconUrl;

            // Default icon if none provided
            if (!iconUrl || iconUrl === "Y") {
                iconUrl = "https://umap.openstreetmap.fr/static/img/marker.png";
            }

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

                // Replace placeholders {lat} {lng} {lon}
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
