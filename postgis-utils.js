const db = require("@saltcorn/data/db");

const parseCoordPairs = (s) =>
  s
    .trim()
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map(Number));

// Split a string by top-level commas (ignoring commas inside parentheses).
const splitTopLevel = (s) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
};

// Extract all `(coord pairs)` groups from a string (non-nested).
const extractRings = (s) => {
  const rings = [];
  const re = /\(([^()]+)\)/g;
  let m;
  while ((m = re.exec(s)) !== null) rings.push(parseCoordPairs(m[1]));
  return rings;
};

const wktToGeoJSON = (wkt) => {
  if (!wkt) return null;
  const s = wkt.trim();
  let m;

  m = s.match(
    /^POINT\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)(?:\s+[-\d.eE+]+)?\s*\)$/i,
  );
  if (m) return { type: "Point", coordinates: [+m[1], +m[2]] };

  m = s.match(/^LINESTRING\s*\(([^)]+)\)$/i);
  if (m) return { type: "LineString", coordinates: parseCoordPairs(m[1]) };

  m = s.match(/^POLYGON\s*\(([\s\S]+)\)$/i);
  if (m) return { type: "Polygon", coordinates: extractRings(m[1]) };

  m = s.match(/^MULTIPOINT\s*\(([\s\S]+)\)$/i);
  if (m) {
    const inner = m[1].replace(/[()]/g, "");
    return { type: "MultiPoint", coordinates: parseCoordPairs(inner) };
  }

  m = s.match(/^MULTILINESTRING\s*\(([\s\S]+)\)$/i);
  if (m) return { type: "MultiLineString", coordinates: extractRings(m[1]) };

  m = s.match(/^MULTIPOLYGON\s*\(([\s\S]+)\)$/i);
  if (m) {
    const polygons = splitTopLevel(m[1]).map((polyStr) =>
      extractRings(polyStr.trim().slice(1, -1)),
    );
    return { type: "MultiPolygon", coordinates: polygons };
  }

  return null;
};

const fetchGeoJSON = async (table, geomField, rowIds) => {
  if (!rowIds || rowIds.length === 0) return {};
  const pk = table.pk_name || "id";
  try {
    const placeholders = rowIds.map((_, i) => `$${i + 1}`).join(", ");
    const res = await db.query(
      `SELECT "${pk}", "${geomField}" AS __geom
       FROM "${table.name}"
       WHERE "${pk}" IN (${placeholders})`,
      rowIds,
    );
    const result = {};
    for (const r of res.rows || []) {
      if (r.__geom == null) continue;
      const raw = r.__geom;
      let geojson = null;
      if (typeof raw === "object") {
        geojson = raw.type ? raw : null;
      } else {
        const str = String(raw).trim();
        if (str.startsWith("{")) {
          try {
            geojson = JSON.parse(str);
          } catch {}
        } else {
          geojson = wktToGeoJSON(str);
        }
      }
      if (geojson) result[r[pk]] = geojson;
    }
    return result;
  } catch (e) {
    console.error("fetchGeoJSON error:", e.message);
    return {};
  }
};

const extractPointCoords = (geom) => {
  try {
    const g = typeof geom === "string" ? JSON.parse(geom) : geom;
    if (!g) return null;
    let coord;
    switch (g.type) {
      case "Point":
        coord = g.coordinates;
        break;
      case "LineString":
      case "MultiPoint":
        coord = g.coordinates[0];
        break;
      case "Polygon":
      case "MultiLineString":
        coord = g.coordinates[0][0];
        break;
      case "MultiPolygon":
        coord = g.coordinates[0][0][0];
        break;
      default:
        return null;
    }
    if (Array.isArray(coord) && coord.length >= 2) return [coord[1], coord[0]];
  } catch {}
  return null;
};

module.exports = { fetchGeoJSON, extractPointCoords };
