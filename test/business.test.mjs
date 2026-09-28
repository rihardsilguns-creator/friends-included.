import test from "node:test";
import assert from "node:assert/strict";
import { PEOPLE, RuleError, assertAction, commissionFor, dashboard, normalizeSplit } from "../lib/business.mjs";

test("commission shares must total 100", () => assert.throws(() => normalizeSplit({ richard: 60, anastasia: 30, "jean-claude": 20 }), /exactly 100/));
test("commission pool and changed split are calculated in cents", () => {
  const result = commissionFor(150000, { richard: 20, anastasia: 30, "jean-claude": 50 });
  assert.deepEqual(result, { poolCents: 15000, split: { richard: 20, anastasia: 30, "jean-claude": 50 }, amounts: { richard: 3000, anastasia: 4500, "jean-claude": 7500 } });
});
test("permission checks happen in business logic", () => {
  const richard = PEOPLE.find(p => p.id === "richard"), kevin = PEOPLE.find(p => p.id === "kevin");
  assert.throws(() => assertAction(richard, "manage"), error => error instanceof RuleError && error.status === 403);
  assert.throws(() => assertAction(kevin, "submitSale"), /not allowed/);
});

test("Test 1 produces the required totals", () => {
  const sales = [
    { status:"Approved", project:"A", amount_cents:100000, commission_pool_cents:10000, commission_richard_cents:5000, commission_anastasia_cents:3000, commission_jean_claude_cents:2000 },
    { status:"Approved", project:"B", amount_cents:200000, commission_pool_cents:20000, commission_richard_cents:4000, commission_anastasia_cents:8000, commission_jean_claude_cents:8000 }
  ];
  const expenses = [{ amount_cents:12000, final_allocation:"A" }, { amount_cents:8000, final_allocation:"A" }, { amount_cents:10000, final_allocation:"Company overhead" }];
  const d = dashboard(sales, expenses);
  assert.equal(d.project.A.resultCents, 70000); assert.equal(d.project.B.resultCents, 180000); assert.equal(d.company.resultCents, 240000);
  assert.deepEqual(d.earned, { richard:9000, anastasia:11000, "jean-claude":10000 });
});

test("cumulative Test 2 totals reconcile exactly", () => {
  const sales = [
    ["A",100000,10000,5000,3000,2000],["B",200000,20000,4000,8000,8000],["A",150000,15000,3000,4500,7500],["B",80000,8000,2000,2000,4000]
  ].map(([project,amount_cents,commission_pool_cents,commission_richard_cents,commission_anastasia_cents,commission_jean_claude_cents]) => ({status:"Approved",project,amount_cents,commission_pool_cents,commission_richard_cents,commission_anastasia_cents,commission_jean_claude_cents}));
  sales.push({status:"Pending approval",project:"B",amount_cents:60000,commission_pool_cents:0});
  const expenses = [[12000,"A"],[8000,"A"],[10000,"Company overhead"],[25000,"B"],[9000,"B"],[6000,"Company overhead"],[14000,null]].map(([amount_cents,final_allocation]) => ({amount_cents,final_allocation}));
  const d = dashboard(sales, expenses);
  assert.equal(d.project.A.resultCents,205000); assert.equal(d.project.B.resultCents,218000); assert.equal(d.company.resultCents,393000);
  assert.deepEqual(d.earned,{richard:14000,anastasia:17500,"jean-claude":21500});
  assert.equal(d.company.overheadCents,16000); assert.equal(d.company.awaitingCents,14000);
});
