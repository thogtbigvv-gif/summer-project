"use strict";

// Радар нь атрибутын оноог зурна — status.js-ийн гаргасан "30 хоногийн бодит
// зорилтод хэр ойрхон вэ" гэсэн хувь. Түвшин, XP уншихаа больсон.
function renderAttributesRadar() {
    const container = document.getElementById("radar-container");
    if (!container) return;

    const status     = (typeof Status !== "undefined" && Status) ? Status.get() : null;
    const attributes = (status && status.attributes) ? status.attributes : {};
    const stats = Object.keys(attributes).map(name => ({
        name,
        value: Math.max(0, Math.min(100, Number(attributes[name].score) || 0)),
        hex:   ATTR_HEX[name] || "#eab308"
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

// ===================== СПАРКЛАЙН =====================
// Радартай ижил арга: SVG-г гараар барина, номын сан байхгүй.

const SPARK_W = 240, SPARK_H = 40, SPARK_PAD = 3;

function metricSparklineSvg(series, hex) {
    const points = (Array.isArray(series) ? series : []).map(p => Number(p && p.value) || 0);
    const n = points.length;
    if (n === 0) return "";

    const max    = Math.max.apply(null, points);
    const usable = SPARK_H - SPARK_PAD * 2;
    const baseY  = SPARK_H - SPARK_PAD;

    // Бүх утга 0 бол max нь 0 — тэгвэл ХАВТГАЙ шугам зурна (эвдэрсэн зам биш).
    const xAt = i => (n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W);
    const yAt = v => (max > 0 ? baseY - (v / max) * usable : baseY);

    const path = points.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");

    return `<svg class="spark-svg" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none"
                 xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="0" y1="${baseY}" x2="${SPARK_W}" y2="${baseY}" stroke="${hex}" stroke-opacity="0.18" stroke-width="1"/>
        <polyline points="${path}" fill="none" stroke="${hex}" stroke-width="1.6"
                  stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

// ===================== АНАЛИТИК =====================
// Энэ таб webData-д ЮУ Ч бичихгүй, ямар ч хадгалагдсан тоо УНШИХГҮЙ. Бүх панел
// Status.get()-ээс — өөрөөр хэлбэл нотолгооноос — гарна. Хоосон бол хоосон гэж
// хэлнэ, тоо зохиохгүй.

const SPARK_DAYS  = 90;                       // спарклайнд харуулах хоног
const HEATMAP_DAYS = 30;
const EMPTY_HTML  = msg => `<div class="connected-empty">${msg}</div>`;

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

    // Дашбоард бүхэлдээ НЭГ гаргалтаас тэжээгдэнэ — панел хооронд зөрөхгүй.
    status() {
        return (typeof Status !== "undefined" && Status) ? Status.get() : null;
    },

    metricList(status) {
        if (!status || !status.metrics) return [];
        return Object.keys(status.metrics).map(id => status.metrics[id]).filter(Boolean);
    },

    hasEvidence(status) {
        return !!(status && status.overall && Number(status.overall.totalEvents) > 0);
    },

    renderDashboard() {
        const status = this.status();
        this.renderWeeklyStats(status);
        this.renderHeatmap(status);
        this.renderMetricSparklines(status);
        this.renderIntegrity(status);
        this.renderCategoryGrowth(status);
        this.generateInsights(status);
        this.renderSkillTable(status);
    },

    // ---- НОТОЛГООНЫ ХЭЛХЭЭНИЙ БҮРЭН БҮТЭН БАЙДАЛ ----
    // Дээрх бүх самбар "нотолгоо зөв ирж байгаа" гэдэгт найдана. Тэр таамаг
    // худал болвол тоонууд эвдрэхгүй — ЧИМЭЭГҮЙ БУУРНА, тэгээд хэрэглэгч
    // өөрийгөө буруутгана. Энэ самбар яг тэр ялгааг харуулах үүрэгтэй:
    // эх сурвалж тус бүр хэзээ юу мэдээлсэн, юу нь тасарсан бэ.

    integrityRows(status) {
        const sources = (status && status.sources && typeof status.sources === "object")
            ? status.sources : {};
        return Object.keys(sources).map(app => {
            const source = sources[app] || {};
            const updatedAt = Number(source.updatedAt) || 0;
            return {
                app,
                label:    source.label || app,
                updatedAt,
                total:    Number(source.evidenceCount) || 0,
                raw:      Number(source.rawCount)      || 0,
                rolled:   Number(source.rolledCount)   || 0,
                last30:   Number(source.last30Count)   || 0,
                // Хэзээ ч мэдээлж үзээгүй эх сурвалж нь "тасарсан" биш —
                // зүгээр л холбогдоогүй. Хоёрыг ялгана.
                state:    updatedAt <= 0 ? "silent" : (source.stale ? "stale" : "live")
            };
        }).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    INTEGRITY_STATE_TEXT: { live: "LIVE", stale: "ТАСАРСАН", silent: "ХОЛБОГДООГҮЙ" },

    renderIntegrity(status) {
        const list = document.getElementById("integrity-sources");
        const warn = document.getElementById("integrity-warnings");
        const meta = document.getElementById("integrity-meta");
        if (!list) return;

        const rows = this.integrityRows(status);

        if (meta) {
            const live = rows.filter(r => r.state === "live").length;
            meta.textContent = rows.length === 0
                ? "ЭХ СУРВАЛЖ АЛГА"
                : `${live} / ${rows.length} ЭХ СУРВАЛЖ ИДЭВХТЭЙ`;
        }

        list.innerHTML = rows.length === 0
            ? EMPTY_HTML("эх сурвалж бүртгэгдээгүй байна")
            : rows.map(row => `
                <div class="integrity-row" data-state="${row.state}">
                    <span class="integrity-name">${escapeHTML(row.label)}</span>
                    <span class="integrity-state">${this.INTEGRITY_STATE_TEXT[row.state] || row.state}</span>
                    <span class="integrity-when">${escapeHTML(
                        (typeof relativeTime === "function" ? relativeTime(row.updatedAt) : null) || "—")}</span>
                    <span class="integrity-count">
                        ${row.total.toLocaleString()} нотолгоо
                        <small>${row.rolled > 0 ? `${row.raw.toLocaleString()} түүхий · ${row.rolled.toLocaleString()} нэгтгэсэн` : "бүгд түүхий"}</small>
                    </span>
                    <span class="integrity-30">${row.last30.toLocaleString()}<small>30 хоног</small></span>
                </div>`).join("");

        if (!warn) return;

        // Хэлхээ тасарсан ХОЁР шалтгаан. Хоёулаа статусыг чимээгүй буруу болгоно.
        const overall  = (status && status.overall) ? status.overall : {};
        const unmapped = Array.isArray(overall.unmappedTypes) ? overall.unmappedTypes : [];
        const gaps     = Array.isArray(overall.rollupGaps)    ? overall.rollupGaps    : [];

        const blocks = [];
        if (unmapped.length > 0) {
            blocks.push(`
                <div class="integrity-warning">
                    <strong>Танигдаагүй event төрөл</strong>
                    <p>Эдгээрийг ямар метрик болгохыг status.js-ийн METRICS бүртгэл мэдэхгүй тул
                       статуст ОГТ ороогүй: ${escapeHTML(unmapped.join(", "))}</p>
                </div>`);
        }
        if (gaps.length > 0) {
            const byMetric = {};
            gaps.forEach(gap => {
                const key = gap.metric || "?";
                byMetric[key] = (byMetric[key] || 0) + (Number(gap.count) || 0);
            });
            const detail = Object.keys(byMetric)
                .map(id => `${id} (${byMetric[id].toLocaleString()})`).join(", ");
            blocks.push(`
                <div class="integrity-warning">
                    <strong>Нэгжээ алдсан нэгтгэл</strong>
                    <p>dataSums нэвтрэхээс өмнө нэгтгэгдсэн хувингуудаас бодит нэгжийг сэргээх
                       боломжгүй — тэдгээр бичлэг нийт дүнд ороогүй: ${escapeHTML(detail)}</p>
                </div>`);
        }

        warn.innerHTML = blocks.join("");
    },

    // ---- 1. Дээд мөрийн 4 карт ----
    renderWeeklyStats(status) {
        const container = document.getElementById('weekly-stats-container');
        if (!container) return;

        const overall = (status && status.overall) ? status.overall : { activeDays30: 0 };
        const metrics = this.metricList(status);

        const activeDays  = Number(overall.activeDays30) || 0;
        const consistency = Math.round((activeDays / 30) * 100);
        const tracked     = metrics.filter(m => Number(m.last30) > 0).length;

        let bestStreak = 0, bestStreakLabel = "—";
        metrics.forEach(m => {
            const streak = Number(m.streakDays) || 0;
            if (streak > bestStreak) { bestStreak = streak; bestStreakLabel = m.label; }
        });

        container.innerHTML = `
            <div class="stat-card-pro"><span>ACTIVE DAYS</span><strong>${activeDays} / 30</strong></div>
            <div class="stat-card-pro"><span>CONSISTENCY</span><strong style="color: ${consistency >= 80 ? 'var(--accent)' : '#fff'}">${consistency}%</strong></div>
            <div class="stat-card-pro"><span>TRACKED METRICS</span><strong>${tracked}</strong><span>${metrics.length} метрикээс</span></div>
            <div class="stat-card-pro"><span>LONGEST STREAK</span><strong>${bestStreak} өдөр</strong><span>${escapeHTML(bestStreakLabel)}</span></div>
        `;
    },

    // ---- 2. Халуун зураглал ----
    // Өнгөний хүч = тэр өдөр ХЭДЭН метрик хөдөлсөн бэ (XP биш).
    renderHeatmap(status) {
        const container = document.getElementById('activity-heatmap');
        if (!container) return;

        if (!this.hasEvidence(status)) {
            container.innerHTML = EMPTY_HTML("нотолгоо алга — холбогдсон апп мэдээлэл илгээгээгүй байна");
            return;
        }

        const metrics = this.metricList(status);
        container.innerHTML = this.getPastDays(HEATMAP_DAYS).map(date => {
            // daily-д түлхүүр байгаа = тэр өдөр event бүртгэгдсэн (утга нь 0 ч байж болно).
            const active = metrics.filter(m => m.daily && Object.prototype.hasOwnProperty.call(m.daily, date));
            const level  = Math.min(4, active.length);
            const cls    = level > 0 ? `heat-lvl-${level}` : "";

            const detail = active
                .map(m => `${m.label} ${Number(m.daily[date]).toLocaleString()}${m.unit ? " " + m.unit : ""}`)
                .join(" · ");
            const title = detail ? `${date} · ${detail}` : date;

            return `<div class="heat-box ${cls}" title="${escapeHTML(title)}"></div>`;
        }).join("");
    },

    // ---- 3. Метрик тус бүрийн спарклайн ----
    renderMetricSparklines(status) {
        const container = document.getElementById('metric-sparklines');
        if (!container) return;

        const metrics = this.metricList(status);
        if (metrics.length === 0) {
            container.innerHTML = EMPTY_HTML("метрик бүртгэгдээгүй байна");
            return;
        }
        if (!this.hasEvidence(status)) {
            container.innerHTML = EMPTY_HTML("нотолгоо алга — график зурах өгөгдөл байхгүй");
            return;
        }

        container.innerHTML = metrics.map(m => {
            const hex = ATTR_HEX[m.attr] || "var(--accent)";
            return `
            <div class="spark-row">
                <div class="spark-head">
                    <span class="spark-label">${escapeHTML(m.label)}</span>
                    <span class="spark-value">
                        <strong style="color:${hex};">${Number(m.last30).toLocaleString()}</strong>
                        <small>${escapeHTML(m.unit)}</small>
                        ${formatDelta(m.change30Pct, m.last30, m.prev30)}
                    </span>
                </div>
                ${metricSparklineSvg((m.series || []).slice(-SPARK_DAYS), hex)}
            </div>`;
        }).join("");
    },

    // ---- 4. Атрибутын хурд ----
    renderCategoryGrowth(status) {
        const container = document.getElementById('category-growth-container');
        if (!container) return;

        const attributes = (status && status.attributes) ? status.attributes : {};
        const names = Object.keys(attributes);
        if (names.length === 0) {
            container.innerHTML = EMPTY_HTML("атрибут алга");
            return;
        }

        container.innerHTML = names.map(name => {
            const attr = attributes[name] || {};
            const ids  = Array.isArray(attr.metrics) ? attr.metrics : [];

            // Атрибутын өөрчлөлт нь метрикүүдийнх нь 30 хоногийн НИЙЛБЭР дээр суурилдаг —
            // "шинэ"/"—" дүрмийг зөв гаргахын тулд тэр нийлбэрийг сэргээж өгнө.
            let last30 = 0, prev30 = 0;
            const labels = ids.map(id => {
                const m = status.metrics[id];
                if (!m) return id;
                last30 += Number(m.last30) || 0;
                prev30 += Number(m.prev30) || 0;
                return m.label;
            });

            return `
                <div class="mission-task" style="cursor: default;">
                    <div class="task-name">
                        ${escapeHTML(name)}
                        <small style="display:block;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">
                            ${labels.length ? escapeHTML(labels.join(", ")) : "метрик холбоогүй"}
                        </small>
                    </div>
                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-right:12px;">
                        ${Math.max(0, Math.min(100, Number(attr.score) || 0))}%
                    </span>
                    <div class="trend-indicator">${formatDelta(attr.change30Pct, last30, prev30)}</div>
                </div>`;
        }).join("");
    },

    // ---- 5. Дүгнэлт ----
    // ЗӨВХӨН бодит дохионоос. Хэлэх юм байхгүй бол ЧИМЭЭГҮЙ байна —
    // "Zero activity detected" гэж зохиохгүй.
    INSIGHT_LIMIT: 4,
    STALE_SOURCE_DAYS: 3,

    buildInsights(status) {
        const insights = [];
        if (!status) return insights;

        const metrics = this.metricList(status);

        // Буурсан метрик — 30 хоногийн өөрчлөлт -25%-иас доош
        metrics.forEach(m => {
            const change = m.change30Pct;
            if (typeof change === "number" && change <= -25) {
                insights.push({ type: "warning", text: `${m.label} сүүлийн 30 хоногт ${Math.abs(change)}% буурсан.` });
            }
        });

        // Хамгийн хурдан өссөн метрик — бодит нэгжээр
        let best = null;
        metrics.forEach(m => {
            const change = m.change30Pct;
            if (typeof change !== "number" || change <= 0) return;
            if (!best || change > best.change30Pct) best = m;
        });
        if (best) {
            const unit = best.unit ? ` ${best.unit}` : "";
            insights.push({
                type: "normal",
                text: `${best.label}: ${Number(best.prev30).toLocaleString()}${unit} → ${Number(best.last30).toLocaleString()}${unit} (+${best.change30Pct}%).`
            });
        }

        // Чимээгүй болсон эх сурвалж — эвдэрсэн үйлдвэрлэгч ИНГЭЖ харагдана.
        // Хэзээ ч холбогдож үзээгүй (updatedAt = 0) эх сурвалжийг тоохгүй:
        // тэр эвдэрсэн биш, зүгээр л байхгүй.
        const sources = (status.sources && typeof status.sources === "object") ? status.sources : {};
        const staleMs = this.STALE_SOURCE_DAYS * 24 * 60 * 60 * 1000;
        Object.keys(sources).forEach(app => {
            const source = sources[app] || {};
            const updatedAt = Number(source.updatedAt) || 0;
            if (updatedAt <= 0) return;
            const age = Date.now() - updatedAt;
            if (age <= staleMs) return;
            insights.push({
                type: "warning",
                text: `${source.label || app} ${Math.floor(age / (24 * 60 * 60 * 1000))} өдөр мэдээлэл илгээгээгүй.`
            });
        });

        // Танигдаагүй event төрөл — үйлдвэрлэгч гэрээгээ өөрчилсний дохио
        const unmapped = (status.overall && Array.isArray(status.overall.unmappedTypes))
            ? status.overall.unmappedTypes
            : [];
        if (unmapped.length > 0) {
            insights.push({ type: "warning", text: `Танигдаагүй event төрөл: ${unmapped.join(", ")}` });
        }

        // Нэгжээ сэргээж чадаагүй нэгтгэл. status.js эдгээрийг ЗОРИУД бүртгэдэг
        // ("чимээгүй алга болохгүй" гэж) — гэтэл өмнө нь тэр жагсаалтыг хаана ч
        // харуулдаггүй байсан тул амлалт нь биелдэггүй байв.
        const gaps = (status.overall && Array.isArray(status.overall.rollupGaps))
            ? status.overall.rollupGaps
            : [];
        if (gaps.length > 0) {
            const events  = gaps.reduce((sum, gap) => sum + (Number(gap.count) || 0), 0);
            const metrics = Array.from(new Set(gaps.map(gap => gap.metric))).join(", ");
            insights.push({
                type: "warning",
                text: `${events.toLocaleString()} нэгтгэсэн бичлэгээс нэгжийг сэргээж чадсангүй (${metrics}) — нийт дүнд ороогүй.`
            });
        }

        return insights;
    },

    generateInsights(status) {
        const container = document.getElementById('ai-insights-list');
        if (!container) return;

        const insights = this.buildInsights(status).slice(0, this.INSIGHT_LIMIT);
        if (insights.length === 0) {
            container.innerHTML = EMPTY_HTML("онцлон хэлэх зүйл алга");
            return;
        }
        container.innerHTML = insights
            .map(i => `<div class="insight-item ${i.type}">${escapeHTML(i.text)}</div>`)
            .join("");
    },

    // ---- 6. Ур чадварын хүснэгт ----
    renderSkillTable(status) {
        const tbody = document.querySelector('#skill-analytics-table tbody');
        if (!tbody) return;

        const skills = Array.isArray(webData.skills) ? webData.skills : [];
        if (skills.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5">${EMPTY_HTML("ур чадвар нэмээгүй байна")}</td></tr>`;
            return;
        }

        const select = document.getElementById("analytics-sort");
        const sortBy = select ? select.value : "value";
        const metricOf = s => (status && s && s.metricId) ? status.metrics[s.metricId] : null;
        const numOf = (s, field) => { const m = metricOf(s); return m ? (Number(m[field]) || 0) : 0; };

        const sorted = skills.slice();
        if (sortBy === "value")  sorted.sort((a, b) => numOf(b, "last30") - numOf(a, "last30"));
        if (sortBy === "streak") sorted.sort((a, b) => numOf(b, "streakDays") - numOf(a, "streakDays"));
        if (sortBy === "name")   sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        if (sortBy === "change") {
            // Өөрчлөлт нь null байж болно (өмнөх цонх хоосон) — тэднийг ард нь тавина.
            const key = s => { const m = metricOf(s); return (m && typeof m.change30Pct === "number") ? m.change30Pct : -Infinity; };
            sorted.sort((a, b) => key(b) - key(a));
        }

        tbody.innerHTML = sorted.map(s => {
            const metric = metricOf(s);
            const catHex = SKILL_CAT[s.category] ? SKILL_CAT[s.category].hex : "#10b981";
            const value  = metric
                ? `${Number(metric.last30).toLocaleString()}${metric.unit ? " " + escapeHTML(metric.unit) : ""}`
                : "—";
            const streak = (metric && metric.streakDays > 0) ? `${metric.streakDays} 🔥` : "—";

            return `
                <tr>
                    <td><span style="color:${catHex}; margin-right:8px;">■</span>${escapeHTML(s.name)}</td>
                    <td style="font-family: var(--font-mono); color: var(--text-muted);">${metric ? escapeHTML(metric.label) : "—"}</td>
                    <td style="font-family: var(--font-mono);">${value}</td>
                    <td style="font-family: var(--font-mono);">${metric ? formatDelta(metric.change30Pct, metric.last30, metric.prev30) : "—"}</td>
                    <td style="font-family: var(--font-mono);">${streak}</td>
                </tr>`;
        }).join("");
    }
};

const sortSelect = document.getElementById("analytics-sort");
if (sortSelect) {
    sortSelect.addEventListener("change", () => {
        AnalyticsEngine.renderSkillTable(AnalyticsEngine.status());
    });
}
