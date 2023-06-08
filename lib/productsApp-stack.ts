import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"

export class ProductsAppStack extends cdk.Stack {
    readonly producstFetchHandler: lambdaNodeJS.NodejsFunction
    readonly producstAdminHandler: lambdaNodeJS.NodejsFunction
    readonly productsdb: dynamodb.Table

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        //database config
        this.productsdb = new dynamodb.Table(this, "Productsdb", {
            tableName: "products",
            removalPolicy: cdk.RemovalPolicy.DESTROY, //the default is that when the stack is removed, the table is maintained
            partitionKey: {
                name: "id",
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1, //the default is 5
            writeCapacity: 1 //the default is 5
        })

        //lambda function config
        this.producstFetchHandler = new lambdaNodeJS.NodejsFunction(this, "ProductsFetchFunction", {
            functionName: "ProductsFetchFunction",
            entry: "lambda/products/productsFetchFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                PRODUCTS_DB: this.productsdb.tableName
            }
        })

        //this will grant access to the products fetch function to access the db to read data
        this.productsdb.grantReadData(this.producstFetchHandler)

        //lambda function config
        this.producstAdminHandler = new lambdaNodeJS.NodejsFunction(this, "ProductsAdminFunction", {
            functionName: "ProductsAdminFunction",
            entry: "lambda/products/productsAdminFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                PRODUCTS_DB: this.productsdb.tableName
            }
        })

        //this will grant access to the products admin function to access the db to write data
        this.productsdb.grantWriteData(this.producstAdminHandler)
    }
}