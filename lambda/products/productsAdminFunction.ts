import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { Product, ProductRepository } from "/opt/nodejs/productsLayer"
import { DynamoDB, Lambda } from "aws-sdk"
import * as xray from "aws-xray-sdk"
import { ProductEvent, ProductEventType } from "/opt/nodejs/productEventsLayer"

//adding aws x ray
xray.captureAWS(require("aws-sdk"))

/*Must use the same name (PRODUCTS_DB) as specified in the productsFetchHandler object
in the environment key on the productsApp-stack file*/
const productsdb = process.env.PRODUCTS_DB!
const productsEventFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!
const dbclient = new DynamoDB.DocumentClient()
const lambdaClient = new Lambda()
const productRepository = new ProductRepository(dbclient, productsdb) 


export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    //number that identifies the execution of the lambda function
    const lambdaRequestId = context.awsRequestId

    //number that identifies the request that came in through API Gateway
    const apiRequestId = event.requestContext.requestId
    
    console.log("apiRequestId", apiRequestId)
    console.log("lambdaRequestId", lambdaRequestId)

    const method = event.httpMethod
    
    if (event.resource === "/products") {
        console.log("POST")

        const product = JSON.parse(event.body!) as Product
        const productInserted = await productRepository.insertProduct(product)
        const response = await sendProductEvent(productInserted, ProductEventType.CREATED, "email.teste@gmail.com", lambdaRequestId)
        console.log(response)

        return {
            statusCode: 201,
            body: JSON.stringify(productInserted)
        }

    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        
        if (method === "PUT") {
            console.log(`PUT /products/${productId}`)

            try {
                const product = JSON.parse(event.body!) as Product
                const productUpdated = await productRepository.updateProduct(productId, product)
                const response = await sendProductEvent(productUpdated, ProductEventType.UPDATED, "email2.teste@gmail.com", lambdaRequestId)
                console.log(response)

                return {
                    statusCode: 201,
                    body: JSON.stringify(productUpdated)
                }
            } catch (ConditionalCheckFailedException) {
                return {
                    statusCode: 404,
                    body: "Product not found"
                }
            }
        } else if (method === "DELETE") {
            console.log(`DELETE /products/${productId}`)

            try {
                const deleteProduct = await productRepository.deleteProduct(productId)            

                const response = await sendProductEvent(deleteProduct, ProductEventType.DELETED, "email3.teste@gmail.com", lambdaRequestId)
                console.log(response)

                return {
                    statusCode: 200,
                    body: JSON.stringify(deleteProduct)
                }
            } catch (error: any) {
                console.log("Error: ", error.message)

                return {
                    statusCode: 400,
                    body: error.message
                }
            }
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify({
            message: "Bad request"
        })
    }
}

function sendProductEvent (product: Product, eventType: ProductEventType, email: string, lambdaRequestId: string) {
    const event: ProductEvent = {
        email: email,
        eventType: eventType,
        productCode: product.code,
        productId: product.id,
        productPrice: product.price,
        requestId: lambdaRequestId
    }

    return lambdaClient.invoke({
        FunctionName: productsEventFunctionName,
        Payload: JSON.stringify(event),
        InvocationType: "RequestResponse" //syncronous invocation
    }).promise()
}