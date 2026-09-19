import { test, expect, type Response } from '@playwright/test';

test.describe('Game Listing and Navigation', () => {
  test('should display games with titles on index page', async ({ page }) => {
    await test.step('Navigate to homepage', async () => {
      await page.goto('/');
    });

    await test.step('Verify games grid is visible', async () => {
      const gamesGrid = page.getByTestId('games-grid');
      await expect(gamesGrid).toBeVisible();
    });

    await test.step('Verify game cards are displayed', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first()).toBeVisible();
      expect(await gameCards.count()).toBeGreaterThan(0);
    });

    await test.step('Verify game cards have titles with content', async () => {
      const gameCards = page.getByTestId('game-card');
      await expect(gameCards.first().getByTestId('game-title')).toBeVisible();
      await expect(gameCards.first().getByTestId('game-title')).not.toBeEmpty();
    });
  });

  test('should filter games by category and publisher together', async ({ page }) => {
    await page.goto('/');
    const filters = page.getByTestId('game-filters');
    const firstCard = page.getByTestId('game-card').first();
    const categoryId = await firstCard.getAttribute('data-category-id');
    const publisherId = await firstCard.getAttribute('data-publisher-id');
    const firstCategory = filters.locator(`input[name="category"][value="${categoryId}"]`);
    const publisher = page.getByTestId('filter-publisher');

    await test.step('Apply a category filter', async () => {
      await firstCategory.check();
      await expect(page.getByTestId('game-card').first()).toBeVisible();
    });

    await test.step('Apply a publisher filter', async () => {
      await publisher.selectOption(publisherId ?? '');
      await expect(page.getByTestId('filter-page-status')).toContainText('Page 1 of');
    });

    await test.step('Verify every visible card matches both selected filters', async () => {
      const visibleCards = page.locator('[data-testid="game-card"]:not([hidden])');
      const count = await visibleCards.count();

      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        await expect(visibleCards.nth(index)).toHaveAttribute('data-category-id', categoryId ?? '');
        await expect(visibleCards.nth(index)).toHaveAttribute('data-publisher-id', publisherId ?? '');
      }
    });
  });

  test('should reset filtered pagination when filters change', async ({ page }) => {
    await page.goto('/');
    const next = page.getByTestId('filter-next');
    const firstCategory = page.getByTestId('game-filters').locator('input[name="category"]').first();

    await next.click();
    await expect(page.getByTestId('filter-page-status')).toContainText('Page 2 of');
    await firstCategory.check();
    await expect(page.getByTestId('filter-page-status')).toContainText('Page 1 of');
  });

  test('should navigate to correct game details page when clicking on a game', async ({ page }) => {
    let gameId: string | null;
    let gameTitle: string | null;

    await test.step('Navigate to homepage and wait for games to load', async () => {
      await page.goto('/');
      const gamesGrid = page.getByTestId('games-grid');
      await expect(gamesGrid).toBeVisible();
    });

    await test.step('Get first game information and click it', async () => {
      const firstGameCard = page.getByTestId('game-card').first();
      gameId = await firstGameCard.getAttribute('data-game-id');
      gameTitle = await firstGameCard.getAttribute('data-game-title');
      await firstGameCard.click();
    });

    await test.step('Verify navigation to game details page', async () => {
      await expect(page).toHaveURL(`/game/${gameId}`);
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify game title matches clicked game', async () => {
      if (gameTitle) {
        await expect(page.getByTestId('game-details-title')).toHaveText(gameTitle);
      }
    });
  });

  test('should navigate to a publisher page and show that publisher\'s games', async ({ page }) => {
    await test.step('Navigate to homepage and select a publisher link', async () => {
      await page.goto('/');
      const publisherTag = page.getByTestId('game-publisher').first();
      await expect(publisherTag).toBeVisible();
      const publisherName = (await publisherTag.textContent())?.trim() ?? '';
      const publisherLink = page.locator('a').filter({ has: publisherTag }).first();

      await publisherLink.click();
      await expect(page).toHaveURL(/\/publisher\/\d+$/);
      await expect(page.getByTestId('publisher-page')).toBeVisible();
      await expect(page.getByTestId('publisher-page-title')).toContainText(publisherName);
      await expect(page.getByTestId('publisher-games-grid')).toBeVisible();
      await expect(page.getByTestId('game-card').first()).toBeVisible();
      expect(await page.getByTestId('game-card').count()).toBeGreaterThan(0);
    });
  });

  test('should display game details with all required information', async ({ page }) => {
    await test.step('Navigate to specific game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify game title is displayed', async () => {
      const gameTitle = page.getByTestId('game-details-title');
      await expect(gameTitle).toBeVisible();
      await expect(gameTitle).not.toBeEmpty();
    });

    await test.step('Verify game description is displayed', async () => {
      const gameDescription = page.getByTestId('game-details-description');
      await expect(gameDescription).toBeVisible();
      await expect(gameDescription).not.toBeEmpty();
    });

    await test.step('Verify publisher or category information is present', async () => {
      const publisherExists = await page.getByTestId('game-details-publisher').isVisible();
      const categoryExists = await page.getByTestId('game-details-category').isVisible();
      expect(publisherExists || categoryExists).toBeTruthy();

      if (publisherExists) {
        await expect(page.getByTestId('game-details-publisher')).not.toBeEmpty();
      }

      if (categoryExists) {
        await expect(page.getByTestId('game-details-category')).not.toBeEmpty();
      }
    });

    await test.step('Verify category and publisher description blocks render when present', async () => {
      const categoryDescription = page.getByTestId('game-details-category-description');
      const publisherDescription = page.getByTestId('game-details-publisher-description');
      const categoryCount = await categoryDescription.count();
      const publisherCount = await publisherDescription.count();

      expect(categoryCount + publisherCount).toBeGreaterThan(0);

      if (categoryCount > 0) {
        await expect(categoryDescription).toBeVisible();
        await expect(categoryDescription).toContainText(/\S+/);
      }

      if (publisherCount > 0) {
        await expect(publisherDescription).toBeVisible();
        await expect(publisherDescription).toContainText(/\S+/);
      }
    });
  });

  test('should display a button to back the game', async ({ page }) => {
    await test.step('Navigate to game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Verify back game button is visible and enabled', async () => {
      const backButton = page.getByTestId('back-game-button');
      await expect(backButton).toBeVisible();
      await expect(backButton).toContainText('Support This Game');
      await expect(backButton).toBeEnabled();
    });
  });

  test('should paginate the game list with accessible controls', async ({ page }) => {
    await test.step('Navigate to the second page of the game list', async () => {
      await page.goto('/page/2');
      await expect(page.getByTestId('pagination')).toBeVisible();
      await expect(page.getByTestId('pagination-page-2')).toHaveAttribute('aria-current', 'page');
    });

    await test.step('Verify only the selected page is visible', async () => {
      await expect(page.getByTestId('game-card')).toHaveCount(6);
      await expect(page.getByTestId('pagination-next')).toHaveAttribute('aria-disabled', 'false');
    });
  });

  test('should be able to navigate back to home from game details', async ({ page }) => {
    await test.step('Navigate to game details page', async () => {
      await page.goto('/game/1');
      await expect(page.getByTestId('game-details')).toBeVisible();
    });

    await test.step('Click back to all games link', async () => {
      const backLink = page.getByRole('link', { name: /back to all games/i });
      await expect(backLink).toBeVisible();
      await backLink.click();
    });

    await test.step('Verify navigation back to homepage', async () => {
      await expect(page).toHaveURL('/');
      await expect(page.getByTestId('games-grid')).toBeVisible();
    });
  });

  test('should return a 404 page for a non-existent game', async ({ page }) => {
    let response: Response | null;

    await test.step('Navigate to non-existent game', async () => {
      response = await page.goto('/game/99999');
    });

    await test.step('Verify a branded 404 page is served', async () => {
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/Page Not Found - Tailspin Toys/);
      await expect(page.getByTestId('not-found')).toBeVisible();
      await expect(page.getByTestId('not-found-heading')).not.toBeEmpty();
      await expect(page.getByTestId('not-found-home-link')).toBeVisible();
    });
  });
});
