"use strict";

const defaultWebData = {
    player: { level: 1, currentXp: 0, xpToNextLevel: 300 },
    categories: {
        fitness:  { name: "Спорт & Фитнес",   unit: "км",   currentValue: 0, targetValue: 50,  currentTier: "E", currentXp: 0, xpToNextTier: 100 },
        learning: { name: "Хөгжил & Сурлага", unit: "цаг",  currentValue: 0, targetValue: 100, currentTier: "E", currentXp: 0, xpToNextTier: 100 },
        habits:   { name: "Зуршил & Дадал",   unit: "өдөр", currentValue: 0, targetValue: 30,  currentTier: "E", currentXp: 0, xpToNextTier: 100 }
    },
    quests: [
        { id: 1, title: "Өглөө эрт босох",  category: "habits",  rank: "E", xpReward: 20,  metricReward: 1, completed: false },
        { id: 2, title: "Фитнесст 5км гүйх", category: "fitness", rank: "D", xpReward: 40, metricReward: 5, completed: false }
    ],
    skills: [
        { id: 101, name: "Japanese Language", category: "language",   level: 3, currentXp: 120, xpToNextLevel: 144, totalXp: 420,  streak: 2, lastTrainDate: null },
        { id: 102, name: "Coding",            category: "technology", level: 5, currentXp: 0,   xpToNextLevel: 207, totalXp: 1540, streak: 5, lastTrainDate: null },
        { id: 103, name: "Swimming",          category: "physical",   level: 2, currentXp: 75,  xpToNextLevel: 120, totalXp: 175,  streak: 0, lastTrainDate: null },
        { id: 104, name: "Gym Training",      category: "physical",   level: 1, currentXp: 0,   xpToNextLevel: 100, totalXp: 0,    streak: 0, lastTrainDate: null }
    ],
    missionTasks: [
        { id: "m1", name: "Drink 2L Water",        xpReward: 30, completed: false, completedDate: null, autoCompleted: false },
        { id: "m2", name: "Japanese Study (30 min)", xpReward: 50, completed: false, completedDate: null, autoCompleted: false },
        { id: "m3", name: "Workout (45 min)",       xpReward: 40, completed: false, completedDate: null, autoCompleted: false }
    ],
    history: {},
    // Холбогдсон аппуудын синк төлөв (зөвхөн унших гүүр). Апп тус бүрд:
    //   { status, updatedAt, evidence: [], rollups: {}, prunedBefore, lastSyncedAt }
    // Контейнерийг bridge.js-ийн getIntegrationState() шаардлагатай үед үүсгэнэ,
    // тиймээс шинэ апп нэмэхэд энд юу ч нэмэх шаардлагагүй.
    integrations: {},
    // Task A: гар аргаар хуримтлуулсан ур чадварын XP/түвшний СҮҮЛИЙН зураг.
    // Нэг л удаа бичигдээд цаашид УНШИГДАХГҮЙ — устгасангүй, зүгээр л
    // идэвхгүй болсон. { capturedAt, totals: { <skillId>: {...} } }
    legacy: null
};

const TIERS     = ["E", "D", "C", "B", "A", "S"];
const TIER_XP   = { E: 100, D: 250, C: 500, B: 1000, A: 2000, S: Infinity };
const TIER_COLORS = { E: "var(--tier-e)", D: "var(--tier-d)", C: "var(--tier-c)", B: "var(--tier-b)", A: "var(--tier-a)", S: "var(--tier-s)" };
const TIER_HEX    = { E: "#6b7280", D: "#0ea5e9", C: "#10b981", B: "#8b5cf6", A: "#f97316", S: "#eab308" };
const RANK_XP_MAP = { E: 20, D: 40, C: 80, B: 150, A: 300, S: 600 };

const SKILL_CAT = {
    language:   { color: "var(--skill-lang)", hex: "#0ea5e9", label: "Хэлний мэдлэг" },
    physical:   { color: "var(--skill-phys)", hex: "#ef4444", label: "Бие бялдар"    },
    mental:     { color: "var(--skill-ment)", hex: "#8b5cf6", label: "Оюуны чадвар" },
    technology: { color: "var(--skill-tech)", hex: "#10b981", label: "Технологи"     }
};

// Дасгалын гүүрийн ур чадварын default id (хуучин датад нөхөж нэмэхэд ашиглана)
const GYM_SKILL_ID = 104;

const STORAGE_KEY = "summerProjectWebData_v4";
let webData = null;

function cloneDefault() { return JSON.parse(JSON.stringify(defaultWebData)); }
function todayStr() { 
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function getMilitaryRank(level) {
    if (level <  5) return "Байлдагч (Private)";
    if (level < 10) return "Дэд түрүүч (Corporal)";
    if (level < 15) return "Түрүүч (Sergeant)";
    if (level < 20) return "Ахлагч (Staff Sergeant)";
    if (level < 30) return "Дэслэгч (Lieutenant)";
    if (level < 50) return "Ахмад (Captain)";
    return "Генерал (General)";
}

function getSkillMasteryRank(level) {
    if (level < 10) return "Novice";
    if (level < 25) return "Apprentice";
    if (level < 50) return "Adept";
    if (level < 80) return "Expert";
    return "Master";
}

function escapeHTML(str) {
    if (str == null) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

        if (!webData.player)      webData.player      = cloneDefault().player;
        if (!webData.skills)      webData.skills      = cloneDefault().skills;
        if (!webData.quests)      webData.quests      = cloneDefault().quests;
        if (!webData.categories)  webData.categories  = cloneDefault().categories;
        if (!webData.missionTasks) webData.missionTasks = cloneDefault().missionTasks;
        if (!webData.history)     webData.history     = {};
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

        // Эхний хөрөөдөлт диск дээр тогтох ёстой — эс тэгвээс ачаалал бүрт
        // дахин "шинээр" авагдаж, capturedAt нь утгагүй болно.
        const legacyCaptured = captureLegacySkillTotals();

        // Хуучин хадгалсан датад "Gym Training" ур чадвар ирэхгүй тул default-оос нөхөж нэмнэ.
        // (Зөвхөн энэ нэгийг — бусад ур чадварыг хэрэглэгч устгасан бол дахин сэргээхгүй.)
        if (!webData.skills.some(s => s && s.id === GYM_SKILL_ID)) {
            const gymSkill = cloneDefault().skills.find(s => s.id === GYM_SKILL_ID);
            if (gymSkill) webData.skills.push(gymSkill);
        }

        webData.skills.forEach(s => {
            if (s.lastTrainDate === undefined) s.lastTrainDate = null;
            // Хуучин буруу xpToNextLevel-г формулаар засах
            const expectedXp = Math.floor(100 * Math.pow(1.2, s.level - 1));
            if (s.xpToNextLevel !== expectedXp) s.xpToNextLevel = expectedXp;
        });

        webData.missionTasks.forEach(t => {
            // autoCompleted: XP олгогдоогүй, автоматаар тэмдэглэгдсэн даалгавар
            if (t.autoCompleted === undefined) t.autoCompleted = false;
            if (t.completedDate && t.completedDate !== todayStr()) {
                t.completed = false;
                t.completedDate = null;
                t.autoCompleted = false;
            }
        });

        const today = todayStr();
        if (!webData.history[today]) {
            webData.history[today] = { totalXp: 0, questsCompleted: 0, categoryXp: {}, skillXp: {} };
        }

        if (legacyCaptured) await saveWebData();
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

/* Task A — гар аргын XP-г НЭГ УДАА хөрөөдөж авах.
   Ур чадвар бүрийн одоогийн нийлбэрийг webData.legacy.skills-д хуулаад
   дараа нь хэзээ ч уншихгүй. Хэрэглэгчийн ямар ч өгөгдөл устгагдахгүй:
   skills[] дэх талбарууд байрандаа үлдэнэ, зүгээр л идэвхгүй болно.
   Аль хэдийн авсан бол дахин бичихгүй — эх зураг нь ганц удаагийнх. */
function captureLegacySkillTotals() {
    if (webData.legacy && webData.legacy.skills) return false;

    const totals = {};
    (webData.skills || []).forEach(s => {
        if (!s || s.id === undefined) return;
        totals[s.id] = {
            name:          s.name,
            category:      s.category,
            level:         s.level,
            currentXp:     s.currentXp,
            xpToNextLevel: s.xpToNextLevel,
            totalXp:       s.totalXp,
            streak:        s.streak,
            lastTrainDate: s.lastTrainDate
        };
    });

    if (!webData.legacy || typeof webData.legacy !== "object") webData.legacy = {};
    webData.legacy.skills = { capturedAt: Date.now(), totals };
    return true;   // дуудагч тал үүнийг НЭГ УДАА диск рүү бичнэ
}

/* Task A-аас хойш XP нэмдэг, түвшин тавьдаг функц энэ кодын баазад БАЙХГҮЙ.
   logDailyActivity(), addGlobalXp(), advanceCategoryTier() гурвыг устгав —
   дуудагчгүй үлдсэн ч гэсэн буцаж холбогдох зам нээлттэй байх ёсгүй.
   Статусын тоо бүр status.js дотор нотолгооноос ГАРГАЖ АВАГДАНА. */
