import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getCatalogSummary,
    getFilteredGames,
    getGameFilterOptions,
    getGameById,
    getGamesPage,
    matchesTitleQuery,
    normalizePageNumber,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns the catalog summary with total games and average rating', async () => {
        await seedGames(db, 3);

        const summary = await getCatalogSummary(db);

        expect(summary).toEqual({
            totalGames: 3,
            averageRating: 4.2,
            ratedGames: 3,
        });
    });

    it('returns a null average rating when no games are rated', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });

        await db.insert(games).values([
            { title: 'Game One', description: 'game', starRating: null, categoryId: category.id, publisherId: publisher.id },
            { title: 'Game Two', description: 'game', starRating: null, categoryId: category.id, publisherId: publisher.id },
        ]);

        const summary = await getCatalogSummary(db);

        expect(summary).toEqual({
            totalGames: 2,
            averageRating: null,
            ratedGames: 0,
        });
    });

    it('returns zeros for an empty catalog summary', async () => {
        const summary = await getCatalogSummary(db);

        expect(summary).toEqual({
            totalGames: 0,
            averageRating: null,
            ratedGames: 0,
        });
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({
            id: expect.any(Number),
            name: 'Strategy',
            description: 'cat',
        });
        expect(all[0].publisher).toEqual({
            id: expect.any(Number),
            name: 'Pub One',
            description: 'pub',
        });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('returns filter options ordered by name', async () => {
        await db.insert(categories).values([
            { name: 'Tactical', description: 'cat' },
            { name: 'Adventure', description: 'cat' },
        ]);
        await db.insert(publishers).values([
            { name: 'Zeta', description: 'pub' },
            { name: 'Alpha', description: 'pub' },
        ]);

        const options = await getGameFilterOptions(db);

        expect(options.categories.map((category) => category.name)).toEqual(['Adventure', 'Tactical']);
        expect(options.publishers.map((publisher) => publisher.name)).toEqual(['Alpha', 'Zeta']);
    });

    it('filters by any selected category and the selected publisher', async () => {
        const [strategy, adventure] = await db
            .insert(categories)
            .values([
                { name: 'Strategy', description: 'cat' },
                { name: 'Adventure', description: 'cat' },
            ])
            .returning({ id: categories.id });
        const [publisherOne, publisherTwo] = await db
            .insert(publishers)
            .values([
                { name: 'Pub One', description: 'pub' },
                { name: 'Pub Two', description: 'pub' },
            ])
            .returning({ id: publishers.id });
        await db.insert(games).values([
            { title: 'Adventure One', description: 'game', starRating: 4, categoryId: adventure.id, publisherId: publisherOne.id },
            { title: 'Strategy One', description: 'game', starRating: 4, categoryId: strategy.id, publisherId: publisherOne.id },
            { title: 'Strategy Two', description: 'game', starRating: 4, categoryId: strategy.id, publisherId: publisherTwo.id },
        ]);

        const filtered = await getFilteredGames(db, {
            categoryIds: [strategy.id, adventure.id],
            publisherId: publisherOne.id,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Adventure One', 'Strategy One']);
    });

    it('returns no games when filters do not match', async () => {
        await seedGames(db, 2);

        const filtered = await getFilteredGames(db, { categoryIds: [99999] });

        expect(filtered).toEqual([]);
    });

    it('matches a title query case-insensitively', () => {
        expect(matchesTitleQuery('Galaxy Quest', 'quest')).toBe(true);
        expect(matchesTitleQuery('Galaxy Quest', 'QUEST')).toBe(true);
        expect(matchesTitleQuery('Galaxy Quest', 'planet')).toBe(false);
        expect(matchesTitleQuery('  Galaxy Quest  ', ' galaxy ')).toBe(true);
    });

    it('filters by title search text in addition to category and publisher filters', async () => {
        const [strategy, adventure] = await db
            .insert(categories)
            .values([
                { name: 'Strategy', description: 'cat' },
                { name: 'Adventure', description: 'cat' },
            ])
            .returning({ id: categories.id });
        const [publisherOne, publisherTwo] = await db
            .insert(publishers)
            .values([
                { name: 'Pub One', description: 'pub' },
                { name: 'Pub Two', description: 'pub' },
            ])
            .returning({ id: publishers.id });

        await db.insert(games).values([
            { title: 'Quest for Glory', description: 'game', starRating: 4, categoryId: adventure.id, publisherId: publisherOne.id },
            { title: 'Strategy Quest', description: 'game', starRating: 4, categoryId: strategy.id, publisherId: publisherOne.id },
            { title: 'Moonlit Drift', description: 'game', starRating: 4, categoryId: strategy.id, publisherId: publisherTwo.id },
        ]);

        const filtered = await getFilteredGames(db, {
            categoryIds: [strategy.id, adventure.id],
            publisherId: publisherOne.id,
            titleSearch: 'quest',
        });

        expect(filtered.map((game) => game.title)).toEqual(['Quest for Glory', 'Strategy Quest']);
    });

    it('fetches a single game by id with related descriptions', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
        expect(game?.category?.description).toBe('cat');
        expect(game?.publisher?.description).toBe('pub');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('paginates the full set of games with metadata', async () => {
        await seedGames(db, 8);

        const page = await getGamesPage(db, 2, 3);

        expect(page.totalCount).toBe(8);
        expect(page.totalPages).toBe(3);
        expect(page.currentPage).toBe(2);
        expect(page.pageSize).toBe(3);
        expect(page.items.map((game) => game.title)).toEqual(['Game 04', 'Game 05', 'Game 06']);
    });

    it('normalizes out-of-range page numbers', () => {
        expect(normalizePageNumber(0, 3)).toBe(1);
        expect(normalizePageNumber(99, 3)).toBe(3);
        expect(normalizePageNumber(2, 1)).toBe(1);
    });
});
