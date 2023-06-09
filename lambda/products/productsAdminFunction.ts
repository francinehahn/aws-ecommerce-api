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
        console.log("POST")

        return {
            statusCode: 201,
            body: JSON.stringify({
                message: "POST products OK"
            })
        }
    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        
        if (method === "PUT") {
            console.log(`PUT /products/${productId}`)

            return {
                statusCode: 201,
                body: JSON.stringify({
                    message: `PUT product id ${productId} OK`
                })
            }
        } else if (method === "DELETE") {
            console.log(`DELETE /products/${productId}`)

            return {
                statusCode: 201,
                body: JSON.stringify({
                    message: `DELETE product id ${productId} OK`
                })
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