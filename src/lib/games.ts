import { asc, count, eq } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

export interface PaginatedGames {
    items: Game[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
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

/** All games ordered by title. */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
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
