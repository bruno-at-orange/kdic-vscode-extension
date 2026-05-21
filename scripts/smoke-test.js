#!/usr/bin/env node
// scripts/smoke-test.js
//
// Runs the kdic validation logic (grammar + type checks) against every .kdic
// file found under a target directory tree and reports any diagnostics.
//
// The validation rules are read live from src/extension.ts so the script is
// always in sync with the extension — no duplication needed.
//
// Usage:
//   node scripts/smoke-test.js [directory]          # default: ~/Dev/LearningTest
//   node scripts/smoke-test.js --errors-only [dir]  # suppress warnings
//
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const errorsOnly  = args.includes('--errors-only');
const dirArg      = args.find(a => !a.startsWith('--'));
const targetDir   = dirArg
  ? dirArg.replace(/^~/, os.homedir())
  : path.join(os.homedir(), 'Dev', 'LearningTest');
const srcPath     = path.join(__dirname, '..', 'src', 'extension.ts');

// ── Read src/extension.ts once ────────────────────────────────────────────────
const src = fs.readFileSync(srcPath, 'utf8');

// ── Extract KDIC_TYPES ────────────────────────────────────────────────────────
// Matches: const KDIC_TYPES = [ 'A', 'B', ... ];
const ktBlock = src.match(/const KDIC_TYPES\s*=\s*\[([^\]]+)\]/);
const KDIC_TYPES = ktBlock
  ? [...ktBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1])
  : ['Categorical','Numerical','TextList','Text','Date','TimestampTZ','Timestamp','Time','Table','Entity','Structure'];

// ── Extract RETURN_TYPE_MAP and PARAM_TYPE_MAP from DERIVATION_RULES ──────────
// Each rule is on a single long line; we extract label, returnType, signature.
const RETURN_TYPE_MAP = new Map();
const PARAM_TYPE_MAP  = new Map();

const typeAlt = KDIC_TYPES.join('|');
const typeRe  = new RegExp('^(' + typeAlt + ')\\s+');

for (const line of src.split('\n')) {
  // label: 'X' ... returnType: 'Y' ... signature: 'Z'
  const m = line.match(/label:\s*'([^']+)'.*?returnType:\s*'([^']+)'.*?signature:\s*'([^']+)'/);
  if (!m) continue;
  const [, label, returnType, signature] = m;

  RETURN_TYPE_MAP.set(label, returnType);

  // Parse param types from signature exactly as the extension does
  const inner = signature.match(/\((.+)\)/)?.[1] ?? '';
  const paramTypes = inner.split(',').map(part => {
    part = part.trim();
    if (part === '...') return '...';
    const tm = typeRe.exec(part);
    return tm ? tm[1] : 'any';
  });
  PARAM_TYPE_MAP.set(label, paramTypes);
}

// ── Minimal vscode.TextDocument mock ─────────────────────────────────────────
class TextDocument {
  constructor(filePath) {
    this.uri  = filePath;
    const raw = fs.readFileSync(filePath, 'utf8');
    // Normalise to LF so split counts are consistent
    this._text  = raw.replace(/\r\n/g, '\n');
    this._lines = this._text.split('\n');
    this.lineCount = this._lines.length;
    // Build cumulative offset table: _offsets[i] = byte offset of line i
    this._offsets = [];
    let off = 0;
    for (const l of this._lines) {
      this._offsets.push(off);
      off += l.length + 1; // +1 for '\n'
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

// ── Diagnostic helpers ────────────────────────────────────────────────────────
const ERROR   = 0;
const WARNING = 1;

function mkDiag(line, col, severity, message) {
  return { line, col, severity, message };
}

// ── Core validation (faithfully ported from extension.ts validateDocument) ────
function validateDocument(document) {
  const diags = [];
  // Strip // comments in place (preserve offsets)
  const text = document.getText().replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));

  const varDeclRe = new RegExp(
    '(?:Unused\\s+)?(' + typeAlt + ')(?:\\([^)]*\\))?\\s+(`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)(?:\\s*\\[[^\\]]*\\])?\\s*(?:=[^;]*)?;',
    'g',
  );
  const callRe = /=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)/g;

  let i = 0;
  while (i < text.length) {
    const braceOpen = text.indexOf('{', i);
    if (braceOpen === -1) break;

    let depth = 1, j = braceOpen + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const blockStart = braceOpen + 1;
    const blockText  = text.slice(blockStart, j - 1);

    // Collect variable types in this block
    const vars = new Map();
    varDeclRe.lastIndex = 0;
    let vm;
    while ((vm = varDeclRe.exec(blockText)) !== null) {
      const raw  = vm[2];
      const name = raw.startsWith('`') ? raw.slice(1, -1).replace(/``/g, '`') : raw;
      vars.set(name, vm[1]);
    }

    // ── Return-type check ─────────────────────────────────────────────────
    const derivedDeclRe = new RegExp(
      '(?:Unused\\s+)?(' + typeAlt + ')(?:\\([^)]*\\))?\\s+(?:`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\([^()]*\\)',
      'g',
    );
    derivedDeclRe.lastIndex = 0;
    let dm;
    while ((dm = derivedDeclRe.exec(blockText)) !== null) {
      const declaredType = dm[1];
      const fnName       = dm[2];
      const returnType   = RETURN_TYPE_MAP.get(fnName);
      if (!returnType || returnType === 'any') continue;
      if (returnType.split('|').includes(declaredType)) continue;
      const typeOff = dm[0].indexOf(declaredType);
      const pos = document.positionAt(blockStart + dm.index + typeOff);
      diags.push(mkDiag(pos.line, pos.character, ERROR,
        `'${fnName}' returns '${returnType}' but variable is declared as '${declaredType}'.`));
    }

    // ── Argument-type check ───────────────────────────────────────────────
    callRe.lastIndex = 0;
    let cm;
    while ((cm = callRe.exec(blockText)) !== null) {
      const fnName     = cm[1];
      const paramTypes = PARAM_TYPE_MAP.get(fnName);
      if (!paramTypes) continue;

      const args       = cm[2].split(',').map(a => a.trim()).filter(a => a.length > 0);
      const hasVararg  = paramTypes[paramTypes.length - 1] === '...';
      const baseTypes  = hasVararg ? paramTypes.slice(0, -1) : paramTypes;

      let searchFrom = cm[0].indexOf('(') + 1;
      for (let ai = 0; ai < args.length; ai++) {
        const arg      = args[ai];
        const posInCall = cm[0].indexOf(arg, searchFrom);
        if (posInCall !== -1) searchFrom = posInCall + arg.length;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) continue;

        const expected =
          ai < baseTypes.length ? baseTypes[ai]
          : 'any'; // '...' varargs: positions beyond explicit params are unchecked
        if (expected === 'any' || expected === '...') continue;

        const actual = vars.get(arg);
        if (actual === undefined) continue; // cross-table ref — skip

        if (actual !== expected) {
          const argOff = blockStart + cm.index + (posInCall !== -1 ? posInCall : cm[0].indexOf('(') + 1);
          const pos    = document.positionAt(argOff);
          diags.push(mkDiag(pos.line, pos.character, ERROR,
            `'${arg}' is '${actual}' but '${fnName}' expects '${expected}' for argument ${ai + 1}.`));
        }
      }
    }

    i = j;
  }

  // ── Line-level grammar check ──────────────────────────────────────────────
  // Metadata-only line: one or more <key>, <key=value>, or <key="..."> tags.
  // The quoted-value branch allows '>' inside the double-quoted string.
  const metaOnlyRe = /^(<[A-Za-z_][A-Za-z0-9_]*(?:=(?:"[^"]*(?:""[^"]*)*"|[^"<>\s]*))?> *)+$/;
  const outsidePatterns = [
    /^$/,
    /^#Khiops\b/,
    /^(Root\s+)?Dictionary\b/,
    metaOnlyRe,
    /^\([^)]*\)\s*$/,              // dictionary key list on its own line: (KeyField1, KeyField2)
    /^\{$/,
    /^\};?$/,
  ];
  const insidePatterns = [
    /^$/,
    /^\{$/,                        // sparse rules sub-block opening
    /^\}\s+\S/,                    // sparse rules sub-block closer: } BlockName [= derivation] ;
    /^\};?$/,
    metaOnlyRe,
    new RegExp('^(Unused\\s+)?(' + typeAlt + ')(\\([^)]*\\))?\\s+'),
  ];

  const strippedLines = text.split('\n');
  let lineDepth = 0;
  // parenDepth tracks unclosed '(' from previous lines (multi-line derivations).
  // When > 0, the current line is a derivation continuation — skip grammar check.
  let parenDepth = 0;
  // prevLineEndsWithAssign: true when the previous (non-comment) line inside a block
  // ended with '=', meaning this line is the start of a split derivation.
  let prevLineEndsWithAssign = false;

  for (let li = 0; li < document.lineCount; li++) {
    const lineRaw    = document.lineAt(li).text;
    const trimmed    = lineRaw.trimStart();
    if (trimmed.startsWith('//')) continue;

    const strippedLine = strippedLines[li] ?? '';
    const effective    = strippedLine.trim();

    const depthBefore = lineDepth;
    // Track braces, skipping content inside backtick-quoted names and double-quoted strings
    {
      let inBt = false, inDq = false;
      for (let k = 0; k < effective.length; k++) {
        const ch = effective[k];
        if (inBt) { if (ch === '`') inBt = false; }
        else if (inDq) {
          if (ch === '"') {
            if (k + 1 < effective.length && effective[k + 1] === '"') k++; // escaped ""
            else inDq = false;
          }
        }
        else if (ch === '`') inBt = true;
        else if (ch === '"') inDq = true;
        else if (ch === '{') lineDepth++;
        else if (ch === '}') lineDepth = Math.max(0, lineDepth - 1);
      }
    }
    // Reset paren/assign trackers when we return to the top level
    if (lineDepth === 0) { parenDepth = 0; prevLineEndsWithAssign = false; }

    // Error: content after ';' that is not metadata / comment
    // Find the last ';' that is not inside a backtick-quoted identifier or double-quoted string
    const semiIdx = (() => {
      let inBt = false, inDq = false, last = -1;
      for (let k = 0; k < strippedLine.length; k++) {
        const ch = strippedLine[k];
        if (inBt) { if (ch === '`') { inBt = false; } }
        else if (inDq) {
          if (ch === '"') {
            if (k + 1 < strippedLine.length && strippedLine[k + 1] === '"') { k++; } // escaped ""
            else { inDq = false; }
          }
        } else {
          if (ch === '`') { inBt = true; }
          else if (ch === '"') { inDq = true; }
          else if (ch === ';') { last = k; }
        }
      }
      return last;
    })();
    if (semiIdx !== -1) {
      const afterSemi      = strippedLine.slice(semiIdx + 1);
      // Valid prefix: whitespace + <key[=value]> metadata blocks.
      // Quoted values (key="val") may contain '>' and use "" to escape ".
      const metaOne = /<[A-Za-z_][A-Za-z0-9_]*(?:=(?:"[^"]*(?:""[^"]*)*"|[^"<>\s]*))?>/g;
      let mEnd = 0;
      {
        const ws = afterSemi.match(/^\s*/)?.[0] ?? '';
        let pos = ws.length;
        metaOne.lastIndex = pos;
        let m;
        while ((m = metaOne.exec(afterSemi)) !== null && m.index === pos) {
          pos = metaOne.lastIndex;
          const trailingWs = afterSemi.slice(pos).match(/^\s*/)?.[0] ?? '';
          pos += trailingWs.length;
          metaOne.lastIndex = pos;
        }
        mEnd = pos;
      }
      const validPrefixLen = mEnd;
      const remainder      = afterSemi.slice(validPrefixLen);
      if (remainder.trim().length > 0) {
        const leadingWs = remainder.length - remainder.trimStart().length;
        const col = semiIdx + 1 + validPrefixLen + leadingWs;
        diags.push(mkDiag(li, col, ERROR, "Non-metadata content after ';'."));
      }
    }

    // Warning: line doesn't match any known kdic pattern.
    // Skip continuation lines of a multi-line derivation (parenDepth > 0)
    // or lines immediately following a declaration ending with '='.
    if (effective.length > 0 && parenDepth === 0 && !prevLineEndsWithAssign) {
      const patterns = depthBefore > 0 ? insidePatterns : outsidePatterns;
      if (!patterns.some(p => p.test(effective))) {
        const indentLen = lineRaw.length - trimmed.length;
        diags.push(mkDiag(li, indentLen, WARNING, 'Line does not match kdic grammar.'));
      }
    }

    // Update parenDepth: count net unquoted '(' minus ')' on this line
    if (depthBefore > 0) {
      let netParens = 0, inBtP = false, inDqP = false;
      for (let k = 0; k < effective.length; k++) {
        const ch = effective[k];
        if (inBtP) { if (ch === '`') inBtP = false; }
        else if (inDqP) {
          if (ch === '"') {
            if (k + 1 < effective.length && effective[k + 1] === '"') k++;
            else inDqP = false;
          }
        } else {
          if (ch === '`') inBtP = true;
          else if (ch === '"') inDqP = true;
          else if (ch === '(') netParens++;
          else if (ch === ')') netParens--;
        }
      }
      parenDepth = Math.max(0, parenDepth + netParens);
    }
    // Track whether this line ends with '=' (split derivation: next line has the RHS)
    prevLineEndsWithAssign = depthBefore > 0 && effective.trimEnd().endsWith('=');
  }

  return diags;
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
    issueList.push({ file, diags: [mkDiag(0, 0, ERROR, `Cannot read file: ${e.message}`)] });
    errorFiles++;
    totalErrors++;
    continue;
  }

  const allDiags = validateDocument(doc);
  const diags    = errorsOnly ? allDiags.filter(d => d.severity === ERROR) : allDiags;
  if (diags.length === 0) continue;

  const hasError = diags.some(d => d.severity === ERROR);
  if (hasError) errorFiles++;
  else          warningOnlyFiles++;
  totalErrors   += diags.filter(d => d.severity === ERROR).length;
  totalWarnings += diags.filter(d => d.severity === WARNING).length;
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
