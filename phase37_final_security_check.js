const fs = require("fs");
const file = "./tenant_context.js";
const source = fs.readFileSync(file, "utf8");
const checks = {
  "Uses Prisma transaction": source.includes("prisma.$transaction(async (tx)"),
  "Uses transaction-local set_config": source.includes("set_config(") && source.includes("true"),
  "Uses parameterized executeRaw": source.includes("tx.$executeRaw"),
  "Rejects invalid tenant UUID": source.includes("Invalid tenantId"),
  "Runs work through tx": source.includes("return work(tx)"),
  "No executeRawUnsafe in helper": !source.includes("$executeRawUnsafe"),
  "No persistent SET command": !/\bSET\s+app\.current_tenant\b/i.test(source)
};
console.log("=== PHASE 3.7 FINAL SECURITY CHECK ===");
let passed = true;
for (const [name, result] of Object.entries(checks)) {
  console.log(`${result ? "PASS" : "FAIL"} : ${name}`);
  if (!result) passed = false;
}
console.log("RESULT:", passed ? "PASS" : "FAIL");
if (!passed) process.exit(1);
