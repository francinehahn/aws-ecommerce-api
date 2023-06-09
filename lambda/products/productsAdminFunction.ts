import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer"
import { DynamoDB } from "aws-sdk"
import * as xray from "aws-xray-sdk"

//adding aws x ray
xray.captureAWS(require("aws-sdk"))

/*Must use the same name (PRODUCTS_DB) as specified in the productsFetchHandler object
in the environment key on the productsApp-stack file*/
const productsdb = process.env.PRODUCTS_DB!
const dbclient = new DynamoDB.DocumentClient()
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