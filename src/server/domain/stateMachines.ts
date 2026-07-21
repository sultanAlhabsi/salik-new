import type { DeliveryStatus, OrderStatus, PaymentStatus } from '@prisma/client';

const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: []
};

const deliveryTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  ASSIGNED: ['ACCEPTED'],
  ACCEPTED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: ['RESCHEDULED'],
  RESCHEDULED: ['ASSIGNED']
};

const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['AUTHORIZED', 'PROCESSING', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PROCESSING', 'PAID', 'FAILED', 'CANCELLED'],
  PROCESSING: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: ['PROCESSING', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED']
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return orderTransitions[from].includes(to);
}

export function assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return deliveryTransitions[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from].includes(to);
}
