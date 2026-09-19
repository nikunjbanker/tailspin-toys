import { and, asc, avg, count, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

export interface CatalogSummary {
    totalGames: number;
    averageRating: number | null;
    ratedGames: number;
}

export interface PaginatedGames {
    items: Game[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}

export interface GameFilterOptions {
    categories: Array<{ id: number; name: string }>;
    publishers: Array<{ id: number; name: string }>;
}

export interface GameFilters {
    categoryIds?: number[];
    publisherId?: number;
    titleSearch?: string;
}

/**
 * Checks whether a title contains the typed search text, ignoring case and surrounding whitespace.
 *
 * @param title - The game title to evaluate.
 * @param query - The user-entered search string.
 * @returns True when the query is empty or the title includes the query.
 */
export function matchesTitleQuery(title: string, query: string): boolean {
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedQuery = query.trim().toLowerCase();

    return normalizedQuery.length === 0 || normalizedTitle.includes(normalizedQuery);
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    categoryDescription: categories.description,
    publisherId: publishers.id,
    publisherName: publishers.name,
    publisherDescription: publishers.description,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    categoryDescription: string | null;
    publisherId: number | null;
    publisherName: string | null;
    publisherDescription: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? {
                      id: row.categoryId,
                      name: row.categoryName,
                      description: row.categoryDescription,
                  }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? {
                      id: row.publisherId,
                      name: row.publisherName,
                      description: row.publisherDescription,
                  }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/** Returns the closest valid page number within the available range. */
export function normalizePageNumber(page: number, totalPages: number): number {
    const parsedPage = Number.isFinite(page) ? Math.trunc(page) : 1;

    if (parsedPage < 1) {
        return 1;
    }

    if (totalPages < 1) {
        return 1;
    }

    return Math.min(parsedPage, totalPages);
}

/** Returns the total game count and average star rating for games that have a rating. */
export async function getCatalogSummary(db: Database): Promise<CatalogSummary> {
    const [totalResult, ratingResult] = await Promise.all([
        db.select({ count: count() }).from(games),
        db
            .select({
                averageRating: avg(games.starRating),
                ratedGames: count(games.starRating),
            })
            .from(games),
    ]);

    const totalGames = Number(totalResult[0]?.count ?? 0);
    const ratedGames = Number(ratingResult[0]?.ratedGames ?? 0);
    const averageRating = ratingResult[0]?.averageRating ?? null;

    return {
        totalGames,
        averageRating: averageRating === null || Number.isNaN(Number(averageRating)) ? null : Number(averageRating),
        ratedGames,
    };
}

/** All games ordered by title. */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/** Returns stable category and publisher options for catalog filters. */
export async function getGameFilterOptions(db: Database): Promise<GameFilterOptions> {
    const [categoryRows, publisherRows] = await Promise.all([
        db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
        db.select({ id: publishers.id, name: publishers.name }).from(publishers).orderBy(asc(publishers.name)),
    ]);

    return { categories: categoryRows, publishers: publisherRows };
}

/** Returns games matching any selected category, publisher, and optional title query, ordered by title. */
export async function getFilteredGames(db: Database, filters: GameFilters): Promise<Game[]> {
    const conditions = [];

    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }

    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    if (filters.titleSearch && filters.titleSearch.trim().length > 0) {
        const searchText = filters.titleSearch.trim().toLowerCase();
        conditions.push(sql`LOWER(${games.title}) LIKE ${`%${searchText}%`}`);
    }

    const rows = await baseGamesQuery(db)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(games.title));

    return rows.map(mapGame);
}

/** Returns one page of games and pagination metadata. */
export async function getGamesPage(db: Database, page = 1, pageSize = 6): Promise<PaginatedGames> {
    const safePageSize = Math.max(1, Math.trunc(pageSize));
    const totalCountResult = await db.select({ count: count() }).from(games);
    const totalCount = Number(totalCountResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    const currentPage = normalizePageNumber(page, totalPages);
    const offset = (currentPage - 1) * safePageSize;
    const rows = await baseGamesQuery(db)
        .orderBy(asc(games.title))
        .limit(safePageSize)
        .offset(offset);

    return {
        items: rows.map(mapGame),
        totalCount,
        totalPages,
        currentPage,
        pageSize: safePageSize,
    };
}

/** All game ids ordered by title. */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
