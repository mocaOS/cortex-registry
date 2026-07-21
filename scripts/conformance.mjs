#!/usr/bin/env node
/**
 * Run the cross-validator conformance corpus against THIS repo's manifest
 * rules (scripts/lib.mjs manifestIssues).
 *
 * The corpus (conformance/manifests.json) is the shared floor enforced by
 * three independent implementations: this one, the app template's
 * validate.mjs, and cortex-app's AppService.validate_manifest. Each repo's
 * CI runs its own consumer — a rule change that reaches only one
 * implementation fails the others.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestIssues } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(join(root, "conformance", "manifests.json"), "utf8"));

let failed = 0;
for (const testCase of corpus.cases) {
  const issues = manifestIssues(testCase.manifest);
  if (testCase.valid && issues.length > 0) {
    failed++;
    console.error(`✗ ${testCase.name}: expected VALID, got: ${issues.join("; ")}`);
  } else if (!testCase.valid && issues.length === 0) {
    failed++;
    console.error(`✗ ${testCase.name}: expected INVALID, but no issues raised`);
  } else if (!testCase.valid && testCase.mention &&
             !issues.join("\n").toLowerCase().includes(testCase.mention.toLowerCase())) {
    failed++;
    console.error(`✗ ${testCase.name}: issues do not mention "${testCase.mention}": ${issues.join("; ")}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${corpus.cases.length} conformance case(s) FAILED`);
  process.exit(1);
}
console.log(`✓ ${corpus.cases.length} conformance cases pass (registry validator)`);
