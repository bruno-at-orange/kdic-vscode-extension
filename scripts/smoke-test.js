#!/usr/bin/env node
// scripts/smoke-test.js
//
// Runs the kdic validation logic against every .kdic file found under a target
// directory tree and reports any diagnostics.
//
// Uses the shared validator module (compiled from src/validator.ts) — the same
// logic that runs inside the VS Code extension. No duplicated validation code.
//
// Usage:
//   node scripts/smoke-test.js [directory]          # default: ~/Dev/LearningTest
//   node scripts/smoke-test.js --errors-only [dir]  # suppress warnings
//
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Load shared validator (compiled TypeScript) ──────────────────────────────
const validatorPath = path.join(__dirname, '..', 'out', 'validator.js');
if (!fs.existsSync(validatorPath)) {
  console.error('Compiled validator not found. Run `npm run compile` first.');
  process.exit(2);
}
const { validate, buildTypeMaps, stripLineComments, extractDictionaryNames, KDIC_TYPES } = require(validatorPath);

// ── Extract DERIVATION_RULES from extension source to build type maps ────────
const srcPath  = path.join(__dirname, '..', 'src', 'extension.ts');
const src      = fs.readFileSync(srcPath, 'utf8');

const RETURN_TYPE_MAP = new Map();
const PARAM_TYPE_MAP  = new Map();

const typeAlt = KDIC_TYPES.join('|');
const typeRe  = new RegExp('^(?:Block\\((' + typeAlt + ')\\)|(' + typeAlt + '))\\s+');

for (const line of src.split('\n')) {
  const m = line.match(/label:\s*'([^']+)'.*?returnType:\s*'([^']+)'.*?signature:\s*'([^']+)'/);
  if (!m) continue;
  const [, label, returnType, signature] = m;

  RETURN_TYPE_MAP.set(label, returnType);

  const inner = signature.match(/\((.+)\)/)?.[1] ?? '';
  const paramTypes = inner.split(',').map(part => {
    part = part.trim();
    if (part === '...') return '...';
    const tm = typeRe.exec(part);
    if (!tm) return 'any';
    return tm[1] ? `Block(${tm[1]})` : tm[2];
  });
  PARAM_TYPE_MAP.set(label, paramTypes);
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const errorsOnly  = args.includes('--errors-only');
const dirArg      = args.find(a => !a.startsWith('--'));
const targetDir   = dirArg
  ? dirArg.replace(/^~/, os.homedir())
  : path.join(os.homedir(), 'Dev', 'LearningTest');

// ── Minimal TextDocument mock (satisfies KdicDocument interface) ─────────────
class TextDocument {
  constructor(filePath) {
    this.uri  = filePath;
    const raw = fs.readFileSync(filePath, 'utf8');
    this._text  = raw.replace(/\r\n/g, '\n');
    this._lines = this._text.split('\n');
    this.lineCount = this._lines.length;
    this._offsets = [];
    let off = 0;
    for (const l of this._lines) {
      this._offsets.push(off);
      off += l.length + 1;
    }
  }
  getText() { return this._text; }
  lineAt(i)  { return { text: this._lines[i] ?? '' }; }
  positionAt(offset) {
    let lo = 0, hi = this._offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this._offsets[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo, character: offset - this._offsets[lo] };
  }
}

// ── Collect .kdic files recursively ──────────────────────────────────────────
function findKdicFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())                               results.push(...findKdicFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.kdic')) results.push(full);
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ERROR = 0;

console.log(`Extension source : ${srcPath}`);
console.log(`Rules loaded     : ${RETURN_TYPE_MAP.size} derivation rules`);
console.log(`Target directory : ${targetDir}`);
console.log('');

if (!fs.existsSync(targetDir)) {
  console.error(`Directory not found: ${targetDir}`);
  process.exit(2);
}

const files = findKdicFiles(targetDir);
console.log(`Found ${files.length} .kdic files — validating…\n`);

let errorFiles = 0, warningOnlyFiles = 0;
let totalErrors = 0, totalWarnings = 0;
const issueList = [];

for (const file of files) {
  let doc;
  try {
    doc = new TextDocument(file);
  } catch (e) {
    issueList.push({ file, diags: [{ line: 0, col: 0, severity: ERROR, message: `Cannot read file: ${e.message}` }] });
    errorFiles++;
    totalErrors++;
    continue;
  }

  const allDiags = validate(doc, PARAM_TYPE_MAP, RETURN_TYPE_MAP);
  const diags    = errorsOnly ? allDiags.filter(d => d.severity === ERROR) : allDiags;
  if (diags.length === 0) continue;

  const hasError = diags.some(d => d.severity === ERROR);
  if (hasError) errorFiles++;
  else          warningOnlyFiles++;
  totalErrors   += diags.filter(d => d.severity === ERROR).length;
  totalWarnings += diags.filter(d => d.severity !== ERROR).length;
  issueList.push({ file, diags });
}

// Sort: errors-first, then alphabetically
issueList.sort((a, b) => {
  const ae = a.diags.some(d => d.severity === ERROR) ? 0 : 1;
  const be = b.diags.some(d => d.severity === ERROR) ? 0 : 1;
  return ae - be || a.file.localeCompare(b.file);
});

for (const { file, diags } of issueList) {
  const rel = path.relative(targetDir, file);
  console.log(rel);
  for (const d of diags) {
    const sev = d.severity === ERROR ? 'error  ' : 'warning';
    console.log(`  ${sev}  ${d.line + 1}:${d.col + 1}  ${d.message}`);
  }
}

const cleanFiles = files.length - errorFiles - warningOnlyFiles;
console.log('─'.repeat(60));
console.log(`Files   : ${files.length} total — ${cleanFiles} clean, ${warningOnlyFiles} warnings only, ${errorFiles} errors`);
console.log(`Issues  : ${totalErrors} errors, ${totalWarnings} warnings`);

if (totalErrors === 0 && totalWarnings === 0) {
  console.log('\nAll files passed with no issues.');
}
process.exit(totalErrors > 0 ? 1 : 0);
