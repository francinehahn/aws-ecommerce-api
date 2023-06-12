import { DocumentClient } from "aws-sdk/clients/dynamodb"

export interface OrderEventDb {
    pk: string,
    sk: string,
    ttl: number,
    email: string,
    createdAt: number,
    requestId: string,
    eventType: string,
    info: {
        orderId: string,
        productCodes: string[],
        messageId: string
    }
}

export class OrderEventRepository {
    private dbclient: DocumentClient
    private eventsdb: string

    constructor (dbclient: DocumentClient, eventsdb: string) {
        this.dbclient = dbclient
        this.eventsdb = eventsdb
    }

    createOrderEvent (orderEvent: OrderEventDb) {
        return this.dbclient.put({
            TableName: this.eventsdb,
            Item: orderEvent
        }).promise()
    }
}