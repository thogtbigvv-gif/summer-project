// ХОЛБОЛТЫН ДАВХАРГА. Эх сурвалж нэмэх, оношлох, төрлийг метрикт холбох —
// эдгээр нь бүгд ЧИМЭЭГҮЙ эвдэрч чаддаг зүйлс:
//
//   · буруу түлхүүр → карт зүгээр л хоосон харагдана,
//   · холбоо салгахад нотолгоо дагаж алга болно,
//   · нэг фийдийг хоёр эх сурвалж уншиж, бүх тоо хоёр дахин нэмэгдэнэ,
//   · холбосон эх сурвалж тоо гаргахгүй атал "холбогдлоо" гэж хэлнэ.
//
// Тэдгээрийн аль нь ч консол дээр алдаа өгөхгүй. Тиймээс энд шалгана.

"use strict";

const { makeCtx, load, ago } = require("./harness.js");
const assert = require("assert");

module.exports = async function ({ t, section }) {

const FILES = ["data.js", "bridge.js", "status.js"];

// Хөтчийн орчинд ажилладаг ганц хэсэг нь фийд унших тул localStorage хангалттай.
function boot(stored) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = stored || a.cloneDefault();
    return { ctx, a };
}

function feed(events, updatedAt) {
    return JSON.stringify({
        v: 1,
        updatedAt: updatedAt || Date.now(),
        status: { note: "ok" },
        events
    });
}

section("Эх сурвалжийн бүртгэл");

await t("хэрэглэгчийн нэмсэн эх сурвалж суурийнхтай нэг жагсаалтад орно", async () => {
    const { a } = boot();
    a.webData.sources = [{ app: "run", kind: "local", key: "run:bridge", label: "Гүйлт", hex: "#ff0000" }];

    const ids = a.listBridgeSources().map(s => s.app);
    assert.ok(ids.includes("gym"), "суурь эх сурвалж алга");
    assert.ok(ids.includes("run"), "хэрэглэгчийн эх сурвалж алга");
    assert.strictEqual(a.findBridgeSource("run").label, "Гүйлт");
});

await t("гэмтэлтэй мөр бүхэл жагсаалтыг унагаахгүй", async () => {
    const { a } = boot();
    a.webData.sources = [
        null,
        { app: "", kind: "local", key: "x" },              // id алга
        { app: "a1", kind: "carrier-pigeon", key: "x" },    // танихгүй төрөл
        { app: "a2", kind: "local" },                       // түлхүүр алга
        { app: "ok1", kind: "local", key: "ok:bridge", label: "Зөв" }
    ];
    const user = a.userBridgeSources();
    assert.strictEqual(user.length, 1);
    assert.strictEqual(user[0].app, "ok1");
});

await t("суурь эх сурвалжийн id-г дарж бичих боломжгүй", async () => {
    const { a } = boot();
    // "github" гэдэг нэрээр өөр фийд зарлавал тэр аппын нотолгоо огт өөр
    // газраас ирж эхлэх байсан — түүхийг чимээгүй бохирдуулна.
    a.webData.sources = [{ app: "github", kind: "local", key: "hijack", label: "Хуурамч" }];
    const github = a.listBridgeSources().filter(s => s.app === "github");
    assert.strictEqual(github.length, 1);
    assert.strictEqual(github[0].kind, "fetch");
});

section("Оношилгоо: яагаад ирэхгүй байна");

await t("байхгүй түлхүүр — 'missing', гэхдээ чимээгүй биш", async () => {
    const { a } = boot();
    const res = a.readBridgeFeed("nobody:bridge");
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, "missing");
    assert.ok(a.bridgeCheckText(res.code).length > 0);
});

await t("JSON биш агуулга — 'bad-json'", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("broken:bridge", "{ not json");
    assert.strictEqual(a.readBridgeFeed("broken:bridge").code, "bad-json");
});

await t("танихгүй хувилбар — 'bad-version' (хэлбэрийн алдаанаас ЯЛГААТАЙ)", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("old:bridge", JSON.stringify({ v: 99, events: [] }));
    const res = a.readBridgeFeed("old:bridge");
    assert.strictEqual(res.code, "bad-version");
    assert.notStrictEqual(res.code, "bad-shape");
    // Татгалзлын мөр нь ЮУГ уншдагийг хэлэх ёстой: "v1 биш" гэж хатуу бичсэн
    // мөр нь уншигч v2-ыг ч уншдаг болсны дараа ХУДАЛ болно.
    assert.ok(/v1, v2/.test(a.bridgeCheckText(res.code, res.detail)), a.bridgeCheckText(res.code, res.detail));
});

// Bigu гэрээгээ v2 рүү ахиулахад энэ уншигч ганц тоо (`v !== 1`) барьж байсан
// тул түүнийг "фийд гэмтсэн" гээд татгалзаж, MIND тэнхлэг тэглэгдэн зогссон.
// Хувилбар бол ҮЙЛДВЭРЛЭГЧ ТУС БҮРИЙНХ: нэг мөчид v1, v2 зэрэг ирнэ.
await t("танигдсан ХУВИЛБАР БҮР уншигдана (v1 ба v2 зэрэг)", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("gym:bridge", JSON.stringify({
        v: 1, updatedAt: Date.now(), status: { note: "ok" },
        events: [{ id: "g1", at: ago(1), type: "workout.completed", value: 1, data: { volumeKg: 4200 } }]
    }));
    ctx.localStorage.setItem("bigu:bridge", JSON.stringify({
        v: 2, app: "Bigu", updatedAt: Date.now(),
        status: { dueCount: 12, learnedCount: 240, streak: 5 },
        events: [{ id: "r1", at: ago(1), date: "2026-09-01", type: "review.session", value: 30, detail: "40 items · 30 correct" }]
    }));

    assert.strictEqual(a.readBridgeFeed("gym:bridge").code, "ok");
    assert.strictEqual(a.readBridgeFeed("bigu:bridge").code, "ok");
});

await t("v2 дугтуйны event-үүд НОТОЛГОО болж, MIND тэнхлэгийг хөдөлгөнө", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("bigu:bridge", JSON.stringify({
        v: 2, app: "Bigu", updatedAt: Date.now(),
        status: { dueCount: 12 },
        events: [
            // v2 нь event бүрд `date` нэмсэн. Бид `at`-аар тоолдог тул
            // танихгүй талбар нь уншилтыг зогсоох ёсгүй.
            { id: "r1", at: ago(1), date: "2026-09-01", type: "review.session", value: 30, detail: "40 items · 30 correct" },
            { id: "r2", at: ago(2), date: "2026-08-31", type: "lesson.quiz",    value: 8,  detail: "10 items · 8 correct" }
        ]
    }));

    await a.syncSource("bigu");
    const s = a.Status.get();

    assert.strictEqual(s.metrics["bigu.reviews"].last30, 30, "review.session-ийн value тоологдоогүй");
    assert.strictEqual(s.metrics["bigu.lessons"].last30, 1,  "lesson.quiz тоологдоогүй");
    assert.ok(s.attributes.MIND.score > 0, "MIND тэглэгдсэн хэвээр — v2 фийд тоо гаргаагүй");
});

await t("зөв фийд — уншигдаж, event-үүд нь ирнэ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([
        { id: "r1", at: ago(1), type: "run.done", value: 5, data: { km: 5 } }
    ]));
    const res = a.readBridgeFeed("run:bridge");
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.feed.events.length, 1);
});

await t("синк бүр эх сурвалжийн төлөвийг бүртгэнэ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("bigu:bridge", feed([{ id: "b1", at: ago(1), type: "review.session", value: 20 }]));
    await a.syncAll();

    assert.strictEqual(a.getBridgeCheck("bigu").code, "ok");
    // gym огт бичээгүй — түүний шалтгаан ч бүртгэгдсэн байх ёстой.
    assert.strictEqual(a.getBridgeCheck("gym").code, "missing");
    // Гар бүртгэл нь алдаа БИШ, өөр төрөл.
    assert.strictEqual(a.getBridgeCheck("self").code, "self");
});

section("Эх сурвалж нэмэх / салгах");

await t("нэмсэн эх сурвалж шууд уншигдана", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([
        { id: "r1", at: ago(2), type: "run.done", value: 5 },
        { id: "r2", at: ago(1), type: "run.done", value: 7 }
    ]));

    const source = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });
    assert.ok(source.app, "id үүсээгүй");
    assert.strictEqual(a.webData.integrations[source.app].evidence.length, 2);
});

await t("нэг фийдийг хоёр удаа холбохоос сэргийлнэ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([]));
    await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });

    // Давхар уншвал ЯГ ИЖИЛ event хоёр өөр аппын нэрээр бүртгэгдэж,
    // бүх тоо хоёр дахин нэмэгдэнэ.
    await assert.rejects(
        () => a.addBridgeSource({ label: "Гүйлт 2", kind: "local", locator: "run:bridge" }),
        /аль хэдийн/
    );
});

await t("аюултай схемтэй хаягийг татгалзана", async () => {
    const { a } = boot();
    await assert.rejects(
        () => a.addBridgeSource({ label: "Муу", kind: "fetch", locator: "javascript:alert(1)" }),
        /http/
    );
});

await t("холбоо салгахад НОТОЛГОО ҮЛДЭНЭ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([{ id: "r1", at: ago(1), type: "run.done", value: 5 }]));
    const source = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });

    await a.removeBridgeSource(source.app);

    assert.strictEqual(a.userBridgeSources().length, 0, "жагсаалтаас хасагдаагүй");
    assert.strictEqual(a.webData.integrations[source.app].evidence.length, 1, "нотолгоо алга болов");
});

await t("суурь эх сурвалжийг салгах боломжгүй", async () => {
    const { a } = boot();
    await assert.rejects(() => a.removeBridgeSource("github"), /Суурь/);
});

await t("монгол нэрнээс УТГАТАЙ id гарна", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([]));
    ctx.localStorage.setItem("swim:bridge", feed([]));

    // Галиглахгүй бол кирилл нэр бүр хоосон болж, эх сурвалж бүр "source",
    // "source-2" болно. id нь "source:run.done" гэсэн хэлбэрээр дэлгэц дээр
    // ч гардаг тул тэр агшинд нэр нь утгаа алдана.
    const run  = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });
    const swim = await a.addBridgeSource({ label: "Усанд сэлэлт", kind: "local", locator: "swim:bridge" });

    assert.strictEqual(run.app, "guilt");
    assert.strictEqual(swim.app, "usand-selelt");
});

await t("салгасан аппын id дахин ашиглагдахгүй", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([{ id: "r1", at: ago(1), type: "run.done", value: 5 }]));
    const first = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });
    await a.removeBridgeSource(first.app);

    ctx.localStorage.setItem("run2:bridge", feed([]));
    const second = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run2:bridge" });

    // Ижил id-г дахин олговол хоёр өөр аппын түүх нэг дор хольцолдоно.
    assert.notStrictEqual(second.app, first.app);
});

section("Төрөл → метрик: холбогдсон эх сурвалж ТОО ГАРГАНА");

await t("холбоогүй төрөл нотолгоо болно, ГЭХДЭЭ тоо гаргахгүй", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([
        { id: "r1", at: ago(1), type: "run.done", value: 5, data: { km: 5 } }
    ]));
    const source = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });

    const status = a.Status.get();
    assert.strictEqual(status.sources[source.app].evidenceCount, 1, "нотолгоо хадгалагдаагүй");
    // Танигдаагүй төрөл ЧИМЭЭГҮЙ алга болохгүй — дүгнэлтэд гарна.
    assert.ok(status.overall.unmappedTypes.includes(`${source.app}:run.done`));
});

await t("метрикт холбосны дараа тоо гарч ирнэ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([
        { id: "r1", at: ago(2), type: "run.done", value: 5, data: { km: 5 } },
        { id: "r2", at: ago(1), type: "run.done", value: 7, data: { km: 7 } }
    ]));
    const source = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });

    const metricId = await a.createUserMetric({ label: "Гүйсэн зам", unit: "км", attr: "BODY", target30: 100 });
    await a.setTypeMapping(source.app, "run.done", { metric: metricId, rule: "data", key: "km" });

    const status = a.Status.get();
    assert.strictEqual(status.metrics[metricId].last30, 12, "data.km нийлбэр буруу");
    assert.strictEqual(status.metrics[metricId].unit, "км");
    assert.ok(!status.overall.unmappedTypes.includes(`${source.app}:run.done`), "холбогдсон хэвээр unmapped");
    // Атрибут руу нь ч дамжина: 12/100 = 12%.
    assert.strictEqual(status.metrics[metricId].pct30, 12);
});

await t("гурван дүрэм гурван өөр тоо өгнө", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([
        { id: "r1", at: ago(2), type: "run.done", value: 5, data: { km: 5 } },
        { id: "r2", at: ago(1), type: "run.done", value: 7, data: { km: 7 } }
    ]));
    const source = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });
    const metricId = await a.createUserMetric({ label: "Гүйлт", unit: "км", attr: "BODY", target30: 100 });

    const read = async (mapping) => {
        await a.setTypeMapping(source.app, "run.done", mapping);
        a.Status.invalidate();
        return a.Status.get().metrics[metricId].last30;
    };

    assert.strictEqual(await read({ metric: metricId, rule: "count" }), 2,  "count: бичлэг тоолох");
    assert.strictEqual(await read({ metric: metricId, rule: "value" }), 12, "value: value талбар");
    assert.strictEqual(await read({ metric: metricId, rule: "data", key: "km" }), 12, "data: data.km");
});

await t("кодод тайлбарлагдсан төрлийг дарж бичихийг зөвшөөрөхгүй", async () => {
    const { a } = boot();
    // Хадгалагдсан ч status.js суурийг үргэлж түрүүлж авдаг тул тэр тайлбар
    // ХЭРЭГЛЭГДЭХГҮЙ. "Холбогдлоо" гэж хэлээд юу ч болдоггүй байх нь худал.
    await assert.rejects(
        () => a.setTypeMapping("gym", "workout.completed", { metric: "gym.volume", rule: "count" }),
        /кодод/
    );
});

await t("хэрэглэгчийн метрик DISCIPLINE тэнхлэгт орохгүй", async () => {
    const { a } = boot();
    // DISCIPLINE бол "өөрөө мэдээлсэн" тэнхлэг. Батлагдсан тоог тийш нь
    // хийвэл батлагдсан ба батлагдаагүй хоёр нэг баганад холилдоно.
    await assert.rejects(
        () => a.createUserMetric({ label: "Х", unit: "у", attr: "DISCIPLINE", target30: 10 }),
        /BODY/
    );
});

await t("зорилтгүй метрик үүсэхгүй", async () => {
    const { a } = boot();
    // Зорилтгүй метрикийн pct30 үргэлж 0 — карт нь мөнхийн E тиертэй суух байв.
    await assert.rejects(
        () => a.createUserMetric({ label: "Х", unit: "у", attr: "BODY", target30: 0 }),
        /зорилт/
    );
});

await t("хэрэглэгчийн метрик суурь бүртгэлийг дарж бичихгүй", async () => {
    const { a } = boot();
    a.webData.metrics = [{ id: "gym.volume", label: "Хуурамч", unit: "x", attr: "MIND", target30: 1 }];
    const defs = a.metricDefs();
    assert.strictEqual(defs["gym.volume"].label, "Volume lifted");
    assert.strictEqual(defs["gym.volume"].target30, 40000);
});

section("Тохиргоо алдагдахгүй байх");

await t("нөөцөөс сэргээхэд холболтууд ч сэргэнэ", async () => {
    const { a } = boot();
    // sources бол ТОХИРГОО: жагсаалт, ангилалтай ижил дүрмээр файлынхаар
    // солигдоно. Эс тэгвээс нөөцөө сэргээсэн хүн холболтоо гараар дахин бичнэ.
    a.importWebData({
        kind: "summer-project-backup",
        data: {
            integrations: {},
            sources: [{ app: "run", kind: "local", key: "run:bridge", label: "Гүйлт" }]
        }
    });
    assert.strictEqual(a.userBridgeSources().length, 1);
    assert.strictEqual(a.findBridgeSource("run").label, "Гүйлт");
});

section("Тоо ба холболтын холбоо");

await t("метрикийг ямар эх сурвалж тэжээж байгааг нэрлэж чадна", async () => {
    const { a } = boot();
    assert.deepStrictEqual(a.metricSourceApps("gym.volume"), ["gym"]);
    assert.deepStrictEqual(a.metricSourceApps("bigu.reviews"), ["bigu"]);
    assert.deepStrictEqual(a.metricSourceApps("тийм.метрик.байхгүй"), []);
});

await t("хэрэглэгчийн холболт ч эх сурвалжаа нэрлэнэ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("run:bridge", feed([{ id: "r1", at: ago(1), type: "run.done", value: 5 }]));
    const source = await a.addBridgeSource({ label: "Гүйлт", kind: "local", locator: "run:bridge" });
    const metricId = await a.createUserMetric({ label: "Гүйлт", unit: "км", attr: "BODY", target30: 50 });
    await a.setTypeMapping(source.app, "run.done", { metric: metricId, rule: "value" });

    assert.deepStrictEqual(a.metricSourceApps(metricId), [source.app]);
});

await t("аппын төрлүүдийг нотолгооноос нь тоолж чадна", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("gym:bridge", feed([
        { id: "g1", at: ago(2), type: "workout.completed", value: 1, data: { volumeKg: 4200 } },
        { id: "g2", at: ago(1), type: "workout.completed", value: 1, data: { volumeKg: 3800 } },
        { id: "g3", at: ago(1), type: "workout.partial",   value: 1, data: { volumeKg: 900 } }
    ]));
    await a.syncAll();

    const rows = a.typeSummaryForApp("gym");
    const completed = rows.find(r => r.type === "workout.completed");
    assert.strictEqual(completed.count, 2);
    assert.ok(completed.dataKeys.includes("volumeKg"), "data талбар олдсонгүй");
    assert.strictEqual(completed.mapped, true, "кодод тайлбарлагдсан төрөл mapped биш гэж гарав");
});

// ===================== 0 ГЭДЭГ ХОЁР ӨӨР ЮМ =====================
// Метрик 0 дээр зогсох нь "хийгээгүй" эсвэл "уншиж чадахгүй" гэсэн ХОЁР
// тэс өөр утгатай. Хоёрыг ялгаж чадахгүй бол дэлгэц дээрх тоо нь нэгийг нь
// нөгөөгөөр нь халхална — Bigu-гийн гэрээ зөрөхөд яг тэр болсон.

section("0 гэдэг хоёр өөр юм: өлссөн эх сурвалж");

await t("шалтгааны хүндрэл нэг л газраас шийдэгдэнэ", async () => {
    const { a } = boot();
    assert.strictEqual(a.bridgeCheckSeverity("ok"), "ok");
    assert.strictEqual(a.bridgeCheckSeverity("self"), "self");
    // Засах юмгүй хүлээлт — улаан БОЛОХ ЁСГҮЙ.
    assert.strictEqual(a.bridgeCheckSeverity("missing"), "wait");
    assert.strictEqual(a.bridgeCheckSeverity("no-storage"), "wait");
    // Уншилт зогссон бүхэн — хэн нэгэн засах ёстой.
    ["bad-json", "bad-shape", "bad-version", "http", "network", "no-fetch", "unknown"]
        .forEach(code => assert.strictEqual(a.bridgeCheckSeverity(code), "bad", code));
});

await t("эвдэрсэн эх сурвалж түүний тэжээдэг метрикээр дамжиж олдоно", async () => {
    const { ctx, a } = boot();
    // Bigu-гийн гэрээ зөрсөн; Gym хэвийн.
    ctx.localStorage.setItem("bigu:bridge", JSON.stringify({ v: 99, events: [] }));
    ctx.localStorage.setItem("gym:bridge", feed([
        { id: "g1", at: ago(1), type: "workout.completed", value: 1, data: { volumeKg: 4200 } }
    ]));
    await a.syncAll();

    const mind = a.starvedSources(["bigu.reviews", "bigu.lessons"]);
    assert.strictEqual(mind.bad.length, 1, "MIND-ийн тасарсан эх сурвалж олдсонгүй");
    assert.strictEqual(mind.bad[0].app, "bigu");
    assert.strictEqual(mind.bad[0].code, "bad-version");
    assert.strictEqual(mind.bad[0].label, "Bigu", "хэрэглэгчид харагдах нэр биш id буцаав");

    // Хэвийн эх сурвалж сануулга ҮҮСГЭХГҮЙ — эс тэгвээс анхааруулга утгаа алдана.
    const body = a.starvedSources(["gym.volume"]);
    assert.strictEqual(body.bad.length, 0, "ажиллаж буй эх сурвалжийг эвдэрсэн гэв");
    assert.strictEqual(body.waiting.length, 0);
});

await t("'хараахан бичээгүй' нь эвдрэлээс ТУСДАА ангилагдана", async () => {
    const { ctx, a } = boot();
    // Түлхүүр огт байхгүй: тэр апп энэ хөтөч дээр хараахан ажиллаагүй.
    ctx.localStorage.removeItem("bigu:bridge");
    await a.syncAll();

    const mind = a.starvedSources(["bigu.reviews"]);
    assert.strictEqual(mind.bad.length, 0, "хүлээлтийг эвдрэл гэж бүртгэв");
    assert.strictEqual(mind.waiting.length, 1);
    assert.strictEqual(mind.waiting[0].code, "missing");
});

await t("уншаагүй эх сурвалжийг 'эвдэрсэн' гэж ХЭЛЭХГҮЙ", async () => {
    const { a } = boot();
    // syncAll огт дуудагдаагүй — bridgeChecks хоосон. "Мэдэхгүй" гэдгийг
    // "эвдэрсэн" гэж мэдээлбэл апп нээх бүрд худал улаан анхааруулга гарна.
    const mind = a.starvedSources(["bigu.reviews"]);
    assert.strictEqual(mind.bad.length, 0);
    assert.strictEqual(mind.waiting.length, 0);
});

await t("нэг эх сурвалж хэдэн метрик тэжээж байсан ч НЭГ УДАА л мэдээлнэ", async () => {
    const { ctx, a } = boot();
    ctx.localStorage.setItem("bigu:bridge", JSON.stringify({ v: 99, events: [] }));
    await a.syncAll();

    // bigu.reviews ба bigu.lessons хоёулаа "bigu"-гаас ирнэ. Давхардвал
    // хэрэглэгч "Bigu, Bigu уншигдахгүй" гэсэн мөр уншина.
    const mind = a.starvedSources(["bigu.reviews", "bigu.lessons"]);
    assert.strictEqual(mind.bad.length, 1);
});

await t("метрикгүй атрибут сануулга үүсгэхгүй", async () => {
    const { a } = boot();
    [[], null, undefined, "bigu.reviews"].forEach(input => {
        const res = a.starvedSources(input);
        assert.strictEqual(res.bad.length, 0, String(input));
        assert.strictEqual(res.waiting.length, 0, String(input));
    });
});

};
