import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"

export class AuditEvetBusStack extends cdk.Stack {
    readonly bus: events.EventBus

    constructor (scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        this.bus = new events.EventBus(this, "AuditEventBus", {
            eventBusName: "AuditEventBus"
        })

        this.bus.archive("BusArchive", {
            eventPattern: {
                source: ["app.order"]
            },
            archiveName: "auditEvents",
            retention: cdk.Duration.days(10)
        })

        //source: app.order
        // detailType: order
        //reason: PRODUCT_NOT_FOUND
        const nonValidOrderRule = new events.Rule(this, "NonValidOrderRule", {
            ruleName: "NonValidOrderRule",
            description: "Rule matching non valid order",
            eventBus: this.bus,
            eventPattern: {
                source: ["app.order"],
                detailType: ["order"],
                detail: {
                    reason: ["PRODUCT_NOT_FOUND"] //I can choose the parameter I want to use
                }
            }
        })

        //target
        const orderErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "OrderErrorsFunction", {
            functionName: "OrderErrorsFunction",
            entry: "lambda/audit/orderErrorsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })
        nonValidOrderRule.addTarget(new targets.LambdaFunction(orderErrorsFunction))

        //source: app.invoice
        // detailType: invoice
        //errorDetail: FAIL_NO_INVOICE_NUMBER
        const nonValidInvoiceRule = new events.Rule(this, "NonValidInvoiceRule", {
            ruleName: "NonValidInvoiceRule",
            description: "Rule matching non valid invoice",
            eventBus: this.bus,
            eventPattern: {
                source: ["app.invoice"],
                detailType: ["invoice"],
                detail: {
                    errorDetail: ["FAIL_NO_INVOICE_NUMBER"] //I can choose the parameter I want to use
                }
            }
        })

        //target
        const invoiceErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "InvoiceErrorsFunction", {
            functionName: "InvoiceErrorsFunction",
            entry: "lambda/audit/invoiceErrorsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })
        nonValidInvoiceRule.addTarget(new targets.LambdaFunction(invoiceErrorsFunction))

        //source: app.invoice
        // detailType: invoice
        //errorDetail: TIMEOUT
        const timeoutImportInvoiceRule = new events.Rule(this, "TimeoutImportInvoiceRule", {
            ruleName: "TimeoutImportInvoiceRule",
            description: "Rule matching timeout import invoice",
            eventBus: this.bus,
            eventPattern: {
                source: ["app.invoice"],
                detailType: ["invoice"],
                detail: {
                    errorDetail: ["TIMEOUT"] //I can choose the parameter I want to use
                }
            }
        })

        //target
        const invoiceImportTimeoutQueue = new sqs.Queue(this, "invoiceImportTimeout", {
            queueName: "invoice-import-timeout"
        })
        timeoutImportInvoiceRule.addTarget(new targets.SqsQueue(invoiceImportTimeoutQueue))
    }
}