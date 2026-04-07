'use strict';
const { google } = require('googleapis');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ── Config ────────────────────────────────────────────────────────────────
const CALENDAR_ID    = process.env.GOOGLE_CALENDAR_ID;
const CLIENT_EMAIL   = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SLOT_DURATION  = parseInt(process.env.SLOT_DURATION || '60', 10); // minutos
const SLOT_START_H   = parseInt((process.env.SLOT_START || '09:00').split(':')[0], 10);
const SLOT_START_M   = parseInt((process.env.SLOT_START || '09:00').split(':')[1] || '0', 10);
const SLOT_END_H     = parseInt((process.env.SLOT_END   || '20:00').split(':')[0], 10);
const SLOT_END_M     = parseInt((process.env.SLOT_END   || '20:00').split(':')[1] || '0', 10);
const WORKING_DAYS   = (process.env.WORKING_DAYS || '1,2,3,4,5,6')
  .split(',').map(d => parseInt(d.trim(), 10));

// ── Auth ──────────────────────────────────────────────────────────────────
function getCalendarClient() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
    throw new Error(
      'Faltan variables de entorno: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY o GOOGLE_CALENDAR_ID'
    );
  }
  const auth = new google.auth.JWT(
    CLIENT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Genera todas las franjas del día según la config de horario.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @returns {Array<{start: Date, end: Date, label: string}>}
 */
function generateSlots(dateStr) {
  const slots = [];
  const base = new Date(`${dateStr}T00:00:00`);

  let cursor = new Date(base);
  cursor.setHours(SLOT_START_H, SLOT_START_M, 0, 0);

  const endLimit = new Date(base);
  endLimit.setHours(SLOT_END_H, SLOT_END_M, 0, 0);

  while (cursor < endLimit) {
    const slotEnd = new Date(cursor.getTime() + SLOT_DURATION * 60_000);
    if (slotEnd > endLimit) break;

    const pad = n => String(n).padStart(2, '0');
    slots.push({
      start: new Date(cursor),
      end:   new Date(slotEnd),
      label: `${pad(cursor.getHours())}:${pad(cursor.getMinutes())}`,
    });
    cursor = slotEnd;
  }
  return slots;
}

/**
 * Devuelve los eventos de Google Calendar en un rango de tiempo.
 * @param {Date} timeMin
 * @param {Date} timeMax
 */
async function getEvents(timeMin, timeMax) {
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

/**
 * Devuelve qué días del mes tienen al menos una franja libre.
 * @param {string} month  'YYYY-MM'
 * @returns {string[]}  Array de 'YYYY-MM-DD' con disponibilidad
 */
async function getAvailableDays(month) {
  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay  = new Date(year, mon, 1); // primer día del mes siguiente

  // Todos los eventos del mes
  const events = await getEvents(firstDay, lastDay);

  const availableDays = [];

  let cursor = new Date(firstDay);
  while (cursor < lastDay) {
    const dayOfWeek = cursor.getDay();

    if (WORKING_DAYS.includes(dayOfWeek)) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const slots   = generateSlots(dateStr);

      const bookedSlots = events.filter(ev => {
        const evStart = new Date(ev.start.dateTime || ev.start.date);
        const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
        // evento que cae en este día
        return evStart.toISOString().slice(0, 10) === dateStr ||
               evEnd.toISOString().slice(0, 10)   === dateStr;
      });

      // Al menos un slot libre → día disponible
      const hasAvailable = slots.some(slot => {
        return !bookedSlots.some(ev => {
          const evStart = new Date(ev.start.dateTime || ev.start.date);
          const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
          // solapamiento
          return slot.start < evEnd && slot.end > evStart;
        });
      });

      if (hasAvailable) availableDays.push(dateStr);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return availableDays;
}

/**
 * Devuelve las franjas libres de un día concreto.
 * @param {string} dateStr  'YYYY-MM-DD'
 * @returns {string[]}  Labels de franjas libres, ej: ['09:00', '10:00', ...]
 */
async function getFreeSlots(dateStr) {
  const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
  if (!WORKING_DAYS.includes(dayOfWeek)) return [];

  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd   = new Date(`${dateStr}T23:59:59`);

  const events = await getEvents(dayStart, dayEnd);
  const slots  = generateSlots(dateStr);

  return slots
    .filter(slot => !events.some(ev => {
      const evStart = new Date(ev.start.dateTime || ev.start.date);
      const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
      return slot.start < evEnd && slot.end > evStart;
    }))
    .map(s => s.label);
}

/**
 * Crea un evento en Google Calendar para la reserva.
 * Primero verifica que no haya solapamiento (race condition check).
 * @param {object} data  { name, email, classType, date, slot }
 * @returns {object}  Evento creado (id, htmlLink)
 */
async function createBooking(data) {
  const { name, email, classType, date, slot } = data;
  const [hour, min] = slot.split(':').map(Number);

  const startDate = new Date(`${date}T00:00:00`);
  startDate.setHours(hour, min, 0, 0);
  const endDate = new Date(startDate.getTime() + SLOT_DURATION * 60_000);

  // Verificación anti race-condition
  const existing = await getEvents(startDate, endDate);
  if (existing.length > 0) {
    const err = new Error('El horario seleccionado ya no está disponible.');
    err.status = 409;
    throw err;
  }

  const calendar = getCalendarClient();
  const event = {
    summary: `Clase Pilates — ${name}`,
    description: [
      `Tipo: ${classType || 'No especificado'}`,
      `Email alumno: ${email}`,
      `Notas: ${data.notes || '—'}`,
      `Reservado desde web`,
    ].join('\n'),
    start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Madrid' },
    end:   { dateTime: endDate.toISOString(),   timeZone: 'Europe/Madrid' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
  return { id: res.data.id, link: res.data.htmlLink };
}

module.exports = { getAvailableDays, getFreeSlots, createBooking };
