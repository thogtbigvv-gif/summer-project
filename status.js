"use strict";

// ===================== СТАТУС: ЗӨВХӨН НОТОЛГООНООС ГАРГАНА =====================
// Энэ давхарга webData руу ЮУ Ч БИЧИХГҮЙ, saveWebData()-г ХЭЗЭЭ Ч дуудахгүй.
// Цорын ганц төлөв нь санах ойн кэш (Status.invalidate() түүнийг хаяна).
//
// Тоо бүр БОДИТ НЭГЖ эсвэл бодит зорилтын хувь. XP, түвшин, оноо БАЙХГҮЙ —
// статус "42kg → 50kg, +19%" гэж ярина, "+250 XP" гэж ХЭЗЭЭ Ч ярихгүй.
//
// Бүх тоо ямар ч агшинд нотолгооноос ДАХИН тооцогдоно. Тиймээс дүрэм буруу байвал
// энд НЭГ МӨР засахад БҮХ ТҮҮХ буцаж зөв болно. Гаргасан тоог webData-д хадгалбал
// яг энэ шинж чанар үхнэ — тиймээс хадгалахгүй. Кэш зөвхөн санах ойд, хаягдах ёстой.
//
// Нотолгоо огт байхгүй бол БҮРЭН, БҮХ НЬ ТЭГ үр дүн гарна. Хэзээ ч алдаа шидэхгүй.

// ===================== МЕТРИКИЙН БҮРТГЭЛ =====================
// Event-ийн төрлийг ТАЙЛБАРЛАДАГ ЦОРЫН ГАНЦ газар. Шинэ эх сурвалж нэмэх =
// эдгээр хүснэгтэд мөр нэмэх, өөр ХААНА Ч код хөндөхгүй.
//
// amount(e)     — түүхий нотолгооны бичлэгээс бодит нэгжийг гаргана.
// fromRollup(b) — нэгтгэсэн хувингаас (rollups) ЯГ ИЖИЛ нэгжийг гаргана. Хувинд
//                 { count, valueSum, dataSums, firstAt, lastAt } үлддэг: dataSums
//                 нь event.data-гийн тоон талбар бүрийн нийлбэр, тиймээс volumeKg
//                 мэтийн нэгж 180 хоногийн дараа ч сэргээгддэг.
//                 Функц нь null буцаах эрхтэй = "энэ хувингаас сэргээх аргагүй"
//                 (ж: dataSums нэвтрэхээс өмнө нэгтгэгдсэн хуучин хувин). Тэр
//                 тохиолдолд 0 нэмнэ, гэхдээ чимээгүй алга болохгүй:
//                 overall.rollupGaps-д бүртгэгдээд Аналитик таб дээр гарна.
const METRICS = {
    "gym:workout.completed": { metric: "gym.volume",   amount: e => num(e.data && e.data.volumeKg), fromRollup: b => fromDataSum(b, "volumeKg") },
    "gym:workout.partial":   { metric: "gym.volume",   amount: e => num(e.data && e.data.volumeKg), fromRollup: b => fromDataSum(b, "volumeKg") },
    "bigu:review.session":   { metric: "bigu.reviews", amount: e => num(e.value),                   fromRollup: b => num(b.valueSum) },
    "bigu:lesson.quiz":      { metric: "bigu.lessons", amount: () => 1,                             fromRollup: b => num(b.count) },
    "github:commit.pushed":  { metric: "github.commits", amount: () => 1,                            fromRollup: b => num(b.count) }
};

const METRIC_DEFS = {
    "gym.volume":   { label: "Volume lifted",    unit: "kg",      attr: "BODY", target30: 40000 },
    "bigu.reviews": { label: "Cards reviewed",   unit: "cards",   attr: "MIND", target30: 900   },
    "bigu.lessons": { label: "Lessons finished", unit: "lessons", attr: "MIND", target30: 20    },
    "github.commits": { label: "Commits", unit: "commits", attr: "CREATION", target30: 60 }
};

// Метрикгүй атрибут ч гэсэн үр дүнд БАЙНА (score 0) — дэлгэц дээр нүх үлдээхгүй.
const ATTRIBUTE_ORDER = ["BODY", "MIND", "CREATION"];

const SERIES_DAYS = 365;      // series-ийн урт: сүүлийн жил, тэгээр дүүргэсэн
const RECENT_EVIDENCE = 12;   // метрик бүрд хадгалах "энэ тоо хаанаас гарав" мөрийн тоо

// Хувин доторх data.<key>-ийн нийлбэрийг гаргана (bridge.js-ийн rollUpEvidence
// event.data-гийн ТООН талбар бүрийг ингэж хураадаг). Хувинд dataSums байхгүй —
// өөрөөр хэлбэл dataSums нэвтрэхээс ӨМНӨ нэгтгэгдсэн хуучин хувин — бол null
// буцаана: "энэ хувингаас бодит нэгжийг сэргээх боломжгүй" гэсэн үг бөгөөд
// дуудагч түүнийг 0 гэж ЧИМЭЭГҮЙ нөхөхгүй, rollupGaps-д ил бүртгэнэ.
function fromDataSum(bucket, key) {
    const sums = bucket && bucket.dataSums;
    if (!sums || typeof sums !== "object") return null;
    const value = Number(sums[key]);
    return isFinite(value) ? value : null;
}

// ===================== ЖИЖИГ ТУСЛАХУУД =====================

function num(value) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
}

function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

// Хөвөгч цэгийн үлдэгдэл тоо цэвэрлэх (4200.0000000001 → 4200).
function tidy(value) {
    return Math.round(num(value) * 100) / 100;
}

// ХУВИЙН ӨӨРЧЛӨЛТИЙН ДҮРЭМ. Өмнөх нь 0 бол хувь гэж ЮМ БАЙХГҮЙ — null буцаана
// (дуудагч нь "new" эсвэл "—" гэж харуулна). 100%-ийг ХЭЗЭЭ Ч зохиохгүй.
function pctChange(curr, prev) {
    const c = num(curr);
    const p = num(prev);
    if (p > 0) return Math.round(((c - p) / p) * 100);
    return null;   // prev === 0 — curr > 0 ч бай, 0 ч бай
}

// Орон нутгийн огноо — todayStr()-тэй ижил хазайлтын арга.
function dayKeyOf(ms) {
    const d = new Date(num(ms));
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function monthKeyOf(ms) {
    return dayKeyOf(ms).slice(0, 7);
}

// Сүүлийн `count` хоногийн түлхүүр — хуучнаас нь, өнөөдрөөр төгсөнө.
function pastDayKeys(count) {
    const keys = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        d.setDate(d.getDate() - i);
        keys.push(d.toISOString().slice(0, 10));
    }
    return keys;
}

function sumDays(daily, dayKeys) {
    let total = 0;
    for (const key of dayKeys) total += num(daily[key]);
    return tidy(total);
}

// ===================== ХООСОН ЯС =====================

function emptyMetric(id, dayKeys) {
    const def = METRIC_DEFS[id] || {};
    return {
        id,
        label:    typeof def.label === "string" ? def.label : id,
        unit:     typeof def.unit  === "string" ? def.unit  : "",
        attr:     typeof def.attr  === "string" ? def.attr  : "",
        target30: num(def.target30),
        daily:    {},
        series:   dayKeys.map(date => ({ date, value: 0 })),
        monthly:  [],
        total: 0, last7: 0, prev7: 0, last30: 0, prev30: 0, last90: 0,
        change7Pct: null, change30Pct: null,
        pct30: 0,
        best: null,
        activeDays30: 0, streakDays: 0, lastActiveAt: 0,
        // Энэ тоог үүсгэсэн СҮҮЛИЙН бичлэгүүд — "тоо хаанаас гарав" гэдгийг
        // дэлгэц дээр буцааж харуулах зам. Гаргалт бүрт шинээр цуглуулагдана.
        recent: []
    };
}

function emptyStatus(generatedAt) {
    const dayKeys = pastDayKeys(SERIES_DAYS);
    const metrics = {};
    Object.keys(METRIC_DEFS).forEach(id => { metrics[id] = emptyMetric(id, dayKeys); });
    return {
        generatedAt,
        metrics,
        attributes: buildAttributes(metrics),
        sources: {},
        overall: { activeDays30: 0, totalEvents: 0, firstEvidenceAt: 0, unmappedTypes: [], rollupGaps: [] }
    };
}

// ===================== АТРИБУТ =====================
// Оноо = "30 хоногийн БОДИТ зорилтод хэр ойрхон вэ", "хэдэн нүд дарав" биш.

function buildAttributes(metrics) {
    const names = ATTRIBUTE_ORDER.slice();
    Object.keys(METRIC_DEFS).forEach(id => {
        const attr = METRIC_DEFS[id] && METRIC_DEFS[id].attr;
        if (attr && names.indexOf(attr) === -1) names.push(attr);
    });

    const attributes = {};
    names.forEach(name => {
        const ids = Object.keys(metrics).filter(id => metrics[id].attr === name);

        let pctSum = 0, last30 = 0, prev30 = 0;
        ids.forEach(id => {
            pctSum += num(metrics[id].pct30);
            last30 += num(metrics[id].last30);
            prev30 += num(metrics[id].prev30);
        });

        attributes[name] = {
            score:       ids.length > 0 ? Math.round(pctSum / ids.length) : 0,
            change30Pct: pctChange(last30, prev30),
            metrics:     ids
        };
    });
    return attributes;
}

// ===================== ГОЛ ГАРГАЛТ =====================

function deriveStatus() {
    const generatedAt = Date.now();
    try {
        return buildStatus(generatedAt);
    } catch (err) {
        // Статус ХЭЗЭЭ Ч унахгүй — гэмтсэн дата бүхэл дэлгэцийг унагаах ёсгүй.
        console.error("deriveStatus error:", err);
        try {
            return emptyStatus(generatedAt);
        } catch (fatal) {
            console.error("deriveStatus fallback error:", fatal);
            return { generatedAt, metrics: {}, attributes: {}, sources: {},
                     overall: { activeDays30: 0, totalEvents: 0, firstEvidenceAt: 0, unmappedTypes: [], rollupGaps: [] } };
        }
    }
}

function buildStatus(generatedAt) {
    const dayKeys = pastDayKeys(SERIES_DAYS);
    const win = {
        last7:  dayKeys.slice(-7),
        prev7:  dayKeys.slice(-14, -7),
        last30: dayKeys.slice(-30),
        prev30: dayKeys.slice(-60, -30),
        last90: dayKeys.slice(-90)
    };

    const integrations = (typeof webData !== "undefined" && webData &&
                          webData.integrations && typeof webData.integrations === "object")
        ? webData.integrations
        : {};

    // Метрик бүрийн хоосон ясыг эхлээд босгоно — нотолгоо байхгүй ч бүтэн үр дүн гарна.
    const metrics = {};
    Object.keys(METRIC_DEFS).forEach(id => { metrics[id] = emptyMetric(id, dayKeys); });

    // Дагалдах (үр дүнд ордоггүй) хуримтлуулагчид
    const eventDays   = {};   // metricId -> Set(<огноо>)  — "тэр өдөр юм болсон уу"
    const rollupTotal = {};   // metricId -> нэгтгэсэн сараас ирсэн нийлбэр
    const rollupMonth = {};   // metricId -> { "YYYY-MM": утга }

    function metricFor(id) {
        if (!metrics[id]) metrics[id] = emptyMetric(id, dayKeys);   // бүртгэлд байхгүй метрик
        if (!eventDays[id])   eventDays[id]   = new Set();
        if (!rollupMonth[id]) rollupMonth[id] = {};
        if (rollupTotal[id] === undefined) rollupTotal[id] = 0;
        return metrics[id];
    }
    Object.keys(metrics).forEach(metricFor);

    const unmapped   = new Set();
    const rollupGaps = [];
    const sources    = {};
    const overallDays = new Set();
    let totalEvents     = 0;
    let firstEvidenceAt = 0;

    const bridgeSources = (typeof BRIDGE_SOURCES !== "undefined" && Array.isArray(BRIDGE_SOURCES))
        ? BRIDGE_SOURCES
        : [];
    const staleMs = (typeof CONNECTED_STALE_MS === "number" && CONNECTED_STALE_MS > 0)
        ? CONNECTED_STALE_MS
        : 3 * 24 * 60 * 60 * 1000;

    // Тохируулгад бичигдсэн эх сурвалж бүр, мөн датад л байгаа нь ч — хоёуланг нь.
    const apps = [];
    bridgeSources.forEach(s => { if (s && s.app && apps.indexOf(s.app) === -1) apps.push(s.app); });
    Object.keys(integrations).forEach(app => { if (apps.indexOf(app) === -1) apps.push(app); });

    const last30Set = new Set(win.last30);

    apps.forEach(app => {
        const entry  = integrations[app];
        const state  = (entry && typeof entry === "object" && !Array.isArray(entry)) ? entry : {};
        const source = bridgeSources.find(s => s && s.app === app);

        const evidence = Array.isArray(state.evidence) ? state.evidence : [];
        let appEvents = 0;
        let last30Count = 0;

        evidence.forEach(rec => {
            if (!rec || typeof rec !== "object") return;

            appEvents += 1;
            const at   = num(rec.at);
            const date = dayKeyOf(at);
            if (at > 0 && (firstEvidenceAt === 0 || at < firstEvidenceAt)) firstEvidenceAt = at;
            if (last30Set.has(date)) last30Count += 1;
            overallDays.add(date);

            const key = `${app}:${typeof rec.type === "string" ? rec.type : ""}`;
            const row = METRICS[key];
            if (!row || !row.metric) { unmapped.add(key); return; }

            const metric = metricFor(row.metric);
            let amount = 0;
            try {
                amount = num(typeof row.amount === "function" ? row.amount(rec) : 0);
            } catch (err) {
                console.warn(`METRICS["${key}"].amount алдаа —`, err);
                amount = 0;
            }

            metric.daily[date] = tidy(num(metric.daily[date]) + amount);
            eventDays[row.metric].add(date);
            if (at > metric.lastActiveAt) metric.lastActiveAt = at;

            metric.recent.push({
                at, app, date,
                detail: (typeof rec.detail === "string" && rec.detail) ? rec.detail : (rec.type || ""),
                amount: tidy(amount)
            });
        });

        // Нэгтгэсэн хувингууд — өдрийн нарийвчлалгүй, зөвхөн total/monthly-д ордог.
        const rollups = (state.rollups && typeof state.rollups === "object" && !Array.isArray(state.rollups))
            ? state.rollups
            : {};
        let rolledCount = 0;

        Object.keys(rollups).forEach(month => {
            const byType = rollups[month];
            if (!byType || typeof byType !== "object") return;

            Object.keys(byType).forEach(type => {
                const bucket = byType[type];
                if (!bucket || typeof bucket !== "object") return;

                const count = num(bucket.count);
                rolledCount += count;
                appEvents   += count;

                const firstAt = num(bucket.firstAt);
                if (firstAt > 0 && (firstEvidenceAt === 0 || firstAt < firstEvidenceAt)) firstEvidenceAt = firstAt;

                const key = `${app}:${type}`;
                const row = METRICS[key];
                if (!row || !row.metric) { unmapped.add(key); return; }

                const metric = metricFor(row.metric);
                const lastAt = num(bucket.lastAt);
                if (lastAt > metric.lastActiveAt) metric.lastActiveAt = lastAt;

                if (typeof row.fromRollup !== "function") {
                    rollupGaps.push({ app, type, month, count, metric: row.metric });
                    return;
                }

                // fromRollup null буцаах нь ЗӨВШӨӨРӨГДСӨН хариулт: "энэ хувингаас
                // бодит нэгжийг сэргээх аргагүй". Тэр үед 0 нэмнэ — гэхдээ
                // ЧИМЭЭГҮЙ биш: rollupGaps-д бүртгэгдээд дэлгэц дээр гарна.
                let amount = null;
                try {
                    amount = row.fromRollup(bucket);
                } catch (err) {
                    console.warn(`METRICS["${key}"].fromRollup алдаа —`, err);
                    amount = null;
                }
                if (amount === null || amount === undefined || !isFinite(Number(amount))) {
                    rollupGaps.push({ app, type, month, count, metric: row.metric });
                    return;
                }
                amount = num(amount);

                rollupTotal[row.metric] = tidy(num(rollupTotal[row.metric]) + amount);
                rollupMonth[row.metric][month] = tidy(num(rollupMonth[row.metric][month]) + amount);
            });
        });

        const updatedAt = num(state.updatedAt);
        sources[app] = {
            label: (source && source.label) ? source.label : app,
            updatedAt,
            // Тухайн апп ХЭЗЭЭ НЭГЭН ЦАГТ мэдээлсэн бүхэн: түүхий + нэгтгэсэн.
            // Нэгтгэснийг хасвал тоо цаг хугацаанд агшиж, түүхийг худал харуулна.
            evidenceCount: evidence.length + rolledCount,
            // UI "идэвхгүй" гэж худал хэлэхгүйн тулд хоёуланг нь ил гаргана:
            // түүхий бичлэг нь нэгтгэгдээд хоосорсон ч түүх алга болоогүй.
            rawCount:    evidence.length,
            rolledCount,
            last30Count,
            stale: !(updatedAt > 0) || (generatedAt - updatedAt) > staleMs
        };
        totalEvents += appEvents;
    });

    // ---- Метрик бүрийг дуусгах ----
    Object.keys(metrics).forEach(id => {
        const metric = metrics[id];
        const daily  = metric.daily;
        const days   = eventDays[id] || new Set();

        metric.series = dayKeys.map(date => ({ date, value: num(daily[date]) }));

        metric.last7  = sumDays(daily, win.last7);
        metric.prev7  = sumDays(daily, win.prev7);
        metric.last30 = sumDays(daily, win.last30);
        metric.prev30 = sumDays(daily, win.prev30);
        metric.last90 = sumDays(daily, win.last90);

        metric.change7Pct  = pctChange(metric.last7,  metric.prev7);
        metric.change30Pct = pctChange(metric.last30, metric.prev30);

        // Нийт: түүхий өдрүүд + нэгтгэсэн сарууд.
        let rawTotal = 0;
        Object.keys(daily).forEach(date => { rawTotal += num(daily[date]); });
        metric.total = tidy(rawTotal + num(rollupTotal[id]));

        // Сараар: түүхий өдрүүдээс + нэгтгэсэн хувингаас, аль аль нь нэг хүснэгтэд.
        const months = {};
        Object.keys(daily).forEach(date => {
            const month = date.slice(0, 7);
            months[month] = num(months[month]) + num(daily[date]);
        });
        const rolled = rollupMonth[id] || {};
        Object.keys(rolled).forEach(month => { months[month] = num(months[month]) + num(rolled[month]); });
        metric.monthly = Object.keys(months).sort().map(month => ({ month, value: tidy(months[month]) }));

        // Хамгийн сайн өдөр — утга нь 0 бол "хамгийн сайн" гэж ярих утгагүй.
        let best = null;
        Object.keys(daily).forEach(date => {
            const value = num(daily[date]);
            if (value > 0 && (!best || value > best.value)) best = { date, value: tidy(value) };
        });
        metric.best = best;

        metric.activeDays30 = win.last30.filter(date => days.has(date)).length;

        // Цуврал: өнөөдрөөс (эсвэл өдөр дуусаагүй бол өчигдрөөс) ухарч тоолно.
        let i = dayKeys.length - 1;
        if (!days.has(dayKeys[i])) i -= 1;
        let streak = 0;
        for (; i >= 0 && days.has(dayKeys[i]); i--) streak += 1;
        metric.streakDays = streak;

        metric.pct30 = metric.target30 > 0
            ? tidy(clamp(0, 100, (metric.last30 / metric.target30) * 100))
            : 0;

        // Шинийг нь дээр нь — сүүлийн хэдэн бичлэг л дэлгэцэнд хэрэгтэй.
        metric.recent.sort((a, b) => b.at - a.at);
        if (metric.recent.length > RECENT_EVIDENCE) metric.recent.length = RECENT_EVIDENCE;
    });

    return {
        generatedAt,
        metrics,
        attributes: buildAttributes(metrics),
        sources,
        overall: {
            activeDays30:    win.last30.filter(date => overallDays.has(date)).length,
            totalEvents,
            firstEvidenceAt,
            // Үйлдвэрлэгч шинэ төрөл гаргавал чимээгүй алга болохгүй, ЭНД харагдана.
            unmappedTypes:   Array.from(unmapped).sort(),
            rollupGaps
        }
    };
}

// ===================== КЭШ =====================
// Санах ойд л байна. webData-д ХЭЗЭЭ Ч хүрэхгүй — тиймээс хаясан ч ямар ч
// мэдээлэл алдагдахгүй, дараагийн get() бүгдийг нотолгооноос дахин гаргана.

let _cache    = null;
let _cacheDay = "";

const Status = {
    get() {
        // Кэш нь ямар ӨДӨР гаргагдсаныг санана. Шөнө дундыг өнгөрөхөд "сүүлийн
        // 30 хоног" гэсэн цонх өөрөө шилждэг тул өчигдрийн гаргалт худал болно —
        // таб нээлттэй хэвээр байсан ч. Тиймээс өдөр солигдсоныг мэдээд дахин гаргана.
        const day = dayKeyOf(Date.now());
        if (!_cache || _cacheDay !== day) {
            _cache    = deriveStatus();
            _cacheDay = day;
        }
        return _cache;
    },
    invalidate() { _cache = null; _cacheDay = ""; }
};

window.Status = Status;
