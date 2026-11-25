// ========================================
// FORMULARIOS DE LA PÁGINA (contacto y cobertura)
// Envían los datos al sistema: aparecen en Solicitudes del panel.
// ========================================
(function () {
  const abiertoDesde = Date.now(); // el servidor descarta envíos instantáneos (robots)

  function mostrarEstado(form, mensaje, ok) {
    let caja = form.querySelector('.form-estado');
    if (!caja) {
      caja = document.createElement('div');
      caja.setAttribute('role', 'status');
      form.appendChild(caja);
    }
    caja.className = 'form-estado ' + (ok ? 'form-estado--ok' : 'form-estado--error');
    caja.textContent = mensaje;
  }

  function conectar(form) {
    const boton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      const datos = Object.fromEntries(new FormData(form));
      datos.tipo = form.dataset.tipo;
      datos.tiempo = Date.now() - abiertoDesde;

      const textoOriginal = boton.innerHTML;
      boton.disabled = true;
      boton.textContent = 'Enviando…';

      try {
        const resp = await fetch('/api/publico/solicitud', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos)
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json.error || 'No pudimos enviar tu mensaje. Intenta de nuevo.');

        mostrarEstado(form, form.dataset.tipo === 'cobertura'
          ? '¡Listo! Guardamos tus datos y te avisaremos cuando lleguemos a tu colonia.'
          : '¡Gracias! Recibimos tu mensaje y te contactaremos pronto.', true);
        form.reset();
        boton.textContent = '¡Enviado!';
        setTimeout(() => { boton.innerHTML = textoOriginal; boton.disabled = false; }, 4000);
      } catch (err) {
        const msg = /whatsapp/i.test(err.message) ? err.message : err.message + ' También puedes escribirnos por WhatsApp al 921 150 9583.';
        mostrarEstado(form, msg, false);
        boton.innerHTML = textoOriginal;
        boton.disabled = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('form[data-tipo]').forEach(conectar);

    // contacto.html?plan=vuelo (viene de la página de Planes) deja ese plan seleccionado
    const plan = new URLSearchParams(location.search).get('plan');
    const select = document.getElementById('plan');
    if (plan && select && [...select.options].some(o => o.value === plan)) select.value = plan;
  });
})();
