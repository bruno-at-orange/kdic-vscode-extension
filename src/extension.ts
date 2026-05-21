/**
 * Khiops Dictionary (.kdic) VS Code Extension
 *
 * Provides language support for Khiops dictionary files (.kdic), including:
 *  - Syntax highlighting  (declarative, via kdic.tmLanguage.json)
 *  - Context-aware IntelliSense completions
 *  - Hover documentation for all keywords, types, and derivation rules
 *  - Derivation rule type checking (argument types + return type vs declared type)
 *  - Line-level grammar validation
 *
 * Grammar reference: https://khiops.org/api-docs/kdic/dictionary-files/
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 * KEYWORDS / NATIVE_TYPES / ADVANCED_TYPES
 *   Completion + hover data for the kdic language tokens (keywords and types).
 *
 * DERIVATION_RULES
 *   Completion + hover + type-checking data for the ~100 built-in derivation
 *   rules.  Each entry carries a human-readable `signature` and a `returnType`
 *   used by the type checker.
 *
 * PARAM_TYPE_MAP  (derived from DERIVATION_RULES at load time)
 *   Maps each rule name to its expected parameter types, parsed from `signature`.
 *   '...' marks vararg rules (e.g. Sum, And); 'any' marks untyped params.
 *
 * RETURN_TYPE_MAP  (derived from DERIVATION_RULES at load time)
 *   Maps each rule name to its return type string.  Union types such as
 *   'Numerical|Categorical' (used by If) are split on '|' when checking.
 *
 * activate()
 *   Registers the completion provider, hover provider, and diagnostic collection.
 *
 * validateDocument()
 *   Runs type checking and grammar validation on an open .kdic document.
 *
 * ── Extending the extension ───────────────────────────────────────────────────
 *
 * Adding a derivation rule: append one entry to DERIVATION_RULES with the
 *   correct `signature` (drives PARAM_TYPE_MAP) and `returnType` (drives
 *   RETURN_TYPE_MAP).  No other changes needed.
 *
 * Adding a keyword or type: append one entry to KEYWORDS, NATIVE_TYPES, or
 *   ADVANCED_TYPES.  Add the type name to KDIC_TYPES if it is a variable type.
 */
import * as vscode from 'vscode';

// ─────────────────────────── Completion data ────────────────────────────────

interface CompletionEntry {
  label: string;
  kind: vscode.CompletionItemKind;
  detail: string;
  documentation: string;
  insertText?: string;
}

const KEYWORDS: CompletionEntry[] = [
  {
    label: 'Dictionary',
    kind: vscode.CompletionItemKind.Keyword,
    detail: 'keyword',
    documentation: 'Declares a new dictionary. Syntax: [Root] Dictionary <Name> [(<key-fields>)] { ... };',
    insertText: 'Dictionary ${1:Name}\n{\n\t$0\n};',
  },
  {
    label: 'Root',
    kind: vscode.CompletionItemKind.Keyword,
    detail: 'keyword',
    documentation:
      'Tags a dictionary as the main (root) entity in a multi-table schema. Entities must be unique by key.\n\nSyntax: Root Dictionary <Name> (<key-fields>) { ... };',
    insertText: 'Root Dictionary ${1:Name} (${2:key})\n{\n\t$0\n};',
  },
  {
    label: 'Unused',
    kind: vscode.CompletionItemKind.Keyword,
    detail: 'keyword',
    documentation:
      "Marks a variable as unused (excluded from modeling/deployment), while still making it available for deriving other variables.\n\nSyntax: Unused <type> <name> ;",
  },
];

const NATIVE_TYPES: CompletionEntry[] = [
  {
    label: 'Categorical',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'String/categorical variable. Values are discrete labels.',
  },
  {
    label: 'Numerical',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'Floating-point numerical variable. Supports scientific notation (e.g. 1.3E7). Missing value: #Missing.',
  },
  {
    label: 'Text',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'Free text variable. Used for natural language processing tasks.',
  },
  {
    label: 'Date',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'Date variable. Format can be specified via metadata: <DateFormat="DD/MM/YYYY">',
  },
  {
    label: 'Time',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'Time variable. Format can be specified via metadata: <TimeFormat="HH.MM">',
  },
  {
    label: 'Timestamp',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'Timestamp variable. Format: <TimestampFormat="YYYY-MM-DD_HH:MM:SS">',
  },
  {
    label: 'TimestampTZ',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'Timestamp with timezone. Format: <TimestampTZFormat="YYYY-MM-DD_HH:MM:SS.zzzzz">',
  },
  {
    label: 'TextList',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'native type',
    documentation: 'List of Text values, derived from a multi-table schema.',
  },
];

const ADVANCED_TYPES: CompletionEntry[] = [
  {
    label: 'Entity',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'advanced type',
    documentation: 'Represents a 0-1 relationship in a multi-table schema.\n\nSyntax: Entity(<DictionaryName>) <varName>;',
    insertText: 'Entity(${1:DictionaryName}) ${2:varName};',
  },
  {
    label: 'Table',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'advanced type',
    documentation: 'Represents a 0-n relationship in a multi-table schema.\n\nSyntax: Table(<DictionaryName>) <varName>;',
    insertText: 'Table(${1:DictionaryName}) ${2:varName};',
  },
  {
    label: 'TextList',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'advanced type',
    documentation: 'Derived from a list of Text variables in a multi-table schema.',
  },
  {
    label: 'Structure',
    kind: vscode.CompletionItemKind.TypeParameter,
    detail: 'advanced type (internal)',
    documentation: 'Used internally by Khiops to store model parameters.\n\nSyntax: Structure(<name>) <varName>;',
    insertText: 'Structure(${1:name}) ${2:varName};',
  },
];

interface FunctionEntry extends CompletionEntry {
  signature: string;
  returnType: string;
}

const DERIVATION_RULES: FunctionEntry[] = [
  // Numerical comparisons
  { label: 'EQ', kind: vscode.CompletionItemKind.Function, detail: 'numerical comparison', returnType: 'Numerical', signature: 'EQ(Numerical value1, Numerical value2)', documentation: 'Equality test (returns 0 or 1). Missing value is treated as less than any valid value.' },
  { label: 'NEQ', kind: vscode.CompletionItemKind.Function, detail: 'numerical comparison', returnType: 'Numerical', signature: 'NEQ(Numerical value1, Numerical value2)', documentation: 'Inequality test (returns 0 or 1).' },
  { label: 'G', kind: vscode.CompletionItemKind.Function, detail: 'numerical comparison', returnType: 'Numerical', signature: 'G(Numerical value1, Numerical value2)', documentation: 'Greater than test (returns 0 or 1).' },
  { label: 'GE', kind: vscode.CompletionItemKind.Function, detail: 'numerical comparison', returnType: 'Numerical', signature: 'GE(Numerical value1, Numerical value2)', documentation: 'Greater than or equal test (returns 0 or 1).' },
  { label: 'L', kind: vscode.CompletionItemKind.Function, detail: 'numerical comparison', returnType: 'Numerical', signature: 'L(Numerical value1, Numerical value2)', documentation: 'Less than test (returns 0 or 1).' },
  { label: 'LE', kind: vscode.CompletionItemKind.Function, detail: 'numerical comparison', returnType: 'Numerical', signature: 'LE(Numerical value1, Numerical value2)', documentation: 'Less than or equal test (returns 0 or 1).' },

  // Categorical comparisons
  { label: 'EQc', kind: vscode.CompletionItemKind.Function, detail: 'categorical comparison', returnType: 'Numerical', signature: 'EQc(Categorical value1, Categorical value2)', documentation: 'Equality test for categorical values (returns 0 or 1).' },
  { label: 'NEQc', kind: vscode.CompletionItemKind.Function, detail: 'categorical comparison', returnType: 'Numerical', signature: 'NEQc(Categorical value1, Categorical value2)', documentation: 'Inequality test for categorical values (returns 0 or 1).' },
  { label: 'Gc', kind: vscode.CompletionItemKind.Function, detail: 'categorical comparison', returnType: 'Numerical', signature: 'Gc(Categorical value1, Categorical value2)', documentation: 'Lexicographic greater than test for categorical values (returns 0 or 1).' },
  { label: 'GEc', kind: vscode.CompletionItemKind.Function, detail: 'categorical comparison', returnType: 'Numerical', signature: 'GEc(Categorical value1, Categorical value2)', documentation: 'Lexicographic greater than or equal test for categorical values (returns 0 or 1).' },
  { label: 'Lc', kind: vscode.CompletionItemKind.Function, detail: 'categorical comparison', returnType: 'Numerical', signature: 'Lc(Categorical value1, Categorical value2)', documentation: 'Lexicographic less than test for categorical values (returns 0 or 1).' },
  { label: 'LEc', kind: vscode.CompletionItemKind.Function, detail: 'categorical comparison', returnType: 'Numerical', signature: 'LEc(Categorical value1, Categorical value2)', documentation: 'Lexicographic less than or equal test for categorical values (returns 0 or 1).' },

  // Logical
  { label: 'And', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Numerical', signature: 'And(Numerical value1, ...)', documentation: 'Logical AND of numerical boolean values (0 or 1).' },
  { label: 'Or', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Numerical', signature: 'Or(Numerical value1, ...)', documentation: 'Logical OR of numerical boolean values (0 or 1).' },
  { label: 'Not', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Numerical', signature: 'Not(Numerical value)', documentation: 'Logical NOT of a numerical boolean value (0 or 1).' },
  { label: 'If', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Numerical|Categorical', signature: 'If(Numerical condition, value1, value2)', documentation: 'Conditional expression: returns value1 if condition != 0, else value2.' },
  { label: 'IfC', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Categorical', signature: 'IfC(Numerical test, Categorical valueTrue, Categorical valueFalse)', documentation: 'Ternary operator returning second operand (true) or third operand (false) for Categorical values, according to the condition in first operand.' },
  { label: 'IfD', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Date', signature: 'IfD(Numerical test, Date valueTrue, Date valueFalse)', documentation: 'Ternary operator returning second operand (true) or third operand (false) for Date values, according to the condition in first operand.' },
  { label: 'IfT', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Time', signature: 'IfT(Numerical test, Time valueTrue, Time valueFalse)', documentation: 'Ternary operator returning second operand (true) or third operand (false) for Time values, according to the condition in first operand.' },
  { label: 'IfTS', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Timestamp', signature: 'IfTS(Numerical test, Timestamp valueTrue, Timestamp valueFalse)', documentation: 'Ternary operator returning second operand (true) or third operand (false) for Timestamp values, according to the condition in first operand.' },
  { label: 'IfTSTZ', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'TimestampTZ', signature: 'IfTSTZ(Numerical test, TimestampTZ valueTrue, TimestampTZ valueFalse)', documentation: 'Ternary operator returning second operand (true) or third operand (false) for TimestampTZ values, according to the condition in first operand.' },
  { label: 'Switch', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Numerical', signature: 'Switch(Numerical test, Numerical valueDefault, Numerical value1, ...)', documentation: 'Switch operator that returns the numerical value corresponding to the index given by the test operand if it is between 1 and K. The default value is returned if the index is outside the bounds.' },
  { label: 'SwitchC', kind: vscode.CompletionItemKind.Function, detail: 'logical', returnType: 'Categorical', signature: 'SwitchC(Numerical test, Categorical valueDefault, Categorical value1, ...)', documentation: 'Switch operator that returns the categorical value corresponding to the index given by the test operand if it is between 1 and K. The default value is returned if the index is outside the bounds.' },

  // Data copy and conversion
  { label: 'Copy', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'any', signature: 'Copy(value)', documentation: 'Copies the value of a variable. Allows to rename a variable.' },
  { label: 'CopyC', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Categorical', signature: 'CopyC(Categorical value)', documentation: 'Copy of a categorical value.' },
  { label: 'CopyD', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Date', signature: 'CopyD(Date value)', documentation: 'Copy of a date value.' },
  { label: 'CopyT', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Time', signature: 'CopyT(Time value)', documentation: 'Copy of a time value.' },
  { label: 'CopyTS', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Timestamp', signature: 'CopyTS(Timestamp value)', documentation: 'Copy of a timestamp value.' },
  { label: 'CopyTSTZ', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'TimestampTZ', signature: 'CopyTSTZ(TimestampTZ value)', documentation: 'Copy of a TimestampTZ value.' },
  { label: 'AsNumerical', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Numerical', signature: 'AsNumerical(Categorical value)', documentation: 'Converts a categorical value to numerical. Returns the missing value if the input is missing or not a valid number.' },
  { label: 'AsNumericalError', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Categorical', signature: 'AsNumericalError(Categorical value)', documentation: 'Label of the conversion error when converting a categorical value to numerical. Useful for analysing missing or erroneous values. Possible labels: "Unconverted end of string", "Underflow", "Overflow -inf", "Overflow +inf", "Conversion OK".' },
  { label: 'RecodeMissing', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Numerical', signature: 'RecodeMissing(Numerical inputValue, Numerical replaceValue)', documentation: 'Returns the input value if it is different from the missing value, and the replace value otherwise.' },
  { label: 'AsCategorical', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Categorical', signature: 'AsCategorical(Numerical value)', documentation: 'Converts a numerical value to categorical.' },
  { label: 'AsDate', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Date', signature: 'AsDate(Categorical value, Categorical format)', documentation: 'Parses a string into a Date using the given format.\n\nExample: AsDate("2014-01-15", "YYYY-MM-DD")' },
  { label: 'AsTime', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Time', signature: 'AsTime(Categorical value, Categorical format)', documentation: 'Parses a string into a Time using the given format.' },
  { label: 'AsTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Timestamp', signature: 'AsTimestamp(Categorical value, Categorical format)', documentation: 'Parses a string into a Timestamp using the given format.' },

  // Math
  { label: 'FormatNumerical', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Categorical', signature: 'FormatNumerical(Numerical value, Numerical width, Numerical precision)', documentation: 'Returns a formatted string of a numerical value.\n\nExample: FormatNumerical(3.14, 0, 2) → "3.14"' },
  { label: 'Sum', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Sum(Numerical value1, ...)', documentation: 'Sum of numerical values.' },
  { label: 'Minus', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Minus(Numerical value)', documentation: 'Opposite (negation) of a numerical value.' },
  { label: 'Diff', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Diff(Numerical value1, Numerical value2)', documentation: 'Difference between two numerical values.' },
  { label: 'Product', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Product(Numerical value1, ...)', documentation: 'Product of numerical values.' },
  { label: 'Divide', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Divide(Numerical value1, Numerical value2)', documentation: 'Ratio of two numerical values.' },
  { label: 'Index', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Index()', documentation: 'Integer index of the current record from the data file (starts at 1).' },
  { label: 'Random', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Random()', documentation: 'Random number between 0 and 1. Seed is fixed per database read for reproducibility.' },
  { label: 'Round', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Round(Numerical value)', documentation: 'Rounds to the closest integer.' },
  { label: 'Floor', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Floor(Numerical value)', documentation: 'Largest integer not greater than value.' },
  { label: 'Ceil', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Ceil(Numerical value)', documentation: 'Smallest integer not less than value.' },
  { label: 'Abs', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Abs(Numerical value)', documentation: 'Absolute value.' },
  { label: 'Sign', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Sign(Numerical value)', documentation: 'Sign: returns 1 for values >= 0, -1 for values < 0.' },
  { label: 'Mod', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Mod(Numerical value1, Numerical value2)', documentation: 'Modulo: value1 – value2 * Floor(value1/value2).' },
  { label: 'Log', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Log(Numerical value)', documentation: 'Natural logarithm.' },
  { label: 'Exp', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Exp(Numerical value)', documentation: 'Exponential (e^value).' },
  { label: 'Power', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Power(Numerical value1, Numerical value2)', documentation: 'Power: value1^value2.' },
  { label: 'Sqrt', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Sqrt(Numerical value)', documentation: 'Square root.' },
  { label: 'Sin', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Sin(Numerical value)', documentation: 'Sine function.' },
  { label: 'Cos', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Cos(Numerical value)', documentation: 'Cosine function.' },
  { label: 'Tan', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Tan(Numerical value)', documentation: 'Tangent function.' },
  { label: 'ASin', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'ASin(Numerical value)', documentation: 'Arc-sine function.' },
  { label: 'ACos', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'ACos(Numerical value)', documentation: 'Arc-cosine function.' },
  { label: 'ATan', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'ATan(Numerical value)', documentation: 'Arc-tangent function.' },
  { label: 'Pi', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Pi()', documentation: 'Pi constant.' },
  { label: 'Mean', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Mean(Numerical value1, ...)', documentation: 'Mean of numerical values.' },
  { label: 'StdDev', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'StdDev(Numerical value1, ...)', documentation: 'Standard deviation of numerical values.' },
  { label: 'Min', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Min(Numerical value1, ...)', documentation: 'Minimum of numerical values (non-missing).' },
  { label: 'Max', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'Max(Numerical value1, ...)', documentation: 'Maximum of numerical values (non-missing).' },
  { label: 'ArgMin', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'ArgMin(Numerical value1, ...)', documentation: 'Index (1-based) of the minimum value in a numerical series.' },
  { label: 'ArgMax', kind: vscode.CompletionItemKind.Function, detail: 'math', returnType: 'Numerical', signature: 'ArgMax(Numerical value1, ...)', documentation: 'Index (1-based) of the maximum value in a numerical series.' },

  // String rules
  { label: 'Length', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'Length(Categorical value)', documentation: 'Length of a string.' },
  { label: 'Left', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Left(Categorical value, Numerical charNumber)', documentation: 'Left n characters of a string.' },
  { label: 'Right', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Right(Categorical value, Numerical charNumber)', documentation: 'Right n characters of a string.' },
  { label: 'Middle', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Middle(Categorical value, Numerical startChar, Numerical charNumber)', documentation: 'Substring: charNumber characters starting at startChar (1-based).' },
  { label: 'TokenLength', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'TokenLength(Categorical value, Categorical separators)', documentation: 'Number of tokens in a categorical value. A token is a non-empty substring containing no separator character.' },
  { label: 'TokenLeft', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'TokenLeft(Categorical value, Categorical separators, Numerical tokenNumber)', documentation: 'Extracts the leftmost tokens from a categorical value, retaining the original separators between tokens.' },
  { label: 'TokenRight', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'TokenRight(Categorical value, Categorical separators, Numerical tokenNumber)', documentation: 'Extracts the rightmost tokens from a categorical value, retaining the original separators between tokens.' },
  { label: 'TokenMiddle', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'TokenMiddle(Categorical value, Categorical separators, Numerical startToken, Numerical tokenNumber)', documentation: 'Extracts middle tokens from a categorical value (startToken is 1-based), retaining the original separators between tokens.' },
  { label: 'Translate', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Translate(Categorical value, Structure(VectorC) searchValues, Structure(VectorC) replaceValues)', documentation: 'Replaces substrings in a categorical value using parallel search/replace VectorC literals.\n\nExample: Translate(v, VectorC("é","à"), VectorC("e","a"))' },
  { label: 'Search', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'Search(Categorical value, Numerical startChar, Categorical searchValue)', documentation: 'Position (1-based) of first occurrence of searchValue in value, starting at startChar. Returns -1 if not found.' },
  { label: 'Replace', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Replace(Categorical value, Numerical startChar, Categorical searchValue, Categorical replaceValue)', documentation: 'Replaces the first occurrence of searchValue in value with replaceValue.' },
  { label: 'ReplaceAll', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'ReplaceAll(Categorical value, Numerical startChar, Categorical searchValue, Categorical replaceValue)', documentation: 'Replaces all occurrences of searchValue in value with replaceValue.' },
  { label: 'RegexMatch', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'RegexMatch(Categorical value, Categorical regexValue)', documentation: 'Returns 1 if the entire value matches the ECMAScript regex, 0 otherwise.' },
  { label: 'RegexSearch', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'RegexSearch(Categorical value, Numerical startChar, Categorical regexValue)', documentation: 'Returns the position (1-based) of a regex match in a categorical value, or -1 if not found.' },
  { label: 'RegexReplace', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'RegexReplace(Categorical value, Numerical startChar, Categorical regexValue, Categorical replaceValue)', documentation: 'Replaces the first regex match in a categorical value.' },
  { label: 'RegexReplaceAll', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'RegexReplaceAll(Categorical value, Numerical startChar, Categorical regexValue, Categorical replaceValue)', documentation: 'Replaces all regex matches in a categorical value.' },
  { label: 'ToUpper', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'ToUpper(Categorical value)', documentation: 'Converts a string to upper case.' },
  { label: 'ToLower', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'ToLower(Categorical value)', documentation: 'Converts a string to lower case.' },
  { label: 'Concat', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Concat(Categorical value1, ...)', documentation: 'Concatenates multiple string values.' },
  { label: 'Hash', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'Hash(Categorical value, Numerical max)', documentation: 'Hash code of a string value, between 0 and max-1.' },
  { label: 'Encrypt', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Encrypt(Categorical value, Categorical key)', documentation: 'Anonymizes a string using the given key. Output is alphanumeric only. Not cryptographically secure.' },

  // Date rules
  { label: 'Year', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Year(Date date)', documentation: 'Year of a date.' },
  { label: 'Month', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Month(Date date)', documentation: 'Month of a date (1–12).' },
  { label: 'Day', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Day(Date date)', documentation: 'Day of month of a date (1–31).' },
  { label: 'YearDay', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'YearDay(Date date)', documentation: 'Day of year of a date (1–366).' },
  { label: 'Week', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Week(Date date)', documentation: 'ISO week number of a date.' },
  { label: 'WeekDay', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'WeekDay(Date date)', documentation: 'Day of week (1=Monday … 7=Sunday).' },
  { label: 'DecimalYear', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'DecimalYear(Date date)', documentation: 'Date expressed as a decimal year.' },
  { label: 'AbsoluteDay', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'AbsoluteDay(Date value)', documentation: 'Total elapsed days since 2000-01-01.' },
  { label: 'DiffDate', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'DiffDate(Date date1, Date date2)', documentation: 'Difference in days between two dates.' },
  { label: 'AddDays', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Date', signature: 'AddDays(Date value, Numerical dayNumber)', documentation: 'Adds a number of days to a date value.' },
  { label: 'IsDateValid', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'IsDateValid(Date value)', documentation: 'Returns 1 if the date value is valid, 0 otherwise.' },
  { label: 'BuildDate', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Date', signature: 'BuildDate(Numerical year, Numerical month, Numerical day)', documentation: 'Builds a Date value from year (1–9999), month (1–12) and day (1–31, consistent with month and year).' },
  { label: 'FormatDate', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Categorical', signature: 'FormatDate(Date date, Categorical format)', documentation: 'Formats a date as a string using the given format.' },

  // Time rules
  { label: 'Hour', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'Hour(Time time)', documentation: 'Hour of a time (0–23).' },
  { label: 'Minute', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'Minute(Time time)', documentation: 'Minute of a time (0–59).' },
  { label: 'Second', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'Second(Time time)', documentation: 'Second of a time (0–59.999, with millisecond precision).' },
  { label: 'DaySecond', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'DaySecond(Time time)', documentation: 'Total seconds elapsed in a time value since 00:00:00.' },
  { label: 'DecimalTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'DecimalTime(Time time)', documentation: 'Time expressed as a decimal fraction of a day (0.0 to ~23.999).' },
  { label: 'DiffTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'DiffTime(Time time1, Time time2)', documentation: 'Difference in seconds between two time values.' },
  { label: 'IsTimeValid', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'IsTimeValid(Time value)', documentation: 'Returns 1 if the time value is valid, 0 otherwise.' },
  { label: 'BuildTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Time', signature: 'BuildTime(Numerical hour, Numerical minute, Numerical second)', documentation: 'Builds a Time value from hour (0–23), minute (0–59) and second (0–59, with optional fraction).' },
  { label: 'FormatTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Categorical', signature: 'FormatTime(Time time, Categorical format)', documentation: 'Formats a time as a string using the given format.' },

  // Timestamp rules
  { label: 'GetDate', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Date', signature: 'GetDate(Timestamp ts)', documentation: 'Extracts the date part of a timestamp.' },
  { label: 'GetTime', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Time', signature: 'GetTime(Timestamp ts)', documentation: 'Extracts the time part of a timestamp.' },
  { label: 'DecimalYearTS', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'DecimalYearTS(Timestamp value)', documentation: 'Year in a timestamp value, including a decimal part for the day of the year and the time of day.' },
  { label: 'AbsoluteSecond', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'AbsoluteSecond(Timestamp value)', documentation: 'Total elapsed seconds since 2000-01-01 00:00:00.' },
  { label: 'DecimalWeekDay', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'DecimalWeekDay(Timestamp value)', documentation: 'Week day of the date of the timestamp value, plus decimal day of the time (WeekDay + DecimalTime/24).' },
  { label: 'DecimalTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'DecimalTimestamp(Timestamp ts)', documentation: 'Timestamp expressed as decimal seconds since epoch.' },
  { label: 'DiffTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'DiffTimestamp(Timestamp ts1, Timestamp ts2)', documentation: 'Difference in seconds between two timestamps.' },
  { label: 'AddSeconds', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Timestamp', signature: 'AddSeconds(Timestamp value, Numerical secondNumber)', documentation: 'Adds a number of seconds to a timestamp value.' },
  { label: 'IsTimestampValid', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'IsTimestampValid(Timestamp value)', documentation: 'Returns 1 if the timestamp value is valid, 0 otherwise.' },
  { label: 'BuildTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Timestamp', signature: 'BuildTimestamp(Date dateValue, Time timeValue)', documentation: 'Builds a Timestamp from a Date and a Time value.' },
  { label: 'FormatTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Categorical', signature: 'FormatTimestamp(Timestamp ts, Categorical format)', documentation: 'Formats a timestamp as a string.' },

  // Table rules
  { label: 'TableCount', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableCount(Table table)', documentation: 'Number of records in a table.\n\nExample: TableCount(sales)' },
  { label: 'TableCountDistinct', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableCountDistinct(Table table, Categorical value)', documentation: 'Number of distinct categorical values in a table. Missing value counts as a distinct value.' },
  { label: 'TableEntropy', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableEntropy(Table table, Categorical value)', documentation: 'Entropy of a categorical variable in a table. High when all values are equally frequent.' },
  { label: 'TableMode', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Categorical', signature: 'TableMode(Table table, Categorical value)', documentation: 'Most frequent categorical value in a table. Ties resolved by lexicographic order.' },
  { label: 'TableModeAt', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Categorical', signature: 'TableModeAt(Table table, Categorical value, Numerical rank)', documentation: 'N-th most frequent categorical value in a table.' },
  { label: 'TableMean', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableMean(Table table, Numerical value)', documentation: 'Mean of numerical values in a table (non-missing only).' },
  { label: 'TableStdDev', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableStdDev(Table table, Numerical value)', documentation: 'Standard deviation of numerical values in a table.' },
  { label: 'TableMedian', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableMedian(Table table, Numerical value)', documentation: 'Median of numerical values in a table.' },
  { label: 'TableMin', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableMin(Table table, Numerical value)', documentation: 'Minimum of numerical values in a table.' },
  { label: 'TableMax', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableMax(Table table, Numerical value)', documentation: 'Maximum of numerical values in a table.' },
  { label: 'TableSum', kind: vscode.CompletionItemKind.Function, detail: 'table', returnType: 'Numerical', signature: 'TableSum(Table table, Numerical value)', documentation: 'Sum of numerical values in a table.' },

  // Table management rules
  { label: 'TableSelection', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableSelection(Table table, Numerical condition)', documentation: 'Filters a table to records where condition != 0.\n\nExample: TableSelection(DNA, EQc(Char, .MostFrequentChar))' },
  { label: 'TableAt', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Entity', signature: 'TableAt(Table table, Numerical rank)', documentation: 'Returns the record at given rank (1-based) in a table.' },
  { label: 'TableAtKey', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Entity', signature: 'TableAtKey(Table table, Categorical keyField1, ...)', documentation: 'Returns the first entity in the table matching the given key. Returns nothing if not found. Number of key fields must match the dictionary.' },
  { label: 'TableExtraction', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableExtraction(Table table, Numerical firstRank, Numerical lastRank)', documentation: 'Extracts a sub-table with entities between firstRank and lastRank (inclusive). Out-of-range ranks are ignored.' },
  { label: 'TableSelectFirst', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Entity', signature: 'TableSelectFirst(Table table, Numerical condition)', documentation: 'Returns the first entity meeting the selection criterion. Equivalent to TableAt(TableSelection(...), 1).' },
  { label: 'TableSort', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableSort(Table table, value1, ...)', documentation: 'Sorts a table by increasing order on one or more values (Numerical, Categorical, Date, Time, Timestamp, or TimestampTZ).' },
  { label: 'EntitySet', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'EntitySet(Entity entity1, Entity entity2, ...)', documentation: 'Builds a table from a set of entities sharing the same dictionary. Duplicate or missing entities are ignored.' },
  { label: 'TableUnion', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableUnion(Table table1, Table table2, ...)', documentation: 'Union of tables: contains entities belonging to any of the operands.' },
  { label: 'TableIntersection', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableIntersection(Table table1, Table table2, ...)', documentation: 'Intersection of tables: contains entities belonging to all operands.' },
  { label: 'TableDifference', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableDifference(Table table1, Table table2)', documentation: 'Symmetric difference of two tables: entities belonging to either operand but not both.' },
  { label: 'TableSubUnion', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableSubUnion(Table table, Table subTable)', documentation: 'Union of sub-tables of a table (snowflake schema). Aggregates all nested secondary tables into one flat table.' },
  { label: 'TableSubIntersection', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableSubIntersection(Table table, Table subTable)', documentation: 'Intersection of sub-tables of a table (snowflake schema).' },

  // TimestampTZ rules — timezone-aware timestamps (ISO 8601 offset format)
  { label: 'AsTimestampTZ', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'TimestampTZ', signature: 'AsTimestampTZ(Categorical value, Categorical format)', documentation: 'Parses a string into a TimestampTZ using the given format.\n\nExample: AsTimestampTZ("2014-01-15 18:25:00+02:00", "YYYY-MM-DD HH:MM:SSzzzzzz")' },
  { label: 'FormatTimestampTZ', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Categorical', signature: 'FormatTimestampTZ(TimestampTZ value, Categorical format)', documentation: 'Formats a TimestampTZ value as a string using the given format.' },
  { label: 'UtcTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Timestamp', signature: 'UtcTimestamp(TimestampTZ value)', documentation: 'Converts a TimestampTZ to a Timestamp in UTC time zone.' },
  { label: 'LocalTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Timestamp', signature: 'LocalTimestamp(TimestampTZ value)', documentation: 'Converts a TimestampTZ to a Timestamp in the local time zone.' },
  { label: 'SetTimeZoneMinutes', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'TimestampTZ', signature: 'SetTimeZoneMinutes(TimestampTZ value, Numerical minutes)', documentation: 'Modifies the time zone offset of a TimestampTZ. Minutes must be between -12*60 and +14*60.' },
  { label: 'GetTimeZoneMinutes', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Numerical', signature: 'GetTimeZoneMinutes(TimestampTZ value)', documentation: 'Returns the time zone offset in total minutes (±(hh*60 + mm)) from a TimestampTZ value.' },
  { label: 'DiffTimestampTZ', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Numerical', signature: 'DiffTimestampTZ(TimestampTZ value1, TimestampTZ value2)', documentation: 'Difference in seconds between two TimestampTZ values.' },
  { label: 'AddSecondsTSTZ', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Timestamp', signature: 'AddSecondsTSTZ(TimestampTZ value, Numerical secondNumber)', documentation: 'Adds a number of seconds to a TimestampTZ value.' },
  { label: 'IsTimestampTZValid', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'Numerical', signature: 'IsTimestampTZValid(TimestampTZ value)', documentation: 'Returns 1 if the TimestampTZ value is valid, 0 otherwise.' },
  { label: 'BuildTimestampTZ', kind: vscode.CompletionItemKind.Function, detail: 'timestampTZ', returnType: 'TimestampTZ', signature: 'BuildTimestampTZ(Timestamp value, Numerical timezone)', documentation: 'Builds a TimestampTZ from a Timestamp and a time zone offset in minutes. Minutes must be between -12*60 and +14*60.' },

  // Entity rules — access fields/relations of a 0-1 related entity
  { label: 'Exist', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Numerical', signature: 'Exist(Entity entity)', documentation: 'Returns 1 if the entity exists, 0 otherwise.\n\nExample: Exist(customerAddress)' },
  { label: 'GetValue', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Numerical', signature: 'GetValue(Entity entity, Numerical value)', documentation: 'Returns a Numerical field from an entity. Returns missing if the entity does not exist.\n\nExample: GetValue(customerAddress, Length(street))' },
  { label: 'GetValueC', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Categorical', signature: 'GetValueC(Entity entity, Categorical value)', documentation: 'Returns a Categorical field from an entity. Returns "" if the entity does not exist.\n\nExample: GetValueC(customerAddress, city)' },
  { label: 'GetText', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Text', signature: 'GetText(Entity entity, Text value)', documentation: 'Returns a Text field from an entity. Returns "" if the entity does not exist.' },
  { label: 'GetValueD', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Date', signature: 'GetValueD(Entity entity, Date value)', documentation: 'Returns a Date field from an entity. Returns missing if the entity does not exist.' },
  { label: 'GetValueT', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Time', signature: 'GetValueT(Entity entity, Time value)', documentation: 'Returns a Time field from an entity. Returns missing if the entity does not exist.' },
  { label: 'GetValueTS', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Timestamp', signature: 'GetValueTS(Entity entity, Timestamp value)', documentation: 'Returns a Timestamp field from an entity. Returns missing if the entity does not exist.' },
  { label: 'GetValueTSTZ', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'TimestampTZ', signature: 'GetValueTSTZ(Entity entity, TimestampTZ value)', documentation: 'Returns a TimestampTZ field from an entity. Returns missing if the entity does not exist.' },
  { label: 'GetEntity', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Entity', signature: 'GetEntity(Entity entity, Entity value)', documentation: 'Returns a nested Entity field from an entity (snowflake schema).' },
  { label: 'GetTable', kind: vscode.CompletionItemKind.Function, detail: 'entity', returnType: 'Table', signature: 'GetTable(Entity entity, Table value)', documentation: 'Returns a Table field from an entity (snowflake schema).' },

  // Text rules — counterpart to string rules for the Text type (up to 1,000,000 chars)
  { label: 'FromText', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Categorical', signature: 'FromText(Text value)', documentation: 'Converts a Text value to Categorical (truncated to 1,000 chars).' },
  { label: 'ToText', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'ToText(Categorical value)', documentation: 'Converts a Categorical value to Text.' },
  { label: 'TextLoadFile', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextLoadFile(Categorical filePath)', documentation: 'Loads a file as a Text variable. Supports local paths and cloud URIs (when cloud drivers are loaded).' },
  { label: 'TextLength', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Numerical', signature: 'TextLength(Text value)', documentation: 'Length in characters of a Text value.' },
  { label: 'TextLeft', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextLeft(Text value, Numerical charNumber)', documentation: 'Extracts the left substring of a Text value.' },
  { label: 'TextRight', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextRight(Text value, Numerical charNumber)', documentation: 'Extracts the right substring of a Text value.' },
  { label: 'TextMiddle', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextMiddle(Text value, Numerical startChar, Numerical charNumber)', documentation: 'Extracts a substring from a Text value (startChar is 1-based).' },
  { label: 'TextTokenLength', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Numerical', signature: 'TextTokenLength(Text value, Categorical separators)', documentation: 'Number of tokens in a Text value. Tokens are non-empty substrings that contain no separator character.' },
  { label: 'TextTokenLeft', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextTokenLeft(Text value, Categorical separators, Numerical tokenNumber)', documentation: 'Extracts the leftmost tokens from a Text value.' },
  { label: 'TextTokenRight', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextTokenRight(Text value, Categorical separators, Numerical tokenNumber)', documentation: 'Extracts the rightmost tokens from a Text value.' },
  { label: 'TextTokenMiddle', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextTokenMiddle(Text value, Categorical separators, Numerical startToken, Numerical tokenNumber)', documentation: 'Extracts middle tokens from a Text value (startToken is 1-based).' },
  { label: 'TextTranslate', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextTranslate(Text value, Structure(VectorC) searchValues, Structure(VectorC) replaceValues)', documentation: 'Replaces substrings in a Text value using parallel search/replace VectorC literals.\n\nExample: TextTranslate(v, VectorC("é","à"), VectorC("e","a"))' },
  { label: 'TextSearch', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Numerical', signature: 'TextSearch(Text value, Numerical startChar, Categorical searchValue)', documentation: 'Returns the position (1-based) of a substring in a Text value, or -1 if not found.' },
  { label: 'TextReplace', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextReplace(Text value, Numerical startChar, Categorical searchValue, Categorical replaceValue)', documentation: 'Replaces the first occurrence of a substring in a Text value.' },
  { label: 'TextReplaceAll', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextReplaceAll(Text value, Numerical startChar, Categorical searchValue, Categorical replaceValue)', documentation: 'Replaces all occurrences of a substring in a Text value.' },
  { label: 'TextRegexMatch', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Numerical', signature: 'TextRegexMatch(Text value, Categorical regex)', documentation: 'Returns 1 if the entire Text value matches the ECMAScript regex, 0 otherwise.' },
  { label: 'TextRegexSearch', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Numerical', signature: 'TextRegexSearch(Text value, Numerical startChar, Categorical regex)', documentation: 'Returns the position of a regex match in a Text value, or -1 if not found.' },
  { label: 'TextRegexReplace', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextRegexReplace(Text value, Numerical startChar, Categorical regex, Categorical replacement)', documentation: 'Replaces the first regex match in a Text value.' },
  { label: 'TextRegexReplaceAll', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextRegexReplaceAll(Text value, Numerical startChar, Categorical regex, Categorical replacement)', documentation: 'Replaces all regex matches in a Text value.' },
  { label: 'TextToUpper', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextToUpper(Text value)', documentation: 'Converts a Text value to upper case.' },
  { label: 'TextToLower', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextToLower(Text value)', documentation: 'Converts a Text value to lower case.' },
  { label: 'TextConcat', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextConcat(Text value1, ...)', documentation: 'Concatenates multiple Text values.' },
  { label: 'TextHash', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Numerical', signature: 'TextHash(Text value, Numerical max)', documentation: 'Hash of a Text value, between 0 and max-1.' },
  { label: 'TextEncrypt', kind: vscode.CompletionItemKind.Function, detail: 'text', returnType: 'Text', signature: 'TextEncrypt(Text value, Categorical key)', documentation: 'Anonymizes a Text value using the given key. Output is alphanumeric only. Not cryptographically secure.' },

  // TextList rules — list of Text values, mainly for multi-table Text aggregation
  { label: 'TextList', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'TextList', signature: 'TextList(Text value1, ...)', documentation: 'Builds a TextList from a set of Text values.' },
  { label: 'TextListSize', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'Numerical', signature: 'TextListSize(TextList value)', documentation: 'Number of Text values in a TextList.' },
  { label: 'TextListAt', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'Text', signature: 'TextListAt(TextList value, Numerical index)', documentation: 'Returns the Text value at given index (1-based). Returns "" if out of bounds.' },
  { label: 'TextListConcat', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'TextList', signature: 'TextListConcat(TextList value1, ...)', documentation: 'Concatenates multiple TextList values into one.' },
  { label: 'GetTextList', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'TextList', signature: 'GetTextList(Entity entity, TextList value)', documentation: 'Returns a TextList field from an entity. Returns empty TextList if the entity does not exist.' },
  { label: 'TableAllTexts', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'TextList', signature: 'TableAllTexts(Table table, Text value)', documentation: 'Aggregates all Text values from a secondary table variable into a TextList.' },
  { label: 'TableAllTextLists', kind: vscode.CompletionItemKind.Function, detail: 'textlist', returnType: 'TextList', signature: 'TableAllTextLists(Table table, TextList value)', documentation: 'Concatenates all TextList values from a secondary table variable into a single TextList.' },

  // Vector rules — typed arrays used as arguments to data preparation and text rules
  { label: 'VectorC', kind: vscode.CompletionItemKind.Function, detail: 'vector', returnType: 'Structure', signature: 'VectorC(Categorical value1, ...)', documentation: 'Builds a Structure(VectorC) of Categorical values. Used e.g. as argument to TextTranslate.' },
  { label: 'TableVectorC', kind: vscode.CompletionItemKind.Function, detail: 'vector', returnType: 'Structure', signature: 'TableVectorC(Table table, Categorical value)', documentation: 'Builds a Structure(VectorC) from Categorical values in a table.' },
  { label: 'ValueAtC', kind: vscode.CompletionItemKind.Function, detail: 'vector', returnType: 'Categorical', signature: 'ValueAtC(Structure(VectorC) vector, Numerical index)', documentation: 'Returns the Categorical value at given index (1-based) in a VectorC. Returns "" if out of bounds.' },
  { label: 'Vector', kind: vscode.CompletionItemKind.Function, detail: 'vector', returnType: 'Structure', signature: 'Vector(Numerical value1, ...)', documentation: 'Builds a Structure(Vector) of Numerical values.' },
  { label: 'TableVector', kind: vscode.CompletionItemKind.Function, detail: 'vector', returnType: 'Structure', signature: 'TableVector(Table table, Numerical value)', documentation: 'Builds a Structure(Vector) from Numerical values in a table.' },
  { label: 'ValueAt', kind: vscode.CompletionItemKind.Function, detail: 'vector', returnType: 'Numerical', signature: 'ValueAt(Structure(Vector) vector, Numerical index)', documentation: 'Returns the Numerical value at given index (1-based) in a Vector. Returns missing if out of bounds.' },

  // Hash map rules — key-value lookup structures
  { label: 'HashMapC', kind: vscode.CompletionItemKind.Function, detail: 'hash map', returnType: 'Structure', signature: 'HashMapC(Structure(VectorC) keyVector, Structure(VectorC) valueVector)', documentation: 'Builds a Structure(HashMapC) of Categorical values indexed by Categorical keys. Both vectors must contain only literal values and have the same size with unique keys.' },
  { label: 'TableHashMapC', kind: vscode.CompletionItemKind.Function, detail: 'hash map', returnType: 'Structure', signature: 'TableHashMapC(Table table, Categorical key, Categorical value)', documentation: 'Builds a Structure(HashMapC) from Categorical keys and values in a table. In case of duplicate keys, only the first matching value is kept.' },
  { label: 'ValueAtKeyC', kind: vscode.CompletionItemKind.Function, detail: 'hash map', returnType: 'Categorical', signature: 'ValueAtKeyC(Structure(HashMapC) hashMap, Categorical key)', documentation: 'Returns the Categorical value in a HashMapC at the given key. Returns "" if not found.\n\nExample: ValueAtKeyC(HashMapC(VectorC("male","female"), VectorC("Mr","Mrs")), Sex)' },
  { label: 'HashMap', kind: vscode.CompletionItemKind.Function, detail: 'hash map', returnType: 'Structure', signature: 'HashMap(Structure(VectorC) keyVector, Structure(Vector) valueVector)', documentation: 'Builds a Structure(HashMap) of Numerical values indexed by Categorical keys. Both vectors must contain only literal values and have the same size with unique keys.' },
  { label: 'TableHashMap', kind: vscode.CompletionItemKind.Function, detail: 'hash map', returnType: 'Structure', signature: 'TableHashMap(Table table, Categorical key, Numerical value)', documentation: 'Builds a Structure(HashMap) from Categorical keys and Numerical values in a table. In case of duplicate keys, only the first matching value is kept.' },
  { label: 'ValueAtKey', kind: vscode.CompletionItemKind.Function, detail: 'hash map', returnType: 'Numerical', signature: 'ValueAtKey(Structure(HashMap) hashMap, Categorical key)', documentation: 'Returns the Numerical value in a HashMap at the given key. Returns missing if not found.\n\nExample: ValueAtKey(HashMap(VectorC("male","female"), Vector(0, 1)), Sex)' },

  // Data preparation rules — build partition/grid structures for model deployment
  { label: 'DataGrid', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'DataGrid(Structure(Partition) partition1, ..., Structure(Frequencies) frequencies)', documentation: 'Builds a DataGrid from partitions and cell frequencies. Cells are indexed column-first.\n\nExample:\n  DataGrid(IntervalBounds(0.75, 1.55), ValueSetC("A","B","C"), Frequencies(38,0,0, 0,33,3, 0,0,34))' },
  { label: 'IntervalBounds', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'IntervalBounds(Numerical bound1, ...)', documentation: 'Builds a Structure(IntervalBounds) partition into intervals. Used as dimension input to DataGrid.' },
  { label: 'ValueGroup', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'ValueGroup(Categorical value1, ...)', documentation: 'Builds a Structure(ValueGroup) — a group of categorical values. The special value "*" matches any value not defined elsewhere.' },
  { label: 'ValueGroups', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'ValueGroups(Structure(ValueGroup) group1, ...)', documentation: 'Builds a Structure(ValueGroups) partition into groups of categorical values. Exactly one group must contain "*".' },
  { label: 'ValueSetC', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'ValueSetC(Categorical value1, ...)', documentation: 'Builds a Structure(ValueSetC) partition into categorical values. Used as dimension input to DataGrid.' },
  { label: 'ValueSet', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'ValueSet(Numerical value1, ...)', documentation: 'Builds a Structure(ValueSet) partition into numerical values. Used as dimension input to DataGrid.' },
  { label: 'Frequencies', kind: vscode.CompletionItemKind.Function, detail: 'data preparation', returnType: 'Structure', signature: 'Frequencies(Numerical frequency1, ...)', documentation: 'Builds a Structure(Frequencies) — a vector of cell frequencies. Last argument to DataGrid; cells are indexed column-first.' },

  // Recoding rules — retrieve cell/part from a partition or data grid
  { label: 'InInterval', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'InInterval(Structure(IntervalBounds) interval, Numerical value)', documentation: 'Returns 1 if the value belongs to the interval (2 bounds, defining ]lower; upper]), 0 otherwise.' },
  { label: 'InGroup', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'InGroup(Structure(ValueGroup) group, Categorical value)', documentation: 'Returns 1 if the categorical value belongs to the value group, 0 otherwise.' },
  { label: 'CellIndex', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'CellIndex(Structure(DataGrid) dataGrid, SimpleType value1, ...)', documentation: 'Returns the Numerical cell index for a list of input values in a DataGrid.' },
  { label: 'CellId', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'CellId(Structure(DataGrid) dataGrid, SimpleType value1, ...)', documentation: 'Returns the Categorical cell identifier for a list of input values in a DataGrid.' },
  { label: 'CellLabel', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'CellLabel(Structure(DataGrid) dataGrid, SimpleType value1, ...)', documentation: 'Returns the Categorical cell label for a list of input values in a DataGrid.' },
  { label: 'ValueIndexDG', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'ValueIndexDG(Structure(DataGrid) dataGrid, SimpleType value)', documentation: 'Returns the Numerical part index for a value in a univariate DataGrid.' },
  { label: 'PartIndexAt', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'PartIndexAt(Structure(DataGrid) dataGrid, Numerical dimIndex, SimpleType value)', documentation: 'Returns the Numerical part index for a value along a given dimension (1-based) of a DataGrid.' },
  { label: 'PartIdAt', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'PartIdAt(Structure(DataGrid) dataGrid, Numerical dimIndex, SimpleType value)', documentation: 'Returns the Categorical part identifier for a value along a given dimension (1-based) of a DataGrid.' },
  { label: 'ValueRank', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'ValueRank(Structure(DataGrid) dataGrid, Numerical value)', documentation: 'Returns the average normalized rank of a Numerical value in a univariate Numerical DataGrid.' },
  { label: 'InverseValueRank', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'InverseValueRank(Structure(DataGrid) dataGrid, Numerical rank)', documentation: 'Returns the average value for a given normalized rank in a univariate Numerical DataGrid.' },
  { label: 'DataGridStats', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Structure', signature: 'DataGridStats(Structure(DataGrid) dataGrid, SimpleType value1, ...)', documentation: 'Computes conditional probability statistics for a list of input values in a DataGrid.' },
  { label: 'SourceConditionalInfo', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'SourceConditionalInfo(Structure(DataGridStats) stats, Numerical outputIndex)', documentation: 'Returns the source conditional info (negative log of conditional probability) for the input cell and a target cell index (1-based).' },
  { label: 'IntervalId', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'IntervalId(Structure(IntervalBounds) bounds, Numerical value)', documentation: 'Returns the Categorical part identifier of a Numerical value in an interval partition.' },
  { label: 'ValueId', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'ValueId(Structure(ValueSet) values, Numerical value)', documentation: 'Returns the Categorical part identifier of a Numerical value in a ValueSet partition.' },
  { label: 'GroupId', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'GroupId(Structure(ValueGroups) groups, Categorical value)', documentation: 'Returns the Categorical part identifier of a Categorical value in a ValueGroups partition.' },
  { label: 'ValueIdC', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Categorical', signature: 'ValueIdC(Structure(ValueSetC) values, Categorical value)', documentation: 'Returns the Categorical part identifier of a Categorical value in a ValueSetC partition. Returns the "*" identifier if not found (or "1" if "*" is absent).' },
  { label: 'IntervalIndex', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'IntervalIndex(Structure(IntervalBounds) bounds, Numerical value)', documentation: 'Returns the Numerical part index of a Numerical value in an interval partition.' },
  { label: 'ValueIndex', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'ValueIndex(Structure(ValueSet) values, Numerical value)', documentation: 'Returns the Numerical part index of a Numerical value in a ValueSet partition.' },
  { label: 'GroupIndex', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'GroupIndex(Structure(ValueGroups) groups, Categorical value)', documentation: 'Returns the Numerical part index of a Categorical value in a ValueGroups partition.' },
  { label: 'ValueIndexC', kind: vscode.CompletionItemKind.Function, detail: 'recoding', returnType: 'Numerical', signature: 'ValueIndexC(Structure(ValueSetC) values, Categorical value)', documentation: 'Returns the Numerical part index of a Categorical value in a ValueSetC partition. Returns the "*" index if not found (or 1 if "*" is absent).' },
  // ── Predictor rules ──────────────────────────────────────────────────────
  { label: 'NBClassifier', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Structure', signature: 'NBClassifier(Structure(DataGridStats) dataGridStats1, ...)', documentation: 'Builds a Naive Bayes `Classifier` structure from a set of data grid stats that encode the target conditional probabilities. Each data grid stats results from a preparation model (data grid) and input values.' },
  { label: 'SNBClassifier', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Structure', signature: 'SNBClassifier(Structure(Vector) variableWeights, Structure(DataGridStats) dataGridStats1, ...)', documentation: 'Builds a Selective Naive Bayes `Classifier` structure. The first parameter is a Vector of weights for the selected variables. The remaining parameters are the same as for NBClassifier.' },
  { label: 'TargetValue', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Categorical', signature: 'TargetValue(Structure(Classifier) classifier)', documentation: "Computes a `Classifier`'s most probable target value." },
  { label: 'TargetProb', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetProb(Structure(Classifier) classifier)', documentation: 'Computes the `Classifier` probability of the most probable target value.' },
  { label: 'TargetProbAt', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetProbAt(Structure(Classifier) classifier, Categorical targetValue)', documentation: 'Computes the `Classifier` probability (score) of a given target value.' },
  { label: 'BiasedTargetValue', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Categorical', signature: 'BiasedTargetValue(Structure(Classifier) classifier, Structure(Vector) biasValues)', documentation: 'Computes the `Classifier` highest score target value, after adding a bias to each initial target value score. The bias values are provided as literal values.' },
  { label: 'NBRankRegressor', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Structure', signature: 'NBRankRegressor(Structure(DataGridStats) dataGridStats1, ...)', documentation: 'Builds a Naive Bayes `RankRegressor` structure from a set of data grid stats.' },
  { label: 'SNBRankRegressor', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Structure', signature: 'SNBRankRegressor(Structure(Vector) variableWeights, Structure(DataGridStats) dataGridStats1, ...)', documentation: 'Builds a Selective Naive Bayes `RankRegressor`. The first parameter is a Vector of weights for the selected variables. The remaining parameters are the same as for NBRankRegressor.' },
  { label: 'TargetRankMean', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetRankMean(Structure(RankRegressor) rankRegressor)', documentation: 'Computes the `RankRegressor` target rank mean.' },
  { label: 'TargetRankStandardDeviation', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetRankStandardDeviation(Structure(RankRegressor) rankRegressor)', documentation: "Computes the `RankRegressor` target rank's standard deviation." },
  { label: 'TargetRankDensityAt', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetRankDensityAt(Structure(RankRegressor) rankRegressor, Numerical rank)', documentation: 'Computes the `RankRegressor` density of the target rank for a given normalized rank (between 0 and 1).' },
  { label: 'TargetRankCumulativeProbAt', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetRankCumulativeProbAt(Structure(RankRegressor) rankRegressor, Numerical rank)', documentation: 'Computes the `RankRegressor` probability that the target rank is below a given normalized rank.' },
  { label: 'NBRegressor', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Structure', signature: 'NBRegressor(Structure(RankRegressor) nbRankRegressor, Structure(DataGrid) targetValues)', documentation: 'Builds a Naive Bayes `Regressor` structure. The first parameter is a Naive Bayes `RankRegressor`. The second parameter is the distribution of numerical target values encoded as a univariate numerical data grid.' },
  { label: 'SNBRegressor', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Structure', signature: 'SNBRegressor(Structure(RankRegressor) snbRankRegressor, Structure(DataGrid) targetValues)', documentation: 'Builds a Selective Naive Bayes `Regressor` structure from a `RankRegressor`. The second parameter is the distribution of numerical target values encoded as a univariate numerical data grid.' },
  { label: 'TargetMean', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetMean(Structure(Regressor) regressor)', documentation: 'Computes the `Regressor` mean target value.' },
  { label: 'TargetStandardDeviation', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetStandardDeviation(Structure(Regressor) regressor)', documentation: 'Computes the `Regressor` standard deviation of the target value.' },
  { label: 'TargetDensityAt', kind: vscode.CompletionItemKind.Function, detail: 'predictor', returnType: 'Numerical', signature: 'TargetDensityAt(Structure(Regressor) regressor, Numerical value)', documentation: 'Computes the `Regressor` density of the target for a given value.' },
  // ── Interpretation rules ─────────────────────────────────────────────────
  { label: 'ClassifierInterpreter', kind: vscode.CompletionItemKind.Function, detail: 'interpretation', returnType: 'Structure', signature: 'ClassifierInterpreter(Structure(Classifier) classifier)', documentation: 'Builds a `ClassifierInterpreter` structure from a `Classifier`. Contains all necessary information to derive Shapley-value interpretation indicators for each classifier variable and target value.' },
  { label: 'ContributionAt', kind: vscode.CompletionItemKind.Function, detail: 'interpretation', returnType: 'Numerical', signature: 'ContributionAt(Structure(ClassifierInterpreter) interpreter, Categorical targetValue, Categorical classifierVariableName)', documentation: 'Returns the Shapley value for a given target value and classifier variable name.' },
  { label: 'ContributionVariableAt', kind: vscode.CompletionItemKind.Function, detail: 'interpretation', returnType: 'Categorical', signature: 'ContributionVariableAt(Structure(ClassifierInterpreter) interpreter, Categorical targetValue, Numerical rank)', documentation: 'Returns the name of the variable at the specified importance rank (1-based) for a target value, ordered by decreasing Shapley values.' },
  { label: 'ContributionPartAt', kind: vscode.CompletionItemKind.Function, detail: 'interpretation', returnType: 'Categorical', signature: 'ContributionPartAt(Structure(ClassifierInterpreter) interpreter, Categorical targetValue, Numerical rank)', documentation: 'Returns the label of the variable part at the specified importance rank (1-based) for a target value, ordered by decreasing Shapley values.' },
  { label: 'ContributionValueAt', kind: vscode.CompletionItemKind.Function, detail: 'interpretation', returnType: 'Numerical', signature: 'ContributionValueAt(Structure(ClassifierInterpreter) interpreter, Categorical targetValue, Numerical rank)', documentation: 'Returns the Shapley value at the specified importance rank (1-based) for a target value, ordered by decreasing Shapley values.' },
  // ── Reinforcement rules ──────────────────────────────────────────────────
  { label: 'ClassifierReinforcer', kind: vscode.CompletionItemKind.Function, detail: 'reinforcement', returnType: 'Structure', signature: 'ClassifierReinforcer(Structure(Classifier) classifier, Structure(VectorC) leverVariableNames)', documentation: 'Builds a `ClassifierReinforcer` structure from a `Classifier` and a list of lever variable names (literal values). Contains all information to compute reinforcement scores for each lever variable and target value.' },
  { label: 'ReinforcementInitialScoreAt', kind: vscode.CompletionItemKind.Function, detail: 'reinforcement', returnType: 'Numerical', signature: 'ReinforcementInitialScoreAt(Structure(ClassifierReinforcer) reinforcer, Categorical targetValue)', documentation: 'Returns the initial prediction score for a given target value.' },
  { label: 'ReinforcementVariableAt', kind: vscode.CompletionItemKind.Function, detail: 'reinforcement', returnType: 'Categorical', signature: 'ReinforcementVariableAt(Structure(ClassifierReinforcer) reinforcer, Categorical targetValue, Numerical rank)', documentation: 'Returns the name of the lever variable at the specified reinforcement rank (1-based) for a target value, ordered by decreasing reinforcement scores.' },
  { label: 'ReinforcementPartAt', kind: vscode.CompletionItemKind.Function, detail: 'reinforcement', returnType: 'Categorical', signature: 'ReinforcementPartAt(Structure(ClassifierReinforcer) reinforcer, Categorical targetValue, Numerical rank)', documentation: 'Returns the label of the lever variable part at the specified reinforcement rank (1-based) for a target value, ordered by decreasing reinforcement scores.' },
  { label: 'ReinforcementFinalScoreAt', kind: vscode.CompletionItemKind.Function, detail: 'reinforcement', returnType: 'Numerical', signature: 'ReinforcementFinalScoreAt(Structure(ClassifierReinforcer) reinforcer, Categorical targetValue, Numerical rank)', documentation: 'Returns the final score after reinforcement at the specified reinforcement rank (1-based) for a target value, ordered by decreasing reinforcement scores.' },
  { label: 'ReinforcementClassChangeTagAt', kind: vscode.CompletionItemKind.Function, detail: 'reinforcement', returnType: 'Numerical', signature: 'ReinforcementClassChangeTagAt(Structure(ClassifierReinforcer) reinforcer, Categorical targetValue, Numerical rank)', documentation: 'Returns the class change tag after reinforcement at the specified rank. 0 = initial prediction was already the target; -1 = final prediction still differs; 1 = prediction changed to target.' },
  // ── Coclustering rules ───────────────────────────────────────────────────
  { label: 'DataGridDeployment', kind: vscode.CompletionItemKind.Function, detail: 'coclustering', returnType: 'Structure', signature: 'DataGridDeployment(Structure(DataGrid) dataGrid, Numerical deployedVariableIndex, ...)', documentation: 'Builds a `DataGridDeployment` structure for a given dimension variable of a DataGrid. Input values (Vector or VectorC) correspond to the distribution of input values; an optional frequency Vector may be appended.' },
  { label: 'PredictedPartIndex', kind: vscode.CompletionItemKind.Function, detail: 'coclustering', returnType: 'Numerical', signature: 'PredictedPartIndex(Structure(DataGridDeployment) deployment)', documentation: 'Computes the index of the closest part of the deployed variable in a coclustering deployment.' },
  { label: 'PredictedPartDistances', kind: vscode.CompletionItemKind.Function, detail: 'coclustering', returnType: 'Structure', signature: 'PredictedPartDistances(Structure(DataGridDeployment) deployment)', documentation: 'Computes the distance to all parts of the deployed variable in a coclustering deployment.' },
  { label: 'PredictedPartFrequenciesAt', kind: vscode.CompletionItemKind.Function, detail: 'coclustering', returnType: 'Structure', signature: 'PredictedPartFrequenciesAt(Structure(DataGridDeployment) deployment, Numerical inputVariableIndex)', documentation: 'Computes the aggregated frequencies on the parts of the specified input variable in a coclustering deployment.' },
];

// ─────────────────────────── Helper functions ────────────────────────────────

/**
 * Extracts all dictionary names declared in the document.
 * Handles both `Dictionary MyName` and `Root Dictionary MyName`.
 */
function extractDictionaryNames(document: vscode.TextDocument): string[] {
  const names: string[] = [];
  const pattern = /\bDictionary\s+(`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)/g;
  const text = document.getText();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1];
    const name = raw.startsWith('`') ? raw.slice(1, -1).replace(/``/g, '`') : raw;
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Determines whether the cursor is inside a Dictionary block { ... }
 * by counting unmatched braces from the start of the document.
 */
function isInsideDictionaryBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
  const textUpToCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  // Strip comments and strings to avoid false brace counting
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

/**
 * Returns true if the current line contains a '=' before the cursor,
 * indicating a derivation rule context.
 */
function isInDerivationContext(linePrefix: string): boolean {
  // Ignore '=' inside metadata annotations <...>
  const withoutMeta = linePrefix.replace(/<[^>]*>/g, '');
  return withoutMeta.includes('=');
}

/**
 * Detects if cursor is right after `Entity(` or `Table(`, to offer dict-name completions.
 */
function isAfterRelationalTypeParens(linePrefix: string): boolean {
  return /\b(?:Entity|Table)\s*\(\s*$/.test(linePrefix);
}

// ─────────────────────────── Type checking ────────────────────────────────────

// Ordered so longer prefixes come first (TimestampTZ before Timestamp, etc.)
const KDIC_TYPES = [
  'Categorical', 'Numerical', 'TextList', 'Text',
  'Date', 'TimestampTZ', 'Timestamp', 'Time',
  'Table', 'Entity', 'Structure',
];

// Pre-build function → expected param types array from DERIVATION_RULES signatures.
// 'any' = untyped param (e.g. Copy(value)), '...' = varargs marker.
const PARAM_TYPE_MAP: Map<string, string[]> = (() => {
  const typeAlt = KDIC_TYPES.join('|');
  const typeRe = new RegExp('^(' + typeAlt + ')\\s+');
  const map = new Map<string, string[]>();
  for (const fn of DERIVATION_RULES) {
    const inner = fn.signature.match(/\((.+)\)/)?.[1] ?? '';
    const types = inner.split(',').map(part => {
      part = part.trim();
      if (part === '...') { return '...'; }
      const m = typeRe.exec(part);
      return m ? m[1] : 'any';
    });
    map.set(fn.label, types);
  }
  return map;
})();

// Pre-build function → return type from DERIVATION_RULES
const RETURN_TYPE_MAP: Map<string, string> = new Map(
  DERIVATION_RULES.map(fn => [fn.label, fn.returnType]),
);

/**
 * Validates a .kdic document and populates the diagnostic collection.
 *
 * Three independent checks run for each dictionary block `{ ... }`:
 *
 * 1. **Return-type check** (Error)
 *    The declared variable type must match the return type of its derivation
 *    rule, for simple (non-nested) calls.
 *    Example error: `Categorical x = TableCount(t)` — TableCount returns Numerical.
 *
 * 2. **Argument-type check** (Error)
 *    Each plain-identifier argument to a derivation rule is looked up in the
 *    current dictionary's variable map and compared with the expected parameter
 *    type from PARAM_TYPE_MAP.
 *    Silently skipped when the argument is a nested call, a string/number
 *    literal, or a variable declared in a different dictionary (cross-table
 *    secondary scope).
 *    Example error: `TableCount(x)` where x is Categorical instead of Table.
 *
 * 3. **Line-level grammar check** (Warning / Error)
 *    - (Error)   Non-comment, non-metadata content after `;`.
 *    - (Warning) Lines that do not match any known kdic grammar pattern.
 *
 * Limitations:
 *  - Only simple derivation calls are type-checked (no nested function calls).
 *  - Cross-dictionary variable references (multi-table secondary scopes) are
 *    silently skipped because those variables are not in the current block's map.
 *  - String literals that contain `;` may confuse the `varDeclRe` pattern in
 *    very unusual derivation rules.
 */
function validateDocument(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
  const diags: vscode.Diagnostic[] = [];
  // Strip line comments while preserving character offsets
  const text = document.getText().replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));

  const typeAlt = KDIC_TYPES.join('|');
  // Matches a variable declaration inside a block:
  //   [Unused ] Type[(ClassName)] varName [\[joinKey\]] [= anything] ;
  // The optional [\[joinKey\]] group handles external-table join syntax:
  //   Entity(Product) MyProduct [id_product] ;
  const varDeclRe = new RegExp(
    '(?:Unused\\s+)?(' + typeAlt + ')(?:\\([^)]*\\))?\\s+(`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)(?:\\s*\\[[^\\]]*\\])?\\s*(?:=[^;]*)?;',
    'g',
  );
  // Matches: = FunctionName(args with no nested parentheses) — "simple case" only.
  // Nested calls like = Sum(EQ(a, b)) are intentionally excluded; the inner EQ
  // call would require a leading '=' to be matched, which it does not have here.
  const callRe = /=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)/g;

  let i = 0;
  while (i < text.length) {
    const braceOpen = text.indexOf('{', i);
    if (braceOpen === -1) { break; }

    // Find the matching closing brace
    let depth = 1, j = braceOpen + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') { depth++; }
      else if (text[j] === '}') { depth--; }
      j++;
    }

    const blockStart = braceOpen + 1;
    const blockText = text.slice(blockStart, j - 1);

    // Collect variable types declared in this dictionary block
    const vars = new Map<string, string>();
    varDeclRe.lastIndex = 0;
    let vm: RegExpExecArray | null;
    while ((vm = varDeclRe.exec(blockText)) !== null) {
      const raw = vm[2];
      const name = raw.startsWith('`') ? raw.slice(1, -1).replace(/``/g, '`') : raw;
      vars.set(name, vm[1]);
    }

    // Check declared variable type vs derivation rule return type
    // Matches: [Unused ] DeclaredType[(Class)] varName = FunctionName(any args) ;
    const derivedDeclRe = new RegExp(
      '(?:Unused\\s+)?(' + typeAlt + ')(?:\\([^)]*\\))?\\s+(?:`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\([^()]*\\)',
      'g',
    );
    derivedDeclRe.lastIndex = 0;
    let dm: RegExpExecArray | null;
    while ((dm = derivedDeclRe.exec(blockText)) !== null) {
      const declaredType = dm[1];
      const fnName = dm[2];
      const returnType = RETURN_TYPE_MAP.get(fnName);
      if (!returnType || returnType === 'any') { continue; }
      // Allow union return types like 'Numerical|Categorical' (e.g. If)
      if (returnType.split('|').includes(declaredType)) { continue; }
      // Highlight the declared type token
      const typeOffsetInMatch = dm[0].indexOf(declaredType);
      const start = document.positionAt(blockStart + dm.index + typeOffsetInMatch);
      const range = new vscode.Range(start, start.translate(0, declaredType.length));
      const diag = new vscode.Diagnostic(
        range,
        `'${fnName}' returns '${returnType}' but variable is declared as '${declaredType}'.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.source = 'kdic';
      diags.push(diag);
    }

    // Check each simple derivation rule call for argument type mismatches
    callRe.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(blockText)) !== null) {
      const fnName = cm[1];
      const paramTypes = PARAM_TYPE_MAP.get(fnName);
      if (!paramTypes) { continue; }

      const args = cm[2].split(',').map(a => a.trim()).filter(a => a.length > 0);
      const hasVararg = paramTypes[paramTypes.length - 1] === '...';
      const baseTypes = hasVararg ? paramTypes.slice(0, -1) : paramTypes;

      let searchFrom = cm[0].indexOf('(') + 1;
      for (let ai = 0; ai < args.length; ai++) {
        const arg = args[ai];
        const posInCall = cm[0].indexOf(arg, searchFrom);
        if (posInCall !== -1) { searchFrom = posInCall + arg.length; }

        // Only check plain identifiers (skip string literals, numbers, #Missing, …)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) { continue; }

        const expected =
          ai < baseTypes.length ? baseTypes[ai]
          : hasVararg && baseTypes.length > 0 ? baseTypes[baseTypes.length - 1]
          : 'any';
        if (expected === 'any' || expected === '...') { continue; }

        const actual = vars.get(arg);
        if (actual === undefined) { continue; } // variable not in this block — skip

        if (actual !== expected) {
          const argDocOffset = blockStart + cm.index + (posInCall !== -1 ? posInCall : cm[0].indexOf('(') + 1);
          const start = document.positionAt(argDocOffset);
          const range = new vscode.Range(start, start.translate(0, arg.length));
          const diag = new vscode.Diagnostic(
            range,
            `'${arg}' is '${actual}' but '${fnName}' expects '${expected}' for argument ${ai + 1}.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.source = 'kdic';
          diags.push(diag);
        }
      }
    }

    i = j;
  }

  // ── Line-level validation ────────────────────────────────────────────────
  // Valid patterns outside a dictionary block (against trimmed, comment-stripped line)
  const outsidePatterns = [
    /^$/,                          // empty
    /^#Khiops\b/,                  // file header: #Khiops <version>
    /^(Root\s+)?Dictionary\b/,    // dictionary declaration (+ optional trailing metadata / {)
    /^(<[^>]*>\s*)+$/,             // metadata-only line: <key>, <key=value>, <key="value">
    /^\{$/,                        // opening brace alone
    /^\};?$/,                      // closing brace (with optional ;)
  ];
  // Valid patterns inside a dictionary block
  const insidePatterns: RegExp[] = [
    /^$/,
    /^\};?$/,
    /^(<[^>]*>\s*)+$/,             // metadata-only line
    // variable declaration: [Unused ] Type[(Class)] varName ...
    new RegExp('^(Unused\\s+)?(' + typeAlt + ')(\\([^)]*\\))?\\s+'),
  ];

  const strippedLines = text.split(/\r?\n/);
  let lineDepth = 0;

  for (let li = 0; li < document.lineCount; li++) {
    const lineRaw = document.lineAt(li).text;
    const trimmed = lineRaw.trimStart();

    // Full-line comments are always valid
    if (trimmed.startsWith('//')) { continue; }

    // strippedLine has // comments replaced by spaces (same offsets as original)
    const strippedLine = strippedLines[li] ?? '';
    const effective = strippedLine.trim();

    // Save depth before updating for braces on this line
    const depthBefore = lineDepth;
    for (const ch of effective) {
      if (ch === '{') { lineDepth++; }
      else if (ch === '}') { lineDepth = Math.max(0, lineDepth - 1); }
    }

    // Check 1: non-comment content after ';'
    // Allowed after ';': metadata annotations <key>, <key=value>, <key="value">, then optional // comment
    const semiIdx = strippedLine.indexOf(';');
    if (semiIdx !== -1) {
      const afterSemi = strippedLine.slice(semiIdx + 1);
      // Valid prefix after ';': any number of whitespace + <...> metadata blocks
      const validPrefixLen = (afterSemi.match(/^(\s*<[^>]*>)*\s*/)?.[0] ?? '').length;
      const remainder = afterSemi.slice(validPrefixLen);
      if (remainder.trim().length > 0) {
        const leadingWs = remainder.length - remainder.trimStart().length;
        const col = semiIdx + 1 + validPrefixLen + leadingWs;
        const endCol = strippedLine.trimEnd().length;
        const diag = new vscode.Diagnostic(
          new vscode.Range(new vscode.Position(li, col), new vscode.Position(li, endCol)),
          "Only metadata (<key>, <key=value>, <key=\"value\">) and // comments are allowed after ';'.",
          vscode.DiagnosticSeverity.Error,
        );
        diag.source = 'kdic';
        diags.push(diag);
      }
    }

    // Check 2: line matches a known kdic grammar pattern
    if (effective.length > 0) {
      const patterns = depthBefore > 0 ? insidePatterns : outsidePatterns;
      if (!patterns.some(p => p.test(effective))) {
        const indentLen = lineRaw.length - trimmed.length;
        const endCol = strippedLine.trimEnd().length;
        const diag = new vscode.Diagnostic(
          new vscode.Range(new vscode.Position(li, indentLen), new vscode.Position(li, endCol)),
          'Line does not match kdic grammar. Use // for non-kdic content.',
          vscode.DiagnosticSeverity.Warning,
        );
        diag.source = 'kdic';
        diags.push(diag);
      }
    }
  }

  collection.set(document.uri, diags);
}

// ─────────────────────────── Extension activation ───────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'kdic' },
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
      ): vscode.CompletionItem[] {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        const trimmedPrefix = linePrefix.trimStart();

        // Skip completions inside comments
        const commentIdx = linePrefix.indexOf('//');
        if (commentIdx !== -1 && position.character > commentIdx) {
          return [];
        }

        const items: vscode.CompletionItem[] = [];

        // ── Context: right after Entity( or Table( ──────────────────────────
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

        // ── Context: top-level (outside dictionary block) ───────────────────
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

        // ── Context: inside dictionary block ────────────────────────────────
        const inDerivation = isInDerivationContext(linePrefix);

        if (!inDerivation) {
          // Offer type keywords and Unused modifier
          for (const kw of [KEYWORDS.find(k => k.label === 'Unused')!]) {
            const item = new vscode.CompletionItem(kw.label, kw.kind);
            item.detail = kw.detail;
            item.documentation = new vscode.MarkdownString(kw.documentation);
            items.push(item);
          }
          for (const t of NATIVE_TYPES) {
            const item = new vscode.CompletionItem(t.label, t.kind);
            item.detail = t.detail;
            item.documentation = new vscode.MarkdownString(t.documentation);
            items.push(item);
          }
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

        // Always offer derivation rules inside a block (for use after '=', but
        // also useful when the user types a function name on a derived variable line)
        for (const fn of DERIVATION_RULES) {
          const item = new vscode.CompletionItem(fn.label, fn.kind);
          item.detail = `${fn.returnType} · ${fn.detail}`;
          item.documentation = new vscode.MarkdownString(
            `\`\`\`\n${fn.signature}\n\`\`\`\n\n${fn.documentation}`,
          );
          item.insertText = new vscode.SnippetString(`${fn.label}($0)`);
          items.push(item);
        }

        return items;
      },
    },
    // Trigger characters
    '(', ' ', '\t',
  );

  context.subscriptions.push(provider);

  // ── Hover provider ──────────────────────────────────────────────────────
  const ALL_ENTRIES: (CompletionEntry | FunctionEntry)[] = [
    ...KEYWORDS,
    ...NATIVE_TYPES,
    ...ADVANCED_TYPES,
    ...DERIVATION_RULES,
  ];

  const hoverProvider = vscode.languages.registerHoverProvider(
    { language: 'kdic' },
    {
      provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (!range) { return undefined; }
        const word = document.getText(range);
        const entry = ALL_ENTRIES.find(e => e.label === word);
        if (!entry) { return undefined; }

        const isFn = 'signature' in entry;
        const content = new vscode.MarkdownString();
        if (isFn) {
          content.appendCodeblock((entry as FunctionEntry).signature, 'kdic');
        }
        content.appendMarkdown(entry.documentation);

        return new vscode.Hover(content, range);
      },
    },
  );

  context.subscriptions.push(hoverProvider);

  // ── Diagnostic type checking ────────────────────────────────────────────
  const diagnostics = vscode.languages.createDiagnosticCollection('kdic');
  context.subscriptions.push(diagnostics);

  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'kdic') { validateDocument(doc, diagnostics); }
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.languageId === 'kdic') { validateDocument(doc, diagnostics); }
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === 'kdic') { validateDocument(e.document, diagnostics); }
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnostics.delete(doc.uri);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
