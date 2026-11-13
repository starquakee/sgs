// Mandatory post-build integration gate (node --test tests/sgs/native-build.integration.mjs).
// Exercise callbacks from the shipped bundle: source-only checks miss minifier aliases
// that native StepParser cannot recover when it reconstructs the function body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseSource } from '../../scripts/sgs/catalog-source.mjs';

const output = new URL('../../dist-sgs/', import.meta.url);
const compilerFile = new URL('../../apps/core/noname/library/element/GameEvent/compilers/StepCompiler.ts', import.meta.url);

function hasCall(node, method, argument) {
  let found = false;
  function visit(current) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)
      && current.expression.name.text === method
      && current.arguments.some(value => ts.isStringLiteral(value) && value.text === argument)) found = true;
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function emittedSurrenderCallbacks() {
  const pending = [new URL('noname.js', output)], visited = new Set(), callbacks = [];
  while (pending.length) {
    const file = pending.shift();
    if (visited.has(file.href)) continue;
    visited.add(file.href);
    assert.ok(file.href.startsWith(output.href) && !file.href.startsWith(new URL('src/', output).href),
      'inspect emitted modules only, never the preserved source copies');
    let code;
    try { code = readFileSync(file, 'utf8'); }
    catch (error) { throw new Error(`Missing production module ${fileURLToPath(file)}; run node scripts/sgs/build.mjs first`, { cause: error }); }
    const ast = parseSource(fileURLToPath(file), code);
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        pending.push(new URL(specifier.text, file));
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'setContent') {
        const callback = node.arguments[0];
        if (callback && ts.isFunctionExpression(callback)
          && hasCall(callback, 'popup', '投降') && hasCall(callback, 'die', 'nosource')) {
          callbacks.push({
            code: callback.getText(ast),
            kind: hasCall(callback, 'set', '_triggered') ? 'local' : 'online',
            location: `${fileURLToPath(file)}:${ast.getLineAndCharacterOfPosition(callback.getStart()).line + 1}`,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.deepEqual(callbacks.map(callback => callback.kind).sort(), ['local', 'online'],
    'both original surrender callbacks must be present in the emitted engine dependency graph');
  return callbacks;
}

function nativeStepParser(game) {
  const ast = parseSource(fileURLToPath(compilerFile), readFileSync(compilerFile, 'utf8'));
  const declaration = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'StepParser');
  assert.ok(declaration, 'use the real native StepParser class');
  const code = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const AsyncFunction = (async function () {}).constructor;
  // Isolate browser sandbox/reporting and the final array dispatcher, keeping the
  // native formatFunction, parseStep, packStep and reconstructed closure intact.
  return new Function('security', 'ContentCompiler', 'ErrorManager', 'CodeSnippet',
    '_status', 'ai', 'game', 'get', 'lib', 'ui', `${code}\nreturn StepParser;`)(
    { getIsolatedsFrom: () => [null, null, AsyncFunction], isSandboxRequired: () => false },
    { compile: contents => contents }, { setCodeSnippet() {} }, class {},
    {}, {}, game, {}, {}, {},
  );
}

test('production surrender callbacks retain their native StepParser bindings and death behavior', async t => {
  for (const { code, kind, location } of emittedSurrenderCallbacks()) {
    await t.test(`${kind} surrender`, async () => {
      const calls = [], death = { set(key, value) { this[key] = value; return this; } };
      const player = {
        popup(text) { calls.push(['popup', text]); },
        die(source) { calls.push(['die', source]); return death; },
      };
      const game = { log(actor, text) { calls.push(['log', actor, text]); } };
      const StepParser = nativeStepParser(game);
      // Like the native parser, this intentionally does not preserve the bundle's
      // outer lexical scope. It must use the engine's canonical game/player vars.
      const callback = new Function(`return (${code});`)();
      const parser = new StepParser(callback);
      const contents = parser.getResult();
      assert.equal(contents.length, 1, location);
      for (const content of contents) await content({ player }, null, player);
      assert.deepEqual(calls, [['log', player, '投降'], ['popup', '投降'], ['die', 'nosource']], location);
      assert.equal(death.includeOut, true, location);
      if (kind === 'local') assert.equal(death._triggered, null, location);
      else assert.equal(Object.hasOwn(death, '_triggered'), false, location);
    });
  }
});
