import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as sns from "aws-cdk-lib/aws-sns"
import * as subscribe from "aws-cdk-lib/aws-sns-subscriptions"

interface OrdersAppStackProps extends cdk.StackProps {
    //this table was created on the productsApp-stack file
    productsdb: dynamodb.Table
}

export class OrdersAppStack extends cdk.Stack {
    readonly ordersHandler: lambdaNodeJS.NodejsFunction

    constructor (scope: Construct, id: string, props: OrdersAppStackProps) {
        super(scope, id, props)

        const ordersdb = new dynamodb.Table(this, "OrdersDb", {
            tableName: "orders",
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        })

        //This stack will use the orders layer
        const ordersLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersLayerVersionArn")
        const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersLayerVersionArn", ordersLayerArn)

        //This stack will use the ordersApi layer
        const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersApiLayerVersionArn")
        const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersApiLayerVersionArn", ordersApiLayerArn)

        //This stack will use the products layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

        //This stack will use the order events layer
        const orderEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsLayerVersionArn")
        const orderEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsLayerVersionArn", orderEventsLayerArn)

        //sns topic
        const ordersTopic = new sns.Topic(this, "OrderEventsTopic", {
            displayName: "Order events topic",
            topicName: "order-events"
        })

        this.ordersHandler = new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
            functionName: "OrdersFunction",
            entry: "lambda/orders/ordersFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                PRODUCTS_DB: props.productsdb.tableName,
                ORDERS_DB: ordersdb.tableName,
                ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn
            },
            layers: [ordersLayer, ordersApiLayer, orderEventsLayer, productsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })

        ordersdb.grantReadWriteData(this.ordersHandler)
        props.productsdb.grantReadData(this.ordersHandler)
        ordersTopic.grantPublish(this.ordersHandler)
    }
}