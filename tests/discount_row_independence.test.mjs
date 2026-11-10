import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sanitizeAdminDiamonds } from '../src/inventoryUtils.ts';
import {
  handleGetAdminDiamonds,
  handleUpdateAdminDiamond,
} from '../server/services/inventory.mjs';
import { computeDiscount } from '../server/services/pricing.mjs';

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      res.statusCode = code;
      res.headers = { ...res.headers, ...headers };
    },
    end(data) {
      res.body = data || '';
    },
    get json() {
      try {
        return JSON.parse(res.body);
      } catch {
        return null;
      }
    },
  };
  return res;
}

function createMockReq(headers = {}, body = null) {
  async function* generator() {
    if (body !== null) {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    }
  }
  const req = generator();
  req.headers = { ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

describe('Discount Row Independence & Actions Single Line Verification', () => {
  const cssPath = resolve(process.cwd(), 'src/AuthPages.css');
  const tsxPath = resolve(process.cwd(), 'src/AuthPages.tsx');
  const css = readFileSync(cssPath, 'utf8');
  const tsx = readFileSync(tsxPath, 'utf8');

  it('sanitizeAdminDiamonds guarantees unique, non-empty string IDs across all rows', () => {
    const rawItems = [
      { sku: 'HMD-LG-1001', category: 'Certified', carat: 1.5, color: 'E', clarity: 'VVS2', customerPrice: 1850, dealerPrice: 1350, status: 'published' },
      { sku: 'HMD-LG-1002', category: 'Certified', carat: 2.0, color: 'F', clarity: 'VS1', customerPrice: 2650, dealerPrice: 1950, status: 'published' },
      { id: 'dup-id', sku: 'HMD-LG-1003', category: 'Certified', carat: 2.5, color: 'D', clarity: 'VVS1', customerPrice: 4200, dealerPrice: 3100, status: 'published' },
      { id: 'dup-id', sku: 'HMD-LG-1004', category: 'Certified', carat: 3.0, color: 'E', clarity: 'VS2', customerPrice: 4900, dealerPrice: 3600, status: 'published' },
      { sku: '', category: 'Certified', carat: 0.5, color: 'G', clarity: 'SI1', customerPrice: 500, dealerPrice: 350, status: 'published' },
    ];

    const sanitized = sanitizeAdminDiamonds(rawItems);
    assert.strictEqual(sanitized.length, 5);

    const ids = sanitized.map(item => item.id);
    // All IDs must be non-empty strings
    for (const id of ids) {
      assert.strictEqual(typeof id, 'string');
      assert.ok(id.trim().length > 0, 'ID must not be empty');
    }

    // All IDs must be strictly unique (Set size equals array length)
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, 'Every diamond must have a unique ID');

    // Duplicate 'dup-id' on index 3 was disambiguated
    assert.strictEqual(sanitized[2].id, 'dup-id');
    assert.strictEqual(sanitized[3].id, 'dup-id-3');
  });

  it('handleGetAdminDiamonds endpoint guarantees all items have non-empty, unique IDs', async () => {
    const req = { headers: {} };
    let responseStatus = 0;
    let responseData = null;
    const res = {
      writeHead: (status) => { responseStatus = status; },
      end: (payload) => { responseData = JSON.parse(payload); },
    };
    const admin = { user: { id: 'admin-uuid', email: 'admin@heymandiamond.com' }, permissions: { can_manage_inventory: true } };
    const url = new URL('http://localhost:3000/api/admin/diamonds');

    await handleGetAdminDiamonds(req, res, admin, url);
    assert.strictEqual(responseStatus, 200);
    assert.ok(Array.isArray(responseData.items));
    assert.ok(responseData.items.length > 0);

    const ids = responseData.items.map(item => item.id);
    for (const id of ids) {
      assert.strictEqual(typeof id, 'string');
      assert.ok(id.trim().length > 0, 'Every item returned from API must have a non-empty string ID');
    }
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, 'All IDs returned by GET /api/admin/diamonds must be unique');
  });

  it('handleUpdateAdminDiamond updates ONLY the target diamond and does not bleed discounts into others', async () => {
    const targetId = 'seed-hmd-lg-1002';
    const otherId = 'seed-hmd-lg-1003';

    // Mock request updating only targetId with 15% discount
    const req = createMockReq({}, {
      customerDiscountPrice: 2252.5,
      customerDiscountPercent: 15,
      dealerDiscountPrice: 1755,
      dealerDiscountPercent: 10,
    });
    const res = createMockRes();
    const admin = { user: { id: 'admin-uuid' }, permissions: { can_manage_inventory: true } };

    await handleUpdateAdminDiamond(req, res, admin, targetId);
    assert.strictEqual(res.statusCode, 200);

    // Verify other diamond was untouched
    const resCatalog = createMockRes();
    await handleGetAdminDiamonds(createMockReq(), resCatalog, admin, new URL('http://localhost:3000/api/admin/diamonds'));
    assert.strictEqual(resCatalog.statusCode, 200);

    const targetDiamond = resCatalog.json.items.find(i => i.id === targetId || i.sku === 'HMD-LG-1002');
    const otherDiamond = resCatalog.json.items.find(i => i.id === otherId || i.sku === 'HMD-LG-1003');

    assert.ok(targetDiamond, 'Target diamond exists');
    assert.strictEqual(targetDiamond.customerDiscountPercent, 15);
    assert.strictEqual(targetDiamond.dealerDiscountPercent, 10);

    assert.ok(otherDiamond, 'Other diamond exists');
    // Other diamond must NOT have inherited the 15% or 10% discount!
    assert.notStrictEqual(otherDiamond.customerDiscountPercent, 15);
    assert.notStrictEqual(otherDiamond.dealerDiscountPercent, 10);
  });

  it('validates customer and dealer discount isolation within the same row', () => {
    const listPrice = 1850;
    const wholesalePrice = 1350;

    // Customer discount 20%
    const custDisc = computeDiscount(listPrice, null, 20);
    assert.strictEqual(custDisc.discountPercent, 20);
    assert.strictEqual(custDisc.discountPrice, 1480);

    // Dealer discount 5%
    const dealerDisc = computeDiscount(wholesalePrice, null, 5);
    assert.strictEqual(dealerDisc.discountPercent, 5);
    assert.strictEqual(dealerDisc.discountPrice, 1282.5);

    // Assert independence: dealer discount values are completely independent from customer discount
    assert.notStrictEqual(custDisc.discountPercent, dealerDisc.discountPercent);
    assert.notStrictEqual(custDisc.discountPrice, dealerDisc.discountPrice);
  });

  it('verifies frontend per-row draft state and revert capability in AuthPages.tsx', () => {
    // Draft state definition and isolation
    assert.match(tsx, /const\s+\[diamondDrafts,\s*setDiamondDrafts\]\s*=\s*useState<Record<string,\s*DiamondRowDraft>>\({}\)/);
    // Row draft lookup strictly by dId
    assert.match(tsx, /const\s+dId\s*=\s*String\(d\.id\s*\|\|\s*''\)\.trim\(\)/);
    assert.match(tsx, /const\s+draft\s*=\s*dId\s*\?\s*diamondDrafts\[dId\]\s*:\s*undefined/);
    // Missing ID guard
    assert.match(tsx, /hasInvalidId/);
    assert.match(tsx, /⚠️ ID Missing/);
    // Revert draft support
    assert.match(tsx, /revertRowDraft/);
    assert.match(tsx, /diamond-revert-btn/);
  });

  it('verifies Bug 2 CSS requirements: Action buttons in ONE line, sticky right, and Status column width', () => {
    // Single line flex row with no wrap
    assert.match(css, /\.diamond-row-actions\s*\{[^}]*display:\s*flex;/);
    assert.match(css, /\.diamond-row-actions\s*\{[^}]*flex-direction:\s*row;/);
    assert.match(css, /\.diamond-row-actions\s*\{[^}]*flex-wrap:\s*nowrap;/);
    assert.match(css, /\.diamond-row-actions\s*\{[^}]*white-space:\s*nowrap;/);

    // Equal heights across buttons
    assert.match(css, /\.diamond-save-btn[^{]*\{[^}]*height:\s*34px;/);

    // Sticky Actions column with background and shadow
    assert.match(css, /\.diamonds-table\s+th:nth-child\(7\)[^{]*\{[^}]*position:\s*sticky;/);
    assert.match(css, /\.diamonds-table\s+td:nth-child\(7\)[^{]*\{[^}]*position:\s*sticky;/);
    assert.match(css, /\.diamonds-table\s+th:nth-child\(7\)[^{]*\{[^}]*right:\s*0;/);
    assert.match(css, /\.diamonds-table\s+td:nth-child\(7\)[^{]*\{[^}]*right:\s*0;/);
    assert.match(css, /\.diamonds-table\s+th:nth-child\(7\)[^{]*\{[^}]*min-width:\s*240px;/);

    // Status column width
    assert.match(css, /\.diamonds-table\s+th:nth-child\(6\)[^{]*\{[^}]*min-width:\s*110px;/);
    assert.match(css, /\.diamonds-table\s+td:nth-child\(6\)[^{]*\{[^}]*min-width:\s*110px;/);
  });
});
