"use strict";

// ===================== QUEST CORE ACTIONS =====================

async function completeQuest(questId) {
    const quest = webData.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return;
    quest.completed = true;
    quest.completedDate = todayStr();

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
    if (typeof renderWebUI === "function") renderWebUI();
    showToast(`"${quest.title}" биелэв! +${quest.xpReward} EXP 🎯`);
    closeQuestModal();
}

async function resetQuest(questId) {
    const quest = webData.quests.find(q => q.id === questId);
    if (!quest || !quest.completed) return;

    // XP буцааx (repeatable quest дахин хийхэд)
    const cat = webData.categories[quest.category];
    if (cat) {
        cat.currentXp = Math.max(0, cat.currentXp - quest.xpReward);
    }
    addGlobalXp(-quest.xpReward);
    logDailyActivity(-quest.xpReward, true, null, quest.category);

    quest.completed = false;
    quest.completedDate = null;

    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();
    showToast(`"${quest.title}" дахин идэвхжлээ.`);
    closeQuestModal();
}

async function deleteQuest(questId) {
    if (!confirm("Даалгаврыг устгах уу?")) return;
    webData.quests = webData.quests.filter(q => q.id !== questId);
    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();
    closeQuestModal();
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
    if (typeof renderWebUI === "function") renderWebUI();
}

// ===================== QUEST FORM SUBMIT =====================

document.getElementById("submit-quest-btn")?.addEventListener("click", async () => {
    const titleEl    = document.getElementById("quest-title");
    const categoryEl = document.getElementById("quest-category");
    const rankEl     = document.getElementById("quest-rank");
    const metricEl   = document.getElementById("quest-metric");
    const repeatEl   = document.getElementById("quest-repeatable");

    const title    = titleEl.value.trim();
    const category = categoryEl.value;
    const rank     = rankEl.value;

    if (!title)    { showToast("Даалгаврын нэрийг оруулна уу.", "error"); titleEl.focus(); return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); categoryEl.focus(); return; }

    const newQuest = {
        id: Date.now(),
        title, category, rank,
        xpReward:     RANK_XP_MAP[rank] || 20,
        metricReward: parseFloat(metricEl?.value) || 0,
        repeatable:   repeatEl?.checked || false,
        completed:    false,
        completedDate: null
    };
    webData.quests.push(newQuest);
    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();

    titleEl.value = "";
    categoryEl.value = "";
    rankEl.value = "E";
    if (metricEl) metricEl.value = "";
    if (repeatEl) repeatEl.checked = false;

    // Advanced fields хааx
    const adv = document.getElementById("advanced-quest-fields");
    if (adv) adv.style.display = "none";
    const tgl = document.getElementById("toggle-advanced-quest");
    if (tgl) tgl.textContent = "+ Нэмэлт тохиргоо";

    showToast(`"${title}" нэмэгдлээ! +${RANK_XP_MAP[rank] || 20} XP`);

    // Шинэ quest-ийн rank-д тохирсон filter руу шилжих
    setQuestFilter("active");
});

// Advanced toggle
document.getElementById("toggle-advanced-quest")?.addEventListener("click", function () {
    const adv = document.getElementById("advanced-quest-fields");
    if (!adv) return;
    const open = adv.style.display !== "none";
    adv.style.display = open ? "none" : "block";
    this.textContent = open ? "+ Нэмэлт тохиргоо" : "− Нэмэлт тохиргоо";
});

// ===================== FILTER & SORT STATE =====================

let _questFilter = "active"; // "active" | "completed" | "all"
let _questSort   = "newest"; // "newest" | "rank" | "xp" | "category"

function setQuestFilter(f) {
    _questFilter = f;
    document.querySelectorAll(".qfilter-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.filter === f);
    });
    renderQuests();
}

document.addEventListener("click", (e) => {
    const btn = e.target.closest(".qfilter-btn");
    if (btn) setQuestFilter(btn.dataset.filter);
});

document.getElementById("quest-sort")?.addEventListener("change", function () {
    _questSort = this.value;
    renderQuests();
});

// ===================== RENDER: QUEST LIST =====================

const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5 };
const CAT_EMOJI  = { fitness: "💪", learning: "📚", habits: "🔁" };
const CAT_LABEL  = { fitness: "Фитнес", learning: "Сурлага", habits: "Зуршил" };

function getFilteredSortedQuests() {
    let list = webData.quests.slice();

    // Filter
    if (_questFilter === "active")    list = list.filter(q => !q.completed);
    if (_questFilter === "completed") list = list.filter(q =>  q.completed);

    // Sort
    if (_questSort === "newest")   list.reverse();
    if (_questSort === "rank")     list.sort((a, b) => (RANK_ORDER[a.rank] || 9) - (RANK_ORDER[b.rank] || 9));
    if (_questSort === "xp")       list.sort((a, b) => b.xpReward - a.xpReward);
    if (_questSort === "category") list.sort((a, b) => a.category.localeCompare(b.category));

    return list;
}

function renderQuests() {
    const qContainer = document.getElementById("quests-container");
    if (!qContainer) return;
    qContainer.innerHTML = "";

    const list = getFilteredSortedQuests();
    const allCount       = webData.quests.length;
    const activeCount    = webData.quests.filter(q => !q.completed).length;
    const completedCount = webData.quests.filter(q =>  q.completed).length;

    // Update sidebar stats
    const statsEl = document.getElementById("quest-sidebar-stats");
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="qs-stat"><span>${allCount}</span><small>Нийт</small></div>
            <div class="qs-stat"><span style="color:var(--accent)">${activeCount}</span><small>Идэвхтэй</small></div>
            <div class="qs-stat"><span style="color:var(--text-muted)">${completedCount}</span><small>Биелсэн</small></div>
        `;
    }

    // Update filter tab counts
    document.querySelectorAll(".qfilter-btn").forEach(b => {
        const f = b.dataset.filter;
        const cnt = f === "active" ? activeCount : f === "completed" ? completedCount : allCount;
        b.dataset.count = cnt;
    });

    if (list.length === 0) {
        const msgs = {
            active:    { icon: "⚔️", title: "Идэвхтэй даалгавар алга", sub: "Зүүн талд шинэ даалгавар нэмнэ үү." },
            completed: { icon: "🏆", title: "Биелсэн даалгавар алга", sub: "Даалгавраа биелүүлэхэд энд харагдана." },
            all:       { icon: "📋", title: "Даалгавар алга", sub: "Шинэ даалгавар нэмж эхлүүлнэ үү." }
        };
        const m = msgs[_questFilter] || msgs.all;
        qContainer.innerHTML = `
            <div class="empty-state">
                <div style="font-size:40px;margin-bottom:12px;">${m.icon}</div>
                <strong>${m.title}</strong>
                <p style="margin-top:6px;font-size:12px;">${m.sub}</p>
            </div>`;
        return;
    }

    list.forEach(q => {
        const rankColor = TIER_HEX[q.rank] || "#6b7280";
        const catName   = CAT_LABEL[q.category] || q.category;
        const catEmoji  = CAT_EMOJI[q.category] || "";
        const catObj    = webData.categories[q.category];
        const displayName = catObj ? catObj.name : catName;

        const div = document.createElement("div");
        div.className = `quest-card${q.completed ? " completed" : ""}`;
        div.dataset.questId = q.id;

        div.innerHTML = `
            <div class="quest-rank-badge" style="color:${rankColor};border-color:${rankColor}22;">${escapeHTML(q.rank)}</div>
            <div class="quest-info">
                <h4 title="${escapeHTML(q.title)}">${escapeHTML(q.title)}</h4>
                <small>${catEmoji} ${escapeHTML(displayName)} · <span style="color:${rankColor}">+${q.xpReward} XP</span>${q.repeatable ? ' · 🔁' : ''}</small>
            </div>
            <div class="quest-card-actions">
                ${q.completed
                    ? `<span class="done-badge">✓ DONE</span>
                       ${q.repeatable ? `<button class="reset-quest-btn" data-id="${q.id}" title="Дахин хийх">↺</button>` : ''}`
                    : `<button class="complete-btn" data-id="${q.id}">БИЕЛҮҮЛЭХ</button>`
                }
                <button class="delete-btn" data-id="${q.id}" aria-label="Устгах">×</button>
            </div>`;

        // Quest card дарахад detail modal нэмэх (button дарсан бол modal нээхгүй)
        div.addEventListener("click", (e) => {
            if (e.target.closest(".complete-btn") || e.target.closest(".delete-btn") || e.target.closest(".reset-quest-btn")) return;
            openQuestModal(q.id);
        });

        qContainer.appendChild(div);
    });
}

// ===================== QUEST DETAIL MODAL =====================

function openQuestModal(questId) {
    const quest = webData.quests.find(q => q.id === questId);
    if (!quest) return;

    const rankColor = TIER_HEX[quest.rank] || "#6b7280";
    const catObj    = webData.categories[quest.category];
    const catName   = catObj ? catObj.name : quest.category;
    const catEmoji  = CAT_EMOJI[quest.category] || "";

    document.getElementById("qm-rank").textContent    = quest.rank;
    document.getElementById("qm-rank").style.color    = rankColor;
    document.getElementById("qm-rank").style.borderColor = rankColor + "44";
    document.getElementById("qm-title").textContent   = quest.title;
    document.getElementById("qm-meta").textContent    =
        `${quest.completed && quest.completedDate ? `Биелсэн огноо: ${quest.completedDate}` : "Идэвхтэй"}${quest.repeatable ? " · 🔁 Давтагдах" : ""}`;
    document.getElementById("qm-rank-label").textContent = quest.rank + "-Rank";
    document.getElementById("qm-rank-label").style.color  = rankColor;
    document.getElementById("qm-xp").textContent = `+${quest.xpReward}`;
    document.getElementById("qm-cat").textContent = `${catEmoji} ${catName}`;

    // Actions
    const actionsEl = document.getElementById("qm-actions");
    actionsEl.innerHTML = "";

    if (!quest.completed) {
        const completeBtn = document.createElement("button");
        completeBtn.className = "submit-btn";
        completeBtn.style.flex = "1";
        completeBtn.textContent = "⚡ Биелүүлэх";
        completeBtn.onclick = () => completeQuest(quest.id);
        actionsEl.appendChild(completeBtn);
    } else if (quest.repeatable) {
        const resetBtn = document.createElement("button");
        resetBtn.className = "submit-btn secondary";
        resetBtn.style.flex = "1";
        resetBtn.textContent = "↺ Дахин хийх";
        resetBtn.onclick = () => resetQuest(quest.id);
        actionsEl.appendChild(resetBtn);
    } else {
        const doneLabel = document.createElement("div");
        doneLabel.className = "done-badge";
        doneLabel.style.cssText = "flex:1;text-align:center;padding:14px;border-radius:10px;font-size:14px;";
        doneLabel.textContent = "✓ COMPLETED";
        actionsEl.appendChild(doneLabel);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "submit-btn secondary";
    deleteBtn.style.cssText = "color:var(--danger);border-color:var(--danger);padding:14px 20px;flex-shrink:0;";
    deleteBtn.textContent = "Устгах";
    deleteBtn.onclick = () => deleteQuest(quest.id);
    actionsEl.appendChild(deleteBtn);

    document.getElementById("quest-detail-modal").classList.add("active");
}

function closeQuestModal() {
    document.getElementById("quest-detail-modal")?.classList.remove("active");
}

document.getElementById("close-quest-modal-btn")?.addEventListener("click", closeQuestModal);
document.getElementById("quest-detail-modal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("quest-detail-modal")) closeQuestModal();
});

// ===================== RENDER: MISSION TASKS =====================

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

// ===================== DAILY QUEST SYSTEM =====================

const DEFAULT_DAILY_POOL = [
    { id: 'daily_monster', title: "Шидар Цэрэг", description: "Дурын 5 монстр устгах", target: 5, reward: { xp: 50, gold: 20 } },
    { id: 'daily_gold',    title: "Сангийн Эзэн", description: "Тоглоомоос 100 алт цуглуулах", target: 100, reward: { xp: 30, gold: 50 } },
    { id: 'daily_skill',   title: "Эрдмийн Занги", description: "Дурын ур чадварыг 3 удаа ашиглах", target: 3, reward: { xp: 40, gold: 30 } },
    { id: 'daily_complete',title: "Тэргүүлэгч Баатар", description: "Үндсэн 1 даалгавар дуусгах", target: 1, reward: { xp: 60, gold: 40 } }
];

function checkAndGenerateDailyQuests() {
    const today = todayStr();
    const lastResetDate = localStorage.getItem('last_daily_quest_date');

    if (lastResetDate !== today) {
        const newDailyQuests = generateRandomQuests(2);
        try {
            if (window.storage && typeof window.storage.set === "function") {
                window.storage.set('daily_quests_data', JSON.stringify({ date: today, quests: newDailyQuests }), false);
            }
            localStorage.setItem('current_daily_quests', JSON.stringify(newDailyQuests));
            localStorage.setItem('last_daily_quest_date', today);
        } catch(_) {}
        return newDailyQuests;
    } else {
        try {
            const savedQuests = localStorage.getItem('current_daily_quests');
            return savedQuests ? JSON.parse(savedQuests) : [];
        } catch(_) { return []; }
    }
}

function generateRandomQuests(count) {
    const pool = (typeof webData !== 'undefined' && webData.dailyQuests)
        ? webData.dailyQuests
        : DEFAULT_DAILY_POOL;
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(quest => ({
        ...quest,
        progress: 0,
        completed: false,
        createdAt: new Date().getTime()
    }));
}
