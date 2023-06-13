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
}