const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Almacenamiento en memoria para tokens y asistencias
const tokensRegistrados = new Map();
const registroAsistencias = [];

// 1. Generar Token Único Inmutable para el Profesor
app.get('/api/generar-token', (req, res) => {
  const tokenUnico = crypto.randomBytes(4).toString('hex').toUpperCase(); // Ej: "A8F3D1E9"
  
  tokensRegistrados.set(tokenUnico, {
    estado: 'ACTIVO',
    creadoEn: new Date()
  });

  res.json({ token: tokenUnico });
});

// 2. Registrar Asistencia del Alumno
app.post('/api/registrar-asistencia', (req, res) => {
  const { primerNombre, primerApellido, codigoAlumno, token } = req.body;

  if (!primerNombre || !primerApellido || !codigoAlumno || !token) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  // Verificar existencia del token
  if (!tokensRegistrados.has(token)) {
    return res.status(400).json({ error: 'El token proporcionado no es válido o no existe.' });
  }

  const datosToken = tokensRegistrados.get(token);

  // Verificar si ya fue consumido
  if (datosToken.estado !== 'ACTIVO') {
    return res.status(403).json({ error: 'Este token ya fue utilizado y se encuentra bloqueado/sellado.' });
  }

  // Bloquear e inmutabilizar el token
  datosToken.estado = 'CONSUMIDO';
  tokensRegistrados.set(token, datosToken);

  // Guardar el registro de asistencia
  const comprobante = {
    folio: `REG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    primerNombre,
    primerApellido,
    codigoAlumno,
    tokenOrigen: token,
    fecha: new Date().toLocaleString()
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