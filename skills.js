"use strict";

// ===================== SKILL CATEGORY ICONS =====================
const SKILL_ICONS = {
    language:   "🌐",
    physical:   "⚡",
    mental:     "🧠",
    technology: "💻"
};

// ===================== SKILL CORE ACTIONS =====================

async function addSkill() {
    const nameEl    = document.getElementById("skill-name");
    const catEl     = document.getElementById("skill-category");
    const metricEl  = document.getElementById("skill-metric");

    const name     = nameEl?.value.trim();
    const category = catEl?.value;
    const metricId = (metricEl && metricEl.value) ? metricEl.value : null;

    if (!name)     { showToast("Ур чадварын нэр оруулна уу.", "error"); nameEl?.focus(); return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); catEl?.focus(); return; }
    if (webData.skills.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast("Ийм нэртэй ур чадвар аль хэдийн байна.", "error"); return;
    }

    // Ур чадвар нь НЭР + АНГИЛАЛ + нотолгооны эх сурвалж (metricId). Түвшин, XP
    // гэсэн ойлголт байхгүй — харагдах тоо бүрийг status.js нотолгооноос гаргана.
    webData.skills.push({ id: Date.now(), name, category, metricId });

    await saveWebData();
    renderWebUI();

    nameEl.value  = "";
    catEl.value   = "";
    if (metricEl) metricEl.value = "";

    const catInfo = SKILL_CAT[category] || {};
    showToast(`"${name}" нэмэгдлээ! (${catInfo.label || category})`, "info", catInfo.hex);
}

async function deleteSkill(skillId) {
    if (!confirm("Ур чадварыг устгах уу?")) return;
    webData.skills = webData.skills.filter(s => s.id !== skillId);
    await saveWebData();
    renderWebUI();
    closeSkillModal();
}

// ===================== METRIC PICKER =====================
// Сонголтуудыг METRIC_DEFS-ээс рендерийн үед барина — метрик нэмэхэд энд юу ч
// засахгүй. status.js-ийн бүртгэл л цорын ганц эх сурвалж.

function renderSkillMetricOptions() {
    const select = document.getElementById("skill-metric");
    if (!select) return;

    const defs = (typeof METRIC_DEFS !== "undefined" && METRIC_DEFS) ? METRIC_DEFS : {};
    const keep = select.value;

    select.innerHTML = `<option value="">— холбоогүй —</option>` +
        Object.keys(defs).map(id => {
            const def  = defs[id] || {};
            const text = `${def.label || id}${def.unit ? ` (${def.unit})` : ""}`;
            return `<option value="${escapeHTML(id)}">${escapeHTML(text)}</option>`;
        }).join("");

    if (keep && defs[keep]) select.value = keep;
}

// ===================== RENDER: SKILL CARDS =====================

function renderSkills() {
    renderSkillMetricOptions();

    const container = document.getElementById("skills-container");
    if (!container) return;
    container.innerHTML = "";

    if (webData.skills.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div style="font-size:40px;margin-bottom:12px;">🌱</div>
                <strong>Ур чадвар байхгүй байна</strong>
                <p style="margin-top:6px;font-size:12px;">Зүүн талаас шинэ ур чадвар нэмнэ үү.</p>
            </div>`;
        return;
    }

    const status = (typeof Status !== "undefined" && Status) ? Status.get() : null;

    webData.skills.forEach(skill => {
        const catInfo = SKILL_CAT[skill.category]  || { hex: "#6b7280", label: "Бусад" };
        const icon    = SKILL_ICONS[skill.category] || "★";
        const metric  = (status && skill.metricId) ? status.metrics[skill.metricId] : null;

        const card = document.createElement("div");
        card.className  = "skill-card";
        card.dataset.skillId = skill.id;
        card.style.setProperty("--cat-color", catInfo.color || catInfo.hex);

        // Тоо бүр НОТОЛГООНООС. Холбоогүй ур чадвар нь худал тоо харуулахгүй —
        // холбоогүй гэдгээ шулуухан хэлнэ.
        const body = metric
            ? `
            <div class="skill-xp-area">
                <div class="skill-xp-label">
                    <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">СҮҮЛИЙН 30 ХОНОГ</span>
                    <span style="font-family:var(--font-mono);font-size:11px;">${formatDelta(metric.change30Pct, metric.last30, metric.prev30)}</span>
                </div>
                <div class="skill-headline" style="font-family:var(--font-display);font-size:22px;color:${catInfo.hex};">
                    ${Number(metric.last30).toLocaleString()} <span style="font-size:12px;color:var(--text-muted);">${escapeHTML(metric.unit)}</span>
                </div>
            </div>

            <div class="skill-footer">
                <div class="skill-meta-row">
                    <span class="skill-active-days" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">
                        ${metric.activeDays30}/30 идэвхтэй өдөр
                    </span>
                </div>
                ${metric.streakDays > 0
                    ? `<div class="skill-streak">🔥 ${metric.streakDays} өдөр</div>`
                    : `<div class="skill-streak" style="opacity:0.3;">— streak</div>`
                }
            </div>`
            : `
            <div class="skill-xp-area">
                <div class="connected-empty">нотолгооны эх сурвалж холбоогүй</div>
            </div>`;

        card.innerHTML = `
            <div class="skill-card-header">
                <div class="skill-info">
                    <h4>${escapeHTML(skill.name)}</h4>
                    <span style="color:${catInfo.hex}">${icon} ${escapeHTML(catInfo.label)}</span>
                </div>
            </div>
            ${body}
            <button class="delete-btn" data-id="${skill.id}" data-type="skill" aria-label="Устгах" title="Устгах">×</button>`;

        card.addEventListener("click", (e) => {
            if (e.target.closest(".delete-btn")) return;
            openSkillModal(skill.id);
        });

        container.appendChild(card);
    });
}

// ===================== SKILL DETAIL MODAL =====================

function openSkillModal(skillId) {
    const skill = webData.skills.find(s => s.id === skillId);
    if (!skill) return;

    const catInfo = SKILL_CAT[skill.category] || { hex: "#6b7280", label: "Бусад" };
    const icon    = SKILL_ICONS[skill.category] || "★";
    const status  = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const metric  = (status && skill.metricId) ? status.metrics[skill.metricId] : null;

    document.getElementById("modal-skill-icon").textContent  = icon;
    document.getElementById("modal-skill-icon").style.color  = catInfo.hex;
    document.getElementById("modal-skill-icon").style.borderColor = catInfo.hex + "44";
    document.getElementById("modal-skill-name").textContent  = skill.name;
    document.getElementById("modal-skill-category").textContent = metric
        ? `${catInfo.label} · ${metric.label}`
        : `${catInfo.label} · нотолгооны эх сурвалж холбоогүй`;

    const last30El = document.getElementById("modal-skill-last30");
    last30El.textContent = metric ? `${Number(metric.last30).toLocaleString()} ${metric.unit}` : "—";
    last30El.style.color = metric ? catInfo.hex : "var(--text-muted)";

    document.getElementById("modal-skill-change").innerHTML =
        metric ? formatDelta(metric.change30Pct, metric.last30, metric.prev30) : "—";
    document.getElementById("modal-skill-streak").textContent =
        (metric && metric.streakDays > 0) ? `${metric.streakDays} 🔥` : "—";
    document.getElementById("modal-skill-active").textContent =
        metric ? `${metric.activeDays30}/30` : "—";

    // Дээрх дөрвөн тоо хаанаас гарсныг ил гаргана. Ур чадвар "42,000 kg" гэж
    // хэлээд зогсохгүй, ямар бичлэгүүд түүнийг үүсгэснийг зааж өгнө.
    const evidenceEl = document.getElementById("modal-skill-evidence");
    if (evidenceEl) evidenceEl.innerHTML = metric ? provenanceHtml(metric, 8) : "";

    document.getElementById("skill-modal").classList.add("active");
}

function closeSkillModal() {
    document.getElementById("skill-modal")?.classList.remove("active");
}

document.getElementById("close-modal-btn")?.addEventListener("click", closeSkillModal);
document.getElementById("skill-modal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("skill-modal")) closeSkillModal();
});

// ===================== FORM EVENT LISTENERS =====================

document.getElementById("submit-skill-btn")?.addEventListener("click", addSkill);
