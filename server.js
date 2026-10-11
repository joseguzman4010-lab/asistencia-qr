const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Profe2026B!';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Almacenamiento en memoria
const registroAsistencias = [];
const pasesConsumidos = new Set(); // Para evitar relectura del mismo QR dentro de sus 5s

// Expresiones regulares de validación
const regexCodigo = /^\d{9}$/;
const regexNombre = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

// Middleware de autenticación para el profesor
const verificarProfesor = (req, res, next) => {
  const claveEnviada = req.headers['x-admin-password'];
  if (claveEnviada === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Acceso no autorizado. Contraseña incorrecta.' });
  }
};

// 1. Endpoint para que el Profesor Escanee el QR del Alumno (PROTEGIDO)
app.post('/api/registrar-por-profesor', verificarProfesor, (req, res) => {
  const { primerNombre, primerApellido, codigoAlumno, deviceId, timestamp, nonce } = req.body;

  if (!primerNombre || !primerApellido || !codigoAlumno || !timestamp || !nonce) {
    return res.status(400).json({ error: 'El código QR escaneado no contiene el formato válido.' });
  }

  // 1. Validar ventana de tiempo del QR (Máximo 7 segundos para contemplar latencia de red)
  const ahora = Date.now();
  const diferenciaTiempo = ahora - parseInt(timestamp, 10);

  if (isNaN(diferenciaTiempo) || diferenciaTiempo > 7000 || diferenciaTiempo < -2000) {
    return res.status(400).json({ error: '⏱️ Pase expirado. El QR dura únicamente 5 segundos. Pídele al alumno que regenere su código.' });
  }

  // 2. Prevenir reutilización de un mismo pase generado
  if (pasesConsumidos.has(nonce)) {
    return res.status(400).json({ error: '⚠️ Este Pase QR ya fue escaneado y consumido previamente.' });
  }

  const nombreLimpio = primerNombre.trim();
  const apellidoLimpio = primerApellido.trim();
  const codigoLimpio = codigoAlumno.trim();
  const deviceIdLimpio = deviceId ? deviceId.trim() : 'DESCONOCIDO';

  if (!regexCodigo.test(codigoLimpio)) {
    return res.status(400).json({ error: 'El código debe ser exactamente de 9 dígitos numéricos.' });
  }

  if (!regexNombre.test(nombreLimpio) || !regexNombre.test(apellidoLimpio)) {
    return res.status(400).json({ error: 'Nombre y apellido solo pueden contener letras.' });
  }

  // 3. Verificar si el alumno ya registró asistencia en esta sesión
  const yaRegistrado = registroAsistencias.find(r => r.codigoAlumno === codigoLimpio);
  if (yaRegistrado) {
    return res.status(400).json({ error: `El alumno con código ${codigoLimpio} ya tiene asistencia registrada.` });
  }

  // Bloquear el pase utilizado
  pasesConsumidos.add(nonce);

  // 4. Detección de Multicuenta (Mismo celular usado para otro código)
  const registroDuplicado = registroAsistencias.find(
    r => r.deviceId === deviceIdLimpio && r.codigoAlumno !== codigoLimpio
  );
  const esSospechoso = Boolean(registroDuplicado);

  const fechaMexico = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  const comprobante = {
    folio: `REG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    primerNombre: nombreLimpio,
    primerApellido: apellidoLimpio,
    codigoAlumno: codigoLimpio,
    deviceId: deviceIdLimpio,
    sospechoso: esSospechoso,
    fecha: fechaMexico
  };

  registroAsistencias.push(comprobante);

  res.json({
    mensaje: `Asistencia registrada para ${nombreLimpio} ${apellidoLimpio}`,
    comprobante
  });
});

// 2. Consultar Lista de Asistencias (PROTEGIDO)
app.get('/api/asistencias', verificarProfesor, (req, res) => {
  res.json(registroAsistencias);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));