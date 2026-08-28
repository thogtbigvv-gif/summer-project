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

// ===================== ӨДРИЙН ДААЛГАВРЫН ТӨЛӨВ =====================
// Даалгавар бүр ХОЁР замын аль нэгээр биелнэ:
//
//   НОТЛОГДСОН — даалгаврын metricId-д ӨНӨӨДӨР бодит нотолгоо ирсэн. Дасгал
//   хийгээд аппаа нээмэгц энэ өөрөө ✓ болно. Дарах юм байхгүй: аппын хэлсэн
//   нь хангалттай бөгөөд түүнийг гараар "болиулах" ч утгагүй.
//
//   ӨӨРӨӨ МЭДЭЭЛСЭН — метрик нь өнөөдөр юу ч аваагүй (эсвэл даалгавар ямар ч
//   метриктэй холбоогүй, ж: ус уух). Тэгвэл дарж болно, дарахад "өөрөө
//   мэдээлсэн" нотолгоо үүсэж self.checkins → DISCIPLINE руу орно.
//
// Ингэснээр товч дарах нь ҮНЭХЭЭР ямар нэг юм хөдөлгөдөг болов — гэхдээ
// хөдөлгөж буй зүйл нь батлагдаагүй гэдэг нь дэлгэц дээр ил хэвээр.

function missionTaskState(task, status, selfIds) {
    const metricId = (task && typeof task.metricId === "string") ? task.metricId : null;
    const metric   = (metricId && status && status.metrics) ? status.metrics[metricId] : null;
    const today    = todayStr();

    // Апп ӨНӨӨДӨР юу мэдээлэв? Тэгээс их бол даалгавар нотлогдсон.
    const provenValue = (metric && metric.daily) ? Number(metric.daily[today]) || 0 : 0;
    const proven      = provenValue > 0;

    // Өөрөө тэмдэглэсэн эсэхийг task.completed БИШ, нотолгоо өөрөө хэлнэ.
    // Ингэснээр хадгалагдсан тэмдэглэгээ нотолгооноос салж хоцрох аргагүй.
    const id = (typeof selfCheckinId === "function") ? selfCheckinId(task.id, today) : null;
    const selfReported = !proven && !!(id && selfIds && selfIds.has(id));

    return { metric, proven, provenValue, selfReported, done: proven || selfReported };
}

function missionTasksWithState() {
    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const ids    = (typeof selfCheckinIds === "function") ? selfCheckinIds() : new Set();
    const tasks  = Array.isArray(webData.missionTasks) ? webData.missionTasks : [];
    return tasks.map(task => ({ task, state: missionTaskState(task, status, ids) }));
}

async function toggleMissionTask(taskId) {
    const task = webData.missionTasks.find(t => t.id === taskId);
    if (!task) return;

    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const ids    = (typeof selfCheckinIds === "function") ? selfCheckinIds() : new Set();
    const state  = missionTaskState(task, status, ids);
    const today  = todayStr();

    // Аппын нотолгоог гараар устгах арга байхгүй — тэр тоог бид хэлээгүй.
    if (state.proven) {
        const label = state.metric ? state.metric.label : "нотолгоо";
        showToast(`"${task.name}" — ${label} өнөөдөр аль хэдийн баталсан.`, "info", "var(--accent)");
        return;
    }

    if (state.selfReported) {
        removeSelfCheckin(task.id, today);
        task.completed     = false;
        task.completedDate = null;
    } else {
        recordSelfCheckin(task.id, task.name, today);
        task.completed     = true;
        task.completedDate = today;
        showToast(`"${task.name}" — өөрөө бүртгэлээ ✓`, "info", ATTR_HEX.DISCIPLINE);
    }

    await saveWebData();

    // Нотолгоо өөрчлөгдсөн тул гаргасан статус хуучирлаа. renderWebUI() кэшийг
    // хаядаг ч, түүнээс өмнө ямар нэг юм уншигдвал хуучин тоо гарах эрсдэлтэй.
    if (typeof Status !== "undefined" && Status && typeof Status.invalidate === "function") {
        Status.invalidate();
    }
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

    // ЗӨВХӨН гадны эх сурвалжаас тэжээгддэг метрик. Өөрөө мэдээлдэг метрикийг
    // (self.checkins) сонгуулбал өөрөө дарж "нотлогдсон" болгох зам нээгдэнэ —
    // системийн гол амлалт яг тэр агшинд утгаа алдана.
    const ids = (typeof verifiableMetricIds === "function")
        ? verifiableMetricIds()
        : Object.keys(defs);

    select.innerHTML = `<option value="">— гараар тэмдэглэх —</option>` +
        ids.map(id => {
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

    // ЗӨВХӨН гадны эх сурвалж баталсан метрик. Энэ мөр нь DAILY PROGRESS-ийн
    // яг хажууд зогсдог: гараар тэмдэглэсэн жагсаалт өөрийгөө тоолж байхад
    // энэ нь "тэгэхээр үнэхээр юу болов" гэдэгт хариулах учиртай. Өөрөө
    // мэдээлсэн тоог энд оруулбал хоёр мөр адилхан зүйл ярих болно.
    const ids   = Object.keys(status.metrics).filter(id => {
        const metric = status.metrics[id];
        return metric && !metric.selfReported;
    });
    const today = todayStr();
    const active = ids.filter(id => Number(status.metrics[id].daily[today]) > 0).length;

    // Метрик огт байхгүй ч мөн адил энэ салаанд орно — "0 / 0" гэж харуулахгүй.
    if (active === 0) return "нотолгоо ирээгүй";
    return `${active} / ${ids.length} метрик нотлогдсон`;
}

// Даалгаврын нотолгооны эх сурвалжийн сонголт — quest/skill-тэй ижил бүртгэл,
// ижил хязгаар: өөрөө мэдээлдэг метрик энд гарахгүй.
function renderMissionMetricOptions() {
    const select = document.getElementById("mission-metric");
    if (!select) return;

    const defs = (typeof METRIC_DEFS !== "undefined" && METRIC_DEFS) ? METRIC_DEFS : {};
    const ids  = (typeof verifiableMetricIds === "function") ? verifiableMetricIds() : Object.keys(defs);
    const keep = select.value;

    select.innerHTML = `<option value="">— гараар тэмдэглэх —</option>` +
        ids.map(id => {
            const def  = defs[id] || {};
            const text = `${def.label || id}${def.unit ? ` (${def.unit})` : ""}`;
            return `<option value="${escapeHTML(id)}">${escapeHTML(text)}</option>`;
        }).join("");

    if (keep && defs[keep]) select.value = keep;
}

async function addMissionTask() {
    const nameEl   = document.getElementById("mission-name");
    const metricEl = document.getElementById("mission-metric");

    const name = nameEl ? nameEl.value.trim() : "";
    if (!name) { showToast("Даалгаврын нэр оруулна уу.", "error"); nameEl?.focus(); return; }

    if (!Array.isArray(webData.missionTasks)) webData.missionTasks = [];
    if (webData.missionTasks.some(t => t && t.name.toLowerCase() === name.toLowerCase())) {
        showToast("Ийм нэртэй даалгавар аль хэдийн байна.", "error");
        return;
    }

    webData.missionTasks.push({
        id: `m${Date.now()}`,
        name,
        metricId: (metricEl && metricEl.value) ? metricEl.value : null,
        completed: false,
        completedDate: null
    });

    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();

    if (nameEl)   nameEl.value = "";
    if (metricEl) metricEl.value = "";
    showToast(`"${name}" нэмэгдлээ.`);
}

async function deleteMissionTask(taskId) {
    const task = webData.missionTasks.find(t => t && t.id === taskId);
    if (!task) return;

    // Даалгаврыг устгах нь ТҮҮХИЙГ УСТГАХГҮЙ: өмнө нь бүртгэсэн check-in-ууд
    // нотолгоо хэвээр үлдэнэ. Тэдгээр нь үнэхээр болсон явдал байсан.
    if (!confirm(`"${task.name}" даалгаврыг жагсаалтаас хасах уу?\n\nӨмнөх бүртгэлүүд түүхэнд хэвээр үлдэнэ.`)) return;

    webData.missionTasks = webData.missionTasks.filter(t => t && t.id !== taskId);
    await saveWebData();
    if (typeof renderWebUI === "function") renderWebUI();
}

document.getElementById("submit-mission-btn")?.addEventListener("click", addMissionTask);
document.getElementById("mission-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("submit-mission-btn")?.click();
});
document.getElementById("toggle-mission-form")?.addEventListener("click", function () {
    const form = document.getElementById("mission-form");
    if (!form) return;
    const open = form.style.display !== "none";
    form.style.display = open ? "none" : "flex";
    this.textContent = open ? "+ Даалгавар нэмэх" : "− Хаах";
    if (!open) document.getElementById("mission-name")?.focus();
});

function renderMissionTasks() {
    renderMissionMetricOptions();

    const list = document.getElementById("mission-tasks-list");
    if (!list) return;

    const rows           = missionTasksWithState();
    const tasks          = rows.map(r => r.task);
    const completedCount = rows.filter(r => r.state.done).length;
    const provenCount    = rows.filter(r => r.state.proven).length;
    const pct            = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    // Хэдэн нь АППААР батлагдсаныг тусад нь хэлнэ — "3/3" гэдэг нь бүгд
    // нотлогдсон гэсэн үг үү, эсвэл бүгд өөрөө тэмдэглэсэн үү гэдгийг ялгана.
    const progEl = document.getElementById("mission-progress-text");
    if (progEl) {
        progEl.textContent = `${completedCount} / ${tasks.length} (${pct}%)`
            + (completedCount > 0 ? ` · ${provenCount} нотлогдсон` : "");
    }
    const evEl = document.getElementById("mission-evidence-text");
    if (evEl) evEl.textContent = todaysEvidenceText();
    const metaEl = document.getElementById("mission-meta-status");
    if (metaEl) {
        metaEl.textContent = completedCount === tasks.length ? "OBJECTIVE: COMPLETE ✓" : "OBJECTIVE: ACTIVE";
        metaEl.className = "mission-meta" + (completedCount === tasks.length ? " complete" : "");
    }

    list.innerHTML = "";
    rows.forEach(({ task: t, state }) => {
        const el = document.createElement("div");
        el.className = "mission-task"
            + (state.done ? " completed" : "")
            + (state.proven ? " proven" : "")
            + (state.selfReported ? " self-reported" : "");
        el.dataset.taskId = t.id;

        // Гараас ажиллах ёстой: энэ бол DISCIPLINE-ыг хөдөлгөдөг цорын ганц
        // товч. Нотлогдсоныг дарах юм байхгүй тул түүнийг фокусын дарааллаас
        // гаргаж, aria-аар нь ч хэлнэ.
        if (state.proven) {
            el.setAttribute("role", "img");
            el.setAttribute("aria-label", `${t.name} — нотолгоогоор биелсэн`);
        } else {
            el.setAttribute("role", "button");
            el.setAttribute("tabindex", "0");
            el.setAttribute("aria-pressed", state.done ? "true" : "false");
        }

        // Тэмдэглэгээний ард юу зогсож байгааг шулуухан хэлнэ.
        let proof = "";
        if (state.proven) {
            const m    = state.metric;
            const unit = (m && m.unit) ? ` ${m.unit}` : "";
            proof = `<div class="task-proof proven" title="Холбогдсон апп өнөөдөр мэдээлсэн">
                        ✓ НОТЛОГДСОН · ${escapeHTML(m ? m.label : "")} ${state.provenValue.toLocaleString()}${escapeHTML(unit)}
                     </div>`;
        } else if (state.selfReported) {
            proof = `<div class="task-proof self" title="Апп биш, өөрөө тэмдэглэсэн">◈ ӨӨРӨӨ МЭДЭЭЛСЭН</div>`;
        } else if (state.metric) {
            proof = `<div class="task-proof waiting" title="${escapeHTML(state.metric.label)} өнөөдөр юу ч аваагүй">
                        ${escapeHTML(state.metric.label)} — хүлээж байна
                     </div>`;
        }

        el.innerHTML = `
            <div class="task-box"></div>
            <div class="task-name">${escapeHTML(t.name)}</div>
            ${proof}
            <button class="delete-btn" data-id="${escapeHTML(String(t.id))}" data-type="mission"
                    aria-label="${escapeHTML(t.name)} — жагсаалтаас хасах" title="Хасах">×</button>`;
        list.appendChild(el);
    });
}
