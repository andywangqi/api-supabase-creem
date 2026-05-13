const loginForm = document.querySelector('#loginForm');
const adminKeyInput = document.querySelector('#adminKey');
const loginStatus = document.querySelector('#loginStatus');

async function readResponsePayload(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  return {
    error: {
      message: text || 'Login failed'
    }
  };
}

function setLoginStatus(message, isError = false) {
  loginStatus.textContent = message;
  loginStatus.classList.toggle('error', isError);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setLoginStatus('Signing in...');

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adminKey: adminKeyInput.value })
    });
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Login failed');
    }

    window.location.href = '/admin';
  } catch (error) {
    setLoginStatus(error.message, true);
  }
});
