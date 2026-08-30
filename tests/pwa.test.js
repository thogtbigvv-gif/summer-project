// PWA-ГИЙН ГЭРЭЭ. Утсан дээр суулгасан апп нь ХУУДАС биш, ДҮРС ТЭМДЭГ болж
// нүүр дэлгэц дээр үлддэг: нэг л буруу зам түүнийг чимээгүй эвдэнэ.
//
// Хамгийн аюултай нь ЧИМЭЭГҮЙ доройтол: хэн нэгэн шинэ script нэмээд sw.js-ийн
// жагсаалтад бүртгэхээ мартвал апп ердийн үедээ ажиллаж байгаад ЗӨВХӨН
// сүлжээгүй үед хагас ачаалагдана. Тэр алдаа хөгжүүлэлтийн үед хэзээ ч
// харагдахгүй. Тиймээс энд шалгана.

"use strict";

const fs     = require("fs");
const path   = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// PNG-ийн жинхэнэ хэмжээ IHDR дотор байдаг — файлын нэрэнд итгэхгүй.
function pngSize(file) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.strictEqual(buf.slice(1, 4).toString("ascii"), "PNG", `${file} нь PNG биш`);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

module.exports = async function ({ t, section }) {

const html     = read("index.html");
const sw       = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));

section("PWA // манифест");

await t("Манифест нь суулгахад шаардлагатай талбаруудтай", async () => {
    ["name", "short_name", "start_url", "scope", "display", "background_color", "theme_color"]
        .forEach(key => assert.ok(manifest[key], `manifest.${key} дутуу`));
    assert.strictEqual(manifest.display, "standalone");
});

await t("Замууд харьцангуй — сайт дэд зам дээр суудаг", async () => {
    // GitHub Pages дээр апп нь /summer-project/ дотор амьдардаг. "/" -ээр
    // эхэлсэн зам домэйны ҮНДЭС рүү заагаад 404 өгнө: манифест ачаалагдана,
    // харин start_url нь хоосон хуудас нээж, суулгалт утгагүй болно.
    const paths = [manifest.start_url, manifest.scope]
        .concat(manifest.icons.map(i => i.src))
        .concat((manifest.shortcuts || []).map(s => s.url));
    paths.forEach(p => assert.ok(!p.startsWith("/"), `"${p}" нь үндсээр эхэлж байна`));
});

await t("Icon-ууд байгаа бөгөөд зарласан хэмжээтэйгээ таарна", async () => {
    manifest.icons.forEach(icon => {
        const file = icon.src;
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} байхгүй`);
        if (!file.endsWith(".png")) return;
        const { w, h } = pngSize(file);
        assert.strictEqual(`${w}x${h}`, icon.sizes, `${file}: ${w}x${h} ≠ ${icon.sizes}`);
    });
});

await t("192px ба 512px PNG хоёулаа бий (Chrome-ийн суулгах шалгуур)", async () => {
    const pngs = manifest.icons.filter(i => i.type === "image/png").map(i => i.sizes);
    assert.ok(pngs.includes("192x192"), "192x192 icon дутуу");
    assert.ok(pngs.includes("512x512"), "512x512 icon дутуу");
});

await t("Maskable icon бий — эс тэгвээс Android дүрсийг цагаан хүрээнд суулгана", async () => {
    assert.ok(manifest.icons.some(i => String(i.purpose || "").includes("maskable")));
});

await t("Товчлолууд ҮНЭХЭЭР байдаг таб руу заана", async () => {
    (manifest.shortcuts || []).forEach(s => {
        const id = s.url.split("#")[1];
        assert.ok(id, `${s.name}: hash-гүй товчлол`);
        assert.ok(html.includes(`id="${id}"`), `${s.name}: #${id} гэсэн таб байхгүй`);
    });
});

section("PWA // service worker");

// sw.js доторх SHELL массивыг эх кодоос нь уншина. Дуурайлган ажиллуулах
// шаардлагагүй — жагсаалт нь энгийн мөрүүд.
const shell = (() => {
    const block = sw.match(/const SHELL = \[([\s\S]*?)\];/);
    assert.ok(block, "sw.js дотроос SHELL жагсаалт олдсонгүй");
    return block[1].split(",").map(s => s.trim().replace(/^["']|["'].*$/g, "")).filter(Boolean);
})();

await t("Precache жагсаалтын бүх файл диск дээр байна", async () => {
    shell.filter(f => f !== "./").forEach(f => {
        assert.ok(fs.existsSync(path.join(ROOT, f)), `sw.js precache: ${f} байхгүй`);
    });
});

await t("index.html-ийн бүх script/stylesheet precache-д багтсан", async () => {
    // Энэ бол ЧИМЭЭГҮЙ доройтлыг барих гол шалгуур: шинэ файл нэмэхэд
    // офлайн горим хагас эвдрэхээс сэргийлнэ.
    const refs = [];
    html.replace(/<script[^>]+src="([^"]+)"/g, (_, m) => refs.push(m));
    html.replace(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g, (_, m) => refs.push(m));
    refs.filter(r => !/^https?:/.test(r)).forEach(r => {
        assert.ok(shell.includes(r), `${r} нь sw.js-ийн SHELL жагсаалтад алга`);
    });
});

await t("Кэшийн нэр хувилбартай — хуучин бүрхүүлээс салах зам байна", async () => {
    assert.ok(/const VERSION\s*=\s*"v\d+"/.test(sw), "sw.js дотор VERSION алга");
    assert.ok(sw.includes("caches.delete"), "хуучин кэшийг цэвэрлэдэггүй");
});

await t("GET бус хүсэлтэд оролцдоггүй", async () => {
    assert.ok(sw.includes('request.method !== "GET"'));
});

await t("Нотолгооны фийд сүлжээг түрүүлж авдаг", async () => {
    // data/github.json хуучирвал статус ХУДЛАА тоо харуулна. Кэш эхэлж
    // хариулдаг болвол алдаа нь чимээгүй — тоо гарч байгаа ч буруу.
    assert.ok(/data\//.test(sw) && /networkFirst\(request, DATA_CACHE/.test(sw));
});

await t("Фийдийн кэшийн түлхүүрээс query хасагдана", async () => {
    // bridge.js нь "?t=<цаг>" залгаж дууддаг. Түүнийг түлхүүр болгон авбал
    // кэш ачаалалт бүрд хавдаад, ОФЛАЙН үед хэзээ ч олдохгүй — өөрөөр хэлбэл
    // нотолгоо нь сүлжээгүй үед бүрмөсөн алга болно.
    assert.ok(sw.includes("new Request(url.origin + url.pathname)"),
        "DATA_CACHE-ийн түлхүүр хэвийн болгогдоогүй байна");
});

section("PWA // хуудасны холболт");

await t("index.html нь манифест, icon, pwa.js-ийг холбосон", async () => {
    assert.ok(html.includes('rel="manifest" href="manifest.webmanifest"'), "manifest холбоос алга");
    assert.ok(html.includes('rel="apple-touch-icon"'), "apple-touch-icon алга — iPhone дээр icon хоосон гарна");
    assert.ok(html.includes('name="theme-color"'), "theme-color алга");
    assert.ok(html.includes('src="pwa.js"'), "pwa.js ачаалагддаггүй");
    assert.ok(html.includes("viewport-fit=cover"), "viewport-fit=cover алга — notch дор гарчиг орно");
});

await t("Суулгах товч DOM-д байгаа ба анхнаасаа нуугдмал", async () => {
    // pwa.js нь id-гаар нь олдог. Товч байхгүй бол beforeinstallprompt
    // баригдаад ХААНА Ч гарахгүй — суулгах зам чимээгүй алга болно.
    const m = html.match(/<button[^>]*id="install-btn"[^>]*>/);
    assert.ok(m, "install-btn товч алга");
    assert.ok(m[0].includes("hidden"), "товч анхнаасаа hidden байх ёстой");
});

};
