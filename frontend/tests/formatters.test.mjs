import assert from 'node:assert/strict'
import test from 'node:test'
import { formatNumber, formatWeight } from '../src/utils/formatters.ts'
import { calculateSaleTotal } from '../src/utils/money.ts'

test('formats sales weights with up to three decimal places', () => {
  assert.equal(formatWeight(40), '40')
  assert.equal(formatWeight(40.000), '40')
  assert.equal(formatWeight(15.5), '15.5')
  assert.equal(formatWeight(15.500), '15.5')
  assert.equal(formatWeight(6.015), '6.015')
  assert.equal(formatWeight(10.005), '10.005')
  assert.equal(formatWeight(12.340), '12.34')
  assert.equal(formatWeight(0.125), '0.125')
})

test('preserves weights with more than three meaningful decimal places', () => {
  assert.equal(formatWeight(1.2345), '1.2345')
  assert.equal(formatWeight(10.0051), '10.0051')
})

test('leaves general number and currency-oriented formatting unchanged', () => {
  assert.equal(formatNumber(6.015), '6.02')
  assert.equal(formatNumber(8.5), '8.5')
  assert.equal(formatNumber(1_234.567), '1,234.57')
})

test('does not change the full weight used for sales calculations', () => {
  assert.equal(calculateSaleTotal('6.015', '123.45'), 742.55)
})
