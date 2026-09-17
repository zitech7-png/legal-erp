// ============================================================================
// Legal ERP — Month 1 RLS Spike — REVISION 1
// Addresses all 9 follow-up points from the review of the original spike.
// Run against a live Postgres 16 instance as `app_user` (non-superuser).
// ============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://app_user:app_pass@localhost:5432/legal_erp_dev',
  max: 10,
});

let pass = 0, fail = 0;
const results = [];

function check(section, label, condition, detail) {
  const ok = !!condition;
  if (ok) pass++; else fail++;
  results.push({ section, label, ok, detail });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${!ok && detail ? ' — ' + detail : ''}`);
}

async function run(sql, params = []) {
  return pool.query(sql, params);
}

async function inTxn(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function withTenant(tenantId, fn) {
  return inTxn(async (client) => {
    await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    return fn(client);
  });
}

// ----------------------------------------------------------------------------
// SETUP — platform-level data (once), then a full 18-table cluster per tenant
// ----------------------------------------------------------------------------

async function seedPlatformData() {
  console.log('\n=== Setup: platform-level master data (shared, no RLS) ===');
  const j = await run(`INSERT INTO jurisdiction (name) VALUES ('India') RETURNING id`);
  const r = await run(`INSERT INTO region (jurisdiction_id, name) VALUES ($1, 'Tamil Nadu') RETURNING id`, [j.rows[0].id]);
  const ft = await run(`INSERT INTO forum_type (name) VALUES ('District Court') RETURNING id`);
  const cf = await run(`INSERT INTO court_forum (region_id, forum_type_id, name) VALUES ($1, $2, 'Test District Court') RETURNING id`, [r.rows[0].id, ft.rows[0].id]);
  const bench = await run(`INSERT INTO bench (court_forum_id, name) VALUES ($1, 'Test Bench') RETURNING id`, [cf.rows[0].id]);
  const ct = await run(`INSERT INTO case_type (forum_type_id, name) VALUES ($1, 'Suit') RETURNING id`, [ft.rows[0].id]);
  const perm = await run(`INSERT INTO permission (key, description) VALUES ('matter.read', 'Read matters') RETURNING id`);
  console.log('  Platform data seeded: jurisdiction, region, forum_type, court_forum, bench, case_type, permission');
  return {
    forumTypeId: ft.rows[0].id,
    courtForumId: cf.rows[0].id,
    benchId: bench.rows[0].id,
    caseTypeId: ct.rows[0].id,
    permissionId: perm.rows[0].id,
  };
}

// Seeds one row in EACH of the 18 tenant-scoped tables for a single tenant.
// Deliberately varies which branch of each exactly-one-of CHECK is used between
// tenant A and tenant B (e.g. A uses tenant_case_type_id, B uses
// platform_case_type_id) for extra coverage beyond the minimum ask.
async function seedTenantCluster(tenantLabel, subdomain, platform, useAltBranches) {
  const tenant = await run(`INSERT INTO tenant (name, subdomain, status) VALUES ($1, $2, 'active') RETURNING id`, [`${tenantLabel} Law Firm`, subdomain]);
  const tenantId = tenant.rows[0].id;

  const ids = await withTenant(tenantId, async (c) => {
    const office = await c.query(`INSERT INTO office (tenant_id, name, is_primary) VALUES ($1, $2, true) RETURNING id`, [tenantId, `${tenantLabel} Office`]);
    const user = await c.query(
      `INSERT INTO "user" (tenant_id, email, password_hash, user_type, full_name, status) VALUES ($1, $2, 'h', 'staff', $3, 'active') RETURNING id`,
      [tenantId, `staff@${subdomain}.example.com`, `${tenantLabel} Staffer`]
    );
    const role = await c.query(`INSERT INTO role (tenant_id, name, applies_to_user_type) VALUES ($1, 'Associate', 'staff') RETURNING id`, [tenantId]);
    await c.query(`INSERT INTO role_permission (tenant_id, role_id, permission_id) VALUES ($1, $2, $3)`, [tenantId, role.rows[0].id, platform.permissionId]);
    const userRole = await c.query(`INSERT INTO user_role (tenant_id, user_id, role_id, office_id) VALUES ($1, $2, $3, $4) RETURNING id`, [tenantId, user.rows[0].id, role.rows[0].id, office.rows[0].id]);
    const tenantFeature = await c.query(`INSERT INTO tenant_feature (tenant_id, feature_key, enabled) VALUES ($1, 'criminal_matters', false) RETURNING id`, [tenantId]);
    const client_ = await c.query(
      `INSERT INTO client (tenant_id, client_type, display_name, normalized_name, status) VALUES ($1, 'organization', $2, $3, 'active') RETURNING id`,
      [tenantId, `${tenantLabel} Confidential Client`, `${tenantLabel.toLowerCase()} confidential client`]
    );
    const contact = await c.query(
      `INSERT INTO contact (tenant_id, full_name, normalized_name, contact_type) VALUES ($1, $2, $3, 'individual') RETURNING id`,
      [tenantId, `${tenantLabel} Contact Person`, `${tenantLabel.toLowerCase()} contact person`]
    );
    const clientContact = await c.query(`INSERT INTO client_contact (tenant_id, client_id, contact_id, relationship) VALUES ($1, $2, $3, 'Director') RETURNING id`, [tenantId, client_.rows[0].id, contact.rows[0].id]);
    const matter = await c.query(
      `INSERT INTO matter (tenant_id, matter_number, title, client_id, office_id, status) VALUES ($1, $2, $3, $4, $5, 'open') RETURNING id`,
      [tenantId, `${tenantLabel}-M-0001`, `${tenantLabel} Test Matter`, client_.rows[0].id, office.rows[0].id]
    );
    const tenantCaseType = await c.query(
      `INSERT INTO tenant_case_type (tenant_id, forum_type_id, based_on_case_type_id, name) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, platform.forumTypeId, platform.caseTypeId, `${tenantLabel} Custom Suit Type`]
    );
    // Branch coverage: tenant A -> tenant_case_type_id, tenant B -> platform_case_type_id
    const proceeding = useAltBranches
      ? await c.query(
          `INSERT INTO proceeding (tenant_id, matter_id, court_forum_id, bench_id, platform_case_type_id, status) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
          [tenantId, matter.rows[0].id, platform.courtForumId, platform.benchId, platform.caseTypeId]
        )
      : await c.query(
          `INSERT INTO proceeding (tenant_id, matter_id, court_forum_id, bench_id, tenant_case_type_id, status) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
          [tenantId, matter.rows[0].id, platform.courtForumId, platform.benchId, tenantCaseType.rows[0].id]
        );
    const matterParticipant = await c.query(
      `INSERT INTO matter_participant (tenant_id, matter_id, contact_id, role) VALUES ($1, $2, $3, 'Opposing Counsel') RETURNING id`,
      [tenantId, matter.rows[0].id, contact.rows[0].id]
    );
    const statusHistory = await c.query(
      `INSERT INTO proceeding_status_history (tenant_id, proceeding_id, new_status, changed_by_user_id) VALUES ($1, $2, 'pending', $3) RETURNING id`,
      [tenantId, proceeding.rows[0].id, user.rows[0].id]
    );
    // Branch coverage: tenant A -> matter_id, tenant B -> proceeding_id
    const assignment = useAltBranches
      ? await c.query(
          `INSERT INTO assignment (tenant_id, proceeding_id, user_id, role, effective_from) VALUES ($1, $2, $3, 'Lead Advocate', now()) RETURNING id`,
          [tenantId, proceeding.rows[0].id, user.rows[0].id]
        )
      : await c.query(
          `INSERT INTO assignment (tenant_id, matter_id, user_id, role, effective_from) VALUES ($1, $2, $3, 'Lead Advocate', now()) RETURNING id`,
          [tenantId, matter.rows[0].id, user.rows[0].id]
        );
    // Branch coverage: tenant A -> triggered_by_client, tenant B -> triggered_by_matter
    const conflictCheck = useAltBranches
      ? await c.query(
          `INSERT INTO conflict_check (tenant_id, triggered_by_matter_id, search_name, run_by_user_id) VALUES ($1, $2, $3, $4) RETURNING id`,
          [tenantId, matter.rows[0].id, `${tenantLabel} search`, user.rows[0].id]
        )
      : await c.query(
          `INSERT INTO conflict_check (tenant_id, triggered_by_client_id, search_name, run_by_user_id) VALUES ($1, $2, $3, $4) RETURNING id`,
          [tenantId, client_.rows[0].id, `${tenantLabel} search`, user.rows[0].id]
        );
    // Branch coverage: tenant A -> matched_client, tenant B -> matched_contact
    const conflictMatch = useAltBranches
      ? await c.query(
          `INSERT INTO conflict_match (tenant_id, conflict_check_id, matched_contact_id, similarity_score, decision) VALUES ($1, $2, $3, 0.9, 'flagged') RETURNING id`,
          [tenantId, conflictCheck.rows[0].id, contact.rows[0].id]
        )
      : await c.query(
          `INSERT INTO conflict_match (tenant_id, conflict_check_id, matched_client_id, similarity_score, decision) VALUES ($1, $2, $3, 0.9, 'flagged') RETURNING id`,
          [tenantId, conflictCheck.rows[0].id, client_.rows[0].id]
        );
    const auditLog = await c.query(
      `INSERT INTO audit_log (tenant_id, resource_type, resource_id, event, actor_id) VALUES ($1, 'matter', $2, 'created', $3) RETURNING id`,
      [tenantId, matter.rows[0].id, user.rows[0].id]
    );

    return {
      office: office.rows[0].id, user: user.rows[0].id, role: role.rows[0].id,
      // role_permission has a composite PK, not a single id — store its natural key
      role_permission: { tenant_id: tenantId, role_id: role.rows[0].id, permission_id: platform.permissionId },
      user_role: userRole.rows[0].id, tenant_feature: tenantFeature.rows[0].id,
      client: client_.rows[0].id, contact: contact.rows[0].id, client_contact: clientContact.rows[0].id,
      matter: matter.rows[0].id, tenant_case_type: tenantCaseType.rows[0].id, proceeding: proceeding.rows[0].id,
      matter_participant: matterParticipant.rows[0].id, proceeding_status_history: statusHistory.rows[0].id,
      assignment: assignment.rows[0].id, conflict_check: conflictCheck.rows[0].id,
      conflict_match: conflictMatch.rows[0].id, audit_log: auditLog.rows[0].id,
    };
  });

  return { tenantId, ids };
}

// ----------------------------------------------------------------------------
// SECTION 4 (review point 4) — confirm RLS enabled + policy present on all 18
// ----------------------------------------------------------------------------

async function verifyRlsEnabledEverywhere() {
  console.log('\n=== Section: RLS enabled + policy present on every tenant-scoped table ===');
  const expected = [
    'office', 'user', 'role', 'role_permission', 'user_role', 'tenant_feature',
    'client', 'contact', 'client_contact',
    'matter', 'matter_participant', 'proceeding', 'proceeding_status_history',
    'tenant_case_type', 'assignment', 'conflict_check', 'conflict_match', 'audit_log',
  ];
  const platformTables = ['jurisdiction', 'region', 'forum_type', 'court_forum', 'bench', 'case_type', 'permission', 'tenant'];

  const rlsStatus = await run(`
    SELECT c.relname,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS has_policy
    FROM pg_class c
    WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
    ORDER BY c.relname
  `);

  console.log('\n  Table                        | RLS on | Forced | tenant_isolation policy');
  console.log('  -----------------------------|--------|--------|------------------------');
  const row = {};
  rlsStatus.rows.forEach((r) => { row[r.relname] = r; });

  let allTenantScopedGood = true;
  for (const t of expected) {
    const r = row[t];
    const good = r && r.rls_enabled && r.rls_forced && r.has_policy;
    if (!good) allTenantScopedGood = false;
    console.log(`  ${t.padEnd(29)}| ${r ? (r.rls_enabled ? '  t   ' : '  f   ') : ' MISSING'} | ${r ? (r.rls_forced ? '  t   ' : '  f   ') : '      '} | ${r ? (r.has_policy ? 'yes' : 'NO') : ''}`);
  }
  let allPlatformCorrect = true;
  for (const t of platformTables) {
    const r = row[t];
    const correct = r && !r.rls_enabled && !r.has_policy;
    if (!correct) allPlatformCorrect = false;
    console.log(`  ${t.padEnd(29)}| ${r ? (r.rls_enabled ? '  t   ' : '  f   ') : ' MISSING'} | ${r ? (r.rls_forced ? '  t   ' : '  f   ') : '      '} | ${r ? (r.has_policy ? 'yes' : 'no (correct)') : ''}`);
  }
  console.log('');

  check('RLS coverage', 'All 18 tenant-scoped tables have RLS enabled, forced, and a tenant_isolation policy', allTenantScopedGood);
  check('RLS coverage', 'All 8 platform-level tables correctly have NO RLS and NO policy', allPlatformCorrect);
}

// ----------------------------------------------------------------------------
// SECTION: all 6 CHECK constraints, individually, BOTH violation modes each
// ----------------------------------------------------------------------------

async function testAllCheckConstraintsIndividually(tenantAId, ids) {
  console.log('\n=== Section: all 6 CHECK constraints, tested individually (both violation modes) ===');

  async function expectCheckViolation(label, fn) {
    let code = null;
    try {
      await withTenant(tenantAId, fn);
    } catch (e) {
      code = e.code;
    }
    check('CHECK constraints', label, code === '23514', `got error code ${code}`);
  }

  // 1. user.user_type
  await expectCheckViolation('user.user_type: rejects value outside (staff, client)', (c) =>
    c.query(`INSERT INTO "user" (tenant_id, email, password_hash, user_type, full_name, status) VALUES ($1, 'bad@example.com', 'h', 'superadmin', 'X', 'active')`, [tenantAId])
  );

  // 2. assignment: both branches
  await expectCheckViolation('assignment: rejects BOTH matter_id and proceeding_id NULL', (c) =>
    c.query(`INSERT INTO assignment (tenant_id, matter_id, proceeding_id, user_id, role, effective_from) VALUES ($1, NULL, NULL, $2, 'X', now())`, [tenantAId, ids.user])
  );
  await expectCheckViolation('assignment: rejects BOTH matter_id and proceeding_id SET', (c) =>
    c.query(`INSERT INTO assignment (tenant_id, matter_id, proceeding_id, user_id, role, effective_from) VALUES ($1, $2, $3, $4, 'X', now())`, [tenantAId, ids.matter, ids.proceeding, ids.user])
  );

  // 3. matter_participant: both branches
  await expectCheckViolation('matter_participant: rejects BOTH contact_id and client_id NULL', (c) =>
    c.query(`INSERT INTO matter_participant (tenant_id, matter_id, contact_id, client_id, role) VALUES ($1, $2, NULL, NULL, 'X')`, [tenantAId, ids.matter])
  );
  await expectCheckViolation('matter_participant: rejects BOTH contact_id and client_id SET', (c) =>
    c.query(`INSERT INTO matter_participant (tenant_id, matter_id, contact_id, client_id, role) VALUES ($1, $2, $3, $4, 'X')`, [tenantAId, ids.matter, ids.contact, ids.client])
  );

  // 4. proceeding: both branches
  await expectCheckViolation('proceeding: rejects BOTH platform_case_type_id and tenant_case_type_id NULL', (c) =>
    c.query(`INSERT INTO proceeding (tenant_id, matter_id, court_forum_id, platform_case_type_id, tenant_case_type_id, status) VALUES ($1, $2, (SELECT id FROM court_forum LIMIT 1), NULL, NULL, 'pending')`, [tenantAId, ids.matter])
  );
  await expectCheckViolation('proceeding: rejects BOTH platform_case_type_id and tenant_case_type_id SET', (c) =>
    c.query(`INSERT INTO proceeding (tenant_id, matter_id, court_forum_id, platform_case_type_id, tenant_case_type_id, status) VALUES ($1, $2, (SELECT id FROM court_forum LIMIT 1), (SELECT id FROM case_type LIMIT 1), $3, 'pending')`, [tenantAId, ids.matter, ids.tenant_case_type])
  );

  // 5. conflict_check: both branches (all-null, and two-set)
  await expectCheckViolation('conflict_check: rejects ALL FOUR triggered_by_* NULL', (c) =>
    c.query(`INSERT INTO conflict_check (tenant_id, search_name, run_by_user_id) VALUES ($1, 'x', $2)`, [tenantAId, ids.user])
  );
  await expectCheckViolation('conflict_check: rejects TWO of four triggered_by_* SET', (c) =>
    c.query(`INSERT INTO conflict_check (tenant_id, triggered_by_client_id, triggered_by_contact_id, search_name, run_by_user_id) VALUES ($1, $2, $3, 'x', $4)`, [tenantAId, ids.client, ids.contact, ids.user])
  );

  // 6. conflict_match: both branches
  await expectCheckViolation('conflict_match: rejects BOTH matched_client_id and matched_contact_id NULL', (c) =>
    c.query(`INSERT INTO conflict_match (tenant_id, conflict_check_id, similarity_score, decision) VALUES ($1, $2, 0.5, 'unreviewed')`, [tenantAId, ids.conflict_check])
  );
  await expectCheckViolation('conflict_match: rejects BOTH matched_client_id and matched_contact_id SET', (c) =>
    c.query(`INSERT INTO conflict_match (tenant_id, conflict_check_id, matched_client_id, matched_contact_id, similarity_score, decision) VALUES ($1, $2, $3, $4, 0.5, 'unreviewed')`, [tenantAId, ids.conflict_check, ids.client, ids.contact])
  );
}

// ----------------------------------------------------------------------------
// SECTION: RLS read-isolation across all 18 tenant-scoped tables
// ----------------------------------------------------------------------------

const TABLE_PK_COLUMNS = {
  office: 'id', user: 'id', role: 'id', user_role: 'id', tenant_feature: 'id',
  client: 'id', contact: 'id', client_contact: 'id',
  matter: 'id', matter_participant: 'id', proceeding: 'id', proceeding_status_history: 'id',
  tenant_case_type: 'id', assignment: 'id', conflict_check: 'id', conflict_match: 'id', audit_log: 'id',
};

async function testReadIsolationAllTables(tenantAId, tenantBId, idsA, idsB) {
  console.log('\n=== Section: RLS read-isolation exercised on all 18 tenant-scoped tables (not just client) ===');

  for (const table of Object.keys(TABLE_PK_COLUMNS)) {
    const rowIdA = idsA[table];
    const rowIdB = idsB[table];
    if (!rowIdA || !rowIdB) continue; // role_permission has no single id, handled separately below

    const seenByA = await withTenant(tenantAId, (c) => c.query(`SELECT 1 FROM "${table}" WHERE id = $1`, [rowIdB]));
    const ownSeenByA = await withTenant(tenantAId, (c) => c.query(`SELECT 1 FROM "${table}" WHERE id = $1`, [rowIdA]));

    check(
      'RLS read isolation (18 tables)',
      `${table}: tenant A sees its own row and cannot see tenant B's row`,
      seenByA.rows.length === 0 && ownSeenByA.rows.length === 1
    );
  }

  // role_permission — composite PK, tested by natural key instead of a single id
  const rpSeenByA = await withTenant(tenantAId, (c) =>
    c.query(`SELECT 1 FROM role_permission WHERE role_id = $1 AND permission_id = $2`, [idsB.role_permission.role_id, idsB.role_permission.permission_id])
  );
  const rpOwnSeenByA = await withTenant(tenantAId, (c) =>
    c.query(`SELECT 1 FROM role_permission WHERE role_id = $1 AND permission_id = $2`, [idsA.role_permission.role_id, idsA.role_permission.permission_id])
  );
  check(
    'RLS read isolation (18 tables)',
    'role_permission: tenant A sees its own row and cannot see tenant B\'s row',
    rpSeenByA.rows.length === 0 && rpOwnSeenByA.rows.length === 1
  );
}

// ----------------------------------------------------------------------------
// SECTION: cross-tenant INSERT rejection — representative set spanning
// different FK shapes (simple-FK-only, composite-FK, platform-parent-only)
// ----------------------------------------------------------------------------

async function testCrossTenantInsertRejection(tenantAId, tenantBId, idsA) {
  console.log('\n=== Section: cross-tenant INSERT rejection (representative tables, different FK shapes) ===');

  async function expectRejected(label, fn) {
    let code = null;
    try {
      await withTenant(tenantAId, fn); // context = tenant A throughout
    } catch (e) {
      code = e.code;
    }
    // 42501 = RLS WITH CHECK violation, 23503 = FK violation — both are legitimate
    // "cannot insert claiming tenant B" outcomes; we record which one actually fired.
    check('Cross-tenant INSERT rejection', `${label} (rejected via ${code === '42501' ? 'RLS WITH CHECK' : code === '23503' ? 'composite FK' : 'code ' + code})`, code === '42501' || code === '23503');
  }

  // Simple case — no composite-FK dependency, so ONLY RLS's WITH CHECK can catch this
  await expectRejected('office: insert claiming tenant_id = tenant B while context = tenant A', (c) =>
    c.query(`INSERT INTO office (tenant_id, name) VALUES ($1, 'Sneaky Office')`, [tenantBId])
  );
  await expectRejected('client: insert claiming tenant_id = tenant B while context = tenant A', (c) =>
    c.query(`INSERT INTO client (tenant_id, client_type, display_name, normalized_name, status) VALUES ($1, 'individual', 'Sneaky', 'sneaky', 'active')`, [tenantBId])
  );
  await expectRejected('tenant_feature: insert claiming tenant_id = tenant B while context = tenant A', (c) =>
    c.query(`INSERT INTO tenant_feature (tenant_id, feature_key) VALUES ($1, 'sneaky_feature')`, [tenantBId])
  );

  // Composite-FK case — referencing tenant A's own matter but claiming tenant B's
  // tenant_id; the composite FK (matter_id, tenant_id) -> matter(id, tenant_id)
  // catches this before RLS's WITH CHECK even gets a chance to.
  await expectRejected('assignment: insert claiming tenant_id = tenant B but referencing tenant A\'s matter', (c) =>
    c.query(`INSERT INTO assignment (tenant_id, matter_id, user_id, role, effective_from) VALUES ($1, $2, $3, 'X', now())`, [tenantBId, idsA.matter, idsA.user])
  );
  await expectRejected('proceeding: insert claiming tenant_id = tenant B but referencing tenant A\'s matter', (c) =>
    c.query(`INSERT INTO proceeding (tenant_id, matter_id, court_forum_id, platform_case_type_id, status) VALUES ($1, $2, (SELECT id FROM court_forum LIMIT 1), (SELECT id FROM case_type LIMIT 1), 'pending')`, [tenantBId, idsA.matter])
  );
}

// ----------------------------------------------------------------------------
// SECTION 6 (review point 6) — dedicated connection-pool-reuse test
// ----------------------------------------------------------------------------

async function testConnectionPoolReuse(tenantAId) {
  console.log('\n=== Section: dedicated connection-pool-reuse test (max:1 pool, guaranteed same connection) ===');
  // A separate pool with max:1 GUARANTEES both requests below use the literal
  // same underlying TCP connection — no ambiguity about whether reuse happened.
  const soloPool = new Pool({ connectionString: 'postgresql://app_user:app_pass@localhost:5432/legal_erp_dev', max: 1 });

  const client1 = await soloPool.connect();
  await client1.query('BEGIN');
  await client1.query(`SET LOCAL app.current_tenant = '${tenantAId}'`);
  const withContext = await client1.query(`SELECT count(*) FROM client`);
  await client1.query('COMMIT');
  client1.release();

  // Second "request" — pool max:1 forces this to be the SAME physical connection.
  const client2 = await soloPool.connect();
  let crashed = false;
  let rowCount = null;
  try {
    await client2.query('BEGIN');
    // Deliberately no SET LOCAL here — this is the exact scenario from review point 6.
    const noContext = await client2.query(`SELECT count(*) FROM client`);
    rowCount = parseInt(noContext.rows[0].count, 10);
    await client2.query('COMMIT');
  } catch (e) {
    crashed = true;
  } finally {
    client2.release();
  }

  check('Connection-pool safety', 'First request (with SET LOCAL) sees its tenant\'s data', parseInt(withContext.rows[0].count, 10) === 1);
  check('Connection-pool safety', 'Second request on the SAME reused connection, no SET LOCAL, does NOT throw', !crashed);
  check('Connection-pool safety', 'Second request on the SAME reused connection, no SET LOCAL, returns ZERO rows', rowCount === 0);

  await soloPool.end();
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

async function main() {
  try {
    const platform = await seedPlatformData();
    console.log('\n=== Setup: seeding full 18-table cluster for two tenants ===');
    const A = await seedTenantCluster('Tenant A', 'tenant-a-r1', platform, false);
    const B = await seedTenantCluster('Tenant B', 'tenant-b-r1', platform, true);
    console.log(`  Tenant A: ${A.tenantId}`);
    console.log(`  Tenant B: ${B.tenantId}`);

    await verifyRlsEnabledEverywhere();
    await testAllCheckConstraintsIndividually(A.tenantId, A.ids);
    await testReadIsolationAllTables(A.tenantId, B.tenantId, A.ids, B.ids);
    await testCrossTenantInsertRejection(A.tenantId, B.tenantId, A.ids);
    await testConnectionPoolReuse(A.tenantId);

    console.log(`\n=== Results: ${pass} passed, ${fail} failed (${results.length} total assertions) ===\n`);

    require('fs').writeFileSync(
      '/home/claude/legal-erp/spike-revision1-results.json',
      JSON.stringify({ pass, fail, total: results.length, results }, null, 2)
    );

    process.exit(fail > 0 ? 1 : 0);
  } catch (err) {
    console.error('Spike test crashed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
