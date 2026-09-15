const navLinks = document.querySelectorAll('.bottom-nav a');

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    if (!link.classList.contains('active')) {
      navLinks.forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
    }
  });
});
