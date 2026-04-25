// ------------------------------------------------------------
// Bunmahon CGU Access Map – Custom Icon + Styling System
// ------------------------------------------------------------

// Extract label safely (iconSymbol → label → name)
function getFeatureLabel(feature) {
    const props = feature.properties || {};

    // 1) iconSymbol (new uMap)
    if (props._umap_options && props._umap_options.iconSymbol) {
        return props._umap_options.iconSymbol;
    }

    // 2) fallback: properties.label (rare)
    if (props.label) {
        return props.label;
    }

    // 3) fallback: name
    return props.name || "";
}

// ------------------------------------------------------------
// SVG Icon Factory (40×40, compact SVG, soft teardrop pins)
// ------------------------------------------------------------
function makeSvgIcon(shape, color, label) {
    let svg = "";

    // Circle‑pin (soft teardrop)
    if (shape === "circle-pin") {
        svg =
            '<svg width="40" height="40" viewBox="0 0 40 40">' +
            '<path d="M20 3 C11 3 5 9 5 17 C5 27 20 38 20 38 C20 38 35 27 35 17 C35 9 29 3 20 3 Z" fill="' +
            color +
            '" stroke="black" stroke-width="2"/>' +
            '<text x="20" y="17" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">' +
            label +
            "</text>" +
            "</svg>";
    }

    // Square‑pin (flat top, soft teardrop bottom, no seam)
    if (shape === "square-pin") {
        svg =
            '<svg width="40" height="40" viewBox="0 0 40 40">' +
            // Single continuous path: square top + soft teardrop bottom
            '<path d="M10 5 H30 V17 C30 27 20 38 20 38 C20 38 10 27 10 17 Z" fill="' +
            color +
            '" stroke="black" stroke-width="2"/>' +
            '<text x="20" y="15" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">' +
            label +
            "</text>" +
            "</svg>";
    }

    // Defib pin (circle‑pin + heartbeat)
    if (shape === "defib-pin") {
        svg =
            '<svg width="40" height="40" viewBox="0 0 40 40">' +
            '<path d="M20 3 C11 3 5 9 5 17 C5 27 20 38 20 38 C20 38 35 27 35 17 C35 9 29 3 20 3 Z" fill="' +
            color +
            '" stroke="black" stroke-width="2"/>' +
            '<path d="M12 22l4-6 2 4 2-3 6 5" stroke="white" stroke-width="2" fill="none"/>' +
            '<text x="20" y="17" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">' +
            label +
            "</text>" +
            "</svg>";
    }

    // Monument (CWA)
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
// Icon definitions by prefix
// ------------------------------------------------------------
const iconMap = {
    CWA: { shape: "monument", color: "white" },
    LA: { shape: "circle-pin", color: "orange" },
    D: { shape
