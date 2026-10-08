"use strict";
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { guardRoute } = require("./policy.cjs");
(async () => {
  const received = [];
  let redirectMode = false;
  const server = http.createServer((req, res) => {
    if (redirectMode) {
      received.push(req.url);
      res.statusCode = 302;
      res.setHeader(
        "Location",
        "/graphql?query=mutation%20%7B%20deleteUser%20%7D",
      );
      res.end();
      return;
    }
    if (req.url === "/dashboard") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<script>window.done=false;Promise.allSettled([
   fetch('/graphql',{method:'POST',body:JSON.stringify({query:'query Q { viewer { id } }',variables:{email:'private@example.com'}})}),
   fetch('/graphql',{method:'POST',body:JSON.stringify({query:'mutation M { deleteUser(id:"private") { id } }'})}),
   fetch('/api/unknown'),new Promise(resolve=>{const img=new Image();img.onload=img.onerror=resolve;img.src='/api/unknown?as=image'})]).then(()=>window.done=true)</script>`);
      return;
    }
    received.push(req.url);
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    });
    const ctx = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const rows = [];
    await ctx.route("**/*", (route) => guardRoute(route, rows, origin));
    const page = await ctx.newPage();
    await page.goto(origin + "/dashboard");
    await page.waitForFunction(() => window.done);
    assert.deepEqual(received, ["/graphql"]);
    assert.equal(rows.filter((x) => x.allowed).length, 1);
    assert.equal(rows.filter((x) => !x.allowed).length, 1);
    assert.ok(!JSON.stringify(rows).includes("private"));
    received.length = 0;
    redirectMode = true;
    await page.goto(origin + "/dashboard").catch(() => {});
    assert.deepEqual(received, ["/dashboard"]);
    console.log(
      "PASS: redirects blocked;  real Chromium sends query only; mutation and unknown API blocked; metadata excludes fixture secrets.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch(() => {
  console.error("Fixture E2E failed");
  process.exitCode = 1;
});
