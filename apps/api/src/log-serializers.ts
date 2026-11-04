// B34: database errors carry user content. DrizzleQueryError puts the whole SQL text
// and its parameters (cover images, typed text) in `message`, `query` and `params`,
// and PostgreSQL errors repeat row values in `message`, `detail` and `where`.
// The logs keep only what is needed to diagnose: type, codes, table and constraint.

type LoggedError = Record<string, unknown>;

const DB_MESSAGE = "Database query failed (SQL text, parameters and values omitted from logs)";

function isDrizzleQueryError(error: Record<string, unknown>) {
  return error.constructor?.name === "DrizzleQueryError" || (typeof error.message === "string" && error.message.startsWith("Failed query:"));
}

function isPostgresError(error: Record<string, unknown>) {
  return error.name === "PostgresError" || (typeof error.severity === "string" && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code));
}

/** Keeps the stack frames but replaces the leading message lines, which repeat the error message. */
function framesOnly(stack: unknown, headline: string) {
  if (typeof stack !== "string") return undefined;
  const firstFrame = stack.search(/\n\s+at /);
  return firstFrame < 0 ? headline : headline + stack.slice(firstFrame);
}

export function safeErrorSerializer(value: unknown, depth = 0): unknown {
  if (typeof value !== "object" || value === null) return value;
  const error = value as Record<string, unknown>;
  const className = (error.constructor as { name?: string } | undefined)?.name;
  const type = typeof error.name === "string" && error.name !== "Error" ? error.name : className || "Error";

  if (isPostgresError(error)) {
    const headline = `${type}: PostgreSQL error ${String(error.code)}`;
    return { type, message: headline, code: error.code, severity: error.severity, table: error.table_name, constraint: error.constraint_name, column: error.column_name, routine: error.routine, stack: framesOnly(error.stack, headline) };
  }
  if (isDrizzleQueryError(error)) {
    const headline = `${type}: ${DB_MESSAGE}`;
    return { type, message: DB_MESSAGE, stack: framesOnly(error.stack, headline), cause: depth < 3 ? safeErrorSerializer(error.cause, depth + 1) : undefined };
  }

  const out: LoggedError = { type, message: typeof error.message === "string" ? error.message : String(error), stack: error.stack };
  for (const key of ["code", "statusCode", "apiCode", "validation", "validationContext"]) if (key in error) out[key] = error[key];
  if (error.cause !== undefined && depth < 3) out.cause = safeErrorSerializer(error.cause, depth + 1);
  return out;
}
