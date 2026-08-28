// БАТЛАГДСАН / БАТЛАГДААГҮЙ ХИЛ — НЭГТГЭСЭН ТОО БҮРТ.
//
// Ялгааг зөвхөн атрибутын түвшинд барих нь ХАНГАЛТГҮЙ байсан. Атрибут
// (BODY/MIND/CREATION) цэвэр хэвээр байхад "ACTIVE DAYS", "CONSISTENCY",
// "НИЙТ НОТОЛГОО", "LONGEST STREAK" зэрэг ТОЛГОЙН тоонууд бүгд өөрөө
// мэдээлсэнийг хамт тоолж байв: өдөрт гурван нүд дарж л CONSISTENCY 100%
// болгож болно гэсэн үг. Дарж хуурах боломж өөр хаалгаар буцаж орж ирсэн.
//
// Эдгээр тест тэр хаалгыг цоожилно.

"use strict";

const { makeCtx, load, ago } = require("./harness.js");
const assert = require("assert");

module.exports = async function ({ t, section }) {

const FILES = ["data.js", "bridge.js", "status.js", "quests.js", "analytics.js"];

function api(integrations) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    a.webData.integrations = integrations || {};
    a.Status.invalidate();
    return a;
}
const wrap = evidence => ({ status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
                            prunedBefore: 0, rollups: {}, evidence });

// 30 хоног, өдөрт 3 удаа дарсан — аппын нотолгоо ТЭГ.
function selfOnly(days) {
    const out = [];
    for (let d = 0; d < (days || 30); d++)
        for (let k = 1; k <= 3; k++)
            out.push({ id: `self:m${k}:d${d}`, at: ago(d), type: "checkin.done",
                       value: 1, detail: `task${k}`, data: null });
    return { self: wrap(out) };
}
function gymDays(days) {
    const out = [];
    for (let d = 0; d < days; d++)
        out.push({ id: `g${d}`, at: ago(d), type: "workout.completed",
                   value: 1, detail: "Push", data: { volumeKg: 4000 } });
    return wrap(out);
}

section("Зөвхөн дарсан хэрэглэгч: толгойн тоо бүгд ТЭГ");

await t("нотлогдсон идэвхтэй өдөр 0 — CONSISTENCY 100% болохгүй", () => {
    const s = api(selfOnly(30)).Status.get();
    assert.strictEqual(s.overall.proven.activeDays30, 0, "дарж CONSISTENCY өсгөж болж байна");
    assert.strictEqual(s.overall.self.activeDays30, 30, "өөрөө мэдээлсэн өдөр нуугдсан");
});

await t("нотлогдсон нотолгооны тоо 0, өөрөө мэдээлсэн нь тусдаа", () => {
    const s = api(selfOnly(30)).Status.get();
    assert.strictEqual(s.overall.proven.totalEvents, 0);
    assert.strictEqual(s.overall.self.totalEvents, 90);
    assert.strictEqual(s.overall.totalEvents, 90, "нийлбэр нь хоёуланг нь агуулах ёстой");
});

await t("TRACKED METRICS-д өөрөө мэдээлсэн метрик ОРОХГҮЙ", () => {
    const a = api(selfOnly(30));
    const proven = a.AnalyticsEngine.provenMetrics(a.Status.get());
    assert.strictEqual(proven.length, 4, "self.checkins толгойн тоонд орсон хэвээр");
    assert.strictEqual(proven.filter(m => Number(m.last30) > 0).length, 0);
});

await t("LONGEST STREAK-ийг дарж босгож болохгүй", () => {
    const a = api(selfOnly(30));
    const proven = a.AnalyticsEngine.provenMetrics(a.Status.get());
    const best = proven.reduce((n, m) => Math.max(n, Number(m.streakDays) || 0), 0);
    assert.strictEqual(best, 0, "30 хоног дарж 30 хоногийн цуврал үүсгэлээ");
});

await t("'өнөөдрийн нотолгоо' мөр дарсныг тоолохгүй", () => {
    const a = api(selfOnly(1));
    a.webData.missionTasks = [];
    assert.strictEqual(a.todaysEvidenceText(), "нотолгоо ирээгүй");
});

section("Холимог: хоёр тал ТУСДАА хэвээр");

await t("бодит 10 хоног + дарсан 30 хоног = 10 нотлогдсон өдөр", () => {
    const ints = selfOnly(30);
    ints.gym = gymDays(10);
    const s = api(ints).Status.get();
    assert.strictEqual(s.overall.proven.activeDays30, 10);
    assert.strictEqual(s.overall.self.activeDays30, 30);
    assert.strictEqual(s.overall.proven.totalEvents, 10);
    assert.strictEqual(s.overall.self.totalEvents, 90);
});

await t("'өнөөдөр' мөр зөвхөн батлагдсан метрикийг тоолно", () => {
    const ints = selfOnly(1);
    ints.gym = gymDays(1);
    const a = api(ints);
    a.webData.missionTasks = [];
    assert.strictEqual(a.todaysEvidenceText(), "1 / 4 метрик нотлогдсон");
});

section("Халуун зураглал");

await t("зөвхөн дарсан өдөр ногоон БОЛОХГҮЙ — тусдаа тэмдэгтэй", () => {
    const a = api(selfOnly(30));
    const nodes = { "activity-heatmap": require("./harness.js").stubNode(),
                    "heatmap-legend":   require("./harness.js").stubNode() };
    const ctx2 = makeCtx({ nodes });
    const b = load(ctx2, FILES);
    b.webData = JSON.parse(JSON.stringify(b.defaultWebData));
    b.webData.integrations = selfOnly(30);
    b.Status.invalidate();
    b.AnalyticsEngine.renderHeatmap(b.Status.get());

    const html = nodes["activity-heatmap"].innerHTML;
    assert.ok(html.indexOf("heat-self") !== -1, "зөвхөн өөрөө тэмдэглэсэн өдөр ялгарсангүй");
    assert.ok(html.indexOf("heat-lvl-") === -1, "дарсан өдөр нотлогдсон мэт ногоон болов");
});

await t("бодит нотолгоотой өдөр ногоон хэвээр", () => {
    const nodes = { "activity-heatmap": require("./harness.js").stubNode(),
                    "heatmap-legend":   require("./harness.js").stubNode() };
    const ctx2 = makeCtx({ nodes });
    const b = load(ctx2, FILES);
    b.webData = JSON.parse(JSON.stringify(b.defaultWebData));
    b.webData.integrations = { gym: gymDays(5) };
    b.Status.invalidate();
    b.AnalyticsEngine.renderHeatmap(b.Status.get());
    assert.ok(nodes["activity-heatmap"].innerHTML.indexOf("heat-lvl-1") !== -1);
});

section("Хоосон систем ч бүтэн хэлбэртэй");

await t("нотолгоогүй үед proven/self бүтэц БАЙНА (дуудагч салаа шалгахгүй)", () => {
    const s = api({}).Status.get();
    assert.strictEqual(s.overall.proven.activeDays30, 0);
    assert.strictEqual(s.overall.proven.totalEvents, 0);
    assert.strictEqual(s.overall.self.activeDays30, 0);
    assert.strictEqual(s.overall.self.totalEvents, 0);
});

};
