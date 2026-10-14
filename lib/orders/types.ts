// An order: a procurement group, sent. See the schema note on `orders`.

export type OrderStatus = "sent" | "confirmed" | "partial" | "delivered" | "declined";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  sent: "נשלחה",
  confirmed: "אושרה",
  partial: "אושרה חלקית",
  delivered: "סופקה",
  declined: "נדחתה",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return value === "sent" || value === "confirmed" || value === "partial" || value === "delivered" || value === "declined";
}

/** One line as it is sent — the procurement line, snapshotted. */
export interface OrderLineInput {
  variantId: string;
  description: string;
  /** In ORDER units. */
  quantity: number;
  unitLabel: string;
  /** Per order unit; absent = unknown. */
  unitCost?: number;
}

export interface OrderLine extends OrderLineInput {
  id: string;
}

/** The studio's view of an order it sent. */
export interface Order {
  id: string;
  supplierId: string;
  supplierName: string;
  /** The supplier has an account and the order is in their inbox. Otherwise the studio shares it
   *  by hand and marks its status itself. */
  linked: boolean;
  windowFrom: string;
  windowTo: string;
  status: OrderStatus;
  note: string;
  reply: string;
  /** ISO instant. */
  sentAt: string;
  answeredAt?: string;
  lines: OrderLine[];
  /** Sum of the lines whose cost is known, and whether any is not. */
  cost: number;
  costPartial: boolean;
}

/** The supplier's view of an order sent to them: who, when, what — never the studio's cost side
 *  beyond the price the supplier themselves quoted. */
export interface IncomingOrder {
  id: string;
  studioName: string;
  studioPhone?: string;
  windowFrom: string;
  windowTo: string;
  status: OrderStatus;
  note: string;
  reply: string;
  sentAt: string;
  answeredAt?: string;
  lines: OrderLine[];
}
