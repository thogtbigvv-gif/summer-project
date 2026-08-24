// ӨДРИЙН ДААЛГАВАР ↔ НОТОЛГОО.
//
// Өмнө нь өдрийн даалгавар нь системийн цорын ганц юутай ч холбогдоогүй хэсэг
// байв: дарахад 0/3 гэсэн тоолуураас өөр юу ч хөдөлдөггүй. Одоо хоёр замтай —
// апп баталсан бол өөрөө ✓ болно, эс баталсан бол дарж "өөрөө мэдээлсэн"
// нотолгоо үүсгэнэ. Хоёрын ЯЛГАА нь арилах ёсгүй: эдгээр тест яг түүнийг барина.

"use strict";

const { makeCtx, load, ago } = require("./harness.js");
const assert = require("assert");

module.exports = async function ({ t, section }) {

const FILES = ["data.js", "bridge.js", "status.js", "quests.js", "analytics.js"];

function api(tasks, integrations) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    if (tasks) a.webData.missionTasks = tasks;
    a.webData.integrations = integrations || {};
    a.Status.invalidate();
    return a;
}

// Өнөөдөр ирсэн дасгалын нотолгоо.
function gymToday(kg) {
    return { gym: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
        prunedBefore: 0, rollups: {},
        evidence: [{ id: "g1", at: Date.now() - 3600000, type: "workout.completed",
                     value: 1, detail: "Push", data: { volumeKg: kg } }] } };
}

const TASKS = [
    { id: "m1", name: "Drink 2L Water",   metricId: null,         completed: false, completedDate: null },
    { id: "m3", name: "Workout (45 min)", metricId: "gym.volume", completed: false, completedDate: null }
];

section("Өдрийн даалгавар: аппаар нотлогдох");

await t("апп өнөөдөр мэдээлсэн бол даалгавар ӨӨРӨӨ биелнэ", () => {
    const a = api(TASKS, gymToday(4200));
    const rows = a.missionTasksWithState();
    const workout = rows.find(r => r.task.id === "m3").state;
    assert.strictEqual(workout.proven, true);
    assert.strictEqual(workout.done, true);
    assert.strictEqual(workout.provenValue, 4200);
});

await t("өчигдрийн нотолгоо ӨНӨӨДРИЙН даалгаврыг биелүүлэхгүй", () => {
    const yesterday = { gym: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
        prunedBefore: 0, rollups: {},
        evidence: [{ id: "g0", at: ago(1), type: "workout.completed",
                     value: 1, detail: "Push", data: { volumeKg: 4200 } }] } };
    const a = api(TASKS, yesterday);
    const workout = a.missionTasksWithState().find(r => r.task.id === "m3").state;
    assert.strictEqual(workout.proven, false);
    assert.strictEqual(workout.done, false);
});

await t("нотлогдсон даалгаврыг ГАРААР болиулах боломжгүй", async () => {
    const a = api(TASKS, gymToday(4200));
    await a.toggleMissionTask("m3");
    const workout = a.missionTasksWithState().find(r => r.task.id === "m3").state;
    assert.strictEqual(workout.done, true, "аппын нотолгоог дарж унтраасан");
    // Дарсан ч өөрөө мэдээлсэн нотолгоо ҮҮСЭХ ЁСГҮЙ — давхар тоологдоно.
    const self = a.webData.integrations[a.SELF_APP];
    assert.ok(!self || self.evidence.length === 0, "давхардсан гар бүртгэл үүссэн");
});

section("Өдрийн даалгавар: өөрөө мэдээлэх");

await t("метрикгүй даалгавар дарахад НОТОЛГОО үүснэ", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m1");

    const self = a.webData.integrations[a.SELF_APP];
    assert.ok(self, "гар бүртгэлийн эх сурвалж үүсээгүй");
    assert.strictEqual(self.evidence.length, 1);
    assert.strictEqual(self.evidence[0].type, "checkin.done");
    assert.strictEqual(self.evidence[0].detail, "Drink 2L Water", "мөшгөлтөд нэр нь үлдээгүй");
});

await t("тэр нотолгоо DISCIPLINE атрибутыг ХӨДӨЛГӨНӨ", async () => {
    const a = api(TASKS, {});
    assert.strictEqual(a.Status.get().attributes.DISCIPLINE.score, 0);

    await a.toggleMissionTask("m1");
    a.Status.invalidate();

    const s = a.Status.get();
    assert.strictEqual(s.metrics["self.checkins"].last30, 1);
    assert.ok(s.attributes.DISCIPLINE.score > 0, "DISCIPLINE хөдлөөгүй — дарахад юу ч болсонгүй");
});

await t("гар бүртгэл БОДИТ хэмжсэн атрибутуудыг бохирдуулахгүй", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m1");
    await a.toggleMissionTask("m3");
    a.Status.invalidate();

    const s = a.Status.get();
    assert.strictEqual(s.attributes.BODY.score, 0, "гар бүртгэл BODY руу орсон");
    assert.strictEqual(s.attributes.MIND.score, 0, "гар бүртгэл MIND руу орсон");
    assert.strictEqual(s.metrics["gym.volume"].last30, 0, "гар бүртгэл кг болж хувирсан");
});

await t("дахин дарахад буцаж авагдана", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m1");
    await a.toggleMissionTask("m1");

    const self = a.webData.integrations[a.SELF_APP];
    assert.strictEqual(self.evidence.length, 0, "буцааж авахад нотолгоо үлдсэн");
    assert.strictEqual(a.missionTasksWithState().find(r => r.task.id === "m1").state.done, false);
});

await t("нэг өдөр нэг даалгавар ЯГ НЭГ УДАА тоологдоно", () => {
    const a = api(TASKS, {});
    const today = a.todayStr();
    assert.strictEqual(a.recordSelfCheckin("m1", "Drink 2L Water", today), true);
    assert.strictEqual(a.recordSelfCheckin("m1", "Drink 2L Water", today), false, "давхардлаа");
    assert.strictEqual(a.webData.integrations[a.SELF_APP].evidence.length, 1);
});

await t("төлөв нь хадгалагдсан тэмдэглэгээ биш, НОТОЛГООНООС гарна", () => {
    // completed: true мөртлөө нотолгоогүй бол — биелээгүй.
    const stale = [{ id: "m1", name: "Water", metricId: null, completed: true, completedDate: "2020-01-01" }];
    const a = api(stale, {});
    assert.strictEqual(a.missionTasksWithState()[0].state.done, false,
                       "хадгалагдсан тэмдэглэгээ нотолгоог давсан");
});

await t("метриктэй мөртлөө өнөөдөр нотолгоогүй бол дарж болно", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m3");
    const workout = a.missionTasksWithState().find(r => r.task.id === "m3").state;
    assert.strictEqual(workout.selfReported, true);
    assert.strictEqual(workout.proven, false);
});

await t("апп дараа нь мэдээлбэл НОТЛОГДСОН нь давамгайлна", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m3");          // эхлээд өөрөө тэмдэглэв
    a.webData.integrations.gym = gymToday(4200).gym;   // дараа нь апп мэдээлэв
    a.Status.invalidate();

    const workout = a.missionTasksWithState().find(r => r.task.id === "m3").state;
    assert.strictEqual(workout.proven, true);
    assert.strictEqual(workout.selfReported, false, "хоёулаа зэрэг асаж, давхар тоологдож байна");
});

section("Гар бүртгэл нь эх сурвалж болж ил гарна");

await t("Integrity самбарт ӨӨРӨӨ гэж тэмдэглэгдэнэ, ТАСАРСАН гэж биш", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m1");
    a.Status.invalidate();

    const row = a.AnalyticsEngine.integrityRows(a.Status.get()).find(r => r.app === a.SELF_APP);
    assert.ok(row, "гар бүртгэл самбарт гараагүй");
    assert.strictEqual(row.state, "self");
    assert.strictEqual(row.total, 1);
});

await t("гар бүртгэл удаан хугацаанд хөдөлгөөнгүй байсан ч ТАСАРСАН болохгүй", () => {
    const a = api(TASKS, { self: { status: null, updatedAt: ago(30), lastSyncedAt: ago(30),
        prunedBefore: 0, rollups: {},
        evidence: [{ id: "self:m1:x", at: ago(30), type: "checkin.done", value: 1, detail: "Water", data: null }] } });
    const row = a.AnalyticsEngine.integrityRows(a.Status.get()).find(r => r.app === a.SELF_APP);
    assert.strictEqual(row.state, "self", "гар бүртгэлийг эвдэрсэн үйлдвэрлэгч гэж андуурсан");
});

await t("гар бүртгэл 'идэвхтэй эх сурвалж' тоололд ороогүй", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m1");
    a.Status.invalidate();
    const rows = a.AnalyticsEngine.integrityRows(a.Status.get());
    assert.strictEqual(rows.filter(r => r.state !== "self").length, 3, "гадаад эх сурвалжийн тоо буруу");
});

await t("syncAll нь гар бүртгэлийн нотолгоог дарж бичихгүй", async () => {
    const a = api(TASKS, {});
    await a.toggleMissionTask("m1");
    await a.syncAll();
    assert.strictEqual(a.webData.integrations[a.SELF_APP].evidence.length, 1,
                       "синк гар бүртгэлийг устгасан");
});

};
