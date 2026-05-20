"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");

// ─────────────────────────── Completion data ────────────────────────────────

const KEYWORDS = [
    { label: 'Dictionary', kind: vscode.CompletionItemKind.Keyword, detail: 'keyword', documentation: 'Declares a new dictionary.\n\nSyntax: `[Root] Dictionary <Name> [(<key-fields>)] { ... };`', insertText: 'Dictionary ${1:Name}\n{\n\t$0\n};' },
    { label: 'Root', kind: vscode.CompletionItemKind.Keyword, detail: 'keyword', documentation: 'Tags a dictionary as the main (root) entity in a multi-table schema.\n\nSyntax: `Root Dictionary <Name> (<key-fields>) { ... };`', insertText: 'Root Dictionary ${1:Name} (${2:key})\n{\n\t$0\n};' },
    { label: 'Unused', kind: vscode.CompletionItemKind.Keyword, detail: 'keyword', documentation: 'Marks a variable as unused (excluded from analysis), while still making it available for derivation.\n\nSyntax: `Unused <type> <name> ;`' },
];

const NATIVE_TYPES = [
    { label: 'Categorical', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'String/categorical variable. Values are discrete labels.' },
    { label: 'Numerical', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'Floating-point numerical variable. Missing value: `#Missing`.' },
    { label: 'Text', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'Free text variable, used for NLP tasks.' },
    { label: 'Date', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'Date variable. Format via metadata: `<DateFormat="DD/MM/YYYY">`' },
    { label: 'Time', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'Time variable. Format via metadata: `<TimeFormat="HH.MM">`' },
    { label: 'Timestamp', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'Timestamp variable. Format: `<TimestampFormat="YYYY-MM-DD_HH:MM:SS">`' },
    { label: 'TimestampTZ', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'Timestamp with timezone. Format: `<TimestampTZFormat="YYYY-MM-DD_HH:MM:SS.zzzzz">`' },
    { label: 'TextList', kind: vscode.CompletionItemKind.TypeParameter, detail: 'native type', documentation: 'List of Text values derived from a multi-table schema.' },
];

const ADVANCED_TYPES = [
    { label: 'Entity', kind: vscode.CompletionItemKind.TypeParameter, detail: 'advanced type', documentation: '0-1 relationship in a multi-table schema.\n\nSyntax: `Entity(<DictionaryName>) <varName>;`', insertText: 'Entity(${1:DictionaryName}) ${2:varName};' },
    { label: 'Table', kind: vscode.CompletionItemKind.TypeParameter, detail: 'advanced type', documentation: '0-n relationship in a multi-table schema.\n\nSyntax: `Table(<DictionaryName>) <varName>;`', insertText: 'Table(${1:DictionaryName}) ${2:varName};' },
    { label: 'Structure', kind: vscode.CompletionItemKind.TypeParameter, detail: 'advanced type (internal)', documentation: 'Used internally by Khiops to store model parameters.\n\nSyntax: `Structure(<name>) <varName>;`', insertText: 'Structure(${1:name}) ${2:varName};' },
];

const DERIVATION_RULES = [
    // Numerical comparisons
    { label: 'EQ', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · numerical comparison', signature: 'EQ(Numerical value1, Numerical value2)', documentation: 'Equality test (returns 0 or 1). Missing is treated as less than any valid value.' },
    { label: 'NEQ', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · numerical comparison', signature: 'NEQ(Numerical value1, Numerical value2)', documentation: 'Inequality test (returns 0 or 1).' },
    { label: 'G', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · numerical comparison', signature: 'G(Numerical value1, Numerical value2)', documentation: 'Greater than (returns 0 or 1).' },
    { label: 'GE', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · numerical comparison', signature: 'GE(Numerical value1, Numerical value2)', documentation: 'Greater than or equal (returns 0 or 1).' },
    { label: 'L', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · numerical comparison', signature: 'L(Numerical value1, Numerical value2)', documentation: 'Less than (returns 0 or 1).' },
    { label: 'LE', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · numerical comparison', signature: 'LE(Numerical value1, Numerical value2)', documentation: 'Less than or equal (returns 0 or 1).' },
    // Categorical comparisons
    { label: 'EQc', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · categorical comparison', signature: 'EQc(Categorical value1, Categorical value2)', documentation: 'Categorical equality test (returns 0 or 1).' },
    { label: 'NEQc', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · categorical comparison', signature: 'NEQc(Categorical value1, Categorical value2)', documentation: 'Categorical inequality test (returns 0 or 1).' },
    { label: 'Gc', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · categorical comparison', signature: 'Gc(Categorical value1, Categorical value2)', documentation: 'Lexicographic greater than for categorical values (returns 0 or 1).' },
    { label: 'GEc', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · categorical comparison', signature: 'GEc(Categorical value1, Categorical value2)', documentation: 'Lexicographic greater than or equal for categorical values (returns 0 or 1).' },
    { label: 'Lc', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · categorical comparison', signature: 'Lc(Categorical value1, Categorical value2)', documentation: 'Lexicographic less than for categorical values (returns 0 or 1).' },
    { label: 'LEc', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · categorical comparison', signature: 'LEc(Categorical value1, Categorical value2)', documentation: 'Lexicographic less than or equal for categorical values (returns 0 or 1).' },
    // Logical
    { label: 'And', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · logical', signature: 'And(Numerical value1, ...)', documentation: 'Logical AND of boolean (0/1) values.' },
    { label: 'Or', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · logical', signature: 'Or(Numerical value1, ...)', documentation: 'Logical OR of boolean (0/1) values.' },
    { label: 'Not', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · logical', signature: 'Not(Numerical value)', documentation: 'Logical NOT of a boolean (0/1) value.' },
    { label: 'If', kind: vscode.CompletionItemKind.Function, detail: '· logical', signature: 'If(Numerical condition, value1, value2)', documentation: 'Returns value1 if condition != 0, else value2.' },
    // Conversion
    { label: 'Copy', kind: vscode.CompletionItemKind.Function, detail: '· conversion', signature: 'Copy(value)', documentation: 'Copies a variable value.' },
    { label: 'AsNumerical', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · conversion', signature: 'AsNumerical(Categorical value)', documentation: 'Converts a categorical value to numerical.' },
    { label: 'AsCategorical', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · conversion', signature: 'AsCategorical(Numerical value)', documentation: 'Converts a numerical value to categorical.' },
    { label: 'AsDate', kind: vscode.CompletionItemKind.Function, detail: 'Date · conversion', signature: 'AsDate(Categorical value, Categorical format)', documentation: 'Parses a string into a Date.\n\nExample: `AsDate("2014-01-15", "YYYY-MM-DD")`' },
    { label: 'AsTime', kind: vscode.CompletionItemKind.Function, detail: 'Time · conversion', signature: 'AsTime(Categorical value, Categorical format)', documentation: 'Parses a string into a Time.' },
    { label: 'AsTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'Timestamp · conversion', signature: 'AsTimestamp(Categorical value, Categorical format)', documentation: 'Parses a string into a Timestamp.' },
    // Math
    { label: 'FormatNumerical', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · math', signature: 'FormatNumerical(Numerical value, Numerical width, Numerical precision)', documentation: 'Formats a number as a string.\n\nExample: `FormatNumerical(3.14, 0, 2)` → `"3.14"`' },
    { label: 'Sum', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Sum(Numerical value1, ...)', documentation: 'Sum of numerical values.' },
    { label: 'Minus', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Minus(Numerical value)', documentation: 'Negation of a numerical value.' },
    { label: 'Diff', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Diff(Numerical value1, Numerical value2)', documentation: 'Difference between two values.' },
    { label: 'Product', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Product(Numerical value1, ...)', documentation: 'Product of numerical values.' },
    { label: 'Divide', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Divide(Numerical value1, Numerical value2)', documentation: 'Ratio of two values.' },
    { label: 'Index', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Index()', documentation: 'Record index in the data file (1-based).' },
    { label: 'Random', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Random()', documentation: 'Random number in [0, 1]. Seed is fixed per database read.' },
    { label: 'Round', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Round(Numerical value)', documentation: 'Nearest integer.' },
    { label: 'Floor', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Floor(Numerical value)', documentation: 'Largest integer ≤ value.' },
    { label: 'Ceil', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Ceil(Numerical value)', documentation: 'Smallest integer ≥ value.' },
    { label: 'Abs', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Abs(Numerical value)', documentation: 'Absolute value.' },
    { label: 'Sign', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Sign(Numerical value)', documentation: 'Sign: 1 if ≥ 0, -1 if < 0.' },
    { label: 'Mod', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Mod(Numerical value1, Numerical value2)', documentation: 'Modulo: `value1 – value2 * Floor(value1/value2)`.' },
    { label: 'Log', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Log(Numerical value)', documentation: 'Natural logarithm.' },
    { label: 'Exp', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Exp(Numerical value)', documentation: 'Exponential (eˣ).' },
    { label: 'Power', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Power(Numerical value1, Numerical value2)', documentation: 'Power: value1^value2.' },
    { label: 'Sqrt', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Sqrt(Numerical value)', documentation: 'Square root.' },
    { label: 'Sin', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Sin(Numerical value)', documentation: 'Sine.' },
    { label: 'Cos', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Cos(Numerical value)', documentation: 'Cosine.' },
    { label: 'Tan', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Tan(Numerical value)', documentation: 'Tangent.' },
    { label: 'ASin', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'ASin(Numerical value)', documentation: 'Arc-sine.' },
    { label: 'ACos', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'ACos(Numerical value)', documentation: 'Arc-cosine.' },
    { label: 'ATan', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'ATan(Numerical value)', documentation: 'Arc-tangent.' },
    { label: 'Pi', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Pi()', documentation: 'Pi constant.' },
    { label: 'Mean', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Mean(Numerical value1, ...)', documentation: 'Mean of values.' },
    { label: 'StdDev', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'StdDev(Numerical value1, ...)', documentation: 'Standard deviation.' },
    { label: 'Min', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Min(Numerical value1, ...)', documentation: 'Minimum (non-missing).' },
    { label: 'Max', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'Max(Numerical value1, ...)', documentation: 'Maximum (non-missing).' },
    { label: 'ArgMin', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'ArgMin(Numerical value1, ...)', documentation: 'Index (1-based) of the minimum value.' },
    { label: 'ArgMax', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · math', signature: 'ArgMax(Numerical value1, ...)', documentation: 'Index (1-based) of the maximum value.' },
    // String
    { label: 'Length', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · string', signature: 'Length(Categorical value)', documentation: 'String length.' },
    { label: 'Left', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'Left(Categorical value, Numerical n)', documentation: 'Left n characters.' },
    { label: 'Right', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'Right(Categorical value, Numerical n)', documentation: 'Right n characters.' },
    { label: 'Middle', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'Middle(Categorical value, Numerical start, Numerical n)', documentation: 'Substring: n characters from start (1-based).' },
    { label: 'Search', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · string', signature: 'Search(Categorical value, Categorical pattern)', documentation: 'Position (1-based) of first occurrence. Returns 0 if not found.' },
    { label: 'Replace', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'Replace(Categorical value, Categorical pattern, Categorical replacement)', documentation: 'Replaces first occurrence of pattern.' },
    { label: 'ReplaceAll', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'ReplaceAll(Categorical value, Categorical pattern, Categorical replacement)', documentation: 'Replaces all occurrences of pattern.' },
    { label: 'Concat', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'Concat(Categorical value1, ...)', documentation: 'Concatenates strings.' },
    { label: 'UpperCase', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'UpperCase(Categorical value)', documentation: 'Upper-case conversion.' },
    { label: 'LowerCase', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · string', signature: 'LowerCase(Categorical value)', documentation: 'Lower-case conversion.' },
    { label: 'Hash', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · string', signature: 'Hash(Categorical value)', documentation: 'Hash code of a string.' },
    { label: 'RegexMatch', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · string', signature: 'RegexMatch(Categorical value, Categorical regex)', documentation: 'Returns 1 if the value matches the regex, 0 otherwise.' },
    // Date
    { label: 'Year', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'Year(Date date)', documentation: 'Year of a date.' },
    { label: 'Month', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'Month(Date date)', documentation: 'Month (1–12).' },
    { label: 'Day', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'Day(Date date)', documentation: 'Day of month (1–31).' },
    { label: 'YearDay', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'YearDay(Date date)', documentation: 'Day of year (1–366).' },
    { label: 'Week', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'Week(Date date)', documentation: 'ISO week number.' },
    { label: 'WeekDay', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'WeekDay(Date date)', documentation: 'Day of week (1=Mon … 7=Sun).' },
    { label: 'DecimalYear', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'DecimalYear(Date date)', documentation: 'Date as decimal year.' },
    { label: 'DiffDate', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · date', signature: 'DiffDate(Date date1, Date date2)', documentation: 'Difference in days.' },
    { label: 'FormatDate', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · date', signature: 'FormatDate(Date date, Categorical format)', documentation: 'Formats a Date as a string.' },
    // Time
    { label: 'Hour', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · time', signature: 'Hour(Time time)', documentation: 'Hour (0–23).' },
    { label: 'Minute', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · time', signature: 'Minute(Time time)', documentation: 'Minute (0–59).' },
    { label: 'Second', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · time', signature: 'Second(Time time)', documentation: 'Second (0–59).' },
    { label: 'DecimalTime', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · time', signature: 'DecimalTime(Time time)', documentation: 'Time as decimal seconds since midnight.' },
    { label: 'DiffTime', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · time', signature: 'DiffTime(Time time1, Time time2)', documentation: 'Difference in seconds.' },
    { label: 'FormatTime', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · time', signature: 'FormatTime(Time time, Categorical format)', documentation: 'Formats a Time as a string.' },
    // Timestamp
    { label: 'GetDate', kind: vscode.CompletionItemKind.Function, detail: 'Date · timestamp', signature: 'GetDate(Timestamp ts)', documentation: 'Date part of a Timestamp.' },
    { label: 'GetTime', kind: vscode.CompletionItemKind.Function, detail: 'Time · timestamp', signature: 'GetTime(Timestamp ts)', documentation: 'Time part of a Timestamp.' },
    { label: 'DecimalTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · timestamp', signature: 'DecimalTimestamp(Timestamp ts)', documentation: 'Timestamp as decimal seconds since epoch.' },
    { label: 'DiffTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · timestamp', signature: 'DiffTimestamp(Timestamp ts1, Timestamp ts2)', documentation: 'Difference in seconds between two timestamps.' },
    { label: 'FormatTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · timestamp', signature: 'FormatTimestamp(Timestamp ts, Categorical format)', documentation: 'Formats a Timestamp as a string.' },
    // Table
    { label: 'TableCount', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableCount(Table table)', documentation: 'Number of records in a table.\n\nReturns missing when table is empty.' },
    { label: 'TableCountDistinct', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableCountDistinct(Table table, Categorical value)', documentation: 'Number of distinct categorical values. Missing counts as a special value.' },
    { label: 'TableEntropy', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableEntropy(Table table, Categorical value)', documentation: 'Entropy of a categorical variable across a table.' },
    { label: 'TableMode', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · table', signature: 'TableMode(Table table, Categorical value)', documentation: 'Most frequent categorical value. Ties resolved lexicographically.' },
    { label: 'TableModeAt', kind: vscode.CompletionItemKind.Function, detail: 'Categorical · table', signature: 'TableModeAt(Table table, Categorical value, Numerical rank)', documentation: 'N-th most frequent value.' },
    { label: 'TableMean', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableMean(Table table, Numerical value)', documentation: 'Mean of numerical values (non-missing only).' },
    { label: 'TableStdDev', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableStdDev(Table table, Numerical value)', documentation: 'Standard deviation of numerical values.' },
    { label: 'TableMedian', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableMedian(Table table, Numerical value)', documentation: 'Median of numerical values.' },
    { label: 'TableMin', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableMin(Table table, Numerical value)', documentation: 'Minimum of numerical values.' },
    { label: 'TableMax', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableMax(Table table, Numerical value)', documentation: 'Maximum of numerical values.' },
    { label: 'TableSum', kind: vscode.CompletionItemKind.Function, detail: 'Numerical · table', signature: 'TableSum(Table table, Numerical value)', documentation: 'Sum of numerical values.' },
    // Table management
    { label: 'TableSelection', kind: vscode.CompletionItemKind.Function, detail: 'Table · table management', signature: 'TableSelection(Table table, Numerical condition)', documentation: 'Filters records where condition != 0.\n\nExample: `TableSelection(DNA, EQc(Char, .MostFrequentChar))`' },
    { label: 'TableAt', kind: vscode.CompletionItemKind.Function, detail: 'Entity · table management', signature: 'TableAt(Table table, Numerical rank)', documentation: 'Record at given rank (1-based).' },
    { label: 'TableHead', kind: vscode.CompletionItemKind.Function, detail: 'Table · table management', signature: 'TableHead(Table table, Numerical n)', documentation: 'First n records.' },
    { label: 'TableTail', kind: vscode.CompletionItemKind.Function, detail: 'Table · table management', signature: 'TableTail(Table table, Numerical n)', documentation: 'Last n records.' },
    { label: 'TableSort', kind: vscode.CompletionItemKind.Function, detail: 'Table · table management', signature: 'TableSort(Table table, value, ...)', documentation: 'Returns the table sorted by the given values.' },
];

// ─────────────────────────── Helper functions ────────────────────────────────

function extractDictionaryNames(document) {
    const names = [];
    const pattern = /\bDictionary\s+(`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)/g;
    const text = document.getText();
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const raw = match[1];
        const name = raw.startsWith('`') ? raw.slice(1, -1).replace(/``/g, '`') : raw;
        if (!names.includes(name)) {
            names.push(name);
        }
    }
    return names;
}

function isInsideDictionaryBlock(document, position) {
    const textUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const stripped = textUpToCursor
        .replace(/\/\/[^\n]*/g, '')
        .replace(/"(?:[^"]|"")*"/g, '""')
        .replace(/`(?:[^`]|``)*`/g, '``');
    let depth = 0;
    for (const ch of stripped) {
        if (ch === '{') { depth++; }
        else if (ch === '}') { depth = Math.max(0, depth - 1); }
    }
    return depth > 0;
}

function isInDerivationContext(linePrefix) {
    const withoutMeta = linePrefix.replace(/<[^>]*>/g, '');
    return withoutMeta.includes('=');
}

function isAfterRelationalTypeParens(linePrefix) {
    return /\b(?:Entity|Table)\s*\(\s*$/.test(linePrefix);
}

// ─────────────────────────── Extension activation ───────────────────────────

function activate(context) {
    const provider = vscode.languages.registerCompletionItemProvider(
        { language: 'kdic' },
        {
            provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position).text.substring(0, position.character);

                // Skip completions inside comments
                const commentIdx = linePrefix.indexOf('//');
                if (commentIdx !== -1 && position.character > commentIdx) {
                    return [];
                }

                const items = [];

                // ── Context: right after Entity( or Table( ────────────────────
                if (isAfterRelationalTypeParens(linePrefix)) {
                    const dictNames = extractDictionaryNames(document);
                    for (const name of dictNames) {
                        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
                        item.detail = 'dictionary name';
                        item.documentation = new vscode.MarkdownString(`Referenced dictionary: **${name}**`);
                        items.push(item);
                    }
                    return items;
                }

                const insideBlock = isInsideDictionaryBlock(document, position);

                // ── Context: top-level (outside dictionary block) ─────────────
                if (!insideBlock) {
                    for (const kw of KEYWORDS) {
                        const item = new vscode.CompletionItem(kw.label, kw.kind);
                        item.detail = kw.detail;
                        item.documentation = new vscode.MarkdownString(kw.documentation);
                        if (kw.insertText) {
                            item.insertText = new vscode.SnippetString(kw.insertText);
                        }
                        items.push(item);
                    }
                    return items;
                }

                // ── Context: inside dictionary block ──────────────────────────
                const inDerivation = isInDerivationContext(linePrefix);

                if (!inDerivation) {
                    // Offer Unused modifier
                    const unusedKw = KEYWORDS.find(k => k.label === 'Unused');
                    if (unusedKw) {
                        const item = new vscode.CompletionItem(unusedKw.label, unusedKw.kind);
                        item.detail = unusedKw.detail;
                        item.documentation = new vscode.MarkdownString(unusedKw.documentation);
                        items.push(item);
                    }
                    // Offer native types
                    for (const t of NATIVE_TYPES) {
                        const item = new vscode.CompletionItem(t.label, t.kind);
                        item.detail = t.detail;
                        item.documentation = new vscode.MarkdownString(t.documentation);
                        items.push(item);
                    }
                    // Offer advanced types
                    for (const t of ADVANCED_TYPES) {
                        const item = new vscode.CompletionItem(t.label, t.kind);
                        item.detail = t.detail;
                        item.documentation = new vscode.MarkdownString(t.documentation);
                        if (t.insertText) {
                            item.insertText = new vscode.SnippetString(t.insertText);
                        }
                        items.push(item);
                    }
                }

                // Derivation rules always available inside a block
                for (const fn of DERIVATION_RULES) {
                    const item = new vscode.CompletionItem(fn.label, fn.kind);
                    item.detail = fn.detail;
                    item.documentation = new vscode.MarkdownString(
                        '```\n' + fn.signature + '\n```\n\n' + fn.documentation
                    );
                    item.insertText = new vscode.SnippetString(fn.label + '($0)');
                    items.push(item);
                }

                return items;
            },
        },
        '(', ' ', '\t',
    );

    context.subscriptions.push(provider);
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;
