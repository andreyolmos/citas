const loginView = document.getElementById('loginView');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const dashboardView = document.getElementById('dashboardView');
const citasView = document.getElementById('citasView');
const calendarView = document.getElementById('calendarView');
const blocksView = document.getElementById('blocksView');

const navDashboard = document.getElementById('nav-dashboard');
const navCitas = document.getElementById('nav-citas');
const navCalendar = document.getElementById('nav-calendar');
const navBlocks = document.getElementById('nav-blocks');
const navLogout = document.getElementById('nav-logout');

const statTotal = document.getElementById('statTotal');
const statHoy = document.getElementById('statHoy');
const statProx = document.getElementById('statProx');
const statCancel = document.getElementById('statCancel');

const searchQ = document.getElementById('searchQ');
const searchFecha = document.getElementById('searchFecha');
const searchBtn = document.getElementById('searchBtn');
const citasTableBody = document.querySelector('#citasTable tbody');

const calendarGrid = document.getElementById('calendarGrid');
const blockForm = document.getElementById('blockForm');
const blocksList = document.getElementById('blocksList');

function showView(view) {
  loginView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  citasView.classList.add('hidden');
  calendarView.classList.add('hidden');
  blocksView.classList.add('hidden');
  view.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = document.getElementById('adminUser').value;
  const pass = document.getElementById('adminPass').value;
  loginMessage.textContent = 'Autenticando...';
  try {
    const res = await fetch('/admin/login', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: user, password: pass }) });
    const data = await res.json();
    if (data.success) {
      loginMessage.textContent = 'Bienvenido';
      initDashboard();
      showView(dashboardView);
    } else {
      loginMessage.textContent = data.message || 'Error';
    }
  } catch (err) {
    loginMessage.textContent = 'Error de conexión';
  }
});

navDashboard.addEventListener('click', () => { initDashboard(); showView(dashboardView); });
navCitas.addEventListener('click', () => { loadCitas(); showView(citasView); });
navCalendar.addEventListener('click', () => { loadCalendar(); showView(calendarView); });
navBlocks.addEventListener('click', () => { loadBlocks(); showView(blocksView); });
navLogout.addEventListener('click', async () => { await fetch('/admin/logout',{method:'POST'}); location.reload();});

async function initDashboard(){
  const res = await fetch('/admin/stats', { credentials: 'same-origin' });
  const data = await res.json();
  if (data.success) {
    statTotal.textContent = data.stats.total;
    statHoy.textContent = data.stats.hoy;
    statProx.textContent = data.stats.proximas || 0;
    statCancel.textContent = data.stats.canceladas || 0;
  }
}

searchBtn.addEventListener('click', () => loadCitas());

async function loadCitas(){
  let url = '/admin/citas?';
  const q = searchQ.value.trim();
  const fecha = searchFecha.value;
  if (q) url += 'q=' + encodeURIComponent(q) + '&';
  if (fecha) url += 'fecha=' + encodeURIComponent(fecha) + '&';
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json();
  citasTableBody.innerHTML = '';
  if (data.success) {
    data.citas.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${c.codigo_reserva || c.reserva || ''}</td><td>${c.nombre}</td><td>${c.email}</td><td>${c.telefono}</td><td>${c.fecha}</td><td>${c.horario}</td><td>${c.estado || c.status || 'activa'}</td><td><button data-id="${c.id}" class="cancelBtn">Cancelar</button> <button data-id="${c.id}" class="deleteBtn">Eliminar</button> <button data-phone="${c.telefono || ''}" data-name="${c.nombre}" data-fecha="${c.fecha}" data-horario="${c.horario}" data-reserva="${c.codigo_reserva || c.reserva || ''}" class="waBtn">WhatsApp</button></td>`;
      citasTableBody.appendChild(tr);
    });
    document.querySelectorAll('.cancelBtn').forEach(b=>b.addEventListener('click', async (e)=>{
      const id = e.target.dataset.id; await fetch(`/admin/citas/${id}/cancelar`,{method:'POST', credentials: 'same-origin'}); loadCitas();
    }));
    document.querySelectorAll('.deleteBtn').forEach(b=>b.addEventListener('click', async (e)=>{
      const id = e.target.dataset.id; if(confirm('Eliminar esta cita?')){ await fetch(`/admin/citas/${id}/eliminar`,{method:'POST', credentials: 'same-origin'}); loadCitas(); }
    }));
    // WhatsApp reminder button
    document.querySelectorAll('.waBtn').forEach(b=>b.addEventListener('click', async (e)=>{
      const btn = e.currentTarget;
      const phoneRaw = btn.dataset.phone || '';
      const phone = phoneRaw.replace(/\D/g,'');
      if (!phone) return alert('Teléfono no válido para WhatsApp');
      const name = btn.dataset.name || '';
      const fecha = btn.dataset.fecha || '';
      const horario = btn.dataset.horario || '';
      const reserva = btn.dataset.reserva || '';
      const text = `Hola ${name}, le recordamos su cita el ${fecha} a las ${horario}. Código de reserva: ${reserva}. Por favor responda si necesita modificarla.`;
      try {
        const res = await fetch('/admin/wa/send', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone, text }) });
        const data = await res.json();
        if (data.success) alert('Recordatorio enviado vía ' + (data.provider || 'API'));
        else alert('Error: ' + (data.message || 'No se pudo enviar'));
      } catch (err) {
        alert('Error de conexión al enviar recordatorio');
      }
    }));
  }
}

async function loadCalendar(){
  calendarGrid.innerHTML = '';
  const now = new Date();
  const month = now.toISOString().slice(0,7);
  const res = await fetch(`/admin/calendar?month=${month}`, { credentials: 'same-origin' });
  const data = await res.json();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  for(let d=1; d<=daysInMonth; d++){
    const day = `${month}-${String(d).padStart(2,'0')}`;
    const obj = data.data[day];
    const div = document.createElement('div');
    div.className = 'calendar-day';
    if(!obj) div.classList.add('calendar-day');
    else if(obj.citas >= 5) div.classList.add('full');
    else if(obj.citas > 0) div.classList.add('partial');
    else div.classList.add('empty');
    div.innerHTML = `<strong>${d}</strong><div>${obj ? (obj.citas||0) + ' citas' : '0'}</div>`;
    div.addEventListener('click', ()=> showDayDetails(day));
    calendarGrid.appendChild(div);
  }
}

async function showDayDetails(day){
  const res = await fetch('/admin/citas?fecha=' + day, { credentials: 'same-origin' });
  const data = await res.json();
  let html = `<h4>Citas ${day}</h4>`;
  data.citas.forEach(c=>{ html += `<div class="block-item">${c.horario} - ${c.nombre} (${c.email})</div>`; });
  alert(html);
}

blockForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fecha = document.getElementById('blockFecha').value;
  const horario = document.getElementById('blockHorario').value;
  const motivo = document.getElementById('blockMotivo').value;
  await fetch('/admin/bloquear',{method:'POST',credentials: 'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({fecha,horario,motivo})});
  loadBlocks();
});

async function loadBlocks(){
  const res = await fetch('/admin/horarios_bloqueados', { credentials: 'same-origin' });
  const data = await res.json();
  blocksList.innerHTML = '';
  if (data.success) {
    data.bloqueos.forEach(b=>{
      const div = document.createElement('div');
      div.className = 'block-item';
      div.innerHTML = `${b.fecha || 'Global'} ${b.horario || ''} <button data-id="${b.id}">Desbloquear</button>`;
      blocksList.appendChild(div);
    });
    blocksList.querySelectorAll('button').forEach(btn=>btn.addEventListener('click', async (e)=>{ const id=e.target.dataset.id; await fetch('/admin/desbloquear/'+id,{method:'POST', credentials: 'same-origin'}); loadBlocks(); }));
  }
}

// Start at login view
showView(loginView);
