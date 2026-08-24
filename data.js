"use strict";

const defaultWebData = {
    // Ангилал бүр НЭГ метрикт холбогдоно. Ахиц нь тэр метрикийн сүүлийн 30 хоног
    // vs зорилт — бодит нэгжээр. Тиер, XP гэсэн хадгалагдах тоо БАЙХГҮЙ.
    //
    // ЗОРИЛТ БОЛОН НЭГЖИЙГ ЭНД ХАДГАЛАХГҮЙ. Тэдгээр нь status.js-ийн METRIC_DEFS-д
    // нэг л удаа бичигдэнэ. Өмнө нь энд targetValue/unit гэсэн ХУУЛБАР сууж
    // байсан: картын тиер тэр хуулбараас, профайлын оноо METRIC_DEFS-ээс
    // тооцогдож, хоёр тоо ЧИМЭЭГҮЙ ЗӨРӨХ зам нээлттэй байв. Одоо метрик холбоотой
    // ангилалын хувьд бүртгэл л ганцаараа шийднэ.
    //
    // Метрик холбоогүй ангилалд (хэрэглэгчийн өөрийн нэмсэн) unit/targetValue
    // талбарыг ХЭВЭЭР дэмжинэ — тэдэнд бүртгэл гэж байхгүй.
    categories: {
        fitness:  { name: "Спорт & Фитнес",   metricId: "gym.volume"     },
        learning: { name: "Хөгжил & Сурлага", metricId: "bigu.reviews"   },
        habits:   { name: "Зуршил & Дадал",   metricId: "bigu.lessons"   },
        creation: { name: "Бүтээл & Код",     metricId: "github.commits" }
    },
    // Даалгавар бол зорилгын жагсаалт. rank нь зөвхөн ЧУХЛЫН ЗЭРЭГ — шагнал биш.
    quests: [
        { id: 1, title: "Өглөө эрт босох",  category: "habits",  rank: "E", completed: false },
        { id: 2, title: "Фитнесст 5км гүйх", category: "fitness", rank: "D", completed: false }
    ],
    // Ур чадвар = { id, name, category, metricId }. Өөр ЮУ Ч хадгалагдахгүй —
    // харагдах тоо бүрийг status.js нотолгооноос гаргана.
    skills: [
        { id: 101, name: "Japanese Language", category: "language",   metricId: "bigu.reviews" },
        { id: 102, name: "Coding",            category: "technology", metricId: null },
        { id: 103, name: "Swimming",          category: "physical",   metricId: null },
        { id: 104, name: "Gym Training",      category: "physical",   metricId: "gym.volume" }
    ],
    // Өдрийн жагсаалт — гараар тэмдэглэдэг, статуст ямар ч нөлөөгүй. Шагнал
    // байхгүй: XP гэж юм системд алга, тиймээс дүр эсгэхээ болив.
    missionTasks: [
        { id: "m1", name: "Drink 2L Water",          completed: false, completedDate: null },
        { id: "m2", name: "Japanese Study (30 min)", completed: false, completedDate: null },
        { id: "m3", name: "Workout (45 min)",        completed: false, completedDate: null }
    ],
    // Холбогдсон аппуудын синк төлөв (зөвхөн унших гүүр). Апп тус бүрд:
    //   { status, updatedAt, evidence: [], rollups: {}, prunedBefore, lastSyncedAt }
    // Контейнерийг bridge.js-ийн getIntegrationState() шаардлагатай үед үүсгэнэ,
    // тиймээс шинэ апп нэмэхэд энд юу ч нэмэх шаардлагагүй.
    integrations: {}
    // Тэмдэглэл: хуучин хадгалагдсан датад webData.legacy байж болно — гар аргын
    // XP-ийн ЦОРЫН ГАНЦ хуулбар. Түүнийг унших код байхгүй, БАС УСТГАХГҮЙ:
    // хадгалагдсан газраа хэвээр үлдэнэ. Шинэ дата түүнийг үүсгэхээ больсон.
};

const TIER_COLORS = { E: "var(--tier-e)", D: "var(--tier-d)", C: "var(--tier-c)", B: "var(--tier-b)", A: "var(--tier-a)", S: "var(--tier-s)" };
const TIER_HEX    = { E: "#6b7280", D: "#0ea5e9", C: "#10b981", B: "#8b5cf6", A: "#f97316", S: "#eab308" };

// Атрибутын өнгө — профайлын багана, радар, спарклайн гурав ижил өнгө хэрэглэнэ.
const ATTR_HEX = { BODY: "#ef4444", MIND: "#8b5cf6", CREATION: "#10b981" };

const SKILL_CAT = {
    language:   { color: "var(--skill-lang)", hex: "#0ea5e9", label: "Хэлний мэдлэг" },
    physical:   { color: "var(--skill-phys)", hex: "#ef4444", label: "Бие бялдар"    },
    mental:     { color: "var(--skill-ment)", hex: "#8b5cf6", label: "Оюуны чадвар" },
    technology: { color: "var(--skill-tech)", hex: "#10b981", label: "Технологи"     }
};

// Дасгалын гүүрийн ур чадварын default id (хуучин датад нөхөж нэмэхэд ашиглана)
const GYM_SKILL_ID = 104;

const STORAGE_KEY = "summerProjectWebData_v4";

/* НЭГ УДААГИЙН ЦЭВЭРЛЭГЭЭ — устгагдсан "өдрийн даалгавар"-ын үлдэгдэл.
   Эдгээр түлхүүр STORAGE_KEY-ийн БЛОБООС ГАДНА, шууд localStorage-д сууж
   байсан тул RESET товч webData-г шинээр босгоод ч тэднийг арилгаж чаддаггүй
   байв — хэрэглэгчийн браузерт мөнхөд үлдэнэ гэсэн үг. Уншигч код БАЙХГҮЙ.
   Хэдэн долоо хоногийн дараа энэ функц болон дуудалтуудыг нь устгаж болно.

   Тэмдэглэл: daily_quests_data нь зөвхөн window.storage руу бичигддэг байсан
   (localStorage руу хэзээ ч биш). Тэр давхарга байхгүй энгийн браузерт энэ мөр
   юу ч олохгүй — хор хөнөөлгүй, найдвартай байхын тулд л жагсаалтад байна. */
const REMOVED_FEATURE_KEYS = ["current_daily_quests", "last_daily_quest_date", "daily_quests_data"];

function sweepRemovedFeatureKeys() {
    REMOVED_FEATURE_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}
let webData = null;

function cloneDefault() { return JSON.parse(JSON.stringify(defaultWebData)); }
function todayStr() { 
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function escapeHTML(str) {
    if (str == null) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Хувийн өөрчлөлтийн тэмдэглэгээ. status.js null буцаана гэдэг нь ӨМНӨХ цонх
// ХООСОН байсан гэсэн үг — тэгвэл одоо утга байвал "шинэ", үгүй бол "—".
// 100% гэж ХЭЗЭЭ Ч зохиохгүй (analytics.js-ийн хуучин алдаа).
function formatDelta(changePct, curr, prev) {
    if (changePct === null || changePct === undefined) {
        return Number(curr) > 0 && !(Number(prev) > 0)
            ? `<span style="color:var(--accent);">шинэ</span>`
            : `<span style="color:var(--text-muted);">—</span>`;
    }
    const n = Number(changePct);
    if (!isFinite(n)) return `<span style="color:var(--text-muted);">—</span>`;
    const color = n > 0 ? "#10b981" : n < 0 ? "#ef4444" : "var(--text-muted)";
    const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "→";
    return `<span style="color:${color};">${arrow} ${n > 0 ? "+" : ""}${n}%</span>`;
}

// ===================== НОТОЛГООНЫ МӨШГӨЛТ =====================
// "Энэ тоо хаанаас гарав?" — метрикийн ард зогсох сүүлийн бичлэгүүд.
// status.js метрик бүрд .recent-ийг гаргалт бүрт шинээр бэлдэж өгдөг.
//
// Систем "42,000 kg" гэж хэлэхдээ ТЭР ТООГ ХЭН ҮҮСГЭСНИЙГ зааж чаддаг байх нь
// "нотолгоонд суурилсан" гэдгийн бодит утга. Заахгүй бол хэрэглэгчийн хувьд
// энэ ч бас л ялгаагүй зохиосон тоо — итгэх, эс итгэхээс өөр сонголтгүй.
function provenanceHtml(metric, limit) {
    const rows = (metric && Array.isArray(metric.recent)) ? metric.recent : [];
    if (rows.length === 0) {
        return `<div class="provenance"><div class="connected-empty">нотолгоо алга</div></div>`;
    }

    const max   = Number(limit) > 0 ? Number(limit) : 6;
    const shown = rows.slice(0, max);
    const unit  = metric.unit ? " " + metric.unit : "";
    // relativeTime() нь bridge.js-д — энэ функц зөвхөн рендерийн үед дуудагддаг
    // тул тэр үед аль хэдийн ачаалагдсан байна. Болгоомжийн үүднээс хамгаална.
    const when  = at => (typeof relativeTime === "function" ? relativeTime(at) : null) || "—";

    return `
        <div class="provenance">
            <div class="provenance-label">НОТОЛГОО // ЭНЭ ТОО ХААНААС ГАРАВ</div>
            ${shown.map(row => `
                <div class="provenance-row">
                    <span class="provenance-when">${escapeHTML(when(row.at))}</span>
                    <span class="provenance-detail">${escapeHTML(row.detail || "—")}</span>
                    <span class="provenance-amount">+${Number(row.amount).toLocaleString()}${escapeHTML(unit)}</span>
                </div>`).join("")}
        </div>`;
}

function showToast(message, variant, color) {
    const container = document.getElementById("toast-container");
    if(!container) return;
    const toast = document.createElement("div");
    toast.className = "toast" + (variant === "error" ? " toast-error" : "");
    if (color) toast.style.borderLeftColor = color;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 350);
    }, 4000);
}

async function loadWebData() {
    sweepRemovedFeatureKeys();
    try {
        let raw = null;
        if (window.storage && typeof window.storage.get === "function") {
            try {
                const result = await window.storage.get(STORAGE_KEY, false);
                raw = result && result.value ? result.value : null;
            } catch (_) {}
        }
        if (!raw) raw = localStorage.getItem(STORAGE_KEY);
        webData = raw ? JSON.parse(raw) : cloneDefault();

        if (!webData.skills)      webData.skills      = cloneDefault().skills;
        if (!webData.quests)      webData.quests      = cloneDefault().quests;
        if (!webData.categories)  webData.categories  = cloneDefault().categories;
        if (!webData.missionTasks) webData.missionTasks = cloneDefault().missionTasks;
        // Холбогдсон аппуудын төлөвийг НЭГ ерөнхий хэлбэрт оруулна — апп тус бүрд
        // тусдаа код бичихгүй. Танигдахгүй талбарууд (ж: gym-ийн awardedByDate)
        // хэвээрээ хоцорно — синк тэдгээрийг уншихаа больсон тул хор хөнөөлгүй.
        if (!webData.integrations || typeof webData.integrations !== "object" || Array.isArray(webData.integrations)) {
            webData.integrations = {};
        }
        Object.keys(webData.integrations).forEach(app => {
            const entry = webData.integrations[app];
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                webData.integrations[app] = {
                    status: null, updatedAt: 0, evidence: [], rollups: {}, prunedBefore: 0, lastSyncedAt: null
                };
                return;
            }
            // log → evidence: байрандаа, ЭВДЭЛГҮЙ нүүлгэнэ. Аль хэдийн evidence-тэй
            // бол ГАР Ч ХҮРЭХГҮЙ — нүүлгэлт хуучин log-оор дарж бичих ёсгүй.
            // xp талбар бүрмөсөн алга: тооцоо нотолгооноос гаргагдана.
            if (Array.isArray(entry.log) && !Array.isArray(entry.evidence)) {
                entry.evidence = entry.log.map(({ xp, ...rest }) => ({ ...rest, data: null }));
            }
            delete entry.log;
            delete entry.syncedIds;
            if (!Array.isArray(entry.evidence)) entry.evidence = [];
            if (!entry.rollups || typeof entry.rollups !== "object" || Array.isArray(entry.rollups)) entry.rollups = {};
            if (typeof entry.prunedBefore !== "number") entry.prunedBefore = 0;
            if (entry.status === undefined)      entry.status    = null;
            if (entry.updatedAt === undefined)   entry.updatedAt = 0;
            if (entry.lastSyncedAt === undefined) entry.lastSyncedAt = null;
        });

        // Ангилал нотолгооны хэлбэрт шилжсэн. Хадгалсан датад ХУУЧИН хэлбэр
        // (currentTier/currentXp/xpToNextTier/currentValue) үлдсэн бол тэр ангиллыг
        // БҮТНЭЭР нь default-оор солино — хагас хуучин, хагас шинэ карт үлдээхгүй.
        const defaultCategories = cloneDefault().categories;
        Object.keys(webData.categories).forEach(key => {
            const cat = webData.categories[key];
            const isLegacy = !cat || typeof cat !== "object" || Array.isArray(cat) || cat.currentTier !== undefined;
            if (!isLegacy) return;

            if (defaultCategories[key]) {
                webData.categories[key] = defaultCategories[key];
                return;
            }
            // Хэрэглэгчийн өөрийн нэмсэн ангилал — default байхгүй. Нэрийг нь ҮЛДЭЭЖ,
            // үхсэн талбаруудыг нь салгана. Хэрэглэгчийн датаг устгахгүй.
            webData.categories[key] = {
                name:        (cat && typeof cat.name === "string") ? cat.name : key,
                metricId:    null,
                unit:        (cat && typeof cat.unit === "string") ? cat.unit : "",
                targetValue: Number(cat && cat.targetValue) || 0
            };
        });

        // Шинэ АНХДАГЧ ангилал (ж: CREATION-ы "Бүтээл & Код") хуучин хадгалсан
        // датад байхгүй. Нөхөж нэмэхгүй бол метрик нь бүрэн ажиллаж байхад
        // Tiers самбар дээр нүх үлдэж, "GitHub тоологдохоо больжээ" мэт харагдана.
        // Ангилал устгах UI байхгүй тул энэ нөхөлт хэрэглэгчийн сонголтыг дарахгүй.
        Object.keys(defaultCategories).forEach(key => {
            if (!webData.categories[key]) webData.categories[key] = defaultCategories[key];
        });

        // Хуучин хадгалсан датад "Gym Training" ур чадвар ирэхгүй тул default-оос нөхөж нэмнэ.
        // (Зөвхөн энэ нэгийг — бусад ур чадварыг хэрэглэгч устгасан бол дахин сэргээхгүй.)
        if (!webData.skills.some(s => s && s.id === GYM_SKILL_ID)) {
            const gymSkill = cloneDefault().skills.find(s => s.id === GYM_SKILL_ID);
            if (gymSkill) webData.skills.push(gymSkill);
        }

        // Ур чадвар нотолгооны эх сурвалжтайгаа metricId-аар холбогдоно. Хуучин
        // датад байхгүй тул нөхөж тавина. Хуучин level/totalXp зэрэг талбарууд
        // хадгалагдсан газраа үлдэнэ — уншигдахгүй тул хор хөнөөлгүй.
        webData.skills.forEach(s => {
            if (!s || typeof s !== "object") return;
            if (typeof s.metricId !== "string" || !s.metricId) s.metricId = null;
        });

        webData.missionTasks.forEach(t => {
            // Хуучин датаас үлдсэн үхсэн талбарууд. xpReward нь юунд ч хөрвөхөө
            // больсон; autoCompleted нь "автоматаар тэмдэглэгдсэн, XP аваагүй"
            // гэсэн утгатай байсан — XP байхгүй болохоор ялгаа нь ч алга.
            delete t.xpReward;
            delete t.autoCompleted;
            if (t.completedDate && t.completedDate !== todayStr()) {
                t.completed = false;
                t.completedDate = null;
            }
        });
    } catch (err) {
        console.error("loadWebData error:", err);
        webData = cloneDefault();
    }
}

async function saveWebData() {
    const serialized = JSON.stringify(webData);
    // Нотолгоо хуримтлагдсаар байх тул хэмжээг нь хардана. ТАСЛАХГҮЙ — зөвхөн
    // сануулна: нотолгоог хаях нь дээд давхаргын түүхийг устгахтай адил.
    if (serialized.length > 4000000) console.warn("[storage] webData is", serialized.length, "bytes");
    try {
        if (window.storage && typeof window.storage.set === "function") {
            await window.storage.set(STORAGE_KEY, serialized, false);
        } else {
            localStorage.setItem(STORAGE_KEY, serialized);
        }
    } catch (err) {
        console.error("saveWebData error:", err);
        showToast("Дата хадгалахад алдаа гарлаа.", "error");
    }
}

/* Task A-аас хойш XP нэмдэг, түвшин тавьдаг функц энэ кодын баазад БАЙХГҮЙ.
   logDailyActivity(), addGlobalXp(), advanceCategoryTier() гурвыг устгав —
   дуудагчгүй үлдсэн ч гэсэн буцаж холбогдох зам нээлттэй байх ёсгүй.
   Статусын тоо бүр status.js дотор нотолгооноос ГАРГАЖ АВАГДАНА.
   Түвшин, цол, мастери, тиерийн XP гэсэн ойлголт энэ кодын баазад БАЙХГҮЙ. */
