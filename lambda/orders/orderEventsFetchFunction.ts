import { DynamoDB } from "aws-sdk"
import * as xray from "aws-xray-sdk"
import { OrderEventDb, OrderEventRepository } from "/opt/nodejs/orderEventsRepositoryLayer"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"

xray.captureAWS(require("aws-sdk"))

const eventsdb = process.env.EVENTS_DB!
const dbclient = new DynamoDB.DocumentClient()

const orderEventRepository = new OrderEventRepository(dbclient, eventsdb)

export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const email = event.queryStringParameters!.email!
    const eventType = event.queryStringParameters!.eventType

    if (eventType) {
        const orderEvents = await orderEventRepository.getOrderEventsByEmailAndEventType(email, eventType)

        return {
            statusCode: 200,
            body: JSON.stringify(convertOrderEvents(orderEvents))
        }
    } else {
        const orderEvents = await orderEventRepository.getOrderEventsByEmail(email)

        return {
            statusCode: 200,
            body: JSON.stringify(convertOrderEvents(orderEvents))
        }
    }
}   

function convertOrderEvents (orderEvents: OrderEventDb[]) {
    return orderEvents.map(orderEvent => {
        return {
            email: orderEvent.email,
            createdAt: orderEvent.createdAt,
            eventType: orderEvent.eventType,
            requestId: orderEvent.requestId,
            orderId: orderEvent.info.orderId,
            productCodes: orderEvent.info.productCodes
        }
    })
}