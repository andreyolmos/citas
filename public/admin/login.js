const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('adminUser').value;
  const password = document.getElementById('adminPass').value;
  loginMessage.textContent = 'Autenticando...';

  try {
    const response = await fetch('/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (data.success) {
      window.location.href = '/admin';
      return;
    }

    loginMessage.textContent = data.message || 'Error de autenticación';
  } catch (error) {
    loginMessage.textContent = 'Error de conexión';
  }
});