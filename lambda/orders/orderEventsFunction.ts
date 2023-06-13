import { AWSError, DynamoDB } from "aws-sdk"
import * as xray from "aws-xray-sdk"
import { OrderEventDb, OrderEventRepository } from "/opt/nodejs/orderEventsRepositoryLayer"
import { Context, SNSEvent, SNSMessage } from "aws-lambda"
import { Envelope, OrderEvent } from "/opt/nodejs/orderEventsLayer"
import { PromiseResult } from "aws-sdk/lib/request"

xray.captureAWS(require("aws-sdk"))

const eventsdb = process.env.EVENTS_DB!
const dbclient = new DynamoDB.DocumentClient()

const orderEventRepository = new OrderEventRepository(dbclient, eventsdb)

export async function handler (event: SNSEvent, context: Context): Promise<void> {
    const promises: Promise<PromiseResult<DynamoDB.DocumentClient.PutItemOutput, AWSError>>[] = []
    event.Records.forEach(record => {
        promises.push(createEvent(record.Sns))
    })

    await Promise.all(promises)
    return
}

function createEvent (body: SNSMessage) {
    const envelope = JSON.parse(body.Message) as Envelope
    const event = JSON.parse(envelope.data) as OrderEvent

    console.log(`Order event - MessageId: ${body.MessageId}`)

    const timestamp = Date.now()
    const ttl = ~~((timestamp / 1000) + (24 * 7 * 60 * 60)) //7 days

    const orderEventDb: OrderEventDb = {
        pk: `#order_${event.orderId}`,
        sk: `${envelope.eventType}#${timestamp}`,
        ttl: ttl,
        email: event.email,
        createdAt: timestamp,
        requestId: event.requestId,
        eventType: envelope.eventType,
        info: {
            orderId: event.orderId,
            productCodes: event.productCodes,
            messageId: body.MessageId
        }
    }

    return orderEventRepository.createOrderEvent(orderEventDb)
}