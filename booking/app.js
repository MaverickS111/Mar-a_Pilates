/* ============================================
   Booking App — Frontend Logic
   ============================================ */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────
// En producción apuntará al servidor desplegado en Render, Railway, etc.
// En desarrollo, usa http://localhost:3001
// Cuando se abre como file:// o desde localhost → apunta al server local
const API_BASE = (window.location.protocol === 'file:' ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001/api'
  : '/api';

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  currentMonth: null,   // Date object apuntando al 1º del mes visible
  availableDays: [],    // ['2026-04-15', ...]
  selectedDate: null,   // 'YYYY-MM-DD'
  selectedSlot: null,   // 'HH:MM'
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const calDays       = document.getElementById('calendar-days');
const calMonthLabel = document.getElementById('cal-month-label');
const calPrev       = document.getElementById('cal-prev');
const calNext       = document.getElementById('cal-next');
const slotsContainer    = document.getElementById('slots-container');
const selectedDateDisp  = document.getElementById('selected-date-display');
const summaryDateText   = document.getElementById('summary-date-text');
const summarySlotText   = document.getElementById('summary-slot-text');
const formError         = document.getElementById('form-error');
const formErrorMsg      = document.getElementById('form-error-msg');
const bookingForm       = document.getElementById('booking-form');
const btnSubmit         = document.getElementById('btn-submit');
const successDetailText = document.getElementById('success-detail-text');

const stepPanels = {
  1: document.getElementById('step-1'),
  2: document.getElementById('step-2'),
  3: document.getElementById('step-3'),
  success: document.getElementById('step-success'),
};
const stepIndicators = {
  1: document.getElementById('step-ind-1'),
  2: document.getElementById('step-ind-2'),
  3: document.getElementById('step-ind-3'),
};

// ── Step navigation ───────────────────────────────────────────────────────
function showStep(key) {
  Object.values(stepPanels).forEach(p => p.classList.remove('active'));
  stepPanels[key].classList.add('active');

  // Update indicators
  [1, 2, 3].forEach(n => {
    const ind = stepIndicators[n];
    ind.classList.remove('active', 'done');
    if (key === 'success') {
      ind.classList.add('done');
    } else if (n < key) {
      ind.classList.add('done');
    } else if (n === key) {
      ind.classList.add('active');
    }
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];
const DAY_OFFSET = 1; // week starts Monday (0=Sun → adjust to 1=Mon)

function initMonth() {
  const now = new Date();
  state.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
}

async function loadCalendar() {
  const year  = state.currentMonth.getFullYear();
  const month = String(state.currentMonth.getMonth() + 1).padStart(2, '0');
  const monthStr = `${year}-${month}`;

  calMonthLabel.textContent = `${MONTH_NAMES[state.currentMonth.getMonth()]} ${year}`;
  calDays.innerHTML = `<div class="calendar-loading"><div class="spinner"></div>Cargando…</div>`;

  try {
    const res  = await fetch(`${API_BASE}/availability?month=${monthStr}`);
    const data = await res.json();
    state.availableDays = data.availableDays || [];
  } catch {
    state.availableDays = [];
  }

  renderCalendar();
}

function renderCalendar() {
  const year  = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First day of month, adjusted to Mon=0
  const firstDate = new Date(year, month, 1);
  let startDow = firstDate.getDay();          // 0=Sun
  startDow = (startDow + 6) % 7;             // rotate so Mon=0

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  // Empty cells before 1st
  for (let i = 0; i < startDow; i++) {
    cells.push('<div class="cal-day empty" aria-hidden="true"></div>');
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date     = new Date(year, month, d);
    const dateStr  = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow      = date.getDay(); // 0=Dom, 6=Sáb
    const isWeekend = dow === 0 || dow === 6;
    const isPast   = date < today;
    const isToday  = date.getTime() === today.getTime();
    const isAvail  = !isPast && !isWeekend && state.availableDays.includes(dateStr);
    const isSel    = dateStr === state.selectedDate;

    let cls = 'cal-day';
    if (isToday)        cls += ' today';
    if (isPast)         cls += ' past';
    else if (isSel)     cls += ' selected';
    else if (isWeekend) cls += ' weekend';
    else if (isAvail)   cls += ' available';
    else                cls += ' unavailable';

    const isClickable = isAvail || isSel;
    const clickAttr = isClickable
      ? `role="gridcell" aria-label="${dateStr}" tabindex="0"` : 'aria-hidden="true"';

    cells.push(`<div class="${cls}" data-date="${dateStr}" ${clickAttr}>${d}</div>`);
  }

  calDays.innerHTML = cells.join('');

  // Events
  calDays.querySelectorAll('.cal-day.available, .cal-day.selected').forEach(el => {
    el.addEventListener('click', () => selectDate(el.dataset.date));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDate(el.dataset.date); }
    });
  });
}

async function selectDate(dateStr) {
  state.selectedDate = dateStr;
  renderCalendar(); // re-draw so selected day highlights
  showStep(2);
  await loadSlots(dateStr);
}

// ── Month navigation ──────────────────────────────────────────────────────
calPrev.addEventListener('click', () => {
  const now = new Date();
  const min = new Date(now.getFullYear(), now.getMonth(), 1);
  if (state.currentMonth <= min) return;
  state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
  loadCalendar();
});

calNext.addEventListener('click', () => {
  state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
  loadCalendar();
});

// ── Slots ─────────────────────────────────────────────────────────────────
async function loadSlots(dateStr) {
  // Update date display
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const formatted = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  selectedDateDisp.textContent = formatted;

  slotsContainer.innerHTML = `<div class="calendar-loading"><div class="spinner"></div>Cargando horarios…</div>`;

  try {
    const res   = await fetch(`${API_BASE}/slots?date=${dateStr}`);
    const data  = await res.json();
    renderSlots(data.freeSlots || [], data.bookedSlots || []);
  } catch {
    slotsContainer.innerHTML = `<div class="no-slots">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>No se pudo cargar la disponibilidad. <br/>Inténtalo de nuevo.</p>
    </div>`;
  }
}

function renderSlots(freeSlots, bookedSlots) {
  const total = freeSlots.length + bookedSlots.length;
  if (total === 0) {
    slotsContainer.innerHTML = `<div class="no-slots">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <p>No hay huecos disponibles para este día.<br/>Prueba con otra fecha.</p>
    </div>`;
    return;
  }

  // Merge y ordenar todos los slots
  const allSlots = [
    ...freeSlots.map(s  => ({ time: s, booked: false })),
    ...bookedSlots.map(s => ({ time: s, booked: true  })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const grid = document.createElement('div');
  grid.className = 'slots-grid';

  allSlots.forEach(({ time, booked }) => {
    const btn = document.createElement('button');
    if (booked) {
      btn.className = 'slot-btn slot-booked';
      btn.setAttribute('aria-label', `${time} — ocupado, apuntarse a lista de espera`);
      btn.innerHTML = `
        <svg class="slot-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        ${time}
        <span class="slot-label-small">Ocupado — lista de espera</span>
      `;
      btn.addEventListener('click', () => toggleWaitlistForm(btn, time));
    } else {
      btn.className = 'slot-btn' + (time === state.selectedSlot ? ' selected' : '');
      btn.dataset.slot = time;
      btn.setAttribute('aria-label', `Reservar ${time}`);
      btn.innerHTML = `${time}<span class="slot-label-small">60 min — disponible</span>`;
      btn.addEventListener('click', () => selectSlot(time));
    }
    grid.appendChild(btn);
  });

  slotsContainer.innerHTML = '';
  slotsContainer.appendChild(grid);

  // ── Waitlist panel (se renderiza FUERA del grid) ────────────────────────
  const waitlistPanel = document.createElement('div');
  waitlistPanel.id = 'waitlist-panel';
  waitlistPanel.hidden = true;
  slotsContainer.appendChild(waitlistPanel);
}

// ── Waitlist panel ────────────────────────────────────────────────────────
function toggleWaitlistForm(btn, slot) {
  const panel = document.getElementById('waitlist-panel');
  if (!panel) return;

  // Si ya está abierto para este mismo slot, cerrar
  if (panel.dataset.slot === slot && !panel.hidden) {
    panel.hidden = true;
    panel.dataset.slot = '';
    document.querySelectorAll('.slot-booked-active').forEach(el => el.classList.remove('slot-booked-active'));
    return;
  }

  // Desactivar todos los botones ocupados y marcar el actual
  document.querySelectorAll('.slot-booked-active').forEach(el => el.classList.remove('slot-booked-active'));
  btn.classList.add('slot-booked-active');
  panel.dataset.slot = slot;

  panel.innerHTML = `
    <div class="waitlist-form">
      <button class="wl-close" aria-label="Cerrar lista de espera">×</button>
      <p class="waitlist-form-title">⏰ Avísame si el horario de las <strong>${slot}</strong> queda libre</p>
      <div class="waitlist-fields">
        <input type="text"  class="wl-name"  placeholder="Tu nombre" />
        <input type="email" class="wl-email" placeholder="tu@email.com" required />
        <button class="wl-submit">Avisarme</button>
      </div>
      <p class="waitlist-msg" hidden></p>
    </div>
  `;
  panel.hidden = false;

  const nameInput  = panel.querySelector('.wl-name');
  const emailInput = panel.querySelector('.wl-email');
  const submitBtn  = panel.querySelector('.wl-submit');
  const closeBtn   = panel.querySelector('.wl-close');
  const msg        = panel.querySelector('.waitlist-msg');

  nameInput.focus();

  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
    panel.dataset.slot = '';
    btn.classList.remove('slot-booked-active');
  });

  submitBtn.addEventListener('click', async () => {
    const name  = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (!email) { emailInput.focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    try {
      const res = await fetch(`${API_BASE}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, date: state.selectedDate, slot }),
      });
      const data = await res.json();

      if (res.ok) {
        msg.textContent = '✅ ¡Apuntado! Te avisaremos si queda libre.';
        msg.style.color = 'var(--color-accent)';
        msg.hidden = false;
        nameInput.disabled = true;
        emailInput.disabled = true;
        submitBtn.textContent = '¡Listo!';
      } else {
        msg.textContent = data.error || 'Error al guardar. Inténtalo de nuevo.';
        msg.style.color = '#c0392b';
        msg.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Avisarme';
      }
    } catch {
      msg.textContent = 'No se pudo conectar. Comprueba tu conexión.';
      msg.style.color = '#c0392b';
      msg.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Avisarme';
    }
  });
}

function selectSlot(slot) {
  state.selectedSlot = slot;

  // Highlight
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.toggle('selected', b.dataset.slot === slot));

  // Update form summary
  const [y, m, d] = state.selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const formatted = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  summaryDateText.textContent = formatted;
  summarySlotText.textContent = `🕐 ${slot} — 60 minutos`;

  // Limpiar error anterior al entrar al formulario
  formError.hidden = true;
  formErrorMsg.textContent = '';

  setTimeout(() => showStep(3), 260);
}

// ── Form submission ───────────────────────────────────────────────────────
bookingForm.addEventListener('submit', async e => {
  e.preventDefault();
  formError.hidden = true;

  const name      = document.getElementById('input-name').value.trim();
  const email     = document.getElementById('input-email').value.trim();
  const classType = document.getElementById('input-class-type').value;
  const notes     = document.getElementById('input-notes').value.trim();

  if (!name || !email) {
    showFormError('Por favor, rellena nombre y email.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError('El email no parece válido. Compruébalo.');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Enviando…';

  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, classType, notes,
        date: state.selectedDate,
        slot: state.selectedSlot,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showFormError(data.error || 'Ha ocurrido un error. Inténtalo de nuevo.');
      return;
    }

    // Success!
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formatted = dateObj.toLocaleDateString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    successDetailText.textContent = `📅 ${formatted} · 🕐 ${state.selectedSlot}`;

    showStep('success');
    bookingForm.reset();
  } catch {
    showFormError('No se pudo conectar con el servidor. Comprueba tu conexión.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Confirmar reserva';
  }
});

function showFormError(msg) {
  formErrorMsg.textContent = msg;
  formError.hidden = false;
  formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Back buttons ──────────────────────────────────────────────────────────
document.getElementById('btn-back-step1').addEventListener('click', () => {
  state.selectedDate = null;
  showStep(1);
});
document.getElementById('btn-back-step2').addEventListener('click', () => {
  formError.hidden = true;
  formErrorMsg.textContent = '';
  showStep(2);
});
document.getElementById('btn-back-step2b').addEventListener('click', () => {
  formError.hidden = true;
  formErrorMsg.textContent = '';
  showStep(2);
});
document.getElementById('btn-new-booking').addEventListener('click', () => {
  state.selectedDate = null;
  state.selectedSlot = null;
  formError.hidden = true;
  formErrorMsg.textContent = '';
  showStep(1);
  renderCalendar();
});

// ── Init ──────────────────────────────────────────────────────────────────
initMonth();
loadCalendar();
