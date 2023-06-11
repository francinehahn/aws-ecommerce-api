export enum OrderEventType {
    CREATED = "ORDER_CREATED",
    DELETED = "ORDER_DELETED"
}

export interface Envelope {
    eventType: OrderEventType,
    data: string
}

export interface OrderEvent {
    email: string,
    orderId: string,
    shipping: {
        type: string,
        carrier: string
    },
    billing: {
        payment: string,
        totalPrice: number
    },
    productCodes: string[],
    requestId: string
}