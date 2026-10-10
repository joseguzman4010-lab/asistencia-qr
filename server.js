const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Almacenamiento en memoria
const tokensRegistrados = new Map();
const registroAsistencias = [];

// Expresiones regulares de validación
const regexCodigo = /^\d{9}$/;
const regexNombre = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

// 1. Generar Token Único Inmutable
app.get('/api/generar-token', (req, res) => {
  const tokenUnico = crypto.randomBytes(4).toString('hex').toUpperCase();
  
  tokensRegistrados.set(tokenUnico, {
    estado: 'ACTIVO',
    creadoEn: new Date()
  });

  res.json({ token: tokenUnico });
});

// 2. Registrar Asistencia con Validaciones y Hora de México
app.post('/api/registrar-asistencia', (req, res) => {
  const { primerNombre, primerApellido, codigoAlumno, token } = req.body;

  // Validación de presencia de campos
  if (!primerNombre || !primerApellido || !codigoAlumno || !token) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const nombreLimpio = primerNombre.trim();
  const apellidoLimpio = primerApellido.trim();
  const codigoLimpio = codigoAlumno.trim();

  // Validar que el código sea de 9 dígitos numéricos
  if (!regexCodigo.test(codigoLimpio)) {
    return res.status(400).json({ error: 'El código de alumno debe ser exclusivamente de 9 dígitos numéricos.' });
  }

  // Validar que nombre y apellido contengan únicamente letras
  if (!regexNombre.test(nombreLimpio)) {
    return res.status(400).json({ error: 'El primer nombre solo puede contener letras (sin números ni símbolos).' });
  }

  if (!regexNombre.test(apellidoLimpio)) {
    return res.status(400).json({ error: 'El primer apellido solo puede contener letras (sin números ni símbolos).' });
  }

  // Verificar si el token existe
  if (!tokensRegistrados.has(token)) {
    return res.status(400).json({ error: 'El token proporcionado no es válido o no existe.' });
  }

  const datosToken = tokensRegistrados.get(token);

  // Verificar si el token ya fue consumido
  if (datosToken.estado !== 'ACTIVO') {
    return res.status(403).json({ error: 'Este token ya fue utilizado y se encuentra bloqueado/sellado.' });
  }

  // Bloquear e inmutabilizar el token
  datosToken.estado = 'CONSUMIDO';
  tokensRegistrados.set(token, datosToken);

  // Formatear la fecha y hora a la Zona Horaria de México (America/Mexico_City)
  const fechaMexico = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  // Crear el registro inmutable de asistencia
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

// 3. Consultar Lista de Asistencias (para el Profesor)
app.get('/api/asistencias', (req, res) => {
  res.json(registroAsistencias);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));