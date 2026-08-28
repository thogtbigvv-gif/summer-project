"use strict";

// Event Delegation (Нийтлэг товчнууд)
document.addEventListener("click", async (e) => {
    const completeBtn   = e.target.closest(".complete-btn");
    const deleteBtn     = e.target.closest(".delete-btn");
    const resetQuestBtn = e.target.closest(".reset-quest-btn");

    if (completeBtn)   await completeQuest(Number(completeBtn.dataset.id));
    if (resetQuestBtn) await resetQuest(Number(resetQuestBtn.dataset.id));
    if (deleteBtn) {
        // Өдрийн даалгаврын id нь МӨР ("m1"), тоо биш — Number() нь NaN болгоно.
        // Тиймээс хөрвүүлэхээс ӨМНӨ салаална.
        if (deleteBtn.dataset.type === "mission") {
            await deleteMissionTask(deleteBtn.dataset.id);
            return;
        }
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

// Хулганагүйгээр ч ажиллана. Өдрийн даалгавар бол DISCIPLINE-ыг хөдөлгөдөг
// цорын ганц удирдлага — түүнийг зөвхөн хулганаар хүрч болдог байлгах нь
// бүхэл нэг тэнхлэгийг гарын хэрэглэгчээс нууж байгаатай адил.
document.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const task = e.target.closest && e.target.closest('.mission-task[role="button"]');
    if (!task) return;
    e.preventDefault();
    await toggleMissionTask(task.dataset.taskId);
});

// ===================== TAB NAVIGATION =====================
// Идэвхтэй таб нь ДЭЛГЭЦИЙН тохиргоо, нотолгоо биш — тиймээс webData-д биш,
// localStorage-д тусад нь суулгана. Синк, RESET, экспорт зэрэгт хамаагүй.
const ACTIVE_TAB_KEY = "summerProjectActiveTab";

function activateTab(targetId, remember) {
    const panel = targetId ? document.getElementById(targetId) : null;
    if (!panel) return false;

    document.querySelectorAll(".tab-btn").forEach(b => {
        const on = b.dataset.tab === targetId;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    panel.classList.add("active");

    if (remember) {
        try { localStorage.setItem(ACTIVE_TAB_KEY, targetId); } catch (_) {}
    }

    // Аналитик нь зөвхөн харагдах үедээ баригддаг — идэвхжих бүрд шинэчилнэ.
    if (targetId === "analytics-tab" && typeof AnalyticsEngine !== "undefined") {
        AnalyticsEngine.renderDashboard();
    }
    return true;
}

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", function () {
        activateTab(this.dataset.tab, true);
    });
});

// Сэргээх. Хадгалагдсан таб байхгүй/устсан бол HTML-ийн анхдагч нь хэвээр үлдэнэ.
function restoreActiveTab() {
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_TAB_KEY); } catch (_) {}
    if (saved) activateTab(saved, false);
}

// ===================== ӨГӨГДЛИЙН УДИРДЛАГА =====================
// Нотолгоо бол сэргээгдэшгүй. Үйлдвэрлэгч аппууд ердөө 50 event-ийн буфертэй
// тул устгагдсан бичлэг ЭРГЭЖ ИРЭХГҮЙ. Өмнө нь RESET товч ганц confirm-ын
// цаана бүх түүхийг үүрд устгадаг байв — систем нотолгоог "цорын ганц үнэн"
// гэж зарлаад, түүнийгээ хамгийн хямд байдлаар хаядаг байсан гэсэн үг.
//
// Одоо хоёр тусдаа үйлдэл: ЖАГСААЛТ цэвэрлэх (нотолгоо хэвээр) ба
// НОТОЛГОО ХАМТ устгах (тоогоо нэрлэсэн тусдаа баталгаажуулалттай).

document.getElementById("export-btn")?.addEventListener("click", () => {
    try {
        const records = exportWebData();
        showToast(`${records.toLocaleString()} нотолгоо файл болж татагдлаа.`, "info", "var(--accent)");
    } catch (err) {
        console.error("export error:", err);
        showToast("Экспортлож чадсангүй.", "error");
    }
});

document.getElementById("import-input")?.addEventListener("change", async function () {
    const file = this.files && this.files[0];
    this.value = "";                     // ижил файлыг дахин сонгож болохын тулд
    if (!file) return;

    let payload;
    try {
        payload = JSON.parse(await file.text());
    } catch (err) {
        console.error("import parse error:", err);
        showToast("Файл JSON биш байна.", "error");
        return;
    }

    try {
        const summary = importWebData(payload);
        await saveWebData();
        Status.invalidate();
        renderWebUI();

        const gained = summary.after - summary.before;
        console.log("[import]", summary);
        showToast(gained > 0
            ? `${gained.toLocaleString()} шинэ нотолгоо нэгтгэгдлээ (нийт ${summary.after.toLocaleString()}).`
            : `Шинэ нотолгоо олдсонгүй — бүгд аль хэдийн байсан (${summary.after.toLocaleString()}).`,
            "info", "var(--accent)");
    } catch (err) {
        console.error("import error:", err);
        showToast(err && err.message ? err.message : "Сэргээж чадсангүй.", "error");
    }
});

// ЖАГСААЛТ цэвэрлэх — нотолгоонд ХҮРЭХГҮЙ.
document.getElementById("reset-btn")?.addEventListener("click", async () => {
    if (!confirm("Даалгавар, ур чадвар, ангилал, өдрийн жагсаалтыг анхны төлөвт шилжүүлэх үү?\n\nНотолгоо ХЭВЭЭР үлдэнэ.")) return;

    const evidence = webData.integrations;   // хадгалж авна
    webData = cloneDefault();
    webData.integrations = evidence;

    await saveWebData();
    sweepRemovedFeatureKeys();
    Status.invalidate();
    renderWebUI();
    showToast("Жагсаалт шинэчлэгдлээ. Нотолгоо хэвээр.");
});

// НОТОЛГОО ХАМТ устгах — эргэж сэргээх аргагүй тул тоог нь нэрлэж асууна.
document.getElementById("purge-btn")?.addEventListener("click", async () => {
    const records = evidenceRecordCount();

    if (records > 0 && !confirm(
        `${records.toLocaleString()} нотолгоо УСТАНА.\n\n` +
        "Холбогдсон аппууд ердөө сүүлийн 50 бичлэгээ хадгалдаг тул үүнийг " +
        "ЭРГЭЖ СЭРГЭЭХ АРГАГҮЙ.\n\nҮргэлжлүүлэхийн өмнө экспортлохыг зөвлөж байна.")) return;
    if (!confirm("Итгэлтэй байна уу? Энэ бол эргэшгүй үйлдэл.")) return;

    webData = cloneDefault();
    await saveWebData();
    sweepRemovedFeatureKeys();
    Status.invalidate();
    renderWebUI();
    showToast(`${records.toLocaleString()} нотолгоо устлаа.`, "error");
});

// Тиерийн үсэг нь ЗОРИЛТЫН ХУВЬ — хадгалагдсан тоо биш. Дүрэм өөрчлөгдвөл
// бүх түүх шууд дагаж засагдана.
function tierForPct(pct) {
    if (pct >= 100) return "S";
    if (pct >=  80) return "A";
    if (pct >=  60) return "B";
    if (pct >=  40) return "C";
    if (pct >=  20) return "D";
    return "E";
}

// Category Renderer — бүх тоо нотолгооноос (status.js), бодит нэгжээр.
function renderCategories() {
    const catContainer = document.getElementById("categories-container");
    if (!catContainer) return;

    catContainer.innerHTML = "";
    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;

    for (const key in webData.categories) {
        const cat    = webData.categories[key];
        if (!cat) continue;
        const metric = (status && cat.metricId) ? status.metrics[cat.metricId] : null;

        // Зорилт болон нэгжийн ЦОРЫН ГАНЦ эх сурвалж нь метрикийн бүртгэл
        // (status.js → METRIC_DEFS). Ангилалд хуулбар хадгалахаа больсон тул
        // картын тиер ба профайлын оноо ХЭЗЭЭ Ч өөр зорилтоор тооцогдохгүй.
        // Метрик холбоогүй ангилал л өөрийн targetValue/unit-даа найдна.
        const target = metric ? Number(metric.target30) || 0 : Number(cat.targetValue) || 0;
        const value  = metric ? Number(metric.last30)   || 0 : 0;
        const pct    = target > 0 ? Math.min((value / target) * 100, 100) : 0;
        const tier   = tierForPct(target > 0 ? (value / target) * 100 : 0);

        const tierColor = TIER_COLORS[tier] || "var(--tier-e)";
        const tierHex   = TIER_HEX[tier]    || "#6b7280";
        const unit      = metric ? metric.unit : (cat.unit || "");

        const card = document.createElement("div");
        card.className = "category-card";
        card.style.setProperty("--tier-color", tierColor);
        card.dataset.tier = tier;
        card.innerHTML = `
            <div class="card-head">
                <h3>${escapeHTML(cat.name)}</h3>
                <div class="tier-pill" style="color:${tierHex}">${escapeHTML(tier)}</div>
            </div>
            <div class="xp-row">
                <span>СҮҮЛИЙН 30 ХОНОГ</span>
                <span>${metric ? formatDelta(metric.change30Pct, metric.last30, metric.prev30) : "—"}</span>
            </div>
            <div class="progress-bg">
                <div class="progress-bar" style="width:${pct.toFixed(1)}%;background:${tierHex};box-shadow:0 0 8px ${tierHex};"></div>
            </div>
            <div class="progress-meta">
                ${metric
                    ? `Бодит ахиц: <strong>${value.toLocaleString()} ${escapeHTML(unit)}</strong> / ${target.toLocaleString()} ${escapeHTML(unit)}`
                    : `Нотолгооны эх сурвалж холбоогүй`}
            </div>`;
        catContainer.appendChild(card);
    }
}

// ===================== ПРОФАЙЛ: НОТОЛГООНЫ ҮНДЭС =====================
// Профайлын оноо бүр нотолгооноос гардаг. Тэгвэл ХЭДЭН нотолгоо, ХЭЗЭЭНЭЭС
// хойш гэдэг нь тэр онооны жин — түүнгүйгээр "100%" гэдэг нь нэг өдрийн
// нэг бичлэгээс ч гарч болно. status.overall эдгээрийг аль эрт тооцдог
// байсан ч дэлгэц дээр хаана ч гардаггүй байв.

function renderProfileEvidence() {
    const el = document.getElementById("profile-evidence");
    if (!el) return;

    const status  = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const overall = (status && status.overall) ? status.overall : null;

    if (!overall || !(Number(overall.totalEvents) > 0)) {
        el.innerHTML = `<div class="connected-empty">нотолгоо хараахан ирээгүй</div>`;
        return;
    }

    const firstAt = Number(overall.firstEvidenceAt) || 0;
    const since   = (firstAt > 0 && typeof dayKeyOf === "function") ? dayKeyOf(firstAt) : null;

    // Профайл нь БАТЛАГДСАН тоог гол болгоно. Өөрөө мэдээлсэнийг нуухгүй —
    // тусдаа мөрөнд, алтан өнгөөр. Хоёрыг нийлүүлбэл "107 нотолгоо" гэсэн
    // тоо нь 107 удаа шалгах нүд дарсан ч байж болох болно.
    const proven = overall.proven || { activeDays30: 0, totalEvents: 0 };
    const self   = overall.self   || { activeDays30: 0, totalEvents: 0 };

    el.innerHTML = `
        <div class="profile-evidence-row">
            <span>НОТЛОГДСОН</span><strong>${Number(proven.totalEvents).toLocaleString()}</strong>
        </div>
        ${Number(self.totalEvents) > 0 ? `
        <div class="profile-evidence-row">
            <span>ӨӨРӨӨ БҮРТГЭСЭН</span><strong style="color:${ATTR_HEX.DISCIPLINE};">${Number(self.totalEvents).toLocaleString()}</strong>
        </div>` : ""}
        <div class="profile-evidence-row">
            <span>БҮРТГЭЛ ЭХЭЛСЭН</span><strong>${escapeHTML(since || "—")}</strong>
        </div>
        <div class="profile-evidence-row">
            <span>НОТЛОГДСОН ӨДӨР</span><strong>${Number(proven.activeDays30) || 0} / 30</strong>
        </div>`;
}

// ===================== ПРОФАЙЛ: АТРИБУТЫН ОНОО =====================
// Оноо = "30 хоногийн бодит зорилтод хэр ойрхон вэ" (status.js). Түвшин, XP биш.

function renderAttributeScores() {
    const container = document.getElementById("attribute-bars");
    if (!container) return;

    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const attributes = (status && status.attributes) ? status.attributes : {};
    const names = Object.keys(attributes);

    if (names.length === 0) {
        container.innerHTML = `<div class="connected-empty">нотолгоо алга</div>`;
        return;
    }

    container.innerHTML = names.map(name => {
        const attr = attributes[name] || {};
        const score = Math.max(0, Math.min(100, Number(attr.score) || 0));
        const hex   = ATTR_HEX[name] || "#6b7280";
        const ids   = Array.isArray(attr.metrics) ? attr.metrics : [];

        // Атрибутын өөрчлөлт нь метрикүүдийнх нь 30 хоногийн НИЙЛБЭР дээр тулгуурладаг.
        let last30 = 0, prev30 = 0;
        if (status) ids.forEach(id => {
            const m = status.metrics[id];
            if (!m) return;
            last30 += Number(m.last30) || 0;
            prev30 += Number(m.prev30) || 0;
        });

        return `
            <div class="attr-score-row">
                <div class="xp-row">
                    <span>${escapeHTML(name)}</span>
                    <span><strong style="color:${hex};">${score}%</strong> ${formatDelta(attr.change30Pct, last30, prev30)}</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-bar" style="width:${score}%;background:${hex};box-shadow:0 0 8px ${hex};"></div>
                </div>
            </div>`;
    }).join("");
}

// Үндсэн UI-г Render хийх мастер функц
function renderWebUI() {
    // Статусын тоо бүр нотолгооноос ГАРГАГДАНА — рендер бүрийн өмнө кэшийг хаяж,
    // дэлгэц дээрх зүйл одоогийн нотолгоотой ЗААВАЛ тохирдог байлгана.
    if (typeof Status !== "undefined" && Status && typeof Status.invalidate === "function") {
        Status.invalidate();
    }

    renderProfileEvidence();
    renderAttributeScores();

    // Бусад модулиудын render-үүдийг дуудах
    if(typeof renderMissionTasks === "function") renderMissionTasks();
    // Motivational quote эргэлдүүлэх
    const QUOTES = [
        '"Keep moving forward. Consistency is the weapon."',
        '"Every rep counts. Every day matters."',
        '"Small progress is still progress."',
        '"Discipline beats motivation every time."',
        '"Your future self is watching."',
        '"One quest at a time. One day at a time."'
    ];
    const quoteEl = document.getElementById("mission-quote");
    if (quoteEl) {
        const idx = Math.floor(new Date().getTime() / 86400000) % QUOTES.length;
        quoteEl.textContent = QUOTES[idx];
    }
    renderCategories();
    if(typeof renderQuests === "function") renderQuests();
    if(typeof renderSkills === "function") renderSkills();
    if(typeof renderConnectedApps === "function") renderConnectedApps();
    if(typeof renderAttributesRadar === "function") renderAttributesRadar();
    
    // Хэрэв Analytics tab идэвхтэй байвал шууд шинэчлэнэ
    const analyticsTab = document.getElementById('analytics-tab');
    if (analyticsTab && analyticsTab.classList.contains('active')) {
        AnalyticsEngine.renderDashboard();
    }
}

// ===================== ӨДӨР СОЛИГДОХ =====================
// Таб шөнөжингөө нээлттэй байх нь энгийн зүйл. Тэр үед хоёр зүйл чимээгүй
// худал болдог байв: "сүүлийн 30 хоног" цонх шилжсэн ч дэлгэц өчигдрийн
// тоог барьсаар үлдэнэ, өдрийн жагсаалт ч шинэ өдөртөө шилжихгүй (тэр нь
// зөвхөн loadWebData() дотор, өөрөөр хэлбэл хуудас ачаалах үед хийгддэг).
//
// Status кэш өөрөө ч өдрөө хардаг — энд бид дэлгэцийг нь дагуулж шинэчилнэ.
let _renderedDay = todayStr();

async function checkDayRollover() {
    if (!webData) return;

    const today = todayStr();
    if (today === _renderedDay) return;
    _renderedDay = today;

    // loadWebData()-тай ЯГ ижил дүрэм: өчигдөр тэмдэглэсэн зүйл өнөөдөр цэвэрлэгдэнэ.
    let changed = false;
    (Array.isArray(webData.missionTasks) ? webData.missionTasks : []).forEach(task => {
        if (task && task.completedDate && task.completedDate !== today) {
            task.completed = false;
            task.completedDate = null;
            changed = true;
        }
    });
    if (changed) await saveWebData();

    renderWebUI();
}

setInterval(checkDayRollover, 60000);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDayRollover();
});

// Ачаалж эхлэх
async function init() {
    try {
        await loadWebData();
    } catch (err) {
        console.error("init error:", err);
        webData = cloneDefault();
    }
    // Холбогдсон бүх аппын фийдээс XP автоматаар синк хийх (алдаа гарвал дотроо барина).
    // syncAll() өөрөө хадгална. focus/storage үеийн синкийг bridge.js бүртгэсэн байгаа.
    if (typeof syncAll === "function") await syncAll();
    _renderedDay = todayStr();
    renderWebUI();
    restoreActiveTab();
}

// Keyboard Enter дэмжих — Quest form
document.getElementById("quest-title")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("submit-quest-btn")?.click();
});

// Keyboard Enter дэмжих — Skill form
document.getElementById("skill-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("submit-skill-btn")?.click();
});

// App-ийг асаах
init();
