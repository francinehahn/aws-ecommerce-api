import { DocumentClient } from "aws-sdk/clients/dynamodb"

export interface InvoiceFile {
    customerName: string,
    invoiceNumber: string,
    totalValue: number,
    productId: string,
    quantity: number
}

export interface Invoice {
    pk: string,
    sk: string,
    totalValue: number,
    productId: string,
    quantity: number,
    transactionId: string,
    ttl: number,
    createdAt: number
}

export class InvoiceRepository {
    private dbClient: DocumentClient
    private invoicesDb: string

    constructor (dbClient: DocumentClient, invoicesDb: string) {
        this.dbClient = dbClient
        this.invoicesDb = invoicesDb
    }

    async createInvoice (invoice: Invoice): Promise<Invoice> {
        await this.dbClient.put({
            TableName: this.invoicesDb,
            Item: invoice  
        }).promise()

        return invoice
    }
}