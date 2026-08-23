// ХУУЧИН ХАДГАЛАГДСАН ДАТА. Хэрэглэгчийн браузерт өмнөх хувилбаруудын үлдэгдэл
// сууж байгаа: XP-ийн үеийн ангилал, log нэртэй нотолгоо, метрикгүй ур чадвар.
// Тэднийг ЭВДЭХГҮЙГЭЭР шинэ хэлбэрт оруулах нь заавал биелэх амлалт —
// нэг л удаагийн алдаа хэн нэгний бүх түүхийг устгана.

"use strict";

const { makeCtx, load } = require("./harness.js");
const assert = require("assert");

module.exports = async function ({ t, section }) {

const FILES = ["data.js", "bridge.js", "status.js"];

function bootWith(stored) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    ctx.localStorage.setItem(a.STORAGE_KEY, JSON.stringify(stored));
    return a;
}

section("Хуучин датаг шилжүүлэх");

await t("XP-ийн үеийн ангилал default-оор солигдоно (хагас хуучин карт үлдэхгүй)", async () => {
    const a = bootWith({
        categories: {
            fitness: { name: "Спорт", currentTier: "C", currentXp: 400, xpToNextTier: 1000, currentValue: 12 }
        },
        skills: [], quests: [], missionTasks: [], integrations: {}
    });
    await a.loadWebData();
    const cat = a.webData.categories.fitness;
    assert.strictEqual(cat.currentTier, undefined, "XP-ийн талбар үлдсэн");
    assert.strictEqual(cat.metricId, "gym.volume");
});

await t("хэрэглэгчийн ӨӨРИЙН ангилалын нэр хадгалагдана", async () => {
    const a = bootWith({
        categories: { music: { name: "Хөгжим", currentTier: "B", currentXp: 10, unit: "hours", targetValue: 40 } },
        skills: [], quests: [], missionTasks: [], integrations: {}
    });
    await a.loadWebData();
    const cat = a.webData.categories.music;
    assert.strictEqual(cat.name, "Хөгжим", "нэр алдагдсан");
    assert.strictEqual(cat.metricId, null);
    assert.strictEqual(cat.targetValue, 40, "холбоогүй ангилалын зорилт алдагдсан");
});

await t("шинэ анхдагч ангилал (CREATION) нөхөж нэмэгдэнэ", async () => {
    const a = bootWith({
        categories: { fitness: { name: "Спорт", metricId: "gym.volume" } },
        skills: [], quests: [], missionTasks: [], integrations: {}
    });
    await a.loadWebData();
    assert.ok(a.webData.categories.creation, "creation нэмэгдээгүй — Tiers самбарт нүх үлдэнэ");
    assert.strictEqual(a.webData.categories.creation.metricId, "github.commits");
});

await t("хуучин log → evidence руу ЭВДЭЛГҮЙ нүүнэ, xp талбар алга болно", async () => {
    const a = bootWith({
        categories: {}, skills: [], quests: [], missionTasks: [],
        integrations: { gym: { status: null, updatedAt: 5,
            log: [{ id: "a", at: 1, type: "workout.completed", value: 1, detail: "d", xp: 250 }] } }
    });
    await a.loadWebData();
    const entry = a.webData.integrations.gym;
    assert.strictEqual(entry.log, undefined, "log устгагдаагүй");
    assert.strictEqual(entry.evidence.length, 1);
    assert.strictEqual(entry.evidence[0].id, "a");
    assert.strictEqual(entry.evidence[0].xp, undefined, "xp дамжиж орсон");
});

await t("аль хэдийн evidence-тэй бол хуучин log ДАРЖ БИЧИХГҮЙ", async () => {
    const a = bootWith({
        categories: {}, skills: [], quests: [], missionTasks: [],
        integrations: { gym: { status: null, updatedAt: 5,
            log:      [{ id: "хуучин", at: 1, type: "t", value: 1, detail: "" }],
            evidence: [{ id: "шинэ",   at: 2, type: "t", value: 1, detail: "", data: null }] } }
    });
    await a.loadWebData();
    const evidence = a.webData.integrations.gym.evidence;
    assert.strictEqual(evidence.length, 1);
    assert.strictEqual(evidence[0].id, "шинэ", "нүүлгэлт шинэ нотолгоог дарж бичсэн");
});

await t("нэгтгэсэн rollups хөндөгдөхгүй үлдэнэ", async () => {
    const rollups = { "2025-01": { "commit.pushed": { count: 9, valueSum: 9, dataSums: { x: 3 }, firstAt: 1, lastAt: 2 } } };
    const a = bootWith({
        categories: {}, skills: [], quests: [], missionTasks: [],
        integrations: { github: { status: null, updatedAt: 5, evidence: [], rollups } }
    });
    await a.loadWebData();
    assert.deepEqual(a.webData.integrations.github.rollups, rollups);
});

await t("метрикгүй хуучин ур чадвар metricId: null авна, Gym нөхөгдөнө", async () => {
    const a = bootWith({
        categories: {}, quests: [], missionTasks: [], integrations: {},
        skills: [{ id: 101, name: "Japanese Language", category: "language", level: 7, totalXp: 4200 }]
    });
    await a.loadWebData();
    const jp = a.webData.skills.find(s => s.id === 101);
    assert.strictEqual(jp.metricId, null);
    assert.strictEqual(jp.level, 7, "уншигдахгүй хуучин талбарыг устгах шаардлагагүй байсан");
    assert.ok(a.webData.skills.some(s => s.id === 104), "Gym Training нөхөгдөөгүй");
});

await t("өчигдөр тэмдэглэсэн өдрийн даалгавар цэвэрлэгдэнэ", async () => {
    const a = bootWith({
        categories: {}, skills: [], quests: [], integrations: {},
        missionTasks: [{ id: "m1", name: "Water", completed: true, completedDate: "2020-01-01", xpReward: 50 }]
    });
    await a.loadWebData();
    const task = a.webData.missionTasks[0];
    assert.strictEqual(task.completed, false);
    assert.strictEqual(task.xpReward, undefined, "XP шагнал үлдсэн");
});

await t("хуучин даалгавар нотолгоогүй хэвээрээ — гараар удирдагдана", async () => {
    const a = bootWith({
        categories: {}, skills: [], missionTasks: [], integrations: {},
        quests: [{ id: 1, title: "Эрт босох", category: "habits", rank: "E", completed: true }]
    });
    await a.loadWebData();
    const quest = a.webData.quests[0];
    assert.strictEqual(quest.metricId, undefined);
    assert.strictEqual(quest.completed, true, "хуучин биелэлт алдагдсан");
});

await t("гэмтсэн JSON бүх дэлгэцийг унагаахгүй", async () => {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    ctx.localStorage.setItem(a.STORAGE_KEY, "{ энэ бол JSON биш");
    await a.loadWebData();
    assert.ok(a.webData && a.webData.categories, "анхдагч төлөв рүү буугаагүй");
    a.Status.invalidate();
    assert.strictEqual(a.Status.get().overall.totalEvents, 0);
});

};
