/* ─────────────────────────────────────────────────────────────
   ENCUESTA — SCRIPT.JS
   Programación Web I · 2026
───────────────────────────────────────────────────────────── */

/* ── TEXTOS DE ESTRELLAS ─────────────────────────────────────── */
const starLabels = {
  1: '😟 Muy malo',
  2: '😕 Malo',
  3: '😐 Regular',
  4: '😊 Bueno',
  5: '🤩 Excelente',
};

/* ── HELPER: inicializar sistema de estrellas ─────────────────── */
function initStars(groupId, hiddenId, labelId) {
  const group = document.getElementById(groupId);
  const hidden = document.getElementById(hiddenId);
  const label = document.getElementById(labelId);
  const stars = group.querySelectorAll('.star');
  let selected = 0;

  function paintStars(upTo) {
    stars.forEach((s, i) => {
      s.classList.toggle('selected', i < upTo);
      s.classList.remove('hovered');
    });
  }

  stars.forEach((star, i) => {
    // Hover
    star.addEventListener('mouseenter', () => {
      stars.forEach((s, j) => s.classList.toggle('hovered', j <= i));
      label.textContent = starLabels[i + 1];
    });
    group.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hovered'));
      label.textContent = selected ? starLabels[selected] : 'Sin calificar';
    });
    // Click
    star.addEventListener('click', () => {
      selected = i + 1;
      hidden.value = selected;
      paintStars(selected);
      label.textContent = starLabels[selected];
      // Quitar error si lo había
      document.getElementById(groupId.replace('stars-', 'grupo-')).classList.remove('has-error');
    });
  });

  return () => selected; // devuelve getter
}

const getProfesor = initStars('stars-profesor', 'val-profesor', 'label-profesor');
const getInstituto = initStars('stars-instituto', 'val-instituto', 'label-instituto');

/* ── CONTADOR DE CARACTERES ──────────────────────────────────── */
const textarea = document.getElementById('mejoras');
const charCount = document.getElementById('char-count');

textarea.addEventListener('input', () => {
  charCount.textContent = textarea.value.length;
});

/* ── VALIDACIÓN Y ENVÍO ──────────────────────────────────────── */
const form = document.getElementById('encuesta-form');

form.addEventListener('submit', (e) => {
  e.preventDefault();

  let valid = true;

  // 1. Calificación de la materia
  const selectMateria = document.getElementById('calificacion-materia');
  const grupoMateria = document.getElementById('grupo-materia');
  if (!selectMateria.value) {
    grupoMateria.classList.add('has-error');
    valid = false;
  } else {
    grupoMateria.classList.remove('has-error');
  }

  // 2. Evaluación profesor
  const grupoProfesor = document.getElementById('grupo-profesor');
  const valProfesor = document.getElementById('val-profesor').value;
  if (!valProfesor) {
    grupoProfesor.classList.add('has-error');
    valid = false;
  } else {
    grupoProfesor.classList.remove('has-error');
  }

  // 3. Evaluación instituto
  const grupoInstituto = document.getElementById('grupo-instituto');
  const valInstituto = document.getElementById('val-instituto').value;
  if (!valInstituto) {
    grupoInstituto.classList.add('has-error');
    valid = false;
  } else {
    grupoInstituto.classList.remove('has-error');
  }

  if (!valid) {
    // Scroll al primer error
    const primerError = form.querySelector('.has-error');
    if (primerError) {
      primerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // ── Todo válido: recopilar datos y mostrar mensaje ────────────
  const checkboxes = form.querySelectorAll('input[name="gusto"]:checked');
  const gustos = Array.from(checkboxes).map(cb => cb.value);
  const mejoras = textarea.value.trim();

  mostrarGracias({
    materia: selectMateria.value,
    profesor: valProfesor,
    instituto: valInstituto,
    gustos: gustos.length ? gustos.join(', ') : '—',
    mejoras: mejoras || '—',
  });
});

/* ── MOSTRAR OVERLAY DE AGRADECIMIENTO ───────────────────────── */
function mostrarGracias(datos) {
  const overlay = document.getElementById('gracias-overlay');
  const resumen = document.getElementById('gracias-resumen');

  // Construir resumen
  resumen.innerHTML = `
    <div class="res-item">
      <span class="res-key">📊 Calificación materia</span>
      <span class="res-val">${datos.materia} / 10</span>
    </div>
    <div class="res-item">
      <span class="res-key">👨‍🏫 Evaluación Profesor</span>
      <span class="res-val">${starLabels[datos.profesor]}</span>
    </div>
    <div class="res-item">
      <span class="res-key">🏛️ Evaluación Instituto</span>
      <span class="res-val">${starLabels[datos.instituto]}</span>
    </div>
    <div class="res-item">
      <span class="res-key">❤️ Gustó más</span>
      <span class="res-val" style="max-width:220px">${datos.gustos}</span>
    </div>
  `;

  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // Pequeña animación del emoji
  const emoji = document.getElementById('gracias-emoji');
  emoji.style.animation = 'none';
  emoji.offsetHeight; // reflow
  emoji.style.animation = '';
}

/* ── REINICIAR ENCUESTA ──────────────────────────────────────── */
function reiniciarEncuesta() {
  const overlay = document.getElementById('gracias-overlay');
  overlay.classList.remove('visible');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  // Resetear formulario
  form.reset();
  charCount.textContent = '0';

  // Resetear estrellas
  document.querySelectorAll('.star').forEach(s => {
    s.classList.remove('selected', 'hovered');
  });
  document.getElementById('val-profesor').value = '';
  document.getElementById('val-instituto').value = '';
  document.getElementById('label-profesor').textContent = 'Sin calificar';
  document.getElementById('label-instituto').textContent = 'Sin calificar';

  // Resetear errores
  document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── REMOVER ERROR AL CAMBIAR EL SELECT ──────────────────────── */
document.getElementById('calificacion-materia').addEventListener('change', () => {
  document.getElementById('grupo-materia').classList.remove('has-error');
});
