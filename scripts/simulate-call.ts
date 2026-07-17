/**
 * Simulates the TARGIT launch-link call until the real integration format is
 * confirmed. Exercises blueprint Flows 1 (add), 2 (view), and 3 (multi-user
 * collaboration) end-to-end against a running dev server.
 *
 *   npm run dev              # in one terminal
 *   npm run simulate         # in another
 */
const BASE_URL = 'http://localhost:3000';

// Placeholder context -- shape mirrors the blueprint's URL contract
// (reportId, productId, productName, brand, fragrance, periodLabel).
// Real TARGIT report/product codes are not confirmed yet.
const SIM_CONTEXT = {
  reportId: 'SIM-R1',
  reportName: 'Coste Interno',
  productId: 'SIM-P12345',
  productName: 'ProductoZ (simulated)',
  brand: 'MarcaX',
  fragrance: 'FraganciaY',
  periodLabel: 'Jun-2025_to_Sep-2025',
};

function contextQuery(asUser?: string): string {
  const params = new URLSearchParams({ ...SIM_CONTEXT, ...(asUser ? { asUser } : {}) });
  return params.toString();
}

async function getComments(asUser?: string) {
  const res = await fetch(`${BASE_URL}/api/comments?${contextQuery(asUser)}`);
  return { status: res.status, body: await res.json() };
}

async function postComment(commentText: string, asUser?: string) {
  const res = await fetch(`${BASE_URL}/api/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...SIM_CONTEXT, commentText, asUser }),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log('--- Flow 1/2: User A (manuelsa) opens the simulated report row ---');
  console.log(await getComments('manuelsa'));

  console.log('\n--- Flow 1: User A adds a comment ---');
  console.log(await postComment('Cost spike looks like a one-off freight surcharge.', 'manuelsa'));

  console.log('\n--- Flow 3: User B (testuser2) opens the SAME selection ---');
  console.log(await getComments('testuser2'));

  console.log('\n--- Flow 3: User B adds a second comment ---');
  console.log(await postComment('Confirmed with logistics -- one-time surcharge, not recurring.', 'testuser2'));

  console.log('\n--- Flow 3: User A reopens -- should see both comments, newest first ---');
  console.log(JSON.stringify(await getComments('manuelsa'), null, 2));
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
