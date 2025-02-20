import type { Args } from "@std/cli";
import { createErrorString, createFail, createSuccess, isSuccess, Result } from "@joyautomation/dark-matter";
import { createClient } from "redis";

let redis: ReturnType<typeof createClient>;

/**
 * Validates if the given URL is a valid Redis URL
 * @param url - The URL to validate
 * @returns true if the URL is valid for Redis, false otherwise
 */
export function validateRedisUrl(url: string | undefined): Result<string> {
    if (!url) return createFail("Invalid URL"); 
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol === 'redis:' || parsedUrl.protocol === 'rediss:') {
            return createSuccess(url);
        } else {
            return createFail("Invalid protocol");
        }
    } catch (e) {
        return createFail(createErrorString(e));
    }
}

function createRedisConnectionString(args: Args) {
    const argsRedisUrlResult = validateRedisUrl(args["redis-url"]);
    if (isSuccess(argsRedisUrlResult)) return argsRedisUrlResult.output;
    const mantleRedisUrlResult = validateRedisUrl(Deno.env.get("MANTLE_REDIS_URL"));
    if (isSuccess(mantleRedisUrlResult)) return mantleRedisUrlResult.output;
    return "redis://localhost:6379";
}

export async function getRedis(args: Args) {
    try {
        if (!redis) {
            const url = createRedisConnectionString(args);
            redis = createClient({
                url,
            });
            await redis.connect();
        }
        return createSuccess(redis);
    } catch (e) {
        return createFail(createErrorString(e));
    }
}