import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as iam from "aws-cdk-lib/aws-iam"
import * as sqs from "aws-cdk-lib/aws-sqs"

interface ProductsAppStackProps extends cdk.StackProps {
    eventsDb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
    readonly producstFetchHandler: lambdaNodeJS.NodejsFunction
    readonly producstAdminHandler: lambdaNodeJS.NodejsFunction
    readonly productsdb: dynamodb.Table

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
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

        //Products layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

        //Product Events layer
        const productEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductEventsLayerVersionArn")
        const productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductEventsLayerVersionArn", productEventsLayerArn)

        //Auth user info layer
        const authUserInfoLayerArn = ssm.StringParameter.valueForStringParameter(this, "AuthUserInfoLayerVersionArn")
        const authUserInfoLayer = lambda.LayerVersion.fromLayerVersionArn(this, "AuthUserInfoLayerVersionArn", authUserInfoLayerArn)

        //SQS dead letter queue
        const dlq = new sqs.Queue(this, "ProductEventsDlq", {
            queueName: "product-events-dlq",
            retentionPeriod: cdk.Duration.days(10)
        })

        //lambda function config (this function will be invoked bu the productsAdminHandler)
        const productsEventsHandler = new lambdaNodeJS.NodejsFunction(this, "ProductEventsFunction", {
            functionName: "ProductEventsFunction",
            entry: "lambda/products/productEventsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                EVENTS_DB: props.eventsDb.tableName
            },
            layers: [productEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlq,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })

        //The function ProductsEventsHandler will have this permission
        const eventsdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb:LeadingKeys": ["#product_*"]
                }
            }
        })
        productsEventsHandler.addToRolePolicy(eventsdbPolicy)

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
            },
            layers: [productsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
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
                PRODUCTS_DB: this.productsdb.tableName,
                PRODUCT_EVENTS_FUNCTION_NAME: productsEventsHandler.functionName //this function will be invoked by the productsAdminHandler function
            },
            layers: [productsLayer, productEventsLayer, authUserInfoLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })

        //this will grant access to the productsAdminHandler function to access the db to write data
        this.productsdb.grantWriteData(this.producstAdminHandler)
        
        //this will grant access to the productsAdminHandler function to invoke the productsEventsHandler function
        productsEventsHandler.grantInvoke(this.producstAdminHandler)
    }
}