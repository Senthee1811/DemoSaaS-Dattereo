/**
 * 10.6 guard: every icon-only <button> in the app is wrapped in <Tip>, so it names what it does on
 * hover and on keyboard focus. Fails (listing the file and line) when someone adds a bare one.
 * "Icon-only" = no visible text anywhere in it: JSX text, string literals, or a variable that
 * renders text. Buttons whose label comes from a variable (nav items, tabs) are not icon-only.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const hasLetters = (s: string) => /[A-Za-z]{2,}/.test(s);

function exprIsText(e: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(e)) return exprIsText(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return hasLetters(e.text);
  if (ts.isTemplateExpression(e)) return true;
  if (ts.isConditionalExpression(e)) return exprIsText(e.whenTrue) || exprIsText(e.whenFalse);
  if (ts.isBinaryExpression(e)) return exprIsText(e.right);
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return false;
  return ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isCallExpression(e) || ts.isElementAccessExpression(e);
}

function showsText(node: ts.JsxElement): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found || ts.isJsxAttributes(n)) return;
    if (ts.isJsxText(n)) {
      if (hasLetters(n.getText())) found = true;
      return;
    }
    if (ts.isJsxExpression(n)) {
      if (n.expression && exprIsText(n.expression)) found = true;
      else if (n.expression) ts.forEachChild(n.expression, visit);
      return;
    }
    ts.forEachChild(n, visit);
  };
  node.children.forEach(visit);
  return found;
}

function hasIcon(node: ts.JsxElement): boolean {
  let icon = false;
  const visit = (n: ts.Node): void => {
    if (icon) return;
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const name = n.tagName.getText();
      if (/^[A-Z]/.test(name) && name !== 'Spinner') icon = true;
    }
    ts.forEachChild(n, visit);
  };
  node.children.forEach(visit);
  return icon;
}

describe('icon-only controls have a tooltip (10.6)', () => {
  it('no icon-only <button> is left without a <Tip>', () => {
    const bare: string[] = [];
    for (const file of [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))]) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (rel === 'components/ui/tooltip.tsx') continue;
      const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node): void => {
        if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'button' && !showsText(n) && hasIcon(n)) {
          const p = n.parent;
          const wrapped = ts.isJsxElement(p) && p.openingElement.tagName.getText() === 'Tip';
          if (!wrapped) bare.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bare).toEqual([]);
  });

  it('every icon-only <button> also has an accessible name (the tooltip is not the only label)', () => {
    const unnamed: string[] = [];
    for (const file of [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))]) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node): void => {
        if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'button' && !showsText(n) && hasIcon(n)) {
          if (!/aria-label=/.test(n.openingElement.attributes.getText())) {
            unnamed.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(unnamed).toEqual([]);
  });
});
