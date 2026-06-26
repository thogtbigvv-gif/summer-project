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
    const lvlEl   = document.getElementById("skill-level");

    const name     = nameEl?.value.trim();
    const category = catEl?.value;
    const level    = Math.max(1, Math.min(100, parseInt(lvlEl?.value) || 1));

    if (!name)     { showToast("Ур чадварын нэр оруулна уу.", "error"); nameEl?.focus(); return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); catEl?.focus(); return; }
    if (webData.skills.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast("Ийм нэртэй ур чадвар аль хэдийн байна.", "error"); return;
    }

    const xpToNext = Math.floor(100 * Math.pow(1.2, level - 1));
    const newSkill = {
        id:           Date.now(),
        name,
        category,
        level,
        currentXp:    0,
        xpToNextLevel: xpToNext,
        totalXp:      0,
        streak:       0,
        lastTrainDate: null
    };

    webData.skills.push(newSkill);
    await saveWebData();
    renderWebUI();
    populateTrainSelect();

    nameEl.value  = "";
    catEl.value   = "";
    lvlEl.value   = "1";

    const catInfo = SKILL_CAT[category] || {};
    showToast(`"${name}" нэмэгдлээ! (${catInfo.label || category})`, "info", catInfo.hex);
}

async function deleteSkill(skillId) {
    if (!confirm("Ур чадварыг устгах уу?")) return;
    webData.skills = webData.skills.filter(s => s.id !== skillId);
    await saveWebData();
    renderWebUI();
    populateTrainSelect();
    closeSkillModal();
}

async function trainSkill() {
    const selectEl = document.getElementById("train-skill-select");
    const amountEl = document.getElementById("train-exp-amount");

    const skillId = parseInt(selectEl?.value);
    const amount  = parseInt(amountEl?.value);

    if (!skillId)        { showToast("Ур чадвар сонгоно уу.", "error"); return; }
    if (!amount || amount < 1) { showToast("XP хэмжээг оруулна уу.", "error"); amountEl?.focus(); return; }
    if (amount > 9999)   { showToast("Хэт их XP (хамгийн ихдээ 9999).", "error"); return; }

    const skill = webData.skills.find(s => s.id === skillId);
    if (!skill) return;

    // Streak шалгах
    const today = todayStr();
    const yesterday = (() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    })();

    if (skill.lastTrainDate === yesterday) {
        skill.streak = (skill.streak || 0) + 1;
    } else if (skill.lastTrainDate !== today) {
        skill.streak = 1;
    }
    skill.lastTrainDate = today;

    // XP нэмэх + level-up
    skill.currentXp += amount;
    skill.totalXp   = (skill.totalXp || 0) + amount;
    logDailyActivity(amount, false, skill.id, null);

    let leveled = false;
    while (skill.currentXp >= skill.xpToNextLevel) {
        skill.currentXp    -= skill.xpToNextLevel;
        skill.level        += 1;
        skill.xpToNextLevel = Math.floor(100 * Math.pow(1.2, skill.level - 1));
        leveled = true;
    }

    const catInfo = SKILL_CAT[skill.category] || {};
    await saveWebData();
    renderWebUI();

    if (leveled) {
        showToast(`${SKILL_ICONS[skill.category] || "★"} "${skill.name}" Level ${skill.level} боллоо! 🎉`, "info", catInfo.hex || "#fff");
        // Level-up animation
        const card = document.querySelector(`.skill-card[data-skill-id="${skillId}"]`);
        if (card) { card.classList.add("level-up-anim"); setTimeout(() => card.classList.remove("level-up-anim"), 1000); }
    } else {
        showToast(`+${amount} EXP — "${skill.name}"`, "info", catInfo.hex);
    }

    amountEl.value = "";
    amountEl.focus();
    // Refresh the live preview
    setTimeout(updateTrainPreview, 100);
}

// ===================== POPULATE TRAIN SELECT =====================

function populateTrainSelect() {
    const sel = document.getElementById("train-skill-select");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="" disabled selected>Ур чадвар сонгох...</option>`;
    webData.skills
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(s => {
            const icon = SKILL_ICONS[s.category] || "★";
            const opt  = document.createElement("option");
            opt.value  = s.id;
            opt.textContent = `${icon} ${s.name} (Lv.${s.level})`;
            sel.appendChild(opt);
        });
    if (prev) {
        sel.value = prev;
        updateTrainPreview();
    } else {
        const preview = document.getElementById("train-skill-preview");
        if (preview) preview.style.display = "none";
    }
}

// Enter key on EXP input triggers train
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("train-exp-amount")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") trainSkill();
    });
});

// ===================== RENDER: SKILL CARDS =====================

function renderSkills() {
    const container = document.getElementById("skills-container");
    if (!container) return;
    container.innerHTML = "";
    populateTrainSelect();

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
    let quickTrain = modalEl.querySelector(".modal-quick-train");
    if (!quickTrain) {
        quickTrain = document.createElement("div");
        quickTrain.className = "modal-quick-train";
        quickTrain.innerHTML = `
            <div style="border-top:1px solid var(--glass-border);margin-top:20px;padding-top:20px;">
                <label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);display:block;margin-bottom:8px;letter-spacing:1px;">QUICK TRAIN</label>
                <div style="display:flex;gap:8px;">
                    <input type="number" class="modal-train-input" placeholder="EXP хэмжээ" min="1" max="9999"
                        style="flex:1;padding:10px 12px;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);color:var(--text-main);border-radius:10px;font-family:var(--font-body);font-size:13px;outline:none;">
                    <button class="modal-train-btn submit-btn" style="width:auto;margin-top:0;padding:10px 20px;flex-shrink:0;">+ EXP</button>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                    ${[10,20,50,100].map(v => `<button class="quick-xp-btn" data-val="${v}" style="flex:1;padding:7px 4px;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);color:var(--text-muted);border-radius:8px;cursor:pointer;font-family:var(--font-mono);font-size:11px;transition:all 0.2s;">+${v}</button>`).join("")}
                </div>
            </div>`;
        modalEl.querySelector(".modal-content").appendChild(quickTrain);

        // Quick XP buttons
        quickTrain.querySelectorAll(".quick-xp-btn").forEach(btn => {
            btn.addEventListener("mouseenter", () => { btn.style.color = catInfo.hex; btn.style.borderColor = catInfo.hex + "44"; });
            btn.addEventListener("mouseleave", () => { btn.style.color = ""; btn.style.borderColor = ""; });
            btn.addEventListener("click", () => {
                quickTrain.querySelector(".modal-train-input").value = btn.dataset.val;
            });
        });

        // Train button
        quickTrain.querySelector(".modal-train-btn").addEventListener("click", async () => {
            const inp = quickTrain.querySelector(".modal-train-input");
            const amt = parseInt(inp.value);
            if (!amt || amt < 1) { showToast("EXP хэмжээ оруулна уу.", "error"); return; }

            // train-skill-select-ийг зөв skill рүү шилжүүлэх
            const trainSel = document.getElementById("train-skill-select");
            if (trainSel) trainSel.value = skillId;
            document.getElementById("train-exp-amount").value = amt;

            await trainSkill();
            inp.value = "";
            // Refresh modal stats
            openSkillModal(skillId);
        });
    } else {
        // Аль хэдийн байгаа бол input цэвэрлэх
        quickTrain.querySelector(".modal-train-input").value = "";
    }

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
document.getElementById("submit-skill-exp-btn")?.addEventListener("click", trainSkill);

// ===== NEW: Live skill preview when selecting from train dropdown =====
function updateTrainPreview() {
    const sel = document.getElementById("train-skill-select");
    const preview = document.getElementById("train-skill-preview");
    if (!sel || !preview) return;

    const skillId = parseInt(sel.value);
    const skill = webData.skills.find(s => s.id === skillId);

    if (!skill) {
        preview.style.display = "none";
        return;
    }

    const catInfo = SKILL_CAT[skill.category] || { hex: "#6b7280" };
    const pct = skill.xpToNextLevel > 0
        ? Math.min((skill.currentXp / skill.xpToNextLevel) * 100, 100)
        : 100;

    document.getElementById("tsp-name").textContent = skill.name;
    document.getElementById("tsp-level").textContent = `Lv.${skill.level}`;

    const bar = document.getElementById("tsp-xp-bar");
    bar.style.width = `${pct.toFixed(1)}%`;
    bar.style.background = catInfo.hex;
    bar.style.boxShadow = `0 0 6px ${catInfo.hex}`;

    document.getElementById("tsp-xp-text").textContent = `${skill.currentXp} / ${skill.xpToNextLevel} EXP`;
    document.getElementById("tsp-level").style.color = catInfo.hex;

    preview.style.display = "block";
}

document.getElementById("train-skill-select")?.addEventListener("change", function () {
    updateTrainPreview();
    const amountEl = document.getElementById("train-exp-amount");
    if (amountEl && !amountEl.value) amountEl.focus();
});

// ===== NEW: EXP preset buttons (new class) =====
document.querySelectorAll(".exp-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const amountEl = document.getElementById("train-exp-amount");
        if (amountEl) {
            amountEl.value = btn.dataset.val;
            // Visual feedback
            document.querySelectorAll(".exp-preset-btn").forEach(b => b.classList.remove("active-preset"));
            btn.classList.add("active-preset");
            setTimeout(() => btn.classList.remove("active-preset"), 600);
            amountEl.focus();
        }
    });
});

// ===== Legacy: quick-xp-preset (sidebar) =====
document.querySelectorAll(".quick-xp-preset").forEach(btn => {
    btn.addEventListener("click", () => {
        const amountEl = document.getElementById("train-exp-amount");
        if (amountEl) { amountEl.value = btn.dataset.val; amountEl.focus(); }
    });
});

// ===== NEW: Add Skill collapsible toggle =====
const toggleAddSkillBtn = document.getElementById("toggle-add-skill-btn");
const addSkillPanel = document.getElementById("add-skill-panel");
if (toggleAddSkillBtn && addSkillPanel) {
    toggleAddSkillBtn.addEventListener("click", () => {
        const isOpen = toggleAddSkillBtn.getAttribute("aria-expanded") === "true";
        toggleAddSkillBtn.setAttribute("aria-expanded", String(!isOpen));
        addSkillPanel.style.display = isOpen ? "none" : "block";
    });
}

// Refresh preview after training
const _origTrainSkill = trainSkill;
// Wrap trainSkill to refresh preview afterwards (safe patch)
const _trainSkillBtn = document.getElementById("submit-skill-exp-btn");
if (_trainSkillBtn) {
    // Already bound above; we hook into renderWebUI refresh
}

// Patch: after renderWebUI, refresh preview
const _origRenderWebUI = typeof renderWebUI === "function" ? renderWebUI : null;
// We hook via MutationObserver on the select instead
const trainSelectEl = document.getElementById("train-skill-select");
if (trainSelectEl) {
    const mo = new MutationObserver(() => updateTrainPreview());
    mo.observe(trainSelectEl, { childList: true });
}
