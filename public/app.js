const fechaInput = document.getElementById('fecha');
const horarioSelect = document.getElementById('horario');
const form = document.getElementById('appointmentForm');
const messageElement = document.getElementById('message');
const submitButton = document.getElementById('submitButton');

const horarios = [
  '09:00 - 10:00',
  '10:30 - 11:30',
  '12:00 - 13:00',
  '14:00 - 15:00',
  '15:30 - 16:30',
];

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
      mostrarMensaje(`${datos.message}\nFecha: ${datos.cita ? datos.cita.fecha : payload.fecha} — Hora: ${datos.cita ? datos.cita.horario : payload.horario}\nNúmero de reserva: ${datos.cita ? datos.cita.codigo_reserva : (datos.reserva || '')}`, 'success');
      // limpiar el formulario automáticamente
      form.reset();
      crearOpciones([]);
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
form.addEventListener('submit', enviarCita);

crearOpciones([]);
