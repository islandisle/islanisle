// Section 7.1's refund math — shared by bookings.js (the tourist's own
// cancel + its cancel-preview) and admin.js (a dispute resolved with a
// 'refund' outcome), so all three can never compute different numbers for
// the same booking.

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function computeRefund({ priceCharged, paymentMethod, refundFeeBusinessPercent, isOperatorFault }) {
  const grossRefundAmount = priceCharged; // Phase 1: full policy amount; partial-window % is a later refinement
  if (isOperatorFault || paymentMethod !== 'online') {
    return { grossRefundAmount, refundAppFee: 0, refundBusinessCredit: 0, refundAmount: grossRefundAmount };
  }
  const refundAppFee = round2(grossRefundAmount * 0.05); // fixed platform 5%
  const refundBusinessCredit = round2(grossRefundAmount * (refundFeeBusinessPercent / 100));
  const refundAmount = round2(grossRefundAmount - refundAppFee - refundBusinessCredit);
  return { grossRefundAmount, refundAppFee, refundBusinessCredit, refundAmount };
}
