const { span } = require("@saltcorn/markup/tags");
const { wktToGeoJSON, ewkbToWKT } = require("./postgis-utils");
const { version } = require("./package.json");

const leafletJs = `/plugins/public/leaflet-map@${version}/leaflet.js`;
const leafletCss = `/plugins/public/leaflet-map@${version}/leaflet.css`;

const leafletGuard = `
if (!window._whenLeaflet) {
  window._whenLeaflet = function(cb) {
    if (window.L) { cb(); return; }
    document.addEventListener('_leaflet_ready', cb, {once:true});
    if (!window._leafletLoading) {
      window._leafletLoading = true;
      var lnk=document.createElement('link');lnk.rel='stylesheet';
      lnk.href='${leafletCss}';document.head.appendChild(lnk);
      var s=document.createElement('script');s.src='${leafletJs}';
      s.onload=function(){document.dispatchEvent(new Event('_leaflet_ready'));};
      document.head.appendChild(s);
    }
  };
}`;

const isWKT = (v) =>
  /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)/i.test(
    String(v).trim(),
  );

const isEWKB = (v) => {
  const s = String(v).trim();
  return s.length > 10 && /^[0-9A-Fa-f]+$/.test(s);
};

let _idSeq = 0;
const uid = () => `g${++_idSeq}_${Math.floor(Math.random() * 1e6)}`;

const showMap = {
  isEdit: false,
  run: (v) => {
    if (v == null || v === "") return "";
    let s = String(v).trim();
    if (isEWKB(s)) s = ewkbToWKT(s) || "";
    if (!s) return span({ class: "text-muted small fst-italic" }, "[geometry]");

    const geojson = isWKT(s) ? wktToGeoJSON(s) : null;
    if (!geojson)
      return span(
        { class: "font-monospace small text-muted" },
        s.length > 80 ? s.slice(0, 80) + "…" : s,
      );

    const id = uid();
    return `<div id="${id}" style="height:150px;width:100%;border:1px solid #dee2e6;border-radius:4px;"></div>
<script>
${leafletGuard}
_whenLeaflet(function(){
  var map=L.map('${id}',{zoomControl:false,attributionControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  var layer=L.geoJSON(${JSON.stringify(geojson)}).addTo(map);
  try{map.fitBounds(layer.getBounds(),{padding:[16,16]});}catch(e){map.setView([0,0],2);}
});
</script>`;
  },
};

const geometryEditor = {
  isEdit: true,
  run: (nm, v, attrs) => {
    let s = v ? String(v).trim() : "";
    if (s && isEWKB(s)) s = ewkbToWKT(s) || "";
    const geojson = s && isWKT(s) ? wktToGeoJSON(s) : null;
    const id = uid();
    const disabled = attrs.disabled || attrs.readonly;
    const initGeoStr = geojson ? JSON.stringify(geojson) : "null";

    return `<input type="hidden" name="${nm}" id="input${nm}" value="${s.replace(/"/g, "&quot;")}">
<div style="margin-bottom:4px;display:flex;gap:4px;align-items:center;">
  <button type="button" id="${id}_pt" class="btn btn-sm btn-outline-secondary">Point</button>
  <button type="button" id="${id}_ln" class="btn btn-sm btn-outline-secondary">Line</button>
  <button type="button" id="${id}_pg" class="btn btn-sm btn-outline-secondary">Polygon</button>
  <button type="button" id="${id}_cl" class="btn btn-sm btn-outline-danger ms-auto">Clear</button>
</div>
<div id="${id}" style="height:260px;width:100%;border:1px solid #dee2e6;border-radius:4px;"></div>
<small id="${id}_hint" class="text-muted">${disabled ? "Read-only" : "Select a tool, then click the map"}</small>
<script>
${leafletGuard}
_whenLeaflet(function(){
  var map=L.map('${id}',{zoomControl:true,doubleClickZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'\\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var savedLayer=null, tempLayer=null, cursorLayer=null, mode=null, verts=[], pendingCancel=null, modeGen=0, drawing=false;
  var inp=document.getElementById('input${nm}');
  var hint=document.getElementById('${id}_hint');
  var modeBtns=[
    document.getElementById('${id}_pt'),
    document.getElementById('${id}_ln'),
    document.getElementById('${id}_pg')
  ];

  var initGeo=${initGeoStr};
  if(initGeo){
    savedLayer=L.geoJSON(initGeo).addTo(map);
    try{map.fitBounds(savedLayer.getBounds(),{padding:[16,16]});}catch(e){map.setView([0,0],2);}
  } else {
    map.setView([0,0],2);
  }

  function commitSaved(geojson, wkt){
    if(savedLayer){map.removeLayer(savedLayer);savedLayer=null;}
    inp.value=wkt;
    savedLayer=L.geoJSON(geojson).addTo(map);
    try{map.fitBounds(savedLayer.getBounds(),{padding:[16,16]});}catch(e){}
  }

  ${
    disabled
      ? ""
      : `
  function setMode(m){
    modeGen++;pendingCancel=null;
    if(tempLayer){map.removeLayer(tempLayer);tempLayer=null;}
    if(cursorLayer){map.removeLayer(cursorLayer);cursorLayer=null;}
    verts=[];drawing=false;mode=m;
    map.getContainer().style.cursor=m?'crosshair':'';
    modeBtns.forEach(function(b){b.classList.remove('btn-secondary','active');b.classList.add('btn-outline-secondary');});
    if(m){
      var idx=m==='point'?0:m==='line'?1:2;
      modeBtns[idx].classList.remove('btn-outline-secondary');
      modeBtns[idx].classList.add('btn-secondary','active');
    }
    hint.textContent=m==='point'?'Click the map to place a point':
                     m==='line' ?'Click to add points; double-click to finish the line':
                     m==='polygon'?'Click to add points; double-click to close the polygon':
                     'Select a tool, then click the map';
  }

  function resetMode(){
    modeGen++;
    mode=null;verts=[];drawing=false;
    if(tempLayer){map.removeLayer(tempLayer);tempLayer=null;}
    if(cursorLayer){map.removeLayer(cursorLayer);cursorLayer=null;}
    map.getContainer().style.cursor='';
    modeBtns.forEach(function(b){b.classList.remove('btn-secondary','active');b.classList.add('btn-outline-secondary');});
  }

  function updateTemp(){
    if(tempLayer){map.removeLayer(tempLayer);tempLayer=null;}
    if(!verts.length)return;
    var ll=verts.map(function(p){return[p[1],p[0]];});
    if(mode==='line'&&verts.length>=2)
      tempLayer=L.polyline(ll,{color:'#0078d4',dashArray:'5 5',weight:2}).addTo(map);
    else if(mode==='polygon'&&verts.length>=2)
      tempLayer=L.polygon(ll,{color:'#0078d4',dashArray:'5 5',weight:2,fillOpacity:0.1}).addTo(map);
    else
      tempLayer=L.circleMarker(ll[0],{radius:5,color:'#0078d4',fillOpacity:0.6}).addTo(map);
  }

  function finishLine(){
    if(verts.length<2){resetMode();return;}
    var wkt='LINESTRING('+verts.map(function(p){return p[0].toFixed(6)+' '+p[1].toFixed(6);}).join(', ')+')';
    commitSaved({type:'LineString',coordinates:verts.map(function(p){return[p[0],p[1]];})},wkt);
    hint.textContent='Line saved. Select a tool to redraw.';
    resetMode();
  }

  function finishPolygon(){
    if(verts.length<3){resetMode();return;}
    var ring=verts.concat([verts[0]]);
    var wkt='POLYGON(('+ring.map(function(p){return p[0].toFixed(6)+' '+p[1].toFixed(6);}).join(', ')+'))';
    commitSaved({type:'Polygon',coordinates:[ring.map(function(p){return[p[0],p[1]];})]},wkt);
    hint.textContent='Polygon saved. Select a tool to redraw.';
    resetMode();
  }

  map.on('click',function(e){
    if(!mode)return;
    var lng=e.latlng.lng, lat=e.latlng.lat;
    var myGen=modeGen;
    var t=setTimeout(function(){
      if(pendingCancel===t)pendingCancel=null;
      if(modeGen!==myGen||!mode)return;
      if(mode==='point'){
        if(savedLayer){map.removeLayer(savedLayer);savedLayer=null;}
        if(tempLayer){map.removeLayer(tempLayer);tempLayer=null;}
        var wkt='POINT('+lng.toFixed(6)+' '+lat.toFixed(6)+')';
        inp.value=wkt;
        savedLayer=L.marker([lat,lng]).addTo(map);
        hint.textContent='Point placed. Click again to move it.';
      } else {
        if(!drawing){drawing=true;if(savedLayer){map.removeLayer(savedLayer);savedLayer=null;}}
        verts.push([lng,lat]);
        updateTemp();
        hint.textContent=(mode==='line'?'Line':'Polygon')+': '+verts.length+' point'+(verts.length!==1?'s':'')+'. Double-click to finish.';
      }
    },150);
    pendingCancel=t;
  });

  map.on('dblclick',function(e){
    if(pendingCancel){clearTimeout(pendingCancel);pendingCancel=null;}
    L.DomEvent.stopPropagation(e);
    if(mode==='line')finishLine();
    else if(mode==='polygon')finishPolygon();
  });

  modeBtns[0].addEventListener('click',function(){setMode('point');});
  modeBtns[1].addEventListener('click',function(){setMode('line');});
  modeBtns[2].addEventListener('click',function(){setMode('polygon');});
  document.getElementById('${id}_cl').addEventListener('click',function(){
    if(savedLayer){map.removeLayer(savedLayer);savedLayer=null;}
    inp.value='';
    resetMode();
    hint.textContent='Select a tool, then click the map';
  });
  `
  }
});
</script>`;
  },
};

const editText = {
  isEdit: true,
  run: (nm, v, attrs, cls) => {
    let s = v ? String(v).trim() : "";
    if (s && isEWKB(s)) s = ewkbToWKT(s) || "";
    const safeVal = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const disabled = attrs.disabled ? "disabled" : "";
    const readonly = attrs.readonly ? "readonly" : "";
    return `<textarea
  class="form-control font-monospace${cls ? " " + cls : ""}"
  name="${nm}"
  id="input${nm}"
  rows="2"
  placeholder="POINT(lng lat)  ·  LINESTRING(x1 y1, x2 y2)  ·  POLYGON((x1 y1, …))"
  ${disabled} ${readonly}
>${safeVal}</textarea>
<div id="input${nm}_vfb" style="font-size:.82em;margin-top:3px;min-height:1.1em;"></div>
<script>
(function(){
  var el=document.getElementById('input${nm}');
  var fb=document.getElementById('input${nm}_vfb');
  if(!el||!fb)return;

  // Full recursive-descent WKT parser — mirrors what PostGIS accepts
  function parseWKT(str) {
    str=str.trim();
    if(!str)return null;
    var i=0;
    function ws(){while(i<str.length&&str[i]<=' ')i++;}
    function eat(c){ws();if(str[i]===c){i++;return true;}return false;}
    function num(){
      ws();var s=i;
      if(str[i]==='-')i++;
      while(i<str.length&&(str[i]>='0'&&str[i]<='9'||str[i]==='.'))i++;
      if(i<str.length&&(str[i]==='e'||str[i]==='E')){i++;if(str[i]==='+'||str[i]==='-')i++;while(str[i]>='0'&&str[i]<='9')i++;}
      if(isNaN(parseFloat(str.slice(s,i)))){i=s;return false;}
      return true;
    }
    function coord(){
      if(!num())return'Expected number';
      if(!num())return'Expected number';
      while(num()){}
      return null;
    }
    function ring(){
      if(!eat('('))return'Expected (';
      ws();if(str[i]===')'){{i++;return null;}}
      var e=coord();if(e)return e;
      while(eat(',')){{e=coord();if(e)return e;}}
      return eat(')')?null:'Expected )';
    }
    function polygon(){
      if(!eat('('))return'Expected (';
      var e=ring();if(e)return e;
      while(eat(',')){{e=ring();if(e)return e;}}
      return eat(')')?null:'Expected )';
    }
    function geom(){
      ws();var s=i;
      while(i<str.length&&((str.charCodeAt(i)>=65&&str.charCodeAt(i)<=90)||(str.charCodeAt(i)>=97&&str.charCodeAt(i)<=122)))i++;
      var kw=str.slice(s,i).toUpperCase();
      ws();
      if((str[i]==='Z'||str[i]==='M')&&str[i+1]!=='('){i++;if(str[i]==='M')i++;ws();}
      if(str.slice(i,i+5).toUpperCase()==='EMPTY'){i+=5;return null;}
      var e;
      switch(kw){
        case'POINT':
          if(!eat('('))return'POINT: expected (';
          e=coord();if(e)return e;
          ws();if(str[i]===',')return'POINT takes exactly one coordinate pair';
          return eat(')')?null:'Expected )';
        case'LINESTRING':
          if(!eat('('))return'LINESTRING: expected (';
          e=coord();if(e)return e;
          if(!eat(','))return'LINESTRING needs at least 2 points';
          e=coord();if(e)return e;
          while(eat(',')){{e=coord();if(e)return e;}}
          return eat(')')?null:'Expected )';
        case'POLYGON':return polygon();
        case'MULTIPOINT':
          if(!eat('('))return'Expected (';
          ws();
          if(str[i]==='('){e=ring();if(e)return e;while(eat(',')){{ws();e=ring();if(e)return e;}}}
          else{e=coord();if(e)return e;while(eat(',')){{ws();e=(str[i]==='('?ring():coord());if(e)return e;}}}
          return eat(')')?null:'Expected )';
        case'MULTILINESTRING':
          if(!eat('('))return'Expected (';
          e=ring();if(e)return e;
          while(eat(',')){{e=ring();if(e)return e;}}
          return eat(')')?null:'Expected )';
        case'MULTIPOLYGON':
          if(!eat('('))return'Expected (';
          e=polygon();if(e)return e;
          while(eat(',')){{e=polygon();if(e)return e;}}
          return eat(')')?null:'Expected )';
        case'GEOMETRYCOLLECTION':
          if(!eat('('))return'Expected (';
          e=geom();if(e)return e;
          while(eat(',')){{e=geom();if(e)return e;}}
          return eat(')')?null:'Expected )';
        default:return'Unknown geometry type: '+kw;
      }
    }
    var err=geom();
    if(err)return err;
    ws();
    return i<str.length?'Unexpected text: "'+str.slice(i,i+20)+'"':null;
  }

  function validate(){
    var v=el.value.trim();
    if(!v){el.classList.remove('is-valid','is-invalid');fb.textContent='';return;}
    var err=parseWKT(v);
    if(err){
      el.classList.add('is-invalid');el.classList.remove('is-valid');
      fb.style.color='#dc3545';fb.textContent=err;
    } else {
      el.classList.add('is-valid');el.classList.remove('is-invalid');
      fb.style.color='#198754';fb.textContent='Valid WKT ✓';
    }
  }
  el.addEventListener('input',validate);
  el.addEventListener('blur',validate);
  if(el.value.trim())validate();
})();
</script>`;
  },
};

const mkType = (name, sqlName) => ({
  name,
  sql_name: sqlName,
  attributes: [],
  read: (v) => v,
  validate: () => (v) => {
    if (!v) return true;
    if (isEWKB(String(v).trim())) return true;
    if (isWKT(String(v).trim())) return true;
    return { error: "Value must be WKT geometry, e.g. POINT(30.06 -1.97)" };
  },
  fieldviews: {
    show: {
      isEdit: false,
      run: (v) => {
        if (!v) return "";
        let s = String(v).trim();
        if (isEWKB(s)) s = ewkbToWKT(s) || "[geometry]";
        return span(
          { class: "font-monospace small" },
          s.length > 60 ? s.slice(0, 60) + "…" : s,
        );
      },
    },
    showMap,
    edit: geometryEditor,
    editText,
  },
});

module.exports = [
  mkType("PostGIS Geometry", "geometry"),
  mkType("PostGIS Geography", "geography"),
];
