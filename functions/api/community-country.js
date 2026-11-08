// Cloudflare provides this approximate country; no IP address is returned to the browser.
export function onRequestGet({ request }) {
  const country = request.cf?.country;
  return Response.json({ country: /^[A-Z]{2}$/.test(country || '') && country !== 'XX' && country !== 'T1' ? country : null }, { headers: { 'Cache-Control': 'no-store' } });
}
