"use strict";

// ===================== BIGU BRIDGE (READ-ONLY) =====================
// Bigu (япон хэл сурах тусдаа апп) нь ижил GitHub Pages origin дээр байрлах тул
// localStorage-оо энэ апптай хуваалцдаг. Тэр нь `bigu:bridge` түлхүүрт нэг чиглэлт
// идэвхийн фийд бичдэг. Энд бид түүнийг ЗӨВХӨН УНШИЖ XP болгон хөрвүүлнэ.
//
// Гэрээ (JSON):
//   { v: 1, app: "Bigu", updatedAt: <ms>,
//     due: { date: "YYYY-MM-DD", count: <int> },
//     sessions: [ { id, at, date, mode, total, correct } ... ] }
//
// Түлхүүр байхгүй эсвэл гэмтсэн бол энэ апп өнөөдрийнхтэй яг адилхан ажиллана.
// bigu:bridge рүү ХЭЗЭЭ Ч бичихгүй.

const BIGU_BRIDGE_KEY      = "bigu:bridge";
const BIGU_SKILL_NAME      = "Japanese Language";
const BIGU_MISSION_TASK_ID = "m2";
const BIGU_XP_CAP          = 300;  // нэг session-д олгох дээд XP
const BIGU_SYNCED_ID_CAP   = 200;  // syncedIds-д хадгалах хамгийн сүүлийн ID-ийн тоо
const BIGU_MISSION_ITEMS   = 20;   // m2-г биелсэнд тооцох өдрийн үгийн доод хэмжээ
const BIGU_MAX_SESSIONS    = 200;  // нэг удаад боловсруулах session-ы дээд хязгаар

const BIGU_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidBiguDate(value) {
    return typeof value === "string" && BIGU_DATE_RE.test(value);
}

// Session-ыг цэвэрлэж, найдвартай хэлбэрт хөрвүүлнэ. Буруу бол null.
function normalizeBiguSession(raw) {
    if (!raw || typeof raw !== "object") return null;

    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) return null;

    const total   = Math.max(0, Math.floor(Number(raw.total)));
    const correct = Math.max(0, Math.floor(Number(raw.correct)));
    if (!isFinite(total) || !isFinite(correct)) return null;

    const at = Number(raw.at);

    return {
        id,
        at:      isFinite(at) ? at : 0,
        date:    isValidBiguDate(raw.date) ? raw.date : null,
        mode:    typeof raw.mode === "string" ? raw.mode : "",
        total,
        correct: Math.min(correct, total)   // correct нь total-аас хэтэрч болохгүй
    };
}

// Хамгаалалттай унших + parse. Ямар нэг зүйл хүлээгдсэнээс өөр бол null.
function readBiguFeed() {
    try {
        if (typeof localStorage === "undefined") return null;

        const raw = localStorage.getItem(BIGU_BRIDGE_KEY);
        if (!raw || typeof raw !== "string") return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        if (parsed.v !== 1) return null;

        // Хуучнаас нь шинэ рүү эрэмбэлээд, хэт урт фийд ирвэл ХАМГИЙН СҮҮЛИЙНХ-ийг нь авна.
        let sessions = Array.isArray(parsed.sessions)
            ? parsed.sessions.map(normalizeBiguSession).filter(Boolean).sort((a, b) => a.at - b.at)
            : [];
        if (sessions.length > BIGU_MAX_SESSIONS) sessions = sessions.slice(-BIGU_MAX_SESSIONS);

        let due = null;
        if (parsed.due && typeof parsed.due === "object" && isValidBiguDate(parsed.due.date)) {
            const count = Math.floor(Number(parsed.due.count));
            if (isFinite(count) && count > 0) due = { date: parsed.due.date, count };
        }

        const updatedAt = Number(parsed.updatedAt);

        return {
            v: 1,
            app: typeof parsed.app === "string" ? parsed.app : "",
            updatedAt: isFinite(updatedAt) ? updatedAt : 0,
            due,
            sessions
        };
    } catch (err) {
        console.warn("readBiguFeed: bigu:bridge уншиж чадсангүй —", err);
        return null;
    }
}

function getBiguState() {
    if (!webData.integrations || typeof webData.integrations !== "object") webData.integrations = {};
    const bigu = webData.integrations.bigu;
    if (!bigu || typeof bigu !== "object") {
        webData.integrations.bigu = { syncedIds: [], lastSyncedAt: null };
    } else if (!Array.isArray(bigu.syncedIds)) {
        bigu.syncedIds = [];
    }
    return webData.integrations.bigu;
}

// Bigu-гийн шинэ session-уудыг XP болгож олгоно. Юу ч байхгүй бол чимээгүй.
// Буцаах утга: { awarded, sessions }
async function syncFromBigu() {
    const result = { awarded: 0, sessions: 0 };

    try {
        if (!webData || !Array.isArray(webData.skills)) return result;

        const feed = readBiguFeed();
        if (!feed || feed.sessions.length === 0) return result;

        // Ур чадварыг НЭРЭЭР нь хайна. Устгасан бол чимээгүй гарна (автоматаар үүсгэхгүй).
        const skill = webData.skills.find(
            s => s && typeof s.name === "string" && s.name.trim().toLowerCase() === BIGU_SKILL_NAME.toLowerCase()
        );
        if (!skill) return result;

        const state  = getBiguState();
        const synced = new Set(state.syncedIds);

        // Хуучнаас нь эхэлж боловсруулснаар syncedIds-ийн таслалт хамгийн сүүлийнхийг үлдээнэ.
        const pending = feed.sessions
            .filter(s => !synced.has(s.id))
            .sort((a, b) => a.at - b.at);

        pending.forEach(session => {
            const xp = Math.min(BIGU_XP_CAP, Math.floor(session.total * 1 + session.correct * 2));
            if (xp > 0) {
                // awardSkillXp өөрөө logDailyActivity-г дуудна (categoryId: "learning"),
                // тиймээс энд дахин лог бичихгүй — давхар тоологдох эрсдэлгүй.
                const awarded = awardSkillXp(skill.id, xp, { silent: true, categoryId: "learning" });
                if (awarded) {
                    addGlobalXp(xp);
                    result.awarded += xp;
                }
            }
            synced.add(session.id);
            state.syncedIds.push(session.id);
            result.sessions += 1;
        });

        if (state.syncedIds.length > BIGU_SYNCED_ID_CAP) {
            state.syncedIds = state.syncedIds.slice(-BIGU_SYNCED_ID_CAP);
        }
        state.lastSyncedAt = Date.now();

        // Өнөөдөр синк хийгдсэн session-ы нийт үгийн тоо (фийдээс тооцно —
        // өмнөх ачаалалт дээр синк хийгдсэн session-ууд ч мөн энд орно).
        const today = todayStr();
        const todayItems = feed.sessions
            .filter(s => s.date === today && synced.has(s.id))
            .reduce((sum, s) => sum + s.total, 0);

        if (todayItems >= BIGU_MISSION_ITEMS) {
            const task = webData.missionTasks?.find(t => t.id === BIGU_MISSION_TASK_ID);
            // Даалгаврын өөрийнх нь XP-г дахин олгохгүй — зөвхөн тэмдэглэнэ.
            if (task && !task.completed) {
                task.completed = true;
                task.completedDate = today;
            }
        }

        if (result.awarded > 0) {
            showToast(
                `+${result.awarded} EXP — Bigu-с ${result.sessions} хичээл синк хийлээ`,
                "info",
                (SKILL_CAT[skill.category] || {}).hex
            );
        }
    } catch (err) {
        console.error("syncFromBigu error:", err);
        return { awarded: 0, sessions: 0 };
    }

    return result;
}
