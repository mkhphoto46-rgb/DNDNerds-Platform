import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  financialLedgerPostings, financialLedgerTransactions, inventory, marketplaceAdminAuditLogs,
  marketplaceOrderItems, marketplaceOrders, marketplaceRefundCaseEvents, marketplaceRefundCases,
  marketplaceSellerOrders, payments, refunds, sellerBalances,
} from "../db/schema.js";
import { applyRefundClawback } from "../finance/seller-balance-policy.js";
import { PaymentDomainError } from "../payments/payment-service.js";
import { RefundProviderUncertainError } from "../providers/contracts/refund-provider.js";
import { findRefundProvider } from "../providers/refund/registry.js";
import { hasCompleteRefundPlan } from "./seller-order-refund-plan.js";
import { decideSellerOrderRefundScope } from "./seller-order-refund-policy.js";

const refundableSellerStates = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
function conflict(code: string, message: string): never {
  throw new PaymentDomainError(409, code, message);
}
function assertCasePlan(
  refundCase: typeof marketplaceRefundCases.$inferSelect,
  sellerOrder: typeof marketplaceSellerOrders.$inferSelect,
) {
  if (!hasCompleteRefundPlan(refundCase) ||
      refundCase.refundAmountRial !== sellerOrder.grossRial ||
      refundCase.commissionReversalRial !== sellerOrder.platformCommissionRial ||
      refundCase.sellerNetReversalRial !== sellerOrder.sellerNetRial ||
      refundCase.refundAmountRial !==
        refundCase.commissionReversalRial + refundCase.sellerNetReversalRial) {
    conflict("SELLER_REFUND_SNAPSHOT_MISMATCH", "The approved SellerOrder accounting plan does not match the original snapshot.");
  }
}

/** Claim under DB locks, commit, then call the pinned provider OUTSIDE the transaction. */
export async function executeSellerOrderRefundCase(caseId: string, adminUserId: string) {
  // Hard disabled in production until live-money gate and operator review are separately approved.
  if (process.env.NODE_ENV === "production" ||
      process.env.DND_ENABLE_MOCK_SELLER_REFUNDS !== "true") {
    conflict("SELLER_REFUND_EXECUTION_DISABLED", "SellerOrder financial execution is disabled by default.");
  }
  const claim = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`refund-case:${caseId}`}, 0))`);
    const [refundCase] = await tx.select().from(marketplaceRefundCases)
      .where(eq(marketplaceRefundCases.id, caseId)).limit(1);
    if (!refundCase) throw new PaymentDomainError(404, "REFUND_CASE_NOT_FOUND", "Refund case not found.");
    if (refundCase.status !== "APPROVED" || refundCase.financialRefundId ||
        (refundCase.returnRequired && !refundCase.returnReceivedAt)) {
      conflict("SELLER_REFUND_CASE_NOT_READY", "The case is not approved and ready for financial execution.");
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${refundCase.orderId}`}, 0))`);
    const [order] = await tx.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.id, refundCase.orderId)).limit(1);
    const [sellerOrder] = await tx.select().from(marketplaceSellerOrders)
      .where(eq(marketplaceSellerOrders.id, refundCase.sellerOrderId)).limit(1);
    if (!order || !sellerOrder || order.status !== "PAID" ||
        sellerOrder.orderId !== order.id || sellerOrder.storeId !== refundCase.storeId ||
        order.userId !== refundCase.buyerUserId ||
        !refundableSellerStates.includes(sellerOrder.status as typeof refundableSellerStates[number])) {
      conflict("SELLER_REFUND_SCOPE_INVALID", "Purchase, ownership, order or store scope failed verification.");
    }
    assertCasePlan(refundCase, sellerOrder);
    const [payment] = await tx.select().from(payments)
      .where(eq(payments.orderId, order.id)).limit(1);
    if (!payment || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) ||
        payment.currency !== sellerOrder.currency ||
        payment.amountRial !== order.customerTotalRial ||
        payment.refundedRial < 0) {
      conflict("SELLER_REFUND_PAYMENT_NOT_ELIGIBLE", "Payment is not eligible for SellerOrder refund.");
    }
    const adapter = findRefundProvider(payment.provider);
    if (!adapter) conflict("SELLER_REFUND_PROVIDER_UNKNOWN", "The pinned refund provider is not registered.");
    // Mock providers only in this local validation phase. No live PSP call possible.
    if (payment.provider !== "mock" && payment.provider !== "mock-secondary") {
      conflict("SELLER_REFUND_LIVE_PROVIDER_BLOCKED", "Live payment-provider execution is not activated.");
    }
    decideSellerOrderRefundScope({
      paymentAmountRial: payment.amountRial,
      alreadyRefundedRial: payment.refundedRial,
      sellerRefundRial: refundCase.refundAmountRial!,
      providerCanPartialRefund: adapter.capabilities.partialRefund,
    });
    const [pending] = await tx.select({ id: refunds.id }).from(refunds)
      .where(and(eq(refunds.paymentId, payment.id), eq(refunds.status, "PENDING"))).limit(1);
    if (pending) conflict("SELLER_REFUND_PENDING_PAYMENT_OPERATION", "Another pending refund requires reconciliation first.");
    const completedRefunds = await tx.select({ amountRial: refunds.amountRial }).from(refunds)
      .where(and(eq(refunds.paymentId, payment.id), eq(refunds.status, "SUCCEEDED")));
    const recordedTotal = completedRefunds.reduce((sum, row) => sum + row.amountRial, 0);
    if (!Number.isSafeInteger(recordedTotal) || recordedTotal !== payment.refundedRial) {
      conflict("SELLER_REFUND_PAYMENT_LEDGER_MISMATCH", "Completed refund totals do not reconcile with payment.refundedRial.");
    }
    const now = new Date();
    const [refund] = await tx.insert(refunds).values({
      orderId: order.id,
      paymentId: payment.id,
      provider: payment.provider,
      providerRefundId: null,
      idempotencyKey: `seller-case:${refundCase.id}`,
      amountRial: refundCase.refundAmountRial!,
      currency: payment.currency,
      status: "PENDING",
      reason: `Approved SellerOrder refund case ${refundCase.id}`,
      updatedAt: now,
    }).returning();
    if (!refund) throw new Error("SELLER_REFUND_CLAIM_INSERT_FAILED");
    const updated = await tx.update(marketplaceRefundCases).set({
      status: "REFUND_PROCESSING", financialRefundId: refund.id, updatedAt: now,
    }).where(and(
      eq(marketplaceRefundCases.id, refundCase.id),
      eq(marketplaceRefundCases.status, "APPROVED"),
    )).returning({ id: marketplaceRefundCases.id });
    if (updated.length !== 1) conflict("SELLER_REFUND_CASE_STATE_CHANGED", "Refund case changed while creating claim.");
    await tx.insert(marketplaceRefundCaseEvents).values({
      caseId: refundCase.id, actorUserId: adminUserId, actorRole: "ADMIN",
      eventType: "FINANCIAL_REFUND_CLAIMED",
      details: JSON.stringify({ refundId: refund.id, amountRial: refund.amountRial, provider: refund.provider }),
    });
    await tx.insert(marketplaceAdminAuditLogs).values({
      adminUserId, action: "SELLER_ORDER_FINANCIAL_REFUND_CLAIMED",
      entityType: "marketplace_refund_case", entityId: refundCase.id,
      details: JSON.stringify({ refundId: refund.id, sellerOrderId: sellerOrder.id }),
    });
    return { refund, payment };
  });

  const adapter = findRefundProvider(claim.payment.provider);
  if (!adapter) conflict("SELLER_REFUND_PROVIDER_DISAPPEARED", "Pinned refund adapter is unavailable.");
  let result;
  try {
    // IMPORTANT: provider call is after the durable PENDING claim, not in an open DB transaction.
    result = await adapter.createRefund({
      refundId: claim.refund.id,
      orderId: claim.refund.orderId,
      paymentId: claim.payment.id,
      providerPaymentId: claim.payment.providerPaymentId,
      amountRial: claim.refund.amountRial,
      currency: claim.refund.currency,
      idempotencyKey: claim.refund.idempotencyKey,
      reason: claim.refund.reason,
    });
  } catch (error) {
    // Even seemingly definitive network errors are not safe evidence that money did not move.
    // Leave PENDING; a missing provider refund reference ALWAYS requires manual investigation.
    throw new PaymentDomainError(502, "SELLER_REFUND_PROVIDER_OUTCOME_UNCERTAIN",
      "Provider outcome is unknown; pending claim must be reconciled, never blindly replayed.",
      { refundId: claim.refund.id,
        providerError: error instanceof RefundProviderUncertainError ? error.code : "PROVIDER_ERROR" });
  }
  if (result.provider !== claim.refund.provider || !result.providerRefundId ||
      typeof result.providerRefundId !== "string") {
    conflict("SELLER_REFUND_PROVIDER_RESULT_MISMATCH",
      "Provider identity/reference mismatch; pending refund needs manual reconciliation.");
  }
  const [stored] = await db.update(refunds).set({
    providerRefundId: result.providerRefundId,
    status: result.status === "FAILED" ? "FAILED" : "PENDING",
    failedAt: result.status === "FAILED" ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(refunds.id, claim.refund.id), eq(refunds.status, "PENDING"))).returning();
  if (!stored) conflict("SELLER_REFUND_PROVIDER_RESULT_PERSISTENCE_FAILED", "Claim changed while persisting provider result.");
  if (result.status === "SUCCEEDED") {
    return finalizeSellerOrderRefund(stored.id);
  }
  // PROCESSING and FAILED are deliberately NOT silently replayed.
  return { refund: stored, idempotent: false };
}

/** Called only on a trusted SUCCEEDED provider response (or reconciliation query). */
export async function finalizeSellerOrderRefund(refundId: string) {
  // Outside-transaction lookup is only for stable lock ordering; re-validate everything inside.
  const linkedCases = await db.select({ id: marketplaceRefundCases.id }).from(marketplaceRefundCases)
    .where(eq(marketplaceRefundCases.financialRefundId, refundId)).limit(2);
  if (linkedCases.length !== 1) conflict("SELLER_REFUND_CASE_LINK_AMBIGUOUS", "Refund must belong to exactly one seller case.");
  const linkedCase = linkedCases[0]!;
  if (!linkedCase) conflict("SELLER_REFUND_CASE_LINK_MISSING", "Financial refund has no linked SellerOrder case.");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`refund-case:${linkedCase.id}`}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`refund-finalize:${refundId}`}, 0))`);
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    const [refundCase] = await tx.select().from(marketplaceRefundCases)
      .where(eq(marketplaceRefundCases.id, linkedCase.id)).limit(1);
    if (!refund || !refundCase || refundCase.financialRefundId !== refund.id) {
      conflict("SELLER_REFUND_LINK_INVALID", "Refund case and monetary claim do not match.");
    }
    if (refund.status === "SUCCEEDED" && refundCase.status === "REFUNDED") {
      return { refund, idempotent: true };
    }
    if (refund.status !== "PENDING" || refundCase.status !== "REFUND_PROCESSING" ||
        !refund.providerRefundId ||
        (refundCase.returnRequired && !refundCase.returnReceivedAt)) {
      conflict("SELLER_REFUND_NOT_FINALIZABLE", "Refund is not in a finalizable financial state.");
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`refund:${refund.orderId}`}, 0))`);
    const [order] = await tx.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.id, refund.orderId)).limit(1);
    const [sellerOrder] = await tx.select().from(marketplaceSellerOrders)
      .where(eq(marketplaceSellerOrders.id, refundCase.sellerOrderId)).limit(1);
    const [payment] = await tx.select().from(payments)
      .where(eq(payments.id, refund.paymentId)).limit(1);
    if (!order || !sellerOrder || !payment ||
        order.id !== refundCase.orderId || sellerOrder.orderId !== order.id ||
        sellerOrder.storeId !== refundCase.storeId ||
        order.userId !== refundCase.buyerUserId ||
        !refundableSellerStates.includes(sellerOrder.status as typeof refundableSellerStates[number]) ||
        !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) ||
        order.status !== "PAID" ||
        payment.orderId !== order.id ||
        payment.provider !== refund.provider || payment.currency !== refund.currency ||
        payment.amountRial !== order.customerTotalRial ||
        refund.amountRial !== refundCase.refundAmountRial) {
      conflict("SELLER_REFUND_FINAL_SCOPE_INVALID", "Snapshot, scope or payment state failed finalization checks.");
    }
    assertCasePlan(refundCase, sellerOrder);
    const adapter = findRefundProvider(refund.provider);
    if (!adapter || (refund.provider !== "mock" && refund.provider !== "mock-secondary")) {
      conflict("SELLER_REFUND_FINAL_PROVIDER_BLOCKED", "Live provider financial settlement is not activated.");
    }
    const decision = decideSellerOrderRefundScope({
      paymentAmountRial: payment.amountRial, alreadyRefundedRial: payment.refundedRial,
      sellerRefundRial: refund.amountRial,
      providerCanPartialRefund: adapter.capabilities.partialRefund,
    });
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`seller-balance:${sellerOrder.storeId}`}, 0))`);
    // Re-read after lock (other authorized balance operations may have changed this row).
    const [lockedBalance] = await tx.select().from(sellerBalances)
      .where(eq(sellerBalances.storeId, sellerOrder.storeId)).limit(1);
    if (!lockedBalance) conflict("SELLER_REFUND_BALANCE_MISSING", "Seller balance disappeared.");
    const nextBalance = applyRefundClawback(lockedBalance, refundCase.sellerNetReversalRial!);
    const now = new Date();
    await tx.update(sellerBalances).set({
      pendingRial: nextBalance.pendingRial, availableRial: nextBalance.availableRial,
      negativeRial: nextBalance.negativeRial, updatedAt: now,
    }).where(eq(sellerBalances.storeId, sellerOrder.storeId));
    const amounts = [
      -refund.amountRial, refundCase.commissionReversalRial!, refundCase.sellerNetReversalRial!,
    ];
    if (amounts.some(n => !Number.isSafeInteger(n)) || amounts.reduce((a, b) => a + b, 0) !== 0) {
      conflict("SELLER_REFUND_LEDGER_UNBALANCED", "Refund ledger postings are not balanced.");
    }
    const [ledger] = await tx.insert(financialLedgerTransactions).values({
      kind: "REFUND", orderId: order.id, paymentId: payment.id, refundId: refund.id,
      idempotencyKey: `seller-refund:${refund.id}`,
    }).returning({ id: financialLedgerTransactions.id });
    if (!ledger) throw new Error("SELLER_REFUND_LEDGER_INSERT_FAILED");
    await tx.insert(financialLedgerPostings).values([
      { transactionId: ledger.id, accountCode: "PLATFORM_CASH", storeId: null, amountRial: amounts[0]! },
      { transactionId: ledger.id, accountCode: "PLATFORM_COMMISSION_REVENUE", storeId: null, amountRial: amounts[1]! },
      { transactionId: ledger.id, accountCode: "SELLER_PAYABLE", storeId: sellerOrder.storeId, amountRial: amounts[2]! },
    ]);
    // Like the existing full-order engine: only put stock back when inventory was never shipped.
    if (sellerOrder.status === "PAID") {
      const lines = await tx.select({ variantId: marketplaceOrderItems.variantId, quantity: marketplaceOrderItems.quantity })
        .from(marketplaceOrderItems).where(eq(marketplaceOrderItems.sellerOrderId, sellerOrder.id));
      for (const line of lines) {
        await tx.update(inventory).set({
          quantityOnHand: sql`${inventory.quantityOnHand} + ${line.quantity}`, updatedAt: now,
        }).where(eq(inventory.variantId, line.variantId));
      }
    }
    await tx.update(marketplaceSellerOrders).set({ status: "REFUNDED", updatedAt: now })
      .where(eq(marketplaceSellerOrders.id, sellerOrder.id));
    const allSellerOrders = await tx.select({ id: marketplaceSellerOrders.id, status: marketplaceSellerOrders.status })
      .from(marketplaceSellerOrders).where(eq(marketplaceSellerOrders.orderId, order.id));
    const allRefunded = allSellerOrders.length > 0 && allSellerOrders.every(row =>
      row.id === sellerOrder.id || row.status === "REFUNDED");
    if (allRefunded && decision.paymentStatus !== "REFUNDED") {
      conflict("SELLER_REFUND_PARENT_PAYMENT_MISMATCH", "All seller orders refunded but payment retains money.");
    }
    if (!allRefunded && decision.paymentStatus === "REFUNDED") {
      conflict("SELLER_REFUND_PARENT_PAYMENT_MISMATCH", "Payment fully refunded while another seller remains active.");
    }
    await tx.update(payments).set({
      refundedRial: decision.paymentAfterRefundRial,
      status: decision.paymentStatus, updatedAt: now,
    }).where(eq(payments.id, payment.id));
    if (allRefunded) {
      await tx.update(marketplaceOrders).set({ status: "REFUNDED", updatedAt: now })
        .where(eq(marketplaceOrders.id, order.id));
    }
    await tx.update(refunds).set({ status: "SUCCEEDED", succeededAt: now, failedAt: null, updatedAt: now })
      .where(eq(refunds.id, refund.id));
    await tx.update(marketplaceRefundCases).set({ status: "REFUNDED", updatedAt: now })
      .where(eq(marketplaceRefundCases.id, refundCase.id));
    await tx.insert(marketplaceRefundCaseEvents).values({
      caseId: refundCase.id, actorUserId: null, actorRole: "SYSTEM",
      eventType: "FINANCIAL_REFUND_SUCCEEDED",
      details: JSON.stringify({ refundId: refund.id, sellerOrderId: sellerOrder.id,
        amountRial: refund.amountRial, aggregateOrderRefunded: allRefunded }),
    });
    return { refund: { ...refund, status: "SUCCEEDED" as const }, idempotent: false };
  });
}
