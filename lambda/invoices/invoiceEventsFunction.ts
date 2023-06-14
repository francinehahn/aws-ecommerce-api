import * as xray from "aws-xray-sdk"
import { AttributeValue, Context, DynamoDBStreamEvent } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB } from "aws-sdk"
import { InvoiceWsService } from "/opt/nodejs/invoiceWSConnection"

xray.captureAWS(require("aws-sdk"))

const eventsDb = process.env.EVENTS_DB!
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6) // wss://<address WS APi> (we want to remove the first 6 char)

const dbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
})

const invoiceWsService = new InvoiceWsService(apigwManagementApi)

// This function will be invoked by the Invoices table in dynamodb
export async function handler (event: DynamoDBStreamEvent, context: Context): Promise<void> {
    const promises: Promise<void>[] = [] 
    
    event.Records.forEach(record => {
        if (record.eventName === "INSERT") {
            if (record.dynamodb!.NewImage!.pk.S!.startsWith("#transaction")) {
                console.log("Invoice transaction event received")
            } else {
                console.log("Invoice event received")
                promises.push(createEvent(record.dynamodb!.NewImage!, "INVOICE_CREATED"))
            }
            
        } else if (record.eventName === "REMOVE") {
            if (record.dynamodb!.OldImage!.pk.S! === "#transaction") {
                console.log("Invoice transaction event received")

                promises.push(processExpiredTransaction(record.dynamodb!.OldImage!))
            }
        }
    })

    await Promise.all(promises)
    return
}

async function processExpiredTransaction (invoiceTransactionImage: {[key: string]: AttributeValue}) {
    const transactionId = invoiceTransactionImage.sk.S!
    const connectionId = invoiceTransactionImage.connectionId.S!

    if (invoiceTransactionImage.transactionStatus.S === "INVOICE_PROCESSED") {
        console.log("Invoice processed")
    } else {
        console.log(`Invoice import failed - Status: ${invoiceTransactionImage.transactionStatus.S}`)
        await invoiceWsService.sendInvoiceStatus(transactionId, connectionId, "TIMEOUT")
        await invoiceWsService.disconnectClient(connectionId)
    }
}

async function createEvent (invoiceImage: {[key: string]: AttributeValue}, eventType: string) {
    const timestamp = Date.now()
    const ttl = ~~(timestamp / 1000 + 60 * 60) //1 hour

    await dbClient.put({
        TableName: eventsDb,
        Item: {
            pk: `#invoice_${invoiceImage.sk.S}`,
            sk: `${eventType}#${timestamp}`,
            ttl: ttl,
            email: invoiceImage.pk.S!.split("_")[1],
            createdAt: timestamp,
            eventType: eventType,
            info: {
                transaction: invoiceImage.transactionId.S,
                productId: invoiceImage.productId.S,
                quantity: invoiceImage.quantity.N
            }
        }
    }).promise()

    return
}