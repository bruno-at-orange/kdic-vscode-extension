# Khiops Dictionary Language Extension

VS Code extension providing language support for `.kdic` files (Khiops dictionary format).
**Entirely AI-maintained.** Grammar reference: <https://khiops.org/api-docs/kdic/dictionary-files/>

## Architecture

All language logic lives in **one file**: `src/extension.ts`.
Syntax highlighting is declarative: `syntaxes/kdic.tmLanguage.json`.
Snippets: `snippets/kdic.code-snippets`. Language config: `language-configuration.json`.

### Data tables (top of `extension.ts`)

| Constant | Purpose |
|---|---|
| `KEYWORDS` | Completion + hover for `Dictionary`, `Root`, `Unused` |
| `NATIVE_TYPES`, `ADVANCED_TYPES` | Type completions |
| `DERIVATION_RULES` | ~100 built-in functions — `signature` drives param-type map, `returnType` drives return-type map |
| `PARAM_TYPE_MAP` / `RETURN_TYPE_MAP` | Auto-derived from `DERIVATION_RULES` at load time — **never edit manually** |

### `KDIC_TYPES` — order is significant

```ts
const KDIC_TYPES = [
  'Categorical', 'Numerical', 'TextList', 'Text',
  'Date', 'TimestampTZ', 'Timestamp', 'Time',
  'Table', 'Entity', 'Structure',
];
```

Longer / more-specific names must come before shorter ones (`TimestampTZ` before `Timestamp`,
`TextList` before `Text`). Used to build the `typeAlt` regex alternation used everywhere.

### `activate()`

Registers the completion provider, hover provider, and diagnostic collection.
Subscribes `validateDocument` to document open / change / save events.

### `validateDocument()` — two independent passes

**Pass 1 — block loop** (`while i < text.length`): finds each `{ … }` dictionary block,
collects variable types into `vars`, then runs four checks:

1. Return-type mismatch (declared type vs. derivation rule return type)
2. Argument-type mismatch (argument variables vs. `PARAM_TYPE_MAP`)
3. Key-field type check (fields listed in the dictionary key must be `Categorical`)
4. Unknown-dictionary check (`Table(X)` / `Entity(X)` must reference a declared dictionary)

**Pass 2 — line loop** (`for li`): line-by-line grammar validation:

- Check 1: non-metadata / non-comment content after `;`
- Check 2: line matches `outsidePatterns` or `insidePatterns`
- Check 3: missing `;` at end of a complete variable declaration
- Check 4: missing `;` after dictionary closing `}`

All diagnostics use `diag.source = 'kdic'`.

## Build & run

```bash
npm install       # first time only
npm run compile   # tsc -p ./
npm run watch     # tsc -watch -p ./  (incremental)
```

Press **F5** in VS Code to launch an Extension Development Host.
Smoke test: `node scripts/smoke-test.js`
No automated test suite — validate with `test.kdic` in the dev host.

## Key conventions

- Adding a derivation rule: **append to `DERIVATION_RULES` only** — maps rebuild automatically.
- Adding a type: add to `NATIVE_TYPES` / `ADVANCED_TYPES` **and** insert at the correct position
  in `KDIC_TYPES`.
- Diagnostic severity: **Error** for definite violations (type mismatch, missing `;`, unknown
  reference); **Warning** for unrecognised lines that might be non-kdic content.
- Grammar patterns are regexes matched against the trimmed, comment-stripped line. Keep them
  focused — one concern per pattern.
