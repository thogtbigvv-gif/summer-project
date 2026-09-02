"use strict";

// ===================== GENERIC APP BRIDGE (READ-ONLY) =====================
// Холбогдсон аппууд (Bigu, Дасгал, ирээдүйд бусад нь) ижил GitHub Pages origin
// дээр байрладаг тул localStorage-оо энэ апптай хуваалцдаг. Тэд тус бүр өөрийн
// түлхүүрт НЭГ ЧИГЛЭЛТ фийд бичдэг. Энд бид түүнийг ЗӨВХӨН УНШИЖ НОТОЛГОО болгон
// хадгална — ямар ч тооцоо хийхгүй. Аль ч гүүрийн түлхүүр рүү ХЭЗЭЭ Ч бичихгүй.
//
// Нийтлэг гэрээ (JSON) — апп бүр адилхан:
//   { v: <хувилбар>, updatedAt: <ms>,
//     status: { ... апп юу ч хүсвэл — бид бүтнээр нь хадгална, тайлбарлахгүй },
//     events: [ { id, at, type, value, detail, data? } ... ] }
//
// data нь заавал биш дамжуулах объект (ж: { volumeKg }, { correct, total }) —
// үйлдвэрлэгч бодит нэгжээ энд нийтэлнэ. Бид түүнийг тайлбарлахгүй, хадгална.
//
// `v` НЬ ҮЙЛДВЭРЛЭГЧ ТУС БҮРИЙН ГЭРЭЭНИЙ ХУВИЛБАР — бүх аппыг нэг цагт
// шинэчилдэг дугаар БИШ. Апп бүр өөрийн хурдаар хувилбараа ахиулна: Gym ба
// GitHub v1 бичиж байхад Bigu аль хэдийн v2 бичиж байна. Тиймээс энд ГАНЦ
// тоо байж болохгүй — уншигч нь ТАНИХ ХУВИЛБАРУУДЫН БҮРТГЭЛ барина
// (BRIDGE_FEED_VERSIONS). Эдгээр хувилбарууд ижил дугтуйны хэлбэртэй тул
// доорх код тэднийг ялгадаггүй; ялгаа гарах өдөр л энд шинэ мөр нэмэгдэнэ.
//
// Ганц тоо барьсны үнэ нь бодитоор гарсан: Bigu v2 рүү шилжихэд энэ уншигч
// түүнийг "фийд гэмтсэн" гээд татгалзаж, MIND тэнхлэг тэглэгдэн зогссон.
// Хамаагүй апп биш — уншигчийн зүгээс ХУУЧИРСАН гэрээ байсан хэрэг.
//
// Түлхүүр байхгүй, гэмтсэн, эсвэл `v` нь ТАНИХГҮЙ хувилбар бол тэр эх
// сурвалжийг алгасна — апп өнөөдрийнхтэй яг адилхан ажиллана. Чимээгүй биш
// ч: шалтгаан нь холболтын карт дээр нэрээ хэлнэ.
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

// ===================== ХЭРЭГЛЭГЧИЙН НЭМСЭН ЭХ СУРВАЛЖ =====================
// Дээрх жагсаалт бол КОДОД бичигдсэн суурь. Гэхдээ шинэ фийд холбохын тулд
// repo засаж, deploy хүлээх шаардлагагүй байх ёстой — утаснаасаа нэмж чадах
// ёстой. Хэрэглэгчийн нэмсэн эх сурвалж webData.sources-д сууна.
//
// Хоёулаа ЯГ ИЖИЛ гэрээгээр дамжина: доорх код аль нь болохыг ялгадаггүй.
//
// НОТОЛГОО НЬ ЭХ СУРВАЛЖААС ХАМААРАХГҮЙ АМЬДАРНА. Холбоог салгахад
// webData.integrations[app] ХЭВЭЭР үлдэнэ — жагсаалтаас хасах нь "уншихаа
// болих" гэсэн үг, "түүхийг устгах" гэсэн үг БИШ.

const USER_SOURCE_KINDS  = ["local", "fetch"];
const DEFAULT_SOURCE_HEX = "#64748b";
const SOURCE_HEX_RE      = /^#[0-9a-fA-F]{3,8}$/;

// webData.sources-ыг цэвэрлэж, ажиллах чадвартайг нь буцаана. Гэмтэлтэй мөр
// бүхэл жагсаалтыг унагаах ёсгүй — түүнийг л алгасна.
function userBridgeSources() {
    const raw = (webData && typeof webData === "object" && Array.isArray(webData.sources))
        ? webData.sources : [];

    const seen = new Set(BRIDGE_SOURCES.map(s => s.app));
    const out  = [];

    raw.forEach(item => {
        if (!item || typeof item !== "object") return;

        const app = bridgeText(item.app);
        // Суурь жагсаалт ҮРГЭЛЖ ялна: хэрэглэгчийн мөр "github"-ыг дарж бичвэл
        // тэр аппын нотолгоо огт өөр фийдээс ирж эхэлнэ.
        if (!app || seen.has(app)) return;

        const kind = bridgeText(item.kind);
        if (USER_SOURCE_KINDS.indexOf(kind) === -1) return;

        const locator = bridgeText(kind === "fetch" ? item.url : item.key);
        if (!locator) return;

        seen.add(app);
        const hex = bridgeText(item.hex);
        const source = {
            app,
            kind,
            label: bridgeText(item.label) || app,
            hex:   SOURCE_HEX_RE.test(hex) ? hex : DEFAULT_SOURCE_HEX,
            user:  true
        };
        if (kind === "fetch") source.url = locator; else source.key = locator;
        out.push(source);
    });

    return out;
}

// Уншигдах БҮХ эх сурвалж. bridge.js ба status.js хоёулаа ҮҮНИЙГ дуудна —
// хоёр газар хоёр өөр жагсаалт барих нь картууд ба тоонууд зөрөх зам.
function listBridgeSources() {
    return BRIDGE_SOURCES.concat(userBridgeSources());
}

function findBridgeSource(app) {
    return listBridgeSources().find(s => s && s.app === app) || null;
}

// ===================== ТАНИХ ГЭРЭЭНИЙ ХУВИЛБАРУУД =====================
// Уншигч ямар `v`-г таньдаг вэ. Энэ бол ЖАГСААЛТ, ганц тоо биш: үйлдвэрлэгч
// апп бүр өөрийн хурдаар хувилбараа ахиулдаг тул нэг мөчид хоёр өөр хувилбар
// зэрэг ирж байх нь ХЭВИЙН байдал болохоос эвдрэл биш.
//
//   v1 — Gym ба GitHub (data/github.json) одоогоор үүгээр бичнэ.
//   v2 — Bigu-гийн одоогийн гэрээ (docs/BRIDGE.md түүнийх).
//
// ЭНЭ УНШИГЧИЙН хувьд хоёул ЯГ ИЖИЛ дугтуй: { v, updatedAt, status, events }
// бөгөөд event бүр { id, at, type, value, detail, data? }. Bigu нэмж бичдэг
// `app` талбар, event бүрийн `date` талбар хоёрыг бид уншдаггүй — өдрийг
// `at`-аас гаргадаг. Танихгүй талбар уншилтыг зогсоох ЁСГҮЙ, тиймээс хоёр
// хувилбарыг салгаж боловсруулах шалтгаан алга.
//
// ШИНЭ ХУВИЛБАР НЭМЭХ: доорх талбарууд утгаа хадгалсан хэвээр бол ЭНД нэг тоо
// нэмнэ. Утга нь өөрчлөгдсөн бол энд нэмэхийн ӨМНӨ хөрвүүлэлт бичих ёстой —
// танихгүй дугтуйг татгалзах нь доторх утгыг буруу тайлбарлахаас ХАМГААЛНА.
const BRIDGE_FEED_VERSIONS = [1, 2];

function isSupportedFeedVersion(v) {
    return BRIDGE_FEED_VERSIONS.indexOf(v) !== -1;
}

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

// ===================== ОНОШИЛГОО =====================
// Урьд нь бүх бүтэлгүйтэл null байсан: "юу ч ирсэнгүй" гэдгээс цаашгүй.
// Тэр нь дэлгэц дээр зөвхөн бүдгэрсэн карт болж харагддаг байв — түлхүүр
// буруу бичсэн үү, апп хараахан бичээгүй юү, фийд гэмтсэн үү гэдгийг
// хэрэглэгч ЯЛГАХ АРГАГҮЙ. Одоо шалтгаан бүр нэрээ хэлнэ.
const BRIDGE_CHECK_TEXT = {
    ok:            "уншигдаж байна",
    self:          "гар бүртгэл — уншиж авах фийд байхгүй",
    "no-storage":  "энэ хөтөч дээр localStorage байхгүй",
    missing:       "түлхүүр олдсонгүй — тэр апп энэ хөтөч дээр хараахан бичээгүй байна",
    "bad-json":    "агуулга JSON биш — фийд гэмтсэн",
    "bad-shape":   "фийдийн хэлбэр таарахгүй (объект байх ёстой)",
    "bad-version": `фийдийн хувилбарыг танихгүй байна (уншдаг нь v${BRIDGE_FEED_VERSIONS.join(", v")}) — уншихаас татгалзав`,
    http:          "файл татагдсангүй",
    network:       "сүлжээнд хүрсэнгүй",
    "no-fetch":    "энэ орчинд fetch байхгүй",
    unknown:       "тодорхойгүй эх сурвалж"
};

function bridgeCheckText(code, detail) {
    const base = BRIDGE_CHECK_TEXT[code] || BRIDGE_CHECK_TEXT.unknown;
    return detail ? `${base} (${detail})` : base;
}

// ===================== ШАЛТГААНЫ ХҮНДРЭЛ =====================
// "Хүлээгдэж байгаа" ба "эвдэрсэн" хоёрын ЯЛГАА нь энэ систем дэх хамгийн
// чухал ялгаануудын нэг: эхнийх нь засах юмгүй (тэр апп хараахан бичээгүй),
// хоёр дахь нь хэн нэгэн засах ёстой. Гурван газар (карт, оношилгооны мөр,
// метрикийн эх сурвалж) энэ ялгааг ТУС ТУСДАА бичиж байсан — нэг код нэмэхэд
// гурвын хоёрт нь орхигдвол дэлгэц өөртэйгөө маргана. Одоо нэг л газар.
//
//   "ok"   — уншигдаж байна
//   "self" — гар бүртгэл: уншиж авах фийд БАЙХГҮЙ, тэр нь хэвийн
//   "wait" — хараахан эхлээгүй. ЗАСАХ ЮМГҮЙ, тиймээс улаан БИШ
//   "bad"  — уншилт зогссон. Хэн нэгэн засах ёстой
function bridgeCheckSeverity(code) {
    if (code === "ok") return "ok";
    if (code === "self") return "self";
    if (code === "missing" || code === "no-storage") return "wait";
    return "bad";
}

function checkFail(code, detail) { return { ok: false, code, detail: detail || "" }; }
function checkPass(feed)         { return { ok: true,  code: "ok", detail: "", feed }; }

// Задалсан JSON-ыг гэрээнд тулгана. Хүлээгдсэнээс өөр юм ирвэл ШАЛТГААНТАЙ
// татгалзана. localStorage-ийн ч, татаж авсан ч фийд ЯГ ЭНЭ шалгуураар
// дамжина — хүргэх зам нь өөр ч гэрээ нь нэг.
function validateBridgeFeed(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return checkFail("bad-shape");
    if (!isSupportedFeedVersion(parsed.v)) {
        return checkFail("bad-version", `v=${JSON.stringify(parsed.v)}`);
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

    return checkPass({ status, updatedAt: bridgeNum(parsed.updatedAt), events });
}

// kind: "local" — Хамгаалалттай унших + parse.
function readBridgeFeed(key) {
    try {
        if (typeof localStorage === "undefined") return checkFail("no-storage");

        const raw = localStorage.getItem(key);
        // Байхгүй түлхүүр бол АЛДАА БИШ: тэр апп энэ хөтөч дээр хараахан
        // ажиллаагүй л байна. Гэхдээ чимээгүй ч биш — картад ингэж гарна.
        if (!raw || typeof raw !== "string") return checkFail("missing", key);

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            return checkFail("bad-json", key);
        }
        return validateBridgeFeed(parsed);
    } catch (err) {
        console.warn(`readBridgeFeed: "${key}" уншиж чадсангүй —`, err);
        return checkFail("bad-json", key);
    }
}

// kind: "fetch" — repo дотор commit хийгдсэн фийдийг татна. Файл байхгүй,
// сүлжээ унтарсан, JSON гэмтсэн — бүгд ШАЛТГААНТАЙ татгалзал. Синк
// зогсохгүй: үхсэн нэг эх сурвалж бусдыг тасалдуулах ёсгүй.
async function fetchBridgeFeed(url) {
    if (typeof fetch !== "function") return checkFail("no-fetch");

    let res;
    try {
        // Кэш тойрно: Pages-ийн CDN хуучин хуулбарыг өгвөл шинэ commit
        // хэдэн цагаар харагдахгүй байж мэднэ.
        res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    } catch (err) {
        console.warn(`fetchBridgeFeed: "${url}" татаж чадсангүй —`, err);
        return checkFail("network", url);
    }

    if (!res || !res.ok) {
        const status = res ? res.status : "?";
        console.warn(`fetchBridgeFeed: "${url}" — HTTP ${status}`);
        return checkFail("http", `HTTP ${status}`);
    }

    try {
        return validateBridgeFeed(await res.json());
    } catch (err) {
        return checkFail("bad-json", url);
    }
}

// Эх сурвалжийг НЭГ УДАА уншиж, юу болсныг хэлнэ. Хадгалалт хийхгүй тул
// "Шалгах" товч үүнийг датад хүрэлгүйгээр дуудаж чадна.
async function probeBridgeSource(source) {
    if (!source || typeof source !== "object") return checkFail("unknown");
    if (source.kind === "self")  return checkFail("self");
    if (source.kind === "fetch") return await fetchBridgeFeed(source.url);
    return readBridgeFeed(source.key);
}

// ===================== ШАЛГАЛТЫН БҮРТГЭЛ =====================
// Status-ийн кэштэй ижил зарчим: САНАХ ОЙД, webData-д ХЭЗЭЭ Ч бичихгүй.
// Энэ бол "яг одоо холбоо ямар байна" гэсэн асуултын хариу — нотолгоо биш,
// тиймээс хадгалах шаардлагагүй. Хадгалбал минут тутмын синк бүр бүхэл
// датаг дахин бичиж, утсан дээр дэмий ажиллагаа үүсгэнэ.
const bridgeChecks = {};

function recordBridgeCheck(app, result, events) {
    if (!app) return;
    bridgeChecks[app] = {
        at:     Date.now(),
        code:   (result && result.code) || "unknown",
        detail: (result && result.detail) || "",
        events: Number(events) || 0
    };
}

function getBridgeCheck(app) {
    return (app && bridgeChecks[app]) ? bridgeChecks[app] : null;
}

// ===================== ТООГ ӨЛСГӨЖ БУЙ ЭХ СУРВАЛЖ =====================
// Метрик 0 дээр зогсох ХОЁР шалтгаан бий бөгөөд тэдгээр нь ТЭС ӨӨР утгатай:
//
//   1. Хийгээгүй. Тоо үнэн — хийвэл өснө.
//   2. Уншилт зогссон. Тоо ХУДАЛ — хичнээн хийсэн ч өсөхгүй.
//
// Холбогдсон таб хоёрыг ялгаж чаддаг байсан. Гэтэл хохирол нь ӨӨР ДЭЛГЭЦ
// дээр гардаг: профайлын мөр, радарын тэнхлэг. Bigu-гийн гэрээ зөрөхөд яг
// ийм зүйл болсон — MIND 0%-д зогссон ч, тэр 0-ийн ард "хичээлээгүй" биш
// "уншиж чадахгүй байна" гэж бичээтэй байсныг зөвхөн өөр таб руу орсон хүн
// л олно. Тоо өөрөө өлссөнөө хэлэх ёстой.
//
// Санамсаргүй чимээ гаргахгүй: "wait" (тэр апп хараахан бичээгүй) нь эвдрэл
// БИШ тул тусад нь буцаана — дуудагч түүнийг улаанаар бичих ёсгүй.
//
// bridgeChecks нь САНАХ ОЙД суудаг тул синк болоогүй эх сурвалж энд огт
// гарч ирэхгүй — "мэдэхгүй" гэдгийг "эвдэрсэн" гэж хэлэхгүй.
function starvedSources(metricIds) {
    const ids = Array.isArray(metricIds) ? metricIds : [];
    const bad = [], waiting = [];
    const seen = new Set();

    ids.forEach(id => {
        const apps = (typeof metricSourceApps === "function") ? metricSourceApps(id) : [];
        apps.forEach(app => {
            if (seen.has(app)) return;
            seen.add(app);

            const check = getBridgeCheck(app);
            if (!check) return;                       // хараахан уншаагүй — дүгнэхгүй

            const severity = bridgeCheckSeverity(check.code);
            if (severity === "ok" || severity === "self") return;

            const source = findBridgeSource(app);
            const row = {
                app,
                label: (source && source.label) || app,
                code:  check.code,
                detail: check.detail || ""
            };
            (severity === "bad" ? bad : waiting).push(row);
        });
    });

    return { bad, waiting };
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

// НЭГ эх сурвалжийг уншиж, шинэ event бүрийг нотолгоо болгон бичнэ.
// ХАДГАЛАХГҮЙ: дуудагч бүх эх сурвалжийг дуусгаад НЭГ УДАА хадгална.
// Буцаах утга: { ok, touched, events }
async function pullSource(source) {
    if (!source || typeof source !== "object") return { ok: false, touched: false, events: 0 };

    // Өөрөө мэдээлсэн эх сурвалжид уншиж авах фийд БАЙХГҮЙ — түүний
    // нотолгоог энэ апп өөрөө бичдэг (recordSelfCheckin). Синк түүнд
    // хүрвэл шинээр бичсэн бүхнийг дарж бичих байсан.
    if (source.kind === "self") {
        recordBridgeCheck(source.app, checkFail("self"), 0);
        return { ok: true, touched: false, events: 0 };
    }

    // Аль нь ч алдаа шидэхгүй — үхсэн нэг эх сурвалж бусдынхаа синкийг
    // ЗОГСООХ ЁСГҮЙ. Одоо тэр бүтэлгүйтэл шалтгаанаа бүртгэж үлдээнэ.
    const probe = await probeBridgeSource(source);
    if (!probe.ok) {
        recordBridgeCheck(source.app, probe, 0);
        return { ok: false, touched: false, events: 0 };
    }

    const feed  = probe.feed;
    const state = getIntegrationState(source.app);

    // status-г бүтнээр нь хадгална — фийд уншигдсан л бол шинэчилнэ.
    state.status    = feed.status;
    state.updatedAt = feed.updatedAt;

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
    recordBridgeCheck(source.app, probe, appEvents);

    return { ok: true, touched: true, events: appEvents };
}

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

        for (const source of listBridgeSources()) {
            const pulled = await pullSource(source);
            if (pulled.touched) touched = true;
            result.events += pulled.events;
            if (pulled.events > 0) parts.push(`${source.label} ${pulled.events}`);
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

// ===================== ГАРААР УДИРДАХ =====================
// Синк нь өөрөө focus/visibility/минут тутам ажилладаг. Гэхдээ "яагаад
// ирэхгүй байна вэ" гэж эргэлзэж буй хүнд ХАРИУ ӨГӨХ товч хэрэгтэй:
// автоматыг хүлээх нь хариулт биш.

// Нэг эх сурвалжийг гараар дахин уншина. Буцаах утга нь дэлгэцэнд шууд
// харуулах боломжтой: { ok, code, detail, events }
async function syncSource(app) {
    const source = findBridgeSource(app);
    if (!source) return { ok: false, code: "unknown", detail: "", events: 0 };

    if (_syncing) return { ok: false, code: "busy", detail: "", events: 0 };
    _syncing = true;

    try {
        const pulled = await pullSource(source);
        if (pulled.touched) await saveWebData();

        if (typeof Status !== "undefined" && Status && typeof Status.invalidate === "function") {
            Status.invalidate();
        }
        if (typeof renderWebUI === "function") renderWebUI();

        const check = getBridgeCheck(app) || {};
        return { ok: pulled.ok, code: check.code || "unknown", detail: check.detail || "", events: pulled.events };
    } catch (err) {
        console.error("syncSource error:", err);
        return { ok: false, code: "unknown", detail: "", events: 0 };
    } finally {
        _syncing = false;
    }
}

// ===================== ЭХ СУРВАЛЖ НЭМЭХ / САЛГАХ =====================

const MAX_USER_SOURCES = 20;

// Кирилл → латин. Аппын id нь нотолгооны түлхүүр бөгөөд "source:run.done"
// гэсэн хэлбэрээр дэлгэц дээр ч гардаг. Галиглахгүй бол монгол нэр бүр
// хоосон болж, эх сурвалж бүр "source", "source-2", "source-3" болно —
// өөрөөр хэлбэл нэр нь утгаа алдана.
const CYRILLIC_MAP = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"j", з:"z", и:"i",
    й:"i", к:"k", л:"l", м:"m", н:"n", о:"o", ө:"u", п:"p", р:"r", с:"s",
    т:"t", у:"u", ү:"u", ф:"f", х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sh",
    ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya"
};

// Нэрнээс id гаргана. id нь нотолгооны түлхүүр болох тул ТОГТВОРТОЙ байх
// ёстой: нэгэнт үүссэн бол нэрээ солиход ч өөрчлөгдөхгүй.
function slugifySourceId(text) {
    const base = bridgeText(text)
        .toLowerCase()
        .replace(/[\u0400-\u04FF]/g, ch => (ch in CYRILLIC_MAP ? CYRILLIC_MAP[ch] : ""))
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);
    return base || "source";
}

function uniqueSourceId(base) {
    const taken = new Set(listBridgeSources().map(s => s.app));
    // Нотолгоо үлдсэн хуучин апп ч id-гаа эзэлсэн хэвээр: түүнийг дахин
    // ашиглавал хоёр өөр эх сурвалжийн түүх нэг дор хольцолдоно.
    if (webData && webData.integrations) Object.keys(webData.integrations).forEach(a => taken.add(a));

    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
        const candidate = `${base}-${i}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${base}-${Date.now()}`;
}

// Хаяг нь аюулгүй эсэх. javascript:, data: зэрэг схемийг ХЭЗЭЭ Ч уншихгүй —
// фийдийн хаяг бол өгөгдлийн зам, кодын зам биш.
function validSourceUrl(url) {
    if (/^https?:\/\//i.test(url)) return true;
    // Харьцангуй зам (data/foo.json, ./foo.json) — өөрийн сайт доторх файл.
    return !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

// Шинэ эх сурвалж нэмнэ. Алдааг ХАЯХГҮЙ ЧИМЭЭГҮЙ өнгөрөхгүй — Error шидэж,
// дуудагч нь хэрэглэгчид хэлнэ. Буцаах утга: нэмэгдсэн эх сурвалж.
async function addBridgeSource(input) {
    const label = bridgeText(input && input.label);
    if (!label) throw new Error("Нэр оруулна уу.");

    const kind = bridgeText(input && input.kind);
    if (USER_SOURCE_KINDS.indexOf(kind) === -1) throw new Error("Эх сурвалжийн төрөл буруу байна.");

    const locator = bridgeText(input && input.locator);
    if (!locator) {
        throw new Error(kind === "fetch" ? "Файлын хаягийг оруулна уу." : "localStorage түлхүүрээ оруулна уу.");
    }
    if (kind === "fetch" && !validSourceUrl(locator)) {
        throw new Error("Зөвхөн http(s) хаяг эсвэл сайт доторх зам байж болно.");
    }

    // Нэг фийдийг хоёр удаа уншвал ЯГ ИЖИЛ event хоёр өөр аппын нэрээр
    // бүртгэгдэж, бүх тоо хоёр дахин нэмэгдэнэ.
    const clash = listBridgeSources().find(s => s.kind === kind && (kind === "fetch" ? s.url : s.key) === locator);
    if (clash) throw new Error(`Энэ эх сурвалжийг аль хэдийн "${clash.label}" уншиж байна.`);

    if (!Array.isArray(webData.sources)) webData.sources = [];
    if (webData.sources.length >= MAX_USER_SOURCES) {
        throw new Error(`Нэмж болох эх сурвалжийн дээд хязгаар (${MAX_USER_SOURCES}) дүүрсэн байна.`);
    }

    const hex = bridgeText(input && input.hex);
    const source = {
        app:   uniqueSourceId(slugifySourceId(label)),
        kind,
        label,
        hex:   SOURCE_HEX_RE.test(hex) ? hex : DEFAULT_SOURCE_HEX,
        addedAt: Date.now()
    };
    if (kind === "fetch") source.url = locator; else source.key = locator;

    webData.sources.push(source);
    await saveWebData();

    // Нэмсэн даруйд нэг уншина — хэрэглэгч үр дүнг НЭН ДАРУЙ харах ёстой.
    await syncSource(source.app);
    return source;
}

// Холбоог салгана. НОТОЛГОО ХЭВЭЭР ҮЛДЭНЭ — webData.integrations[app]-д
// хуруу ч хүрэхгүй. Картад "уншихаа больсон" гэж гарсаар байх бөгөөд
// түүхэн тоонууд нь хэвээр тооцогдоно.
async function removeBridgeSource(app) {
    const id = bridgeText(app);
    if (!id) return false;
    if (BRIDGE_SOURCES.some(s => s.app === id)) {
        throw new Error("Суурь эх сурвалжийг салгах боломжгүй.");
    }

    const list = Array.isArray(webData.sources) ? webData.sources : [];
    const next = list.filter(s => !(s && bridgeText(s.app) === id));
    if (next.length === list.length) return false;

    webData.sources = next;
    delete bridgeChecks[id];
    await saveWebData();

    if (typeof Status !== "undefined" && Status && typeof Status.invalidate === "function") Status.invalidate();
    if (typeof renderWebUI === "function") renderWebUI();
    return true;
}

// ===================== ТӨРӨЛ → МЕТРИК ХОЛБОЛТ =====================
// Шинэ эх сурвалж холбоход түүний event төрөл status.js-ийн METRICS хүснэгтэд
// БАЙХГҮЙ. Тэр үед нотолгоо нь хадгалагдана ч ямар ч тоо гаргахгүй —
// хагас холболт, дэлгэц дээр чимээгүй тэг.
//
// Тиймээс хэрэглэгч төрөл бүрийг метрикт холбож чадах ёстой. Тайлбар нь
// webData.metricMap-д тохиргоо болж сууна (status.js уншина); тоо ХЭЗЭЭ Ч
// хадгалагдахгүй — дүрэм өөрчлөгдвөл бүх түүх дагаж дахин тооцогдоно.

const METRIC_MAP_RULES = ["count", "value", "data"];

// Тухайн аппын нотолгоонд ЯМАР төрлүүд байгаа, тэдгээр нь метрикт
// холбогдсон эсэх. Фийдийг хадгалахгүйгээр — бүгд нотолгооноосоо гарна.
function typeSummaryForApp(app) {
    const entry = (webData && webData.integrations) ? webData.integrations[app] : null;
    if (!entry || typeof entry !== "object") return [];

    const rows = new Map();
    const touch = (type) => {
        if (!rows.has(type)) rows.set(type, { type, count: 0, dataKeys: new Set(), hasValue: false });
        return rows.get(type);
    };

    (Array.isArray(entry.evidence) ? entry.evidence : []).forEach(rec => {
        if (!rec || typeof rec !== "object") return;
        const row = touch(bridgeText(rec.type));
        row.count += 1;
        if (Number(rec.value)) row.hasValue = true;
        if (rec.data && typeof rec.data === "object") {
            Object.keys(rec.data).forEach(k => { if (isFinite(Number(rec.data[k]))) row.dataKeys.add(k); });
        }
    });

    // Түүхий бичлэг нэгтгэгдээд хоосорсон ч төрөл нь хувинд үлдсэн байна —
    // тэднийг алгасвал хуучин эх сурвалж "төрөлгүй" мэт харагдана.
    const rollups = (entry.rollups && typeof entry.rollups === "object") ? entry.rollups : {};
    Object.keys(rollups).forEach(month => {
        const byType = rollups[month];
        if (!byType || typeof byType !== "object") return;
        Object.keys(byType).forEach(type => {
            const bucket = byType[type];
            const row = touch(type);
            row.count += Number(bucket && bucket.count) || 0;
            if (bucket && bucket.dataSums && typeof bucket.dataSums === "object") {
                Object.keys(bucket.dataSums).forEach(k => row.dataKeys.add(k));
            }
        });
    });

    return Array.from(rows.values())
        .map(row => ({
            type: row.type,
            count: row.count,
            dataKeys: Array.from(row.dataKeys).sort(),
            hasValue: row.hasValue,
            // Холбогдсон эсэх — суурь METRICS эсвэл хэрэглэгчийн тайлбараар.
            mapped: !!(typeof metricRuleFor === "function" && metricRuleFor(app, row.type))
        }))
        .sort((a, b) => b.count - a.count);
}

// Хэрэглэгчийн шинэ метрик. Зөвхөн ТОДОРХОЙЛОЛТ үүсгэнэ — тоог нь status.js
// нотолгооноос гаргана.
async function createUserMetric(input) {
    const label = bridgeText(input && input.label);
    if (!label) throw new Error("Метрикийн нэрийг оруулна уу.");

    const attr = bridgeText(input && input.attr).toUpperCase();
    // DISCIPLINE-ыг СОНГУУЛАХГҮЙ: тэр бол "өөрөө мэдээлсэн" тэнхлэг. Гадны
    // аппаас ирсэн батлагдсан тоог тийш нь хийвэл батлагдсан ба батлагдаагүй
    // хоёр НЭГ баганад холилдоно — систем яг үүнийг эсэргүүцдэг.
    const allowed = ["BODY", "MIND", "CREATION"];
    if (allowed.indexOf(attr) === -1) throw new Error("Атрибутыг BODY / MIND / CREATION-оос сонгоно уу.");

    const target30 = Number(input && input.target30);
    if (!isFinite(target30) || target30 <= 0) throw new Error("30 хоногийн зорилт эерэг тоо байх ёстой.");

    const defs = (typeof metricDefs === "function") ? metricDefs() : {};
    let base = `user.${slugifySourceId(label).replace(/-/g, "_")}`;
    let id = base;
    for (let i = 2; defs[id]; i++) id = `${base}_${i}`;

    if (!Array.isArray(webData.metrics)) webData.metrics = [];
    webData.metrics.push({
        id,
        label,
        unit: bridgeText(input && input.unit),
        attr,
        target30,
        addedAt: Date.now()
    });
    await saveWebData();
    return id;
}

// Төрлийг метрикт холбоно (эсвэл mapping = null бол холбоог тайлна).
async function setTypeMapping(app, type, mapping) {
    const appId = bridgeText(app);
    const key   = `${appId}:${bridgeText(type)}`;
    if (!appId) throw new Error("Эх сурвалж танигдсангүй.");

    if (!webData.metricMap || typeof webData.metricMap !== "object" || Array.isArray(webData.metricMap)) {
        webData.metricMap = {};
    }

    if (!mapping) {
        delete webData.metricMap[key];
    } else {
        const metric = bridgeText(mapping.metric);
        if (!metric) throw new Error("Метрикээ сонгоно уу.");

        const rule = METRIC_MAP_RULES.indexOf(mapping.rule) !== -1 ? mapping.rule : "count";
        const row  = { metric, rule };
        if (rule === "data") {
            const dataKey = bridgeText(mapping.key);
            if (!dataKey) throw new Error("data талбарын нэрийг сонгоно уу.");
            row.key = dataKey;
        }
        // Суурь METRICS-д аль хэдийн байгаа төрлийг дарж бичих гэж оролдвол
        // тайлбар нь ХЭРЭГЛЭГДЭХГҮЙ (status.js суурийг үргэлж түрүүлж авдаг).
        // Түүнийг чимээгүй хадгалж, "холбогдлоо" гэж хуурахгүй.
        if (METRICS[key]) throw new Error("Энэ төрөл кодод аль хэдийн тайлбарлагдсан байна.");
        webData.metricMap[key] = row;
    }

    await saveWebData();
    if (typeof Status !== "undefined" && Status && typeof Status.invalidate === "function") Status.invalidate();
    if (typeof renderWebUI === "function") renderWebUI();
    return true;
}

// ===================== ХӨДӨЛГӨГЧ =====================
// Boot-ыг script.js-ийн init() дуудна (loadWebData дууссаны дараа байх ёстой).
// Focus/storage-г энд бүртгэнэ — ингэснээр шинэ апп нэмэхэд script.js хөндөгдөхгүй.

window.addEventListener("focus", () => { syncAll(); });

window.addEventListener("storage", (e) => {
    // Өөрсдийн хадгалалт болон хамаагүй түлхүүрүүдээс болж синк ажиллуулахгүй.
    // fetch төрлийн эх сурвалжид key БАЙХГҮЙ — тэднийг харьцуулалтаас ил гаргана,
    // эс тэгвээс undefined === undefined гэсэн санамсаргүй таарал үүсэж мэднэ.
    if (e && e.key && !listBridgeSources().some(s => s.kind === "local" && s.key === e.key)) return;
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

// ---- Картын хэсгүүд ----

// Холболтын төлөвийн шошго. "Бүдгэрсэн карт" гэдэг нь ХАРИУЛТ БИШ:
// хүн юу эвдэрснийг, эсвэл юу ч эвдрээгүйг мэдэх ёстой.
function connPillHtml(source, entry, check) {
    const kind = (source && source.kind) || "";
    if (kind === "self") return `<span class="conn-pill conn-self">ГАР БҮРТГЭЛ</span>`;

    // Эх сурвалж жагсаалтаас хасагдсан ч нотолгоо нь үлдсэн тохиолдол.
    if (!source) return `<span class="conn-pill conn-off">УНШИХАА БОЛЬСОН</span>`;

    const code = check && check.code;
    if (bridgeCheckSeverity(code) === "wait") return `<span class="conn-pill conn-wait">ХҮЛЭЭГДЭЖ БАЙНА</span>`;

    // `bad-version` нь "ГЭМТСЭН"-ээс ТУСДАА шошготой. Яг энэ ялгааг нэг
    // шошгонд нийлүүлсэн нь Bigu v2 рүү шилжихэд хэрэглэгчийг буруу зүг рүү
    // хөтөлсөн: JSON нь бүтэн, хэлбэр нь зөв, үйлдвэрлэгч талд ЗАСАХ ЮМ
    // БАЙХГҮЙ байсан — уншигч нь хоцорсон. "Фийд гэмтсэн" гэдэг нь тэр
    // хүнийг байхгүй эвдрэл хайлгана.
    if (code === "bad-version") return `<span class="conn-pill conn-bad">ГЭРЭЭ ЗӨРЖ БАЙНА</span>`;
    if (code === "bad-json" || code === "bad-shape") {
        return `<span class="conn-pill conn-bad">ФИЙД ГЭМТСЭН</span>`;
    }
    if (code === "http" || code === "network" || code === "no-fetch") {
        return `<span class="conn-pill conn-bad">ХҮРЭХГҮЙ БАЙНА</span>`;
    }
    if (code === "ok") {
        const updatedAt = Number(entry && entry.updatedAt) || 0;
        const stale = !(updatedAt > 0) || (Date.now() - updatedAt) > CONNECTED_STALE_MS;
        return stale
            ? `<span class="conn-pill conn-stale">ЧИМЭЭГҮЙ</span>`
            : `<span class="conn-pill conn-live">ИДЭВХТЭЙ</span>`;
    }
    return `<span class="conn-pill conn-unknown">ШАЛГААГҮЙ</span>`;
}

// Хаанаас уншиж байгаа, хамгийн сүүлд юу болсон.
function connCheckHtml(source, check) {
    const locator = source ? (source.kind === "fetch" ? source.url : source.key) : "";
    const lines = [];

    if (locator) lines.push(`<div class="conn-locator">${escapeHTML(locator)}</div>`);

    if (check) {
        const when = relativeTime(check.at) || "just now";
        const text = bridgeCheckText(check.code, check.detail);
        const tail = check.code === "ok" && check.events > 0 ? ` · ${check.events} шинэ бичлэг` : "";

        // Урьд нь "ok" биш БҮХ төлөв улаанаар бичигддэг байв — тэр дотор
        // "тэр апп энэ хөтөч дээр хараахан бичээгүй байна" гэсэн ХҮЛЭЭГДЭЖ
        // БАЙГАА төлөв ч орно. Тэр нь эвдрэл биш, зүгээр л хараахан эхлээгүй.
        // Шошго нь хоёрыг ялгаж байхад тайлбар нь ялгахгүй бол карт өөртэйгээ
        // маргана. Улаан нь ЗӨВХӨН үнэхээр эвдэрсэнд.
        const severity = bridgeCheckSeverity(check.code);
        const cls = severity === "bad" ? " conn-check-bad" : (severity === "wait" ? " conn-check-wait" : "");
        lines.push(`<div class="conn-check${cls}">${escapeHTML(text)}${escapeHTML(tail)} · ${escapeHTML(when)}</div>`);
    } else if (source && source.kind !== "self") {
        lines.push(`<div class="conn-check">хараахан уншаагүй</div>`);
    }

    return lines.join("");
}

// Тоо гаргахгүй байгаа төрлүүд + тэднийг метрикт холбох мөр. Энэ бол
// "холбогдсон боловч юу ч болохгүй байна" гэдэг ЧИМЭЭГҮЙ бүтэлгүйтлийг
// дэлгэцэн дээр гаргаж, засах зам нь хажууд нь байхаар тавьж байгаа юм.
const CONNECTED_MAP_ROWS = 5;

function connMapHtml(app) {
    const rows = (typeof typeSummaryForApp === "function" ? typeSummaryForApp(app) : [])
        .filter(row => !row.mapped);
    if (rows.length === 0) return "";

    const defs = (typeof metricDefs === "function") ? metricDefs() : {};
    const ids  = (typeof verifiableMetricIds === "function") ? verifiableMetricIds() : Object.keys(defs);
    const options = ids.map(id => {
        const def = defs[id] || {};
        return `<option value="${escapeHTML(id)}">${escapeHTML(def.label || id)}${def.unit ? " (" + escapeHTML(def.unit) + ")" : ""}</option>`;
    }).join("");

    const shown = rows.slice(0, CONNECTED_MAP_ROWS);
    const rest  = rows.length - shown.length;

    return `
        <div class="conn-map">
            <div class="conn-map-title">${rows.length} төрөл тоо гаргахгүй байна</div>
            ${shown.map(row => {
                const ruleOptions = [`<option value="count">бичлэг тоолох (${row.count})</option>`]
                    .concat(row.hasValue ? [`<option value="value">value талбар</option>`] : [])
                    .concat(row.dataKeys.map(k => `<option value="data:${escapeHTML(k)}">data.${escapeHTML(k)}</option>`))
                    .join("");
                return `
                <div class="conn-map-row" data-app="${escapeHTML(app)}" data-type="${escapeHTML(row.type)}">
                    <div class="conn-map-head">
                        <code>${escapeHTML(row.type || "—")}</code>
                        <span>${row.count.toLocaleString()} бичлэг</span>
                    </div>
                    <div class="conn-map-controls">
                        <select class="conn-map-metric" aria-label="Метрик">
                            <option value="">— метрик сонгох —</option>
                            ${options}
                            <option value="__new__">＋ шинэ метрик үүсгэх</option>
                        </select>
                        <select class="conn-map-rule" aria-label="Тоог хаанаас авах">${ruleOptions}</select>
                        <button type="button" class="submit-btn secondary conn-map-save">Холбох</button>
                    </div>
                    <div class="conn-map-new" hidden>
                        <input type="text"   class="conn-new-label"  placeholder="Метрикийн нэр (ж: Гүйлтийн зам)" maxlength="40">
                        <input type="text"   class="conn-new-unit"   placeholder="Нэгж (км)" maxlength="12">
                        <select class="conn-new-attr" aria-label="Атрибут">
                            <option value="BODY">BODY</option>
                            <option value="MIND">MIND</option>
                            <option value="CREATION">CREATION</option>
                        </select>
                        <input type="number" class="conn-new-target" placeholder="30 хоногийн зорилт" min="1" step="any">
                    </div>
                </div>`;
            }).join("")}
            ${rest > 0 ? `<div class="conn-map-more">…бас ${rest} төрөл</div>` : ""}
        </div>`;
}

function connActionsHtml(source) {
    if (!source) return "";
    const app = escapeHTML(source.app);
    const buttons = [];
    if (source.kind !== "self") {
        buttons.push(`<button type="button" class="data-link conn-resync" data-app="${app}"><i class="spin-glyph">↻</i> Дахин унших</button>`);
    }
    if (source.user) {
        buttons.push(`<button type="button" class="reset-link conn-remove" data-app="${app}">✕ Салгах</button>`);
    }
    return buttons.length ? `<div class="conn-actions">${buttons.join("")}</div>` : "";
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
    // яг ингэж жагсаадаг: жагсаалтаас хасагдсан апп нотолгоогоо хадгалсаар
    // байхад самбараас чимээгүй алга болох ёсгүй.
    const all  = listBridgeSources();
    const apps = all.map(s => s.app);
    Object.keys(integrations).forEach(app => { if (apps.indexOf(app) === -1) apps.push(app); });

    apps.forEach(app => {
        const source = all.find(s => s && s.app === app) || null;
        const entry  = integrations[app];
        const stats  = sources[app] || null;
        const check  = (typeof getBridgeCheck === "function") ? getBridgeCheck(app) : null;
        const label  = (source && source.label) || (stats && stats.label) || app;

        const card = document.createElement("div");
        card.className = "category-card connected-card";
        card.dataset.app = app;

        // Картын өнцгийн туяа — эх сурвалжийн өөрийнх нь өнгө
        // (.category-card::before --tier-color-г ашигладаг).
        if (source && source.hex) card.style.setProperty("--tier-color", source.hex);

        const head = `
            <div class="card-head">
                <h3>${escapeHTML(label)}</h3>
                ${connPillHtml(source, entry, check)}
            </div>`;

        // lastSyncedAt тавигдсан гэдэг нь фийдийг нь наад зах нь нэг удаа
        // амжилттай уншсан гэсэн үг. Хэзээ ч нийтлээгүй бол — алдаа биш,
        // ГЭХДЭЭ ОДОО ЧИМЭЭГҮЙ Ч БИШ: яагаад гэдгийг нь картад бичнэ.
        if (!entry || !entry.lastSyncedAt) {
            const empty = (source && source.kind === "self")
                ? "бүртгэл эхлээгүй"
                : "нотолгоо хараахан ирээгүй";
            card.innerHTML = `
                ${head}
                ${connCheckHtml(source, check)}
                <div class="connected-empty">${escapeHTML(empty)}</div>
                ${connActionsHtml(source)}`;
            container.appendChild(card);
            return;
        }

        const updatedAt = Number(entry.updatedAt);
        const age = isFinite(updatedAt) && updatedAt > 0 ? Date.now() - updatedAt : Infinity;
        if (age > CONNECTED_STALE_MS) card.classList.add("stale");

        card.innerHTML = `
            ${head}
            <div class="connected-time">${escapeHTML(relativeTime(updatedAt) || "no updates yet")}</div>
            ${connCheckHtml(source, check)}
            ${connectedVolumeHtml(stats)}
            ${connMapHtml(app)}
            <div class="connected-status">${connectedStatusHtml(entry.status)}</div>
            <div class="connected-log">${connectedEvidenceHtml(entry.evidence, stats && stats.rolledCount)}</div>
            ${connActionsHtml(source)}`;

        container.appendChild(card);
    });

    renderConnectSummary(status);
}

// Самбарын дээд мөр: хэдэн эх сурвалж уншигдаж байна, хэд нь асуудалтай.
function renderConnectSummary(status) {
    const el = document.getElementById("connect-summary");
    if (!el) return;

    const sources = listBridgeSources().filter(s => s.kind !== "self");
    let live = 0, bad = 0, waiting = 0;
    sources.forEach(s => {
        const check = getBridgeCheck(s.app);
        if (!check) return;
        const severity = bridgeCheckSeverity(check.code);
        if (severity === "ok") live += 1;
        else if (severity === "wait") waiting += 1;
        else bad += 1;
    });

    const parts = [`${live}/${sources.length} уншигдаж байна`];
    if (waiting > 0) parts.push(`${waiting} хүлээгдэж байна`);
    if (bad > 0)     parts.push(`${bad} асуудалтай`);
    el.textContent = parts.join(" · ");
    el.classList.toggle("has-problem", bad > 0);
}

// ===================== САМБАРЫН УДИРДЛАГА =====================
// Товч бүр НЭГ асуултад хариулна: "яагаад ирэхгүй байна вэ", "одоо уншаач",
// "энэ фийдийг холбоё", "энэ төрлийг тоо болгоё". Бүх зүйл делегацаар —
// картууд дахин рендер хийгдэх бүрд сонсогч дахин холбох шаардлагагүй.

function toast(message, variant, color) {
    if (typeof showToast === "function") showToast(message, variant, color);
}

// Шалгалтын үр дүнг хүнд ойлгомжтой болгож хэлнэ.
function describeCheckResult(res) {
    if (!res) return "тодорхойгүй";
    if (res.ok || res.code === "ok") {
        return res.events > 0 ? `${res.events} шинэ нотолгоо ирлээ.` : "уншигдлаа — шинэ нотолгоо алга.";
    }
    if (res.code === "busy") return "синк аль хэдийн явж байна.";
    return bridgeCheckText(res.code, res.detail);
}

document.addEventListener("click", async (e) => {
    const target = e.target;
    if (!target || !target.closest) return;

    // ---- Бүгдийг дахин унших ----
    if (target.closest("#sync-all-btn")) {
        const btn = target.closest("#sync-all-btn");
        btn.disabled = true;
        try {
            const res = await syncAll();
            renderConnectedApps();
            toast(res.events > 0
                ? `${res.events} шинэ нотолгоо ирлээ.`
                : "Бүх эх сурвалж уншигдлаа — шинэ нотолгоо алга.", "info", "var(--accent)");
        } finally {
            btn.disabled = false;
        }
        return;
    }

    // ---- Нэг эх сурвалжийг дахин унших ----
    const resync = target.closest(".conn-resync");
    if (resync) {
        const app = resync.dataset.app;
        resync.disabled = true;
        try {
            const res = await syncSource(app);
            toast(describeCheckResult(res), res.ok ? "info" : "error", res.ok ? "var(--accent)" : undefined);
        } finally {
            resync.disabled = false;
        }
        return;
    }

    // ---- Холбоо салгах ----
    const remove = target.closest(".conn-remove");
    if (remove) {
        const app    = remove.dataset.app;
        const source = findBridgeSource(app);
        const label  = (source && source.label) || app;
        // Нотолгоо үлдэнэ гэдгийг ил хэлнэ — эс тэгвээс хүн устгахаас эмээж,
        // буруу холболтоо үүрд үүрч явна.
        if (!confirm(`"${label}" эх сурвалжийг уншихаа болих уу?\n\nНотолгоо нь ХЭВЭЭР үлдэнэ — зөвхөн шинэ бичлэг татахаа болино.`)) return;
        try {
            await removeBridgeSource(app);
            toast(`"${label}" салгагдлаа. Нотолгоо хэвээр.`, "info", "var(--accent)");
        } catch (err) {
            toast(err && err.message ? err.message : "Салгаж чадсангүй.", "error");
        }
        return;
    }

    // ---- Шинэ эх сурвалжийн форм ----
    if (target.closest("#toggle-source-form")) {
        const form = document.getElementById("source-form");
        if (form) form.style.display = form.style.display === "none" ? "block" : "none";
        return;
    }

    if (target.closest("#source-test-btn")) {
        await testSourceForm();
        return;
    }

    if (target.closest("#source-add-btn")) {
        await submitSourceForm();
        return;
    }

    // ---- Төрлийг метрикт холбох ----
    const save = target.closest(".conn-map-save");
    if (save) {
        await submitTypeMapping(save.closest(".conn-map-row"));
        return;
    }
});

// Шинэ метрик сонгосон эсэхээс хамааран нэмэлт талбарууд гарна.
document.addEventListener("change", (e) => {
    const select = e.target;
    if (!select || !select.classList) return;

    if (select.classList.contains("conn-map-metric")) {
        const row  = select.closest(".conn-map-row");
        const zone = row && row.querySelector(".conn-map-new");
        if (zone) zone.hidden = select.value !== "__new__";
        return;
    }

    // Төрөл солигдоход талбарын утга нь өөр зүйл болно: түлхүүр vs хаяг.
    if (select.id === "source-kind") {
        const input = document.getElementById("source-locator");
        if (input) {
            input.placeholder = select.value === "fetch"
                ? "data/myapp.json эсвэл https://..."
                : "myapp:bridge";
        }
    }
});

// Формоос эх сурвалжийн тодорхойлолтыг барина (хадгалахгүй).
function readSourceForm() {
    const value = id => {
        const el = document.getElementById(id);
        return el && typeof el.value === "string" ? el.value.trim() : "";
    };
    return {
        label:   value("source-label"),
        kind:    value("source-kind") || "local",
        locator: value("source-locator"),
        hex:     value("source-hex")
    };
}

function sourceFormResult(html, bad) {
    const el = document.getElementById("source-form-result");
    if (!el) return;
    el.className = "source-form-result" + (bad ? " bad" : "");
    el.innerHTML = html;
}

// ХАДГАЛАХААС ӨМНӨ уншиж үзнэ. Буруу түлхүүр бичсэн хүн түүнийгээ ХАДГАЛСНЫ
// дараа биш, ЯГ ОДОО мэдэх ёстой.
async function testSourceForm() {
    const input = readSourceForm();
    if (!input.locator) {
        sourceFormResult("Түлхүүр эсвэл хаягаа оруулна уу.", true);
        return;
    }

    const probe = await probeBridgeSource({
        app: "__test__",
        kind: input.kind,
        key:  input.locator,
        url:  input.locator
    });

    if (!probe.ok) {
        sourceFormResult(escapeHTML(bridgeCheckText(probe.code, probe.detail)), true);
        return;
    }

    const feed   = probe.feed;
    const counts = {};
    feed.events.forEach(ev => { counts[ev.type] = (counts[ev.type] || 0) + 1; });
    const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    const when = relativeTime(feed.updatedAt);
    sourceFormResult(`
        <div>✓ Фийд уншигдлаа — ${feed.events.length.toLocaleString()} бичлэг${when ? " · " + escapeHTML(when) : ""}</div>
        ${types.length
            ? `<div class="source-form-types">${types.slice(0, 6).map(t => `<code>${escapeHTML(t)}</code> ${counts[t]}`).join(" · ")}</div>
               <div class="source-form-note">Холбосны дараа төрөл бүрийг метрикт холбоно — эс тэгвээс нотолгоо хадгалагдана ч ямар ч тоо гаргахгүй.</div>`
            : `<div class="source-form-note">Бичлэг алга — гэрээ зөв ч фийд хоосон байна.</div>`}
    `, false);
}

async function submitSourceForm() {
    const input = readSourceForm();
    try {
        const source = await addBridgeSource(input);
        ["source-label", "source-locator"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        sourceFormResult("", false);
        const form = document.getElementById("source-form");
        if (form) form.style.display = "none";
        toast(`"${source.label}" холбогдлоо.`, "info", "var(--accent)");
    } catch (err) {
        sourceFormResult(escapeHTML(err && err.message ? err.message : "Холбож чадсангүй."), true);
    }
}

async function submitTypeMapping(row) {
    if (!row) return;
    const app  = row.dataset.app;
    const type = row.dataset.type;

    const metricSel = row.querySelector(".conn-map-metric");
    const ruleSel   = row.querySelector(".conn-map-rule");
    const choice    = metricSel ? metricSel.value : "";
    const ruleValue = ruleSel ? ruleSel.value : "count";

    // "data:volumeKg" гэсэн нэг утгыг дүрэм + талбар болгон задална.
    const isData  = ruleValue.indexOf("data:") === 0;
    const mapping = {
        rule: isData ? "data" : ruleValue,
        key:  isData ? ruleValue.slice(5) : ""
    };

    try {
        if (!choice) throw new Error("Метрикээ сонгоно уу.");

        mapping.metric = choice === "__new__"
            ? await createUserMetric({
                label:    (row.querySelector(".conn-new-label")  || {}).value,
                unit:     (row.querySelector(".conn-new-unit")   || {}).value,
                attr:     (row.querySelector(".conn-new-attr")   || {}).value,
                target30: (row.querySelector(".conn-new-target") || {}).value
              })
            : choice;

        await setTypeMapping(app, type, mapping);
        toast(`"${type}" метрикт холбогдлоо — тоо нь одооноос гарна.`, "info", "var(--accent)");
    } catch (err) {
        toast(err && err.message ? err.message : "Холбож чадсангүй.", "error");
    }
}
