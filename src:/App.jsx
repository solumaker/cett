import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Constantes y Datos ---
const HTML5_QRCODE_SCRIPT_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
const CETT_LOGO_URL = 'https://unportalmasters.com/wb/masters/ca/opcions/masters/universitat/logos_universitats/logo_ub_cett_490x160.png';

// --- Constantes de la API de Ninox ---
const TEAM_ID = "DcuJGPEZxPE8BeETB";
const DATABASE_ID = "y0htong9gpoe";
const API_KEY = "f8de8ea0-511a-11f0-a9ec-93c95c768264";

// IDs de las tablas
const TABLE_ID_AULAS = "C";
const TABLE_ID_ALUMNOS = "A";
const TABLE_ID_HISTORIAL = "E";

// URLs de la API
const NINOS_API_AULAS_URL = `https://api.ninox.com/v1/teams/${TEAM_ID}/databases/${DATABASE_ID}/tables/${TABLE_ID_AULAS}/records`;
const NINOS_API_ALUMNOS_URL = `https://api.ninox.com/v1/teams/${TEAM_ID}/databases/${DATABASE_ID}/tables/${TABLE_ID_ALUMNOS}/records`;
const NINOS_API_HISTORIAL_URL = `https://api.ninox.com/v1/teams/${TEAM_ID}/databases/${DATABASE_ID}/tables/${TABLE_ID_HISTORIAL}/records`;


// --- Componente del Escáner QR ---
const QrScanner = ({ onScanSuccess, onScanError, onCancel }) => {
    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = HTML5_QRCODE_SCRIPT_URL;
        script.async = true;

        script.onload = () => {
            if (!scannerRef.current) return;
            const successCallback = (decodedText) => {
                onScanSuccess(decodedText);
                if (html5QrCodeRef.current?.isScanning) {
                    html5QrCodeRef.current.stop().catch(err => console.error("Fallo al detener el escáner.", err));
                }
            };
            const html5QrCode = new window.Html5Qrcode(scannerRef.current.id);
            html5QrCodeRef.current = html5QrCode;
            html5QrCode.start({ facingMode: "user" }, { fps: 10, qrbox: { width: 250, height: 250 } }, successCallback, undefined)
            .catch(err => onScanError("No se pudo iniciar la cámara. Revisa los permisos."));
        };
        script.onerror = () => onScanError("No se pudo cargar la librería de escaneo.");
        document.body.appendChild(script);

        return () => {
            if (html5QrCodeRef.current?.isScanning) html5QrCodeRef.current.stop().catch(err => {});
            if (script.parentNode) script.parentNode.removeChild(script);
        };
    }, [onScanSuccess, onScanError, onCancel]);

    return (
       <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50 p-4">
            <h2 className="text-white text-2xl font-bold mb-4">Apuntar a la cámara</h2>
            <div id="qr-reader-container" ref={scannerRef} className="w-full max-w-sm sm:max-w-md h-auto rounded-lg overflow-hidden border-4 border-white"></div>
            <button onClick={onCancel} className="mt-6 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">Cancelar</button>
        </div>
    );
};

// --- Pantalla de la Aplicación Principal ---
const MainApp = ({ loggedInAula, loggedInAulaId, onLogout }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [scanType, setScanType] = useState(null);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [students, setStudents] = useState([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const messageTimeoutRef = useRef(null);

    // Cargar alumnos cuando el componente se monta (después del login)
    useEffect(() => {
        const fetchStudents = async () => {
            setIsDataLoading(true);
            try {
                const response = await fetch(NINOS_API_ALUMNOS_URL, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` }
                });
                if (!response.ok) throw new Error("Error al cargar lista de alumnos");
                const data = await response.json();
                setStudents(data.map(student => ({
                    ninoxId: student.id,
                    nombre: student.fields.Alumno,
                    barcodeId: student.fields.ID
                })));
            } catch (error) {
                showMessage('error', `Error cargando alumnos: ${error.message}`);
            } finally {
                setIsDataLoading(false);
            }
        };
        fetchStudents();
    }, []);

    const showMessage = (type, text, duration = 5000) => {
        setMessage({ type, text });
        if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = setTimeout(() => setMessage({ type: '', text: '' }), duration);
    };

    const handleScanStart = (type) => {
        setScanType(type);
        setIsScanning(true);
    };

    const handleScanResult = useCallback(async (scannedId) => {
        if (!scannedId) {
            showMessage('error', 'No se pudo leer el código.');
            return;
        }

        const alumnoEncontrado = students.find(student => student.barcodeId === scannedId);

        if (alumnoEncontrado) {
            const movimientoValue = scanType === 'CHECK-IN' ? 1 : 2;
            const payload = {
                fields: {
                    "Alumno": alumnoEncontrado.ninoxId,
                    "Aula": loggedInAulaId,
                    "Movimiento": movimientoValue
                }
            };

            try {
                const response = await fetch(NINOS_API_HISTORIAL_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify([payload]) // La API de Ninox espera un array
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Error al guardar el registro');
                }

                const formattedScanType = scanType === 'CHECK-IN' ? 'Check-in' : 'Check-out';
                showMessage('success', `${formattedScanType}: ${alumnoEncontrado.nombre}`);

            } catch (error) {
                showMessage('error', `No se pudo registrar: ${error.message}`);
            }

        } else {
            showMessage('error', 'Alumno no encontrado.');
        }
    }, [scanType, students, loggedInAulaId]);

    const onScanSuccess = (decodedText) => {
        setIsScanning(false);
        handleScanResult(decodedText);
    };

    const onScanError = (errorMessage) => {
        setIsScanning(false);
        showMessage('error', errorMessage);
    }

    if (isDataLoading) {
        return <p className="text-xl text-black">Cargando datos de alumnos...</p>;
    }

    return (
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl">
            {isScanning && <QrScanner onScanSuccess={onScanSuccess} onScanError={onScanError} onCancel={() => setIsScanning(false)} />}

            <header className="text-center">
                <img src={CETT_LOGO_URL} alt="Logo CETT" className="h-16 mx-auto mb-4"/>
                <h1 className="text-3xl font-bold text-black">Control de Acceso</h1>
                <p className="text-xl text-gray-800 mt-2">Aula: <span className="font-bold text-black">{loggedInAula}</span></p>
            </header>
            {message.text && (
                 <div className={`fixed top-5 right-5 z-50 p-4 rounded-lg shadow-lg text-white font-bold text-lg ${message.type === 'success' ? 'bg-black' : 'bg-red-600'}`}>
                    {message.text}
                </div>
            )}
            <main className="w-full">
                <div className="grid grid-cols-1 gap-6">
                    <button onClick={() => handleScanStart('CHECK-IN')} className="py-10 text-3xl font-bold rounded-xl shadow-lg transform hover:scale-105 transition-transform bg-[#0cd8ac] text-black">CHECK-IN</button>
                    <button onClick={() => handleScanStart('CHECK-OUT')} className="py-10 text-3xl font-bold rounded-xl shadow-lg transform hover:scale-105 transition-transform bg-red-600 text-white">CHECK-OUT</button>
                </div>
            </main>
            <footer className="mt-6">
                 <button onClick={onLogout} className="bg-transparent hover:bg-gray-100 text-gray-700 font-bold py-3 px-6 rounded-lg border-2 border-gray-300 transition-colors">Cerrar Sesión</button>
            </footer>
        </div>
    );
};

// --- Pantalla de Inicio de Sesión ---
const LoginScreen = ({ onLogin, error, isLoggingIn }) => {
    const [aula, setAula] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onLogin(aula, password);
    };

    return (
        <div className="w-full max-w-sm p-8 space-y-8 bg-white rounded-xl shadow-2xl">
            <img src={CETT_LOGO_URL} alt="Logo CETT" className="h-20 mx-auto"/>
            <h2 className="text-center text-3xl font-bold text-black">Control de Acceso</h2>
            <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="aula" className="text-sm font-bold text-gray-700 block mb-2 text-left">Aula</label>
                    <input type="text" id="aula" value={aula} onChange={(e) => setAula(e.target.value)} required className="w-full p-3 bg-gray-100 rounded-md border border-gray-300 text-black focus:outline-none focus:ring-2 focus:ring-black" disabled={isLoggingIn} />
                </div>
                <div>
                    <label htmlFor="password" className="text-sm font-bold text-gray-700 block mb-2 text-left">Contraseña</label>
                    <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 bg-gray-100 rounded-md border border-gray-300 text-black focus:outline-none focus:ring-2 focus:ring-black" disabled={isLoggingIn} />
                </div>
                {error && <p className="text-red-500 text-center font-bold">{error}</p>}
                <button type="submit" className="w-full py-3 px-4 bg-black hover:bg-gray-800 rounded-md text-white font-bold text-lg transition-colors disabled:opacity-50" disabled={isLoggingIn}>
                    {isLoggingIn ? 'Verificando...' : 'Entrar'}
                </button>
            </form>
        </div>
    );
};

// --- Componente Padre que controla todo ---
export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loggedInAula, setLoggedInAula] = useState('');
    const [loggedInAulaId, setLoggedInAulaId] = useState(null);
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isLoadingApp, setIsLoadingApp] = useState(true);

    // Al cargar la app, revisa si hay una sesión guardada
    useEffect(() => {
        const storedAula = localStorage.getItem('loggedInAula');
        const storedAulaId = localStorage.getItem('loggedInAulaId');

        if (storedAula && storedAulaId) {
            setLoggedInAula(storedAula);
            setLoggedInAulaId(Number(storedAulaId));
            setIsAuthenticated(true);
        }
        setIsLoadingApp(false);
    }, []);

    const handleLogin = async (aula, password) => {
        setIsLoggingIn(true);
        setLoginError('');

        try {
            const response = await fetch(NINOS_API_AULAS_URL, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });

            if (!response.ok) throw new Error(`Error en la API de Ninox: ${response.status}`);
            const usersFromAPI = await response.json();
            if (!Array.isArray(usersFromAPI)) throw new Error("La respuesta de la API no es un array.");

            const inputAula = aula.trim().toLowerCase();
            const inputPassword = password.trim();

            const userFound = usersFromAPI.find(user => {
                const apiAula = user.fields?.Aula ? String(user.fields.Aula).trim().toLowerCase() : '';
                const apiPassword = user.fields?.Contraseña ? String(user.fields.Contraseña).trim() : '';
                return apiAula === inputAula && apiPassword === inputPassword;
            });

            if (userFound) {
                const aulaName = userFound.fields.Aula;
                const aulaId = userFound.id;

                // Guarda la sesión en localStorage
                localStorage.setItem('loggedInAula', aulaName);
                localStorage.setItem('loggedInAulaId', aulaId);

                setLoggedInAula(aulaName);
                setLoggedInAulaId(aulaId);
                setIsAuthenticated(true);
            } else {
                setLoginError('Aula o contraseña incorrectos');
            }

        } catch (error) {
            console.error("Error durante el inicio de sesión:", error);
            setLoginError("No se pudo conectar con el servidor.");
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleLogout = () => {
        // Limpia la sesión de localStorage
        localStorage.removeItem('loggedInAula');
        localStorage.removeItem('loggedInAulaId');

        setIsAuthenticated(false);
        setLoggedInAula('');
        setLoggedInAulaId(null);
    }

    if (isLoadingApp) {
        return <p className="text-xl">Iniciando aplicación...</p>
    }

    return (
         <div className="min-h-screen bg-[#0cd8ac] text-white font-sans p-4 flex flex-col items-center justify-center text-center">
            {isAuthenticated ? (
                <MainApp loggedInAula={loggedInAula} loggedInAulaId={loggedInAulaId} onLogout={handleLogout} />
            ) : (
                <LoginScreen onLogin={handleLogin} error={loginError} isLoggingIn={isLoggingIn} />
            )}
        </div>
    )
}