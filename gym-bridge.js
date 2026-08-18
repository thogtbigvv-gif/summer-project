"use strict";

// ===================== GYM BRIDGE (READ-ONLY) =====================
// Дасгалын апп (тусдаа апп) нь ижил GitHub Pages origin дээр байрлах тул
// localStorage-оо энэ апптай хуваалцдаг. Тэр нь `gym:bridge` түлхүүрт нэг чиглэлт
// өдрийн дасгалын фийд бичдэг. Энд бид түүнийг ЗӨВХӨН УНШИЖ XP болгон хөрвүүлнэ.
//
// Гэрээ (JSON):
//   { v: 1, app: "Gym", updatedAt: <ms>,
//     today:    { date, dayId, title, isRest, total, done, xp },
//     sessions: [ { date, dayId, title, done, total, xp, complete, completedAt } ... ] }
//
// Огноо бүр НЭГ бичлэгтэй бөгөөд өдрийн турш xp нь өсдөг. Тиймээс Bigu-гийнх шиг
// id-гаар давхардал шалгахгүй — огноо тус бүрд ОЛГОСОН XP-г санаж, ЗӨРҮҮГ нь л олгоно.
//
// Түлхүүр байхгүй эсвэл гэмтсэн бол энэ апп өнөөдрийнхтэй яг адилхан ажиллана.
// gym:bridge рүү ХЭЗЭЭ Ч бичихгүй.

const GYM_BRIDGE_KEY      = "gym:bridge";
const GYM_SKILL_NAME      = "Gym Training";
const GYM_MISSION_TASK_ID = "m3";
const GYM_XP_CAP          = 200;  // нэг өдөрт олгох дээд XP
const GYM_HISTORY_DAYS    = 30;   // фийдээс хүлээж авах хамгийн хуучин огнооны хязгаар
const GYM_MAX_SESSIONS    = 120;  // нэг удаад боловсруулах өдрийн дээд хязгаар

const GYM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidGymDate(value) {
    return typeof value === "string" && GYM_DATE_RE.test(value);
}

// Өнөөдрөөс N хоногийн өмнөх огноог "YYYY-MM-DD" хэлбэрээр буцаана (todayStr-тэй ижил цагийн бүсээр).
function gymDateBefore(days) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

// Сөрөг биш бүхэл тоо болгож цэвэрлэнэ. Тоо болохгүй бол 0.
function gymInt(value) {
    const n = Math.floor(Number(value));
    return isFinite(n) && n > 0 ? n : 0;
}

function gymText(value) {
    return typeof value === "string" ? value.trim() : "";
}

// Session-ыг цэвэрлэж, найдвартай хэлбэрт хөрвүүлнэ. Буруу бол null.
function normalizeGymSession(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isValidGymDate(raw.date)) return null;

    const total = gymInt(raw.total);
    const done  = gymInt(raw.done);
    const at    = Number(raw.completedAt);

    return {
        date:        raw.date,
        dayId:       gymText(raw.dayId),
        title:       gymText(raw.title),
        total,
        done:        Math.min(done, total),   // done нь total-аас хэтэрч болохгүй
        xp:          gymInt(raw.xp),
        complete:    raw.complete === true,
        completedAt: isFinite(at) ? at : 0
    };
}

// Өнөөдрийн хэсгийг цэвэрлэнэ. Буруу бол null.
function normalizeGymToday(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isValidGymDate(raw.date)) return null;

    const total = gymInt(raw.total);
    const done  = gymInt(raw.done);

    return {
        date:   raw.date,
        dayId:  gymText(raw.dayId),
        title:  gymText(raw.title),
        isRest: raw.isRest === true,
        total,
        done:   Math.min(done, total),
        xp:     gymInt(raw.xp)
    };
}

// Хамгаалалттай унших + parse. Ямар нэг зүйл хүлээгдсэнээс өөр бол null.
function readGymFeed() {
    try {
        if (typeof localStorage === "undefined") return null;

        const raw = localStorage.getItem(GYM_BRIDGE_KEY);
        if (!raw || typeof raw !== "string") return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        if (parsed.v !== 1) return null;

        // Сүүлийн 30 хоногоос гадуурх (хэт хуучин, эсвэл ирээдүйн) огноог хаяна.
        const oldest = gymDateBefore(GYM_HISTORY_DAYS);
        const newest = todayStr();

        const byDate = new Map();
        if (Array.isArray(parsed.sessions)) {
            parsed.sessions
                .map(normalizeGymSession)
                .filter(s => s && s.date >= oldest && s.date <= newest)
                .forEach(s => {
                    // Огноо бүр НЭГ бичлэгтэй байх ёстой. Давхардвал хамгийн өндөр xp-тэйг нь авна.
                    const prev = byDate.get(s.date);
                    if (!prev || s.xp > prev.xp) byDate.set(s.date, s);
                });
        }

        // Хуучнаас нь шинэ рүү эрэмбэлээд, хэт урт фийд ирвэл ХАМГИЙН СҮҮЛИЙНХ-ийг нь авна.
        let sessions = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        if (sessions.length > GYM_MAX_SESSIONS) sessions = sessions.slice(-GYM_MAX_SESSIONS);

        let today = normalizeGymToday(parsed.today);
        if (today && (today.date < oldest || today.date > newest)) today = null;

        const updatedAt = Number(parsed.updatedAt);

        return {
            v: 1,
            app: typeof parsed.app === "string" ? parsed.app : "",
            updatedAt: isFinite(updatedAt) ? updatedAt : 0,
            today,
            sessions
        };
    } catch (err) {
        console.warn("readGymFeed: gym:bridge уншиж чадсангүй —", err);
        return null;
    }
}

function getGymState() {
    if (!webData.integrations || typeof webData.integrations !== "object") webData.integrations = {};
    const gym = webData.integrations.gym;
    if (!gym || typeof gym !== "object") {
        webData.integrations.gym = { awardedByDate: {}, lastSyncedAt: null };
    } else if (!gym.awardedByDate || typeof gym.awardedByDate !== "object" || Array.isArray(gym.awardedByDate)) {
        gym.awardedByDate = {};
    }
    return webData.integrations.gym;
}

// Дасгалын фийдээс огноо тус бүрийн ЗӨРҮҮ XP-г олгоно. Юу ч байхгүй бол чимээгүй.
// Буцаах утга: { awarded, days }
async function syncFromGym() {
    const result = { awarded: 0, days: 0 };

    try {
        if (!webData || !Array.isArray(webData.skills)) return result;

        const feed = readGymFeed();
        if (!feed || feed.sessions.length === 0) return result;

        // Ур чадварыг НЭРЭЭР нь хайна. Устгасан бол чимээгүй гарна (автоматаар үүсгэхгүй).
        const skill = webData.skills.find(
            s => s && typeof s.name === "string" && s.name.trim().toLowerCase() === GYM_SKILL_NAME.toLowerCase()
        );
        if (!skill) return result;

        const state = getGymState();

        // Хуучнаас нь эхэлж боловсруулна (огноогоор эрэмбэлэгдсэн байгаа).
        feed.sessions.forEach(session => {
            // Нэг өдөрт олгох нийт XP нь GYM_XP_CAP-аас хэтрэхгүй. Тиймээс зөрүүг
            // таслагдсан утга дээр тооцно — эс тэгвээс cap-аас дээших XP дахин дахин олгогдоно.
            const capped = Math.min(session.xp, GYM_XP_CAP);
            const prev   = gymInt(state.awardedByDate[session.date]);
            const delta  = capped - prev;
            if (delta <= 0) return;

            // awardSkillXp өөрөө logDailyActivity-г дуудна (categoryId: "fitness"),
            // тиймээс энд дахин лог бичихгүй — давхар тоологдох эрсдэлгүй.
            const awarded = awardSkillXp(skill.id, delta, { silent: true, categoryId: "fitness" });
            if (!awarded) return;

            addGlobalXp(delta);
            state.awardedByDate[session.date] = capped;
            result.awarded += delta;
            result.days    += 1;
        });

        // Зөвхөн шинэ XP олгогдсон үед л төлөвөө хөдөлгөнө — шинэ юм байхгүй үед
        // syncFromGym() ямар ч ул мөр үлдээхгүй (хадгалалт ч өдөөгдөхгүй).
        if (result.days > 0) state.lastSyncedAt = Date.now();

        // Өнөөдрийн дасгал бүрэн дуусгасан бол m3 (Workout) даалгаврыг тэмдэглэнэ.
        const today = todayStr();
        const todaySession = feed.sessions.find(s => s.date === today);

        if (todaySession && todaySession.complete) {
            const task = webData.missionTasks?.find(t => t.id === GYM_MISSION_TASK_ID);
            // Даалгаврын өөрийнх нь XP-г дахин олгохгүй — зөвхөн тэмдэглэнэ.
            // autoCompleted → дараа нь тэмдэглэгээг нь авахад XP буцаахгүй (олгоогүй учраас).
            if (task && !task.completed) {
                task.completed = true;
                task.completedDate = today;
                task.autoCompleted = true;
            }
        }

        if (result.awarded > 0) {
            showToast(
                `+${result.awarded} EXP — Дасгалаас ${result.days} өдөр синк хийлээ`,
                "info",
                (SKILL_CAT.physical || {}).hex
            );
        }
    } catch (err) {
        console.error("syncFromGym error:", err);
        return { awarded: 0, days: 0 };
    }

    return result;
}
