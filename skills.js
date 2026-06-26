"use strict";

async function addSkillXp(skillId, amount) {
    const skill = webData.skills.find(s => s.id === skillId);
    if (!skill) return;

    const today = todayStr();
    if (skill.lastTrainDate === today) {
    } else if (skill.lastTrainDate) {
        const last = new Date(skill.lastTrainDate);
        const diff = Math.round((new Date(today) - last) / 86400000);
        if (diff === 1) {
            skill.streak = (skill.streak || 0) + 1;
        } else {
            skill.streak = 1;
        }
    } else {
        skill.streak = 1;
    }
    skill.lastTrainDate = today;

    skill.currentXp += amount;
    skill.totalXp = (skill.totalXp || 0) + amount;

    let leveledUp = false;
    while (skill.currentXp >= skill.xpToNextLevel) {
        skill.currentXp -= skill.xpToNextLevel;
        skill.level += 1;
        skill.xpToNextLevel = Math.floor(100 * Math.pow(1.2, skill.level - 1));
        leveledUp = true;
    }
    
    logDailyActivity(amount, false, skill.id, skill.category);

    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();

    if (leveledUp) {
        showToast(`[${skill.name}] Level Up! Lv.${skill.level} ✨`, "info", (SKILL_CAT[skill.category] || {}).hex || "#10b981");
        const card = document.querySelector(`.skill-card[data-id="${skill.id}"]`);
        if (card) {
            card.classList.remove("level-up-anim");
            void card.offsetWidth;
            card.classList.add("level-up-anim");
        }
    } else {
        showToast(`[${skill.name}] +${amount} Skill EXP нэмэгдлээ.`);
    }
}

async function deleteSkill(skillId) {
    if (!confirm("Ур чадварыг устгах уу?")) return;
    webData.skills = webData.skills.filter(s => s.id !== skillId);
    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();
    showToast("Ур чадвар устгагдлаа.");
}

// Event Bindings: Forms
document.getElementById("submit-skill-btn")?.addEventListener("click", async () => {
    const nameEl     = document.getElementById("skill-name");
    const categoryEl = document.getElementById("skill-category");
    const levelEl    = document.getElementById("skill-level");

    const name     = nameEl.value.trim();
    const category = categoryEl.value;
    const level    = Math.max(1, Math.min(100, parseInt(levelEl.value) || 1));

    if (!name)     { showToast("Ур чадварын нэрийг оруулна уу.", "error"); nameEl.focus();     return; }
    if (!category) { showToast("Ангилал сонгоно уу.", "error"); categoryEl.focus(); return; }

    if (webData.skills.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast("Ийм нэртэй ур чадвар аль хэдийн байна.", "error");
        return;
    }

    const xpToNextLevel = Math.floor(100 * Math.pow(1.2, level - 1));
    const newSkill = {
        id: Date.now(),
        name, category, level,
        currentXp: 0, xpToNextLevel,
        totalXp: 0, streak: 0,
        lastTrainDate: null
    };
    webData.skills.push(newSkill);
    await saveWebData();
    if(typeof renderWebUI === "function") renderWebUI();

    nameEl.value = "";
    categoryEl.value = "";
    levelEl.value = "1";
    showToast(`[${name}] ур чадвар нэмэгдлээ.`);
});

document.getElementById("submit-skill-exp-btn")?.addEventListener("click", async () => {
    const selectEl = document.getElementById("train-skill-select");
    const amountEl = document.getElementById("train-exp-amount");
    const skillId  = parseInt(selectEl.value);
    const amount   = parseInt(amountEl.value);

    if (!skillId || isNaN(skillId)) { showToast("Ур чадвар сонгоно уу.", "error"); selectEl.focus(); return; }
    if (!amount || isNaN(amount) || amount < 1) { showToast("EXP дүн 1-ээс их байх ёстой.", "error"); amountEl.focus(); return; }

    await addSkillXp(skillId, amount);
    amountEl.value = "";
});

// Modal Logic
function openSkillModal(skillId) {
    const skill = webData.skills.find(s => s.id === skillId);
    if (!skill) return;

    const cat   = SKILL_CAT[skill.category] || { color: "var(--accent)", hex: "#10b981", label: skill.category };
    const color = cat.color;

    document.getElementById("modal-skill-name").textContent        = skill.name;
    document.getElementById("modal-skill-category").textContent    = cat.label;
    document.getElementById("modal-skill-level").textContent       = skill.level;
    document.getElementById("modal-skill-level").style.color       = color;
    document.getElementById("modal-skill-total-exp").textContent   = (skill.totalXp || 0).toLocaleString();
    document.getElementById("modal-skill-streak").textContent      = `${skill.streak || 0} 🔥`;
    document.getElementById("modal-skill-rank").textContent        = getSkillMasteryRank(skill.level);

    const icon = document.getElementById("modal-skill-icon");
    icon.style.borderColor = cat.hex;
    icon.style.color       = cat.hex;

    const progressText = skill.level >= 100 || skill.xpToNextLevel === Infinity ? "MAX LEVEL" : `${skill.currentXp} / ${skill.xpToNextLevel} XP`;
    document.getElementById("modal-skill-progress-text").textContent = progressText;
    
    const pct = skill.xpToNextLevel === Infinity || skill.level >= 100 ? 100 : (skill.xpToNextLevel > 0 ? Math.min((skill.currentXp / skill.xpToNextLevel) * 100, 100) : 0);
    const bar = document.getElementById("modal-skill-progress-bar");
    bar.style.width      = `${pct}%`;
    bar.style.background = cat.hex;
    bar.style.boxShadow  = `0 0 15px ${cat.hex}`;

    document.getElementById("skill-modal").classList.add("active");
}

document.getElementById("close-modal-btn")?.addEventListener("click", () => {
    document.getElementById("skill-modal").classList.remove("active");
});
document.getElementById("skill-modal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("skill-modal")) {
        document.getElementById("skill-modal").classList.remove("active");
    }
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.getElementById("skill-modal")?.classList.remove("active");
});

function renderSkills() {
    const sContainer = document.getElementById("skills-container");
    const sSelect    = document.getElementById("train-skill-select");
    if (!sContainer || !sSelect) return;
    
    sContainer.innerHTML = "";
    sSelect.innerHTML = `<option value="" disabled selected>Ур чадвар сонгох...</option>`;

    if (webData.skills.length === 0) {
        sContainer.innerHTML = `<div class="empty-state"><strong>Ур чадвар алга</strong>Зүүн талд шинэ ур чадвар нэмж эхлүүлнэ үү.</div>`;
    } else {
        webData.skills.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = `[Lv.${s.level}] ${s.name}`;
            sSelect.appendChild(opt);

            const cat      = SKILL_CAT[s.category] || { color: "var(--accent)", hex: "#10b981", label: s.category };
            const progress = s.xpToNextLevel === Infinity || s.level >= 100 ? 100 : (s.xpToNextLevel > 0 ? Math.min((s.currentXp / s.xpToNextLevel) * 100, 100) : 0);

            const div = document.createElement("div");
            div.className = "skill-card";
            div.dataset.id = s.id;
            div.style.setProperty("--cat-color", cat.color);
            div.innerHTML = `
                <button class="delete-btn" data-type="skill" data-id="${s.id}" aria-label="Устгах">×</button>
                <div class="skill-card-header">
                    <div class="skill-info">
                        <h4>${escapeHTML(s.name)}</h4>
                        <span>${escapeHTML(cat.label)}</span>
                    </div>
                    <div class="skill-level-badge">L.${s.level}</div>
                </div>
                <div class="xp-row">
                    <span>EXPERIENCE</span>
                    <span>${s.level >= 100 || s.xpToNextLevel === Infinity ? "MAX" : `${s.currentXp} / ${s.xpToNextLevel}`}</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-bar" style="width:${progress}%;background:${cat.hex};box-shadow:0 0 8px ${cat.hex};"></div>
                </div>
                ${s.streak > 0 ? `<div class="skill-streak">${s.streak} 🔥</div>` : ""}`;

            div.addEventListener("click", (e) => {
                if (!e.target.closest(".delete-btn")) openSkillModal(s.id);
            });
            sContainer.appendChild(div);
        });
    }
}  
