/**
 * Responsibility: Verify the operator-token lifecycle, workspace geometry, and critical native-control accessibility in one real Chromium session.
 * Must not: Create application fixtures, start runtime processes, or inspect React implementation state.
 * Contract: Proves authenticated lifecycle, bounded and visible workspace surfaces, viewport overflow limits, and keyboard focus indicators.
 */
import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const baseUrl = requireEnvironment("HIVEMAP_ACCEPTANCE_BASE_URL").replace(/\/$/, "");
const authToken = requireEnvironment("HIVEMAP_ACCEPTANCE_AUTH_TOKEN");
const projectionCount = requirePositiveIntegerEnvironment("HIVEMAP_ACCEPTANCE_PROJECTION_COUNT");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 1600, height: 1000 });
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
  const workspaceSelect = page.locator(".workspace-switcher select");
  await workspaceSelect.locator('option[value="acceptance-workspace"]').waitFor({ state: "attached" });
  const selectAppearance = await workspaceSelect.evaluate((element) => {
    const option = element.options[0];
    if (option === undefined) throw new Error("Workspace selector has no options");
    const selectStyle = getComputedStyle(element);
    const optionStyle = getComputedStyle(option);
    return {
      colorScheme: selectStyle.colorScheme,
      optionColor: optionStyle.color,
      optionBackground: optionStyle.backgroundColor,
    };
  });
  assert.match(selectAppearance.colorScheme, /dark/);
  assert(contrastRatio(selectAppearance.optionColor, selectAppearance.optionBackground) >= 4.5);
  await assertVisibleOutline(workspaceSelect, "workspace selector");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("HIVEMAP_UI_TOKEN")), authToken);

  await workspaceSelect.selectOption("acceptance-workspace");
  await page.getByRole("button", { name: "Load" }).click();
  const renderedGraphNode = page.locator(".react-flow__node").filter({ hasText: "Acceptance Node" });
  await renderedGraphNode.waitFor();
  const mapSearch = page.getByRole("searchbox", { name: "Search components" });
  await mapSearch.focus();
  const searchFocus = await page.locator(".map-search").evaluate((element) => ({
    boxShadow: getComputedStyle(element).boxShadow,
    containsFocus: element.matches(":focus-within"),
  }));
  assert.equal(searchFocus.containsFocus, true);
  assert.notEqual(searchFocus.boxShadow, "none");
  assert.equal(await page.locator(".context-view").count(), Math.min(projectionCount, 5));
  const remainingViewPicker = page.getByRole("combobox", { name: "More saved views" });
  if (projectionCount > 5) {
    assert.equal(await remainingViewPicker.locator("option").count(), projectionCount - 5 + 1);
    await remainingViewPicker.selectOption("acceptance-projection");
    await page.waitForURL(/projection=acceptance-projection(?:&|$)/);
  } else {
    assert.equal(await remainingViewPicker.count(), 0);
  }
  const layout = await page.evaluate(() => {
    function overflows(selector) {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`${selector} is missing`);
      return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
    }

    function isFullyVisible(selector) {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`${selector} is missing`);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0
        && rect.top >= 0
        && rect.left >= 0
        && rect.bottom <= window.innerHeight
        && rect.right <= window.innerWidth;
    }

    return {
      bodyScrolls: document.body.scrollHeight > document.body.clientHeight || document.body.scrollWidth > document.body.clientWidth,
      mapContextScrolls: overflows(".workspace-context-map"),
      toolbarScrolls: overflows(".projection-toolbar"),
      surfacesVisible: {
        canvas: isFullyVisible(".map-canvas"),
        inspector: isFullyVisible(".node-inspector"),
        mapContext: isFullyVisible(".workspace-context-map"),
        rail: isFullyVisible(".workspace-rail"),
        savedView: isFullyVisible(".context-view"),
        scanSummary: isFullyVisible(".scan-summary-card"),
        toolbar: isFullyVisible(".projection-toolbar"),
      },
    };
  });
  assert.deepEqual(layout, {
    bodyScrolls: false,
    mapContextScrolls: false,
    toolbarScrolls: false,
    surfacesVisible: {
      canvas: true,
      inspector: true,
      mapContext: true,
      rail: true,
      savedView: true,
      scanSummary: true,
      toolbar: true,
    },
  });
  process.stdout.write(`viewport: bodyScroll=${layout.bodyScrolls}, contextScroll=${layout.mapContextScrolls}, toolbarScroll=${layout.toolbarScrolls}\n`);
  process.stdout.write(`surfaces: ${Object.entries(layout.surfacesVisible).map(([name, visible]) => `${name}=${visible}`).join(", ")}\n`);
  assert(protectedRequests.some((request) => request.authorization === `Bearer ${authToken}`));

  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => sessionStorage.getItem("HIVEMAP_UI_TOKEN")), authToken);
  await renderedGraphNode.waitFor();

  const requestCountBeforeClear = protectedRequests.length;
  await page.getByRole("button", { name: "Settings" }).click();
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

function requirePositiveIntegerEnvironment(name) {
  const value = requireEnvironment(name);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

async function assertVisibleOutline(locator, label) {
  await locator.focus();
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      matchesFocusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  assert.equal(focus.matchesFocusVisible, true, `${label} must match :focus-visible`);
  assert.notEqual(focus.outlineStyle, "none", `${label} must have a visible outline style`);
  assert(focus.outlineWidth >= 2, `${label} outline must be at least 2px wide`);
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value) {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (match === null) throw new Error(`Expected an RGB color, received ${value}`);
  return match.slice(1, 4).map(Number);
}

function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
