import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCSV,
  parseDiamondSpreadsheet,
  generateInventoryTemplate,
  filterInventory,
} from '../server/services/inventory.mjs'

test('Inventory Service — CSV and TSV Parsing', () => {
  const standardCsv = 'SKU,Shape,Carat\nHMD-1,Round,1.5\nHMD-2,Oval,2.0'
  const parsed = parseCSV(standardCsv)
  assert.equal(parsed.length, 3)
  assert.deepEqual(parsed[0], ['SKU', 'Shape', 'Carat'])
  assert.deepEqual(parsed[1], ['HMD-1', 'Round', '1.5'])

  const quotedCsv = 'SKU,Measurements\nHMD-1,"7.35 x 7.39 x 4.52, mm"\nHMD-2,"10.12, 7.15 mm"'
  const parsedQuoted = parseCSV(quotedCsv)
  assert.equal(parsedQuoted[1][1], '7.35 x 7.39 x 4.52, mm')

  const tsv = 'SKU\tShape\tCarat\nHMD-3\tEmerald\t2.5'
  const parsedTsv = parseCSV(tsv)
  assert.equal(parsedTsv.length, 2)
  assert.equal(parsedTsv[1][1], 'Emerald')
})

test('Inventory Service — Diamond Spreadsheet Normalization and Validation', () => {
  const validCsv = `
SKU,Shape,Carat,Color,Clarity,Cut,Polish,Symmetry,Fluorescence,Lab,Certificate Number,Price,Wholesale Price
HMD-101,Round,1.52,E,VVS2,Ideal,Excellent,Excellent,None,IGI,LG624918231,1850,1350
HMD-102,Oval,2.05,F,VS1,Excellent,Excellent,Very Good,None,IGI,LG628104928,2650,1950
HMD-BAD,Radiant,INVALID_CARAT,D,VS2,Excellent,Excellent,Excellent,None,IGI,LG999,3000,2100
`.trim()

  const result = parseDiamondSpreadsheet(validCsv)
  assert.equal(result.items.length, 2)
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].reason.includes('Invalid carat'), true)

  const firstDiamond = result.items[0]
  assert.equal(firstDiamond.sku, 'HMD-101')
  assert.equal(firstDiamond.shape, 'Round')
  assert.equal(firstDiamond.carat, 1.52)
  assert.equal(firstDiamond.color, 'E')
  assert.equal(firstDiamond.clarity, 'VVS2')
  assert.equal(firstDiamond.price, 1850)
  assert.equal(firstDiamond.wholesalePrice, 1350)
  assert.equal(firstDiamond.lab, 'IGI')
  assert.equal(firstDiamond.certificateNumber, 'LG624918231')

  assert.throws(() => {
    parseDiamondSpreadsheet('Random,Header,Only\n1,2,3')
  }, /must contain at least "Carat" and "Shape" columns/)
})

test('Inventory Service — 4Cs Filtering and Search', () => {
  const inventory = [
    { sku: 'HMD-001', shape: 'Round', carat: 1.05, color: 'D', clarity: 'VVS1', cut: 'Ideal', lab: 'IGI', price: 1500, certificateNumber: 'LG1' },
    { sku: 'HMD-002', shape: 'Round', carat: 2.10, color: 'G', clarity: 'VS2', cut: 'Excellent', lab: 'GIA', price: 2800, certificateNumber: 'GIA2' },
    { sku: 'HMD-003', shape: 'Emerald', carat: 2.50, color: 'E', clarity: 'VVS2', cut: 'Ideal', lab: 'IGI', price: 4200, certificateNumber: 'LG3' },
    { sku: 'HMD-004', shape: 'Oval', carat: 3.20, color: 'F', clarity: 'SI1', cut: 'Very Good', lab: 'IGI', price: 3900, certificateNumber: 'LG4' },
  ]

  const shapeFiltered = filterInventory(inventory, { shape: 'Round' })
  assert.equal(shapeFiltered.length, 2)

  const caratFiltered = filterInventory(inventory, { minCarat: '2.0', maxCarat: '3.0' })
  assert.equal(caratFiltered.length, 2)
  assert.deepEqual(caratFiltered.map(i => i.sku), ['HMD-002', 'HMD-003'])

  const colorFiltered = filterInventory(inventory, { color: 'D,E' })
  assert.equal(colorFiltered.length, 2)

  const priceFiltered = filterInventory(inventory, { maxPrice: '2000' })
  assert.equal(priceFiltered.length, 1)
  assert.equal(priceFiltered[0].sku, 'HMD-001')

  const searchFiltered = filterInventory(inventory, { q: 'GIA2' })
  assert.equal(searchFiltered.length, 1)
  assert.equal(searchFiltered[0].sku, 'HMD-002')
})

test('Inventory Service — Downloadable CSV Template', () => {
  const template = generateInventoryTemplate()
  assert.equal(template.includes('SKU,Shape,Carat,Color,Clarity'), true)
  assert.equal(template.includes('Round'), true)
  assert.equal(template.includes('LG624918231'), true)
})
