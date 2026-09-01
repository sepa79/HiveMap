/**
 * Responsibility: Verify the operator-token lifecycle in a real browser against one running built HiveMap UI.
 * Must not: Create application fixtures, start runtime processes, or inspect React implementation state.
 * Contract: Proves save, authenticated use, same-tab reload persistence, explicit clear, and no post-clear API refresh.
 */
import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const baseUrl = requireEnvironment("HIVEMAP_ACCEPTANCE_BASE_URL").replace(/\/$/, "");
const authToken = requireEnvironment("HIVEMAP_ACCEPTANCE_AUTH_TOKEN");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const protectedRequests = [];

page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/workspaces")) {
    protectedRequests.push({
      path: `${url.pathname}${url.search}`,
      authorization: request.headers().authorization,
    });
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => sessionStorage.getItem("HIVEMAP_UI_TOKEN")), null);

  const tokenInput = page.getByRole("textbox", { name: "API / MCP token" });
  await tokenInput.fill(`  ${authToken}  `);
  await page.getByRole("button", { name: "Set token" }).click();
  const workspaceSelect = page.locator("section.workspace-panel select");
  await workspaceSelect.locator('option[value="acceptance-workspace"]').waitFor({ state: "attached" });
  assert.equal(await page.evaluate(() => sessionStorage.getItem("HIVEMAP_UI_TOKEN")), authToken);

  await workspaceSelect.selectOption("acceptance-workspace");
  await page.getByRole("button", { name: "Load" }).click();
  const renderedGraphNode = page.locator(".react-flow__node").filter({ hasText: "Acceptance Node" });
  await renderedGraphNode.waitFor();
  assert(protectedRequests.some((request) => request.authorization === `Bearer ${authToken}`));

  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => sessionStorage.getItem("HIVEMAP_UI_TOKEN")), authToken);
  await renderedGraphNode.waitFor();

  const requestCountBeforeClear = protectedRequests.length;
  await page.getByRole("button", { name: "Clear token" }).click();
  await page.getByText("AI-assisted concept graph", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem("HIVEMAP_UI_TOKEN")), null);
  assert.equal(await tokenInput.inputValue(), "");
  assert.equal(new URL(page.url()).search, "");
  await page.waitForTimeout(500);
  assert.equal(protectedRequests.length, requestCountBeforeClear);
  assert.equal(await renderedGraphNode.count(), 0);
} finally {
  await context.close();
  await browser.close();
}

process.stdout.write("browser-smoke=passed\n");

function requireEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
