/* ─────────────────────────────────────────────────────────────
   PORTFOLIO — SCRIPT.JS
   Programación Web I · 2026
───────────────────────────────────────────────────────────── */

/* ── 1. NAVBAR: scroll + active link ─────────────────────────── */
const navbar = document.getElementById('navbar');
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
  // Glassmorphism al hacer scroll
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  // Marcar link activo según sección visible
  let currentSection = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 120;
    if (window.scrollY >= sectionTop) {
      currentSection = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + currentSection) {
      link.classList.add('active');
    }
  });
});

/* ── 2. HAMBURGER MENU (mobile) ───────────────────────────────── */
const hamburger = document.getElementById('hamburger');
const navLinksEl = document.getElementById('nav-links');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navLinksEl.classList.toggle('open');
});

// Cerrar menú al hacer clic en un link
navLinks.forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinksEl.classList.remove('open');
  });
});

/* ── 3. TYPING ANIMATION ──────────────────────────────────────── */
const typedEl = document.getElementById('typed');
const phrases = [
  'Front-End',
  'UI/UX',
  'Creativo',
  'Full-Stack',
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeWrite() {
  const current = phrases[phraseIndex];

  if (isDeleting) {
    charIndex--;
  } else {
    charIndex++;
  }

  typedEl.textContent = current.slice(0, charIndex);

  let delay = isDeleting ? 60 : 120;

  if (!isDeleting && charIndex === current.length) {
    delay = 1800;
    isDeleting = true;
  } else if (isDeleting && charIndex === 0) {
    isDeleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    delay = 400;
  }

  setTimeout(typeWrite, delay);
}

// Arrancar después de 500ms
setTimeout(typeWrite, 500);

/* ── 4. FADE-IN ANIMATIONS (Intersection Observer) ────────────── */
const fadeEls = document.querySelectorAll(
  '.section-header, .skill-card, .project-card, .contact-item, .contact-card'
);

fadeEls.forEach(el => el.classList.add('fade-in'));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

fadeEls.forEach((el, i) => {
  if (el.classList.contains('skill-card') || el.classList.contains('project-card')) {
    el.dataset.delay = (i % 6) * 80;
  }
  observer.observe(el);
});

/* ── 5. SKILL BARS ANIMATION ──────────────────────────────────── */
const skillBars = document.querySelectorAll('.skill-fill');

const skillObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        skillObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.4 }
);

skillBars.forEach(bar => skillObserver.observe(bar));

/* ── 6. BOTÓN "CONTÁCTAME" — modal personalizado ──────────────── */
function mostrarContacto() {
  const overlay = document.createElement('div');
  overlay.id = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-box" role="dialog" aria-modal="true" aria-labelledby="alert-title">
      <div class="alert-icon">👋</div>
      <h3 id="alert-title" class="alert-title">¡Gracias por escribirme!</h3>
      <p class="alert-msg">
        Me alegra que quieras ponerte en contacto.<br>
        Te respondo a la brevedad en:<br>
        <strong>javi29marambio@gmail.com</strong>
      </p>
      <button id="alert-close" class="btn btn-primary" onclick="cerrarAlerta()">
        ¡Perfecto!
      </button>
    </div>
  `;

  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '9999',
    animation: 'fadeInOverlay .25s ease',
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  if (!document.getElementById('alert-styles')) {
    const style = document.createElement('style');
    style.id = 'alert-styles';
    style.textContent = `
      @keyframes fadeInOverlay { from { opacity:0 } to { opacity:1 } }
      @keyframes popIn { from { opacity:0; transform:scale(.8) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
      .alert-box {
        background: #1a1b2e;
        border: 1px solid rgba(108,99,255,.4);
        border-radius: 20px;
        padding: 2.5rem 2rem;
        max-width: 380px;
        width: 90%;
        text-align: center;
        box-shadow: 0 24px 64px rgba(0,0,0,.5);
        animation: popIn .35s cubic-bezier(0.34,1.56,0.64,1) forwards;
        font-family: 'Outfit', sans-serif;
      }
      .alert-icon  { font-size: 3rem; margin-bottom: 1rem; }
      .alert-title { font-size: 1.4rem; font-weight: 700; color: #e8e9f3; margin-bottom: .75rem; }
      .alert-msg   { font-size: .95rem; color: #8b8fa8; line-height:1.75; margin-bottom: 1.75rem; }
      .alert-msg strong { color: #9d97ff; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('keydown', function onKeydown(e) {
    if (e.key === 'Escape') {
      cerrarAlerta();
      document.removeEventListener('keydown', onKeydown);
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarAlerta();
  });
}

function cerrarAlerta() {
  const overlay = document.getElementById('alert-overlay');
  if (overlay) {
    overlay.style.animation = 'fadeInOverlay .2s ease reverse forwards';
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 200);
  }
}

/* ── 7. SMOOTH SCROLL para todos los links internos ────────────── */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
