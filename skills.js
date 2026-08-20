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
    const nameEl  = document.getElementById("skill-name");
    const catEl   = document.getElementById("skill-category");

    const name     = nameEl?.value.trim();
    const category = catEl?.value;

    if (!name)     { showToast("Ур чадварын нэр оруулна уу.", "error"); nameEl?.focus(); return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); catEl?.focus(); return; }
    if (webData.skills.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast("Ийм нэртэй ур чадвар аль хэдийн байна.", "error"); return;
    }

    // Ур чадвар нь зөвхөн НЭР + АНГИЛАЛ. Түвшин, XP гэсэн ойлголт байхгүй —
    // статусыг status.js нотолгооноос гаргана (Design §4).
    webData.skills.push({ id: Date.now(), name, category });

    await saveWebData();
    renderWebUI();

    nameEl.value  = "";
    catEl.value   = "";

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

// ===================== RENDER: SKILL CARDS =====================

function renderSkills() {
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

    webData.skills.forEach(skill => {
        const catInfo  = SKILL_CAT[skill.category]  || { hex: "#6b7280", label: "Бусад" };
        const icon     = SKILL_ICONS[skill.category] || "★";
        const pct      = skill.xpToNextLevel > 0
            ? Math.min((skill.currentXp / skill.xpToNextLevel) * 100, 100)
            : 100;
        const mastery  = getSkillMasteryRank(skill.level);
        const today    = todayStr();
        const trained  = skill.lastTrainDate === today;

        const card = document.createElement("div");
        card.className  = "skill-card";
        card.dataset.skillId = skill.id;
        card.style.setProperty("--cat-color", catInfo.color || catInfo.hex);

        card.innerHTML = `
            <div class="skill-card-header">
                <div class="skill-info">
                    <h4>${escapeHTML(skill.name)}</h4>
                    <span style="color:${catInfo.hex}">${icon} ${escapeHTML(catInfo.label)}</span>
                </div>
                <div class="skill-level-badge" style="background:${catInfo.hex};box-shadow:0 0 14px ${catInfo.hex}55;">
                    ${skill.level}
                </div>
            </div>

            <div class="skill-xp-area">
                <div class="skill-xp-label">
                    <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">EXP</span>
                    <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${skill.currentXp} / ${skill.xpToNextLevel}</span>
                </div>
                <div class="progress-bg" style="margin-bottom:10px;">
                    <div class="progress-bar" style="width:${pct.toFixed(1)}%;background:${catInfo.hex};box-shadow:0 0 8px ${catInfo.hex}88;"></div>
                </div>
            </div>

            <div class="skill-footer">
                <div class="skill-meta-row">
                    <span class="skill-mastery-badge" style="border-color:${catInfo.hex}44;color:${catInfo.hex};">${mastery}</span>
                    ${trained ? `<span class="skill-trained-today">✓ Өнөөдөр</span>` : ""}
                </div>
                ${skill.streak > 0
                    ? `<div class="skill-streak">🔥 ${skill.streak} өдөр</div>`
                    : `<div class="skill-streak" style="opacity:0.3;">— streak</div>`
                }
            </div>

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
    const pct     = skill.xpToNextLevel > 0
        ? Math.min((skill.currentXp / skill.xpToNextLevel) * 100, 100)
        : 100;

    document.getElementById("modal-skill-icon").textContent  = icon;
    document.getElementById("modal-skill-icon").style.color  = catInfo.hex;
    document.getElementById("modal-skill-icon").style.borderColor = catInfo.hex + "44";
    document.getElementById("modal-skill-name").textContent  = skill.name;
    document.getElementById("modal-skill-category").textContent = catInfo.label;
    document.getElementById("modal-skill-level").textContent = `Lv. ${skill.level}`;
    document.getElementById("modal-skill-level").style.color = catInfo.hex;
    document.getElementById("modal-skill-total-exp").textContent = (skill.totalXp || 0).toLocaleString();
    document.getElementById("modal-skill-streak").textContent = skill.streak > 0 ? `${skill.streak} 🔥` : "—";
    document.getElementById("modal-skill-rank").textContent  = getSkillMasteryRank(skill.level);
    document.getElementById("modal-skill-rank").style.color  = catInfo.hex;
    document.getElementById("modal-skill-progress-text").textContent = `${skill.currentXp} / ${skill.xpToNextLevel}`;

    const bar = document.getElementById("modal-skill-progress-bar");
    bar.style.width = `${pct.toFixed(1)}%`;
    bar.style.background = catInfo.hex;
    bar.style.boxShadow  = `0 0 10px ${catInfo.hex}`;

    // Modal-аас шууд тренинг хийх UI
    const modalEl = document.getElementById("skill-modal");
    modalEl.classList.add("active");
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
