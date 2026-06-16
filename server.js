const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.VERCEL_PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'citas.sqlite');
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@citasapp.com';

if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('No se pudo conectar a la base de datos:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      fecha TEXT NOT NULL,
      horario TEXT NOT NULL,
      codigo_reserva TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa',
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS horarios_bloqueados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      horario TEXT,
      motivo TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.all(`PRAGMA table_info(citas)`, [], (err, columns) => {
    if (err) {
      console.error('Error comprobando esquema de citas:', err.message);
      return;
    }
    const hasEstado = columns.some((col) => col.name === 'estado');
    if (!hasEstado) {
      db.run(`ALTER TABLE citas ADD COLUMN estado TEXT NOT NULL DEFAULT 'activa'`, (alterErr) => {
        if (alterErr) {
          console.error('No se pudo agregar la columna estado a citas:', alterErr.message);
        } else {
          console.log('Columna estado añadida a la tabla citas.');
        }
      });
    }
    const hasCodigoReserva = columns.some((col) => col.name === 'codigo_reserva');
    if (!hasCodigoReserva) {
      db.run(`ALTER TABLE citas ADD COLUMN codigo_reserva TEXT NOT NULL DEFAULT ''`, (alterErr) => {
        if (alterErr) {
          console.error('No se pudo agregar la columna codigo_reserva a citas:', alterErr.message);
        } else {
          console.log('Columna codigo_reserva añadida a la tabla citas.');
        }
      });
    }
  });
});

// Crear usuario admin inicial si no existe
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
db.get('SELECT id FROM usuarios WHERE username = ?', [ADMIN_USER], (err, row) => {
  if (err) return console.error('Error comprobando admin:', err.message);
  if (!row) {
    bcrypt.hash(ADMIN_PASS, 10).then((hash) => {
      db.run('INSERT INTO usuarios (username, password, created_at) VALUES (?, ?, datetime("now"))', [ADMIN_USER, hash]);
      console.log('Usuario admin creado con usuario:', ADMIN_USER);
    });
  }
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify().then(() => {
  console.log('SMTP configurado correctamente.');
}).catch((error) => {
  console.warn('Advertencia: no se pudo verificar SMTP:', error.message);
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
  secret: process.env.SESSION_SECRET || 'citas_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 8 },
}));

app.use(express.static(path.join(__dirname, 'public')));

let axios = null;
let twilioPkg = null;
try { axios = require('axios'); } catch (e) { console.warn('axios no disponible — WhatsApp via Meta no funcionará.'); }
try { twilioPkg = require('twilio'); } catch (e) { console.warn('twilio no disponible — WhatsApp via Twilio no funcionará.'); }

async function sendWhatsAppViaTwilio(phone, text) {
  if (!twilioPkg) throw new Error('Twilio SDK no instalado en el servidor');
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+1415xxxxxxx'
  if (!sid || !token || !from) throw new Error('Twilio no configurado (revisar variables de entorno)');
  const client = twilioPkg(sid, token);
  return client.messages.create({ body: text, from, to: `whatsapp:${phone}` });
}

async function sendWhatsAppViaMeta(phone, text) {
  if (!axios) throw new Error('axios no disponible en el servidor');
  const token = process.env.WA_META_TOKEN; // Bearer token
  const phoneId = process.env.WA_META_PHONE_ID; // WhatsApp Business Phone ID
  if (!token || !phoneId) throw new Error('WhatsApp Cloud API no configurada (revisar variables de entorno)');
  const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
  return axios.post(url, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: { body: text }
  }, { headers: { Authorization: `Bearer ${token}` } });
}

async function sendWhatsApp(phone, text) {
  const provider = process.env.WA_PROVIDER || 'twilio';
  const phoneDigits = phone.replace(/\D/g, '');
  if (!phoneDigits) throw new Error('Teléfono no válido');
  if (provider === 'meta') {
    return sendWhatsAppViaMeta(phoneDigits, text);
  }
  return sendWhatsAppViaTwilio(phoneDigits, text);
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarTelefono(telefono) {
  const cleaned = telefono.replace(/\D/g, '');
  // Formato Colombia: 10 dígitos locales o 12 dígitos con prefijo 57
  return /^(?:57)?\d{10}$/.test(cleaned);
}

function generarCodigoReserva() {
  return 'CR-' + Math.random().toString(36).slice(2, 9).toUpperCase();
}

function enviarCorreoConfirmacion({ nombre, email, telefono, fecha, horario, codigo_reserva }) {
  const mensajeHtml = `
    <h2>Confirmación de cita</h2>
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Tu cita ha sido registrada correctamente.</p>
    <ul>
      <li><strong>Fecha:</strong> ${fecha}</li>
      <li><strong>Horario:</strong> ${horario}</li>
      <li><strong>Número de reserva:</strong> ${codigo_reserva}</li>
      <li><strong>Teléfono:</strong> ${telefono}</li>
    </ul>
    <p>Si necesitas cancelar o cambiar la hora, responde a este correo.</p>
    <p>Gracias por agendar con nosotros.</p>
    <p><em>${SITE_URL}</em></p>
  `;

  return transporter.sendMail({
    from: FROM_EMAIL,
    to: email,
    subject: 'Confirmación de tu cita',
    html: mensajeHtml,
  });
}

// Middleware de autenticación para rutas admin
function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.username) return next();
  return res.status(401).json({ success: false, message: 'No autorizado' });
}

function ensureAdminPage(req, res, next) {
  if (req.session && req.session.user && req.session.user.username) return next();
  return res.redirect('/admin/login');
}

// API para login admin
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Usuario y contraseña son obligatorios' });

  db.get('SELECT * FROM usuarios WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ success: false, message: 'Error de servidor' });
    if (!user) return res.status(401).json({ success: false, message: 'Credenciales inválidas' });

    bcrypt.compare(password, user.password).then((ok) => {
      if (!ok) return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      req.session.user = { id: user.id, username: user.username };
      return res.json({ success: true, message: 'Autenticado' });
    });
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.user && req.session.user.username) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

// Endpoints principales
app.post('/agendar', (req, res) => {
  const { nombre, email, telefono, fecha, horario } = req.body;

  if (!nombre || !email || !telefono || !fecha || !horario) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

  if (!validarEmail(email)) {
    return res.status(400).json({ success: false, message: 'El correo electrónico no es válido.' });
  }

  if (!validarTelefono(telefono)) {
    return res.status(400).json({ success: false, message: 'El teléfono debe contener solo números y opcionalmente el prefijo internacional.' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ success: false, message: 'La fecha debe tener el formato AAAA-MM-DD.' });
  }

  // revisar bloqueos
  const bloqueoQuery = 'SELECT COUNT(*) AS total FROM horarios_bloqueados WHERE (fecha = ? OR fecha IS NULL) AND (horario = ? OR horario IS NULL)';
  db.get(bloqueoQuery, [fecha, horario], (err, bloqueRow) => {
    if (err) {
      console.error('Error en bloqueoQuery:', err);
      return res.status(500).json({ success: false, message: 'Error de base de datos' });
    }
    if (!bloqueRow) {
      console.error('bloqueRow es null/undefined');
      return res.status(500).json({ success: false, message: 'Error de base de datos' });
    }
    if (bloqueRow.total > 0) return res.status(403).json({ success: false, message: 'El horario está bloqueado.' });

    const availabilityQuery = 'SELECT COUNT(*) AS total FROM citas WHERE fecha = ? AND horario = ? AND estado = "activa"';
    db.get(availabilityQuery, [fecha, horario], (err2, row) => {
      if (err2) {
        console.error('Error en availabilityQuery:', err2);
        return res.status(500).json({ success: false, message: 'Error de base de datos.' });
      }

      if (!row) {
        console.error('row es null/undefined en availabilityQuery');
        return res.status(500).json({ success: false, message: 'Error de base de datos.' });
      }

      if (row.total > 0) {
        return res.status(409).json({ success: false, message: 'Ese horario ya está ocupado. Elige otro.' });
      }

      const codigo = generarCodigoReserva();
      const insertQuery = 'INSERT INTO citas (nombre, email, telefono, fecha, horario, codigo_reserva, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))';
      db.run(insertQuery, [nombre.trim(), email.trim(), telefono.trim(), fecha, horario, codigo], function (insertErr) {
        if (insertErr) {
          return res.status(500).json({ success: false, message: 'No se pudo guardar la cita.' });
        }

        const nuevaCita = { id: this.lastID, nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim(), fecha, horario, codigo_reserva: codigo };

        res.json({
          success: true,
          message: 'Su cita ha sido agendada correctamente. La confirmación por correo se enviará en breve.',
          cita: nuevaCita,
        });

        void enviarCorreoConfirmacion(nuevaCita)
          .then(() => {
            console.log('Correo de confirmación enviado para cita:', nuevaCita.id);
          })
          .catch((mailErr) => {
            console.error('Error enviando correo:', (mailErr && mailErr.message) || mailErr);
          });
      });
    });
  });
});

app.get('/citas/:fecha', (req, res) => {
  const { fecha } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ success: false, message: 'Formato de fecha inválido.' });
  }

  const query = 'SELECT horario FROM citas WHERE fecha = ? AND estado = "activa" ORDER BY horario';
  db.all(query, [fecha], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al consultar los horarios.' });
    }

    const horariosOcupados = rows.map((row) => row.horario);
    return res.json({ success: true, fecha, ocupados: horariosOcupados });
  });
});

// Admin APIs
app.get('/admin/stats', ensureAdmin, (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) AS total FROM citas', [], (err, row) => {
    stats.total = row ? row.total : 0;
    db.get("SELECT COUNT(*) AS hoy FROM citas WHERE fecha = date('now')", [], (err2, row2) => {
      stats.hoy = row2 ? row2.hoy : 0;
      db.get("SELECT COUNT(*) AS proximas FROM citas WHERE fecha > date('now')", [], (err3, row3) => {
        stats.proximas = row3 ? row3.proximas : 0;
        db.get("SELECT COUNT(*) AS canceladas FROM citas WHERE estado = 'cancelada'", [], (err4, row4) => {
          stats.canceladas = row4 ? row4.canceladas : 0;
          res.json({ success: true, stats });
        });
      });
    });
  });
});

app.get('/admin/citas', ensureAdmin, (req, res) => {
  const { q, fecha, email } = req.query;
  const conditions = [];
  const params = [];
  let base = 'SELECT * FROM citas';
  if (q) {
    conditions.push('(nombre LIKE ? OR email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (fecha) {
    conditions.push('fecha = ?');
    params.push(fecha);
  }
  if (email) {
    conditions.push('email = ?');
    params.push(email);
  }
  if (conditions.length) base += ' WHERE ' + conditions.join(' AND ');
  base += ' ORDER BY fecha DESC, horario';
  db.all(base, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Error al listar citas' });
    res.json({ success: true, citas: rows });
  });
});

app.post('/admin/citas/:id/cancelar', ensureAdmin, (req, res) => {
  const { id } = req.params;
  db.run('UPDATE citas SET estado = "cancelada" WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ success: false, message: 'Error al cancelar' });
    res.json({ success: true });
  });
});

app.post('/admin/citas/:id/eliminar', ensureAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM citas WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ success: false, message: 'Error al eliminar' });
    res.json({ success: true });
  });
});

app.post('/admin/citas/:id/editar', ensureAdmin, (req, res) => {
  const { id } = req.params;
  const { nombre, email, telefono, fecha, horario } = req.body;
  db.run('UPDATE citas SET nombre = ?, email = ?, telefono = ?, fecha = ?, horario = ? WHERE id = ?', [nombre, email, telefono, fecha, horario, id], function (err) {
    if (err) return res.status(500).json({ success: false, message: 'Error al editar' });
    res.json({ success: true });
  });
});

// Bloqueo de horarios
app.post('/admin/bloquear', ensureAdmin, (req, res) => {
  const { fecha, horario, motivo } = req.body; // fecha puede ser null para bloqueo global del horario
  db.run('INSERT INTO horarios_bloqueados (fecha, horario, motivo, created_at) VALUES (?, ?, ?, datetime("now"))', [fecha || null, horario || null, motivo || null], function (err) {
    if (err) return res.status(500).json({ success: false, message: 'Error al bloquear' });
    res.json({ success: true });
  });
});

app.post('/admin/desbloquear/:id', ensureAdmin, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM horarios_bloqueados WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ success: false, message: 'Error al desbloquear' });
    res.json({ success: true });
  });
});

app.get('/admin/horarios_bloqueados', ensureAdmin, (req, res) => {
  db.all('SELECT * FROM horarios_bloqueados ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Error al listar bloqueos' });
    res.json({ success: true, bloqueos: rows });
  });
});


// Admin frontend files
app.get('/admin', (req, res) => {
  return ensureAdminPage(req, res, () => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
