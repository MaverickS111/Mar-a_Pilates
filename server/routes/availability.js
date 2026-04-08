'use strict';
const { Router } = require('express');
const { getAvailableDays, getDaySlots } = require('../services/googleCalendar');

const router = Router();

// GET /api/availability?month=YYYY-MM
router.get('/availability', async (req, res, next) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Parámetro ?month=YYYY-MM requerido.' });
    }
    const days = await getAvailableDays(month);
    res.json({ month, availableDays: days });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots?date=YYYY-MM-DD
// Devuelve: { date, freeSlots: [...], bookedSlots: [...] }
router.get('/slots', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Parámetro ?date=YYYY-MM-DD requerido.' });
    }
    const { freeSlots, bookedSlots } = await getDaySlots(date);
    res.json({ date, freeSlots, bookedSlots });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
