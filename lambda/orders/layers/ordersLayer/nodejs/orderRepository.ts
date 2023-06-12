import { DocumentClient } from "aws-sdk/clients/dynamodb"

export interface OrderProduct {
    code: string,
    price: number
}

export interface Order {
    pk: string,
    sk: string,
    createdAt: number,
    shipping: {
        type: "URGENT" | "ECONOMIC",
        carrier: "CORREIOS" | "FEDEX"
    },
    billing: {
        payment: "CASH" | "DEBIT_CARD" | "CREDIT_CARD",
        totalPrice: number
    },
    products: OrderProduct[]
}

export class OrderRepository {
    private dbclient: DocumentClient
    private ordersdb: string

    constructor (dbclient: DocumentClient, ordersdb: string) {
        this.dbclient = dbclient
        this.ordersdb = ordersdb
    }

    async insertOrder (order: Order): Promise<Order> {
        await this.dbclient.put({
            TableName: this.ordersdb,
            Item: order
        }).promise()

        return order
    }

    async getAllOrders (): Promise<Order[]> {
        const data = await this.dbclient.scan({
            TableName: this.ordersdb
        }).promise()

        return data.Items as Order[]
    }

    async getOrdersByEmail (email: string): Promise<Order[]> {
        const data = await this.dbclient.query({
            TableName: this.ordersdb,
            KeyConditionExpression: "pk = :email",
            ExpressionAttributeValues: {
                ":email": email
            }
        }).promise()

        return data.Items as Order[]
    }

    async getOrderByEmailAndOrderId (email: string, orderId: string): Promise<Order> {
        const data = await this.dbclient.get({
            TableName: this.ordersdb,
            Key: {
                pk: email,
                sk: orderId
            }
        }).promise()

        if (data.Item) {
            return data.Item as Order
        } else {
            throw new Error("Order not found.")
        }
    }

    async deleteOrder (email: string, orderId: string): Promise<Order> {
        const data = await this.dbclient.delete({
            TableName: this.ordersdb,
            Key: {
                pk: email,
                sk: orderId
            },
            ReturnValues: "ALL_OLD"
        }).promise()

        if (data.Attributes) {
            return data.Attributes as Order
        } else {
            throw new Error("Order not found")
        }
    }
}