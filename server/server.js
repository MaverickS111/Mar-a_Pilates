'use strict';
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const availabilityRouter = require('./routes/availability');
const bookingsRouter     = require('./routes/bookings');
const waitlistRouter     = require('./routes/waitlist');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Seguridad ────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:", "https:"],
      connectSrc:  ["'self'", "https://fgalce.app.n8n.cloud"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Rate limiting: 60 peticiones por IP cada 15 minutos
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Espera un momento.' },
}));

// ── Body parsing ─────────────────────────────────────────────────────────
app.use(express.json());

// ── Rutas ────────────────────────────────────────────────────────────────
app.use('/api', availabilityRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/waitlist', waitlistRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Archivos estáticos (opcional, para acceso desde localhost:3001) ───────
app.use('/booking', express.static(path.join(__dirname, '..', 'booking')));
app.use('/', express.static(path.join(__dirname, '..')));

// ── Manejo global de errores ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Log detallado para debugging
  console.error('[ERROR]', err.message || err);
  if (err.response?.data) {
    console.error('[GOOGLE API ERROR]', JSON.stringify(err.response.data, null, 2));
  }
  if (err.code) console.error('[ERROR CODE]', err.code);

  const status = err.status || err.statusCode || err.response?.status || 500;
  res.status(status).json({
    error: status < 500
      ? err.message
      : 'Error interno del servidor. Inténtalo más tarde.',
  });
});

// ── Arranque ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  María Pilates server escuchando en http://localhost:${PORT}`);
  if (!process.env.GOOGLE_CLIENT_EMAIL) {
    console.warn('⚠️  GOOGLE_CLIENT_EMAIL no definido — configura el .env antes de usar la API de Calendar.');
  }
});

module.exports = app;
