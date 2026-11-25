// Formularios que arman el mensaje y abren WhatsApp con el texto listo (sin guardar nada en el servidor)
(function () {
  var NUMERO = '529211509583';

  document.querySelectorAll('form[data-wa]').forEach(function (form) {
    var estado = form.querySelector('.form-estado');
    if (!estado) {
      estado = document.createElement('p');
      estado.className = 'form-estado';
      estado.setAttribute('role', 'status');
      estado.hidden = true;
      form.appendChild(estado);
    }

    function aviso(tipo, texto) {
      estado.hidden = false;
      estado.className = 'form-estado form-estado--' + tipo;
      estado.textContent = texto;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var falta = null;
      var lineas = [form.getAttribute('data-wa')];

      form.querySelectorAll('[data-etq]').forEach(function (campo) {
        var valor;
        if (campo.type === 'checkbox') {
          valor = campo.checked ? 'Sí' : '';
        } else {
          valor = String(campo.value || '').trim();
        }
        if (campo.required && !valor && !falta) falta = campo;
        if (valor) lineas.push(campo.getAttribute('data-etq') + ': ' + valor);
      });

      if (falta) {
        aviso('error', 'Completa el campo “' + falta.getAttribute('data-etq') + '” para armar tu mensaje.');
        falta.focus();
        return;
      }

      var url = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(lineas.join('\n'));
      var ventana = window.open(url, '_blank');
      if (ventana) { try { ventana.opener = null; } catch (err) {} } else { window.location.href = url; return; }
      aviso('ok', 'Abrimos WhatsApp con tu mensaje listo. Solo presiona enviar.');
    });
  });
})();
