import { DynamoDB } from "aws-sdk"
import { OrderRepository } from "/opt/nodejs/ordersLayer"
import { ProductRepository } from "/opt/nodejs/productsLayer"
import * as xray from "aws-xray-sdk"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"

xray.captureAWS(require("aws-sdk"))

const ordersdb = process.env.ORDERS_DB!
const productsdb = process.env.PRODUCTS_DB!

const dbclient = new DynamoDB.DocumentClient()

const orderRepository = new OrderRepository(dbclient, ordersdb)
const productRepository = new ProductRepository(dbclient, productsdb)

export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod
    const apiRequestId = event.requestContext.requestId
    const lambdaRequestId = context.awsRequestId

    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`)

    if (method === "GET") {
        if (event.queryStringParameters) {
            const email = event.queryStringParameters!.email
            const orderId = event.queryStringParameters!.orderId
            if (email) {
                if (orderId) {
                    //Get an order from a user
                } else {
                    //Get all the orders from a user
                }
            }
        } else {
            //GetAllOrders
        }
    } else if (method === "POST") {
        console.log("POST / orders")

    } else if (method === "DELETE") {
        console.log("DELETE / orders")

        //this request will come with an email and an id because of the config on the ecommerceApi-stack file
        const email = event.queryStringParameters!.email
        const orderId = event.queryStringParameters!.orderId
    }

    return {
        statusCode: 400,
        body: "Bad request"
    }
}