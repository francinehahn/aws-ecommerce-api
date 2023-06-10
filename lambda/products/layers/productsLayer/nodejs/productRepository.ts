import {DocumentClient} from "aws-sdk/clients/dynamodb"
import { v4 as uuid } from "uuid"

export interface Product {
    id: string,
    productName: string,
    code: string,
    price: number,
    model: string,
    productUrl: string
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

    async insertProduct (product: Product): Promise<Product> {
        product.id = uuid()
        await this.dbClient.put({
            TableName: this.productsdb,
            Item: product
        }).promise()

        return product
    }

    async deleteProduct (productId: string): Promise<Product> {
        const data = await this.dbClient.delete({
            TableName: this.productsdb,
            Key: {
                id: productId
            },
            ReturnValues: "ALL_OLD" //The default is to return nothing
        }).promise()

        //this will give us info on whether the product was deleted or not (if the productId does not exist, it will return an error)
        if (data.Attributes) {
            return data.Attributes as Product
        } else {
            throw new Error("Product not found")
        }
    }

    async updateProduct (productId: string, product: Product): Promise<Product> {
        const data = await this.dbClient.update({
            TableName: this.productsdb,
            Key: {
                id: productId
            },
            ConditionExpression: "attribute_exists(id)", //The product will only be updated if the productId exists
            ReturnValues: "UPDATED_NEW", //it will return the info that was updated
            UpdateExpression: "set productName = :n, code = :c, price = :p, model = :m, productUrl = :u", //the info that will be updated
            ExpressionAttributeValues: {
                ":n": product.productName,
                ":c": product.code,
                ":p": product.price,
                ":m": product.model,
                ":u": product.productUrl
            }
        }).promise()

        data.Attributes!.id = productId
        return data.Attributes as Product
    }

    async getProductsByIds (productIds: string[]): Promise<Product[]> {
        const keys: {id: string}[] = []
        productIds.forEach(productId => {
            keys.push({id: productId})
        })
        
        const data = await this.dbClient.batchGet({
            RequestItems: {
                [this.productsdb]: { //this is the same as writing "products", which is the table name
                    Keys: keys
                }
            }
        }).promise()

        return data.Responses![this.productsdb] as Product[]
    }
}