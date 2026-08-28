"use strict";

// ===================== GENERIC APP BRIDGE (READ-ONLY) =====================
// Холбогдсон аппууд (Bigu, Дасгал, ирээдүйд бусад нь) ижил GitHub Pages origin
// дээр байрладаг тул localStorage-оо энэ апптай хуваалцдаг. Тэд тус бүр өөрийн
// түлхүүрт НЭГ ЧИГЛЭЛТ фийд бичдэг. Энд бид түүнийг ЗӨВХӨН УНШИЖ НОТОЛГОО болгон
// хадгална — ямар ч тооцоо хийхгүй. Аль ч гүүрийн түлхүүр рүү ХЭЗЭЭ Ч бичихгүй.
//
// Нийтлэг гэрээ (JSON) — апп бүр адилхан:
//   { v: 1, updatedAt: <ms>,
//     status: { ... апп юу ч хүсвэл — бид бүтнээр нь хадгална, тайлбарлахгүй },
//     events: [ { id, at, type, value, detail, data? } ... ] }
//
// data нь заавал биш дамжуулах объект (ж: { volumeKg }, { correct, total }) —
// үйлдвэрлэгч бодит нэгжээ энд нийтэлнэ. Бид түүнийг тайлбарлахгүй, хадгална.
//
// Түлхүүр байхгүй, гэмтсэн, эсвэл v !== 1 бол тэр эх сурвалжийг чимээгүй алгасна —
// апп өнөөдрийнхтэй яг адилхан ажиллана.
//
// ХОЁР ТӨРЛИЙН ЭХ СУРВАЛЖ (kind):
//   "local" — ижил origin дээрх апп localStorage-д бичдэг (анхдагч).
//   "fetch" — фийд нь repo дотор commit хийгдсэн JSON файл. GitHub localStorage
//             руу бичиж чадахгүй тул түүний нотолгоо Action-аар дамжиж
//             data/github.json болж ирдэг. Гэрээ нь ЯГ АДИЛХАН — зөвхөн
//             хүргэх зам нь өөр.
//
// ШИНЭ АПП НЭМЭХ: BRIDGE_SOURCES-д НЭГ мөр нэмнэ. Өөр код бичихгүй.

// hex нь зөвхөн картын өнгө. Гүүр ур чадвар, ангилалын талаар ЮУ Ч МЭДЭХГҮЙ —
// нотолгоо ямар метрик болохыг status.js-ийн METRICS бүртгэл шийднэ.
//   "self"  — ГАДНЫ АПП БИШ. Хэрэглэгч өөрөө өдрийн даалгавраа тэмдэглэхэд
//             энэ апп өөрөө нотолгоо бичдэг. Уншиж авах фийд байхгүй тул
//             syncAll() түүнийг алгасна. Тусад нь эх сурвалж болгосон нь
//             ЗОРИУД: "энэ тоог хэн хэлсэн бэ" гэдэг дэлгэц дээр ил байх ёстой.
const BRIDGE_SOURCES = [
    { app: "bigu",   kind: "local", key: "bigu:bridge", label: "Bigu",   hex: "#0ea5e9" },
    { app: "gym",    kind: "local", key: "gym:bridge",  label: "Gym",    hex: "#ef4444" },
    { app: "github", kind: "fetch", url: "data/github.json", label: "GitHub", hex: "#8b5cf6" },
    { app: "self",   kind: "self",  label: "Гар бүртгэл", hex: "#eab308" }
];

// Өөрөө мэдээлсэн эх сурвалжийн нэр — олон газар ашиглагдана.
const SELF_APP = "self";

// Commit хийгдсэн файл нь үйлдвэрлэгчийн 50 event-ийн буфертэй холбоогүй бөгөөд
// эхний ажиллагаа нь бүх түүхийг нөхөж авчирна — тиймээс хязгаар нь өндөр.
const BRIDGE_MAX_EVENTS = 2000;  // нэг эх сурвалжаас нэг удаад боловсруулах дээд хязгаар

// НОТОЛГООНЫ ХАДГАЛАЛТ. Гүүрийн бичлэг бол холбогдсон аппууд юу мэдээлснийг харуулах
// ЦОРЫН ГАНЦ бүртгэл — дээд давхаргын бүх тоо түүнээс ГАРГАЖ АВАГДАНА. Тиймээс бичлэгийг
// хэзээ ч зүгээр хаяхгүй: хугацаа хэтэрсэн түүхий бичлэгийг сар/төрлөөр НЭГТГЭЭД
// (state.rollups) үлдээнэ. rollups-ыг ХЭЗЭЭ Ч устгахгүй — тэр бол урт хугацааны түүх.
// Нэгтгэсэн хувин нь { count, valueSum, dataSums, firstAt, lastAt } — dataSums
// нь event.data-гийн тоон талбар бүрийн нийлбэр. Түүхий бичлэг алга болсон ч
// БОДИТ НЭГЖ (жишээ нь өргөсөн кг) хувинд үлдэж, статус түүнийг сэргээж чадна.
const RAW_RETENTION_DAYS = 180;   // үүнээс хуучин түүхий бичлэгийг нэгтгэнэ
const MAX_RAW_EVIDENCE   = 5000;  // үүнээс олон түүхий бичлэг үлдвэл хуучнаас нь нэгтгэнэ

// ===================== ФИЙД УНШИХ =====================

function bridgeText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function bridgeNum(value) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
}

// Event-ийг цэвэрлэж найдвартай хэлбэрт хөрвүүлнэ. id байхгүй бол null
// (id нь давхардлын хамгаалалтын үндэс — түүнгүйгээр нэг event олон удаа бичигдэнэ).
function normalizeBridgeEvent(raw) {
    if (!raw || typeof raw !== "object") return null;

    const id = bridgeText(raw.id);
    if (!id) return null;

    return {
        id,
        at:     bridgeNum(raw.at),
        type:   bridgeText(raw.type),
        value:  bridgeNum(raw.value),   // үргэлж тоо байх ёстой
        detail: bridgeText(raw.detail),
        data:   bridgeData(raw.data, id)
    };
}

// Үйлдвэрлэгчийн дамжуулах объект. Энэ давхарга дотор нь юу байгааг МЭДЭХГҮЙ —
// зөвхөн хэлбэр, хэмжээг нь шалгаад тэр чигээр нь дамжуулна.
const BRIDGE_DATA_MAX_BYTES = 2000;

function bridgeData(value, id) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch (err) {
        console.warn(`normalizeBridgeEvent: "${id}" event-ийн data-г цуваалж чадсангүй —`, err);
        return null;
    }

    if (typeof serialized !== "string") return null;
    if (serialized.length > BRIDGE_DATA_MAX_BYTES) {
        console.warn(`normalizeBridgeEvent: "${id}" event-ийн data хэт том (${serialized.length} тэмдэгт) — хаяв.`);
        return null;
    }
    return value;
}

// ДЭМЖИГДЭХ ГЭРЭЭНИЙ ХУВИЛБАРУУД.
//
// v2 нь v1 дээр event бүрд `date` (орон нутгийн хуанлийн өдөр) талбар НЭМСЭН
// бөгөөд өөр юу ч аваагүй: id, at, type, value, detail бүгд хэвээр. Уншигчийн
// хувьд бүрэн нийцтэй тул шинэ талбарыг зүгээр л үл хэрэгсээд хүлээж авна.
//
// Энэ жагсаалт байхгүй үед юу болсныг санах нь зүйтэй: Bigu гэрээгээ v2 болгож
// шинэчилсэн, энэ тал v1-ийг л хүлээж авдаг хэвээр байсан — сар турш хийсэн
// давтлага чимээгүй голдож, дэлгэц дээр "ХОЛБОГДООГҮЙ" гэж л харагдаж байв.
const BRIDGE_VERSIONS = [1, 2];

// Задалсан JSON-ыг гэрээнд тулгана. localStorage-ийн ч, татаж авсан ч фийд
// ЯГ ЭНЭ шалгуураар дамжина — хүргэх зам нь өөр ч гэрээ нь нэг.
//
// Буцаах утга нь голдсон бол ШАЛТГААНАА авч явна. Өмнө нь энэ функц зүгээр л
// null буцаадаг байсан тул дуудагч "фийд байхгүй" (апп суугаагүй — алдаа биш)
// ба "фийд байгаа мөртлөө уншигдахгүй" (ЖИНХЭНЭ эвдрэл) хоёрыг ялгаж чаддаггүй,
// хоёуланг нь чимээгүй алгасдаг байв.
function validateBridgeFeed(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, reason: "shape" };
    }
    if (BRIDGE_VERSIONS.indexOf(parsed.v) === -1) {
        return { ok: false, reason: "version", version: parsed.v };
    }

    // Хуучнаас нь шинэ рүү эрэмбэлнэ — ингэснээр BRIDGE_MAX_EVENTS-ийн таслалт
    // ХАМГИЙН СҮҮЛИЙН event-үүдийг үлдээнэ.
    let events = Array.isArray(parsed.events)
        ? parsed.events.map(normalizeBridgeEvent).filter(Boolean).sort((a, b) => a.at - b.at)
        : [];
    if (events.length > BRIDGE_MAX_EVENTS) events = events.slice(-BRIDGE_MAX_EVENTS);

    // status-ыг БҮТНЭЭР нь дамжуулна. Дотор нь юу байгааг энэ давхарга мэдэхгүй.
    const status = (parsed.status && typeof parsed.status === "object" && !Array.isArray(parsed.status))
        ? parsed.status
        : null;

    return { ok: true, feed: { status, updatedAt: bridgeNum(parsed.updatedAt), events } };
}

// kind: "local" — Хамгаалалттай унших + parse.
// null = түлхүүр БАЙХГҮЙ (апп суугаагүй). Тэр нь эвдрэл биш, чимээгүй өнгөрнө.
function readBridgeFeed(key) {
    let raw = null;
    try {
        if (typeof localStorage === "undefined") return null;
        raw = localStorage.getItem(key);
    } catch (err) {
        console.warn(`readBridgeFeed: "${key}" уншиж чадсангүй —`, err);
        return null;
    }
    if (!raw || typeof raw !== "string") return null;

    // Түлхүүр БАЙНА. Эндээс цааш юу ч болсон бол тэр нь ил тайлагнагдах ёстой.
    try {
        return validateBridgeFeed(JSON.parse(raw));
    } catch (err) {
        console.warn(`readBridgeFeed: "${key}" JSON биш —`, err);
        return { ok: false, reason: "json" };
    }
}

// kind: "fetch" — repo дотор commit хийгдсэн фийдийг татна. Файл байхгүй,
// сүлжээ унтарсан, JSON гэмтсэн — бүгд null. Байхгүй localStorage түлхүүртэй
// яг адил: тэр эх сурвалжийг чимээгүй алгасна, синк үргэлжилнэ.
async function fetchBridgeFeed(url) {
    try {
        if (typeof fetch !== "function") return null;

        // Кэш тойрно: Pages-ийн CDN хуучин хуулбарыг өгвөл шинэ commit
        // хэдэн цагаар харагдахгүй байж мэднэ.
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!res || !res.ok) {
            // Файл байхгүй / сүлжээ унтарсан — түлхүүр байхгүйтэй адил.
            console.warn(`fetchBridgeFeed: "${url}" — HTTP ${res ? res.status : "?"}`);
            return null;
        }

        let parsed;
        try {
            parsed = await res.json();
        } catch (err) {
            console.warn(`fetchBridgeFeed: "${url}" JSON биш —`, err);
            return { ok: false, reason: "json" };
        }
        return validateBridgeFeed(parsed);
    } catch (err) {
        console.warn(`fetchBridgeFeed: "${url}" татаж чадсангүй —`, err);
        return null;
    }
}

// ===================== ТӨЛӨВ =====================

// webData.integrations[app]-г шаардлагатай бол үүсгээд буцаана.
function getIntegrationState(app) {
    if (!webData.integrations || typeof webData.integrations !== "object") webData.integrations = {};

    let state = webData.integrations[app];
    if (!state || typeof state !== "object" || Array.isArray(state)) {
        state = webData.integrations[app] = {
            status: null, updatedAt: 0, evidence: [], rollups: {}, prunedBefore: 0, lastSyncedAt: null
        };
    }
    if (!Array.isArray(state.evidence)) state.evidence = [];
    if (!state.rollups || typeof state.rollups !== "object" || Array.isArray(state.rollups)) state.rollups = {};
    if (typeof state.prunedBefore !== "number") state.prunedBefore = 0;
    return state;
}

// ===================== ХАДГАЛАЛТ (PRUNE / ROLLUP) =====================

// `days` хоногийн өмнөх ОРОН НУТГИЙН өдрийн эхлэл (ms). Хазайлтын арга нь
// todayStr()-тэй адил: UTC талбаруудыг орон нутгийн цагтай тэнцүүлээд таслана.
function startOfDayDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const offset = d.getTimezoneOffset();
    d.setMinutes(d.getMinutes() - offset);
    d.setUTCHours(0, 0, 0, 0);
    d.setMinutes(d.getMinutes() + offset);
    return d.getTime();
}

// Бичлэгийн "YYYY-MM" (орон нутгийн) хувилбар.
function evidenceMonthKey(at) {
    const d = new Date(Number(at) || 0);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 7);
}

// Бичлэгүүдийг state.rollups["YYYY-MM"][type] хувин руу НЭМНЭ (дарж бичихгүй).
function rollUpEvidence(state, records) {
    if (!state.rollups || typeof state.rollups !== "object" || Array.isArray(state.rollups)) state.rollups = {};

    records.forEach(rec => {
        if (!rec) return;

        const month  = evidenceMonthKey(rec.at);
        const byType = state.rollups[month] && typeof state.rollups[month] === "object"
            ? state.rollups[month]
            : (state.rollups[month] = {});

        const type   = typeof rec.type === "string" ? rec.type : "";
        const value  = Number(rec.value);
        const amount = isFinite(value) ? value : 0;
        const at     = Number(rec.at) || 0;

        let bucket = byType[type];
        if (!bucket || typeof bucket !== "object") {
            bucket = byType[type] = { count: 0, valueSum: 0, dataSums: {}, firstAt: at, lastAt: at };
        }
        if (!bucket.dataSums || typeof bucket.dataSums !== "object" || Array.isArray(bucket.dataSums)) {
            bucket.dataSums = {};
        }

        bucket.count    = (Number(bucket.count)    || 0) + 1;
        bucket.valueSum = (Number(bucket.valueSum) || 0) + amount;
        sumDataFields(bucket.dataSums, rec.data);
        if (!(Number(bucket.firstAt) > 0) || at < bucket.firstAt) bucket.firstAt = at;
        if (!(Number(bucket.lastAt)  > 0) || at > bucket.lastAt)  bucket.lastAt  = at;
    });
}

// event.data-гийн ТООН талбар бүрийг нэрээр нь хурааж нэмнэ. Энэ давхарга
// талбарууд ЮУ ГЭСЭН УТГАТАЙГ мэдэхгүй хэвээр — зөвхөн "тоо мөн үү" гэдгийг
// шалгана. Ингэснээр нэгтгэлт бодит нэгжийг (volumeKg, correct, ...) авч
// үлддэг болж, 180 хоногийн дараа түүх нэгжгүй хоосон тоо болж хувирахаа болино.
function sumDataFields(sums, data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    Object.keys(data).forEach(key => {
        const value = Number(data[key]);
        // Тоо биш талбар (ж: { repo: "summer-project" }) — нийлбэрт утгагүй, алгасна.
        if (typeof data[key] !== "number" || !isFinite(value)) return;
        sums[key] = (Number(sums[key]) || 0) + value;
    });
}

// Түүхий нотолгоог хязгаарт нь оруулна — хаяхгүй, НЭГТГЭНЭ.
//   1) RAW_RETENTION_DAYS-аас хуучин бичлэг бүрийг rollups руу.
//   2) Дараа нь MAX_RAW_EVIDENCE-ээс хэтэрсэн бол хамгийн хуучнаас нь нэгтгэсээр доош оруулна.
// prunedBefore нь ЗӨВХӨН ӨСНӨ — эс тэгвээс нэгтгэгдсэн event дахин "шинэ" болж орж ирнэ.
function pruneEvidence(state) {
    if (!state) return;
    if (!Array.isArray(state.evidence)) state.evidence = [];
    if (!state.rollups || typeof state.rollups !== "object" || Array.isArray(state.rollups)) state.rollups = {};
    if (typeof state.prunedBefore !== "number") state.prunedBefore = 0;

    // 1) Хугацаагаар
    const cutoff = startOfDayDaysAgo(RAW_RETENTION_DAYS);
    const expired = [];
    const kept    = [];
    state.evidence.forEach(rec => {
        // at <= 0 (цаггүй) бичлэгийг нэгтгэхгүй: ямар сард хамаарахыг мэдэхгүй бөгөөд
        // prunedBefore нь түүнийг дахин орж ирэхээс хамгаалж чадахгүй.
        if (rec && Number(rec.at) > 0 && Number(rec.at) < cutoff) expired.push(rec);
        else kept.push(rec);
    });
    if (expired.length > 0) rollUpEvidence(state, expired);
    state.evidence = kept;
    if (cutoff > state.prunedBefore) state.prunedBefore = cutoff;

    // 2) Тооны хязгаараар — хамгийн хуучнаас нь
    if (state.evidence.length > MAX_RAW_EVIDENCE) {
        const overflow = state.evidence.length - MAX_RAW_EVIDENCE;
        const oldest   = state.evidence.slice().sort((a, b) => (Number(a && a.at) || 0) - (Number(b && b.at) || 0));

        const rolled = [];
        let newestAt = 0;
        for (const rec of oldest) {
            if (rolled.length >= overflow) break;
            if (!rec || !(Number(rec.at) > 0)) continue;
            rolled.push(rec);
            if (Number(rec.at) > newestAt) newestAt = Number(rec.at);
        }

        if (rolled.length > 0) {
            rollUpEvidence(state, rolled);
            const rolledSet = new Set(rolled);
            state.evidence  = state.evidence.filter(rec => !rolledSet.has(rec));
            if (newestAt + 1 > state.prunedBefore) state.prunedBefore = newestAt + 1;
        }
    }
}

// ===================== ӨӨРӨӨ МЭДЭЭЛСЭН НОТОЛГОО =====================
// Систем дэх ЦОРЫН ГАНЦ газар бөгөөд нотолгоог гадны апп биш, хэрэглэгч өөрөө
// үүсгэдэг. Тиймээс энд хоёр зүйл чухал:
//
//   1) Бичлэг нь тусдаа "self" эх сурвалжид, тусдаа метрикт (self.checkins),
//      тусдаа атрибутад (DISCIPLINE) орно. Аппын хэмжсэн BODY/MIND/CREATION-д
//      ХЭЗЭЭ Ч холилдохгүй — батлагдсан, батлагдаагүй хоёр ялгаатай хэвээр.
//
//   2) id нь тодорхойлогдсон: "self:<taskId>:<өдөр>". Тиймээс нэг өдөр нэг
//      даалгавар яг НЭГ УДАА тоологдоно, дахин дарахад давхардахгүй, буцааж
//      авахад яг тэр бичлэгийг олж устгана.

function selfCheckinId(taskId, dayKey) {
    return `${SELF_APP}:${taskId}:${dayKey}`;
}

// Тухайн өдөр аль даалгаврууд өөрөө тэмдэглэгдсэн бэ — рендерийн үед НЭГ УДАА
// барьж, даалгавар бүрээр нотолгоо гүйлгэхээс сэргийлнэ.
function selfCheckinIds() {
    const state    = (webData && webData.integrations) ? webData.integrations[SELF_APP] : null;
    const evidence = (state && Array.isArray(state.evidence)) ? state.evidence : [];
    const ids = new Set();
    evidence.forEach(rec => { if (rec && rec.id) ids.add(rec.id); });
    return ids;
}

// Өөрөө мэдээлсэн бичлэг НЭМНЭ. Аль хэдийн байвал юу ч хийхгүй (давхардахгүй).
// Буцаах утга: үнэхээр бичсэн эсэх.
function recordSelfCheckin(taskId, taskName, dayKey) {
    const id    = selfCheckinId(taskId, dayKey);
    const state = getIntegrationState(SELF_APP);
    if (state.evidence.some(rec => rec && rec.id === id)) return false;

    const at = Date.now();
    state.evidence.push({
        id,
        at,
        type:   "checkin.done",
        value:  1,
        // detail нь мөшгөлтийн жагсаалтад шууд харагдана — тиймээс даалгаврын
        // нэрийг тэр чигээр нь хадгална.
        detail: typeof taskName === "string" ? taskName : String(taskId),
        data:   null
    });

    state.status       = { source: "гар бүртгэл" };
    state.updatedAt    = at;
    state.lastSyncedAt = at;
    pruneEvidence(state);
    return true;
}

// Буцааж авна. Хэрэглэгч андуурч дарсан бол тоо нь үлдэх ёсгүй — өөрөө
// мэдээлсэн нотолгоо бол өөрөө буцаах эрхтэй. (Аппын нотолгоог УСТГАХ арга
// байхгүй, тэр нь зөв: түүнийг бид хэлээгүй.)
function removeSelfCheckin(taskId, dayKey) {
    const state = (webData && webData.integrations) ? webData.integrations[SELF_APP] : null;
    if (!state || !Array.isArray(state.evidence)) return false;

    const id     = selfCheckinId(taskId, dayKey);
    const before = state.evidence.length;
    state.evidence = state.evidence.filter(rec => !(rec && rec.id === id));
    if (state.evidence.length === before) return false;

    state.updatedAt = Date.now();
    return true;
}

// ===================== SYNC =====================

// Хоёр синк зэрэг явбал нэг event хоёр удаа бичигдэж мэднэ (seen олонлог нь
// эхнийх нь хадгалахаас өмнөх зураг дээр тогтсон байна). Нэгийг нь орхино.
let _syncing = false;

// Бүх эх сурвалжийг уншиж, шинэ event бүрийг НОТОЛГОО болгон бичнэ.
// Юу ч байхгүй бол чимээгүй. Буцаах утга: { awarded, events }
async function syncAll() {
    const result = { awarded: 0, events: 0 };
    if (_syncing) return result;
    _syncing = true;

    try {
        // Энэ функц webData.integrations-аас өөр юу ч хөнддөггүй. Ур чадварыг
        // шалгах нь XP-ийн үеийн үлдэгдэл байсан: гэмтэлтэй skills массив бүх
        // нотолгооны цуглуулгыг чимээгүй зогсоох аюултай.
        if (!webData || typeof webData !== "object") return result;

        let touched = false;
        const parts = [];

        for (const source of BRIDGE_SOURCES) {
            // Өөрөө мэдээлсэн эх сурвалжид уншиж авах фийд БАЙХГҮЙ — түүний
            // нотолгоог энэ апп өөрөө бичдэг (recordSelfCheckin). Синк түүнд
            // хүрвэл шинээр бичсэн бүхнийг дарж бичих байсан.
            if (source.kind === "self") continue;

            // Татдаг эх сурвалжийг хүлээнэ. Аль нь ч алдаа шидэхгүй — үхсэн нэг
            // эх сурвалж бусдынхаа синкийг ЗОГСООХ ЁСГҮЙ.
            const read = source.kind === "fetch"
                ? await fetchBridgeFeed(source.url)
                : readBridgeFeed(source.key);
            if (!read) continue;   // фийд БАЙХГҮЙ — апп суугаагүй, алдаа биш

            const state = getIntegrationState(source.app);

            // Фийд байгаа мөртлөө уншигдсангүй. Энэ бол ЖИНХЭНЭ эвдрэл: хэрэглэгч
            // үнэхээр ажилласан мөртлөө тоо нь хаа нэгтээ алга болж байна.
            // Чимээгүй өнгөрөөвөл "апп суугаагүй"-тэй ялгагдахаа болино.
            if (!read.ok) {
                state.feedError = {
                    reason:  read.reason,
                    version: (read.version === undefined) ? null : read.version,
                    at:      Date.now()
                };
                touched = true;
                console.warn(`[bridge] ${source.label}: фийд голдов — ${read.reason}`,
                             read.version !== undefined ? `(v${read.version})` : "");
                continue;
            }
            state.feedError = null;   // амжилттай уншигдсан — хуучин алдааг арилгана

            const feed = read.feed;

            // status-г бүтнээр нь хадгална — фийд уншигдсан л бол шинэчилнэ.
            state.status    = feed.status;
            state.updatedAt = feed.updatedAt;
            touched = true;

            // Давхардлын хамгаалалт: тусдаа syncedIds жагсаалт БИШ, нотолгоо өөрөө.
            // Бичлэг бүр өөрийн id-г авч явдаг тул нэмэлт бүртгэл шаардлагагүй.
            const seen = new Set(state.evidence.map(e => e && e.id));
            let appEvents = 0;

            for (const event of feed.events) {
                if (seen.has(event.id)) continue;
                // Нэгтгэгдээд хасагдсан event дахин "шинэ" мэт орж ирэхээс сэргийлнэ.
                if (event.at > 0 && event.at < (state.prunedBefore || 0)) continue;

                // Энэ давхарга зөвхөн НОТОЛГОО бичнэ — ямар ч тооцоо энд байхгүй.
                state.evidence.push({
                    id:     event.id,
                    at:     event.at,
                    type:   event.type,
                    value:  event.value,
                    detail: event.detail,
                    data:   event.data
                });
                seen.add(event.id);
                appEvents += 1;
            }

            pruneEvidence(state);
            state.lastSyncedAt = Date.now();

            result.events += appEvents;
            if (appEvents > 0) parts.push(`${source.label} ${appEvents}`);
        }

        // Хадгалалт: event тус бүрд биш, БҮХ эх сурвалжийг дуусгасны дараа НЭГ УДАА.
        if (touched) await saveWebData();

        // Нотолгоо өөрчлөгдсөн тул гаргасан статус хуучирлаа. Синк амжилттай
        // дууссан бүрд кэшийг хаяна — status.js юу ч хадгалдаггүй тул үнэгүй.
        if (typeof Status !== "undefined" && Status && typeof Status.invalidate === "function") {
            Status.invalidate();
        }

        if (result.events > 0) {
            console.log(`[bridge] ${result.events} шинэ нотолгоо — ${parts.join(", ")}`);
            // UI биш — зүгээр л дэлгэц дээрхийг төлөвтэй нь тэнцүүлэх (boot-оос хойш
            // ирсэн нотолгоог focus/storage үед хуучин хэвээр үлдээхгүйн тулд).
            if (typeof renderWebUI === "function") renderWebUI();
        }
    } catch (err) {
        console.error("syncAll error:", err);
        return { awarded: 0, events: 0 };
    } finally {
        _syncing = false;
    }

    return result;
}

// ===================== ХӨДӨЛГӨГЧ =====================
// Boot-ыг script.js-ийн init() дуудна (loadWebData дууссаны дараа байх ёстой).
// Focus/storage-г энд бүртгэнэ — ингэснээр шинэ апп нэмэхэд script.js хөндөгдөхгүй.

window.addEventListener("focus", () => { syncAll(); });

window.addEventListener("storage", (e) => {
    // Өөрсдийн хадгалалт болон хамаагүй түлхүүрүүдээс болж синк ажиллуулахгүй.
    // fetch төрлийн эх сурвалжид key БАЙХГҮЙ — тэднийг харьцуулалтаас ил гаргана,
    // эс тэгвээс undefined === undefined гэсэн санамсаргүй таарал үүсэж мэднэ.
    if (e && e.key && !BRIDGE_SOURCES.some(s => s.kind === "local" && s.key === e.key)) return;
    syncAll();
});

// Үйлдвэрлэгч аппууд өөрсдөө 50 event-ийн буфертэй — хоёр синкийн хооронд тэр
// дүүрвэл нотолгоо ЭРГЭЖ ИРЭХГҮЙГЭЭР алдагдана. Тиймээс focus/storage-оос гадна
// таб харагдах болгонд, мөн нээлттэй байхад минут тутам уншина.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncAll();
});

setInterval(() => { if (!document.hidden) syncAll(); }, 60000);

// ===================== UI: "CONNECTED" САМБАР =====================
// Апп бүрд НЭГ карт — бүгдийг нь webData.integrations[app]-аас барина. Энэ рендер
// нь ямар ч аппын талбарын нэрийг МЭДЭХГҮЙ: status дотор юу ирснийг тэр чигээр нь
// key/value болгон харуулна. Тиймээс шинэ апп нэмэхэд энд ч юу ч засах шаардлагагүй.

const CONNECTED_STALE_MS     = 3 * 24 * 60 * 60 * 1000;  // үүнээс хуучин бол бүдгэрүүлнэ
const CONNECTED_LOG_SHOWN    = 5;    // хөлд харуулах сүүлийн бичлэгийн тоо
const CONNECTED_STATUS_ROWS  = 12;   // нэг картад харуулах status мөрийн дээд тоо
const CONNECTED_STATUS_DEPTH = 3;    // status-ыг задлах гүн
const CONNECTED_STATUS_NODES = 200;  // гэмтэлтэй/асар том status-аас хамгаалах хязгаар

// "2 hours ago" маягийн харьцангуй хугацаа. Хугацаа байхгүй/буруу бол null.
function relativeTime(ms) {
    const t = Number(ms);
    if (!isFinite(t) || t <= 0) return null;

    // Үйлдвэрлэгч аппын цаг урдуур явж байвал сөрөг зөрүү гарна — "just now" гэе.
    const diff = Math.max(0, Date.now() - t);
    const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return plural(minutes, "minute");

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return plural(hours, "hour");

    const days = Math.floor(hours / 24);
    if (days < 30) return plural(days, "day");

    const months = Math.floor(days / 30);
    if (months < 12) return plural(months, "month");

    return plural(Math.floor(days / 365), "year");
}

// status объектыг [түлхүүрийн зам, утга] хосуудын жагсаалт болгон задална.
// Ямар ч бүтэц ирж болно — үүрлэсэн объект, массив, энгийн утга бүгд ажиллана.
function flattenStatus(value, prefix, out, depth) {
    if (out.length >= CONNECTED_STATUS_NODES) return out;

    if (value === null || value === undefined) {
        out.push([prefix, "—"]);
        return out;
    }

    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
        out.push([prefix, String(value)]);
        return out;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) { out.push([prefix, "—"]); return out; }
        // Энгийн утгын массивыг нэг мөрөнд нийлүүлнэ; объектын массивыг индексээр задална.
        const allPrimitive = value.every(v => v === null || typeof v !== "object");
        if (allPrimitive || depth >= CONNECTED_STATUS_DEPTH) {
            out.push([prefix, value.map(v => (v === null || v === undefined) ? "—" : String(v)).join(", ")]);
            return out;
        }
        value.forEach((v, i) => flattenStatus(v, `${prefix}[${i}]`, out, depth + 1));
        return out;
    }

    if (type !== "object") { out.push([prefix, String(value)]); return out; }

    const keys = Object.keys(value);
    if (keys.length === 0) { out.push([prefix, "—"]); return out; }
    if (depth >= CONNECTED_STATUS_DEPTH) { out.push([prefix, `{${keys.length} fields}`]); return out; }

    keys.forEach(k => flattenStatus(value[k], prefix ? `${prefix}.${k}` : k, out, depth + 1));
    return out;
}

// status-ын мөрүүд. Хэт олон бол таслаад "+N more" гэж илэн далангүй хэлнэ.
function connectedStatusHtml(status) {
    const rows = flattenStatus(status, "", [], 0);
    if (rows.length === 0) return `<div class="connected-empty">no status published</div>`;

    const shown = rows.slice(0, CONNECTED_STATUS_ROWS);
    const hidden = rows.length - shown.length;

    let html = shown
        .map(([k, v]) => `<div class="xp-row"><span>${escapeHTML(k)}</span><span>${escapeHTML(v)}</span></div>`)
        .join("");
    if (hidden > 0) html += `<div class="xp-row"><span>…</span><span>+${hidden} more</span></div>`;
    return html;
}

// Сүүлийн CONNECTED_LOG_SHOWN бичлэг, шинийг нь дээр нь.
//
// ТҮҮХИЙ бичлэг хоосон байх нь "идэвхгүй" гэсэн үг БИШ: 180 хоногийн дараа
// бичлэгүүд нэгтгэгдэж хувин болдог. Өмнө нь энэ карт тэр ялгааг мэдэлгүй
// "no activity yet" гэж бичдэг байсан — олон жилийн түүхтэй эх сурвалжийг
// хоосон мэт харуулна гэсэн үг. Одоо нэгтгэгдсэн тоог нь шулуухан хэлнэ.
function connectedEvidenceHtml(evidence, rolledCount) {
    const entries = Array.isArray(evidence) ? evidence : [];
    const rolled  = Number(rolledCount) || 0;

    if (entries.length === 0) {
        return rolled > 0
            ? `<div class="connected-empty">${rolled.toLocaleString()} бичлэг нэгтгэсэн түүхэд шилжсэн</div>`
            : `<div class="connected-empty">no activity yet</div>`;
    }

    return entries.slice(-CONNECTED_LOG_SHOWN).reverse().map(entry => {
        const when   = relativeTime(entry && entry.at) || "unknown time";
        // detail байхгүй бол event-ийн төрлөөр орлуулна — хоосон цэгүүд үлдээхгүй.
        const detail = (entry && (entry.detail || entry.type)) || "—";
        return `<div class="connected-log-entry">${escapeHTML(when)} · ${escapeHTML(detail)}</div>`;
    }).join("");
}

// Нотолгооны хэмжээ — түүхий болон нэгтгэсэн хоёрын НИЙЛБЭР, дээр нь сүүлийн
// 30 хоногийнх. Статусын давхарга аль хэдийн тоолсон байдаг тул энд дахин
// тоолохгүй: хоёр газар хоёр өөр тоо гаргах эрсдэлийг ингэж хаана.
function connectedVolumeHtml(source) {
    if (!source) return "";
    const total  = Number(source.evidenceCount) || 0;
    const last30 = Number(source.last30Count)   || 0;
    if (total === 0) return "";
    return `
        <div class="connected-volume">
            <span>${total.toLocaleString()} нотолгоо</span>
            <span>${last30.toLocaleString()} · сүүлийн 30 хоног</span>
        </div>`;
}

function renderConnectedApps() {
    const container = document.getElementById("connected-container");
    if (!container) return;

    container.innerHTML = "";
    const integrations = (webData && webData.integrations && typeof webData.integrations === "object")
        ? webData.integrations
        : {};
    const status  = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const sources = (status && status.sources) ? status.sources : {};

    // Тохируулгад бичигдсэн эх сурвалж бүр, МӨН датад л байгаа нь ч. status.js
    // яг ингэж жагсаадаг: BRIDGE_SOURCES-оос хасагдсан апп нотолгоогоо
    // хадгалсаар байхад самбараас чимээгүй алга болох ёсгүй.
    const apps = BRIDGE_SOURCES.map(s => s.app);
    Object.keys(integrations).forEach(app => { if (apps.indexOf(app) === -1) apps.push(app); });

    apps.forEach(app => {
        const source = BRIDGE_SOURCES.find(s => s && s.app === app) || null;
        const entry  = integrations[app];
        const stats  = sources[app] || null;
        const label  = (source && source.label) || (stats && stats.label) || app;

        const card = document.createElement("div");
        card.className = "category-card connected-card";
        card.dataset.app = app;

        // Картын өнцгийн туяа — эх сурвалжийн өөрийнх нь өнгө
        // (.category-card::before --tier-color-г ашигладаг).
        if (source && source.hex) card.style.setProperty("--tier-color", source.hex);

        // lastSyncedAt тавигдсан гэдэг нь фийдийг нь наад зах нь нэг удаа
        // амжилттай уншсан гэсэн үг. Хэзээ ч нийтлээгүй бол — алдаа биш, чимээгүй мөр.
        if (!entry || !entry.lastSyncedAt) {
            // Гар бүртгэл "холбогдох" зүйл биш — хэрэглэгч эхлээгүй л байна.
            const empty = (source && source.kind === "self")
                ? "бүртгэл эхлээгүй"
                : "not connected yet";
            card.innerHTML = `
                <div class="card-head">
                    <h3>${escapeHTML(label)}</h3>
                </div>
                <div class="connected-empty">${escapeHTML(empty)}</div>`;
            container.appendChild(card);
            return;
        }

        const updatedAt = Number(entry.updatedAt);
        const age = isFinite(updatedAt) && updatedAt > 0 ? Date.now() - updatedAt : Infinity;
        if (age > CONNECTED_STALE_MS) card.classList.add("stale");

        card.innerHTML = `
            <div class="card-head">
                <h3>${escapeHTML(label)}</h3>
                <div class="connected-time">${escapeHTML(relativeTime(updatedAt) || "no updates yet")}</div>
            </div>
            ${connectedVolumeHtml(stats)}
            <div class="connected-status">${connectedStatusHtml(entry.status)}</div>
            <div class="connected-log">${connectedEvidenceHtml(entry.evidence, stats && stats.rolledCount)}</div>`;

        container.appendChild(card);
    });
}
