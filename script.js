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
        const changed = this.dataset.tab !== document.querySelector(".tab-content.active")?.id;
        if (!activateTab(this.dataset.tab, true)) return;

        // Утсан дээр таб бүр урт гүйлгэлттэй бөгөөд навигаци нь доод ирмэгт
        // байдаг. Гүйлгэлтийн байрлалыг хэвээр үлдээвэл "Аналитик" дарсан
        // хүн уг табын ДУНДААС нээгддэг — өөрөө гараар дээшээ гүйлгэх
        // шаардлагатай болно. Таб солих гэдэг нь "өөр зүйл рүү шилжих"
        // гэсэн үг тул эхнээс нь эхэлнэ.
        //
        // Зөвхөн ҮНЭХЭЭР солигдсон үед: аль хэдийн нээлттэй табаа дахин
        // дарахад байрлал үсрэх нь алдаа мэт мэдрэгдэнэ.
        if (changed) window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

// Сэргээх. Хадгалагдсан таб байхгүй/устсан бол HTML-ийн анхдагч нь хэвээр үлдэнэ.
//
// Хаягийн hash нь хадгалагдсанаас ДЭЭГҮҮР: суулгасан аппын товчлол
// (manifest.webmanifest → shortcuts) "./#quests-tab" гэж нээдэг тул хэрэглэгч
// яг тэр табыг ЗОРИУД сонгосон байна. Сүүлд үзсэн таб нь тэр сонголтыг
// дарж болохгүй.
function restoreActiveTab() {
    const fromHash = (location.hash || "").replace(/^#/, "");
    if (fromHash && activateTab(fromHash, true)) return;

    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_TAB_KEY); } catch (_) {}
    if (saved) activateTab(saved, false);
}

// Аль хэдийн нээлттэй апп дээр товчлол дарахад хуудас дахин ачаалагдахгүй,
// зөвхөн hash солигдоно. Түүнийг сонсохгүй бол товчлол чимээгүй үхнэ.
window.addEventListener("hashchange", () => {
    const target = (location.hash || "").replace(/^#/, "");
    if (target) activateTab(target, true);
});

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

    // Нотолгоо БОЛОН түүнийг тоо болгодог тайлбарыг хоёуланг нь хадгална.
    //
    // Зөвхөн integrations-ыг үлдээвэл: холбосон эх сурвалж, түүний метрик,
    // "энэ төрөл ийм утгатай" гэсэн тайлбар бүгд алга болно. Нотолгоо нь
    // байрандаа хэвээр атлаа ТООНУУД нь тэглэгдэнэ — "Нотолгоо ХЭВЭЭР
    // үлдэнэ" гэсэн амлалт техникийн хувьд үнэн, практикт худал болно.
    const keep = {
        integrations: webData.integrations,
        sources:      webData.sources,
        metrics:      webData.metrics,
        metricMap:    webData.metricMap
    };
    webData = cloneDefault();
    Object.keys(keep).forEach(k => { if (keep[k] !== undefined) webData[k] = keep[k]; });

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
        // Карт бүр "энэ тоо хаанаас гарав" гэдэгт хариулах ёстой. Дарж
        // болдгийг нь role/tabindex-ээр зарлана — хулганагүй ч нээгдэнэ.
        card.className = "category-card is-openable";
        card.style.setProperty("--tier-color", tierColor);
        card.dataset.tier = tier;
        card.dataset.category = key;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
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
// нэг бичлэгээс ч гарч болно.
//
// Тэр жин нь БАТЛАГДСАН байх ёстой. Урьд нь энэ гурван мөр өөрөө дарсан
// check-in-ыг аппын нотолгоотой нэг саванд хийж тоолдог байв: ганц ч апп
// холбоогүй хүн өдөр бүр нүд даран "ИДЭВХТЭЙ ӨДӨР 30/30" гэсэн тоог
// хардаг байсан. Өөрөө өөрийгөө баталсан жин бол жин биш.
//
// Одоо толгойн гурван мөр гадны аппаас л гарна, өөрөө мэдээлсэн нь доор
// ӨӨРИЙНХӨӨ нэрээр гарна — нуугдахгүй, хольцгүй.

function renderProfileEvidence() {
    const el = document.getElementById("profile-evidence");
    if (!el) return;

    const status  = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const overall = (status && status.overall) ? status.overall : null;
    const self    = (overall && overall.self) ? overall.self : { totalEvents: 0, activeDays30: 0 };

    const verified   = Number(overall && overall.totalEvents) || 0;
    const selfEvents = Number(self.totalEvents) || 0;

    if (!overall || !(verified > 0) && !(selfEvents > 0)) {
        el.innerHTML = `<div class="connected-empty">нотолгоо хараахан ирээгүй</div>`;
        return;
    }

    // Өөрөө мэдээлсэн нь ХЭЗЭЭ Ч толгойн тоог нөхөхгүй. Аппын нотолгоо байхгүй
    // бол тэр гурван мөр ТЭГ гэж хэлнэ — check-in хэдэн ч байсан хамаагүй.
    const selfRow = selfEvents > 0
        ? `<div class="profile-evidence-row profile-evidence-self">
               <span>ӨӨРӨӨ МЭДЭЭЛСЭН</span>
               <strong>${selfEvents.toLocaleString()} бичлэг<small>${Number(self.activeDays30) || 0}/30 хоног</small></strong>
           </div>`
        : "";

    if (!(verified > 0)) {
        el.innerHTML = `
            <div class="profile-evidence-row profile-evidence-none">
                <span>БАТЛАГДСАН НОТОЛГОО</span><strong>0</strong>
            </div>
            ${selfRow}
            <div class="profile-evidence-note">
                Дээрх оноог ямар ч апп батлаагүй байна — эх сурвалж холбоно уу.
            </div>`;
        return;
    }

    const firstAt = Number(overall.firstEvidenceAt) || 0;
    const since   = (firstAt > 0 && typeof dayKeyOf === "function") ? dayKeyOf(firstAt) : null;

    el.innerHTML = `
        <div class="profile-evidence-row">
            <span>БАТЛАГДСАН НОТОЛГОО</span><strong>${verified.toLocaleString()}</strong>
        </div>
        <div class="profile-evidence-row">
            <span>БҮРТГЭЛ ЭХЭЛСЭН</span><strong>${escapeHTML(since || "—")}</strong>
        </div>
        <div class="profile-evidence-row">
            <span>ИДЭВХТЭЙ ӨДӨР</span><strong>${Number(overall.activeDays30) || 0} / 30</strong>
        </div>
        ${selfRow}`;
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

        // Тоог тэжээх ёстой эх сурвалж уншигдахгүй байвал ЭНД хэлнэ. Урьд нь
        // энэ мөр "0%" гэж бичээд дуусдаг байсан бөгөөд түүнийг "чи хийгээгүй"
        // гэж уншихаас өөр аргагүй байв — үнэндээ "би уншиж чадахгүй байна"
        // байсан ч. Хоёр огт өөр зүйлийг нэг тоо төлөөлж чадахгүй.
        const starved = (typeof starvedSources === "function") ? starvedSources(ids) : null;
        const warn = starvedRowHtml(starved);
        // Хүлээлт нь эвдрэл БИШ тул мөрийг улаан суурьтай болгохгүй.
        const waitOnly = !!(warn && starved && starved.bad.length === 0);
        const flag = warn ? ` is-starved${waitOnly ? " is-wait-only" : ""}` : "";

        return `
            <div class="attr-score-row is-openable${flag}" data-attribute="${escapeHTML(name)}" role="button" tabindex="0">
                <div class="xp-row">
                    <span>${escapeHTML(name)}</span>
                    <span><strong style="color:${hex};">${score}%</strong> ${formatDelta(attr.change30Pct, last30, prev30)}</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-bar" style="width:${score}%;background:${hex};box-shadow:0 0 8px ${hex};"></div>
                </div>
                ${warn}
            </div>`;
    }).join("");
}

// Өлссөн мөрийн сануулга. ЗӨВХӨН үнэхээр эвдэрсэн үед улаан гарна: "тэр апп
// хараахан бичээгүй" гэдэг нь засах юмгүй хэвийн төлөв тул чимээгүй өнгөөр
// бичигдэж, тоог нь худал гэж ХЭЛЭХГҮЙ — ердөө хараахан ирээгүй.
function starvedRowHtml(starved) {
    if (!starved) return "";

    if (starved.bad.length > 0) {
        const names = starved.bad.map(s => escapeHTML(s.label)).join(", ");
        return `<div class="attr-starved">⚠ ${names} уншигдахгүй — энэ тоо ажиллахаа больсон</div>`;
    }
    if (starved.waiting.length > 0) {
        const names = starved.waiting.map(s => escapeHTML(s.label)).join(", ");
        return `<div class="attr-starved is-wait">${names} хараахан бичээгүй байна</div>`;
    }
    return "";
}

// ===================== СТАТУСЫН ДЭЛГЭРЭНГҮЙ =====================
// Ур чадварын карт аль эрт нотолгоогоо харуулдаг байсан бол Статус табын
// картууд ердөө тоо харуулаад дуусдаг байв: "63%" гэсэн тоо хаанаас гарав,
// хэн хэлэв, хэзээнээс хойш чимээгүй байна вэ гэдэг хаана ч байхгүй.
//
// Энэ цонх тэр гурван асуултад хариулна. Ямар ч тоо ЭНД шинээр тооцогдохгүй —
// бүгд Status.get()-ээс ирнэ.

function statusModal() { return document.getElementById("status-detail-modal"); }

function closeStatusModal() { statusModal()?.classList.remove("active"); }

// Метрикийг тэжээж буй эх сурвалжийн ЭРҮҮЛ МЭНД. "Тоо зогссон" гэдэг
// ихэвчлэн "апп чимээгүй болсон" гэсэн үг — хоёрыг нь тусад нь харуулах нь
// хэрэглэгчийг таамаглуулж байгаа хэрэг.
function metricSourceHtml(metricId, status) {
    const apps = (typeof metricSourceApps === "function") ? metricSourceApps(metricId) : [];
    if (apps.length === 0) {
        return `<div class="sd-source sd-source-bad">Энэ метрикт ямар ч эх сурвалж холбогдоогүй — тоо хэзээ ч өсөхгүй.</div>`;
    }

    const sources = (status && status.sources) ? status.sources : {};
    return apps.map(app => {
        const stats = sources[app] || null;
        const check = (typeof getBridgeCheck === "function") ? getBridgeCheck(app) : null;
        const label = (stats && stats.label) || app;
        const when  = (stats && typeof relativeTime === "function") ? relativeTime(stats.updatedAt) : null;

        // Холбогдсон картын нэгэн адил: "хараахан бичээгүй байна" бол эвдрэл
        // БИШ. Улаанаар бичвэл хэрэглэгч засах юмгүй зүйлийг засах гэж хайна.
        // Ялгааг bridgeCheckSeverity НЭГ УДАА шийднэ — энэ мөр, карт, профайл
        // гурав өөр өөрөөр шийдвэл дэлгэц өөртэйгөө маргана.
        const code     = check && check.code;
        const severity = (typeof bridgeCheckSeverity === "function") ? bridgeCheckSeverity(code) : "bad";

        let note = "", tone = "";
        if (check && severity !== "ok" && severity !== "self") {
            note = typeof bridgeCheckText === "function" ? bridgeCheckText(code, check.detail) : "уншигдахгүй байна";
            tone = severity === "wait" ? " sd-source-wait" : " sd-source-bad";
        } else if (stats && stats.stale) {
            note = "чимээгүй байна";
            tone = " sd-source-bad";
        }

        return `
            <div class="sd-source${tone}">
                <span>${escapeHTML(label)}</span>
                <span>${escapeHTML(note || when || "—")}</span>
            </div>`;
    }).join("");
}

function statBox(label, value) {
    return `<div class="stat-box"><label>${escapeHTML(label)}</label><span>${value}</span></div>`;
}

function metricDetailHtml(metric, status, hex) {
    const unit = metric.unit ? " " + escapeHTML(metric.unit) : "";
    const target = Number(metric.target30) || 0;

    const spark = (typeof metricSparklineSvg === "function")
        ? metricSparklineSvg((metric.series || []).slice(-30), hex)
        : "";

    return `
        <div class="modal-stats">
            ${statBox("СҮҮЛИЙН 30 ХОНОГ", `${Number(metric.last30).toLocaleString()}<small>${unit}</small>`)}
            ${statBox("ЗОРИЛТ", target > 0
                ? `${target.toLocaleString()}<small>${unit}</small> · ${Number(metric.pct30).toFixed(0)}%`
                : "—")}
            ${statBox("ӨӨРЧЛӨЛТ", formatDelta(metric.change30Pct, metric.last30, metric.prev30))}
            ${statBox("ЦУВРАЛ", `${Number(metric.streakDays) || 0} хоног`)}
            ${statBox("ИДЭВХТЭЙ ӨДӨР", `${Number(metric.activeDays30) || 0} / 30`)}
            ${statBox("ХАМГИЙН САЙН ӨДӨР", metric.best
                ? `${Number(metric.best.value).toLocaleString()}<small>${unit}</small><br><small>${escapeHTML(metric.best.date)}</small>`
                : "—")}
        </div>
        ${spark ? `<div class="sd-spark">${spark}<div class="sd-spark-label">сүүлийн 30 хоног</div></div>` : ""}
        <div class="sd-section-label">ЭХ СУРВАЛЖ</div>
        ${metricSourceHtml(metric.id, status)}
        ${provenanceHtml(metric, 8)}`;
}

function openCategoryModal(key) {
    const cat = webData && webData.categories ? webData.categories[key] : null;
    if (!cat) return;

    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const metric = (status && cat.metricId) ? status.metrics[cat.metricId] : null;
    const hex    = metric ? (ATTR_HEX[metric.attr] || "#10b981") : "#6b7280";

    document.getElementById("sd-icon").textContent    = "◈";
    document.getElementById("sd-icon").style.color    = hex;
    document.getElementById("sd-icon").style.borderColor = hex + "44";
    document.getElementById("sd-title").textContent    = cat.name || key;
    document.getElementById("sd-subtitle").textContent = metric
        ? `${metric.label}${metric.unit ? " · " + metric.unit : ""}`
        : "нотолгооны эх сурвалж холбоогүй";

    document.getElementById("sd-body").innerHTML = metric
        ? metricDetailHtml(metric, status, hex)
        : `<div class="connected-empty">Энэ ангилал метрикт холбогдоогүй байна — ахиц нь хэмжигдэхгүй.</div>`;

    statusModal()?.classList.add("active");
}

function openAttributeModal(name) {
    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const attr   = (status && status.attributes) ? status.attributes[name] : null;
    if (!attr) return;

    const hex = ATTR_HEX[name] || "#10b981";
    const ids = Array.isArray(attr.metrics) ? attr.metrics : [];

    document.getElementById("sd-icon").textContent    = "◈";
    document.getElementById("sd-icon").style.color    = hex;
    document.getElementById("sd-icon").style.borderColor = hex + "44";
    document.getElementById("sd-title").textContent    = name;
    document.getElementById("sd-subtitle").textContent = `${ids.length} метрик · оноо ${Number(attr.score) || 0}%`;

    // Оноо хэрхэн гарсныг ЗАДЛАЖ харуулна: метрик бүрийн зорилтын хувь, тэдний
    // дундаж нь оноо. Ингэснээр "яагаад 40% байна вэ" гэдэг тайлагдана.
    const rows = ids.map(id => {
        const m = (status.metrics || {})[id];
        if (!m) return "";
        const pct = Math.max(0, Math.min(100, Number(m.pct30) || 0));
        const unit = m.unit ? " " + escapeHTML(m.unit) : "";
        return `
            <div class="sd-metric-row">
                <div class="xp-row">
                    <span>${escapeHTML(m.label)}</span>
                    <span><strong style="color:${hex};">${pct.toFixed(0)}%</strong>
                          <small>${Number(m.last30).toLocaleString()}${unit} / ${Number(m.target30).toLocaleString()}${unit}</small></span>
                </div>
                <div class="progress-bg">
                    <div class="progress-bar" style="width:${pct}%;background:${hex};"></div>
                </div>
                ${metricSourceHtml(id, status)}
            </div>`;
    }).join("");

    document.getElementById("sd-body").innerHTML = `
        <div class="sd-formula">Оноо = метрик бүрийн 30 хоногийн зорилтод хүрсэн хувийн дундаж.</div>
        ${name === "DISCIPLINE"
            ? `<div class="sd-formula sd-warn">Энэ тэнхлэгийг гадны апп БАТАЛГААЖУУЛААГҮЙ — өөрөө тэмдэглэсэн бүртгэлээс гарна.</div>`
            : ""}
        ${rows || `<div class="connected-empty">энэ атрибутад метрик холбогдоогүй</div>`}`;

    statusModal()?.classList.add("active");
}

// Дарах ба гарын товчлол — хоёулаа. Карт нь role="button" гэж зарласан
// тул Enter/Space ажиллах ЁСТОЙ: эс тэгвээс зарласнаа зөрчиж байгаа хэрэг.
document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest("#status-detail-modal .modal-content")) return;

    const cat = e.target.closest(".category-card[data-category]");
    if (cat) { openCategoryModal(cat.dataset.category); return; }

    const attr = e.target.closest(".attr-score-row[data-attribute]");
    if (attr) { openAttributeModal(attr.dataset.attribute); return; }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.target || !e.target.closest) return;

    const cat = e.target.closest(".category-card[data-category]");
    if (cat) { e.preventDefault(); openCategoryModal(cat.dataset.category); return; }

    const attr = e.target.closest(".attr-score-row[data-attribute]");
    if (attr) { e.preventDefault(); openAttributeModal(attr.dataset.attribute); }
});

document.getElementById("close-status-modal-btn")?.addEventListener("click", closeStatusModal);
statusModal()?.addEventListener("click", (e) => {
    if (e.target === statusModal()) closeStatusModal();
});

// Escape нь НЭЭЛТТЭЙ БҮХ цонхыг хаана. Гурван цонх тус тусдаа хаах товчтой
// байсан ч гарнаас хаах ганц ч зам байгаагүй.
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));
});

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
