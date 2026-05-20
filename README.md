# Khiops Dictionary Language Support for VS Code

VS Code extension providing syntax highlighting, IntelliSense, and snippets for [Khiops](https://khiops.org) dictionary files (`.kdic`).

## Features

### Syntax Highlighting

- **Keywords**: `Dictionary`, `Root`, `Unused`
- **Native types**: `Categorical`, `Numerical`, `Text`, `Date`, `Time`, `Timestamp`, `TimestampTZ`, `TextList`
- **Advanced types**: `Entity(...)`, `Table(...)`, `Structure(...)`
- **Derivation rule function calls**
- **String literals** (double-quoted, with `""` escape) and **backtick-quoted names**
- **Comments** (`// ...`)
- **Metadata annotations** (`<key>`, `<key=value>`, `<key="value">`)
- **Special constant** `#Missing`
- **Numbers** (integer, decimal, scientific notation)

### IntelliSense Completions

Context-aware completions:

| Context                     | Suggestions                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| Top level (outside `{}`)    | `Dictionary`, `Root Dictionary`                                              |
| Inside a dictionary block   | All types (`Categorical`, `Numerical`, …), `Unused`, `Entity(…)`, `Table(…)` |
| After `=` (derivation)      | All derivation rule functions with signatures and documentation              |
| After `Entity(` or `Table(` | Dictionary names declared in the current file                                |

**Covered rule categories**: Numerical/Categorical comparisons, Logical operators, Data conversion, Math, String, Date/Time/Timestamp, Table aggregation, Table management.

### Snippets

| Prefix        | Description                               |
| ------------- | ----------------------------------------- |
| `dict`        | Basic `Dictionary` block                  |
| `rootdict`    | `Root Dictionary` block                   |
| `cat`         | `Categorical` variable                    |
| `num`         | `Numerical` variable                      |
| `unused`      | `Unused` variable                         |
| `derived`     | Derived variable with a rule              |
| `entity`      | `Entity(...)` relation                    |
| `table`       | `Table(...)` relation                     |
| `datefmt`     | `Date` variable with format metadata      |
| `tsfmt`       | `Timestamp` variable with format metadata |
| `tabcount`    | `TableCount` derived variable             |
| `tabmean`     | `TableMean` derived variable              |
| `tabsel`      | `TableSelection` derived variable         |
| `startschema` | Multi-table star schema template          |

### Language Configuration

- Auto-closing pairs: `{}`, `()`, `""`, ` `` `, `<>`
- Auto-indent inside `{ }` blocks
- Line comment toggling with `Ctrl+/` / `Cmd+/`

## Installation

### From source (development)

```bash
cd vscode-extension
npm install
npm run compile
```

Then press **F5** in VS Code to open an Extension Development Host with the extension loaded.

### Package as `.vsix`

```bash
cd vscode-extension
npm install
npm run compile
npx vsce package
# produces khiops-kdic-0.1.0.vsix
```

Install the `.vsix` via **Extensions → Install from VSIX…** in VS Code.

## Grammar Reference

See the [Khiops dictionary documentation](https://khiops.org/api-docs/kdic/dictionary-files/) for the full grammar and list of derivation rules.

### Quick syntax reference

```kdic
// Single-table dictionary
Dictionary Iris
{
    Numerical   SepalLength ;
    Numerical   SepalWidth  ;
    Numerical   PetalLength ;
    Numerical   PetalWidth  ;
    Numerical   PetalArea   = Product(PetalLength, PetalWidth) ;
    Categorical Class       ; // target variable
};

// Multi-table dictionary (star schema)
Root Dictionary Customer (id_customer)
{
    Categorical id_customer ;
    Categorical Name        ;
    Entity(Address) Address ; // 0-1 relationship
    Table(Usage)    Usages  ; // 0-n relationship
    Numerical       nbUsages = TableCount(Usages) ;
};

Dictionary Address (id_customer)
{
    Categorical id_customer  ;
    Categorical City         ;
};

Dictionary Usage (id_customer)
{
    Categorical id_customer ;
    Categorical Product      ;
    Numerical   Cost         ;
    Timestamp   PurchaseDate ; <TimestampFormat="YYYY-MM-DD HH:MM:SS">
};
```

## License

BSD-3-Clause-Clear — see the [Khiops repository](https://github.com/KhiopsML/khiops) for details.
