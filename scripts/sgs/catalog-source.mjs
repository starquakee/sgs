// SGS adapter, GPL-3.0-only. Parse upstream data without executing game modules.
import ts from "typescript";

export function parseSource(file, text) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  if (ast.parseDiagnostics.length) {
    throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText, " ")}`);
  }
  return ast;
}

export function location(node) {
  const ast = node.getSourceFile();
  return { file: ast.fileName, line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1 };
}

export function propertyName(node) {
  if (node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))) return node.text;
  throw new Error("Non-static property name");
}

export function literal(node) {
  if (!node) throw new Error("Missing literal");
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return -literal(node.operand);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map(prop => {
      if (!ts.isPropertyAssignment(prop)) throw new Error("Non-literal object member");
      return [propertyName(prop.name), literal(prop.initializer)];
    }));
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return literal(node.left) + literal(node.right);
  }
  throw new Error(`Non-literal expression at ${JSON.stringify(location(node))}`);
}

export function binding(ast, name) {
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer;
    }
  }
  throw new Error(`${ast.fileName}: missing binding ${name}`);
}

export function defaultObject(ast) {
  const exported = ast.statements.find(ts.isExportAssignment)?.expression;
  if (!exported) throw new Error(`${ast.fileName}: missing default export`);
  const result = ts.isIdentifier(exported) ? binding(ast, exported.text) : exported;
  if (!ts.isObjectLiteralExpression(result)) throw new Error(`${ast.fileName}: default export is not a static object`);
  return result;
}

// Keep the effective last property and report overridden definitions. Never dedupe silently.
export function objectEntries(node, diagnostics, kind) {
  if (!ts.isObjectLiteralExpression(node)) throw new Error(`Expected ${kind} object`);
  const entries = new Map();
  for (const prop of node.properties) {
    let id;
    try { id = propertyName(prop.name); } catch {
      diagnostics.push({ kind: "dynamic-member", table: kind, source: location(prop) });
      continue;
    }
    const entry = { id, node: ts.isPropertyAssignment(prop) ? prop.initializer : prop, source: location(prop) };
    if (entries.has(id)) diagnostics.push({ kind: "duplicate-property", table: kind, id,
      previous: entries.get(id).source, effective: entry.source });
    entries.set(id, entry);
  }
  return [...entries.values()];
}

export function fields(node) {
  if (!ts.isObjectLiteralExpression(node)) return new Map();
  return new Map(node.properties.filter(ts.isPropertyAssignment).map(prop => {
    try { return [propertyName(prop.name), prop.initializer]; } catch { return [null, prop.initializer]; }
  }));
}

export function readText(entry) {
  if (!entry) return { value: null, status: "missing", source: null };
  try {
    const value = literal(entry.node);
    if (typeof value === "string") return { value, status: "parsed", source: entry.source };
  } catch { /* Dynamic translations must remain explicitly unresolved. */ }
  return { value: null, status: "dynamic", source: entry.source };
}

export { ts };
