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

    //query search using the global secondary index
    async getOrderEventsByEmail (email: string) {
        const data = await this.dbclient.query({
            TableName: this.eventsdb,
            IndexName: "emailIndex",
            KeyConditionExpression: "email = :email AND begins_with(sk, :prefix)",
            ExpressionAttributeValues: {
                ":email": email,
                ":prefix": "ORDER_"
            }
        }).promise()

        return data.Items as OrderEventDb[]
    }

    async getOrderEventsByEmailAndEventType (email: string, eventType: string) {
        const data = await this.dbclient.query({
            TableName: this.eventsdb,
            IndexName: "emailIndex",
            KeyConditionExpression: "email = :email AND begins_with(sk, :prefix)",
            ExpressionAttributeValues: {
                ":email": email,
                ":prefix": eventType
            }
        }).promise()

        return data.Items as OrderEventDb[]
    }
}