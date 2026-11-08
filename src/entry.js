if (/^\/community(?:\/|$)/.test(window.location.pathname)) {
  import('./community.js');
} else {
  import('./main.js');
  // Warm the public discussion cache while the workspace is open.
  import('./community-data.js').then(({ fetchCommunity }) => fetchCommunity()).catch(() => {});
}
