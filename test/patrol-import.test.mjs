import assert from "node:assert/strict";
import test from "node:test";
import {addPatrolRecords, readPatrolImport} from "../backend/patrol.mjs";

function exported(kind, externalId = "wa-export-07a45f") {
  return readPatrolImport([{
    channel: "whatsapp", kind, externalId, contact: "門市客人",
    sourceType: "private_message", isPeer: false, title: "配件查詢", content: "附有防塵袋。",
    occurredAt: "2026-11-24T14:30:00+08:00",
  }], false)[0];
}

test("the same WhatsApp export message cannot become both incoming and outgoing", () => {
  const existing = [exported("outgoing")];
  const retry = addPatrolRecords(existing, [exported("outgoing")]);
  assert.equal(retry.added, 0);
  assert.equal(retry.duplicates, 1);
  assert.throws(() => addPatrolRecords(existing, [exported("outgoing", "wa-export-new"), exported("incoming")]), /收發方向有衝突/);
  assert.deepEqual(existing, [exported("outgoing")]);
  assert.throws(() => addPatrolRecords([], [exported("outgoing"), exported("incoming")]), /收發方向有衝突/);
  assert.equal(addPatrolRecords(existing, [exported("found")]).added, 1);
});
