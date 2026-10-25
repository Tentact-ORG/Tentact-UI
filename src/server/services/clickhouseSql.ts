/**
 * ClickHouse SQL tokenizer and structural analyzer.
 *
 * Extracts what the deterministic validator needs from a (possibly hostile) query:
 * statement count and type, table references (with aliases, CTEs and table
 * functions), joins, column references, wildcards, function calls and the top-level
 * LIMIT. It is deliberately not a full grammar: anything it cannot tokenize or
 * balance is reported as a syntax error, so unknown constructs fail closed.
 */

export class SqlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlParseError";
  }
}

export type TokenKind = "ident" | "qident" | "string" | "number" | "param" | "op";

export interface Token {
  kind: TokenKind;
  value: string;
  upper: string;
  pos: number;
}

export interface TableRef {
  db: string | null;
  name: string;
  alias: string | null;
  isFunction: boolean;
}

export interface ColumnRef {
  qualifier: string | null;
  name: string;
}

export interface SqlAnalysis {
  statementCount: number;
  statementKeyword: string | null;
  mutationKeywords: string[];
  tables: TableRef[];
  cteNames: Set<string>;
  hasJoin: boolean;
  columns: ColumnRef[];
  wildcards: Array<{ qualifier: string | null }>;
  functions: string[];
  limit: { present: boolean; value: number | null };
}

/** Reserved words that are never column references when unquoted. */
const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "PREWHERE", "AND", "OR", "NOT", "IN", "IS", "NULL", "AS", "ON", "USING",
  "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "ANY", "ALL", "ASOF", "SEMI", "ANTI",
  "GLOBAL", "ARRAY", "PASTE", "GROUP", "BY", "ORDER", "ASC", "DESC", "ASCENDING", "DESCENDING", "LIMIT",
  "OFFSET", "HAVING", "DISTINCT", "UNION", "EXCEPT", "INTERSECT", "WITH", "CASE", "WHEN", "THEN", "ELSE",
  "END", "BETWEEN", "LIKE", "ILIKE", "TRUE", "FALSE", "INTERVAL", "FINAL", "SAMPLE", "NULLS", "FIRST",
  "LAST", "TOTALS", "ROLLUP", "CUBE", "SETTINGS", "FORMAT", "OVER", "PARTITION", "ROWS", "RANGE",
  "PRECEDING", "FOLLOWING", "UNBOUNDED", "CURRENT", "ROW", "WINDOW", "TIES", "FETCH", "NEXT", "ONLY",
  "COLLATE", "EXISTS", "FILL", "STEP", "TO", "QUALIFY", "INTO", "OUTFILE", "REPLACE",
]);

/**
 * Keywords after which "(" opens an expression or subquery rather than a function call.
 * LIKE/ILIKE are deliberately absent: in ClickHouse SQL they are usually called as
 * functions, e.g. ilike(col, '%x%').
 */
const EXPR_PAREN_KEYWORDS = new Set([
  "IN", "AS", "ON", "USING", "WHERE", "PREWHERE", "AND", "OR", "NOT", "SELECT", "BY", "HAVING", "WHEN",
  "THEN", "ELSE", "BETWEEN", "IS", "FROM", "JOIN", "DISTINCT", "ALL", "ANY", "INTERVAL",
  "LIMIT", "OFFSET", "EXCEPT", "UNION", "INTERSECT", "OVER", "WITH", "CASE", "END", "VALUES", "EXISTS",
  "GLOBAL", "QUALIFY", "SETTINGS",
]);

/** Statement keywords that modify data or schema; never valid inside a read-only query. */
const MUTATION_KEYWORDS = new Set([
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "RENAME", "ATTACH", "DETACH",
  "OPTIMIZE", "GRANT", "REVOKE", "KILL", "EXCHANGE", "UNDROP",
]);

const MULTI_CHAR_OPS = ["->", "::", "<=", ">=", "!=", "<>", "||", "=="];
const SINGLE_CHAR_OPS = new Set(["(", ")", "[", "]", "{", "}", ",", ".", ";", "+", "-", "*", "/", "%", "=", "<", ">", "?", ":"]);

const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_$]/u;
const NUMBER_RE = /^(?:0x[0-9a-f]+|0b[01]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i;
const PARAM_RE = /^\{\s*[A-Za-z_][A-Za-z0-9_]*\s*:[^{}]*\}/;

function readQuoted(sql: string, start: number, quote: string): { value: string; end: number } {
  let i = start + 1;
  let value = "";
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "\\" && i + 1 < sql.length) {
      value += sql[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (sql[i + 1] === quote) {
        value += quote;
        i += 2;
        continue;
      }
      return { value, end: i + 1 };
    }
    value += ch;
    i += 1;
  }
  throw new SqlParseError(`Unterminated ${quote === "'" ? "string literal" : "quoted identifier"} at position ${start}`);
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, value: string, pos: number) =>
    tokens.push({ kind, value, upper: kind === "ident" ? value.toUpperCase() : value, pos });

  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    // Comments: -- ..., # ..., #! ..., /* ... */ (nesting allowed, as in ClickHouse)
    if (sql.startsWith("--", i) || (ch === "#" && (sql[i + 1] === " " || sql[i + 1] === "!" || i + 1 === sql.length))) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 0;
      let j = i;
      while (j < sql.length) {
        if (sql.startsWith("/*", j)) {
          depth += 1;
          j += 2;
        } else if (sql.startsWith("*/", j)) {
          depth -= 1;
          j += 2;
          if (depth === 0) break;
        } else {
          j += 1;
        }
      }
      if (depth !== 0) throw new SqlParseError(`Unterminated comment at position ${i}`);
      i = j;
      continue;
    }
    if (ch === "'") {
      const { value, end } = readQuoted(sql, i, "'");
      push("string", value, i);
      i = end;
      continue;
    }
    if (ch === "`" || ch === '"') {
      const { value, end } = readQuoted(sql, i, ch);
      push("qident", value, i);
      i = end;
      continue;
    }
    if (ch === "{") {
      const match = PARAM_RE.exec(sql.slice(i));
      if (match) {
        push("param", match[0], i);
        i += match[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? "") && !isMemberAccess(tokens))) {
      const match = NUMBER_RE.exec(sql.slice(i));
      if (match) {
        push("number", match[0], i);
        i += match[0].length;
        continue;
      }
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < sql.length && IDENT_PART.test(sql[j])) j += 1;
      push("ident", sql.slice(i, j), i);
      i = j;
      continue;
    }
    const multi = MULTI_CHAR_OPS.find((op) => sql.startsWith(op, i));
    if (multi) {
      push("op", multi, i);
      i += multi.length;
      continue;
    }
    if (SINGLE_CHAR_OPS.has(ch)) {
      push("op", ch, i);
      i += 1;
      continue;
    }
    throw new SqlParseError(`Unexpected character '${ch}' at position ${i}`);
  }
  return tokens;
}

/** `t.1` is tuple element access, not the number `.1`. */
function isMemberAccess(tokens: Token[]): boolean {
  const prev = tokens[tokens.length - 1];
  return prev !== undefined && (prev.kind === "ident" || prev.kind === "qident" || prev.value === ")" || prev.value === "]");
}

const isOp = (t: Token | undefined, value: string): boolean => t !== undefined && t.kind === "op" && t.value === value;
const isWord = (t: Token | undefined, upper: string): boolean => t !== undefined && t.kind === "ident" && t.upper === upper;
const isName = (t: Token | undefined): t is Token =>
  t !== undefined && (t.kind === "qident" || (t.kind === "ident" && !KEYWORDS.has(t.upper)));

const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);

/** Splits on top-level semicolons, verifying bracket balance. */
function splitStatements(tokens: Token[]): Token[][] {
  const statements: Token[][] = [];
  const stack: string[] = [];
  let current: Token[] = [];
  for (const tok of tokens) {
    if (tok.kind === "op" && OPENERS[tok.value]) {
      stack.push(OPENERS[tok.value]);
    } else if (tok.kind === "op" && CLOSERS.has(tok.value)) {
      if (stack.pop() !== tok.value) throw new SqlParseError(`Unbalanced '${tok.value}' at position ${tok.pos}`);
    } else if (tok.kind === "op" && tok.value === ";" && stack.length === 0) {
      if (current.length > 0) statements.push(current);
      current = [];
      continue;
    }
    current.push(tok);
  }
  if (stack.length > 0) throw new SqlParseError("Unbalanced brackets: missing closing bracket");
  if (current.length > 0) statements.push(current);
  return statements;
}

type Context = "root" | "query" | "func" | "expr";

/** Returns, for each token, the context of the innermost bracket enclosing it. */
function computeContexts(tokens: Token[]): Context[] {
  const contexts: Context[] = [];
  const stack: Context[] = ["root"];
  tokens.forEach((tok, i) => {
    contexts.push(stack[stack.length - 1]);
    if (tok.kind !== "op") return;
    if (tok.value === "(") {
      const next = tokens[i + 1];
      const prev = tokens[i - 1];
      let kind: Context = "expr";
      if (isWord(next, "SELECT") || isWord(next, "WITH")) kind = "query";
      else if (prev && (prev.kind === "qident" || (prev.kind === "ident" && !EXPR_PAREN_KEYWORDS.has(prev.upper)))) kind = "func";
      stack.push(kind);
    } else if (tok.value === "[" || tok.value === "{") {
      stack.push("expr");
    } else if (CLOSERS.has(tok.value)) {
      stack.pop();
    }
  });
  return contexts;
}

function matchingClose(tokens: Token[], openIndex: number): number {
  let depth = 0;
  for (let j = openIndex; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.kind !== "op") continue;
    if (OPENERS[t.value]) depth += 1;
    else if (CLOSERS.has(t.value)) {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  throw new SqlParseError("Unbalanced brackets");
}

export function analyzeSql(sql: string): SqlAnalysis {
  const statements = splitStatements(tokenize(sql));
  const analysis: SqlAnalysis = {
    statementCount: statements.length,
    statementKeyword: null,
    mutationKeywords: [],
    tables: [],
    cteNames: new Set(),
    hasJoin: false,
    columns: [],
    wildcards: [],
    functions: [],
    limit: { present: false, value: null },
  };
  if (statements.length !== 1) return analysis;

  const toks = statements[0];
  const ctx = computeContexts(toks);
  const consumed = new Set<number>();

  const first = toks.find((t) => !isOp(t, "("));
  if (!first || first.kind !== "ident") {
    throw new SqlParseError("Statement must begin with a keyword");
  }
  analysis.statementKeyword = first.upper;

  const inQuery = (i: number) => ctx[i] === "root" || ctx[i] === "query";

  /** Parses one FROM/JOIN source starting at `j`; returns the index after it. */
  const parseTableRef = (j: number): number => {
    let k = j;
    if (isOp(toks[k], "(")) {
      k = matchingClose(toks, k) + 1;
    } else {
      const parts: string[] = [];
      while (toks[k] && (toks[k].kind === "ident" || toks[k].kind === "qident")) {
        parts.push(toks[k].value);
        consumed.add(k);
        k += 1;
        if (isOp(toks[k], ".") && toks[k + 1] && (toks[k + 1].kind === "ident" || toks[k + 1].kind === "qident")) {
          k += 1;
          continue;
        }
        break;
      }
      if (parts.length === 0) throw new SqlParseError(`Expected table reference at position ${toks[j]?.pos ?? "end"}`);
      if (parts.length > 2) throw new SqlParseError(`Invalid table reference '${parts.join(".")}'`);
      const isFunction = isOp(toks[k], "(");
      if (isFunction) {
        analysis.functions.push(parts[parts.length - 1]);
        k = matchingClose(toks, k) + 1;
      }
      analysis.tables.push({
        db: parts.length === 2 ? parts[0] : null,
        name: parts[parts.length - 1],
        alias: null,
        isFunction,
      });
    }
    const ref = toks[j] && isOp(toks[j], "(") ? null : analysis.tables[analysis.tables.length - 1];

    if (isWord(toks[k], "FINAL")) k += 1;
    if (isWord(toks[k], "SAMPLE")) {
      k += 1;
      while (toks[k] && (toks[k].kind === "number" || isOp(toks[k], "/") || isWord(toks[k], "OFFSET"))) k += 1;
    }
    let aliasIndex = -1;
    if (isWord(toks[k], "AS") && toks[k + 1] && (toks[k + 1].kind === "ident" || toks[k + 1].kind === "qident")) {
      aliasIndex = k + 1;
    } else if (isName(toks[k])) {
      aliasIndex = k;
    }
    if (aliasIndex !== -1) {
      consumed.add(aliasIndex);
      if (ref) ref.alias = toks[aliasIndex].value;
      k = aliasIndex + 1;
    }
    return k;
  };

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];

    if (tok.kind === "ident" && MUTATION_KEYWORDS.has(tok.upper) && !isOp(toks[i + 1], "(")) {
      analysis.mutationKeywords.push(tok.upper);
    }

    // Function calls: name followed by "(" that is not an expression keyword.
    if (isOp(tok, "(") && ctx[i + 1] === "func") {
      const prev = toks[i - 1];
      if (prev && !consumed.has(i - 1)) analysis.functions.push(prev.value);
    }

    // CTE definition: name AS ( SELECT ...
    if (
      (tok.kind === "ident" || tok.kind === "qident") &&
      isWord(toks[i + 1], "AS") &&
      isOp(toks[i + 2], "(") &&
      (isWord(toks[i + 3], "SELECT") || isWord(toks[i + 3], "WITH"))
    ) {
      analysis.cteNames.add(tok.value);
      consumed.add(i);
      continue;
    }

    if (!inQuery(i) || tok.kind !== "ident") continue;

    if (tok.upper === "FROM") {
      let k = parseTableRef(i + 1);
      while (isOp(toks[k], ",")) {
        analysis.hasJoin = true; // comma join
        k = parseTableRef(k + 1);
      }
    } else if (tok.upper === "JOIN") {
      if (isWord(toks[i - 1], "ARRAY")) continue; // ARRAY JOIN expands an array column, not a table
      analysis.hasJoin = true;
      parseTableRef(i + 1);
    } else if (tok.upper === "INTERVAL" && toks[i + 2]?.kind === "ident") {
      consumed.add(i + 2); // INTERVAL 1 DAY
    }
  }

  // Alias definitions, casts and column references.
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    // "expr AS alias" and "CAST(x AS Type)": the identifier after AS is a name, not a column.
    if (isWord(tok, "AS") && toks[i + 1] && (toks[i + 1].kind === "ident" || toks[i + 1].kind === "qident")) {
      consumed.add(i + 1);
      continue;
    }
    if (isOp(tok, "::") && toks[i + 1]?.kind === "ident") {
      consumed.add(i + 1);
      continue;
    }
    if (isOp(tok, "*")) {
      const prev = toks[i - 1];
      if (inQuery(i) && prev && (isWord(prev, "SELECT") || isWord(prev, "DISTINCT") || isOp(prev, ","))) {
        analysis.wildcards.push({ qualifier: null });
      }
      continue;
    }
    if (tok.kind !== "ident" && tok.kind !== "qident") continue;
    if (consumed.has(i) || isOp(toks[i - 1], ".")) continue;
    if (tok.kind === "ident" && KEYWORDS.has(tok.upper)) continue;

    const parts = [tok.value];
    let j = i + 1;
    while (isOp(toks[j], ".") && toks[j + 1] && (toks[j + 1].kind === "ident" || toks[j + 1].kind === "qident")) {
      parts.push(toks[j + 1].value);
      j += 2;
    }
    if (isOp(toks[j], "(") || isOp(toks[j], "->")) continue; // function call or lambda parameter
    if (isOp(toks[j], ".") && isOp(toks[j + 1], "*")) {
      analysis.wildcards.push({ qualifier: parts[parts.length - 1] });
      continue;
    }
    analysis.columns.push({
      qualifier: parts.length >= 2 ? parts[parts.length - 2] : null,
      name: parts[parts.length - 1],
    });
  }

  // Top-level LIMIT (ignoring LIMIT n BY ...). Supports "LIMIT n [OFFSET m]" and "LIMIT m, n".
  for (let i = 0; i < toks.length; i++) {
    if (ctx[i] !== "root" || !isWord(toks[i], "LIMIT")) continue;
    let countTok = toks[i + 1];
    let end = i + 2;
    if (isOp(toks[i + 2], ",")) {
      countTok = toks[i + 3];
      end = i + 4;
    }
    if (isWord(toks[end], "BY")) continue;
    const value = countTok?.kind === "number" ? Number(countTok.value) : null;
    analysis.limit = { present: true, value: value !== null && Number.isFinite(value) ? value : null };
  }

  return analysis;
}
