"use strict";

// ===================== SERVICE WORKER =====================
// Апп бол build-гүй, хамааралгүй статик мод. Тиймээс энэ файл ч гадны
// сангүй, гар аргаар бичигдсэн: precache + гурван стратеги, өөр юу ч биш.
//
// ЯАГААД ХЭРЭГТЭЙ ВЭ: утсан дээр дэлгэцэнд нэмсэн апп сүлжээгүй үед ч нээгдэх
// ёстой. Нотолгоо нь localStorage-д сууж байгаа тул өгөгдөл нь аль хэдийн
// офлайн — ЗӨВХӨН бүрхүүл (HTML/CSS/JS) л сүлжээнээс хамаарч байсан.
//
// ХУВИЛБАРЫГ ГАРААР АХИУЛНА. Кэшийн нэр өөрчлөгдөх бүрд хуучин кэш бүхэлдээ
// устаж, шинээр татагдана. Файлын нэр өөрчлөгдөхгүй (hash-гүй) тул энэ бол
// хуучин бүрхүүлээс салах цорын ганц найдвартай товчлуур.
const VERSION      = "v1";
const SHELL_CACHE  = `sp-shell-${VERSION}`;
const RUNTIME_CACHE = `sp-runtime-${VERSION}`;
const DATA_CACHE   = `sp-data-${VERSION}`;

// Бүрхүүл. Замууд ХАРЬЦАНГУЙ — сайт нь GitHub Pages дээр /summer-project/
// дэд замд суудаг тул "/" -ээр эхэлсэн зам домэйны үндэс рүү заагаад 404 өгнө.
const SHELL = [
    "./",
    "index.html",
    "style.css",
    "data.js",
    "quests.js",
    "skills.js",
    "bridge.js",
    "status.js",
    "analytics.js",
    "script.js",
    "pwa.js",
    "manifest.webmanifest",
    "icons/icon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png"
];

// Фонтууд гуравдагч домэйн дээр. Тэдгээргүй бол апп ажиллана, гэхдээ
// офлайн үед үсгийн хэв нь солигдоод харагдац эвдэрнэ.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // cache.addAll() бол БҮГД ЭСВЭЛ ЮУ Ч БИШ: ганц зам 404 өгвөл суулгалт
        // бүхэлдээ унаж, апп огт офлайн болохгүй. Тус тусад нь нэмж, унасныг
        // нь бүртгээд цааш явна.
        await Promise.all(SHELL.map(async (url) => {
            try {
                // no-store — суулгах агшинд HTTP кэшнээс хуучин хуулбар авахаас сэргийлнэ.
                const res = await fetch(new Request(url, { cache: "no-store" }));
                if (res && res.ok) await cache.put(url, res);
                else console.warn("[sw] precache алгасав:", url, res && res.status);
            } catch (err) {
                console.warn("[sw] precache унав:", url, err);
            }
        }));
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE]);
        const names = await caches.keys();
        await Promise.all(names.map(n => (keep.has(n) || !n.startsWith("sp-")) ? null : caches.delete(n)));
        await self.clients.claim();
    })());
});

// Хуудас "одоо шинэчил" гэж хэлэх ганц суваг. Хэрэглэгч зөвшөөрөх хүртэл
// шинэ worker хүлээж суудаг — дунд нь өөрөө солигдвол нээлттэй форм алдагдана.
self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ---- Стратегиуд ----

// Сүлжээ түрүүлнэ, эс бөгөөс кэш. HTML болон нотолгооны файлд: шинэлэг байдал
// нь хурднаас чухал, гэхдээ сүлжээгүй үед хоосон дэлгэц гаргахгүй.
// cacheKey нь request-ээс ӨӨР байж болно: bridge.js нотолгооны фийдийг
// "?t=<цаг>" залгаж дууддаг (HTTP кэшийг тойрох гэж). Тэр хаягаар кэшлэвэл
// ачаалалт бүр ШИНЭ бичлэг үлдээж кэш хязгааргүй хавдана, тэгсэн мөртлөө
// офлайн үед дараагийн дуудлагын хаяг өөр болчихсон тул нэг ч удаа ОЛДОХГҮЙ.
async function networkFirst(request, cacheName, fallback, cacheKey) {
    const cache = await caches.open(cacheName);
    const key = cacheKey || request;
    try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(key, res.clone());
        return res;
    } catch (err) {
        const hit = await cache.match(key);
        if (hit) return hit;
        if (fallback) {
            const alt = await cache.match(fallback);
            if (alt) return alt;
        }
        throw err;
    }
}

// Кэшээс шууд өгөөд ард нь шинэчилнэ. Статик хөрөнгө (CSS/JS/icon/фонт):
// нээлт нь агшин зуур, харин дараагийн ачаалалт шинэ хувилбартай болно.
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    const network = fetch(request).then(res => {
        if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
        return res;
    }).catch(() => null);

    if (hit) return hit;
    const res = await network;
    if (res) return res;
    throw new Error("сүлжээ ч, кэш ч байхгүй: " + request.url);
}

self.addEventListener("fetch", (event) => {
    const request = event.request;

    // Зөвхөн GET. POST/PUT-ийг кэшлэх аргагүй бөгөөд Cache API нь татгалздаг.
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Навигац — бүх дотоод зам эцэстээ index.html дээр буудаг тул түүнийг
    // нөөц болгож өгнө. Ингэснээр офлайн үед ч апп нээгдэнэ.
    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request, SHELL_CACHE, "index.html"));
        return;
    }

    if (url.origin === self.location.origin) {
        // Нотолгооны фийд. Хуучирсан тоо ХУДЛАА статус өгдөг тул сүлжээ
        // байгаа бол үргэлж сүлжээнээс. Офлайнд сүүлийн мэдэгдэж байсан нь.
        if (url.pathname.includes("/data/")) {
            // Түлхүүрээс query-г хасна — дээрх тайлбар үзнэ үү.
            const key = new Request(url.origin + url.pathname);
            event.respondWith(networkFirst(request, DATA_CACHE, null, key));
            return;
        }
        event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
        return;
    }

    if (FONT_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    // Бусад гуравдагч эх сурвалжид хөндлөнгөөс оролцохгүй.
});
