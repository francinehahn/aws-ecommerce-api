import { Callback, Context } from "aws-lambda";
import { ProductEvent } from "/opt/nodejs/productEventsLayer";
import { DynamoDB } from "aws-sdk";
import * as xray from "aws-xray-sdk"

xray.captureAWS(require("aws-sdk"))
const eventsDb = process.env.EVENTS_DB!
const dbClient = new DynamoDB.DocumentClient()

export async function handler (event: ProductEvent, context: Context, callback: Callback): Promise<void> {
    //TODO - to be removed
    console.log(event)
    console.log(`Lambda requestId: ${context.awsRequestId}`)

    await createEvent(event)

    callback(null, JSON.stringify({
        productEventCreated: true,
        message: "OK"
    }))
}

function createEvent (event: ProductEvent) {
    const timestamp = Date.now()
    const ttl = ~~(timestamp / 1000 + 5 * 60) //5 minutes in the future

    dbClient.put({
        TableName: eventsDb,
        Item: {
            pk: `#product_${event.productCode}`,
            sk: `${event.eventType}#${timestamp}`,
            email: event.email,
            createdAt: timestamp,
            requestId: event.requestId,
            eventType: event.eventType,
            info: {
                productId: event.productId,
                productPrice: event.productPrice
            },
            ttl: ttl
        }
    }).promise()
}