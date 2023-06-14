import * as xray from "aws-xray-sdk"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk"
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from "/opt/nodejs/invoiceTransaction"
import { InvoiceWsService } from "/opt/nodejs/invoiceWSConnection"

xray.captureAWS(require("aws-sdk"))
const invoicesDb = process.env.INVOICE_DB!
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6) // wss://<address WS APi> (we want to remove the first 6 char)

const dbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
})

const invoiceTransactionRepository = new InvoiceTransactionRepository(dbClient, invoicesDb)
const invoiceWsService = new InvoiceWsService(apigwManagementApi)


export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const transactionId = JSON.parse(event.body!).transactionId as string
    const lambdaRequestId = context.awsRequestId
    const connectionId = event.requestContext.connectionId!
    
    console.log(`Connection id: ${connectionId} - Lambda request id: ${lambdaRequestId}`)

    try {
        const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(transactionId)
        if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
            await Promise.all([
                invoiceWsService.sendInvoiceStatus(transactionId, connectionId, InvoiceTransactionStatus.CANCELED),
                invoiceTransactionRepository.updateInvoiceTransaction(transactionId, InvoiceTransactionStatus.CANCELED)
            ])

        } else {
            await invoiceWsService.sendInvoiceStatus(transactionId, connectionId, invoiceTransaction.transactionStatus)
            console.error(`Can't cancel an ongoing process`)
        }

    } catch (error: any) {
        console.error(error.message)
        console.error(`Invoice transaction not found - Transaction id: ${transactionId}`)
        await invoiceWsService.sendInvoiceStatus(transactionId, connectionId, InvoiceTransactionStatus.NOT_FOUND)
    }

    await invoiceWsService.disconnectClient(connectionId)

    return {
        statusCode: 200,
        body: "OK"
    }
}