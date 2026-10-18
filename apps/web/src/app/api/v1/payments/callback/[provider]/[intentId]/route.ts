import {
  proxyPaymentCallback,
} from "@/lib/payment-edge";

type Context = {
  params:
    Promise<{
      provider: string;
      intentId: string;
    }>;
};

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request,
  context: Context,
) {
  const {
    provider,
    intentId,
  } =
    await context.params;

  return proxyPaymentCallback(
    request,
    provider,
    intentId,
  );
}

export async function POST(
  request: Request,
  context: Context,
) {
  const {
    provider,
    intentId,
  } =
    await context.params;

  return proxyPaymentCallback(
    request,
    provider,
    intentId,
  );
}
