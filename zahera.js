/* Zahera Living · funciones comunes: leer avisos, enviarlos al registro, cálculos y gráficos.
   No depende de ninguna librería. Se expone como window.ZH. */
(function (w) {
  "use strict";
  var CFG = w.ZH_CONFIG || {};
  var TIPOS = ["Pieza", "Apartamento", "Casa"];
  var FUENTES = ["Aviso pegado", "Facebook", "Lo contó un conocido", "Otra"];

  /* ---------- Formato ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pesos(n) { return n == null || isNaN(n) ? "–" : "$" + Math.round(n).toLocaleString("es-CO"); }
  function entero(n) { return n == null || isNaN(n) ? "–" : Math.round(n).toLocaleString("es-CO"); }
  function fechaLarga(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
  function unicos(arr) { return arr.filter(function (v, i, a) { return v != null && a.indexOf(v) === i; }); }
  function media(arr) { return arr.length ? arr.reduce(function (s, x) { return s + x; }, 0) / arr.length : null; }
  function mediana(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* Números aleatorios reproducibles: el mismo conjunto da siempre el mismo rango. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Rango probable (95 %) del promedio por remuestreo. */
  function ic95(arr, seed) {
    if (arr.length < 2) return null;
    var r = rng(seed), B = 4000, n = arr.length, m = [];
    for (var b = 0; b < B; b++) {
      var s = 0;
      for (var i = 0; i < n; i++) s += arr[Math.floor(r() * n)];
      m.push(s / n);
    }
    m.sort(function (x, y) { return x - y; });
    return [m[Math.floor(B * 0.025)], m[Math.floor(B * 0.975)]];
  }

  /* ---------- Carga y envío ---------- */
  function cargar() {
    var base = w.ZH_DATOS_BASE || [];
    if (!CFG.REGISTRO) return Promise.resolve({ datos: base, fuente: "respaldo", motivo: "Falta REGISTRO en config.js." });
    var url = CFG.REGISTRO + (CFG.REGISTRO.indexOf("?") > -1 ? "&" : "?") + "datos=1";
    return fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "El registro no respondió bien.");
        return { datos: j.datos, fuente: "vivo" };
      })
      .catch(function (err) { return { datos: base, fuente: "respaldo", motivo: err.message }; });
  }
  function enviar(accion, payload, clave) {
    if (!CFG.REGISTRO) return Promise.resolve({ ok: false, error: "Falta REGISTRO en config.js." });
    var cuerpo = Object.assign({ accion: accion, clave: clave }, payload || {});
    return fetch(CFG.REGISTRO, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "No hubo respuesta del registro. Revisa la conexión." }; });
  }

  /* ---------- Cálculos ---------- */
  function conPrecio(datos) { return datos.filter(function (r) { return r.canon != null; }); }
  function filtrar(datos, f) {
    return datos.filter(function (r) {
      if (f.tipo && f.tipo !== "Todos" && r.tipo !== f.tipo) return false;
      if (f.barrio && f.barrio !== "Todos" && r.barrio !== f.barrio) return false;
      return true;
    });
  }
  function resumen(datos) {
    var p = conPrecio(datos);
    return {
      total: datos.length, conPrecio: p.length, sinPrecio: datos.length - p.length,
      medianaCanon: mediana(p.map(function (r) { return r.canon; })),
      barrios: unicos(datos.map(function (r) { return r.barrio; })).length
    };
  }
  function porTipo(datos) {
    return TIPOS.map(function (t) {
      var rs = conPrecio(datos).filter(function (r) { return r.tipo === t; });
      var c = rs.map(function (r) { return r.canon; });
      return {
        tipo: t, n: c.length, min: c.length ? Math.min.apply(null, c) : null, max: c.length ? Math.max.apply(null, c) : null,
        media: media(c), mediana: mediana(c), ic: ic95(c, 20261001 + TIPOS.indexOf(t)),
        paraEntrar: mediana(rs.filter(function (r) { return r.paraEntrar != null; }).map(function (r) { return r.paraEntrar; }))
      };
    });
  }
  function porBarrio(datos) {
    return unicos(datos.map(function (r) { return r.barrio; })).sort().map(function (b) {
      var rs = datos.filter(function (r) { return r.barrio === b; });
      var c = conPrecio(rs).map(function (r) { return r.canon; });
      return { barrio: b, total: rs.length, n: c.length, mediana: mediana(c), min: c.length ? Math.min.apply(null, c) : null, max: c.length ? Math.max.apply(null, c) : null };
    });
  }
  function casasPorCuartos(datos) {
    var casas = conPrecio(datos).filter(function (r) { return r.tipo === "Casa"; });
    return unicos(casas.map(function (r) { return r.habitaciones; })).sort().map(function (h) {
      var c = casas.filter(function (r) { return r.habitaciones === h; }).map(function (r) { return r.canon; });
      return { cuartos: h, n: c.length, mediana: mediana(c), min: Math.min.apply(null, c), max: Math.max.apply(null, c) };
    });
  }
  /* Calculadora: avisos con precio que caben en el presupuesto para entrar. */
  function cabenEnPresupuesto(datos, presupuesto) {
    return conPrecio(datos).filter(function (r) { return r.paraEntrar != null && r.paraEntrar <= presupuesto; })
      .sort(function (a, b) { return a.paraEntrar - b.paraEntrar; });
  }

  /* ---------- Gráficos ---------- */
  function svg(W, H, inner, nombre) {
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(nombre) + '">' + inner + "</svg>";
  }
  /* Rango de precios por tipo: barra mín–máx, punto en la mediana. */
  function rangos(filas, nombre) {
    var W = 680, rowH = 78, left = 120, right = 620, top = 26;
    var max = Math.max.apply(null, filas.map(function (f) { return f.max || 0; }).concat([1]));
    var H = top + filas.length * rowH + 30;
    var sx = function (v) { return left + (right - left) * v / max; };
    var out = "";
    for (var t = 0; t <= max; t += 500000) {
      out += '<line x1="' + sx(t) + '" x2="' + sx(t) + '" y1="' + top + '" y2="' + (H - 26) + '" style="stroke:var(--rule)"/>';
      out += '<text class="eje" x="' + sx(t) + '" y="' + (H - 8) + '" text-anchor="middle">' + Math.round(t / 1000) + " mil</text>";
    }
    filas.forEach(function (f, i) {
      if (f.n === 0) return;
      var cy = top + i * rowH + 22;
      out += '<g class="fila-rango"><title>' + esc(f.tipo + ": " + f.n + " avisos con precio, de " + pesos(f.min) + " a " + pesos(f.max) + "; mediana " + pesos(f.mediana)) + "</title>";
      out += '<text x="0" y="' + (cy + 5) + '" style="font-weight:700">' + esc(f.tipo) + "</text>";
      out += '<text class="eje" x="0" y="' + (cy + 22) + '">' + f.n + " avisos</text>";
      out += '<line class="rango" x1="' + sx(f.min) + '" x2="' + sx(f.max) + '" y1="' + cy + '" y2="' + cy + '" style="stroke:var(--sea)"/>';
      out += '<line x1="' + sx(f.min) + '" x2="' + sx(f.min) + '" y1="' + (cy - 9) + '" y2="' + (cy + 9) + '" style="stroke:var(--sea)" stroke-width="3"/>';
      out += '<line x1="' + sx(f.max) + '" x2="' + sx(f.max) + '" y1="' + (cy - 9) + '" y2="' + (cy + 9) + '" style="stroke:var(--sea)" stroke-width="3"/>';
      out += '<circle class="mediana" cx="' + sx(f.mediana) + '" cy="' + cy + '" r="8" style="fill:var(--accent)"/>';
      out += '<text x="' + sx(f.mediana) + '" y="' + (cy - 16) + '" text-anchor="middle" style="font-weight:700">' + pesos(f.mediana) + "</text></g>";
    });
    return svg(W, H, out, nombre);
  }
  function tablaHtml(datos) {
    if (!datos.length) return '<tr><td colspan="8" class="muted">No hay avisos con estos filtros.</td></tr>';
    return datos.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }).map(function (r) {
      return "<tr><td>" + fechaLarga(r.fecha) + "</td><td>" + esc(r.barrio) + "</td><td>" + esc(r.tipo) + '</td><td class="n">' + r.habitaciones +
        '</td><td class="n">' + (r.canon == null ? '<span class="pill">Se pregunta</span>' : pesos(r.canon)) +
        '</td><td class="n">' + (r.meses == null ? "–" : r.meses) + '</td><td class="n">' + pesos(r.paraEntrar) +
        "</td><td>" + esc(r.fuente) + "</td></tr>";
    }).join("");
  }
  function csv(datos) {
    var cab = ["ID", "Fecha", "Barrio", "Tipo", "Habitaciones", "Canon", "Meses de depósito", "Para entrar", "Fuente"];
    var lineas = [cab.join(";")].concat(datos.map(function (r) {
      return [r.id, r.fecha, r.barrio, r.tipo, r.habitaciones, r.canon == null ? "" : r.canon, r.meses == null ? "" : r.meses,
              r.paraEntrar == null ? "" : r.paraEntrar, r.fuente].map(function (c) {
        var s = String(c == null ? "" : c);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(";");
    }));
    return "﻿" + lineas.join("\r\n");
  }
  function descargar(nombre, texto) {
    try {
      var blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) { /* si el navegador bloquea la descarga, la tabla sigue visible */ }
  }

  w.ZH = {
    CFG: CFG, TIPOS: TIPOS, FUENTES: FUENTES,
    esc: esc, pesos: pesos, entero: entero, fechaLarga: fechaLarga, unicos: unicos, media: media, mediana: mediana, ic95: ic95,
    cargar: cargar, enviar: enviar,
    filtrar: filtrar, resumen: resumen, porTipo: porTipo, porBarrio: porBarrio, casasPorCuartos: casasPorCuartos,
    cabenEnPresupuesto: cabenEnPresupuesto,
    rangos: rangos, tablaHtml: tablaHtml, csv: csv, descargar: descargar
  };
})(window);
