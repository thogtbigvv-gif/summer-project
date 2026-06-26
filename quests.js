"use strict";

async function completeQuest(questId) {
    const quest = webData.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return;
    quest.completed = true;
    const cat = webData.categories[quest.category];
    if (cat) {
        cat.currentXp += quest.xpReward;
        const metric = Number(quest.metricReward) || 0;
        if (metric > 0) cat.currentValue = Math.min(cat.currentValue + metric, cat.targetValue * 12);
        advanceCategoryTier(cat);
    }
    addGlobalXp(quest.xpReward);
    logDailyActivity(quest.xpReward, true, null, quest.category);
    
    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();
    showToast(`"${quest.title}" биелэв! +${quest.xpReward} EXP`);
}

async function deleteQuest(questId) {
    if (!confirm("Даалгаврыг устгах уу?")) return;
    webData.quests = webData.quests.filter(q => q.id !== questId);
    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();
}

async function toggleMissionTask(taskId) {
    const task = webData.missionTasks.find(t => t.id === taskId);
    if (!task) return;

    if (!task.completed) {
        task.completed = true;
        task.completedDate = todayStr();
        addGlobalXp(task.xpReward);
        logDailyActivity(task.xpReward, false, null, null);
        showToast(`"${task.name}" — амжилттай! +${task.xpReward} EXP ✓`, "info", "var(--accent)");
    } else {
        task.completed = false;
        task.completedDate = null;
        addGlobalXp(-task.xpReward);
        logDailyActivity(-task.xpReward, false, null, null);
    }

    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();
}

// Event Binding: Form submit
document.getElementById("submit-quest-btn")?.addEventListener("click", async () => {
    const titleEl    = document.getElementById("quest-title");
    const categoryEl = document.getElementById("quest-category");
    const rankEl     = document.getElementById("quest-rank");
    const metricEl   = document.getElementById("quest-metric");

    const title    = titleEl.value.trim();
    const category = categoryEl.value;
    const rank     = rankEl.value;

    if (!title)    { showToast("Даалгаврын нэрийг оруулна уу.", "error"); titleEl.focus();    return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); categoryEl.focus(); return; }

    const newQuest = {
        id: Date.now(),
        title, category, rank,
        xpReward:     RANK_XP_MAP[rank] || 20,
        metricReward: parseFloat(metricEl.value) || 0,
        completed: false
    };
    webData.quests.push(newQuest);
    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();

    titleEl.value = "";
    categoryEl.value = "";
    rankEl.value = "E";
    metricEl.value = "";
    showToast("Даалгавар бүртгэгдлээ.");
});

// Rendering Logics for Quests & Tasks
function renderQuests() {
    const qContainer = document.getElementById("quests-container");
    if (!qContainer) return;
    qContainer.innerHTML = "";
    const sorted = webData.quests.slice().reverse();
    if (sorted.length === 0) {
        qContainer.innerHTML = `<div class="empty-state"><strong>Даалгавар алга</strong>Зүүн талд шинэ даалгавар нэмнэ үү.</div>`;
    } else {
        sorted.forEach(q => {
            const div = document.createElement("div");
            div.className = `quest-card${q.completed ? " completed" : ""}`;
            div.innerHTML = `
                <button class="delete-btn" data-id="${q.id}" aria-label="Устгах">×</button>
                <div class="quest-rank-badge" style="color:${TIER_HEX[q.rank] || "#6b7280"}">${escapeHTML(q.rank)}</div>
                <div class="quest-info">
                    <h4 title="${escapeHTML(q.title)}">${escapeHTML(q.title)}</h4>
                    <small>+${q.xpReward} XP • ${escapeHTML(webData.categories[q.category] ? webData.categories[q.category].name : q.category)}</small>
                </div>
                ${q.completed
                    ? `<span class="done-badge">COMPLETED ✓</span>`
                    : `<button class="complete-btn" data-id="${q.id}">БИЕЛҮҮЛЭХ</button>`
                }`;
            qContainer.appendChild(div);
        });
    }
}

function renderMissionTasks() {
    const list = document.getElementById("mission-tasks-list");
    if (!list) return;

    const tasks = webData.missionTasks;
    const completedCount = tasks.filter(t => t.completed).length;
    const totalXp        = tasks.reduce((s, t) => s + t.xpReward, 0);
    const earnedXp       = tasks.filter(t => t.completed).reduce((s, t) => s + t.xpReward, 0);
    const pct            = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    const progEl = document.getElementById("mission-progress-text");
    if (progEl) progEl.textContent = `${completedCount} / ${tasks.length} (${pct}%)`;
    const rewEl = document.getElementById("mission-reward-text");
    if (rewEl) rewEl.textContent = `+${earnedXp} / ${totalXp} EXP`;
    const metaEl = document.getElementById("mission-meta-status");
    if (metaEl) {
        metaEl.textContent = completedCount === tasks.length ? "OBJECTIVE: COMPLETE ✓" : "OBJECTIVE: ACTIVE";
        metaEl.className = "mission-meta" + (completedCount === tasks.length ? " complete" : "");
    }

    list.innerHTML = "";
    tasks.forEach(t => {
        const el = document.createElement("div");
        el.className = `mission-task${t.completed ? " completed" : ""}`;
        el.dataset.taskId = t.id;
        el.innerHTML = `
            <div class="task-box"></div>
            <div class="task-name">${escapeHTML(t.name)}</div>
            <span class="task-xp">+${t.xpReward} XP</span>`;
        list.appendChild(el);
    });
}
// ==========================================
// ШИНЭЭР НЭМЭХ ХЭСЭГ: АВТОМАТ DAILY QUEST СИСТЕМ
// ==========================================

// 1. Хэрэв data.js дээр бэлэн сан байхгүй бол ашиглах нөөц даалгаврууд (Цол хэргэмээр нэрлэсэн)
const DEFAULT_DAILY_POOL = [
    { id: 'daily_monster', title: "Шидар Цэрэг", description: "Дурын 5 монстр устгах", target: 5, reward: { xp: 50, gold: 20 } },
    { id: 'daily_gold', title: "Сангийн Эзэн", description: "Тоглоомоос 100 алт цуглуулах", target: 100, reward: { xp: 30, gold: 50 } },
    { id: 'daily_skill', title: "Эрдмийн Занги", description: "Дурын ур чадварыг 3 удаа ашиглах", target: 3, reward: { xp: 40, gold: 30 } },
    { id: 'daily_complete', title: "Тэргүүлэгч Баатар", description: "Үндсэн 1 даалгавар дуусгах", target: 1, reward: { xp: 60, gold: 40 } }
];

/**
 * Өдөр бүр шинэ даалгавар автоматаар үүсгэх эсэхийг шалгаж, удирдах үндсэн функц
 * ЗАСВАР: localStorage-д хадгалах ключийг нэгдмэл болголоо (window.storage/localStorage аль ч байсан)
 */
function checkAndGenerateDailyQuests() {
    const today = todayStr();
    // Огноог ҮРГЭЛЖ localStorage-аас уншина — нэгдмэл байдлыг хангана
    const lastResetDate = localStorage.getItem('last_daily_quest_date');

    if (lastResetDate !== today) {
        const newDailyQuests = generateRandomQuests(2);

        // Шинэ даалгавруудыг хадгалах
        try {
            if (window.storage && typeof window.storage.set === "function") {
                window.storage.set('daily_quests_data', JSON.stringify({ date: today, quests: newDailyQuests }), false);
            }
            // Огноог ҮРГЭЛЖ localStorage-д бичнэ — check логик зөв ажиллахын тулд
            localStorage.setItem('current_daily_quests', JSON.stringify(newDailyQuests));
            localStorage.setItem('last_daily_quest_date', today);
        } catch(_) {}

        return newDailyQuests;
    } else {
        // Өнөөдөр аль хэдийн үүссэн даалгавар байгаа бол санах ойгоос уншина
        try {
            const savedQuests = localStorage.getItem('current_daily_quests');
            return savedQuests ? JSON.parse(savedQuests) : [];
        } catch(_) { return []; }
    }
}

/**
 * Сангаас санамсаргүйгээр даалгавар сонгох туслах функц
 * ЗАСВАР: gameData → webData болгон засав (gameData тодорхойлогдоогүй байсан)
 */
function generateRandomQuests(count) {
    // ЗАСВАР: 'gameData' байхгүй — зөв нэр 'webData'. webData.dailyQuests байвал авна, байхгүй бол нөөц санг ашиглана
    const pool = (typeof webData !== 'undefined' && webData.dailyQuests)
        ? webData.dailyQuests
        : DEFAULT_DAILY_POOL;

    // Даалгавруудыг санамсаргүйгээр холих (Shuffle)
    const shuffled = [...pool].sort(() => 0.5 - Math.random());

    // Шаардлагатай тооноор таслан авч, явцыг (progress) 0-ээр эхлүүлнэ
    return shuffled.slice(0, count).map(quest => ({
        ...quest,
        progress: 0,
        completed: false,
        createdAt: new Date().getTime()
    }));
}
