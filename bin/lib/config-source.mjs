import { parse } from '@babel/parser';
import { keyPath } from './files.mjs';

const wrappers = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TypeCastExpression', 'ParenthesizedExpression']);
const unsupported = () => new Error('该字段使用动态表达式、展开或不明确的定义，请用 mintfolio config edit 打开配置文件修改。');

function unwrap(node) {
  while (node && wrappers.has(node.type)) node = node.expression;
  return node;
}

/**
 * Locate an exported config object without evaluating host code or its imports.
 * Supports literals, top-level const aliases, TS satisfies/as, and defineSiteConfig.
 * @param {string} source Original ESM/TypeScript source.
 * @param {string} filename Used in syntax diagnostics.
 * @returns {{source:string,root:object}} Parsed source with an editable object root.
 */
export function configSource(source, filename = 'config.mjs') {
  const ast = parse(source, { sourceType: 'module', sourceFilename: filename, plugins: ['typescript'] });
  const constants = new Map();
  const siteHelpers = new Set();
  for (const statement of ast.program.body) {
    if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
      for (const declaration of statement.declarations) if (declaration.id.type === 'Identifier') constants.set(declaration.id.name, declaration.init);
    }
    if (statement.type === 'ImportDeclaration' && statement.source.value === '@mintfolio/core/config') {
      for (const specifier of statement.specifiers) if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'defineSiteConfig') siteHelpers.add(specifier.local.name);
    }
  }
  const declaration = ast.program.body.find(statement => statement.type === 'ExportDefaultDeclaration');
  if (!declaration) throw new Error(`${filename} 必须有 export default。`);
  let root = unwrap(declaration.declaration);
  const visited = new Set();
  while (root?.type === 'Identifier') {
    if (visited.has(root.name)) throw unsupported();
    visited.add(root.name);
    root = unwrap(constants.get(root.name));
  }
  if (root?.type === 'CallExpression' && root.callee.type === 'Identifier' && siteHelpers.has(root.callee.name) && root.arguments.length === 1) root = unwrap(root.arguments[0]);
  if (root?.type !== 'ObjectExpression') throw unsupported();
  return { source, root };
}

function propertyName(property) {
  if (property.type !== 'ObjectProperty' || property.computed || property.method) throw unsupported();
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'StringLiteral' || property.key.type === 'NumericLiteral') return String(property.key.value);
  throw unsupported();
}

function properties(node) {
  const entries = new Map();
  for (const property of node.properties) {
    const name = propertyName(property);
    if (entries.has(name)) throw unsupported();
    entries.set(name, property);
  }
  return entries;
}

/** @param {{source:string,root:object}} document @param {string[]} keys @returns {object|undefined} Source node for a direct field. */
export function sourceNode(document, keys) {
  let node = document.root;
  for (const key of keys) {
    node = unwrap(node);
    if (node?.type === 'ObjectExpression') node = properties(node).get(key)?.value;
    else if (node?.type === 'ArrayExpression' && /^(0|[1-9]\d*)$/.test(key)) node = node.elements[Number(key)];
    else if (node === undefined) return undefined;
    else throw unsupported();
  }
  return unwrap(node);
}

/**
 * Read literal data. Expressions are represented explicitly, never executed.
 * @param {{source:string,root:object}} document Parsed config.
 * @param {object|undefined} [node] Node to inspect, or the default export.
 * @returns {unknown} JSON-compatible value; dynamic leaves have a $expression key.
 */
export function sourceValue(document, node = document.root) {
  node = unwrap(node);
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  if (node.type === 'ArrayExpression') return node.elements.map(element => element ? sourceValue(document, element) : null);
  if (node.type === 'ObjectExpression') return Object.fromEntries([...properties(node)].map(([name, property]) => [name, sourceValue(document, property.value)]));
  return { $expression: document.source.slice(node.start, node.end) };
}

function indentation(source, index) {
  return source.slice(source.lastIndexOf('\n', index - 1) + 1, index).match(/^[\t ]*/)[0];
}

/**
 * Change just one field's source range, preserving imports and surrounding comments.
 * Unknown intermediate objects are created; ambiguous/dynamic containers fail.
 * @param {string} source Original ESM/TS content.
 * @param {string} key Dotted field path; numeric segments address existing array items.
 * @param {unknown} value JSON-serializable replacement.
 * @param {string} [filename] Diagnostic filename.
 * @returns {string} Updated source, still with the original surrounding formatting.
 */
export function setSourceValue(source, key, value, filename) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return editSource(source, key, value, (input, indent) => JSON.stringify(input, null, 2).replace(/\n/g, eol + indent), filename);
}

/**
 * Like setSourceValue, but writes literal source text such as a commented
 * object template, re-indented to the field's position.
 * @param {string} source Original ESM/TS content.
 * @param {string} key Dotted field path; missing parents are not created.
 * @param {string} text Valid JavaScript expression source.
 * @param {string} [filename] Diagnostic filename.
 * @returns {string} Updated, re-parsed source.
 */
export function setSourceText(source, key, text, filename) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const render = (input, indent) => {
    if (input !== text) throw new Error('只能写入父对象已存在的字段。');
    return lines.map((line, index) => index && line ? indent + line : line).join(eol);
  };
  const result = editSource(source, key, text, render, filename);
  configSource(result, filename);
  return result;
}

/**
 * Source text of a config file's exported object, including comments inside it.
 * @param {string} source ESM config whose default export is an object literal.
 * @param {string} [filename] Diagnostic filename.
 * @returns {string} Object literal text, from the opening to the closing brace.
 */
export function objectText(source, filename) {
  const { root } = configSource(source, filename);
  return source.slice(root.start, root.end);
}

/** Shared range edit; format renders the replacement at the given indentation. */
function editSource(source, key, value, format, filename) {
  const document = configSource(source, filename);
  const keys = keyPath(key);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  let container = document.root;
  for (let index = 0; index < keys.length; index++) {
    container = unwrap(container);
    const name = keys[index];
    let node;
    let property;
    if (container?.type === 'ObjectExpression') {
      property = properties(container).get(name);
      node = property?.value;
    } else if (container?.type === 'ArrayExpression' && /^(0|[1-9]\d*)$/.test(name) && Number(name) < container.elements.length) node = container.elements[Number(name)];
    else throw unsupported();
    if (node && index < keys.length - 1) { container = node; continue; }
    let replacement = value;
    for (const tail of keys.slice(index + 1).reverse()) {
      if (/^\d+$/.test(tail)) throw new Error('不能通过下标创建数组，请用 JSON 设置完整数组。');
      replacement = { [tail]: replacement };
    }
    if (node) {
      if (property?.shorthand) return source.slice(0, property.start) + `${name}: ${format(replacement, indentation(source, property.start))}` + source.slice(property.end);
      return source.slice(0, node.start) + format(replacement, indentation(source, node.start)) + source.slice(node.end);
    }
    const last = container.properties.at(-1);
    const baseIndent = indentation(source, container.start);
    const indent = last ? indentation(source, last.start) || baseIndent + '  ' : baseIndent + '  ';
    const entry = `${JSON.stringify(name)}: ${format(replacement, indent)},`;
    const insertion = `${eol}${indent}${entry}${eol}${baseIndent}`;
    const edits = [{ start: container.end - 1, end: container.end - 1, text: insertion }];
    // Babel excludes a property's trailing comma from its range. Ignore comments
    // while checking that comma, then place any missing comma before the comment.
    if (last && !/^\s*,/.test(source.slice(last.end, container.end - 1).replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, ''))) edits.push({ start: last.end, end: last.end, text: ',' });
    let result = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    configSource(result, filename);
    return result;
  }
  throw unsupported();
}
