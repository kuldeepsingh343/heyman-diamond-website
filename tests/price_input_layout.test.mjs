import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Price Input Layout & CSS Alignment Verification', () => {
  const cssPath = resolve(process.cwd(), 'src/AuthPages.css');
  const tsxPath = resolve(process.cwd(), 'src/AuthPages.tsx');
  const css = readFileSync(cssPath, 'utf8');
  const tsx = readFileSync(tsxPath, 'utf8');

  it('resets inner inputs to remove borders, backgrounds, shadows, and min-height', () => {
    assert.match(css, /\.diamonds-table\s+\.diamond-pricing-cell\s+input\.diamond-price-field-input/);
    assert.match(css, /border:\s*none\s*!important/);
    assert.match(css, /background:\s*transparent\s*!important/);
    assert.match(css, /box-shadow:\s*none\s*!important/);
    assert.match(css, /min-height:\s*0\s*!important/);
    assert.match(css, /font-variant-numeric:\s*tabular-nums\s*!important/);
  });

  it('defines single outer wrappers with uniform 38px height, borders, and border-radius', () => {
    assert.match(css, /\.diamond-price-field-wrap\s*\{[^}]*height:\s*38px/);
    assert.match(css, /\.diamond-price-field-wrap\s*\{[^}]*border-radius:\s*6px/);
    assert.match(css, /\.diamond-price-field-wrap\s*\{[^}]*border:\s*1px solid/);
  });

  it('provides a single-line horizontal row for all 3 pricing inputs (List $, Disc $, %)', () => {
    assert.match(css, /\.diamond-pricing-row\s*\{[^}]*display:\s*flex/);
    assert.match(tsx, /diamond-pricing-row/);
    assert.match(tsx, /diamond-price-field-wrap--list/);
    assert.match(tsx, /diamond-price-field-wrap--disc/);
    assert.match(tsx, /diamond-price-field-wrap--pct/);
  });

  it('provides accessible aria-labels on all 6 price/discount inputs', () => {
    assert.match(tsx, /aria-label="Customer list price"/);
    assert.match(tsx, /aria-label="Customer discount price"/);
    assert.match(tsx, /aria-label="Customer discount percent"/);
    assert.match(tsx, /aria-label="Dealer list price"/);
    assert.match(tsx, /aria-label="Dealer discount price"/);
    assert.match(tsx, /aria-label="Dealer discount percent"/);
  });

  it('ensures Actions column is sticky right and 4 action buttons are arranged in one horizontal line with no wrapping', () => {
    assert.match(css, /\.diamonds-table\s+th:nth-child\(7\)[^{]*\{[^}]*position:\s*sticky/);
    assert.match(css, /\.diamonds-table\s+td:nth-child\(7\)[^{]*\{[^}]*position:\s*sticky/);
    assert.match(css, /\.diamond-row-actions\s*\{[^}]*display:\s*flex/);
    assert.match(css, /\.diamond-row-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
  });
});

