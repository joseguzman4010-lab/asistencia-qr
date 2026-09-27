const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*']
}));

app.use(express.json());
app.use(express.static('public'));

const PORT = 3000;
const ASISTENCIAS_FILE = path.join(__dirname, 'asistencias.json');
const tokensQR = {};

function obtenerAsistenciasGuardadas() {
    if (!fs.existsSync(ASISTENCIAS_FILE)) return [];
    try {
        const content = fs.readFileSync(ASISTENCIAS_FILE, 'utf8');
        return content ? JSON.parse(content) : [];
    } catch (error) {
        return [];
    }
}

function guardarAsistencia(registro) {
    const lista = obtenerAsistenciasGuardadas();
    lista.push(registro);
    fs.writeFileSync(ASISTENCIAS_FILE, JSON.stringify(lista, null, 2), 'utf8');
}

// 1. Generar QR
app.get('/generar-qr/:codigoEstudiante', async (req, res) => {
    try {
        const { codigoEstudiante } = req.params;
        const tokenUnico = `TOKEN_${codigoEstudiante}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        tokensQR[tokenUnico] = {
            codigoEstudiante: codigoEstudiante,
            creadoEn: new Date(),
            usado: false
        };

        const qrImageBase64 = await QRCode.toDataURL(tokenUnico);

        res.json({
            success: true,
            codigoEstudiante: codigoEstudiante,
            token: tokenUnico,
            qrCode: qrImageBase64
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al generar QR' });
    }
});

// 2. Validar QR
app.post('/validar-qr', (req, res) => {
    const { token } = req.body;

    if (!tokensQR[token]) {
        return res.status(400).json({ 
            valido: false, 
            mensaje: '❌ Código QR inexistente o alterado.' 
        });
    }

    if (tokensQR[token].usado) {
        return res.status(400).json({ 
            valido: false, 
            mensaje: '⚠️ ¡ALERTA! Este código QR ya fue escaneado previamente.' 
        });
    }

    tokensQR[token].usado = true;

    const registroAsistencia = {
        codigoEstudiante: tokensQR[token].codigoEstudiante,
        fechaHora: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
    };

    guardarAsistencia(registroAsistencia);

    res.json({
        valido: true,
        mensaje: `✅ Asistencia registrada: ${registroAsistencia.codigoEstudiante}`,
        registro: registroAsistencia
    });
});

// 3. Obtener Lista de Asistencias (Ruta de la tabla)
app.get('/asistencias', (req, res) => {
    const lista = obtenerAsistenciasGuardadas();
    res.json({ success: true, total: lista.length, asistencias: lista });
});

// 4. Exportar CSV
app.get('/exportar-excel', (req, res) => {
    const lista = obtenerAsistenciasGuardadas();
    let csvContent = "\uFEFFCodigo Estudiante,Fecha y Hora\n";

    lista.forEach(a => {
        const codigo = a.codigoEstudiante || a.alumnoId || 'Sin Código';
        csvContent += `"${codigo}","${a.fechaHora || a.fecha || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Asistencias.csv');
    res.status(200).send(csvContent);
});

app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
});