// Нотолгооноос тоо ГАРГАХ давхаргын тестүүд (status.js) болон нотолгоог
// ХАДГАЛАХ давхаргынх (bridge.js). Энэ хоёр бол системийн зүрх: тэдгээрийн
// дүрэм өөрчлөгдвөл БҮХ ТҮҮХ дагаж өөрчлөгддөг тул алдаа нь чимээгүй бөгөөд
// эргэж баригдахгүй. Тиймээс л энд тест бий.

"use strict";

const { makeCtx, load, ago } = require("./harness.js");
const assert = require("assert");

module.exports = async function ({ t, section }) {

function api(integrations) {
  const ctx = makeCtx();
  const a = load(ctx, ["data.js", "bridge.js", "status.js"]);
  a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
  if (integrations) a.webData.integrations = integrations;
  a.Status.invalidate();
  return a;
}
const src = (evidence, rollups) => ({ status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
  prunedBefore: 0, evidence: evidence || [], rollups: rollups || {} });

section("Нотолгооноос гаргалт");

await t("түүхий gym нотолгоо → бодит kg", () => {
  const a = api({ gym: src([
    { id: "a", at: ago(1), type: "workout.completed", value: 1, detail: "Push", data: { volumeKg: 4200 } },
    { id: "b", at: ago(2), type: "workout.completed", value: 1, detail: "Pull", data: { volumeKg: 3800 } }
  ]) });
  const m = a.Status.get().metrics["gym.volume"];
  assert.strictEqual(m.last30, 8000);
  assert.strictEqual(m.activeDays30, 2);
});

await t("НЭГТГЭСЭН хувин dataSums-аас kg-аа СЭРГЭЭНЭ (өмнө нь мөнхөд 0 болдог байсан)", () => {
  const a = api({ gym: src([], { "2025-01": { "workout.completed":
    { count: 10, valueSum: 10, dataSums: { volumeKg: 52000 }, firstAt: 1, lastAt: 2 } } }) });
  const s = a.Status.get();
  assert.strictEqual(s.metrics["gym.volume"].total, 52000);
  assert.strictEqual(s.overall.rollupGaps.length, 0);
});

await t("dataSums-гүй ХУУЧИН хувин → 0, ГЭХДЭЭ rollupGaps-д ил гарна", () => {
  const a = api({ gym: src([], { "2025-01": { "workout.completed":
    { count: 10, valueSum: 10, firstAt: 1, lastAt: 2 } } }) });
  const s = a.Status.get();
  assert.strictEqual(s.metrics["gym.volume"].total, 0);
  assert.strictEqual(s.overall.rollupGaps.length, 1, "цоорхой бүртгэгдээгүй");
  assert.strictEqual(s.overall.rollupGaps[0].metric, "gym.volume");
});

await t("нэгтгэсэн сар monthly хүснэгтэд ордог", () => {
  const a = api({ gym: src([], { "2025-01": { "workout.completed":
    { count: 2, valueSum: 2, dataSums: { volumeKg: 900 }, firstAt: 1, lastAt: 2 } } }) });
  const monthly = a.Status.get().metrics["gym.volume"].monthly;
  assert.deepEqual(monthly.map(x => [x.month, x.value]), [["2025-01", 900]]);
});

await t("provenance: metric.recent нотолгоог буцааж заана, шинийг нь дээр нь", () => {
  const a = api({ gym: src([
    { id: "a", at: ago(3), type: "workout.completed", value: 1, detail: "Хуучин", data: { volumeKg: 100 } },
    { id: "b", at: ago(1), type: "workout.completed", value: 1, detail: "Шинэ",  data: { volumeKg: 200 } }
  ]) });
  const r = a.Status.get().metrics["gym.volume"].recent;
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].detail, "Шинэ");
  assert.strictEqual(r[0].amount, 200);
  assert.strictEqual(r[0].app, "gym");
});

await t("recent нь 12 мөрөөр таслагдана", () => {
  const ev = [];
  for (let i = 0; i < 40; i++) ev.push({ id: "e" + i, at: ago(i % 20), type: "commit.pushed", value: 1, detail: "c" + i, data: null });
  const a = api({ github: src(ev) });
  assert.strictEqual(a.Status.get().metrics["github.commits"].recent.length, 12);
});

await t("sources түүхий ба нэгтгэсэн тоог ЯЛГАНА", () => {
  const a = api({ github: src(
    [{ id: "x", at: ago(1), type: "commit.pushed", value: 1, detail: "c", data: null }],
    { "2025-01": { "commit.pushed": { count: 40, valueSum: 40, dataSums: {}, firstAt: 1, lastAt: 2 } } }) });
  const s = a.Status.get().sources.github;
  assert.strictEqual(s.rawCount, 1);
  assert.strictEqual(s.rolledCount, 40);
  assert.strictEqual(s.evidenceCount, 41);
});

await t("нотолгоо огт байхгүй → бүрэн, тэг үр дүн", () => {
  const s = api({}).Status.get();
  assert.strictEqual(Object.keys(s.metrics).length, 4);
  assert.strictEqual(s.attributes.BODY.score, 0);
  assert.strictEqual(s.attributes.CREATION.score, 0);
  assert.strictEqual(s.overall.totalEvents, 0);
});

await t("танигдаагүй төрөл чимээгүй алга болохгүй", () => {
  const s = api({ gym: src([{ id: "z", at: ago(1), type: "sauna.session", value: 1, detail: "", data: null }]) }).Status.get();
  assert.deepEqual(s.overall.unmappedTypes, ["gym:sauna.session"]);
});

await t("100%-ийг ХЭЗЭЭ Ч зохиохгүй: өмнөх цонх хоосон бол change нь null", () => {
  const s = api({ github: src([{ id: "n", at: ago(1), type: "commit.pushed", value: 1, detail: "", data: null }]) }).Status.get();
  assert.strictEqual(s.metrics["github.commits"].change30Pct, null);
});

section("Ангилал ↔ метрикийн зорилт");

await t("ангилал дээр зорилтын ХУУЛБАР үлдээгүй", () => {
  const a = api({});
  Object.keys(a.webData.categories).forEach(k => {
    const cat = a.webData.categories[k];
    assert.ok(cat.metricId, k + " метрикгүй");
    assert.strictEqual(cat.targetValue, undefined, k + " дээр targetValue хуулбар үлдсэн");
    assert.strictEqual(cat.unit, undefined, k + " дээр unit хуулбар үлдсэн");
    assert.ok(a.METRIC_DEFS[cat.metricId], k + " → тодорхойлогдоогүй метрик");
  });
});

await t("метрик бүр ангилалтай — CREATION нүх үлдээгүй", () => {
  const a = api({});
  const linked = new Set(Object.keys(a.webData.categories).map(k => a.webData.categories[k].metricId));
  Object.keys(a.METRIC_DEFS).forEach(id => assert.ok(linked.has(id), id + " ангилалгүй"));
});

await t("METRICS-ийн заасан метрик бүр METRIC_DEFS-д бүртгэлтэй", () => {
  const a = api({});
  Object.keys(a.METRICS).forEach(k => {
    const id = a.METRICS[k].metric;
    assert.ok(a.METRIC_DEFS[id], k + " → бүртгэлгүй метрик " + id);
  });
});

section("bridge: rollUpEvidence");

await t("data-гийн тоон талбарыг нэрээр нь хураана", () => {
  const a = api();
  const state = { rollups: {} };
  a.rollUpEvidence(state, [
    { at: ago(300), type: "workout.completed", value: 1, data: { volumeKg: 1000, reps: 40 } },
    { at: ago(300), type: "workout.completed", value: 1, data: { volumeKg: 500,  reps: 20 } }
  ]);
  const b = state.rollups[Object.keys(state.rollups)[0]]["workout.completed"];
  assert.strictEqual(b.count, 2);
  assert.strictEqual(b.dataSums.volumeKg, 1500);
  assert.strictEqual(b.dataSums.reps, 60);
});

await t("тоо биш талбарыг (repo: 'x') нийлбэрт оруулахгүй", () => {
  const a = api();
  const state = { rollups: {} };
  a.rollUpEvidence(state, [{ at: ago(300), type: "commit.pushed", value: 1, data: { repo: "summer-project" } }]);
  const b = state.rollups[Object.keys(state.rollups)[0]]["commit.pushed"];
  assert.deepEqual(Object.keys(b.dataSums), []);
});

await t("байгаа хувин дээр НЭМНЭ — дарж бичихгүй", () => {
  const a = api();
  const state = { rollups: {} };
  const rec = { at: ago(300), type: "workout.completed", value: 2, data: { volumeKg: 100 } };
  a.rollUpEvidence(state, [rec]);
  a.rollUpEvidence(state, [rec]);
  const b = state.rollups[Object.keys(state.rollups)[0]]["workout.completed"];
  assert.strictEqual(b.count, 2);
  assert.strictEqual(b.valueSum, 4);
  assert.strictEqual(b.dataSums.volumeKg, 200);
});

await t("dataSums-гүй ХУУЧИН хувин дээр нэмэхэд эвдрэхгүй", () => {
  const a = api();
  const month = new Date(ago(300)); month.setMinutes(month.getMinutes() - month.getTimezoneOffset());
  const key = month.toISOString().slice(0, 7);
  const state = { rollups: { [key]: { "workout.completed": { count: 5, valueSum: 5, firstAt: 1, lastAt: 2 } } } };
  a.rollUpEvidence(state, [{ at: ago(300), type: "workout.completed", value: 1, data: { volumeKg: 700 } }]);
  const b = state.rollups[key]["workout.completed"];
  assert.strictEqual(b.count, 6);
  assert.strictEqual(b.dataSums.volumeKg, 700);
});

await t("pruneEvidence: хуучин бичлэгийг ХАЯХГҮЙ, нэгтгээд нэгжийг нь үлдээнэ", () => {
  const a = api();
  const state = { evidence: [
    { id: "old", at: ago(300), type: "workout.completed", value: 1, data: { volumeKg: 900 } },
    { id: "new", at: ago(2),   type: "workout.completed", value: 1, data: { volumeKg: 100 } }
  ], rollups: {}, prunedBefore: 0 };
  a.pruneEvidence(state);
  assert.strictEqual(state.evidence.length, 1, "шинэ бичлэг үлдээгүй");
  assert.strictEqual(state.evidence[0].id, "new");
  const b = state.rollups[Object.keys(state.rollups)[0]]["workout.completed"];
  assert.strictEqual(b.dataSums.volumeKg, 900, "нэгтгэсэн kg алдагдсан");
});

await t("нэгтгэсний дараа НИЙТ дүн хэвээр (түүх агшихгүй)", () => {
  const a = api();
  const state = { evidence: [
    { id: "old", at: ago(300), type: "workout.completed", value: 1, data: { volumeKg: 900 } },
    { id: "new", at: ago(2),   type: "workout.completed", value: 1, data: { volumeKg: 100 } }
  ], rollups: {}, prunedBefore: 0 };
  a.pruneEvidence(state);
  a.webData.integrations = { gym: Object.assign({ status: null, updatedAt: Date.now(), lastSyncedAt: Date.now() }, state) };
  a.Status.invalidate();
  assert.strictEqual(a.Status.get().metrics["gym.volume"].total, 1000);
});

};
