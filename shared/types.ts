export interface Prices {
    currentRetail: string | null;
    currentKeyshops: string | null;
    historicalRetail: string | null;
    historicalKeyshops: string | null;
    currency: string;
}

export interface Game {
    title: string;
    url: string;
    prices: Prices;
}

export interface ApiResponse {
    success: boolean;
    data: Record<string, Game | null>;
    error?: string;
}