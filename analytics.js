"use strict";

// Радар нь атрибутын оноог зурна — status.js-ийн гаргасан "30 хоногийн бодит
// зорилтод хэр ойрхон вэ" гэсэн хувь. Түвшин, XP уншихаа больсон.
function renderAttributesRadar() {
    const container = document.getElementById("radar-container");
    if (!container) return;

    const status     = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const attributes = (status && status.attributes) ? status.attributes : {};
    const hexes      = { BODY: "#ef4444", MIND: "#8b5cf6", CREATION: "#10b981" };

    const stats = Object.keys(attributes).map(name => ({
        name,
        value: Math.max(0, Math.min(100, Number(attributes[name].score) || 0)),
        hex:   hexes[name] || "#eab308"
    }));
    if (stats.length < 3) { container.innerHTML = ""; return; }

    const axes = stats.length;
    const size = 300, center = size / 2, radius = 100;
    let svg = `<svg class="radar-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

    for (let ring = 1; ring <= 3; ring++) {
        const r = radius * (ring / 3);
        let pts = "";
        for (let i = 0; i < axes; i++) {
            const a = (Math.PI * 2 * i) / axes - Math.PI / 2;
            pts += `${center + r * Math.cos(a)},${center + r * Math.sin(a)} `;
        }
        svg += `<polygon points="${pts.trim()}" class="radar-grid"/>`;
    }

    let dataPoints = "";
    stats.forEach((stat, i) => {
        const a    = (Math.PI * 2 * i) / axes - Math.PI / 2;
        const endX = center + radius * Math.cos(a);
        const endY = center + radius * Math.sin(a);
        svg += `<line x1="${center}" y1="${center}" x2="${endX}" y2="${endY}" class="radar-axis"/>`;

        const lx = center + (radius + 28) * Math.cos(a);
        const ly = center + (radius + 28) * Math.sin(a);
        const hi = stat.value >= 70 ? "highlight" : "";
        svg += `<text x="${lx}" y="${ly}" class="radar-label ${hi}">${stat.name}</text>`;

        const safeV   = Math.max(0, Math.min(100, stat.value));
        const vr      = radius * (safeV / 100);
        const vx      = center + vr * Math.cos(a);
        const vy      = center + vr * Math.sin(a);
        dataPoints   += `${vx},${vy} `;
        svg += `<circle cx="${vx}" cy="${vy}" r="4" fill="${stat.hex}" filter="drop-shadow(0 0 6px ${stat.hex})"/>`;
    });

    svg += `<polygon points="${dataPoints.trim()}" class="radar-polygon"/>`;
    svg += `</svg>`;
    container.innerHTML = svg;
}

const AnalyticsEngine = {
    getPastDays(numDays) {
        const dates = [];
        for (let i = numDays - 1; i >= 0; i--) {
            // todayStr()-тай ижил аргаар, өдрийн зөрүүг тооцон огноог үүсгэнэ
            const d = new Date();
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
    },
    aggregatePeriod(daysArray) {
        let totalXp = 0, quests = 0, activeDays = 0;
        let catXp = {}, skillXp = {};
        daysArray.forEach(date => {
            const log = webData.history[date];
            if (log) {
                if (log.totalXp > 0 || log.questsCompleted > 0 || Object.keys(log.skillXp).length > 0) activeDays++;
                totalXp += log.totalXp || 0;
                quests += log.questsCompleted || 0;
                for (let c in log.categoryXp) catXp[c] = (catXp[c] || 0) + log.categoryXp[c];
                for (let s in log.skillXp) skillXp[s] = (skillXp[s] || 0) + log.skillXp[s];
            }
        });
        return { totalXp, quests, activeDays, catXp, skillXp };
    },
    renderDashboard() {
        const last7 = this.getPastDays(7);
        const prev7 = this.getPastDays(14).slice(0, 7);
        const last30 = this.getPastDays(30);

        const curr = this.aggregatePeriod(last7);
        const prev = this.aggregatePeriod(prev7);

        this.renderWeeklyStats(curr);
        this.renderHeatmap(last30);
        this.renderCategoryGrowth(curr, prev);
        this.generateInsights(curr, prev, last7);
        this.renderSkillTable(curr);
    },
    renderWeeklyStats(curr) {
        const consistency = Math.round((curr.activeDays / 7) * 100);
        const container = document.getElementById('weekly-stats-container');
        if (!container) return;
        container.innerHTML = `
            <div class="stat-card-pro"><span>WEEKLY XP</span><strong>+${curr.totalXp}</strong></div>
            <div class="stat-card-pro"><span>QUESTS COMPLETED</span><strong>${curr.quests}</strong></div>
            <div class="stat-card-pro"><span>ACTIVE DAYS</span><strong>${curr.activeDays} / 7</strong></div>
            <div class="stat-card-pro"><span>CONSISTENCY</span><strong style="color: ${consistency >= 80 ? 'var(--accent)' : '#fff'}">${consistency}%</strong></div>
        `;
    },
    renderHeatmap(last30) {
        const container = document.getElementById('activity-heatmap');
        if (!container) return;
        let html = '';
        last30.forEach(date => {
            const log = webData.history[date];
            const xp = log ? (log.totalXp || 0) : 0;
            let heatClass = 'heat-lvl-1';
            if (xp === 0) heatClass = '';
            else if (xp > 0 && xp < 50) heatClass = 'heat-lvl-1';
            else if (xp >= 50 && xp < 150) heatClass = 'heat-lvl-2';
            else if (xp >= 150 && xp < 300) heatClass = 'heat-lvl-3';
            else if (xp >= 300) heatClass = 'heat-lvl-4';

            html += `<div class="heat-box ${heatClass}" title="${date}: ${xp} XP"></div>`;
        });
        container.innerHTML = html;
    },
    renderCategoryGrowth(curr, prev) {
        const container = document.getElementById('category-growth-container');
        if (!container) return;
        let html = '';
        for (const catKey in webData.categories) {
            const catName = webData.categories[catKey].name;
            const cXp = curr.catXp[catKey] || 0;
            const pXp = prev.catXp[catKey] || 0;
            let delta = pXp === 0 ? (cXp > 0 ? 100 : 0) : Math.round(((cXp - pXp) / pXp) * 100);
            
            let tClass = 'trend-flat', tIcon = '→';
            if (delta > 0) { tClass = 'trend-up'; tIcon = '↑'; }
            if (delta < 0) { tClass = 'trend-down'; tIcon = '↓'; }

            html += `
                <div class="mission-task" style="cursor: default;">
                    <div class="task-name">${escapeHTML(catName)}</div>
                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-right:12px;">Cur: ${cXp} | Prv: ${pXp}</span>
                    <div class="trend-indicator ${tClass}">${tIcon} ${delta}%</div>
                </div>
            `;
        }
        container.innerHTML = html;
    },
    generateInsights(curr, prev, last7Days) {
        const insights = [];
        if (curr.activeDays === 7) insights.push({ text: "Perfect consistency this week. Maintain current trajectory.", type: "normal" });
        else if (curr.activeDays < 3) insights.push({ text: "Activity dropping. Recommend focusing on E-Rank quests to rebuild momentum.", type: "warning" });

        let inactiveCat = null;
        for (const cat in webData.categories) {
            if (!curr.catXp[cat]) { inactiveCat = webData.categories[cat].name; break; }
        }
        if (inactiveCat) insights.push({ text: `Warning: Zero activity detected in [${inactiveCat}]. Consider assigning a task here.`, type: "warning" });

        let bestSkillId = null, maxSkillXp = 0;
        for (const id in curr.skillXp) {
            if (curr.skillXp[id] > maxSkillXp) { maxSkillXp = curr.skillXp[id]; bestSkillId = id; }
        }
        if (bestSkillId) {
            const skill = webData.skills.find(s => s.id == bestSkillId);
            if (skill) insights.push({ text: `[${skill.name}] is your fastest growing skill this week (+${maxSkillXp} EXP).`, type: "normal" });
        }

        const container = document.getElementById('ai-insights-list');
        if (!container) return;
        if (insights.length === 0) insights.push({text: "System operating nominally. Keep pushing forward.", type: "normal"});
        container.innerHTML = insights.map(i => `<div class="insight-item ${i.type}">${escapeHTML(i.text)}</div>`).join('');
    },
    renderSkillTable(curr) {
        const tbody = document.querySelector('#skill-analytics-table tbody');
        if (!tbody) return;
        
        const select = document.getElementById("analytics-sort");
        const sortBy = select ? select.value : "level";
        
        let sorted = [...webData.skills];
        if (sortBy === "growth") sorted.sort((a,b) => (curr.skillXp[b.id]||0) - (curr.skillXp[a.id]||0));

        let html = '';
        sorted.forEach(s => {
            const wGain = curr.skillXp[s.id] || 0;
            const catHex = SKILL_CAT[s.category] ? SKILL_CAT[s.category].hex : "#10b981";
            html += `
                <tr>
                    <td><span style="color:${catHex}; margin-right:8px;">■</span>${escapeHTML(s.name)}</td>
                    <td style="font-family: var(--font-display); color: var(--accent);">—</td>
                    <td style="font-family: var(--font-mono);">—</td>
                    <td style="color: ${wGain > 0 ? 'var(--accent)' : 'var(--text-muted)'}; font-family: var(--font-mono);">+${wGain}</td>
                    <td style="font-family: var(--font-mono);">${'-'}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }
};

const sortSelect = document.getElementById("analytics-sort");
if (sortSelect) {
    sortSelect.addEventListener("change", () => {
        AnalyticsEngine.renderSkillTable(AnalyticsEngine.aggregatePeriod(AnalyticsEngine.getPastDays(7)));
    });
}
