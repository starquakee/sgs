// Presentation metadata only. Parse the pinned sources; never import/evaluate them.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ts, parseSource, defaultObject, objectEntries, fields, literal, binding, location } from './catalog-source.mjs';

export function plainDescription(value) {
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|ul|ol)>/gi, '\n').replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

export function createDescriptionReader(tables, { rules = new Map(), dynamicSkills = new Set() } = {}) {
  const source = entry => entry ? { ...entry.source, ...(entry.sha256 ? { sha256: entry.sha256 } : {}) } : null;
  function find(pack, id) {
    const local = tables.get(pack)?.get(id);
    if (local) return { entry: local, pack };
    const candidates = [...tables].flatMap(([owner, table]) => table.has(id) ? [{ entry: table.get(id), pack: owner }] : []);
    if (!candidates.length) return { reason: 'missing' };
    // Identical literals are unambiguous. Dynamic expressions in separate packs
    // may resolve their references differently; do not equate their source text.
    if (candidates.length === 1) return candidates[0];
    const values = candidates.map(({ entry }) => { try { return literal(entry.node); } catch { return undefined; } });
    if (typeof values[0] === 'string' && values.every(value => value === values[0])) return candidates[0];
    return { reason: 'ambiguous' };
  }
  function nameOf(pack, id) {
    const rule = rules.get(id);
    if (rule) return { text: rule.name, source: rule.source };
    const found = find(pack, id);
    try { const value = literal(found.entry?.node); if (typeof value === 'string') return { text: plainDescription(value), source: source(found.entry) }; } catch {}
    return { text: id, source: null, reason: found.reason || 'dynamic' };
  }
  function describe(pack, id) {
    const terms = new Map(), stack = new Set();
    function readEntry(entry, owner, key) {
      if (!entry) return { text: null, status: 'unresolved', reason: 'missing', source: null };
      if (stack.has(key)) return { text: null, status: 'unresolved', reason: 'cycle', source: source(entry) };
      if (stack.size >= 32) return { text: null, status: 'unresolved', reason: 'depth', source: source(entry) };
      stack.add(key);
      try { return { text: plainDescription(evaluate(entry.node, owner, new Map())), status: 'static', source: source(entry) }; }
      catch (error) { return { text: null, status: 'unresolved', reason: error.message, source: source(entry) }; }
      finally { stack.delete(key); }
    }
    function term(owner, target, node) {
      if (typeof target === 'object') {
        const props = fields(target);
        const name = evaluate(props.get('name'), owner, new Map());
        const key = props.has('id') ? evaluate(props.get('id'), owner, new Map()) : `${location(node).file}:${node.pos}`;
        const entry = { node: props.get('info'), source: location(node), sha256: target.sgsSourceHash };
        const termKey = `${owner}:${key}`;
        if (!terms.has(termKey)) {
          const record = { id: key, name: plainDescription(name), text: null, status: 'unresolved', source: source(entry) };
          terms.set(termKey, record);
          if (!props.has('info') && props.get('dialog') && literal(props.get('dialog')) === 'characterDialog') {
            record.status = 'character'; record.characterId = key.replace(/^character_/, '');
          } else Object.assign(record, readEntry(entry, owner, termKey));
        }
        return name;
      }
      const localTerm = terms.get(`${owner}:${target}`);
      if (localTerm) return localTerm.name;
      const label = nameOf(owner, target);
      const found = find(owner, `${target}_info`), rule = rules.get(target);
      const termKey = `${found.pack || owner}:${target}`;
      if (!terms.has(termKey)) {
        const record = { id: target, name: label.text, text: null, status: 'unresolved', source: label.source };
        terms.set(termKey, record);
        if (rule) Object.assign(record, { text: plainDescription(rule.info), status: 'static', source: rule.source });
        else if (found.entry) Object.assign(record, readEntry(found.entry, found.pack, termKey));
        else record.reason = found.reason;
      }
      if (label.reason) throw new Error(`reference-name-${label.reason}:${target}`);
      return label.text;
    }
    function evaluate(node, owner, locals) {
      if (!node) throw new Error('missing');
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isIdentifier(node) && locals.has(node.text)) return locals.get(node.text);
      if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => evaluate(span.expression, owner, locals) + span.literal.text).join('');
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return evaluate(node.left, owner, locals) + evaluate(node.right, owner, locals);
      if (ts.isCallExpression(node) && node.expression.getText() === 'get.poptip' && node.arguments.length === 1) {
        const arg = node.arguments[0];
        return term(owner, ts.isObjectLiteralExpression(arg) ? arg : evaluate(arg, owner, locals), node);
      }
      // Exact, finite upstream form: [literal strings].map(x => get.poptip(x)).join(literal).
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join' && node.arguments.length <= 1) {
        const map = node.expression.expression;
        if (ts.isCallExpression(map) && ts.isPropertyAccessExpression(map.expression) && map.expression.name.text === 'map'
          && ts.isArrayLiteralExpression(map.expression.expression) && map.arguments.length === 1) {
          const callback = map.arguments[0];
          if (ts.isArrowFunction(callback) && callback.parameters.length === 1 && ts.isIdentifier(callback.parameters[0].name)
            && ts.isCallExpression(callback.body) && callback.body.expression.getText() === 'get.poptip'
            && callback.body.arguments.length === 1 && ts.isIdentifier(callback.body.arguments[0])
            && callback.body.arguments[0].text === callback.parameters[0].name.text) {
            return map.expression.expression.elements.map(element => term(owner, literal(element), callback.body))
              .join(node.arguments.length ? literal(node.arguments[0]) : ',');
          }
        }
      }
      throw new Error(`unsupported:${ts.SyntaxKind[node.kind]}`);
    }
    const found = find(pack, `${id}_info`);
    const result = found.entry ? readEntry(found.entry, found.pack, `${found.pack}:${id}`)
      : { text: null, status: 'unresolved', reason: found.reason, source: null };
    return { ...result, dynamic: dynamicSkills.has(`${pack}:${id}`) || dynamicSkills.has(`${found.pack}:${id}`), terms: [...terms.values()] };
  }
  return { describe };
}

export async function loadDescriptionReader(root = new URL('../../', import.meta.url)) {
  const tables = new Map(), rules = new Map(), dynamicSkills = new Set();
  async function ast(file) {
    const raw = await readFile(new URL(file, root));
    return { tree: parseSource(file, raw.toString('utf8')), sha256: createHash('sha256').update(raw).digest('hex') };
  }
  function table(node, hash) {
    return new Map(objectEntries(node, [], 'lobby-description').map(entry => {
      // Hash every nested inline term against its containing source file too.
      const visit = n => { if (ts.isObjectLiteralExpression(n)) n.sgsSourceHash = hash; ts.forEachChild(n, visit); };
      visit(entry.node);
      return [entry.id, { ...entry, sha256: hash }];
    }));
  }
  const packs = (await readdir(new URL('apps/core/character/', root), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  for (const pack of packs) {
    const { tree, sha256 } = await ast(`apps/core/character/${pack}/translate.js`);
    tables.set(pack, table(defaultObject(tree), sha256));
    try {
      const { tree: dynamic } = await ast(`apps/core/character/${pack}/dynamicTranslate.js`);
      for (const entry of objectEntries(defaultObject(dynamic), [], 'dynamicTranslate')) dynamicSkills.add(`${pack}:${entry.id}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const file of (await readdir(new URL('apps/core/card/', root))).filter(file => file.endsWith('.js')).sort()) {
    const { tree, sha256 } = await ast(`apps/core/card/${file}`);
    let exported;
    try { exported = defaultObject(tree); } catch { continue; }
    const translations = fields(exported).get('translate');
    if (translations && ts.isObjectLiteralExpression(translations)) tables.set(`card/${file}`, table(translations, sha256));
  }
  const { tree, sha256 } = await ast('apps/core/noname/library/poptip.js');
  const entries = binding(tree, '_poptipMap').arguments[0];
  for (const pair of entries.elements) {
    const [id, value] = literal(pair);
    rules.set(id, { ...value, source: { ...location(pair), sha256 } });
  }
  return createDescriptionReader(tables, { rules, dynamicSkills });
}
