'use strict';
const { Router } = require('express');
const fs   = require('fs');
const path = require('path');

const WAITLIST_FILE = path.join(__dirname, '..', 'waitlist.json');

// Asegurar que el fichero existe
function loadWaitlist() {
  try {
    return JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveWaitlist(list) {
  fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const router = Router();

// POST /api/waitlist
// Body: { name, email, date, slot }
router.post('/', (req, res) => {
  const { name, email, date, slot } = req.body;

  if (!email || !date || !slot) {
    return res.status(400).json({ error: 'Campos requeridos: email, date, slot.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'El email no parece válido.' });
  }

  const list = loadWaitlist();

  // Evitar duplicados (mismo email + fecha + hora)
  const exists = list.some(e => e.email === email && e.date === date && e.slot === slot);
  if (exists) {
    return res.status(409).json({ error: 'Ya estás en la lista de espera para ese horario.' });
  }

  const entry = {
    id:        Date.now(),
    name:      name || 'Anónimo',
    email,
    date,
    slot,
    createdAt: new Date().toISOString(),
  };

  list.push(entry);
  saveWaitlist(list);

  console.log(`[WAITLIST] Nueva solicitud: ${name} <${email}> — ${date} ${slot}`);
  res.status(201).json({ message: '¡Apuntado! Te avisaremos si el horario queda libre.' });
});

module.exports = router;
