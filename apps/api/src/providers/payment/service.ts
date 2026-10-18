import {
  getPaymentProvider,
} from "./registry.js";

import {
  claimPaymentProviderBinding,
  getPaymentProviderBinding,
  releasePaymentProviderClaim,
  updatePaymentProviderBinding,
} from "./binding-store.js";

export async function createProviderPayment(
  input: {
    paymentIntentId: string;
    amountRial: number;
    callbackUrl: string;
    description: string;
    customerEmail?: string;
    customerMobile?: string;
    providerKey?: string;
  },
) {
  const existing =
    await getPaymentProviderBinding(
      input.paymentIntentId,
    );

  const provider =
    getPaymentProvider(
      existing?.providerKey ??
        input.providerKey,
    );

  if (
    existing &&
    existing.providerIntentId
  ) {
    return {
      provider:
        existing.providerKey,

      providerIntentId:
        existing.providerIntentId,

      redirectUrl:
        provider
          .redirectUrlForIntent
          ?.(
            existing.providerIntentId,
          ) ??
        null,

      reused:
        true,
    };
  }

  const claim =
    existing
      ? {
          binding:
            existing,

          claimed:
            false,
        }
      : await claimPaymentProviderBinding({
          paymentIntentId:
            input.paymentIntentId,

          providerKey:
            provider.key,
        });

  if (!claim.claimed) {
    if (
      claim.binding.providerIntentId
    ) {
      return {
        provider:
          claim.binding.providerKey,

        providerIntentId:
          claim.binding.providerIntentId,

        redirectUrl:
          provider
            .redirectUrlForIntent
            ?.(
              claim.binding.providerIntentId,
            ) ??
          null,

        reused:
          true,
      };
    }

    throw new Error(
      "Payment provider session is already being created.",
    );
  }

  let created:
    Awaited<
      ReturnType<
        typeof provider.createPayment
      >
    >;

  try {
    created =
      await provider
        .createPayment(
          input,
        );
  }
  catch (error) {
    await releasePaymentProviderClaim({
      paymentIntentId:
        input.paymentIntentId,

      providerKey:
        provider.key,
    });

    throw error;
  }

  const binding =
    await updatePaymentProviderBinding({
      paymentIntentId:
        input.paymentIntentId,

      providerKey:
        provider.key,

      providerIntentId:
        created.providerIntentId,

      providerStatus:
        created.rawStatus,

      providerMetadata:
        created.metadata,
    });

  return {
    ...created,
    binding,
    reused:
      false,
  };
}

export async function verifyProviderPayment(
  input: {
    paymentIntentId: string;
    amountRial: number;
    query?: Record<string, string | undefined>;
  },
) {
  const binding =
    await getPaymentProviderBinding(
      input.paymentIntentId,
    );

  if (
    !binding ||
    !binding.providerIntentId
  ) {
    throw new Error(
      "Payment provider binding is missing.",
    );
  }

  const provider =
    getPaymentProvider(
      binding.providerKey,
    );

  const verified =
    await provider
      .verifyPayment({
        paymentIntentId:
          input.paymentIntentId,

        amountRial:
          input.amountRial,

        providerIntentId:
          binding.providerIntentId,

        query:
          input.query,
      });

  const updated =
    await updatePaymentProviderBinding({
      paymentIntentId:
        input.paymentIntentId,

      providerKey:
        binding.providerKey,

      providerIntentId:
        binding.providerIntentId,

      providerReference:
        verified.providerReference,

      providerStatus:
        verified.status,

      providerMetadata:
        verified.metadata,
    });

  return {
    ...verified,
    binding:
      updated,
  };
}
