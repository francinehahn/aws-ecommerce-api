import * as xray from "aws-xray-sdk"
import { APIGatewayProxyEvent, Context } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk"
import {v4 as uuid} from "uuid"
import { InvoiceTransactionStatus, InvoiceTransactionRepository } from "/opt/nodejs/invoiceTransaction"
import { InvoiceWsService } from "/opt/nodejs/invoiceWSConnection"

xray.captureAWS(require("aws-sdk"))
const invoicesDb = process.env.INVOICE_DB!
const bucketName = process.env.BUCKET_NAME!
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6) // wss://<address WS APi> (we want to remove the first 6 char)

const s3Client = new S3()
const dbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
})

const invoiceTransactionRepository = new InvoiceTransactionRepository(dbClient, invoicesDb)
const invoiceWsService = new InvoiceWsService(apigwManagementApi)

// This function will be invoked by the webSocket API
export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<void> {
    // TO -To be removed
    console.log(event)

    const lambdaRequestId = context.awsRequestId
    const connectionId = event.requestContext.connectionId! //it identifies the client and it's how we will communicate with them

    console.log(`Connection id: ${connectionId} - Lambda request id: ${lambdaRequestId}`)

    const key = uuid()
    const expires = 300 //5 minutes

    //s3 bucket will generate a url
    const url = await s3Client.getSignedUrlPromise("putObject", {
        Bucket: bucketName,
        Key: key,
        Expires:  expires
    })

    //Invoice transaction
    const timestamp = Date.now()
    const ttl = ~~((timestamp / 1000) + (60 * 2)) //2 minutes
    await invoiceTransactionRepository.createInvoiceTransaction({
        pk: "#transaction",
        sk: key,
        ttl: ttl,
        requestId: lambdaRequestId,
        transactionStatus: InvoiceTransactionStatus.GENERATED,
        timestamp: timestamp,
        expiresIn: expires,
        connectionId: connectionId,
        endpoint: invoicesWsApiEndpoint
    })

    //Send url to the client that is connected to the WS API
    const postData = JSON.stringify({
        url: url,
        expires: expires,
        transactionId: key
    })
    await invoiceWsService.sendData(connectionId, postData)

    return
}