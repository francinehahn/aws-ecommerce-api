import {DocumentClient} from "aws-sdk/clients/dynamodb"
import { v4 as uuid } from "uuid"

export interface Product {
    id: string,
    productName: string,
    code: string,
    price: number,
    model: string
}

export class ProductRepository {
    private dbClient: DocumentClient
    private productsdb: string

    constructor(dbClient: DocumentClient, productsdb: string) {
        this.dbClient = dbClient
        this.productsdb = productsdb
    }

    async getAllProducts (): Promise<Product[]> {
        const data = await this.dbClient.scan({
            TableName: this.productsdb
        }).promise()

        return data.Items as Product[]
    }

    async getProductById (productId: string): Promise<Product> {
        const data = await this.dbClient.get({
            TableName: this.productsdb,
            Key: {
                id: productId
            }
        }).promise()

        if (data.Item) {
            return data.Item as Product
        } else {
            throw new Error("Product not found")
            
        }
    }
}