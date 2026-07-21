import { describe, expect, it } from 'vitest';
import {
  assertDeliveryTransition,
  assertOrderTransition,
  assertPaymentTransition
} from '../../src/server/domain/stateMachines';

describe('state transition rules', () => {
  it('allows the standard order fulfilment path and blocks delivered rollback', () => {
    expect(assertOrderTransition('SUBMITTED', 'ACCEPTED')).toBe(true);
    expect(assertOrderTransition('ACCEPTED', 'PREPARING')).toBe(true);
    expect(assertOrderTransition('PREPARING', 'READY_FOR_DELIVERY')).toBe(true);
    expect(assertOrderTransition('DELIVERED', 'PREPARING')).toBe(false);
  });

  it('requires failed delivery to be rescheduled before reassignment', () => {
    expect(assertDeliveryTransition('OUT_FOR_DELIVERY', 'FAILED')).toBe(true);
    expect(assertDeliveryTransition('FAILED', 'ASSIGNED')).toBe(false);
    expect(assertDeliveryTransition('FAILED', 'RESCHEDULED')).toBe(true);
    expect(assertDeliveryTransition('RESCHEDULED', 'ASSIGNED')).toBe(true);
  });

  it('prevents invalid payment state jumps', () => {
    expect(assertPaymentTransition('PENDING', 'PROCESSING')).toBe(true);
    expect(assertPaymentTransition('PROCESSING', 'PAID')).toBe(true);
    expect(assertPaymentTransition('PAID', 'FAILED')).toBe(false);
  });
});
