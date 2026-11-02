import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyRefundClawback,releaseDeliveredFunds,releasePayoutReservation} from './seller-balance-policy.js';
test('balances beyond signed 32-bit remain exact through release and clawback',()=>{
 const balance={pendingRial:3_000_000_001,availableRial:0,negativeRial:1,paidOutRial:0};
 const released=releaseDeliveredFunds(balance,2_500_000_001);
 assert.deepEqual(released,{pendingRial:500_000_000,availableRial:2_500_000_000,negativeRial:0,paidOutRial:0});
 assert.deepEqual(applyRefundClawback(released,3_000_000_001),{pendingRial:0,availableRial:0,negativeRial:1,paidOutRial:0});
});
test('every balance transition refuses unsafe aggregate outputs before persistence',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 assert.throws(()=>releaseDeliveredFunds({pendingRial:1,availableRial:max,negativeRial:0,paidOutRial:0},1),/safe integer/);
 assert.throws(()=>releasePayoutReservation({pendingRial:0,availableRial:max,negativeRial:0,paidOutRial:0},1),/safe integer/);
 assert.throws(()=>applyRefundClawback({pendingRial:0,availableRial:0,negativeRial:max,paidOutRial:0},1),/safe integer/);
});
