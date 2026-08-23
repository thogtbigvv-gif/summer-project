// Даалгаврын ХОЁР төрөл: гараар тэмдэглэдэг, нотолгоогоор баталгаажих.
// Хоёрдугаарынх нь webData-д ЮУ Ч бичдэггүй — биелсэн эсэх нь гаргалт бүрт
// нотолгооноос шинээр гардаг. Тиймээс "хадгалагдсан completed"-оор шүүх
// алдаа эргэж орж ирвэл эдгээр тест барих ёстой.

"use strict";

const { makeCtx, load, ago } = require("./harness.js");
const assert = require("assert");

module.exports = function ({ t, section }) {

const FILES = ["data.js", "bridge.js", "status.js", "quests.js", "analytics.js"];

// Сүүлийн 30 хоногт нийт `kg` өгөх дасгалын нотолгоо.
function gymEvidence(kg, days) {
    const count = days || 5;
    const each  = kg / count;
    const out   = [];
    for (let i = 0; i < count; i++) {
        out.push({ id: "g" + i, at: ago(i + 1), type: "workout.completed",
                   value: 1, detail: "Session " + i, data: { volumeKg: each } });
    }
    return out;
}

function api(quests, evidence) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    a.webData.quests = quests || [];
    a.webData.integrations = {
        gym: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
               prunedBefore: 0, rollups: {}, evidence: evidence || [] }
    };
    a.Status.invalidate();
    return a;
}

section("Даалгавар: нотолгоогоор баталгаажих");

t("метрикгүй даалгавар ГАРААР удирдагдана", () => {
    const a = api([{ id: 1, title: "Эрт босох", category: "habits", rank: "E", completed: true }]);
    const p = a.questProgress(a.webData.quests[0], a.Status.get());
    assert.strictEqual(p.verified, false);
    assert.strictEqual(p.done, true, "гар аргын completed хүндлэгдээгүй");
});

t("зорилтод хүрсэн даалгавар — товч дарахгүйгээр биелнэ", () => {
    const a = api(
        [{ id: 2, title: "30k", category: "fitness", rank: "A",
           completed: false, metricId: "gym.volume", targetValue: 30000 }],
        gymEvidence(40000));
    const p = a.questProgress(a.webData.quests[0], a.Status.get());
    assert.strictEqual(p.verified, true);
    assert.strictEqual(p.done, true);
    assert.strictEqual(p.value, 40000);
    assert.strictEqual(p.pct, 100);
});

t("зорилтод хүрээгүй бол ХАДГАЛАГДСАН completed ч гэсэн биелээгүй", () => {
    // Гараар тэмдэглэсэн түүх байсан ч нотолгоо шийднэ — энэ л гол санаа.
    const a = api(
        [{ id: 3, title: "100k", category: "fitness", rank: "S",
           completed: true, completedDate: "2020-01-01",
           metricId: "gym.volume", targetValue: 100000 }],
        gymEvidence(40000));
    const p = a.questProgress(a.webData.quests[0], a.Status.get());
    assert.strictEqual(p.verified, true);
    assert.strictEqual(p.done, false, "хадгалагдсан completed нотолгоог давсан");
    assert.strictEqual(Math.round(p.pct), 40);
});

t("зорилт 0 бол нотолгоотой гэж ДҮР ЭСГЭХГҮЙ", () => {
    const a = api([{ id: 4, title: "x", category: "fitness", rank: "E",
                     completed: false, metricId: "gym.volume", targetValue: 0 }],
                  gymEvidence(40000));
    assert.strictEqual(a.questProgress(a.webData.quests[0], a.Status.get()).verified, false);
});

t("бүртгэлээс хасагдсан метрик — гар арга руу аюулгүй буцна", () => {
    const a = api([{ id: 5, title: "x", category: "fitness", rank: "E",
                     completed: false, metricId: "устсан.метрик", targetValue: 100 }],
                  gymEvidence(40000));
    const p = a.questProgress(a.webData.quests[0], a.Status.get());
    assert.strictEqual(p.verified, false);
    assert.strictEqual(p.done, false);
});

t("status огт байхгүй ч унахгүй", () => {
    const a = api([{ id: 6, title: "x", category: "fitness", rank: "E",
                     completed: false, metricId: "gym.volume", targetValue: 100 }]);
    const p = a.questProgress(a.webData.quests[0], null);
    assert.strictEqual(p.verified, false);
});

t("шүүлтүүр ГАРГАСАН төлөвөөр ажиллана, хадгалагдсанаар биш", () => {
    const a = api([
        { id: 7, title: "хүрсэн",    category: "fitness", rank: "A",
          completed: false, metricId: "gym.volume", targetValue: 30000 },
        { id: 8, title: "хүрээгүй",  category: "fitness", rank: "A",
          completed: false, metricId: "gym.volume", targetValue: 90000 },
        { id: 9, title: "гар аргын", category: "habits",  rank: "E", completed: true }
    ], gymEvidence(40000));

    const all = a.questsWithProgress();
    assert.strictEqual(all.filter(x =>  x.progress.done).length, 2, "биелсэн тоо буруу");
    assert.strictEqual(all.filter(x => !x.progress.done).length, 1, "идэвхтэй тоо буруу");
});

t("pct нь 100-аас ХЭТРЭХГҮЙ (баганы өргөн эвдрэхгүй)", () => {
    const a = api([{ id: 10, title: "x", category: "fitness", rank: "E",
                     completed: false, metricId: "gym.volume", targetValue: 1000 }],
                  gymEvidence(40000));
    assert.strictEqual(a.questProgress(a.webData.quests[0], a.Status.get()).pct, 100);
});

section("Бүрэн бүтэн байдлын самбар");

function statusApi(integrations) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    a.webData.integrations = integrations;
    a.Status.invalidate();
    return a;
}

const DAY = 86400000;

t("сая мэдээлсэн эх сурвалж — live", () => {
    const a = statusApi({ gym: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
        prunedBefore: 0, rollups: {}, evidence: gymEvidence(1000) } });
    const rows = a.AnalyticsEngine.integrityRows(a.Status.get());
    assert.strictEqual(rows.find(r => r.app === "gym").state, "live");
});

t("удаан чимээгүй байсан эх сурвалж — stale", () => {
    const a = statusApi({ gym: { status: null, updatedAt: Date.now() - 10 * DAY,
        lastSyncedAt: Date.now(), prunedBefore: 0, rollups: {}, evidence: [] } });
    assert.strictEqual(a.AnalyticsEngine.integrityRows(a.Status.get()).find(r => r.app === "gym").state, "stale");
});

t("хэзээ ч мэдээлээгүй нь ТАСАРСАН биш, ХОЛБОГДООГҮЙ", () => {
    const a = statusApi({});
    const rows = a.AnalyticsEngine.integrityRows(a.Status.get());
    assert.ok(rows.length >= 3, "тохируулгын эх сурвалжууд жагсаагүй");
    rows.forEach(r => assert.strictEqual(r.state, "silent", r.app + " буруу төлөвтэй"));
});

t("нэгтгэсэн бичлэг ч тоологдоно", () => {
    const a = statusApi({ github: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
        prunedBefore: 0, evidence: [],
        rollups: { "2025-02": { "commit.pushed": { count: 120, valueSum: 120, dataSums: {}, firstAt: 1, lastAt: 2 } } } } });
    const row = a.AnalyticsEngine.integrityRows(a.Status.get()).find(r => r.app === "github");
    assert.strictEqual(row.total, 120);
    assert.strictEqual(row.raw, 0);
    assert.strictEqual(row.rolled, 120);
});

t("нэгтгэгдээд түүхий бичлэггүй үлдсэн эх сурвалжийг \"идэвхгүй\" гэж ХЭЛЭХГҮЙ", () => {
    // Энэ нь өмнө нь "no activity yet" гэж бичдэг байсан — олон жилийн түүхтэй
    // эх сурвалжийг хоосон мэт харуулна гэсэн үг.
    const a = statusApi({});
    const html = a.connectedEvidenceHtml([], 1200);
    assert.ok(html.indexOf("no activity yet") === -1, "хуучин худал мессеж эргэж ирсэн");
    assert.ok(html.indexOf("1,200") !== -1, "нэгтгэсэн тоо харагдахгүй байна");
});

t("үнэхээр хоосон эх сурвалж хэвээрээ \"no activity yet\"", () => {
    const a = statusApi({});
    assert.ok(a.connectedEvidenceHtml([], 0).indexOf("no activity yet") !== -1);
});

section("Нотолгооны мөшгөлт");

t("provenanceHtml нь бичлэг бүрийг хэмжээтэй нь харуулна", () => {
    const a = statusApi({ gym: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
        prunedBefore: 0, rollups: {}, evidence: gymEvidence(1000, 4) } });
    const html = a.provenanceHtml(a.Status.get().metrics["gym.volume"]);
    assert.ok(html.indexOf("provenance-row") !== -1);
    assert.ok(html.indexOf("250") !== -1, "хэмжээ харагдахгүй байна");
    assert.ok(html.indexOf("kg") !== -1, "нэгж алга");
});

t("нотолгоогүй метрикт тоо ЗОХИОХГҮЙ", () => {
    const a = statusApi({});
    assert.ok(a.provenanceHtml(a.Status.get().metrics["gym.volume"]).indexOf("нотолгоо алга") !== -1);
});

t("нэгжээ сэргээж чадаагүй нэгтгэл дүгнэлтэд ГАРНА", () => {
    const a = statusApi({ gym: { status: null, updatedAt: Date.now(), lastSyncedAt: Date.now(),
        prunedBefore: 0, evidence: [],
        rollups: { "2025-01": { "workout.completed": { count: 17, valueSum: 17, firstAt: 1, lastAt: 2 } } } } });
    const texts = a.AnalyticsEngine.buildInsights(a.Status.get()).map(i => i.text);
    assert.ok(texts.some(x => x.indexOf("17") !== -1 && x.indexOf("gym.volume") !== -1),
              "цоорхойн дүгнэлт алга: " + JSON.stringify(texts));
});

};
