// Reveal Animation Observer
const reveals = document.querySelectorAll('.reveal');
const scrollContent = document.getElementById('scrollContent');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.15,
  root: scrollContent
});

reveals.forEach((el, index) => {
  el.style.transitionDelay = `${Math.min(index * 70, 420)}ms`;
  revealObserver.observe(el);
});

// Modal Management
const phoneApp = document.getElementById('phoneApp');
const modalOverlay = document.getElementById('modalOverlay');
const moreSubjectsModal = document.getElementById('moreSubjectsModal');
const closeMoreSubjects = document.getElementById('closeMoreSubjects');
const bottomNav = document.querySelector('.bottom-nav');

// Get more subjects button (Lainnya card in info/task section)
const moreSubjectsButton = document.querySelector('.js-open-more');

function openMoreSubjects() {
  if (phoneApp && moreSubjectsModal) {
    phoneApp.classList.add('modal-open');
    modalOverlay.classList.add('active');
    moreSubjectsModal.classList.add('active');
    moreSubjectsModal.setAttribute('aria-hidden', 'false');
  }
}

function closeMoreSubjectsPanel() {
  if (phoneApp && moreSubjectsModal) {
    phoneApp.classList.remove('modal-open');
    modalOverlay.classList.remove('active');
    moreSubjectsModal.classList.remove('active');
    moreSubjectsModal.setAttribute('aria-hidden', 'true');
  }
}

// Event Listeners
moreSubjectsButton?.addEventListener('click', (e) => {
  e.preventDefault();
  openMoreSubjects();
});

closeMoreSubjects?.addEventListener('click', closeMoreSubjectsPanel);
modalOverlay?.addEventListener('click', closeMoreSubjectsPanel);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && phoneApp.classList.contains('modal-open')) {
    closeMoreSubjectsPanel();
  }
});

const carousel = document.getElementById('moduleCarousel');
const prevButton = document.getElementById('prevModule');
const nextButton = document.getElementById('nextModule');

function scrollModule(direction) {
  const card = carousel.querySelector('.module-card');
  const gap = 12;
  const scrollAmount = card.offsetWidth + gap;
  carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

prevButton.addEventListener('click', () => scrollModule(-1));
nextButton.addEventListener('click', () => scrollModule(1));

let isDown = false;
let startX = 0;
let scrollLeft = 0;

carousel.addEventListener('pointerdown', (event) => {
  isDown = true;
  carousel.setPointerCapture(event.pointerId);
  startX = event.clientX;
  scrollLeft = carousel.scrollLeft;
});

carousel.addEventListener('pointermove', (event) => {
  if (!isDown) return;
  const walk = (event.clientX - startX) * 1.25;
  carousel.scrollLeft = scrollLeft - walk;
});

['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
  carousel.addEventListener(name, () => {
    isDown = false;
  });
});

const startButton = document.querySelector('.primary-btn');
startButton.addEventListener('click', () => {
  carousel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  carousel.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.018)' },
    { transform: 'scale(1)' }
  ], {
    duration: 520,
    easing: 'ease-out'
  });
});
