const fechaInput = document.getElementById('fecha');
const horarioSelect = document.getElementById('horario');
const form = document.getElementById('appointmentForm');
const messageElement = document.getElementById('message');
const submitButton = document.getElementById('submitButton');
const calendarGrid = document.getElementById('calendarGrid');
const calendarTitle = document.getElementById('calendarTitle');
const prevMonthButton = document.getElementById('prevMonth');
const nextMonthButton = document.getElementById('nextMonth');
const successModal = document.getElementById('successModal');
const successText = document.getElementById('successText');
const successClose = document.getElementById('successClose');
let successAutoCloseTimer = null;

const horarios = [
  '09:00 - 10:00',
  '10:30 - 11:30',
  '12:00 - 13:00',
  '14:00 - 15:00',
  '15:30 - 16:30',
];

const today = new Date();
today.setHours(0, 0, 0, 0);
let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const availabilityCache = new Map();

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isPastDate(date) {
  return startOfDay(date) < today;
}

function getMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leadDays = (firstDay.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < leadDays; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(new Date(year, month, day));
  }

  return cells;
}

function crearOpciones(horariosDisponibles) {
  horarioSelect.innerHTML = '<option value="">Seleccione un horario</option>';
  horarios.forEach((horario) => {
    const option = document.createElement('option');
    option.value = horario;
    option.textContent = horario;
    if (horariosDisponibles.includes(horario)) {
      option.disabled = true;
      option.textContent = `${horario} — Ocupado`;
    }
    horarioSelect.appendChild(option);
  });
}

function mostrarMensaje(texto, tipo = 'success') {
  messageElement.textContent = texto;
  messageElement.className = `message ${tipo}`;
}

function showSuccessModal(texto) {
  successText.textContent = texto;
  successModal.classList.remove('hidden');
  successModal.classList.add('visible');
  successModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  if (successAutoCloseTimer) {
    clearTimeout(successAutoCloseTimer);
  }

  successAutoCloseTimer = setTimeout(() => {
    hideSuccessModal();
  }, 6000);
}

function hideSuccessModal() {
  if (successAutoCloseTimer) {
    clearTimeout(successAutoCloseTimer);
    successAutoCloseTimer = null;
  }

  successModal.classList.add('hidden');
  successModal.classList.remove('visible');
  successModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

async function obtenerDisponibilidadDia(fecha) {
  const key = formatDateKey(fecha);
  if (availabilityCache.has(key)) {
    return availabilityCache.get(key);
  }

  try {
    const respuesta = await fetch(`/citas/${key}`);
    const datos = await respuesta.json();
    if (datos.success) {
      const ocupados = Array.isArray(datos.ocupados) ? datos.ocupados : [];
      const completos = ocupados.length >= horarios.length;
      const estado = completos ? 'occupied' : 'available';
      const value = { state: estado, ocupados };
      availabilityCache.set(key, value);
      return value;
    }
  } catch (error) {
    console.error('Error al consultar disponibilidad:', error);
  }

  const fallback = { state: 'available', ocupados: [] };
  availabilityCache.set(key, fallback);
  return fallback;
}

function seleccionarFecha(fecha) {
  const key = formatDateKey(fecha);
  fechaInput.value = key;
  const fechaFormateada = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fecha);
  mostrarMensaje(`Fecha seleccionada: ${fechaFormateada}`, 'success');
  obtenerHorarios();
  renderCalendar();
}

async function renderCalendar() {
  calendarTitle.textContent = formatMonthLabel(visibleMonth);
  calendarGrid.innerHTML = '';

  const cells = getMonthDays(visibleMonth);
  const dayStates = await Promise.all(
    cells.map(async (date) => {
      if (!date) {
        return null;
      }

      if (isPastDate(date)) {
        return { date, state: 'past', ocupados: [] };
      }

      return obtenerDisponibilidadDia(date);
    }),
  );

  cells.forEach((date, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day';

    const stateData = dayStates[index];

    if (!date) {
      cell.classList.add('calendar-empty');
      cell.setAttribute('aria-hidden', 'true');
      cell.disabled = true;
      calendarGrid.appendChild(cell);
      return;
    }

    const dayNumber = date.getDate();
    const dateKey = formatDateKey(date);
    cell.dataset.date = dateKey;
    cell.innerHTML = `<span class="day-number">${dayNumber}</span><span class="day-label">${stateData.state === 'past' ? 'Pasado' : stateData.state === 'occupied' ? 'Ocupado' : 'Disponible'}</span>`;

    if (stateData.state === 'past') {
      cell.classList.add('past');
      cell.disabled = true;
    } else if (stateData.state === 'occupied') {
      cell.classList.add('occupied');
      cell.disabled = true;
    } else {
      cell.classList.add('available');
      cell.addEventListener('click', () => seleccionarFecha(date));
    }

    if (fechaInput.value === dateKey) {
      cell.classList.add('selected');
    }

    calendarGrid.appendChild(cell);
  });
}

async function obtenerHorarios() {
  const fecha = fechaInput.value;
  if (!fecha) {
    crearOpciones([]);
    return;
  }

  try {
    const respuesta = await fetch(`/citas/${fecha}`);
    const datos = await respuesta.json();
    if (datos.success) {
      crearOpciones(datos.ocupados);
    } else {
      console.error(datos.message);
      crearOpciones([]);
    }
  } catch (error) {
    console.error('Error al cargar horarios:', error);
    crearOpciones([]);
  }
}

function validarFormulario() {
  const nombre = form.nombre.value.trim();
  const email = form.email.value.trim();
  const telefono = form.telefono.value.trim();
  const fecha = form.fecha.value;
  const horario = form.horario.value;
  
  if (!nombre || !email || !telefono || !fecha || !horario) {
    mostrarMensaje('Por favor completa todos los campos obligatorios.', 'error');
    return false;
  }

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Validación de teléfono más flexible: 7+ dígitos, con o sin espacios, guiones, etc.
  const telefonoLimpio = telefono.replace(/\D/g, '');
  const telefonoValido = /^(?:57)?\d{10}$/.test(telefonoLimpio);

  if (!emailValido) {
    mostrarMensaje('Ingresa un correo electrónico válido.', 'error');
    return false;
  }

  if (!telefonoValido) {
    mostrarMensaje('Ingresa un teléfono válido con al menos 7 dígitos.', 'error');
    return false;
  }

  return true;
}

async function enviarCita(event) {
  event.preventDefault();
  if (!validarFormulario()) {
    return;
  }

  // Validar que se haya seleccionado un horario disponible
  const horarioSeleccionado = form.horario.value;
  if (!horarioSeleccionado) {
    mostrarMensaje('Por favor selecciona un horario disponible.', 'error');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';

  const payload = {
    nombre: form.nombre.value.trim(),
    email: form.email.value.trim(),
    telefono: form.telefono.value.trim(),
    fecha: form.fecha.value,
    horario: form.horario.value,
  };

  try {
    const respuesta = await fetch('/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const datos = await respuesta.json();
    if (datos.success) {
      const successTextValue = `${datos.message}\nFecha: ${datos.cita ? datos.cita.fecha : payload.fecha} — Hora: ${datos.cita ? datos.cita.horario : payload.horario}\nNúmero de reserva: ${datos.cita ? datos.cita.codigo_reserva : (datos.reserva || '')}`;
      mostrarMensaje(successTextValue, 'success');
      showSuccessModal(`Tu cita quedó registrada para ${datos.cita ? datos.cita.fecha : payload.fecha} a las ${datos.cita ? datos.cita.horario : payload.horario}.`);
      // limpiar el formulario automáticamente
      form.reset();
      crearOpciones([]);
      fechaInput.value = '';
      renderCalendar();
    } else {
      mostrarMensaje(datos.message || 'No se pudo agendar la cita. Intenta de nuevo.', 'error');
      console.error('Error al agendar:', datos);
    }
  } catch (error) {
    mostrarMensaje('Error de conexión. Intenta de nuevo más tarde.', 'error');
    console.error('Error de conexión:', error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Reservar cita';
  }
}

fechaInput.addEventListener('change', obtenerHorarios);
prevMonthButton.addEventListener('click', async () => {
  const previous = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  if (previous < new Date(today.getFullYear(), today.getMonth(), 1)) {
    return;
  }
  visibleMonth = previous;
  await renderCalendar();
});

nextMonthButton.addEventListener('click', async () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  await renderCalendar();
});
form.addEventListener('submit', enviarCita);
successClose.addEventListener('click', hideSuccessModal);
successModal.addEventListener('click', (event) => {
  if (event.target === successModal) {
    hideSuccessModal();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !successModal.classList.contains('hidden')) {
    hideSuccessModal();
  }
});

crearOpciones([]);
renderCalendar();
