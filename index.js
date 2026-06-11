const { features } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");

const headers = [
  {
    script: `/plugins/public/leaflet-map@${
      require("./package.json").version
    }/leaflet.js`,
    onlyViews: ["Leaflet map", "Leaflet map - multi-table"],
  },
  {
    css: `/plugins/public/leaflet-map@${
      require("./package.json").version
    }/leaflet.css`,
    onlyViews: ["Leaflet map", "Leaflet map - multi-table"],
  },
];

const onLoad = async () => {
  try {
    await db.query("CREATE EXTENSION IF NOT EXISTS postgis");
  } catch (e) {
    console.warn("leaflet-map: could not create postgis extension:", e.message);
  }
};

module.exports = {
  sc_plugin_api_version: 1,
  headers,
  plugin_name: "leaflet-map",
  onLoad,
  types: require("./postgis-types"),
  viewtemplates: [require("./map"), require("./multi-table-map")],
};
