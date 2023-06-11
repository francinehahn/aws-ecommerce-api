import { DynamoDB, SNS } from "aws-sdk"
import { Order, OrderRepository } from "/opt/nodejs/ordersLayer"
import { ProductRepository, Product } from "/opt/nodejs/productsLayer"
import * as xray from "aws-xray-sdk"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { CarrierType, OrderProductResponse, OrderRequest, OrderResponse, PaymentType, ShippingType } from "/opt/nodejs/ordersApiLayer"
import { OrderEvent, OrderEventType, Envelope } from "/opt/nodejs/orderEventsLayer"

xray.captureAWS(require("aws-sdk"))

const ordersdb = process.env.ORDERS_DB!
const productsdb = process.env.PRODUCTS_DB!
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN

const dbclient = new DynamoDB.DocumentClient()
const snsclient = new SNS()

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
                    try {
                        const order = await orderRepository.getOrderByEmailAndOrderId(email, orderId)
                        return {
                            statusCode: 200,
                            body: JSON.stringify(convertToOrderResponse(order))
                        }
                    } catch (error: any) {
                        console.log(error.message)
                        return {
                            statusCode: 404,
                            body: error.message
                        }
                    }
                } else {
                    //Get all orders from a user
                    const orders = await orderRepository.getOrdersByEmail(email)
                    return {
                        statusCode: 200,
                        body: JSON.stringify(orders.map(convertToOrderResponse))
                    }
                }
            }
        } else {
            //GetAllOrders
            const orders = await orderRepository.getAllOrders()
            return {
                statusCode: 200,
                body: JSON.stringify(orders.map(convertToOrderResponse))
            }
        }
    } else if (method === "POST") {
        console.log("POST / orders")
        const orderRequest = JSON.parse(event.body!) as OrderRequest
        const products = await productRepository.getProductsByIds(orderRequest.productIds)

        //checking if all the product ids exist
        if (products.length === orderRequest.productIds.length) {
            const order = buildOrder(orderRequest, products)
            const orderCreated = await orderRepository.insertOrder(order)
            
            //sns
            const eventResult = await sendOrderEvent(orderCreated, OrderEventType.CREATED, lambdaRequestId)
            console.log(`Order created event sent - OrderId: ${orderCreated.sk}
            - MessageId: ${eventResult.MessageId}`)

            return {
                statusCode: 201,
                body: JSON.stringify(convertToOrderResponse(orderCreated))
            }
        } else {
            return {
                statusCode: 404,
                body: "Some product was not found"
            }
        }

    } else if (method === "DELETE") {
        console.log("DELETE / orders")

        //this request will come with an email and an id because of the config on the ecommerceApi-stack file
        const email = event.queryStringParameters!.email!
        const orderId = event.queryStringParameters!.orderId!

        try {
            const orderDeleted = await orderRepository.deleteOrder(email, orderId)

            //sns
            const eventResult = await sendOrderEvent(orderDeleted, OrderEventType.DELETED, lambdaRequestId)
            console.log(`Order deleted event sent - OrderId: ${orderDeleted.sk}
            - MessageId: ${eventResult.MessageId}`)

            return {
                statusCode: 200,
                body: JSON.stringify(convertToOrderResponse(orderDeleted))
            }
        } catch (error: any) {
            console.log(error.message)

            return {
                statusCode: 404,
                body: error.message
            }
        }
        
    }

    return {
        statusCode: 400,
        body: "Bad request"
    }
}

function buildOrder (orderRequest: OrderRequest, products: Product[]): Order {
    const orderProducts: OrderProductResponse[] = []
    let totalPrice = 0 
    
    products.forEach(product => {
        totalPrice += product.price
        orderProducts.push({
            code: product.code,
            price: product.price
        })
    })

    const order: Order = {
        pk: orderRequest.email,
        billing: {
            payment: orderRequest.payment,
            totalPrice: totalPrice
        },
        shipping: {
            type: orderRequest.shipping.type,
            carrier: orderRequest.shipping.carrier
        },
        products: orderProducts
    }

    return order
}

function convertToOrderResponse (order: Order): OrderResponse {
    const orderProducts: OrderProductResponse[] = []
    
    order.products.forEach(product => {
        orderProducts.push({
            code: product.code,
            price: product.price
        })
    })

    const orderResponse: OrderResponse = {
        email: order.pk,
        id: order.sk!,
        createdAt: order.createdAt!,
        products: orderProducts,
        billing: {
            payment: order.billing.payment as PaymentType,
            totalPrice: order.billing.totalPrice
        },
        shipping: {
            type: order.shipping.type as ShippingType,
            carrier: order.shipping.carrier as CarrierType
        }
    }

    return orderResponse
}

function sendOrderEvent (order: Order, eventType: OrderEventType, lambdaRequestId: string) {
    const productCodes: string[] = []

    order.products.forEach(product => {
        productCodes.push(product.code)
    })
    
    const orderEvent: OrderEvent = {
        email: order.pk,
        orderId: order.sk!,
        billing: order.billing,
        shipping: order.shipping,
        requestId: lambdaRequestId,
        productCodes: productCodes
    }
    
    const envelope: Envelope = {
        eventType: eventType,
        data: JSON.stringify(orderEvent)
    }
    
    return snsclient.publish({
        TopicArn: orderEventsTopicArn,
        Message: JSON.stringify(envelope)
    }).promise()
}