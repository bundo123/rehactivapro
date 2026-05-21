let initialized = false;
let sidebar, overlay, hamburger;

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('open');
  hamburger.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
}

function toggleSidebar() {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
}

export function initMobileMenu() {
  if (initialized) return;
  initialized = true;

  sidebar   = document.querySelector('.sidebar');
  overlay   = document.querySelector('.sidebar-overlay');
  hamburger = document.querySelector('.hamburger-btn');

  hamburger.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', closeSidebar);

  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', closeSidebar);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeSidebar();
  });
}
