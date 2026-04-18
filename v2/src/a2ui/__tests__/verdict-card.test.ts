/**
 * VerdictCard unit tests — runnable via `tsx`.
 *
 * Covers the two things that must be right about VerdictCard before shipping:
 *
 *   1. Catalog wiring: the validator accepts a VerdictCard component as a
 *      valid catalog entry, with `data` required; rejects missing `data`.
 *      Without this, hermes can't emit VerdictCard surfaces.
 *
 *   2. Correctness-as-design helpers: status semantics, address shortening,
 *      format helpers, and pool-vault concentration math. The concentration
 *      math in particular is load-bearing — excluding pool vaults from the
 *      untrusted-holder sum is what makes the card defensible as a signal.
 *
 * JSX rendering is NOT unit-tested here (no JSDOM in this test harness);
 * the dev preview (A2UIDevPreview.tsx) + validate-examples.ts cover that
 * path end-to-end.
 */

import assert from 'node:assert/strict'
import { validateSurface } from '../validate'
import type { SurfaceState } from '../types'
import {
  statusMeta,
  shortAddress,
  formatPct,
  formatAge,
  concentrationSplit,
} from '../renderer/components/VerdictCardComponent'

/* ------------------------------------------------------------------ */
/*  Validator wiring                                                  */
/* ------------------------------------------------------------------ */

function testValidatorAcceptsVerdictCard() {
  const surface: SurfaceState = {
    surfaceId: 'verdict_test',
    catalogId: 'aurora-chat://catalog/v0.1.json',
    components: {
      root: {
        id: 'root',
        component: 'VerdictCard',
        data: { ca: '0xabc', ticker: 'TEST' },
      },
    },
    dataModel: {},
  }
  const errors = validateSurface(surface)
  assert.deepEqual(
    errors,
    [],
    `expected no validation errors, got: ${JSON.stringify(errors)}`
  )
}

function testValidatorRejectsVerdictCardMissingData() {
  const surface: SurfaceState = {
    surfaceId: 'verdict_test',
    catalogId: 'aurora-chat://catalog/v0.1.json',
    components: {
      // Intentionally malformed — validator must catch missing `data`
      // so hermes gets a useful error back. Cast bypasses the type,
      // mirroring what happens when bad JSON arrives from the wire.
      root: { id: 'root', component: 'VerdictCard' } as never,
    },
    dataModel: {},
  }
  const errors = validateSurface(surface)
  assert.ok(
    errors.some((e) => /Required field "data"/.test(e.message)),
    `expected missing-data error, got: ${JSON.stringify(errors)}`
  )
}

/* ------------------------------------------------------------------ */
/*  statusMeta — shared vocabulary for all three composer rows        */
/* ------------------------------------------------------------------ */

function testStatusMetaPositive() {
  for (const s of ['ok', 'pass', 'clean', 'safe', 'OK']) {
    const m = statusMeta(s)
    assert.equal(m.glyph, '✓', `expected ✓ for '${s}', got ${m.glyph}`)
    assert.match(m.color, /success/, `expected success color for '${s}'`)
  }
}

function testStatusMetaCaution() {
  for (const s of ['caution', 'warn', 'warning', 'partial']) {
    const m = statusMeta(s)
    assert.equal(m.glyph, '⚠', `expected ⚠ for '${s}'`)
  }
}

function testStatusMetaDanger() {
  for (const s of ['danger', 'hard_rug', 'rug', 'honeypot', 'fail']) {
    const m = statusMeta(s)
    assert.equal(m.glyph, '⛔', `expected ⛔ for '${s}'`)
    assert.match(m.color, /danger/, `expected danger color for '${s}'`)
  }
}

function testStatusMetaUnknownPending() {
  const m = statusMeta(undefined)
  assert.equal(m.glyph, '?', 'undefined status should render as pending')
  assert.equal(m.label, 'pending')
  assert.match(m.color, /muted/, 'pending should use muted color')

  const m2 = statusMeta('some_new_status_we_havent_mapped')
  assert.equal(m2.glyph, '?', 'unmapped status should also render as pending')
}

/* ------------------------------------------------------------------ */
/*  Formatters                                                        */
/* ------------------------------------------------------------------ */

function testShortAddress() {
  assert.equal(
    shortAddress('0x1234567890abcdef1234567890abcdef12345678'),
    '0x1234…5678'
  )
  // short inputs pass through unchanged
  assert.equal(shortAddress('short'), 'short')
  // empty input is empty
  assert.equal(shortAddress(''), '')
}

function testFormatPct() {
  assert.equal(formatPct(12.345), '12.35%')
  assert.equal(formatPct(0), '0.00%')
  assert.equal(formatPct(Infinity), '—')
  assert.equal(formatPct(NaN), '—')
}

function testFormatAge() {
  assert.equal(formatAge(0.5), '30m')
  assert.equal(formatAge(1), '1.0h')
  assert.equal(formatAge(47.9), '47.9h')
  assert.equal(formatAge(48), '2d')
  assert.equal(formatAge(undefined), '—')
  assert.equal(formatAge(NaN), '—')
}

/* ------------------------------------------------------------------ */
/*  Concentration math — pool vaults excluded from untrusted sum      */
/* ------------------------------------------------------------------ */

function testConcentrationExcludesPoolVaults() {
  const holders = [
    { address: 'a', pct: 30, is_pool_vault: true },
    { address: 'b', pct: 10 },
    { address: 'c', pct: 5 },
  ]
  const split = concentrationSplit(holders)
  assert.equal(
    split.untrustedPct,
    15,
    'untrusted = sum of non-pool-vault (10 + 5 = 15)'
  )
  assert.equal(split.poolVaultPct, 30, 'pool vault sum = 30')
}

function testConcentrationIgnoresNonFinitePct() {
  const holders = [
    { address: 'a', pct: NaN },
    { address: 'b', pct: 10 },
    { address: 'c', pct: Infinity, is_pool_vault: true },
  ]
  const split = concentrationSplit(holders)
  assert.equal(split.untrustedPct, 10)
  assert.equal(split.poolVaultPct, 0)
}

function testConcentrationEmpty() {
  const split = concentrationSplit([])
  assert.equal(split.untrustedPct, 0)
  assert.equal(split.poolVaultPct, 0)
}

/* ------------------------------------------------------------------ */
/*  Runner                                                            */
/* ------------------------------------------------------------------ */

function main() {
  const tests: Array<[string, () => void]> = [
    ['validator accepts VerdictCard', testValidatorAcceptsVerdictCard],
    ['validator rejects VerdictCard missing data', testValidatorRejectsVerdictCardMissingData],
    ['statusMeta positive statuses', testStatusMetaPositive],
    ['statusMeta caution statuses', testStatusMetaCaution],
    ['statusMeta danger statuses', testStatusMetaDanger],
    ['statusMeta unknown → pending', testStatusMetaUnknownPending],
    ['shortAddress', testShortAddress],
    ['formatPct', testFormatPct],
    ['formatAge', testFormatAge],
    ['concentration excludes pool vaults', testConcentrationExcludesPoolVaults],
    ['concentration ignores non-finite pct', testConcentrationIgnoresNonFinitePct],
    ['concentration empty holders', testConcentrationEmpty],
  ]

  let passed = 0
  let failed = 0
  for (const [name, fn] of tests) {
    try {
      fn()
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${name}`)
      passed++
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`  ✖ ${name}`)
      // eslint-disable-next-line no-console
      console.error(`    ${(e as Error).message}`)
      failed++
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
