import type { Game } from '../types/game';

export type GameSort = 'title-asc' | 'title-desc' | 'rating-desc';

function compareStarRatings(left: number | null, right: number | null): number {
    if (left === null && right === null) {
        return 0;
    }

    if (left === null) {
        return 1;
    }

    if (right === null) {
        return -1;
    }

    return right - left;
}

/** Sorts game cards using the catalog order requested by the user. */
export function sortGames(items: Game[], sort: GameSort = 'title-asc'): Game[] {
    return [...items].sort((left, right) => {
        switch (sort) {
            case 'title-desc':
                return right.title.localeCompare(left.title) || compareStarRatings(right.starRating, left.starRating);
            case 'rating-desc':
                return compareStarRatings(left.starRating, right.starRating) || left.title.localeCompare(right.title);
            case 'title-asc':
            default:
                return left.title.localeCompare(right.title) || compareStarRatings(right.starRating, left.starRating);
        }
    });
}
