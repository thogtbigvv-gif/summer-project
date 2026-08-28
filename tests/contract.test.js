// ГҮҮРИЙН ГЭРЭЭНИЙ ХУВИЛБАР.
//
// Bigu гэрээгээ v2 болгож шинэчилсэн — event бүрд `date` талбар нэмсэн, өөр
// юу ч аваагүй. Энэ тал v1-ийг л хүлээж авдаг хэвээр байсан тул сар турш
// хийсэн давтлага ЧИМЭЭГҮЙ голдож, дэлгэц дээр "ХОЛБОГДООГҮЙ" гэж л
// харагдаж байв — өөрөөр хэлбэл "апп суулгаагүй"-тэй ялгагдахгүй.
//
// Хоёр зүйлийг барина: дэмжигдэх хувилбарууд ажиллах, дэмжигдэхгүй нь
// ЧИМЭЭГҮЙ БИШ голдох.

"use strict";

const { makeCtx, load, ago } = require("./harness.js");
const assert = require("assert");

module.exports = async function ({ t, section }) {

const FILES = ["data.js", "bridge.js", "status.js", "quests.js", "analytics.js"];

function boot(biguPayload) {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    a.webData.integrations = {};
    if (biguPayload !== undefined) {
        ctx.localStorage.setItem("bigu:bridge", JSON.stringify(biguPayload));
    }
    a.Status.invalidate();
    return a;
}

// Bigu-гийн ЯГ бичдэг хэлбэр (js/core/bridge.js).
function biguFeed(version, count) {
    const events = [];
    for (let d = 0; d < (count || 3); d++) {
        const at = ago(d);
        events.push({ id: `p${d}`, type: "review.session", at,
                      date: "2026-08-0" + (d + 1), value: 40,
                      detail: "50 items · 40 correct" });
    }
    return { v: version, app: "Bigu", updatedAt: Date.now(),
             status: { due: 23, streak: 12 }, events };
}

section("Дэмжигдэх хувилбарууд");

await t("v1 хүлээж авна", () => {
    const a = boot();
    const res = a.validateBridgeFeed(biguFeed(1, 2));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.feed.events.length, 2);
});

await t("v2 хүлээж авна — Bigu-гийн одоогийн гэрээ", () => {
    const a = boot();
    const res = a.validateBridgeFeed(biguFeed(2, 3));
    assert.strictEqual(res.ok, true, "v2 голдогдлоо — давтлага дахин алга болно");
    assert.strictEqual(res.feed.events.length, 3);
});

await t("v2-ийн нэмэлт `date` талбар саад болохгүй", () => {
    const a = boot();
    const ev = a.validateBridgeFeed(biguFeed(2, 1)).feed.events[0];
    assert.strictEqual(ev.type, "review.session");
    assert.strictEqual(ev.value, 40);
    assert.strictEqual(ev.detail, "50 items · 40 correct");
});

await t("v2 фийд статус хүртэл ЯВЖ метрик болно", async () => {
    const a = boot(biguFeed(2, 5));
    await a.syncAll();
    a.Status.invalidate();
    const s = a.Status.get();
    assert.strictEqual(s.metrics["bigu.reviews"].last30, 200, "5 × 40 = 200 карт орсонгүй");
    assert.ok(s.attributes.MIND.score > 0, "MIND хөдлөөгүй");
});

section("Дэмжигдэхгүй нь ЧИМЭЭГҮЙ голдохгүй");

await t("танихгүй хувилбар шалтгаанаа хэлнэ", () => {
    const a = boot();
    const res = a.validateBridgeFeed(biguFeed(9, 2));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "version");
    assert.strictEqual(res.version, 9);
});

await t("голдсон фийд эх сурвалж дээр БҮРТГЭГДЭНЭ", async () => {
    const a = boot(biguFeed(9, 3));
    await a.syncAll();
    const state = a.webData.integrations.bigu;
    assert.ok(state, "эх сурвалжийн бүртгэл үүсээгүй — эвдрэл харагдахгүй");
    assert.ok(state.feedError, "голдсон шалтгаан хадгалагдаагүй");
    assert.strictEqual(state.feedError.reason, "version");
    assert.strictEqual(state.feedError.version, 9);
});

await t("Integrity самбарт УНШИГДАХГҮЙ гэж гарна — ХОЛБОГДООГҮЙ гэж БИШ", async () => {
    const a = boot(biguFeed(9, 3));
    await a.syncAll();
    a.Status.invalidate();
    const row = a.AnalyticsEngine.integrityRows(a.Status.get()).find(r => r.app === "bigu");
    assert.strictEqual(row.state, "broken",
        "апп ажиллаж байгаа мөртлөө 'холбогдоогүй' гэж харагдаж байна");
    assert.ok(a.AnalyticsEngine.feedErrorText(row.feedError).indexOf("v9") !== -1,
        "хувилбарын дугаар хэрэглэгчид хэлэгдэхгүй байна");
});

await t("гэмтсэн JSON ч бүртгэгдэнэ", async () => {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    a.webData.integrations = {};
    ctx.localStorage.setItem("bigu:bridge", "{ энэ бол JSON биш");
    await a.syncAll();
    assert.strictEqual(a.webData.integrations.bigu.feedError.reason, "json");
});

await t("гэрээнд нийцэхгүй бүтэц ч бүртгэгдэнэ", () => {
    const a = boot();
    assert.strictEqual(a.validateBridgeFeed([1, 2, 3]).reason, "shape");
    assert.strictEqual(a.validateBridgeFeed(null).reason, "shape");
});

section("Фийд БАЙХГҮЙ нь эвдрэл БИШ");

await t("түлхүүр байхгүй бол null — алдаа бүртгэхгүй", async () => {
    const a = boot();                       // bigu:bridge огт бичээгүй
    await a.syncAll();
    const state = a.webData.integrations.bigu;
    assert.ok(!state || !state.feedError, "суулгаагүй аппыг эвдэрсэн гэж бүртгэлээ");
});

await t("засагдмагц хуучин алдаа АРИЛНА", async () => {
    const ctx = makeCtx();
    const a = load(ctx, FILES);
    a.webData = JSON.parse(JSON.stringify(a.defaultWebData));
    a.webData.integrations = {};

    ctx.localStorage.setItem("bigu:bridge", JSON.stringify(biguFeed(9, 2)));
    await a.syncAll();
    assert.ok(a.webData.integrations.bigu.feedError, "эхлээд алдаа бүртгэгдэх ёстой");

    ctx.localStorage.setItem("bigu:bridge", JSON.stringify(biguFeed(2, 2)));
    await a.syncAll();
    assert.strictEqual(a.webData.integrations.bigu.feedError, null, "алдаа наалдаж үлдлээ");
    assert.strictEqual(a.webData.integrations.bigu.evidence.length, 2);
});

};
