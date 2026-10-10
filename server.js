const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Profe2026B!';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Almacenamiento en memoria
const tokensRegistrados = new Map();
const registroAsistencias = [];

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

// 1. Generar Token Único Inmutable (PROTEGIDO)
app.get('/api/generar-token', verificarProfesor, (req, res) => {
  const tokenUnico = crypto.randomBytes(4).toString('hex').toUpperCase();
  
  tokensRegistrados.set(tokenUnico, {
    estado: 'ACTIVO',
    creadoEn: new Date()
  });

  res.json({ token: tokenUnico });
});

// 2. Registrar Asistencia (PÚBLICO - Para alumnos)
app.post('/api/registrar-asistencia', (req, res) => {
  const { primerNombre, primerApellido, codigoAlumno, token } = req.body;

  if (!primerNombre || !primerApellido || !codigoAlumno || !token) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const nombreLimpio = primerNombre.trim();
  const apellidoLimpio = primerApellido.trim();
  const codigoLimpio = codigoAlumno.trim();

  if (!regexCodigo.test(codigoLimpio)) {
    return res.status(400).json({ error: 'El código debe ser exactamente de 9 dígitos numéricos.' });
  }

  if (!regexNombre.test(nombreLimpio) || !regexNombre.test(apellidoLimpio)) {
    return res.status(400).json({ error: 'Nombre y apellido solo pueden contener letras.' });
  }

  if (!tokensRegistrados.has(token)) {
    return res.status(400).json({ error: 'El token proporcionado no es válido o no existe.' });
  }

  const datosToken = tokensRegistrados.get(token);

  if (datosToken.estado !== 'ACTIVO') {
    return res.status(403).json({ error: 'Este token ya fue utilizado y se encuentra sellado.' });
  }

  datosToken.estado = 'CONSUMIDO';
  tokensRegistrados.set(token, datosToken);

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
    tokenOrigen: token,
    fecha: fechaMexico
  };

  registroAsistencias.push(comprobante);

  res.json({
    mensaje: '¡Asistencia registrada y sellada con éxito!',
    comprobante
  });
});

// 3. Consultar Lista de Asistencias (PROTEGIDO)
app.get('/api/asistencias', verificarProfesor, (req, res) => {
  res.json(registroAsistencias);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));