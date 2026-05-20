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

  // Data copy and conversion
  { label: 'Copy', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'any', signature: 'Copy(value)', documentation: 'Copies the value of a variable.' },
  { label: 'AsNumerical', kind: vscode.CompletionItemKind.Function, detail: 'conversion', returnType: 'Numerical', signature: 'AsNumerical(Categorical value)', documentation: 'Converts a categorical value to numerical.' },
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
  { label: 'Left', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Left(Categorical value, Numerical n)', documentation: 'Left n characters of a string.' },
  { label: 'Right', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Right(Categorical value, Numerical n)', documentation: 'Right n characters of a string.' },
  { label: 'Middle', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Middle(Categorical value, Numerical start, Numerical n)', documentation: 'Substring: n characters starting at position start (1-based).' },
  { label: 'Search', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'Search(Categorical value, Categorical pattern)', documentation: 'Position (1-based) of first occurrence of pattern in value. Returns 0 if not found.' },
  { label: 'Replace', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Replace(Categorical value, Categorical pattern, Categorical replacement)', documentation: 'Replaces first occurrence of pattern with replacement.' },
  { label: 'ReplaceAll', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'ReplaceAll(Categorical value, Categorical pattern, Categorical replacement)', documentation: 'Replaces all occurrences of pattern with replacement.' },
  { label: 'Concat', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'Concat(Categorical value1, ...)', documentation: 'Concatenates multiple string values.' },
  { label: 'UpperCase', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'UpperCase(Categorical value)', documentation: 'Converts a string to upper case.' },
  { label: 'LowerCase', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Categorical', signature: 'LowerCase(Categorical value)', documentation: 'Converts a string to lower case.' },
  { label: 'Hash', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'Hash(Categorical value)', documentation: 'Hash code of a string value.' },
  { label: 'RegexMatch', kind: vscode.CompletionItemKind.Function, detail: 'string', returnType: 'Numerical', signature: 'RegexMatch(Categorical value, Categorical regex)', documentation: 'Returns 1 if the value matches the regular expression, 0 otherwise.' },

  // Date rules
  { label: 'Year', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Year(Date date)', documentation: 'Year of a date.' },
  { label: 'Month', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Month(Date date)', documentation: 'Month of a date (1–12).' },
  { label: 'Day', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Day(Date date)', documentation: 'Day of month of a date (1–31).' },
  { label: 'YearDay', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'YearDay(Date date)', documentation: 'Day of year of a date (1–366).' },
  { label: 'Week', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'Week(Date date)', documentation: 'ISO week number of a date.' },
  { label: 'WeekDay', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'WeekDay(Date date)', documentation: 'Day of week (1=Monday … 7=Sunday).' },
  { label: 'DecimalYear', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'DecimalYear(Date date)', documentation: 'Date expressed as a decimal year.' },
  { label: 'DiffDate', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Numerical', signature: 'DiffDate(Date date1, Date date2)', documentation: 'Difference in days between two dates.' },
  { label: 'FormatDate', kind: vscode.CompletionItemKind.Function, detail: 'date', returnType: 'Categorical', signature: 'FormatDate(Date date, Categorical format)', documentation: 'Formats a date as a string using the given format.' },

  // Time rules
  { label: 'Hour', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'Hour(Time time)', documentation: 'Hour of a time (0–23).' },
  { label: 'Minute', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'Minute(Time time)', documentation: 'Minute of a time (0–59).' },
  { label: 'Second', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'Second(Time time)', documentation: 'Second of a time (0–59).' },
  { label: 'DecimalTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'DecimalTime(Time time)', documentation: 'Time expressed as decimal seconds since midnight.' },
  { label: 'DiffTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Numerical', signature: 'DiffTime(Time time1, Time time2)', documentation: 'Difference in seconds between two time values.' },
  { label: 'FormatTime', kind: vscode.CompletionItemKind.Function, detail: 'time', returnType: 'Categorical', signature: 'FormatTime(Time time, Categorical format)', documentation: 'Formats a time as a string using the given format.' },

  // Timestamp rules
  { label: 'GetDate', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Date', signature: 'GetDate(Timestamp ts)', documentation: 'Extracts the date part of a timestamp.' },
  { label: 'GetTime', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Time', signature: 'GetTime(Timestamp ts)', documentation: 'Extracts the time part of a timestamp.' },
  { label: 'DecimalTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'DecimalTimestamp(Timestamp ts)', documentation: 'Timestamp expressed as decimal seconds since epoch.' },
  { label: 'DiffTimestamp', kind: vscode.CompletionItemKind.Function, detail: 'timestamp', returnType: 'Numerical', signature: 'DiffTimestamp(Timestamp ts1, Timestamp ts2)', documentation: 'Difference in seconds between two timestamps.' },
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
  { label: 'TableHead', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableHead(Table table, Numerical n)', documentation: 'Returns the first n records of a table.' },
  { label: 'TableTail', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableTail(Table table, Numerical n)', documentation: 'Returns the last n records of a table.' },
  { label: 'TableSort', kind: vscode.CompletionItemKind.Function, detail: 'table management', returnType: 'Table', signature: 'TableSort(Table table, value, ...)', documentation: 'Returns a table sorted by the given values.' },
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
}

export function deactivate(): void {
  // Nothing to clean up
}
