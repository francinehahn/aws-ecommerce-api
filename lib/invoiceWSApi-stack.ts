import * as cdk from "aws-cdk-lib"
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha"
import * as apigatewayv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3n from "aws-cdk-lib/aws-s3-notifications"
import { Construct } from "constructs"

export class InvoiceWSApiStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        //Invoice and invoice transaction DB
        const invoicesDb = new dynamodb.Table(this, "InvoicesDb", {
            tableName: "invoices",
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING,
            },
            timeToLiveAttribute: "ttl",
            removalPolicy: cdk.RemovalPolicy.DESTROY //the ideal is always to retain the table
        })

        //Invoice bucket
        const bucket = new s3.Bucket(this, "InvoiceBucket", {
            removalPolicy: cdk.RemovalPolicy.DESTROY, //the ideal is always to retain the bucket
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    enabled: true,
                    expiration: cdk.Duration.days(7) //after 7 days, if the file is not treated by the lambda function, it will be deleted
                }
            ]
        })

        //WebSocket connection handler
        const connectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceConnectionFunction", {
            functionName: "InvoiceConnectionFunction",
            entry: "lambda/invoices/invoiceConnectionFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
        })

        //WebSocket disconnection handler
        const disconnectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceDisconnectionFunction", {
            functionName: "InvoiceDisconnectionFunction",
            entry: "lambda/invoices/invoiceDisconnectionFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
        })

        //WebSocket API
        const webSocketApi = new apigatewayv2.WebSocketApi(this, "InvoiceWSApi", {
            apiName: "InvoiceWSApi",
            connectRouteOptions: {
                integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("ConnectionHandler", connectionHandler)
            },
            disconnectRouteOptions: {
                integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("DisconnectionHandler", disconnectionHandler)
            }
        })

        const stage = "prod"
        const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`
        new apigatewayv2.WebSocketStage(this, "InvoiceWSApiStage", {
            webSocketApi: webSocketApi,
            stageName: stage,
            autoDeploy: true
        })

        //Invoice URL handler
        const getUrlHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceGetUrlFunction", {
            functionName: "InvoiceGetUrlFunction",
            entry: "lambda/invoices/invoiceGetUrlFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DB: invoicesDb.tableName,
                BUCKET_NAME: bucket.bucketName, //cdk created a name for us
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        })

        const invoicesDbWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [invoicesDb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb:LeadingKeys": ["#transaction"]
                }
            }
        })
        getUrlHandler.addToRolePolicy(invoicesDbWriteTransactionPolicy)

        //Invoice import handler

        //Cancel import handler

        //WebSocket API  routes
    }
}
