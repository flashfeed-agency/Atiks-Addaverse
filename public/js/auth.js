// Authentication Helper
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch (e) {
    return null;
  }
}

async function logoutUser() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
}
