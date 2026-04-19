async function loadUmapBackup(url) {
    const umap = await fetch(url).then(r => r.json());

    // Extract all features from all layers
    const features = umap.layers.flatMap(layer => layer.features);

    return {
        type: "FeatureCollection",
        features
    };
}

async function initMap() {
    const map = L.map('map').setView([52.14, -7.36], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    const geojson = await loadUmapBackup('data/bunmahon-latest.umap');

    L.geoJSON(geojson, {
        onEachFeature: (feature, layer) => {
            if (feature.properties && feature.properties.description) {
                layer.bindPopup(feature.properties.description);
            }
        }
    }).addTo(map);
}

initMap();
