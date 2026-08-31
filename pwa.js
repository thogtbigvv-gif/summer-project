"use strict";

// ===================== PWA УДИРДЛАГА =====================
// Гурван зүйл: (1) service worker бүртгэх, (2) шинэ хувилбарыг ХЭРЭГЛЭГЧИЙН
// зөвшөөрлөөр залгах, (3) "утсандаа суулгах" товчийг зөв үед харуулах.
//
// Бүх зүйл try/catch дотор: PWA бол НЭМЭЛТ давхарга. Энэ файл бүхэлдээ
// унасан ч апп ердийн вэб хуудас хэвээр ажиллах ёстой.

(function () {
    const INSTALL_BTN = "install-btn";

    // ---------- Service worker ----------
    // file:// дээр нээхэд SW огт байхгүй — тэр үед чимээгүй алгасана.
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker
                // updateViaCache: "none" — sw.js-ийг HTTP кэшнээс биш, үргэлж
                // сүлжээнээс шалгана. Эс тэгвээс хуучин worker өөрийгөө
                // шинэчлэх боломжгүй болж, апп хэдэн цагаар хоцордог.
                .register("sw.js", { scope: "./", updateViaCache: "none" })
                .then(watchForUpdates)
                .catch(err => console.warn("[pwa] SW бүртгэгдсэнгүй:", err));
        });
    }

    // Хуудсыг ЗӨВХӨН хэрэглэгч "Шинэчлэх" дарсны дараа сэргээнэ.
    //
    // controllerchange нь ХОЁР тохиолдолд гардаг: (1) шинэ хувилбар залгах үед,
    // (2) АНХНЫ зочлолтод worker clients.claim() хийх үед. Ялгалгүй сэргээвэл
    // хүн бүр анх орохдоо ямар ч шалтгаангүй дахин ачаалагдсан хуудас хардаг —
    // тэр агшинд бөглөж эхэлсэн форм байвал устана.
    let reloadOnControllerChange = false;
    let reloading = false;
    navigator.serviceWorker?.addEventListener("controllerchange", () => {
        if (!reloadOnControllerChange || reloading) return;
        reloading = true;
        window.location.reload();
    });

    function watchForUpdates(reg) {
        if (!reg) return;

        // Аль хэдийн хүлээж буй хувилбар байвал (өмнөх зочлолтод татагдсан).
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);

        reg.addEventListener("updatefound", () => {
            const next = reg.installing;
            if (!next) return;
            next.addEventListener("statechange", () => {
                // controller байхгүй бол энэ бол ПЕРВЫЙ суулгалт — шинэчлэлт
                // биш. Тэр үед мэдэгдэл гаргах нь зүгээр л будлиантай.
                if (next.state === "installed" && navigator.serviceWorker.controller) {
                    showUpdateBanner(next);
                }
            });
        });

        // Дэлгэцэнд нэмсэн апп өдрөөр нээлттэй хэвээр байж болно. Буцаж ирэх
        // бүрд шалгах нь илүүц тул цагт нэгээс олонгүй.
        let lastCheck = 0;
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) return;
            const now = Date.now();
            if (now - lastCheck < 3600000) return;
            lastCheck = now;
            reg.update().catch(() => {});
        });
    }

    function showUpdateBanner(worker) {
        if (document.getElementById("pwa-update-banner")) return;

        const bar = document.createElement("div");
        bar.id = "pwa-update-banner";
        bar.className = "pwa-update-banner";
        bar.innerHTML =
            '<span>Шинэ хувилбар бэлэн боллоо.</span>' +
            '<button type="button" class="pwa-update-apply">Шинэчлэх</button>' +
            '<button type="button" class="pwa-update-later" aria-label="Хаах">✕</button>';

        bar.querySelector(".pwa-update-apply").addEventListener("click", () => {
            // Хүлээж буй worker-т "одоо шилж" гэж хэлнэ. Дараа нь дээрх
            // controllerchange нь хуудсыг сэргээнэ.
            reloadOnControllerChange = true;
            worker.postMessage({ type: "SKIP_WAITING" });
            bar.remove();
        });
        bar.querySelector(".pwa-update-later").addEventListener("click", () => bar.remove());

        document.body.appendChild(bar);
        requestAnimationFrame(() => bar.classList.add("show"));
    }

    // ---------- Суулгах товч ----------
    // Аль хэдийн суулгасан бол товч утгагүй.
    function isStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches ||
               window.navigator.standalone === true;
    }

    // iOS дээр beforeinstallprompt ХЭЗЭЭ Ч гарахгүй — Safari түүнийг дэмждэггүй.
    // Тиймээс iPhone дээр товчийг өөрсдөө харуулж, гар аргын зааврыг өгнө.
    function isIOS() {
        const ua = navigator.userAgent || "";
        return /iPad|iPhone|iPod/.test(ua) ||
               // iPadOS 13-аас хойш өөрийгөө Mac гэж танилцуулдаг.
               (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    let deferredPrompt = null;

    function installButton() { return document.getElementById(INSTALL_BTN); }

    function showInstallButton() {
        const btn = installButton();
        if (btn) btn.hidden = false;
    }

    window.addEventListener("beforeinstallprompt", (e) => {
        // Хөтчийн өөрийнх нь баннерыг зогсоож, өөрсдийн товчинд хадгална.
        e.preventDefault();
        deferredPrompt = e;
        if (!isStandalone()) showInstallButton();
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        const btn = installButton();
        if (btn) btn.hidden = true;
        if (typeof showToast === "function") showToast("Апп дэлгэцэнд нэмэгдлээ.", "info", "var(--accent)");
    });

    document.addEventListener("DOMContentLoaded", () => {
        const btn = installButton();
        if (!btn) return;

        if (isIOS() && !isStandalone()) showInstallButton();

        btn.addEventListener("click", async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                try { await deferredPrompt.userChoice; } catch (_) {}
                // Нэг prompt объектыг ХОЁР УДАА ашиглаж болохгүй — татгалзсан ч
                // хаясан ч дахин prompt() дуудвал алдаа өгнө.
                deferredPrompt = null;
                btn.hidden = true;
                return;
            }
            if (typeof showToast === "function") {
                showToast(isIOS()
                    ? "Safari: Хуваалцах ⎋ товч → «Нүүр дэлгэцэнд нэмэх»."
                    : "Хөтчийн цэс → «Апп суулгах» / «Дэлгэцэнд нэмэх».", "info", "var(--accent)");
            }
        });
    });
})();
