#!/usr/bin/env node
// Тест ажиллуулагч. Хамаарал БАЙХГҮЙ — Node л хангалттай:
//     node tests/run.js
//
// Апп өөрөө build-гүй, package.json-гүй vanilla статик сайт хэвээр байх ёстой.
// Тест нь тэр шинжийг эвдэхгүй байхаар зориуд ийм жижиг байна.

"use strict";

const fs   = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const failures = [];

function section(name) { console.log("\n\x1b[1m== " + name + " ==\x1b[0m"); }

// ЗААВАЛ await хийнэ. Энэ функц async тестийг хүлээхгүй бол доторх assert
// унасан ч promise дотор баригдаж, тест ХУДЛААР ноогдоно — өөрөөр хэлбэл
// тестийн иж бүрдэл өөрөө чимээгүй худал хэлж эхэлнэ.
async function t(name, fn) {
    try {
        await fn();
        console.log("  \x1b[32m✓\x1b[0m " + name);
        pass++;
    } catch (err) {
        console.log("  \x1b[31m✗\x1b[0m " + name);
        console.log("      " + String(err && err.message || err).split("\n").join("\n      "));
        failures.push(name);
        fail++;
    }
}

async function main() {
    const files = fs.readdirSync(__dirname)
        .filter(f => f.endsWith(".test.js"))
        .sort();

    for (const file of files) {
        console.log("\n\x1b[1m▸ " + file + "\x1b[0m");
        await require(path.join(__dirname, file))({ t, section });
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) {
        console.log("Унасан: " + failures.join(", "));
        process.exit(1);
    }
}

main().catch(err => {
    console.error("\nТест ажиллуулагч унав:", err);
    process.exit(1);
});
