import {
  createClient,
} from "redis";

function redisUrl() {
  const value =
    process.env.REDIS_URL;

  if (!value) {
    throw new Error(
      "REDIS_URL is required for shared rate limiting.",
    );
  }

  return value;
}

function buildRedisClient() {
  return createClient({
    url:
      redisUrl(),
  });
}

type RedisConnection =
  ReturnType<
    typeof buildRedisClient
  >;

let client:
  RedisConnection | null =
    null;

let connecting:
  Promise<RedisConnection> | null =
    null;

export async function getRedisClient():
  Promise<RedisConnection> {
  if (
    client?.isReady
  ) {
    return client;
  }

  if (connecting) {
    return connecting;
  }

  connecting =
    (async () => {
      const next =
        client ??
        buildRedisClient();

      if (!client) {
        next.on(
          "error",
          (error) => {
            console.error(
              "[redis]",
              error,
            );
          },
        );
      }

      if (!next.isOpen) {
        await next.connect();
      }

      client =
        next;

      return next;
    })();

  try {
    return await connecting;
  }
  finally {
    connecting =
      null;
  }
}

export async function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
) {
  const redis =
    await getRedisClient();

  const count =
    await redis.incr(
      key,
    );

  if (count === 1) {
    await redis.pExpire(
      key,
      windowMs,
    );
  }

  const ttl =
    await redis.pTTL(
      key,
    );

  return {
    count,

    remaining:
      Math.max(
        0,
        max - count,
      ),

    retryAfterSeconds:
      Math.max(
        1,
        Math.ceil(
          (
            ttl > 0
              ? ttl
              : windowMs
          ) /
          1000,
        ),
      ),

    limited:
      count > max,
  };
}