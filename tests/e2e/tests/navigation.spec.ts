import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("should display dashboard page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("should show stats cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Total Connections")).toBeVisible();
    await expect(page.locator("text=Companies")).toBeVisible();
    await expect(page.locator("text=Messages")).toBeVisible();
    await expect(page.locator("text=Applications")).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("should navigate to People page", async ({ page }) => {
    await page.goto("/");
    await page.click("text=People");
    await expect(page).toHaveURL("/people");
    await expect(page.locator("h1")).toContainText("People");
  });

  test("should navigate to Companies page", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Companies");
    await expect(page).toHaveURL("/companies");
    await expect(page.locator("h1")).toContainText("Companies");
  });

  test("should navigate to Messages page", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Messages");
    await expect(page).toHaveURL("/messages");
    await expect(page.locator("h1")).toContainText("Messages");
  });

  test("should navigate to AI Assistant page", async ({ page }) => {
    await page.goto("/");
    await page.click("text=AI Assistant");
    await expect(page).toHaveURL("/ai");
    await expect(page.locator("h1")).toContainText("AI Assistant");
  });
});

test.describe("People Page", () => {
  test("should display people table", async ({ page }) => {
    await page.goto("/people");
    await expect(page.locator("h1")).toContainText("People");
    await expect(page.locator("table")).toBeVisible();
  });

  test("should have search input", async ({ page }) => {
    await page.goto("/people");
    await expect(page.locator("input[placeholder='Search people...']")).toBeVisible();
  });
});

test.describe("AI Assistant", () => {
  test("should display chat interface", async ({ page }) => {
    await page.goto("/ai");
    await expect(page.locator("h1")).toContainText("AI Assistant");
    await expect(page.locator("input[placeholder='Ask about your network...']")).toBeVisible();
    await expect(page.locator("button:has-text('Send')")).toBeVisible();
  });

  test("should send message", async ({ page }) => {
    await page.goto("/ai");
    await page.fill("input[placeholder='Ask about your network...']", "Hello");
    await page.click("button:has-text('Send')");
    await expect(page.locator("text=Hello")).toBeVisible();
  });
});

test.describe("Imports Page", () => {
  test("should display import interface", async ({ page }) => {
    await page.goto("/imports");
    await expect(page.locator("h1")).toContainText("Imports");
    await expect(page.locator("text=Click to upload LinkedIn ZIP file")).toBeVisible();
  });
});

test.describe("Settings Page", () => {
  test("should display settings interface", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("text=AI Providers")).toBeVisible();
  });
});
