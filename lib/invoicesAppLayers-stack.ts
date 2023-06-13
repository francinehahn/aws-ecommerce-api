import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as ssm from "aws-cdk-lib/aws-ssm"

export class InvoicesAppLayersStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)
    
        //Invoice transaction layer
        const invoiceTransactionLayer = new lambda.LayerVersion(this, "InvoiceTransactionLayer", {
            code : lambda.Code.fromAsset("lambda/invoices/layers/invoiceTransaction"),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: "InvoiceTransactionLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        }) 

        new ssm.StringParameter(this, "InvoiceTransactionLayerVersionArn", {
            parameterName: "InvoiceTransactionLayerVersionArn",
            stringValue: invoiceTransactionLayer.layerVersionArn
        })

        //Invoice layer
        const invoiceLayer = new lambda.LayerVersion(this, "InvoiceLayer", {
            code : lambda.Code.fromAsset("lambda/invoices/layers/invoiceRepository"),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: "InvoiceRepository",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        }) 

        new ssm.StringParameter(this, "InvoiceRepositoryLayerVersionArn", {
            parameterName: "InvoiceRepositoryLayerVersionArn",
            stringValue: invoiceLayer.layerVersionArn
        })

        //Invoice websocket API layer
        const invoiceWSConnectionLayer = new lambda.LayerVersion(this, "InvoiceWSConnectionLayer", {
            code : lambda.Code.fromAsset("lambda/invoices/layers/invoiceWSConnection"),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: "InvoiceWSConnection",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        }) 

        new ssm.StringParameter(this, "InvoiceWSConnectionLayerVersionArn", {
            parameterName: "InvoiceWSConnectionLayerVersionArn",
            stringValue: invoiceWSConnectionLayer.layerVersionArn
        })
    }
}