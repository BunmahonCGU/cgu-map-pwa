// SVG icon factory
function makeSvgIcon(shape, color) {
    let svg = "";

    if (shape === "circle") {
        svg = `
            <svg width="32" height="32" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="10" fill="${color}" stroke="black" stroke-width="2"/>
            </svg>`;
    }

    if (shape === "square") {
        svg = `
            <svg width="32" height="32" viewBox="0 0 32 32">
                <rect x="6" y="6" width="20" height="20" fill="${color}" stroke="black" stroke-width="2"/>
            </svg>`;
    }

    if (shape === "monument") {
        svg = `
            <svg width="32" height="32" viewBox="0 0 32 32">
                <path d="M10 26h12v-2H10zm2-4h8V8h-8z" fill="${color}" stroke="black" stroke-width="2"/>
            </svg>`;
    }

    if (shape === "defib") {
        svg = `
            <svg width="32" height="32" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="10" fill="${color}" stroke="black" stroke-width="2"/>
                <path d="M10 18l4-6 2 4 2-2 4 4" stroke="white" stroke-width="3" fill="none"/>
            </svg>`;
    }

    return L.divIcon({
        html: svg,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

// Point icon definitions (only for point features)
const iconMap = {
    "CWA": { shape: "monument", color: "white" },
    "LA":  { shape: "circle",   color: "orange" },
    "D":   { shape: "defib",    color: "red" },
    "WAP": { shape: "circle",   color: "blue" },
    "WJ":  { shape: "square",   color: "blue" },
    "EAP": { shape: "circle",   color: "pink" },
    "EJ":  { shape: "square",   color: "pink" }
};

async function loadUmapFile(url) {
    const response = await fetch(url);
    const umap = await response.json();

    const allFeatures = umap.layers.flatMap(layer => layer
