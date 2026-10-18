import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import {
  db,
} from "../../db/client.js";

import {
  paymentProviderBindings,
} from "../../db/schema.js";

export async function getPaymentProviderBinding(
  paymentIntentId: string,
) {
  const rows =
    await db
      .select()
      .from(
        paymentProviderBindings,
      )
      .where(
        eq(
          paymentProviderBindings
            .paymentIntentId,
          paymentIntentId,
        ),
      )
      .limit(
        1,
      );

  return rows[0];
}

export async function claimPaymentProviderBinding(
  input: {
    paymentIntentId: string;
    providerKey: string;
  },
) {
  const inserted =
    await db
      .insert(
        paymentProviderBindings,
      )
      .values({
        paymentIntentId:
          input.paymentIntentId,

        providerKey:
          input.providerKey,

        providerIntentId:
          null,

        providerStatus:
          "CREATING",

        providerMetadata:
          {},
      })
      .onConflictDoNothing()
      .returning();

  if (
    inserted[0]
  ) {
    return {
      binding:
        inserted[0],

      claimed:
        true,
    };
  }

  const existing =
    await getPaymentProviderBinding(
      input.paymentIntentId,
    );

  if (!existing) {
    throw new Error(
      "Payment provider binding claim failed.",
    );
  }

  if (
    existing.providerKey !==
    input.providerKey
  ) {
    throw new Error(
      `Payment intent '${input.paymentIntentId}' is already bound to provider '${existing.providerKey}'.`,
    );
  }

  return {
    binding:
      existing,

    claimed:
      false,
  };
}

export async function bindPaymentProvider(
  input: {
    paymentIntentId: string;
    providerKey: string;
    providerIntentId?: string | null;
    providerStatus?: string | null;
    providerMetadata?: Record<string, unknown>;
  },
) {
  const claimed =
    await claimPaymentProviderBinding({
      paymentIntentId:
        input.paymentIntentId,

      providerKey:
        input.providerKey,
    });

  if (
    claimed.binding.providerIntentId
  ) {
    return claimed.binding;
  }

  return updatePaymentProviderBinding({
    paymentIntentId:
      input.paymentIntentId,

    providerKey:
      input.providerKey,

    providerIntentId:
      input.providerIntentId ??
      null,

    providerStatus:
      input.providerStatus ??
      null,

    providerMetadata:
      input.providerMetadata ??
      {},
  });
}

export async function releasePaymentProviderClaim(
  input: {
    paymentIntentId: string;
    providerKey: string;
  },
) {
  await db
    .delete(
      paymentProviderBindings,
    )
    .where(
      and(
        eq(
          paymentProviderBindings
            .paymentIntentId,
          input.paymentIntentId,
        ),

        eq(
          paymentProviderBindings
            .providerKey,
          input.providerKey,
        ),

        eq(
          paymentProviderBindings
            .providerStatus,
          "CREATING",
        ),
      ),
    );
}

export async function updatePaymentProviderBinding(
  input: {
    paymentIntentId: string;
    providerKey: string;
    providerIntentId?: string | null;
    providerReference?: string | null;
    providerStatus?: string | null;
    providerMetadata?: Record<string, unknown>;
  },
) {
  const rows =
    await db
      .update(
        paymentProviderBindings,
      )
      .set({
        providerIntentId:
          input.providerIntentId,

        providerReference:
          input.providerReference,

        providerStatus:
          input.providerStatus,

        providerMetadata:
          input.providerMetadata,

        updatedAt:
          sql`now()`,
      })
      .where(
        and(
          eq(
            paymentProviderBindings
              .paymentIntentId,
            input.paymentIntentId,
          ),

          eq(
            paymentProviderBindings
              .providerKey,
            input.providerKey,
          ),
        ),
      )
      .returning();

  const row =
    rows[0];

  if (!row) {
    throw new Error(
      "Payment provider binding update failed or provider key did not match.",
    );
  }

  return row;
}
