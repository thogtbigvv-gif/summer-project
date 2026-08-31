// ===================== ХЭН ХЭЛСЭН БЭ =====================
// Систем "батлагдсан ба батлагдаагүйг ХЭЗЭЭ Ч хольж хутгахгүй" гэж амладаг.
// Тэр амлалт метрик, атрибутын түвшинд аль эрт хэрэгжсэн: өөрөө дарсан
// check-in зөвхөн DISCIPLINE-д ордог.
//
// Гэтэл НЭГТГЭСЭН тоо — "нийт нотолгоо", "30 хоногийн идэвхтэй өдөр" —
// хоёуланг нь нэг саванд хийсээр байв. Тэр нь ердөө нэг талбарын алдаа биш:
// профайлын оноог үүрч буй ЖИН, аналитикийн CONSISTENCY хоёр эндээс гардаг
// тул ганц ч апп холбоогүй хүн өдөр бүр нүд даран "100%" харах боломжтой
// байсан. Өөрөө өөрийгөө баталсан жин бол жин биш.
//
// Эдгээр тест тэр заагийг хамгаална.

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

// Өөрөө мэдээлсэн бичлэгийг ЯГ recordSelfCheckin-ы бичдэг хэлбэрээр үүсгэнэ.
const checkin = (day, name) => ({
  id: `self:t${day}:d${day}`, at: ago(day), type: "checkin.done", value: 1,
  detail: name || "Ус уух", data: null
});

section("Нэгтгэсэн тоо: батлагдсан ба өөрөө мэдээлсэн НИЙЛЭХГҮЙ");

await t("check-in нь НИЙТ НОТОЛГООНД орохгүй, тусдаа тоологдоно", () => {
  const a = api({
    self:   src([checkin(1), checkin(2), checkin(3)]),
    github: src([{ id: "g", at: ago(1), type: "commit.pushed", value: 1, detail: "c", data: null }])
  });
  const o = a.Status.get().overall;
  assert.strictEqual(o.totalEvents, 1, "батлагдсан тоонд check-in орсон байна");
  assert.strictEqual(o.self.totalEvents, 3);
  assert.strictEqual(o.anyEvents, 4, "anyEvents хоёуланг нь тоолох ёстой");
});

await t("check-in нь ИДЭВХТЭЙ ӨДРИЙГ өсгөхгүй", () => {
  const a = api({ self: src([checkin(1), checkin(2), checkin(3), checkin(4)]) });
  const o = a.Status.get().overall;
  assert.strictEqual(o.activeDays30, 0, "аппын батлаагүй өдөр идэвхтэй гэж тоологдов");
  assert.strictEqual(o.self.activeDays30, 4);
});

await t("зөвхөн check-in дээр зогсох үед батлагдсан тоо ТЭГ гэж хэлнэ", () => {
  const a = api({ self: src([checkin(1), checkin(2)]) });
  const o = a.Status.get().overall;
  assert.strictEqual(o.totalEvents, 0);
  assert.strictEqual(o.firstEvidenceAt, 0, "check-in нь 'бүртгэл эхэлсэн' огноог үүсгэх ёсгүй");
  assert.ok(o.self.firstEvidenceAt > 0);
});

await t("аппын нотолгоо ирмэгц толгойн тоо түүнээс л гарна", () => {
  const a = api({
    self: src([checkin(1), checkin(2), checkin(3)]),
    gym:  src([{ id: "w", at: ago(2), type: "workout.completed", value: 1, detail: "Push", data: { volumeKg: 4200 } }])
  });
  const o = a.Status.get().overall;
  assert.strictEqual(o.activeDays30, 1);
  assert.strictEqual(o.totalEvents, 1);
  assert.strictEqual(o.self.activeDays30, 3);
});

await t("нэгтгэсэн check-in хувин ч батлагдсан тоонд орохгүй", () => {
  const a = api({ self: src([], { "2025-01": { "checkin.done":
    { count: 25, valueSum: 25, dataSums: {}, firstAt: 1000, lastAt: 2000 } } }) });
  const o = a.Status.get().overall;
  assert.strictEqual(o.totalEvents, 0);
  assert.strictEqual(o.self.totalEvents, 25);
  assert.strictEqual(o.self.firstEvidenceAt, 1000);
});

await t("нотолгоо огт байхгүй ч overall бүтэн хэлбэртэй гарна", () => {
  const o = api({}).Status.get().overall;
  assert.strictEqual(o.totalEvents, 0);
  assert.strictEqual(o.anyEvents, 0);
  assert.deepEqual(o.self, { activeDays30: 0, totalEvents: 0, firstEvidenceAt: 0 });
  assert.deepEqual(o.unmapped, []);
});

await t("DISCIPLINE нь check-in-аас ХЭВЭЭР тэжээгдэнэ — салгах нь хаях гэсэн үг биш", () => {
  const a = api({ self: src([checkin(1), checkin(2)]) });
  const s = a.Status.get();
  assert.strictEqual(s.metrics["self.checkins"].last30, 2);
  assert.ok(s.attributes.DISCIPLINE.score > 0, "check-in DISCIPLINE-д ороогүй байна");
  assert.strictEqual(s.attributes.BODY.score, 0, "check-in BODY-г хөдөлгөв");
});

section("Танигдаагүй төрөл: нэр дангаараа хэмжээг нууна");

await t("unmapped нь хэдэн бичлэг статуст ороогүйг тоогоор хэлнэ", () => {
  const a = api({ gym: src([
    { id: "s1", at: ago(1), type: "sauna.session", value: 1, detail: "", data: null },
    { id: "s2", at: ago(2), type: "sauna.session", value: 1, detail: "", data: null },
    { id: "s3", at: ago(3), type: "sauna.session", value: 1, detail: "", data: null }
  ]) });
  const o = a.Status.get().overall;
  assert.deepEqual(o.unmappedTypes, ["gym:sauna.session"], "хуучин гэрээ эвдэрсэн");
  assert.strictEqual(o.unmapped.length, 1);
  assert.strictEqual(o.unmapped[0].key, "gym:sauna.session");
  assert.strictEqual(o.unmapped[0].app, "gym");
  assert.strictEqual(o.unmapped[0].type, "sauna.session");
  assert.strictEqual(o.unmapped[0].count, 3);
  assert.ok(o.unmapped[0].lastAt >= ago(1) - 1000, "сүүлд ирсэн хугацаа бүртгэгдээгүй");
});

await t("нэгтгэсэн хувин дахь танигдаагүй төрөл ч бүтнээрээ тоологдоно", () => {
  const a = api({ gym: src(
    [{ id: "s1", at: ago(1), type: "sauna.session", value: 1, detail: "", data: null }],
    { "2025-01": { "sauna.session": { count: 400, valueSum: 400, dataSums: {}, firstAt: 1, lastAt: 5000 } } }) });
  const row = a.Status.get().overall.unmapped[0];
  assert.strictEqual(row.count, 401, "хувин доторх бичлэгүүд тоологдоогүй");
});

await t("хамгийн их гээгдсэн төрөл эхэнд эрэмбэлэгдэнэ", () => {
  const a = api({ gym: src([
    { id: "a1", at: ago(1), type: "sauna.session", value: 1, detail: "", data: null },
    { id: "b1", at: ago(1), type: "stretch.done", value: 1, detail: "", data: null },
    { id: "b2", at: ago(2), type: "stretch.done", value: 1, detail: "", data: null },
    { id: "b3", at: ago(3), type: "stretch.done", value: 1, detail: "", data: null }
  ]) });
  const rows = a.Status.get().overall.unmapped;
  assert.strictEqual(rows[0].type, "stretch.done");
  assert.strictEqual(rows[0].count, 3);
  assert.strictEqual(rows[1].count, 1);
});

section("Хадгалалтын дарамт: дүүрэхээс ӨМНӨ хэлнэ");

await t("хоосон сан → ok", () => {
  const ctx = makeCtx();
  const a = load(ctx, ["data.js"]);
  const p = a.storagePressure();
  assert.strictEqual(p.level, "ok");
  assert.strictEqual(p.pct, 0);
});

await t("хадгалсны дараа бодит хэмжээ мэдэгдэнэ", async () => {
  const ctx = makeCtx();
  const a = load(ctx, ["data.js"]);
  a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
  await a.saveWebData();
  const p = a.storagePressure();
  assert.ok(p.bytes > 0, "хэмжээ хэмжигдээгүй");
  assert.strictEqual(p.level, "ok");
});

await t("тааз руу ойртоход 'high' — унахыг ХҮЛЭЭХГҮЙ", async () => {
  const ctx = makeCtx();
  const a = load(ctx, ["data.js"]);
  a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
  // Таазын 80% хүрэх хэмжээний нотолгоо. Хэмжээ нь ЖИНХЭНЭ — бид зөвхөн
  // хадгалуулж, гарсан хэмжээг нь уншина.
  a.webData.integrations = { gym: { status: null, updatedAt: 1, lastSyncedAt: 1, prunedBefore: 0,
    evidence: [{ id: "big", at: 1, type: "workout.completed", value: 1,
                 detail: "x".repeat(Math.round(a.STORAGE_LIMIT_BYTES * 0.8)), data: null }], rollups: {} } };
  await a.saveWebData();
  const p = a.storagePressure();
  assert.ok(p.pct >= a.STORAGE_WARN_PCT, `pct=${p.pct}`);
  assert.strictEqual(p.level, "high");
  assert.strictEqual(a.storageWarning(), false, "хараахан унаагүй атлаа 'дүүрэв' гэв");
});

await t("setItem үнэхээр унавал 'full' болно", async () => {
  const ctx = makeCtx();
  const a = load(ctx, ["data.js"]);
  a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
  ctx.localStorage.setItem = () => { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; };
  const ok = await a.saveWebData();
  assert.strictEqual(ok, false);
  assert.strictEqual(a.storageWarning(), true);
  assert.strictEqual(a.storagePressure().level, "full");
});

await t("ачаалахад сан дахь хэмжээ ЭХНИЙ хадгалалтыг хүлээхгүй мэдэгдэнэ", async () => {
  const ctx = makeCtx();
  const a = load(ctx, ["data.js"]);
  a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
  a.webData.profile = Object.assign({}, a.webData.profile, { note: "y".repeat(200000) });
  await a.saveWebData();

  // Шинэ сесс: ижил САН, цоо шинэ орчин (хуудсыг дахин нээсэнтэй адил).
  const ctx2 = makeCtx();
  Object.assign(ctx2.__store, ctx.__store);
  const b = load(ctx2, ["data.js"]);
  assert.strictEqual(b.storagePressure().bytes, 0, "ачаалахаас өмнө 0 байх ёстой");
  await b.loadWebData();
  assert.ok(b.storagePressure().bytes > 200000, "ачаалахад хэмжээ уншигдаагүй");
});

// ===================== ДЭЛГЭЦ ДЭЭР ҮНЭХЭЭР ГАРАХ ЁСТОЙ =====================
// Дээрх бүх ялгаа гаргалтын давхаргад зөв байлаа ч дэлгэц дээр нэг мөр
// мартагдвал ХЭРЭГЛЭГЧИЙН хувьд юу ч өөрчлөгдөөгүй. Бүрэн бүтэн байдлын
// самбар нь яг "чимээгүй эвдрэлийг олж хэлэх" үүрэгтэй тул тэр өөрөө
// чимээгүй эвдэрч болохгүй.

const RENDER_FILES = ["data.js", "bridge.js", "status.js", "quests.js", "skills.js", "analytics.js", "script.js"];

function renderApi(nodeIds, integrations) {
  const nodes = {};
  const { stubNode } = require("./harness.js");
  nodeIds.forEach(id => { nodes[id] = stubNode(); });
  const ctx = makeCtx({ nodes });
  const a = load(ctx, RENDER_FILES);
  a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
  if (integrations) a.webData.integrations = integrations;
  a.Status.invalidate();
  return { a, nodes };
}

section("Дэлгэц: хэн хэлснийг ИЛ гаргана");

await t("зөвхөн check-in дээр CONSISTENCY нь 'апп батлаагүй' гэж хэлнэ", () => {
  const { a, nodes } = renderApi(["weekly-stats-container"],
    { self: src([checkin(1), checkin(2), checkin(3)]) });
  a.AnalyticsEngine.renderWeeklyStats(a.Status.get());
  const html = nodes["weekly-stats-container"].innerHTML;
  assert.ok(html.includes("0 / 30"), "ACTIVE DAYS батлагдаагүй тоог тоолов");
  assert.ok(html.includes("0%"), "CONSISTENCY батлагдаагүй тоог тоолов");
  assert.ok(html.includes("апп батлаагүй"), "шалтгааныг хэлээгүй");
  assert.ok(html.includes("3/30 өөрөө"), "check-in-ыг далдалав");
});

await t("LONGEST STREAK-ыг check-in гүйцээхгүй — дөрвүүлээ нэг хэмжүүртэй", () => {
  const { a, nodes } = renderApi(["weekly-stats-container"],
    { self: src([checkin(0), checkin(1), checkin(2), checkin(3)]) });
  a.AnalyticsEngine.renderWeeklyStats(a.Status.get());
  const html = nodes["weekly-stats-container"].innerHTML;
  assert.ok(html.includes("<strong>0 өдөр</strong>"), "цувралыг check-in-аас гаргав");
  assert.ok(html.includes("хоног өөрөө"), "check-in-ы цуврал бүрмөсөн алга болов");
});

await t("TRACKED METRICS зөвхөн батлагдах метрикийг тоолно", () => {
  const { a, nodes } = renderApi(["weekly-stats-container"],
    { self: src([checkin(0), checkin(1)]) });
  a.AnalyticsEngine.renderWeeklyStats(a.Status.get());
  const html = nodes["weekly-stats-container"].innerHTML;
  assert.ok(html.includes("<strong>0</strong>"), "check-in метрикийг 'мөшгөгдөж буй' гэж тоолов");
  assert.ok(html.includes("4 батлагдах метрикээс"), "нэрлэгч нь ч цэвэрлэгдээгүй");
});

await t("профайлын үндэс check-in-ыг ТУСДАА мөрөнд гаргана", () => {
  const { a, nodes } = renderApi(["profile-evidence"], {
    self:   src([checkin(1), checkin(2)]),
    github: src([{ id: "g", at: ago(1), type: "commit.pushed", value: 1, detail: "c", data: null }])
  });
  a.renderProfileEvidence();
  const html = nodes["profile-evidence"].innerHTML;
  assert.ok(html.includes("БАТЛАГДСАН НОТОЛГОО"));
  assert.ok(html.includes("ӨӨРӨӨ МЭДЭЭЛСЭН"));
  assert.ok(html.includes("profile-evidence-self"), "хольцгүйг нүдээр ялгаагүй");
});

await t("аппын нотолгоогүй бол профайл 'батлаагүй' гэдгээ хэлнэ", () => {
  const { a, nodes } = renderApi(["profile-evidence"], { self: src([checkin(1)]) });
  a.renderProfileEvidence();
  const html = nodes["profile-evidence"].innerHTML;
  assert.ok(html.includes("Дээрх оноог ямар ч апп батлаагүй"), "чимээгүй өнгөрөв");
  assert.ok(!html.includes("БҮРТГЭЛ ЭХЭЛСЭН"), "check-in-аас бүртгэл эхлүүлэв");
});

await t("Integrity самбар танигдаагүй төрлийн ХЭМЖЭЭГ гаргана", () => {
  const ev = [];
  for (let i = 0; i < 7; i++) ev.push({ id: "s" + i, at: ago(i + 1), type: "sauna.session", value: 1, detail: "", data: null });
  const { a, nodes } = renderApi(["integrity-sources", "integrity-warnings", "integrity-meta"],
    { gym: src(ev) });
  a.AnalyticsEngine.renderIntegrity(a.Status.get());
  const html = nodes["integrity-warnings"].innerHTML;
  assert.ok(html.includes("gym:sauna.session"));
  assert.ok(html.includes("7 бичлэг"), "хэдэн бичлэг гээгдсэнийг хэлээгүй");
  assert.ok(html.includes("ХАДГАЛАГДСАН"), "нотолгоо устсан мэт ойлгогдож болзошгүй");
});

await t("гар бүртгэл 'идэвхтэй эх сурвалж' гэж тоологдохгүй", () => {
  const { a, nodes } = renderApi(["integrity-sources", "integrity-warnings", "integrity-meta"],
    { self: src([checkin(1)]) });
  a.AnalyticsEngine.renderIntegrity(a.Status.get());
  assert.strictEqual(nodes["integrity-meta"].textContent, "0 / 3 ЭХ СУРВАЛЖ ИДЭВХТЭЙ");
  assert.ok(nodes["integrity-sources"].innerHTML.includes('data-state="self"'));
});

await t("хадгалалт дүүрэхээс ӨМНӨ самбар сануулна", async () => {
  const { a, nodes } = renderApi(["integrity-sources", "integrity-warnings", "integrity-meta"]);
  a.webData.integrations = { gym: { status: null, updatedAt: 1, lastSyncedAt: 1, prunedBefore: 0,
    evidence: [{ id: "big", at: 1, type: "workout.completed", value: 1,
                 detail: "x".repeat(Math.round(a.STORAGE_LIMIT_BYTES * 0.8)), data: null }], rollups: {} } };
  await a.saveWebData();
  a.Status.invalidate();
  a.AnalyticsEngine.renderIntegrity(a.Status.get());
  const html = nodes["integrity-warnings"].innerHTML;
  assert.ok(html.includes("дүүрсэн"), "урьдчилсан сануулга гараагүй");
  assert.ok(html.includes("ЭРГЭЖ ИРЭХГҮЙ"), "яагаад яаралтай болохыг хэлээгүй");
  assert.ok(!html.includes("Хадгалалт дүүрэв"), "хараахан унаагүй атлаа 'дүүрэв' гэв");
});

};
