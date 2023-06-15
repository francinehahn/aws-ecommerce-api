import { CognitoIdentityServiceProvider, DynamoDB, EventBridge, SNS } from "aws-sdk"
import { Order, OrderRepository } from "/opt/nodejs/ordersLayer"
import { ProductRepository, Product } from "/opt/nodejs/productsLayer"
import * as xray from "aws-xray-sdk"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { CarrierType, OrderProductResponse, OrderRequest, OrderResponse, PaymentType, ShippingType } from "/opt/nodejs/ordersApiLayer"
import { OrderEvent, OrderEventType, Envelope } from "/opt/nodejs/orderEventsLayer"
import {v4 as uuid} from "uuid"
import { AuthInfoService } from "/opt/nodejs/authUserInfo"

xray.captureAWS(require("aws-sdk"))

const ordersdb = process.env.ORDERS_DB!
const productsdb = process.env.PRODUCTS_DB!
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN
const auditBusName = process.env.AUDIT_BUS_NAME!

const dbclient = new DynamoDB.DocumentClient()
const snsclient = new SNS()
const eventBridgeClient = new EventBridge()
const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider()

const orderRepository = new OrderRepository(dbclient, ordersdb)
const productRepository = new ProductRepository(dbclient, productsdb)

const authInfoService = new AuthInfoService(cognitoIdentityServiceProvider)

export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod
    const apiRequestId = event.requestContext.requestId
    const lambdaRequestId = context.awsRequestId

    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`)

    if (method === "GET") {
        if (event.queryStringParameters) {
            const email = event.queryStringParameters!.email
            const orderId = event.queryStringParameters!.orderId
            
            const isAdmin = authInfoService.isAdminUser(event.requestContext.authorizer)
            const authenticatedUser = await authInfoService.getUserInfo(event.requestContext.authorizer)

            if (isAdmin || email === authenticatedUser) {
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
                return {
                    statusCode: 403,
                    body: "You don't have permission to access this operation"
                }
            }

        } else {
            //GetAllOrders
            if (authInfoService.isAdminUser(event.requestContext.authorizer)) {
                const orders = await orderRepository.getAllOrders()
                return {
                    statusCode: 200,
                    body: JSON.stringify(orders.map(convertToOrderResponse))
                }
            } else {
                return {
                    statusCode: 403,
                    body: "You don't have permission to access this operation"
                }
            }
        }
    } else if (method === "POST") {
        console.log("POST / orders")
        const orderRequest = JSON.parse(event.body!) as OrderRequest
        const products = await productRepository.getProductsByIds(orderRequest.productIds)

        //checking if all the product ids exist
        if (products.length === orderRequest.productIds.length) {
            const order = buildOrder(orderRequest, products)
            
            //I will not use await here because I want the sns topic to start executing in parallel
            const orderCreatedPromise = orderRepository.insertOrder(order)
            
            //sns
            const eventResultPromise = sendOrderEvent(order, OrderEventType.CREATED, lambdaRequestId)
            const results = await Promise.all([orderCreatedPromise, eventResultPromise])

            console.log(`Order created event sent - OrderId: ${order.sk}
            - MessageId: ${results[1].MessageId}`)

            return {
                statusCode: 201,
                body: JSON.stringify(convertToOrderResponse(order))
            }
        } else {
            console.error("Some product was not found")

            const result = await eventBridgeClient.putEvents({
                Entries: [
                    {
                        Source: "app.order",
                        EventBusName: auditBusName,
                        DetailType: "order",
                        Time: new Date(),
                        Detail: JSON.stringify({
                            reason: "PRODUCT_NOT_FOUND",
                            orderRequest: orderRequest
                        })
                    }
                ]
            }).promise()

            console.log(result)

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
        sk: uuid(),
        createdAt: Date.now(),
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
    
    order.products?.forEach(product => {
        orderProducts.push({
            code: product.code,
            price: product.price
        })
    })

    const orderResponse: OrderResponse = {
        email: order.pk,
        id: order.sk!,
        createdAt: order.createdAt!,
        products: orderProducts.length > 0? orderProducts : undefined,
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

    order.products?.forEach(product => {
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
        Message: JSON.stringify(envelope),
        MessageAttributes: {
            eventType: {
                DataType: "String",
                StringValue: eventType // "ORDER_CREATED" or "ORDER_DELETED"
            }
        }
    }).promise()
}