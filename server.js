const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_ASISTENCIAS = path.join(__dirname, 'asistencias.json');
const DB_CLASES = path.join(__dirname, 'clases.json');
const DB_ALUMNOS = path.join(__dirname, 'alumnos.json');

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helpers JSON
function cargarJSON(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`Error leyendo ${filePath}:`, error);
  }
  return defaultVal;
}

function guardarJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error guardando ${filePath}:`, error);
  }
}

let asistenciasProcesadas = cargarJSON(DB_ASISTENCIAS);
let clasesRegistradas = cargarJSON(DB_CLASES, [
  { id: 'REDES-2026B', nombre: 'Seguridad Acceso Redes Públicas', clave: '2026B' }
]);
let padronAlumnos = cargarJSON(DB_ALUMNOS, [
  { codigo: '222940104', nombre: 'Jose', apellido: 'Avalos', claseId: 'REDES-2026B' }
]);

// ------------------------------------------------------------------
// FUNCIÓN INTELIGENTE DE EXTRACCIÓN SIIAU
// ------------------------------------------------------------------
function procesarTextoSIIAU(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const regexCodigo9 = /\b\d{9}\b/;
  const alumnosEncontrados = [];

  lineas.forEach(linea => {
    const match = linea.match(regexCodigo9);
    if (match) {
      const codigo = match[0];
      let textoLimpio = linea
        .replace(codigo, '')
        .replace(/\b(ITEL|INCO|INBI|ICIV|TELE|IG206|K01)\b/g, '')
        .replace(/^\d+\s*\|\s*/, '')
        .replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ\s]/g, '')
        .trim();

      if (textoLimpio.length > 3) {
        const partes = textoLimpio.split(/\s+/);
        let apellidoStr = '', nombreStr = '';
        if (partes.length === 2) {
          apellidoStr = partes[0];
          nombreStr = partes[1];
        } else {
          apellidoStr = partes.slice(0, 2).join(' ');
          nombreStr = partes.slice(2).join(' ') || partes[partes.length - 1];
        }
        alumnosEncontrados.push({ codigo, nombre: nombreStr, apellido: apellidoStr });
      }
    }
  });

  if (alumnosEncontrados.length > 0) return alumnosEncontrados;

  const codigos = [];
  lineas.forEach(linea => {
    const match = linea.match(regexCodigo9);
    if (match) codigos.push(match[0]);
  });

  const palabrasReservadas = [
    'CICLO', 'MATERIA', 'PROFESOR', 'CENTRO', 'UNIVERSITARIO', 'REGISTRO',
    'ASISTENCIA', 'ALUMNOS', 'UNIVERSIDAD', 'GUADALAJARA', 'MODULO', 'AULA',
    'DIAS', 'MES', 'NRC', 'CLAVE', 'SECC', 'ITEL', 'INCO', 'ICIV', 'INBI',
    'TELE', 'INICIAL', 'FINAL', 'HORA', 'SOLICITUD', 'FECHA', 'FEC', 'HR'
  ];

  const nombres = [];
  lineas.forEach(linea => {
    if (/\d/.test(linea) || /[:\/\.\-]/.test(linea)) return;
    const lineaMayus = linea.toUpperCase();
    if (palabrasReservadas.some(word => lineaMayus.includes(word))) return;

    const partes = linea.trim().split(/\s+/);
    if (partes.length >= 2 && partes.every(p => /^[a-zA-ZÁÉÍÓÚÑáéíóúñ]+$/.test(p))) {
      nombres.push(linea.trim());
    }
  });

  const limite = Math.min(codigos.length, nombres.length);
  for (let i = 0; i < limite; i++) {
    const partes = nombres[i].split(/\s+/);
    let apellidoStr = '', nombreStr = '';
    if (partes.length === 2) {
      apellidoStr = partes[0];
      nombreStr = partes[1];
    } else {
      apellidoStr = partes.slice(0, 2).join(' ');
      nombreStr = partes.slice(2).join(' ');
    }

    alumnosEncontrados.push({
      codigo: codigos[i],
      nombre: nombreStr,
      apellido: apellidoStr
    });
  }

  return alumnosEncontrados;
}

// ------------------------------------------------------------------
// NAVEGACIÓN Y ARCHIVOS ESTÁTICOS
// ------------------------------------------------------------------
app.get('/profesor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profesor.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------------
// RUTAS DE CLASES
// ------------------------------------------------------------------
app.get('/api/clases', (req, res) => res.json(clasesRegistradas));

app.post('/api/clases', (req, res) => {
  const { nombre, clave } = req.body;
  if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido.' });

  const idClase = `${clave || 'MAT'}-${Date.now()}`;
  const nuevaClase = { id: idClase, nombre, clave: clave || '2026B' };
  clasesRegistradas.push(nuevaClase);
  guardarJSON(DB_CLASES, clasesRegistradas);

  res.json({ success: true, clase: nuevaClase });
});

// ------------------------------------------------------------------
// RUTAS DEL PADRÓN DE ALUMNOS E IMPORTACIÓN
// ------------------------------------------------------------------
app.get('/api/alumnos', (req, res) => {
  const { claseId } = req.query;
  if (claseId) return res.json(padronAlumnos.filter(a => a.claseId === claseId));
  res.json(padronAlumnos);
});

app.post('/api/alumnos', (req, res) => {
  const { codigo, nombre, apellido, claseId } = req.body;
  if (!codigo || !nombre || !claseId) {
    return res.status(400).json({ success: false, message: 'Código, Nombre y Clase son obligatorios.' });
  }

  const yaInscrito = padronAlumnos.some(a => a.codigo === codigo && a.claseId === claseId);
  if (yaInscrito) {
    return res.status(400).json({ success: false, message: 'El alumno ya está inscrito en esta materia.' });
  }

  const nuevoAlumno = { codigo: codigo.trim(), nombre: nombre.trim(), apellido: (apellido || '').trim(), claseId };
  padronAlumnos.push(nuevoAlumno);
  guardarJSON(DB_ALUMNOS, padronAlumnos);

  res.json({ success: true, message: 'Alumno inscrito en el padrón.', alumno: nuevoAlumno });
});

app.delete('/api/alumnos', (req, res) => {
  const { claseId } = req.query;
  if (claseId) {
    padronAlumnos = padronAlumnos.filter(a => a.claseId !== claseId);
  } else {
    padronAlumnos = [];
  }
  guardarJSON(DB_ALUMNOS, padronAlumnos);
  res.json({ success: true, message: 'Padrón de alumnos borrado con éxito.' });
});

app.get('/api/plantilla-alumnos', (req, res) => {
  const contenidoCSV = 'codigo,nombre,apellido\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=Plantilla_Alumnos_CUSUR.csv');
  res.status(200).send('\uFEFF' + contenidoCSV);
});

app.post('/api/alumnos/importar', (req, res) => {
  const { claseId, alumnos } = req.body;
  if (!claseId || !Array.isArray(alumnos)) {
    return res.status(400).json({ success: false, message: 'Datos de importación inválidos.' });
  }

  let agregados = 0;
  alumnos.forEach(alumno => {
    if (alumno.codigo && alumno.nombre) {
      const codStr = alumno.codigo.toString().trim();
      const existe = padronAlumnos.some(a => a.codigo === codStr && a.claseId === claseId);
      if (!existe) {
        padronAlumnos.push({
          codigo: codStr,
          nombre: alumno.nombre.trim(),
          apellido: (alumno.apellido || '').trim(),
          claseId: claseId
        });
        agregados++;
      }
    }
  });

  guardarJSON(DB_ALUMNOS, padronAlumnos);
  res.json({ success: true, message: `¡Éxito! Se inscribieron ${agregados} alumnos a la materia.` });
});

app.post('/api/alumnos/importar-texto', (req, res) => {
  const { claseId, texto } = req.body;
  if (!claseId || !texto) {
    return res.status(400).json({ success: false, message: 'Selecciona una clase y proporciona el texto.' });
  }

  const alumnosExtraidos = procesarTextoSIIAU(texto);
  let agregados = 0;

  alumnosExtraidos.forEach(alumno => {
    const existe = padronAlumnos.some(a => a.codigo === alumno.codigo && a.claseId === claseId);
    if (!existe) {
      padronAlumnos.push({
        codigo: alumno.codigo,
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        claseId: claseId
      });
      agregados++;
    }
  });

  guardarJSON(DB_ALUMNOS, padronAlumnos);
  res.json({
    success: true,
    message: `¡Procesado con éxito! Se detectaron ${alumnosExtraidos.length} alumnos y se registraron ${agregados} nuevos a la clase.`
  });
});

// ------------------------------------------------------------------
// RUTAS DE ASISTENCIA Y EXPORTACIÓN A EXCEL
// ------------------------------------------------------------------
app.get('/api/asistencia', (req, res) => {
  const { claseId } = req.query;
  if (claseId) {
    return res.json(asistenciasProcesadas.filter(a => a.claseId === claseId));
  }
  res.json(asistenciasProcesadas);
});

// VACIAR REGISTRO COMPLETO DE ASISTENCIAS DE UNA MATERIA
app.delete('/api/asistencia/vaciar', (req, res) => {
  const { claseId } = req.query;
  if (claseId) {
    asistenciasProcesadas = asistenciasProcesadas.filter(a => a.claseId !== claseId);
  } else {
    asistenciasProcesadas = [];
  }
  guardarJSON(DB_ASISTENCIAS, asistenciasProcesadas);
  res.json({ success: true, message: 'Tabla de asistencias limpiada con éxito.' });
});

// EXPORTAR TABLA DE ASISTENCIAS A EXCEL (CSV)
app.get('/api/asistencia/exportar', (req, res) => {
  const { claseId } = req.query;
  if (!claseId) return res.status(400).send('ID de materia requerido.');

  const registros = asistenciasProcesadas.filter(a => a.claseId === claseId);
  const claseInfo = clasesRegistradas.find(c => c.id === claseId);

  let csv = 'Folio,Codigo,Nombre,Apellido,Fecha_Hora,Estado_Dispositivo,Estado\n';
  registros.forEach(r => {
    const nom = (r.nombre || '').replace(/,/g, '');
    const ape = (r.apellido || '').replace(/,/g, '');
    const dev = (r.estadoDispositivo || '').replace(/,/g, '');
    csv += `"${r.folio}","${r.codigo}","${nom}","${ape}","${r.fechaHora}","${dev}","${r.estado}"\n`;
  });

  const nombreClaseLimpio = claseInfo ? claseInfo.nombre.replace(/[^a-zA-Z0-9]/g, '_') : 'Materia';
  const filename = `Reporte_Asistencias_${nombreClaseLimpio}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.status(200).send('\uFEFF' + csv);
});

app.post('/api/asistencia', (req, res) => {
  const { codigoAlumno, primerNombre, primerApellido, deviceId, sessionId, claseId, materia } = req.body;

  if (!codigoAlumno || !primerNombre) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios.' });
  }

  const targetClaseId = claseId || 'REDES-2026B';
  const targetDeviceId = deviceId || 'CEL-DESCONOCIDO';

  const estaEnPadron = padronAlumnos.some(a => a.codigo === codigoAlumno && a.claseId === targetClaseId);
  if (!estaEnPadron) {
    padronAlumnos.push({
      codigo: codigoAlumno,
      nombre: primerNombre,
      apellido: primerApellido || '',
      claseId: targetClaseId
    });
    guardarJSON(DB_ALUMNOS, padronAlumnos);
  }

  const yaExisteAlumno = asistenciasProcesadas.some(
    a => a.codigo === codigoAlumno && a.claseId === targetClaseId
  );

  if (yaExisteAlumno) {
    return res.status(200).json({
      success: true,
      message: 'Tu asistencia ya estaba registrada previamente en esta clase.'
    });
  }

  const registroOtroAlumnoMismoCel = asistenciasProcesadas.find(
    a => a.claseId === targetClaseId && a.rawDeviceId === targetDeviceId && a.codigo !== codigoAlumno
  );

  let estadoDispositivoVal = '✅ Válido';
  let estadoVal = 'PRESENTE';

  if (registroOtroAlumnoMismoCel) {
    estadoDispositivoVal = '⚠️ Sospechoso (Mismo Celular)';
    estadoVal = 'FALTA';
  }

  const fechaHoraCDMX = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  const folioRandom = 'REG-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  const nuevoRegistro = {
    folio: folioRandom,
    claseId: targetClaseId,
    materia: materia || 'Materia General',
    nombre: primerNombre,
    apellido: primerApellido || '',
    codigo: codigoAlumno,
    fechaHora: fechaHoraCDMX,
    rawDeviceId: targetDeviceId,
    estadoDispositivo: estadoDispositivoVal,
    estado: estadoVal,
    sessionId: sessionId || 'CLASE-ACTIVA'
  };

  asistenciasProcesadas.push(nuevoRegistro);
  guardarJSON(DB_ASISTENCIAS, asistenciasProcesadas);

  return res.status(200).json({
    success: true,
    message: estadoDispositivoVal.includes('Sospechoso') 
      ? '⚠️ Advertencia: Dispositivo ya utilizado previamente por otro alumno.'
      : '¡Asistencia registrada con éxito!',
    folio: folioRandom
  });
});

app.post('/api/asistencia/cerrar-lista', (req, res) => {
  const { claseId } = req.body;
  if (!claseId) return res.status(400).json({ success: false, message: 'ID de materia requerido.' });

  const alumnosMateria = padronAlumnos.filter(a => a.claseId === claseId);
  const asistieronCodigos = new Set(
    asistenciasProcesadas.filter(a => a.claseId === claseId).map(a => a.codigo)
  );

  const fechaHoraCDMX = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  let faltasGeneradas = 0;

  alumnosMateria.forEach(alumno => {
    if (!asistieronCodigos.has(alumno.codigo)) {
      const folioRandom = 'REG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      asistenciasProcesadas.push({
        folio: folioRandom,
        claseId: claseId,
        materia: 'Materia Activa',
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        codigo: alumno.codigo,
        fechaHora: fechaHoraCDMX,
        rawDeviceId: 'SIN-DISPOSITIVO',
        estadoDispositivo: 'Sin Registro (Inasistencia)',
        estado: 'FALTA',
        sessionId: 'CIERRE-SESION'
      });
      asistieronCodigos.add(alumno.codigo);
      faltasGeneradas++;
    }
  });

  guardarJSON(DB_ASISTENCIAS, asistenciasProcesadas);

  res.json({
    success: true,
    message: `Cierre completado. Se marcaron ${faltasGeneradas} falta(s) a los alumnos ausentes.`,
    faltasGeneradas
  });
});

app.put('/api/asistencia/:folio', (req, res) => {
  const folioParam = req.params.folio;
  const { estado } = req.body;

  const registro = asistenciasProcesadas.find(a => a.folio === folioParam);
  if (!registro) return res.status(404).json({ success: false, message: 'Registro no encontrado.' });

  if (estado) registro.estado = estado;
  guardarJSON(DB_ASISTENCIAS, asistenciasProcesadas);

  res.json({ success: true, message: `Folio ${folioParam} actualizado a ${estado}.` });
});

app.delete('/api/asistencia/:folio', (req, res) => {
  const folioParam = String(req.params.folio);

  asistenciasProcesadas = asistenciasProcesadas.filter(
    a => String(a.folio) !== folioParam && String(a.id) !== folioParam
  );

  guardarJSON(DB_ASISTENCIAS, asistenciasProcesadas);
  res.json({ success: true, message: `Folio ${folioParam} eliminado.` });
});

// SERVIDOR EN ESCUCHA
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Servidor CUSUR listo en puerto ${PORT}`);
});