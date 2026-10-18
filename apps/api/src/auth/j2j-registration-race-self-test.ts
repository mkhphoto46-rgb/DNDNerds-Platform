import {
  randomUUID,
} from "node:crypto";

import Fastify from "fastify";

import {
  eq,
} from "drizzle-orm";

import {
  db,
  sqlClient,
} from "../db/client.js";

import {
  users,
} from "../db/schema.js";

import {
  isPostgresUniqueViolation,
  registerAuthRoutes,
} from "../routes/auth.js";

async function main() {
  const suffix =
    randomUUID()
      .replace(
        /-/g,
        "",
      )
      .slice(
        0,
        16,
      );

  const directEmail =
    `j2j-unique-${suffix}@example.test`;

  const raceEmail =
    `j2j-race-${suffix}@example.test`;

  const app =
    Fastify({
      logger:
        false,
    });

  try {
    await db
      .insert(
        users,
      )
      .values({
        email:
          directEmail,

        status:
          "ACTIVE",

        emailVerified:
          false,
      });

    let actualUniqueViolation =
      false;

    try {
      await db
        .insert(
          users,
        )
        .values({
          email:
            directEmail,

          status:
            "ACTIVE",

          emailVerified:
            false,
        });
    }
    catch (error) {
      actualUniqueViolation =
        isPostgresUniqueViolation(
          error,
        );

      if (!actualUniqueViolation) {
        throw error;
      }
    }

    if (!actualUniqueViolation) {
      throw new Error(
        "Actual PostgreSQL duplicate email was not recognized as a unique violation.",
      );
    }

    await app.register(
      registerAuthRoutes,
    );

    await app.ready();

    const payload = {
      email:
        raceEmail,

      password:
        "J2J-Race-Password-123!",
    };

    const [
      first,
      second,
    ] =
      await Promise.all([
        app.inject({
          method:
            "POST",

          url:
            "/api/v1/auth/register",

          payload,
        }),

        app.inject({
          method:
            "POST",

          url:
            "/api/v1/auth/register",

          payload,
        }),
      ]);

    const statuses =
      [
        first.statusCode,
        second.statusCode,
      ].sort(
        (
          a,
          b,
        ) =>
          a -
          b,
      );

    if (
      statuses[0] !==
        201 ||
      statuses[1] !==
        409
    ) {
      throw new Error(
        `Concurrent registration expected [201,409], received [${statuses.join(",")}].`,
      );
    }

    const conflict =
      first.statusCode ===
        409
        ? first
        : second;

    const conflictBody =
      conflict.json() as {
        error?: {
          code?: string;
        };
      };

    if (
      conflictBody.error
        ?.code !==
      "EMAIL_ALREADY_EXISTS"
    ) {
      throw new Error(
        "Concurrent duplicate registration did not return EMAIL_ALREADY_EXISTS.",
      );
    }

    const rows =
      await db
        .select({
          id:
            users.id,
        })
        .from(
          users,
        )
        .where(
          eq(
            users.email,
            raceEmail,
          ),
        );

    if (
      rows.length !==
      1
    ) {
      throw new Error(
        `Concurrent registration created ${rows.length} user rows instead of exactly one.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          postgresUniqueViolationRecognition:
            true,

          concurrentRegistrationStatuses:
            statuses,

          duplicateErrorCode:
            conflictBody.error
              ?.code,

          userRowCount:
            rows.length,
        },
        null,
        2,
      ),
    );
  }
  finally {
    await app.close();

    await db
      .delete(
        users,
      )
      .where(
        eq(
          users.email,
          raceEmail,
        ),
      );

    await db
      .delete(
        users,
      )
      .where(
        eq(
          users.email,
          directEmail,
        ),
      );

    await sqlClient.end({
      timeout:
        5,
    });
  }
}

main()
  .then(
    () => {
      process.exit(
        0,
      );
    },
  )
  .catch(
    error => {
      console.error(
        error,
      );

      process.exit(
        1,
      );
    },
  );
