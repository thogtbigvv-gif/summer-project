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
        { id: 103, name: "Swimming",          category: "physical",   level: 2, currentXp: 75,  xpToNextLevel: 120, totalXp: 175,  streak: 0, lastTrainDate: null }
    ],
    missionTasks: [
        { id: "m1", name: "Drink 2L Water",        xpReward: 30, completed: false, completedDate: null },
        { id: "m2", name: "Japanese Study (30 min)", xpReward: 50, completed: false, completedDate: null },
        { id: "m3", name: "Workout (45 min)",       xpReward: 40, completed: false, completedDate: null }
    ],
    history: {}
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

        webData.skills.forEach(s => {
            if (s.lastTrainDate === undefined) s.lastTrainDate = null;
            // Хуучин буруу xpToNextLevel-г формулаар засах
            const expectedXp = Math.floor(100 * Math.pow(1.2, s.level - 1));
            if (s.xpToNextLevel !== expectedXp) s.xpToNextLevel = expectedXp;
        });

        webData.missionTasks.forEach(t => {
            if (t.completedDate && t.completedDate !== todayStr()) {
                t.completed = false;
                t.completedDate = null;
            }
        });

        const today = todayStr();
        if (!webData.history[today]) {
            webData.history[today] = { totalXp: 0, questsCompleted: 0, categoryXp: {}, skillXp: {} };
        }
    } catch (err) {
        console.error("loadWebData error:", err);
        webData = cloneDefault();
    }
}

async function saveWebData() {
    const serialized = JSON.stringify(webData);
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

function logDailyActivity(xp, isQuest, skillId, catId) {
    const today = todayStr();
    if (!webData.history[today]) {
        webData.history[today] = { totalXp: 0, questsCompleted: 0, categoryXp: {}, skillXp: {} };
    }
    let log = webData.history[today];
    
    log.totalXp += xp;
    if (log.totalXp < 0) log.totalXp = 0;

    if (isQuest && xp > 0) log.questsCompleted += 1;
    if (isQuest && xp < 0) log.questsCompleted = Math.max(0, log.questsCompleted - 1);
    
    if (skillId) {
        log.skillXp[skillId] = (log.skillXp[skillId] || 0) + xp;
        if (log.skillXp[skillId] < 0) log.skillXp[skillId] = 0;
    }
    if (catId) {
        log.categoryXp[catId] = (log.categoryXp[catId] || 0) + xp;
        if (log.categoryXp[catId] < 0) log.categoryXp[catId] = 0;
    }
}

function addGlobalXp(amount) {
    const p = webData.player;
    p.currentXp += amount;
    
    while (p.currentXp < 0) {
        if (p.level > 1) {
            p.level -= 1;
            // Level-up томьёо: floor(xp * 1.3), тиймээс буцаахдаа floor(xp / 1.3) ашиглана
            p.xpToNextLevel = Math.floor(p.xpToNextLevel / 1.3);
            p.currentXp += p.xpToNextLevel;
        } else {
            p.currentXp = 0;
            break;
        }
    }
    
    while (p.currentXp >= p.xpToNextLevel) {
        p.currentXp -= p.xpToNextLevel;
        p.level += 1;
        p.xpToNextLevel = Math.floor(p.xpToNextLevel * 1.3);
        showToast(`ШИНЭ ЦОЛ: LEVEL ${p.level} → [${getMilitaryRank(p.level)}] 🎉`, "info", "#fff");
    }
}

function advanceCategoryTier(cat) {
    const tierIdx = TIERS.indexOf(cat.currentTier);
    if (tierIdx === -1 || tierIdx === TIERS.length - 1) return;
    while (cat.currentXp >= cat.xpToNextTier && TIERS.indexOf(cat.currentTier) < TIERS.length - 1) {
        cat.currentXp -= cat.xpToNextTier;
        const nextTierIdx = TIERS.indexOf(cat.currentTier) + 1;
        cat.currentTier = TIERS[nextTierIdx];
        cat.xpToNextTier = TIER_XP[cat.currentTier] || Infinity;
        showToast(`Ангилал тиер ахиллаа! → ${cat.currentTier}-Tier 🏆`, "info", TIER_HEX[cat.currentTier]);
    }
}
