import * as xray from "aws-xray-sdk"
import { Context, S3Event, S3EventRecord } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB, EventBridge, S3 } from "aws-sdk"
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from "/opt/nodejs/invoiceTransaction"
import { InvoiceWsService } from "/opt/nodejs/invoiceWSConnection"
import { InvoiceFile, InvoiceRepository } from "/opt/nodejs/invoiceRepository"

xray.captureAWS(require("aws-sdk"))
const invoicesDb = process.env.INVOICE_DB!
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6) // wss://<address WS APi> (we want to remove the first 6 char)
const auditBusName = process.env.AUDIT_BUS_NAME!

const s3Client = new S3()
const dbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
})
const eventBridgeClient = new EventBridge()

const invoiceTransactionRepository = new InvoiceTransactionRepository(dbClient, invoicesDb)
const invoiceWsService = new InvoiceWsService(apigwManagementApi)
const invoiceRepository = new InvoiceRepository(dbClient, invoicesDb)

export async function handler (event: S3Event, context: Context): Promise<void> {
    const promises: Promise<void>[] = [] 
    
    event.Records.forEach(record => {
        promises.push(processRecord(record))
    })

    await Promise.all(promises)
    return
}

async function processRecord (record: S3EventRecord) {
    const key = record.s3.object.key

    try {
        const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(key)

        if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
            await Promise.all([
                invoiceWsService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.RECEIVED),
                invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.RECEIVED)
            ])

        } else {
            await invoiceWsService.sendInvoiceStatus(key, invoiceTransaction.connectionId, invoiceTransaction.transactionStatus)
            console.error("Non valid transaction status")
            return
        }

        const object = await s3Client.getObject({
            Key: key,
            Bucket: record.s3.bucket.name
        }).promise()

        const invoice = JSON.parse(object.Body!.toString("utf-8")) as InvoiceFile
        console.log(invoice)

        if (invoice.invoiceNumber.length >=5) {
            const createInvoicePromise = invoiceRepository.createInvoice({
                pk: `#invoice_${invoice.customerName}`,
                sk: invoice.invoiceNumber,
                ttl: 0, //there is no ttl
                totalValue: invoice.totalValue,
                productId: invoice.productId,
                quantity: invoice.quantity,
                transactionId: key,
                createdAt: Date.now()
            })

            //after everything is done, we can delete the file from the s3 bucket
            const deleteObjectPromise = s3Client.deleteObject({
                Key: key,
                Bucket: record.s3.bucket.name
            }).promise()

            const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.PROCESSED)
            const sendStatusPromise = invoiceWsService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.PROCESSED)
            
            await Promise.all([createInvoicePromise, deleteObjectPromise, updateInvoicePromise, sendStatusPromise])
        
        } else {
            console.error(`Invoice import failed - non valid invoice number - TransactionId: ${key}`)
            
            const putEventPromise = eventBridgeClient.putEvents({
                Entries: [
                    {
                        Source: "app.invoice",
                        EventBusName: auditBusName,
                        DetailType: "invoice",
                        Time: new Date(),
                        Detail: JSON.stringify({
                            errorDetail: "FAIL_NO_INVOICE_NUMBER",
                            info: {
                                invoiceKey: key,
                                customerName: invoice.customerName 
                            }
                        })
                    }
                ]
            }).promise()
            
            const sendStatusPromise = invoiceWsService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER)
            const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER)
            await Promise.all([sendStatusPromise, updateInvoicePromise, putEventPromise])
        }

        await invoiceWsService.disconnectClient(invoiceTransaction.connectionId)

    } catch (error: any) {
        console.log(error.message)
    }
}