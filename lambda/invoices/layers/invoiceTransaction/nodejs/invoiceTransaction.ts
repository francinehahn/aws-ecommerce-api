import { DocumentClient } from "aws-sdk/clients/dynamodb"

export enum InvoiceTransactionStatus {
    GENERATED = "URL_GENERATED",
    RECEIVED = "INVOICE_RECEIVED",
    PROCESSED = "INVOICE_PROCESSED",
    TIMEOUT = "TIMEOUT",
    CANCELED = "INVOICE_CANCELED",
    NON_VALID_INVOICE_NUMBER = "NON_VALID_INVOICE_NUMBER"
}

export interface InvoiceTransaction {
    pk: string,
    sk: string,
    ttl: number,
    requestId: string,
    timestamp: number,
    expiresIn: number,
    connectionId: string,
    endpoint: string,
    transactionStatus: InvoiceTransactionStatus
}

export class InvoiceTransactionRepository {
    private dbClient: DocumentClient
    private invoiceTransactionDb: string

    constructor (dbClient: DocumentClient, invoiceTransactionDb: string) {
        this.dbClient = dbClient
        this.invoiceTransactionDb = invoiceTransactionDb
    }

    async createInvoiceTransaction (invoiceTransaction: InvoiceTransaction): Promise<InvoiceTransaction> {
        await this.dbClient.put({
            TableName: this.invoiceTransactionDb,
            Item: invoiceTransaction
        }).promise()

        return invoiceTransaction
    }

    async getInvoiceTransaction (key: string): Promise<InvoiceTransaction> {
        const data = await this.dbClient.get({
            TableName: this.invoiceTransactionDb,
            Key: {
                pk: "#transaction",
                sk: key
            }
        }).promise()

        if (data.Item) {
            return data.Item as InvoiceTransaction
        } else {
            throw new Error("Invoice transaction not found.")
        }
    }

    async updateInvoiceTransaction (key: string, status: InvoiceTransactionStatus): Promise<boolean> {
        try {
            await this.dbClient.update({
                TableName: this.invoiceTransactionDb,
                Key: {
                    pk: "#transaction",
                    sk: key
                },
                ConditionExpression: "attribute_exists(pk)", //if the attribute pk does not exist, an error will be thrown
                UpdateExpression: "set transactionStatus = :s",
                ExpressionAttributeValues: {
                    ":s": status
                }
            }).promise()

            return true

        } catch (ConditionalCheckFailedException) {
            console.error("Invoice transaction fot found")
            return false
        }
    }
}