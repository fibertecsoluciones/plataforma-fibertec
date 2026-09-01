// Envoltura simple sobre fetch() para hablar con la API de FiberTec.
const API = {
  base: () => window.API_BASE_URL || '',

  token() {
    return localStorage.getItem('ft_token');
  },

  usuario() {
    try { return JSON.parse(localStorage.getItem('ft_usuario') || 'null'); }
    catch (e) { return null; }
  },

  guardarSesion(token, usuario) {
    localStorage.setItem('ft_token', token);
    localStorage.setItem('ft_usuario', JSON.stringify(usuario));
  },

  cerrarSesion() {
    localStorage.removeItem('ft_token');
    localStorage.removeItem('ft_usuario');
    window.location.href = '/index.html';
  },

  // Petición JSON estándar
  async solicitar(ruta, opciones = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opciones.headers || {}
    );
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const resp = await fetch(this.base() + ruta, {
      ...opciones,
      headers,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined
    });

    if (resp.status === 401) {
      this.cerrarSesion();
      throw new Error('Tu sesión expiró, inicia sesión de nuevo.');
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Ocurrió un error inesperado.');
    return data;
  },

  // Petición con archivo (multipart/form-data) — para evidencias y comprobantes
  async solicitarConArchivo(ruta, formData, metodo = 'POST') {
    const headers = {};
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const resp = await fetch(this.base() + ruta, { method: metodo, headers, body: formData });

    if (resp.status === 401) {
      this.cerrarSesion();
      throw new Error('Tu sesión expiró, inicia sesión de nuevo.');
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Ocurrió un error inesperado.');
    return data;
  },

  get(ruta) { return this.solicitar(ruta, { method: 'GET' }); },
  post(ruta, body) { return this.solicitar(ruta, { method: 'POST', body }); },
  put(ruta, body) { return this.solicitar(ruta, { method: 'PUT', body }); },
  del(ruta) { return this.solicitar(ruta, { method: 'DELETE' }); }
};

// Protege una página: si no hay sesión, redirige al login.
// rolesPermitidos: array opcional, ej. ['admin']
function protegerPagina(rolesPermitidos) {
  const token = API.token();
  const usuario = API.usuario();
  if (!token || !usuario) {
    window.location.href = '/index.html';
    return null;
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    alert('No tienes permisos para ver esta sección.');
    window.location.href = '/dashboard.html';
    return null;
  }
  return usuario;
}
