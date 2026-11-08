if (window.location.pathname.replace(/\/$/, '') === '/community') {
  import('./community.js');
} else {
  import('./main.js');
}
