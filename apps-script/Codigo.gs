/* ============================================================
   Zahera Living · Registro de avisos (Google Apps Script)
   Cambia CLAVE por una clave que solo conozca el equipo.
   Después de cada cambio: Implementar > Administrar implementaciones > Versión nueva.
   No guardes teléfonos ni datos de contacto de quienes publican avisos.
   ============================================================ */
var CLAVE = "cambia-esta-clave";
var HOJA = "Avisos";
var ZONA = "America/Bogota";
var TIPOS = ["Pieza", "Apartamento", "Casa"];
var FUENTES = ["Aviso pegado", "Facebook", "Lo contó un conocido", "Otra"];
var CABECERA = ["ID", "Fecha", "Barrio", "Tipo", "Habitaciones", "Canon", "Meses de depósito", "Para entrar", "Fuente", "Precio escrito", "Creado"];

/* Lectura pública: ?datos=1 devuelve los avisos. */
function doGet(e) {
  var q = (e && e.parameter) || {};
  if (q.datos) {
    try {
      return salida({ ok: true, datos: leerDatos() });
    } catch (err) {
      return salida({ ok: false, error: "No pude leer la hoja " + HOJA + ": " + err.message });
    }
  }
  return salida({ ok: true, mensaje: "Registro de Zahera Living activo." });
}

/* Escritura: el cuerpo llega como texto JSON con la clave del equipo. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var p = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (String(p.clave || "") !== CLAVE) return salida({ ok: false, error: "Clave incorrecta." });
    var accion = String(p.accion || "registrar");
    if (accion === "verificar") return salida({ ok: true, mensaje: "Clave correcta." });
    if (accion === "listar") return salida({ ok: true, datos: leerDatos(true) });
    if (accion === "registrar") return salida(registrar(p));
    if (accion === "actualizar") return salida(actualizar(p));
    if (accion === "borrar") return salida(borrar(p));
    return salida({ ok: false, error: "Acción no reconocida: " + accion });
  } catch (err) {
    return salida({ ok: false, error: "Error en el servidor: " + err.message });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJA);
  if (!h) {
    h = ss.insertSheet(HOJA);
    h.getRange(1, 1, 1, CABECERA.length).setValues([CABECERA]).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  return h;
}

function texto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, "yyyy-MM-dd");
  return String(v == null ? "" : v).trim();
}

function numero(v) {
  var t = texto(v);
  if (t === "") return null;
  var n = Number(t);
  return isNaN(n) ? null : n;
}

function leerDatos(conNombres) {
  var h = hoja();
  var ultima = h.getLastRow();
  if (ultima < 2) return [];
  var filas = h.getRange(2, 1, ultima - 1, CABECERA.length).getValues();
  return filas.filter(function (f) { return texto(f[0]) !== ""; }).map(function (f) {
    return {
      id: texto(f[0]), fecha: texto(f[1]), barrio: texto(f[2]), tipo: texto(f[3]),
      habitaciones: numero(f[4]), canon: numero(f[5]), meses: numero(f[6]), paraEntrar: numero(f[7]),
      fuente: texto(f[8]), precioEscrito: texto(f[9]) === "Sí"
    };
  });
}

function validar(p) {
  var fecha = texto(p.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "La fecha debe tener formato AAAA-MM-DD.";
  if (isNaN(new Date(fecha + "T12:00:00").getTime())) return "La fecha no existe en el calendario.";
  var barrio = texto(p.barrio);
  if (!barrio || barrio.length > 40) return "Escribe el barrio (máximo 40 letras).";
  if (TIPOS.indexOf(texto(p.tipo)) < 0) return "El tipo debe ser: " + TIPOS.join(", ") + ".";
  var hab = Number(p.habitaciones);
  if (!(hab >= 1 && hab <= 6) || Math.floor(hab) !== hab) return "Las habitaciones deben ser un número entero entre 1 y 6.";
  var canon = p.canon === "" || p.canon == null ? null : Number(p.canon);
  if (canon !== null && (isNaN(canon) || canon < 50000 || canon > 20000000 || Math.floor(canon) !== canon)) {
    return "El canon debe ser un número entero entre 50.000 y 20.000.000, o quedar vacío si no está en el aviso.";
  }
  var meses = p.meses === "" || p.meses == null ? null : Number(p.meses);
  if (meses !== null && (isNaN(meses) || meses < 0 || meses > 6 || Math.floor(meses) !== meses)) {
    return "Los meses de depósito deben ser un número entero entre 0 y 6.";
  }
  if (canon !== null && meses === null) return "Si hay canon, escribe también los meses de depósito (0 si no piden).";
  if (FUENTES.indexOf(texto(p.fuente)) < 0) return "La fuente debe ser: " + FUENTES.join(", ") + ".";
  return "";
}

function filaDesde(p, id) {
  var canon = p.canon === "" || p.canon == null ? "" : Number(p.canon);
  var meses = p.meses === "" || p.meses == null ? "" : Number(p.meses);
  var entrar = canon === "" || meses === "" ? "" : canon * (1 + meses);
  return [id, texto(p.fecha), texto(p.barrio), texto(p.tipo), Number(p.habitaciones), canon, meses, entrar,
          texto(p.fuente), canon === "" ? "No" : "Sí",
          Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd HH:mm")];
}

function siguienteId(h) {
  var ultima = h.getLastRow(), max = 0;
  if (ultima >= 2) {
    h.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (f) {
      var n = parseInt(texto(f[0]).replace(/\D/g, ""), 10);
      if (n > max) max = n;
    });
  }
  return "A" + ("00" + (max + 1)).slice(-2);
}

function registrar(p) {
  var err = validar(p);
  if (err) return { ok: false, error: err };
  var h = hoja();
  var id = siguienteId(h);
  h.appendRow(filaDesde(p, id));
  return { ok: true, id: id, mensaje: "Aviso guardado." };
}

function actualizar(p) {
  var err = validar(p);
  if (err) return { ok: false, error: err };
  var h = hoja();
  var id = texto(p.id);
  var ultima = h.getLastRow();
  var fila = 0;
  if (ultima >= 2) {
    var ids = h.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (texto(ids[i][0]) === id) { fila = i + 2; break; }
  }
  if (!fila) return { ok: false, error: "No encuentro el aviso " + id + "." };
  var anterior = h.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
  var nueva = filaDesde(p, id);
  nueva[10] = texto(anterior[10]);
  h.getRange(fila, 1, 1, CABECERA.length).setValues([nueva]);
  return { ok: true, id: id, mensaje: "Aviso actualizado." };
}

function borrar(p) {
  var h = hoja();
  var id = texto(p.id);
  var ultima = h.getLastRow();
  if (ultima >= 2) {
    var ids = h.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (texto(ids[i][0]) === id) { h.deleteRow(i + 2); return { ok: true, mensaje: "Aviso borrado." }; }
    }
  }
  return { ok: false, error: "No encuentro el aviso " + id + "." };
}
