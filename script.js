"use strict";

// Event Delegation (Нийтлэг товчнууд)
document.addEventListener("click", async (e) => {
    const completeBtn = e.target.closest(".complete-btn");
    const deleteBtn   = e.target.closest(".delete-btn");

    if (completeBtn) await completeQuest(Number(completeBtn.dataset.id));
    if (deleteBtn) {
        const id = Number(deleteBtn.dataset.id);
        if (deleteBtn.dataset.type === "skill") await deleteSkill(id);
        else await deleteQuest(id);
    }
});

document.addEventListener("click", async (e) => {
    const task = e.target.closest(".mission-task[data-task-id]");
    if (task && !e.target.closest(".delete-btn") && !e.target.closest(".complete-btn")) {
        await toggleMissionTask(task.dataset.taskId);
    }
});

// Tab Navigation
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", function () {
        const targetId = this.dataset.tab;
        if (!targetId) return;
        document.querySelectorAll(".tab-btn").forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
        });
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        this.classList.add("active");
        this.setAttribute("aria-selected", "true");
        document.getElementById(targetId).classList.add("active");
        
        if (targetId === 'analytics-tab') {
            AnalyticsEngine.renderDashboard();
        }
    });
});

// Системийг анхны төлөвт шилжүүлэх
document.getElementById("reset-btn")?.addEventListener("click", async () => {
    if (!confirm("Бүх зүйлсийг устгаад анхны төлөвт шилжүүлэх үү?")) return;
    webData = cloneDefault();
    await saveWebData();
    renderWebUI();
    showToast("Амжилттай шинэчиллээ.");
});

// Category Renderer
function renderCategories() {
    const catContainer = document.getElementById("categories-container");
    if (!catContainer) return;

    catContainer.innerHTML = "";
    for (const key in webData.categories) {
        const cat       = webData.categories[key];
        const tierColor = TIER_COLORS[cat.currentTier] || "var(--tier-e)";
        const tierHex   = TIER_HEX[cat.currentTier]   || "#6b7280";
        const progressPct = cat.currentTier === "S" ? 100 : (cat.xpToNextTier > 0
            ? Math.min((cat.currentXp / cat.xpToNextTier) * 100, 100)
            : 100);

        const card = document.createElement("div");
        card.className = "category-card";
        card.style.setProperty("--tier-color", tierColor);
        card.dataset.tier = cat.currentTier;
        card.innerHTML = `
            <div class="card-head">
                <h3>${escapeHTML(cat.name)}</h3>
                <div class="tier-pill" style="color:${tierHex}">${escapeHTML(cat.currentTier)}</div>
            </div>
            <div class="xp-row">
                <span>TIER XP</span>
                <span>${cat.currentTier === "S" ? "MAX" : `${cat.currentXp} / ${cat.xpToNextTier}`}</span>
            </div>
            <div class="progress-bg">
                <div class="progress-bar" style="width:${progressPct}%;background:${tierHex};box-shadow:0 0 8px ${tierHex};"></div>
            </div>
            <div class="progress-meta">
                Бодит ахиц: <strong>${Number(cat.currentValue).toFixed(1)} ${escapeHTML(cat.unit)}</strong> / ${cat.targetValue} ${escapeHTML(cat.unit)}
            </div>`;
        catContainer.appendChild(card);
    }
}

// Үндсэн UI-г Render хийх мастер функц
function renderWebUI() {
    const p = webData.player;

    document.getElementById("player-rank").textContent    = `Цол: ${getMilitaryRank(p.level)}`;
    document.getElementById("global-level").textContent   = p.level;
    document.getElementById("global-xp-text").textContent = `${p.currentXp} / ${p.xpToNextLevel}`;
    
    const globalPct = p.xpToNextLevel > 0 ? Math.min((p.currentXp / p.xpToNextLevel) * 100, 100) : 0;
    document.getElementById("global-xp-bar").style.width  = `${globalPct}%`;

    // Бусад модулиудын render-үүдийг дуудах
    if(typeof renderMissionTasks === "function") renderMissionTasks();
    renderCategories();
    if(typeof renderQuests === "function") renderQuests();
    if(typeof renderSkills === "function") renderSkills();
    if(typeof renderAttributesRadar === "function") renderAttributesRadar();
    
    // Хэрэв Analytics tab идэвхтэй байвал шууд шинэчлэнэ
    const analyticsTab = document.getElementById('analytics-tab');
    if (analyticsTab && analyticsTab.classList.contains('active')) {
        AnalyticsEngine.renderDashboard();
    }
}

// Ачаалж эхлэх
async function init() {
    try {
        await loadWebData();
    } catch (err) {
        console.error("init error:", err);
        webData = cloneDefault();
    }
    // Өдөр бүрийн автомат даалгавруудыг шалгах
    if (typeof checkAndGenerateDailyQuests === "function") {
        checkAndGenerateDailyQuests();
    }
    renderWebUI();
}

// App-ийг асаах
init();
