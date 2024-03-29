import * as cdk from "aws-cdk-lib"
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha"
import * as apigatewayv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3n from "aws-cdk-lib/aws-s3-notifications"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources"
import * as event from "aws-cdk-lib/aws-events"
import { Construct } from "constructs"

interface InvoiceWSApiStackProps extends cdk.StackProps {
    eventsDb: dynamodb.Table,
    auditBus: event.EventBus
}

export class InvoiceWSApiStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props: InvoiceWSApiStackProps) {
        super(scope, id, props)

        //This stack will use the invoice transaction layer
        const invoiceTransactionLayerArn = ssm.StringParameter.valueForStringParameter(this, "InvoiceTransactionLayerVersionArn")
        const invoiceTransactionLayer = lambda.LayerVersion.fromLayerVersionArn(this, "InvoiceTransactionLayer", invoiceTransactionLayerArn)

        //This stack will use the invoice layer
        const invoiceLayerArn = ssm.StringParameter.valueForStringParameter(this, "InvoiceRepositoryLayerVersionArn")
        const invoiceLayer = lambda.LayerVersion.fromLayerVersionArn(this, "InvoiceRepositoryLayer", invoiceLayerArn)

        //This stack will use the invoice websocket API layer
        const invoiceWSConnectionLayerArn = ssm.StringParameter.valueForStringParameter(this, "InvoiceWSConnectionLayerVersionArn")
        const invoiceWSConnectionLayer = lambda.LayerVersion.fromLayerVersionArn(this, "InvoiceWSConnectionLayer", invoiceWSConnectionLayerArn)

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
            removalPolicy: cdk.RemovalPolicy.DESTROY, //the ideal is always to retain the table
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES //the table will invoke a lambda function
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
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
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

        const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:PutObject"],
            resources: [`${bucket.bucketArn}/*`] // "/*" means to have access to the entire bucket
        })

        getUrlHandler.addToRolePolicy(invoicesDbWriteTransactionPolicy)
        getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy)
        webSocketApi.grantManageConnections(getUrlHandler)

        //Invoice import handler
        const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceImportFunction", {
            functionName: "InvoiceImportFunction",
            entry: "lambda/invoices/invoiceImportFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [invoiceLayer, invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DB: invoicesDb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            }
        })
        invoicesDb.grantReadWriteData(invoiceImportHandler)
        props.auditBus.grantPutEventsTo(invoiceImportHandler)

        bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3n.LambdaDestination(invoiceImportHandler))

        const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:DeleteObject", "s3:GetObject"],
            resources: [`${bucket.bucketArn}/*`]
        })
        invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy)
        webSocketApi.grantManageConnections(invoiceImportHandler)

        //Cancel import handler
        const cancelImportHandler = new lambdaNodeJS.NodejsFunction(this, "CancelImportFunction", {
            functionName: "CancelImportFunction",
            entry: "lambda/invoices/cancelImportFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DB: invoicesDb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        })

        const invoicesDbReadWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:UpdateItem", "dynamodb:GetItem"],
            resources: [invoicesDb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb:LeadingKeys": ["#transaction"]
                }
            }
        })
        cancelImportHandler.addToRolePolicy(invoicesDbReadWriteTransactionPolicy)
        webSocketApi.grantManageConnections(cancelImportHandler)

        //WebSocket API routes
        webSocketApi.addRoute("getImportUrl", {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("GetUrlHandler", getUrlHandler)
        })

        webSocketApi.addRoute("cancelImport", {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("CancelImportHandler", cancelImportHandler)
        })

        // Invoice Events Handler
        const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceEventsFunction", {
            functionName: "InvoiceEventsFunction",
            entry: "lambda/invoices/invoiceEventsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                EVENTS_DB: props.eventsDb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            }
        })
        webSocketApi.grantManageConnections(invoiceEventsHandler)
        props.auditBus.grantPutEventsTo(invoiceEventsHandler)

        //The function InvoiceEventsHandler will have this permission
        const eventsdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb:LeadingKeys": ["#invoice_*"]
                }
            }
        })
        invoiceEventsHandler.addToRolePolicy(eventsdbPolicy)

        const invoiceEventsDlq = new sqs.Queue(this, "InvoiceEventsDlq", {
            queueName: "InvoiceEventsDlq"
        })

        invoiceEventsHandler.addEventSource(new lambdaEventSource.DynamoEventSource(invoicesDb, {
            startingPosition: lambda.StartingPosition.TRIM_HORIZON,
            batchSize: 5,
            bisectBatchOnError: true,
            onFailure: new lambdaEventSource.SqsDlq(invoiceEventsDlq),
            retryAttempts: 3
        }))
    }
}
