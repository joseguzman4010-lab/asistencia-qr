import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  TextInput, 
  Modal 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    cargarDatosAlumno();
  }, []);

  // Generador de Firma Única por Teléfono Móvil
  const obtenerDeviceIdUnico = async () => {
    try {
      let uniqueId = await SecureStore.getItemAsync('device_unique_hardware_id');
      if (!uniqueId) {
        uniqueId = 'CEL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await SecureStore.setItemAsync('device_unique_hardware_id', uniqueId);
      }
      return uniqueId;
    } catch (e) {
      return 'CEL-GENERICO';
    }
  };

  const cargarDatosAlumno = async () => {
    try {
      const savedCodigo = await SecureStore.getItemAsync('student_codigo');
      const savedNombre = await SecureStore.getItemAsync('student_nombre');
      const savedApellido = await SecureStore.getItemAsync('student_apellido');

      if (savedCodigo && savedNombre) {
        setCodigo(savedCodigo);
        setNombre(savedNombre);
        setApellido(savedApellido || '');
      } else {
        setModalVisible(true);
      }
    } catch (error) {
      console.error('Error al leer SecureStore:', error);
    }
  };

  const guardarDatosAlumno = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      Alert.alert('Atención', 'El código y el primer nombre son obligatorios.');
      return;
    }

    try {
      await SecureStore.setItemAsync('student_codigo', codigo.trim());
      await SecureStore.setItemAsync('student_nombre', nombre.trim());
      await SecureStore.setItemAsync('student_apellido', apellido.trim());
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron guardar los datos.');
    }
  };

  const toggleCamara = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={{ marginTop: 10, color: '#333' }}>Iniciando cámara...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.messageText}>
          Se requiere permiso para usar la cámara en este dispositivo.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Conceder Permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || loading) return;

    if (!codigo || !nombre) {
      Alert.alert('Perfil Incompleto', 'Ingresa tus datos de alumno antes de escanear.', [
        { text: 'Configurar', onPress: () => setModalVisible(true) }
      ]);
      return;
    }

    setScanned(true);

    try {
      const cleanData = data.replace(/[\r\n]+/g, '').trim();
      let parsedData;

      try {
        parsedData = JSON.parse(cleanData);
      } catch (e) {
        Alert.alert('QR Inválido', 'El código escaneado no es válido.', [
          { text: 'Reintentar', onPress: () => setScanned(false) }
        ]);
        return;
      }

      if (!parsedData || !parsedData.serverUrl) {
        Alert.alert('QR Incompleto', 'El QR no contiene la dirección del servidor.', [
          { text: 'Reintentar', onPress: () => setScanned(false) }
        ]);
        return;
      }

      const baseUrl = parsedData.serverUrl.replace(/\/$/, '');
      const endpoint = `${baseUrl}/api/asistencia`;

      const hardwareDeviceId = await obtenerDeviceIdUnico();

      setLoading(true);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claseId: parsedData.claseId || 'REDES-2026B',
          materia: parsedData.materia || 'General',
          codigoAlumno: codigo.trim(),
          primerNombre: nombre.trim(),
          primerApellido: apellido.trim(),
          deviceId: hardwareDeviceId,
          sessionId: parsedData.sessionId || 'CLASE-ACTIVA',
          timestamp: Date.now()
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        Alert.alert(
          '✅ ¡Asistencia Registrada!',
          `${result.message}\n\nMateria: ${parsedData.materia || 'General'}\nAlumno: ${nombre} ${apellido}\nCódigo: ${codigo}`,
          [{ text: 'OK', onPress: () => setScanned(false) }]
        );
      } else {
        Alert.alert('Aviso', result.message || 'No se pudo registrar la asistencia.', [
          { text: 'Reintentar', onPress: () => setScanned(false) }
        ]);
      }

    } catch (error) {
      Alert.alert(
        'Error de Conexión',
        'No se pudo conectar con el servidor. Revisa que tu teléfono esté en el mismo Wi-Fi.',
        [{ text: 'Reintentar', onPress: () => setScanned(false) }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode="picture"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />

      <View style={styles.headerOverlay}>
        <Text style={styles.headerTitle}>Pase de Asistencia CUSUR</Text>
        <Text style={styles.headerSub}>Apunta al QR del Profesor</Text>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.configBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.configBtnText}>
            👤 {nombre && codigo ? `${nombre} ${apellido} (${codigo})` : '⚙️ Configurar Mis Datos'}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={styles.flipBtn} onPress={toggleCamara}>
            <Text style={styles.flipBtnText}>
              🔄 Voltear Cámara ({facing === 'back' ? 'Trasera' : 'Frontal'})
            </Text>
          </TouchableOpacity>

          {scanned && !loading && (
            <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
              <Text style={styles.rescanBtnText}>⚡ Volver a Escanear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Registrando asistencia...</Text>
        </View>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBackground}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Perfil del Alumno</Text>
            <Text style={styles.modalSub}>Los datos se guardan en este dispositivo para futuros pases de lista.</Text>
            
            <Text style={styles.label}>Código (9 dígitos):</Text>
            <TextInput 
              style={styles.input} 
              value={codigo} 
              onChangeText={setCodigo} 
              placeholder="Ej. 222940104"
              keyboardType="numeric" 
            />

            <Text style={styles.label}>Primer Nombre:</Text>
            <TextInput 
              style={styles.input} 
              value={nombre} 
              onChangeText={setNombre} 
              placeholder="Ej. Jose"
            />

            <Text style={styles.label}>Primer Apellido:</Text>
            <TextInput 
              style={styles.input} 
              value={apellido} 
              onChangeText={setApellido} 
              placeholder="Ej. Avalos"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={guardarDatosAlumno}>
              <Text style={styles.saveBtnText}>Guardar y Abrir Cámara</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 24 },
  messageText: { textAlign: 'center', fontSize: 15, color: '#334155', marginBottom: 20, lineHeight: 22 },
  permButton: { backgroundColor: '#1e40af', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  permButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  headerOverlay: { position: 'absolute', top: 50, left: 20, right: 20, backgroundColor: 'rgba(15, 23, 42, 0.85)', padding: 15, borderRadius: 12, alignItems: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  headerSub: { color: '#93c5fd', fontSize: 13, marginTop: 2 },
  bottomBar: { position: 'absolute', bottom: 40, left: 20, right: 20, alignItems: 'center', gap: 12 },
  configBtn: { backgroundColor: 'rgba(255, 255, 255, 0.95)', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 25, elevation: 5 },
  configBtnText: { color: '#1e40af', fontWeight: 'bold', fontSize: 13 },
  flipBtn: { backgroundColor: 'rgba(30, 41, 59, 0.9)', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#475569' },
  flipBtnText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  rescanBtn: { backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20 },
  rescanBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#ffffff', marginTop: 12, fontSize: 16, fontWeight: '600' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 24, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#f8fafc' },
  saveBtn: { backgroundColor: '#16a34a', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 }
});