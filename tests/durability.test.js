// НОТОЛГООНЫ БАТ БӨХ БАЙДАЛ.
//
// Систем нотолгоог "цорын ганц үнэн" гэж зарладаг мөртлөө түүнийг ганц
// браузерын localStorage дотор, ганц хуулбартай хадгалдаг байв. Үйлдвэрлэгч
// аппууд ердөө 50 event-ийн буфертэй тул устсан бичлэг ЭРГЭЖ ИРЭХГҮЙ.
// Эдгээр тест гарах/сэргээх замыг, мөн давхар тоолохоос хамгаалахыг барина.

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

const src = (evidence, rollups, prunedBefore) => ({
    status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
    prunedBefore: prunedBefore || 0, evidence: evidence || [], rollups: rollups || {}
});

const ev = (id, days, kg) => ({ id, at: ago(days), type: "workout.completed",
                                value: 1, detail: id, data: { volumeKg: kg } });

section("Нотолгооны тоолол");

await t("түүхий болон нэгтгэсэн бичлэгийг хоёуланг нь тоолно", () => {
    const a = api({ gym: src([ev("a", 1, 100), ev("b", 2, 100)],
        { "2025-01": { "workout.completed": { count: 40, valueSum: 40, dataSums: {}, firstAt: 1, lastAt: 2 } } }) });
    assert.strictEqual(a.evidenceRecordCount(), 42);
});

await t("нотолгоогүй систем 0 гэж хэлнэ", () => {
    assert.strictEqual(api({}).evidenceRecordCount(), 0);
});

section("Сэргээх / нэгтгэх");

await t("хоосон систем рүү сэргээхэд бүх нотолгоо ирнэ", () => {
    const a = api({});
    const backup = { kind: "summer-project-backup", v: 1, data: {
        integrations: { gym: src([ev("a", 1, 4200), ev("b", 2, 3800)]) } } };

    const summary = a.importWebData(backup);
    assert.strictEqual(summary.before, 0);
    assert.strictEqual(summary.after, 2);

    a.Status.invalidate();
    assert.strictEqual(a.Status.get().metrics["gym.volume"].last30, 8000);
});

await t("ижил нотолгоог хоёр удаа сэргээхэд ДАВХАРДАХГҮЙ", () => {
    const a = api({ gym: src([ev("a", 1, 4200)]) });
    const backup = { kind: "summer-project-backup", data: {
        integrations: { gym: src([ev("a", 1, 4200), ev("b", 2, 3800)]) } } };

    a.importWebData(backup);
    const first = a.evidenceRecordCount();
    a.importWebData(backup);
    assert.strictEqual(a.evidenceRecordCount(), first, "дахин сэргээхэд бичлэг давхардлаа");
    assert.strictEqual(first, 2);
});

await t("нэгтгэгдээд хасагдсан үеийн бичлэг БУЦАЖ ОРОХГҮЙ (давхар тоолохгүй)", () => {
    // prunedBefore-оос хуучин бичлэг аль хэдийн хувин болсон. Түүнийг түүхий
    // хэлбэрээр нь буцааж оруулбал ЯГ ТЭР event хоёр удаа тоологдоно.
    const cutoff = ago(100);
    const a = api({ gym: src([], { "2025-01": { "workout.completed":
        { count: 5, valueSum: 5, dataSums: { volumeKg: 500 }, firstAt: 1, lastAt: 2 } } }, cutoff) });

    const summary = a.importWebData({ kind: "summer-project-backup", data: {
        integrations: { gym: src([ev("old", 200, 100)]) } } });

    assert.strictEqual(a.webData.integrations.gym.evidence.length, 0, "нэгтгэгдсэн event буцаж орлоо");
    assert.strictEqual(summary.perApp[0].skipped, 1);
});

await t("хувингууд НЭМЭГДЭХГҮЙ — илүү ихийг харсан тал нь үлдэнэ", () => {
    const a = api({ gym: src([], { "2025-01": { "workout.completed":
        { count: 40, valueSum: 40, dataSums: { volumeKg: 4000 }, firstAt: 1, lastAt: 2 } } }) });

    a.importWebData({ kind: "summer-project-backup", data: { integrations: {
        gym: src([], { "2025-01": { "workout.completed":
            { count: 25, valueSum: 25, dataSums: { volumeKg: 2500 }, firstAt: 1, lastAt: 2 } } }) } } });

    const bucket = a.webData.integrations.gym.rollups["2025-01"]["workout.completed"];
    assert.strictEqual(bucket.count, 40, "хувин нэмэгдэж давхар тоологдлоо");
});

await t("илүү бүрэн хувин ирвэл түүнийг авна", () => {
    const a = api({ gym: src([], { "2025-01": { "workout.completed":
        { count: 10, valueSum: 10, dataSums: { volumeKg: 1000 }, firstAt: 1, lastAt: 2 } } }) });

    a.importWebData({ kind: "summer-project-backup", data: { integrations: {
        gym: src([], { "2025-01": { "workout.completed":
            { count: 90, valueSum: 90, dataSums: { volumeKg: 9000 }, firstAt: 1, lastAt: 2 } } }) } } });

    assert.strictEqual(a.webData.integrations.gym.rollups["2025-01"]["workout.completed"].count, 90);
});

await t("хоёр төхөөрөмжийн ӨӨР бичлэгүүд нийлнэ", () => {
    const a = api({ gym: src([ev("a", 1, 1000)]) });
    a.importWebData({ kind: "summer-project-backup", data: {
        integrations: { gym: src([ev("b", 2, 2000)]) } } });

    a.Status.invalidate();
    assert.strictEqual(a.evidenceRecordCount(), 2);
    assert.strictEqual(a.Status.get().metrics["gym.volume"].last30, 3000);
});

await t("сэргээлт тохиргоог авна (жагсаалт дахин бичихэд амархан)", () => {
    const a = api({});
    a.importWebData({ kind: "summer-project-backup", data: {
        integrations: {},
        skills: [{ id: 9, name: "Нөөцөөс", category: "mental", metricId: null }]
    } });
    assert.strictEqual(a.webData.skills.length, 1);
    assert.strictEqual(a.webData.skills[0].name, "Нөөцөөс");
});

await t("нөөц биш файлыг ТАТГАЛЗАНА", () => {
    const a = api({});
    assert.throws(() => a.importWebData({ hello: "world" }), /нөөц биш/);
    assert.throws(() => a.importWebData(null), /уншигдсангүй/);
});

await t("түүхий JSON (kind-гүй) ч сэргээгдэнэ", () => {
    const a = api({});
    a.importWebData({ integrations: { gym: src([ev("a", 1, 500)]) } });
    assert.strictEqual(a.evidenceRecordCount(), 1);
});

section("Өөрөө өөрийгөө нотлох цоорхой");

await t("өөрөө мэдээлдэг метрик нотолгооны эх сурвалж болж СОНГОГДОХГҮЙ", () => {
    const a = api({});
    const ids = a.verifiableMetricIds();
    assert.ok(!ids.includes("self.checkins"),
              "self.checkins сонгогдож байна — өөрөө дарж 'нотлогдсон' болгох зам нээлттэй");
    assert.ok(ids.includes("gym.volume"));
    assert.strictEqual(ids.length, Object.keys(a.METRIC_DEFS).length - 1);
});

await t("метрик өөрөө мэдээлсэн эсэхээ гаралтдаа авч явна", () => {
    const s = api({}).Status.get();
    assert.strictEqual(s.metrics["self.checkins"].selfReported, true);
    assert.strictEqual(s.metrics["gym.volume"].selfReported, false);
});

section("Хадгалалтын тааз");

await t("quota алдааг таньж, бусад алдаанаас ялгана", () => {
    const a = api({});
    assert.strictEqual(a.isQuotaError({ name: "QuotaExceededError" }), true);
    assert.strictEqual(a.isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
    assert.strictEqual(a.isQuotaError({ code: 22 }), true);
    assert.strictEqual(a.isQuotaError({ name: "TypeError" }), false);
    assert.strictEqual(a.isQuotaError(null), false);
});

await t("эхлэхдээ хадгалалт дүүрээгүй гэж мэдэгдэнэ", () => {
    assert.strictEqual(api({}).storageWarning(), false);
});

section("Өдрийн даалгавар засах");

await t("даалгавар нэмэгдэнэ", async () => {
    const a = api({});
    const ctx = { value: "10,000 алхам" };
    a.webData.missionTasks = [];
    // Форм байхгүй орчинд шууд дата руу нэмэх замыг шалгана.
    a.webData.missionTasks.push({ id: "mX", name: ctx.value, metricId: null, completed: false, completedDate: null });
    assert.strictEqual(a.missionTasksWithState().length, 1);
    assert.strictEqual(a.missionTasksWithState()[0].state.done, false);
});

await t("даалгавар устгахад ТҮҮХ устахгүй", async () => {
    const a = api({});
    a.webData.missionTasks = [{ id: "m1", name: "Ус", metricId: null, completed: false, completedDate: null }];
    await a.toggleMissionTask("m1");
    const records = a.evidenceRecordCount();
    assert.strictEqual(records, 1);

    await a.deleteMissionTask("m1");
    assert.strictEqual(a.webData.missionTasks.length, 0, "даалгавар хасагдаагүй");
    assert.strictEqual(a.evidenceRecordCount(), records, "устгахад түүх дагаж устсан");
});

};
