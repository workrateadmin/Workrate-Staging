import assert from "node:assert/strict";
import test from "node:test";
import {
  csvValue,
  inPeriod,
  isFinanceDate,
  validateFinanceAmounts,
} from "../src/lib/financeValidation";

test("finance dates reject malformed and impossible calendar values", () => {
  assert.equal(isFinanceDate("2026-02-28"), true);
  assert.equal(isFinanceDate("2024-02-29"), true);
  assert.equal(isFinanceDate("2026-02-29"), false);
  assert.equal(isFinanceDate("2026-2-01"), false);
  assert.equal(isFinanceDate("not-a-date"), false);
});

test("period matching uses inclusive calendar boundaries", () => {
  assert.equal(inPeriod("2026-04-06", "2026-04-06", "2027-04-05"), true);
  assert.equal(inPeriod("2027-04-05", "2026-04-06", "2027-04-05"), true);
  assert.equal(inPeriod("2026-04-05", "2026-04-06", "2027-04-05"), false);
});

test("finance amount validation prevents negative and inconsistent totals", () => {
  assert.equal(validateFinanceAmounts({ grossAmount: 120, netAmount: 100, vatAmount: 20 }), null);
  assert.match(validateFinanceAmounts({ grossAmount: -1 }), /cannot be negative/);
  assert.match(validateFinanceAmounts({ grossAmount: 120, netAmount: 100, vatAmount: 10 }), /must equal/);
  assert.match(validateFinanceAmounts({ grossAmount: "not-a-number" }), /valid number/);
});

test("CSV values preserve columns for accountant exports", () => {
  assert.equal(csvValue("TradePoint"), "TradePoint");
  assert.equal(csvValue('A "quoted", item'), '"A ""quoted"", item"');
  assert.equal(csvValue("line one\nline two"), '"line one\nline two"');
  for (const token of ["=", "+", "-", "@"]) {
    assert.equal(csvValue(`${token}unsafe-formula`), `'${token}unsafe-formula`);
  }
  assert.equal(csvValue(" \t=unsafe-formula"), "' \t=unsafe-formula");
});