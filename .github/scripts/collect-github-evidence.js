"use strict";

/*
 * GitHub-ийн commit идэвхийг гүүрийн НОТОЛГОО болгон цуглуулна.
 *
 * GitHub localStorage руу бичиж чадахгүй тул бусад эх сурвалжтай адил зам
 * ажиллахгүй. Оронд нь энэ script өдөрт нэг удаа ажиллаж data/github.json-ыг
 * repo руу commit хийдэг, bridge.js түүнийг татаж уншина. Гэрээ нь ЯГ АДИЛХАН:
 *   { v, app, label, updatedAt, status, events: [ { id, at, type, value, detail, data } ] }
 *
 * id нь commit-ийн sha — тиймээс дахин ажиллуулахад нотолгоо ДАВХАРДАХГҮЙ:
 * bridge.js аль хэдийн байгаа id-г алгасдаг.
 *
 * Хамаарал БАЙХГҮЙ: Node 20-ийн дотоод fetch-ийг л ашиглана.
 */

const fs   = require("fs");
const path = require("path");

const API            = "https://api.github.com";
const LOOKBACK_DAYS  = 400;
const MAX_EVENTS     = 2000;   // bridge.js-ийн BRIDGE_MAX_EVENTS-тэй ижил
const DETAIL_CHARS   = 60;
const COMMIT_PAGES   = 10;     // нэг repo-гоос дээд тал нь 1000 commit
const REPO_PAGES     = 5;      // дээд тал нь 500 repo
const PER_PAGE       = 100;
const OUT_FILE       = path.join("data", "github.json");

// ===================== HTTP =====================

function apiHeaders(token) {
    return {
        "Accept":               "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent":           "summer-project-evidence",
        "Authorization":        `Bearer ${token}`
    };
}

async function apiGet(url, token) {
    const res = await fetch(url, { headers: apiHeaders(token) });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err  = new Error(`GitHub API ${res.status} ${res.statusText} — ${url}\n${body.slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

// ===================== ЦУГЛУУЛАХ =====================

// Эзэмшигчийн бүх repo. Fine-grained PAT байхгүй бол энэ дуудлага бүтэхгүй —
// дуудагч тал нь ажиллаж буй repo руу л буцаж унана.
async function listOwnerRepos(token) {
    const repos = [];
    for (let page = 1; page <= REPO_PAGES; page++) {
        const batch = await apiGet(
            `${API}/user/repos?per_page=${PER_PAGE}&page=${page}&affiliation=owner&sort=pushed`, token);
        if (!Array.isArray(batch) || batch.length === 0) break;
        batch.forEach(r => { if (r && r.full_name) repos.push(r); });
        if (batch.length < PER_PAGE) break;
    }
    return repos;
}

// Нэг repo-гийн default branch дээрх, эзэмшигчийн бичсэн commit-ууд.
async function listRepoCommits(repo, owner, sinceIso, token) {
    const branch  = repo.default_branch || "main";
    const commits = [];

    for (let page = 1; page <= COMMIT_PAGES; page++) {
        const url = `${API}/repos/${repo.full_name}/commits`
            + `?sha=${encodeURIComponent(branch)}`
            + `&author=${encodeURIComponent(owner)}`
            + `&since=${encodeURIComponent(sinceIso)}`
            + `&per_page=${PER_PAGE}&page=${page}`;

        let batch;
        try {
            batch = await apiGet(url, token);
        } catch (err) {
            // 409 = хоосон repo, 404 = branch алга / эрх байхгүй. Аль нь ч
            // бүх ажиллагааг унагаах ёсгүй — тэр repo-г алгасаад цааш явна.
            console.warn(`  ${repo.full_name}: алгаслаа — ${err.message.split("\n")[0]}`);
            break;
        }

        if (!Array.isArray(batch) || batch.length === 0) break;
        commits.push.apply(commits, batch);
        if (batch.length < PER_PAGE) break;
        if (page === COMMIT_PAGES) {
            console.warn(`  ${repo.full_name}: ${COMMIT_PAGES} хуудсын хязгаарт хүрлээ — хуучин commit-ууд орхигдож магадгүй.`);
        }
    }
    return commits;
}

// ===================== ГЭРЭЭ =====================

function commitDetail(repoName, message) {
    const firstLine = String(message || "").split("\n")[0].trim();
    return `${repoName}: ${firstLine.slice(0, DETAIL_CHARS)}`;
}

function commitToEvent(commit, repo) {
    if (!commit || !commit.sha) return null;

    const info = commit.commit || {};
    const when = (info.author && info.author.date) || (info.committer && info.committer.date) || null;
    const at   = when ? Date.parse(when) : NaN;
    if (!isFinite(at)) return null;

    const repoName = repo.name || repo.full_name || "";
    return {
        id:     `gh:${commit.sha}`,
        at,
        type:   "commit.pushed",
        value:  1,
        detail: commitDetail(repoName, info.message),
        data:   { repo: repoName }
    };
}

function buildFeed(commitsByRepo, repoCount, now) {
    const seen   = new Set();
    const events = [];

    commitsByRepo.forEach(({ repo, commits }) => {
        commits.forEach(commit => {
            const event = commitToEvent(commit, repo);
            if (!event || seen.has(event.id)) return;   // нэг sha хоёр удаа орохгүй
            seen.add(event.id);
            events.push(event);
        });
    });

    // Хуучнаас нь шинэ рүү, дараа нь хамгийн ШИНЭ MAX_EVENTS-ийг үлдээнэ.
    events.sort((a, b) => a.at - b.at);
    const capped = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;

    const monthAgo      = now - 30 * 24 * 60 * 60 * 1000;
    const commitsLast30 = capped.filter(e => e.at >= monthAgo).length;
    const lastCommitAt  = capped.length > 0 ? new Date(capped[capped.length - 1].at).toISOString() : null;

    return {
        v: 1,
        app: "github",
        label: "GitHub",
        updatedAt: now,
        status: { repos: repoCount, commitsLast30, lastCommitAt },
        events: capped
    };
}

// updatedAt-аас БУСДААР нь харьцуулна. Тэр нь ажиллагаа бүрт өөрчлөгддөг тул
// оруулж тооцвол өдөр бүр хоосон commit үүсэх байсан — яг үүнээс зайлсхийж байна.
function feedChanged(existingRaw, next) {
    if (!existingRaw) return true;
    try {
        const prev = JSON.parse(existingRaw);
        const strip = feed => JSON.stringify(Object.assign({}, feed, { updatedAt: 0 }));
        return strip(prev) !== strip(next);
    } catch (_) {
        return true;   // гэмтсэн файл — дарж бичнэ
    }
}

// ===================== ГОЛ УРСГАЛ =====================

async function main() {
    const owner = process.env.REPO_OWNER || String(process.env.GITHUB_REPOSITORY || "").split("/")[0];
    if (!owner) throw new Error("REPO_OWNER (эсвэл GITHUB_REPOSITORY) тохируулаагүй байна.");

    const pat   = process.env.GH_EVIDENCE_TOKEN;
    const token = pat || process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GH_EVIDENCE_TOKEN ч, GITHUB_TOKEN ч алга.");

    const now      = Date.now();
    const sinceIso = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let repos = [];
    if (pat) {
        try {
            repos = await listOwnerRepos(token);
        } catch (err) {
            console.warn(`GH_EVIDENCE_TOKEN-оор repo жагсаалт авч чадсангүй (${err.status || "?"}) — ` +
                         `зөвхөн энэ repo-г тоолно. Токенд Metadata (read) эрх байгаа эсэхийг шалгана уу.`);
        }
    } else {
        console.warn(
            "GH_EVIDENCE_TOKEN алга — анхдагч GITHUB_TOKEN-оор ажиллаж байна.\n" +
            "  Анхдагч токен ЗӨВХӨН ЭНЭ repo-г харна, тиймээс бусад repo дээрх commit тоологдохгүй.\n" +
            "  Бүх repo-г хамруулахын тулд: fine-grained PAT (read-only Contents + Metadata,\n" +
            "  тоолох repo-нууд дээр) үүсгээд GH_EVIDENCE_TOKEN нэртэй secret болгон хадгална уу.");
    }

    if (repos.length === 0) {
        const full = process.env.GITHUB_REPOSITORY;
        if (!full) throw new Error("Repo жагсаалт хоосон бөгөөд GITHUB_REPOSITORY ч алга.");
        // Анхдагч токен /user/repos-ыг харахгүй. Ажиллаж буй repo-гоо шууд авна.
        repos = [await apiGet(`${API}/repos/${full}`, token)];
    }

    console.log(`${repos.length} repo, ${owner}-ийн сүүлийн ${LOOKBACK_DAYS} хоногийн commit-ууд:`);

    const commitsByRepo = [];
    for (const repo of repos) {
        const commits = await listRepoCommits(repo, owner, sinceIso, token);
        if (commits.length > 0) console.log(`  ${repo.full_name}: ${commits.length}`);
        commitsByRepo.push({ repo, commits });
    }

    const feed = buildFeed(commitsByRepo, repos.length, now);
    console.log(`Нийт ${feed.events.length} event · сүүлийн 30 хоногт ${feed.status.commitsLast30} commit · ` +
                `сүүлийнх: ${feed.status.lastCommitAt || "алга"}`);

    const existing = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
    if (!feedChanged(existing, feed)) {
        console.log(`${OUT_FILE} өөрчлөгдөөгүй — бичихгүй (өдөр тутмын хоосон commit гаргахгүй).`);
        return;
    }

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(feed, null, 2) + "\n", "utf8");
    console.log(`${OUT_FILE} бичигдлээ.`);
}

if (require.main === module) {
    main().catch(err => {
        console.error(err.message || err);
        process.exit(1);
    });
}

module.exports = { main, buildFeed, commitToEvent, commitDetail, feedChanged, listRepoCommits, listOwnerRepos };
