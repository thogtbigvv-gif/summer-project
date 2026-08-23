"use strict";

// ===================== ДААЛГАВРЫН ТӨЛӨВ =====================
// Даалгавар ХОЁР төрөлтэй:
//
//   ГАРААР — хэрэглэгч өөрөө тэмдэглэдэг жагсаалт. Статуст ямар ч нөлөөгүй,
//   ямар ч шагнал байхгүй. Хуучин бүх даалгавар яг ийм хэвээр үлдэнэ.
//
//   НОТОЛГООГООР — метрикт холбогдож 30 хоногийн зорилт зарлана. Биелсэн
//   эсэхийг ХЭН Ч ДАРДАГГҮЙ: холбогдсон аппуудын бодит нотолгоо зорилтод
//   хүрсэн эсэхээс ГАРГАГДАНА. Тиймээс худал тэмдэглэх зам байхгүй.
//
// Систем дэх бусад тоо бүр яг ийм дүрмээр амьдардаг байсан — статус, тиер,
// атрибут, ур чадвар бүгд нотолгооноос. Даалгавар л ганцаараа "дарвал болов"
// гэсэн ертөнцөд үлдсэн байв. Одоо тэр ялгаа арилав.
//
// Гаргалт нь webData руу ЮУ Ч БИЧИХГҮЙ: quest.completed нь гараар
// тэмдэглэсэн даалгаврынх л, нотолгоотойд нь хүрэхгүй.

function questProgress(quest, status) {
    const metricId = (quest && typeof quest.metricId === "string") ? quest.metricId : null;
    const target   = Number(quest && quest.targetValue) || 0;
    const metric   = (metricId && status && status.metrics) ? status.metrics[metricId] : null;

    // Метрик бүртгэлээс хасагдсан, эсвэл зорилт утгагүй бол даалгавар
    // "нотолгоотой" гэж ДҮР ЭСГЭХГҮЙ — гараар удирдагдах руу буцна.
    if (!metric || target <= 0) {
        return {
            verified: false, metric: null,
            value: 0, target: 0, pct: 0,
            done: !!(quest && quest.completed)
        };
    }

    const value = Number(metric.last30) || 0;
    const pct   = Math.max(0, Math.min(100, (value / target) * 100));
    return { verified: true, metric, value, target, pct, done: value >= target };
}

// Даалгавар бүрийг төлөвтэй нь хамт. Дэлгэцийн бүх хэсэг (жагсаалт, тоолуур,
// шүүлтүүр, modal) ЯГ ЭНЭ нэг гаргалтаас тэжээгдэнэ — хооронд нь зөрөхгүй.
function questsWithProgress() {
    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const list   = Array.isArray(webData.quests) ? webData.quests : [];
    return list.map(quest => ({ quest, progress: questProgress(quest, status) }));
}

// ===================== QUEST CORE ACTIONS =====================

// Гараар тэмдэглэх нь ЗӨВХӨН гар аргын даалгаварт хамаарна. Нотолгоотой
// даалгаврыг дарж "биелүүлэх" боломжгүй байх нь алдаа биш — гол санаа нь тэр.
function guardManualQuest(quest) {
    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    if (!questProgress(quest, status).verified) return true;
    showToast("Энэ даалгаврыг нотолгоо шийднэ — гараар тэмдэглэх боломжгүй.", "error");
    return false;
}

async function completeQuest(questId) {
    const quest = webData.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return;
    if (!guardManualQuest(quest)) return;

    quest.completed = true;
    quest.completedDate = todayStr();

    // Даалгавар бол зорилгын жагсаалт — статуст ямар ч нөлөөгүй (Task A).
    // XP, тиер, өдрийн лог руу юу ч бичихгүй.

    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();
    showToast(`"${quest.title}" биелэв 🎯`);
    closeQuestModal();
}

async function resetQuest(questId) {
    const quest = webData.quests.find(q => q.id === questId);
    if (!quest || !quest.completed) return;
    if (!guardManualQuest(quest)) return;

    // Буцаах XP байхгүй — даалгавар олгодог ч үгүй байсан (Task A).
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

    // Өдрийн даалгавар ч мөн адил зүгээр л жагсаалт — статуст нөлөөлөхгүй.
    if (!task.completed) {
        task.completed = true;
        task.completedDate = todayStr();
        showToast(`"${task.name}" — амжилттай ✓`, "info", "var(--accent)");
    } else {
        task.completed = false;
        task.completedDate = null;
    }

    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();
}

// ===================== QUEST FORM SUBMIT =====================

document.getElementById("submit-quest-btn")?.addEventListener("click", async () => {
    const titleEl    = document.getElementById("quest-title");
    const categoryEl = document.getElementById("quest-category");
    const rankEl     = document.getElementById("quest-rank");
    const repeatEl   = document.getElementById("quest-repeatable");
    const metricEl   = document.getElementById("quest-metric");
    const targetEl   = document.getElementById("quest-target");

    const title    = titleEl.value.trim();
    const category = categoryEl.value;
    const rank     = rankEl.value;
    const metricId = (metricEl && metricEl.value) ? metricEl.value : null;
    const target   = Number(targetEl && targetEl.value) || 0;

    if (!title)    { showToast("Даалгаврын нэрийг оруулна уу.", "error"); titleEl.focus(); return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); categoryEl.focus(); return; }

    // Нотолгоонд холбогдсон даалгавар ЗААВАЛ зорилттой байна: зорилтгүй бол
    // "хүрсэн эсэх" гэдэг асуулт утгагүй болж, даалгавар мөнхөд идэвхтэй үлдэнэ.
    if (metricId && !(target > 0)) {
        showToast("Нотолгоонд холбосон даалгаварт 30 хоногийн зорилт хэрэгтэй.", "error");
        targetEl?.focus();
        return;
    }

    // Даалгавар статуст ЯМАР Ч нөлөөгүй — шагнал ч, бодит ахиц ч бичихгүй.
    // rank нь зөвхөн чухлын зэргийн шошго.
    //
    // metricId + targetValue тавигдсан бол биелэлтийг нь ХЭН Ч дарахгүй:
    // questProgress() түүнийг нотолгооноос гаргана.
    const newQuest = {
        id: Date.now(),
        title, category, rank,
        repeatable:   repeatEl?.checked || false,
        completed:    false,
        completedDate: null,
        metricId,
        targetValue:  metricId ? target : 0
    };
    webData.quests.push(newQuest);
    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();

    titleEl.value = "";
    categoryEl.value = "";
    rankEl.value = "E";
    if (repeatEl) repeatEl.checked = false;
    if (metricEl) metricEl.value = "";
    if (targetEl) targetEl.value = "";

    // Advanced fields хааx
    const adv = document.getElementById("advanced-quest-fields");
    if (adv) adv.style.display = "none";
    const tgl = document.getElementById("toggle-advanced-quest");
    if (tgl) tgl.textContent = "+ Нэмэлт тохиргоо";

    showToast(`"${title}" нэмэгдлээ.`);

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
let _questSort   = "newest"; // "newest" | "rank" | "category"

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
const CAT_EMOJI  = { fitness: "💪", learning: "📚", habits: "🔁", creation: "💻" };
const CAT_LABEL  = { fitness: "Фитнес", learning: "Сурлага", habits: "Зуршил", creation: "Бүтээл" };

// Ангилалын сонголтыг webData.categories-ээс барина. Өмнө нь index.html дотор
// гурван мөр ГАРААР бичээстэй байсан тул шинэ ангилал нэмэхэд (ж: "Бүтээл &
// Код") форм түүнийг мэдэхгүй хоцордог байв. Одоо жагсаалт нэг эх сурвалжтай.
function renderQuestCategoryOptions() {
    const select = document.getElementById("quest-category");
    if (!select) return;

    const keep = select.value;
    const cats = (webData && webData.categories) ? webData.categories : {};
    select.innerHTML = `<option value="" disabled${keep ? "" : " selected"}>Сонгох...</option>` +
        Object.keys(cats).map(key => {
            const name  = (cats[key] && cats[key].name) ? cats[key].name : (CAT_LABEL[key] || key);
            const emoji = CAT_EMOJI[key] || "•";
            return `<option value="${escapeHTML(key)}">${escapeHTML(emoji + " " + name)}</option>`;
        }).join("");
    if (keep && cats[keep]) select.value = keep;
}

// Нотолгооны эх сурвалжийн сонголт — ур чадварын формтой ЯГ ижил бүртгэлээс
// (status.js → METRIC_DEFS). Метрик нэмэхэд энд юу ч засахгүй.
function renderQuestMetricOptions() {
    const select = document.getElementById("quest-metric");
    if (!select) return;

    const defs = (typeof METRIC_DEFS !== "undefined" && METRIC_DEFS) ? METRIC_DEFS : {};
    const keep = select.value;

    select.innerHTML = `<option value="">— гараар тэмдэглэх —</option>` +
        Object.keys(defs).map(id => {
            const def  = defs[id] || {};
            const text = `${def.label || id}${def.unit ? ` (${def.unit})` : ""}`;
            return `<option value="${escapeHTML(id)}">${escapeHTML(text)}</option>`;
        }).join("");

    if (keep && defs[keep]) select.value = keep;
}

// Шүүлт, эрэмбэ хоёр ГАРГАСАН төлөв дээр ажиллана: нотолгоотой даалгаврын
// "биелсэн" нь quest.completed-д БИЧИГДДЭГГҮЙ тул хадгалагдсан талбараар
// шүүвэл тэд мөнхөд "идэвхтэй" талд үлдэх байсан.
function getFilteredSortedQuests() {
    let list = questsWithProgress();

    // Filter
    if (_questFilter === "active")    list = list.filter(x => !x.progress.done);
    if (_questFilter === "completed") list = list.filter(x =>  x.progress.done);

    // Sort
    if (_questSort === "newest")   list.reverse();
    if (_questSort === "rank")     list.sort((a, b) => (RANK_ORDER[a.quest.rank] || 9) - (RANK_ORDER[b.quest.rank] || 9));
    if (_questSort === "category") list.sort((a, b) => String(a.quest.category).localeCompare(String(b.quest.category)));

    return list;
}

function renderQuests() {
    renderQuestCategoryOptions();
    renderQuestMetricOptions();

    const qContainer = document.getElementById("quests-container");
    if (!qContainer) return;
    qContainer.innerHTML = "";

    const list = getFilteredSortedQuests();
    const all  = questsWithProgress();
    const allCount       = all.length;
    const activeCount    = all.filter(x => !x.progress.done).length;
    const completedCount = all.filter(x =>  x.progress.done).length;

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

    list.forEach(({ quest: q, progress }) => {
        const rankColor = TIER_HEX[q.rank] || "#6b7280";
        const catName   = CAT_LABEL[q.category] || q.category;
        const catEmoji  = CAT_EMOJI[q.category] || "";
        const catObj    = webData.categories[q.category];
        const displayName = catObj ? catObj.name : catName;

        const div = document.createElement("div");
        div.className = `quest-card${progress.done ? " completed" : ""}${progress.verified ? " verified" : ""}`;
        div.dataset.questId = q.id;

        // Нотолгоотой даалгаварт "БИЕЛҮҮЛЭХ" товч БАЙХГҮЙ — дарах юм байхгүй.
        // Оронд нь зорилт руугаа хэр ойртсоныг бодит нэгжээр харуулна.
        const actions = progress.verified
            ? `<span class="quest-verified-badge" title="Биелэлтийг нотолгоо шийднэ">
                   ${progress.done ? "✓ НОТЛОГДСОН" : "◈ НОТОЛГООГООР"}
               </span>`
            : progress.done
                ? `<span class="done-badge">✓ DONE</span>
                   ${q.repeatable ? `<button class="reset-quest-btn" data-id="${q.id}" title="Дахин хийх">↺</button>` : ''}`
                : `<button class="complete-btn" data-id="${q.id}">БИЕЛҮҮЛЭХ</button>`;

        const evidenceRow = progress.verified
            ? `<div class="quest-progress">
                   <div class="quest-progress-meta">
                       <span>${escapeHTML(progress.metric.label)}</span>
                       <span><strong>${progress.value.toLocaleString()}</strong> / ${progress.target.toLocaleString()} ${escapeHTML(progress.metric.unit)}</span>
                   </div>
                   <div class="progress-bg">
                       <div class="progress-bar" style="width:${progress.pct.toFixed(1)}%;background:${rankColor};box-shadow:0 0 8px ${rankColor};"></div>
                   </div>
               </div>`
            : "";

        div.innerHTML = `
            <div class="quest-rank-badge" style="color:${rankColor};border-color:${rankColor}22;">${escapeHTML(q.rank)}</div>
            <div class="quest-info">
                <h4 title="${escapeHTML(q.title)}">${escapeHTML(q.title)}</h4>
                <small>${catEmoji} ${escapeHTML(displayName)} · <span style="color:${rankColor}">${escapeHTML(q.rank)}-Rank</span>${q.repeatable ? ' · 🔁' : ''}</small>
                ${evidenceRow}
            </div>
            <div class="quest-card-actions">
                ${actions}
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

    const status   = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const progress = questProgress(quest, status);

    document.getElementById("qm-rank").textContent    = quest.rank;
    document.getElementById("qm-rank").style.color    = rankColor;
    document.getElementById("qm-rank").style.borderColor = rankColor + "44";
    document.getElementById("qm-title").textContent   = quest.title;
    document.getElementById("qm-meta").textContent    = progress.verified
        ? `${progress.done ? "Нотолгоогоор биелсэн" : "Нотолгоогоор хэмжигдэж байна"}${quest.repeatable ? " · 🔁 Давтагдах" : ""}`
        : `${quest.completed && quest.completedDate ? `Биелсэн огноо: ${quest.completedDate}` : "Идэвхтэй"}${quest.repeatable ? " · 🔁 Давтагдах" : ""}`;
    document.getElementById("qm-rank-label").textContent = quest.rank + "-Rank";
    document.getElementById("qm-rank-label").style.color  = rankColor;
    document.getElementById("qm-cat").textContent = `${catEmoji} ${catName}`;

    // Нотолгоотой даалгаврын хувьд "яагаад ийм төлөвтэй байгаа"-г ил гаргана:
    // ямар метрик, ямар зорилт, одоо хаана байгаа, ямар бичлэгүүд түүнийг
    // үүсгэсэн бэ. Товч дарж болдоггүйн хариуд нотолгоог нь харуулна.
    const evidenceEl = document.getElementById("qm-evidence");
    if (evidenceEl) {
        if (!progress.verified) {
            evidenceEl.innerHTML = "";
        } else {
            const m = progress.metric;
            evidenceEl.innerHTML = `
                <div class="qm-evidence-head">
                    <span>${escapeHTML(m.label)}</span>
                    <span><strong>${progress.value.toLocaleString()}</strong> / ${progress.target.toLocaleString()} ${escapeHTML(m.unit)}</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-bar" style="width:${progress.pct.toFixed(1)}%;background:${rankColor};box-shadow:0 0 8px ${rankColor};"></div>
                </div>
                ${provenanceHtml(m)}`;
        }
    }

    // Actions
    const actionsEl = document.getElementById("qm-actions");
    actionsEl.innerHTML = "";

    if (progress.verified) {
        // Гараар биелүүлэх товч ЗОРИУД байхгүй — энэ даалгаврыг нотолгоо шийднэ.
        const note = document.createElement("div");
        note.className = "done-badge quest-verified-note";
        note.textContent = progress.done
            ? "✓ НОТОЛГООГООР БИЕЛСЭН"
            : "◈ НОТОЛГОО ХҮЛЭЭЖ БАЙНА";
        actionsEl.appendChild(note);
    } else if (!quest.completed) {
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

// Өнөөдөр хэдэн метрик бодит нотолгоо хүлээж авав. Гараар тэмдэглэдэг жагсаалт
// энэ тоог ХУУРЧ ЧАДАХГҮЙ — тиймээс л шагналын оронд энэ мөр зогсож байна.
function todaysEvidenceText() {
    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    if (!status || !status.metrics || typeof status.metrics !== "object") return "—";

    const ids   = Object.keys(status.metrics);
    const today = todayStr();
    const active = ids.filter(id => {
        const metric = status.metrics[id];
        return metric && metric.daily && Number(metric.daily[today]) > 0;
    }).length;

    // Метрик огт байхгүй ч мөн адил энэ салаанд орно — "0 / 0" гэж харуулахгүй.
    if (active === 0) return "нотолгоо ирээгүй";
    return `${active} / ${ids.length} метрик идэвхтэй`;
}

function renderMissionTasks() {
    const list = document.getElementById("mission-tasks-list");
    if (!list) return;

    const tasks = webData.missionTasks;
    const completedCount = tasks.filter(t => t.completed).length;
    const pct            = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    // Гараар тоолсон жагсаалт өөрийгөө тоолж байна — энэ нь шударга.
    const progEl = document.getElementById("mission-progress-text");
    if (progEl) progEl.textContent = `${completedCount} / ${tasks.length} (${pct}%)`;
    const evEl = document.getElementById("mission-evidence-text");
    if (evEl) evEl.textContent = todaysEvidenceText();
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
            <div class="task-name">${escapeHTML(t.name)}</div>`;
        list.appendChild(el);
    });
}
