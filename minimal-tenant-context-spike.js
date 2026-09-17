// ============================================================================
// MINIMAL RLS INTEGRATION SPIKE — isolated, not a production interceptor
// ============================================================================
// This is deliberately NOT a NestJS interceptor and NOT wired to any API.
// It exists solely to prove the request-scoped tenant-context pattern in a
// shape close to how a real interceptor would use it, while staying something
// I can actually execute and verify in this environment.
//
// Why not real Prisma Client / real NestJS: `prisma generate` cannot run here
// (see README.md, Section "Prisma CLI availability") — there is no generated
// @prisma/client to import. Writing NestJS interceptor code against an
// un-generated client would be unverified illustrative code, not a tested
// spike, so it was deliberately not built. This file uses `pg` directly,
// which IS real and IS tested below, applying the identical SET LOCAL pattern
// a Prisma-based interceptor would use internally.
//
// If/when Prisma Client can be generated, the real interceptor is a thin
// wrapper: same shape as `runInTenantContext` below, but calling
// `prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe(...SET LOCAL...); return next.handle(); })`
// instead of raw pg. The tenant-context-setting logic proven here does not
// change when Prisma is introduced — only the client library wrapping it does.
// ============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://app_user:app_pass@localhost:5432/legal_erp_dev',
  max: 5,
});

/**
 * The core pattern a NestJS TenantContextInterceptor would implement.
 * Takes a tenantId (resolved from the authenticated request, e.g. from the
 * JWT — that resolution is NOT part of this spike) and a handler function,
 * runs the handler inside a transaction with tenant context set via SET LOCAL,
 * and guarantees COMMIT/ROLLBACK regardless of handler success or failure.
 *
 * This is the ONLY function in this file meant to resemble production code.
 * Everything below it is test harness.
 */
async function runInTenantContext(tenantId, handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      // Parameterized would be preferable to string interpolation in real code;
      // SET LOCAL does not support query parameters in plain SQL, so a real
      // interceptor must validate tenantId is a well-formed UUID before this
      // point (e.g. from a JWT claim already validated at auth time) rather
      // than interpolating unsanitized input. Noted here as a production
      // requirement this spike does not itself enforce.
      await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    }
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// Test harness for the spike above
// ----------------------------------------------------------------------------

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}`); }
}

async function main() {
  console.log('\n=== Minimal RLS integration spike (isolated, not wired to any API) ===\n');

  const tenant = await pool.query(`INSERT INTO tenant (name, subdomain, status) VALUES ('Spike Tenant', 'spike-integration-test', 'active') RETURNING id`);
  const tenantId = tenant.rows[0].id;

  // "Simulated request handler" — exactly what a controller method would do:
  // just run a query, oblivious to how tenant context got set.
  const insertClient = (c) => c.query(
    `INSERT INTO client (tenant_id, client_type, display_name, normalized_name, status) VALUES ($1, 'individual', 'Spike Client', 'spike client', 'active') RETURNING id`,
    [tenantId]
  );
  const countClients = (c) => c.query(`SELECT count(*) FROM client`);

  await runInTenantContext(tenantId, insertClient);
  const withContext = await runInTenantContext(tenantId, countClients);
  check('Handler run inside tenant context sees its own inserted row', parseInt(withContext.rows[0].count, 10) === 1);

  let noContextThrew = false;
  let noContextResult = null;
  try {
    noContextResult = await runInTenantContext(null, countClients);
  } catch (e) {
    noContextThrew = true;
  }
  check('Handler run with no tenant context does not throw', !noContextThrew);
  check('Handler run with no tenant context sees zero rows', noContextResult && parseInt(noContextResult.rows[0].count, 10) === 0);

  // Failure path — handler throws, transaction must roll back, no orphaned row.
  let handlerThrew = false;
  try {
    await runInTenantContext(tenantId, async (c) => {
      await c.query(`INSERT INTO client (tenant_id, client_type, display_name, normalized_name, status) VALUES ($1, 'individual', 'Should Roll Back', 'x', 'active')`, [tenantId]);
      throw new Error('simulated handler failure');
    });
  } catch (e) {
    handlerThrew = e.message === 'simulated handler failure';
  }
  const afterFailure = await runInTenantContext(tenantId, countClients);
  check('Handler exception propagates to caller', handlerThrew);
  check('Failed handler\'s insert was rolled back (still only 1 row)', parseInt(afterFailure.rows[0].count, 10) === 1);

  console.log(`\n=== Integration spike results: ${pass} passed, ${fail} failed ===\n`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
