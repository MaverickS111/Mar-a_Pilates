'use strict';
const { Router } = require('express');
const { createBooking } = require('../services/googleCalendar');

// Mutex en memoria para evitar condiciones de carrera simultáneas
const pendingSlots = new Set();

const router = Router();

// POST /api/bookings
router.post('/', async (req, res, next) => {
  const { name, email, classType, date, slot } = req.body;

  // Validación básica
  if (!name || !email || !date || !slot) {
    return res.status(400).json({
      error: 'Campos requeridos: name, email, date, slot.',
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Formato de fecha inválido (YYYY-MM-DD).' });
  }
  if (!/^\d{2}:\d{2}$/.test(slot)) {
    return res.status(400).json({ error: 'Formato de hora inválido (HH:MM).' });
  }

  const lockKey = `${date}:${slot}`;

  // Mutex
  if (pendingSlots.has(lockKey)) {
    return res.status(409).json({
      error: 'Otro usuario está reservando ese mismo horario. Inténtalo en unos segundos.',
    });
  }
  pendingSlots.add(lockKey);

  try {
    const result = await createBooking({ name, email, classType, date, slot });
    res.status(201).json({
      message: '¡Reserva confirmada!',
      eventId: result.id,
      eventLink: result.link,
      date,
      slot,
      name,
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  } finally {
    pendingSlots.delete(lockKey);
  }
});

module.exports = router;
