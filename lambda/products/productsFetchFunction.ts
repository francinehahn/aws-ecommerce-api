import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { ProductRepository } from "/opt/nodejs/productsLayer"
import { DynamoDB } from "aws-sdk"

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
    
    if (event.resource === "/products") {
        console.log("GET")

        const products = await productRepository.getAllProducts()

        return {
            statusCode: 200,
            body: JSON.stringify(products)
        }

    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        console.log(`GET /products/${productId}`)

        try {
            const product = await productRepository.getProductById(productId)

            return {
                statusCode: 200,
                body: JSON.stringify(product)
            }
        } catch(error: any) {
            console.log("Error: ", error.message)

            return {
                statusCode: 400,
                body: error.message
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