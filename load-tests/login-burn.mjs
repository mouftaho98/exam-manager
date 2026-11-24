// Pushes CPU on the API with constant-rate wrong-password logins (each runs bcrypt).
// Usage: node load-tests/login-burn.mjs <api url> <existing account email> <requests per second> <seconds>
// Example: node load-tests/login-burn.mjs https://uoft-rollcall-api.duckdns.org tester@gmail.com 15 90
const [url, email, rateArg, secsArg] = process.argv.slice(2);
const rate = Number(rateArg), secs = Number(secsArg);
const counts = {}; let sent = 0, inflight = 0, lat = [];
const fire = async () => {
  inflight++; const t = Date.now();
  try {
    const r = await fetch(url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-password' }) });
    await r.arrayBuffer(); counts[r.status] = (counts[r.status] || 0) + 1;
  } catch (e) { counts.err = (counts.err || 0) + 1; }
  lat.push(Date.now() - t); inflight--;
};
const start = Date.now();
const timer = setInterval(() => {
  const target = Math.floor(((Date.now() - start) / 1000) * rate);
  while (sent < target && inflight < 400) { sent++; fire(); }
}, 20);
const report = setInterval(() => {
  const s = lat.slice().sort((a, b) => a - b);
  console.log(`${Math.round((Date.now() - start) / 1000)}s sent=${sent} inflight=${inflight} ${JSON.stringify(counts)} p50=${s[Math.floor(s.length * .5)] ?? '-'}ms p95=${s[Math.floor(s.length * .95)] ?? '-'}ms`);
  lat = [];
}, 10000);
setTimeout(() => { clearInterval(timer); setTimeout(() => { clearInterval(report); console.log('done', JSON.stringify(counts)); process.exit(0); }, 3000); }, secs * 1000);
