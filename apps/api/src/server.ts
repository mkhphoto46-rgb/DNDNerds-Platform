import { buildApp } from "./app";
import { config } from "./config";

async function main() {
  const app =
    await buildApp();

  const shutdown =
    async (
      signal: string,
    ) => {
      app.log.info(
        {
          signal,
        },
        "Shutting down API",
      );

      try {
        await app.close();
        process.exit(0);
      }
      catch (error) {
        app.log.error(
          error,
          "Graceful shutdown failed",
        );

        process.exit(1);
      }
    };

  process.on(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT",
      );
    },
  );

  process.on(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM",
      );
    },
  );

  try {
    await app.listen({
      host:
        config.API_HOST,

      port:
        config.API_PORT,
    });

    app.log.info(
      {
        url:
          `http://${config.API_HOST}:${config.API_PORT}`,
      },
      "DND Nerds API ready",
    );
  }
  catch (error) {
    app.log.error(
      error,
      "Failed to start API",
    );

    process.exit(1);
  }
}

void main();