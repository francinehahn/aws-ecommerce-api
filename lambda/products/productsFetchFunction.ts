import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    //number that identifies the execution of the lambda function
    const lambdaRequestId = context.awsRequestId

    //number that identifies the request that came in through API Gateway
    const apiRequestId = event.requestContext.requestId
    
    console.log("apiRequestId", apiRequestId)
    console.log("lambdaRequestId", lambdaRequestId)

    const method = event.httpMethod
    
    if (event.resource === "/products") {
        if (method === "GET") {
            console.log("GET")

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "GET products OK"
                })
            }
        }
    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        console.log(`GET /products/${productId}`)

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `GET product id ${productId} OK`
            })
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify({
            message: "Bad request"
        })
    }
}