import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as sns from "aws-cdk-lib/aws-sns"
import * as subscribe from "aws-cdk-lib/aws-sns-subscriptions"
import * as iam from "aws-cdk-lib/aws-iam"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as event from "aws-cdk-lib/aws-events"
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources"
import * as logs from "aws-cdk-lib/aws-logs"
import * as cloudWatch from "aws-cdk-lib/aws-cloudwatch"
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions"

interface OrdersAppStackProps extends cdk.StackProps {
    //this table was created on the productsApp-stack file
    productsdb: dynamodb.Table,
    eventsdb: dynamodb.Table,
    auditBus: event.EventBus
}

export class OrdersAppStack extends cdk.Stack {
    readonly ordersHandler: lambdaNodeJS.NodejsFunction
    readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction

    constructor (scope: Construct, id: string, props: OrdersAppStackProps) {
        super(scope, id, props)

        const ordersdb = new dynamodb.Table(this, "OrdersDb", {
            tableName: "orders",
            removalPolicy: cdk.RemovalPolicy.DESTROY, //the default is that when the stack is removed, the table is maintained
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

        //This stack will use the order events repository layer
        const orderEventsRepositoryLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsRepositoryLayerVersionArn")
        const orderEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsRepositoryLayerVersionArn", orderEventsRepositoryLayerArn)

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
                ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            },
            layers: [ordersLayer, ordersApiLayer, orderEventsLayer, productsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })

        ordersdb.grantReadWriteData(this.ordersHandler)
        props.productsdb.grantReadData(this.ordersHandler)
        ordersTopic.grantPublish(this.ordersHandler)
        props.auditBus.grantPutEventsTo(this.ordersHandler)

        //cloud watch alarm: metric
        const productNotFoundMetricFilter = this.ordersHandler.logGroup.addMetricFilter("ProductNotFoundMetric", {
            metricName: "OrderWithNonValidProduct",
            metricNamespace: "ProductNotFound",
            filterPattern: logs.FilterPattern.literal("Some product was not found")
        })

        //cloud watch alarm: alarm
        const productNotFoundAlarm = productNotFoundMetricFilter.metric().with({
            statistic: "Sum",
            period: cdk.Duration.minutes(2)
        }).createAlarm(this, "ProductNotFoundAlarm", {
            alarmName: "OrderWithNonValidProduct",
            alarmDescription: "Some product was not found while creating a new order",
            evaluationPeriods: 1,
            threshold: 2,
            actionsEnabled: true,
            comparisonOperator: cloudWatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
        })

        //cloud watch alarm: action
        const orderAlarmsTopic = new sns.Topic(this, "OrderAlarmsTopic", {
            displayName: "Order Alarms Topic",
            topicName: "order-alarms"
        })
        orderAlarmsTopic.addSubscription(new subscribe.EmailSubscription("fran_hahn@hotmail.com"))
        productNotFoundAlarm.addAlarmAction(new cw_actions.SnsAction(orderAlarmsTopic))

        const orderEventsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFunction", {
            functionName: "OrderEventsFunction",
            entry: "lambda/orders/orderEventsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                EVENTS_DB: props.eventsdb.tableName
            },
            layers: [orderEventsLayer, orderEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })
        ordersTopic.addSubscription(new subscribe.LambdaSubscription(orderEventsHandler))

        //The function OrderEventsHandler will have this permission
        const eventsdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsdb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb:LeadingKeys": ["#order_*"]
                }
            }
        })
        orderEventsHandler.addToRolePolicy(eventsdbPolicy)

        const billingHandler = new lambdaNodeJS.NodejsFunction(this, "BillingFunction", {
            functionName: "BillingFunction",
            entry: "lambda/orders/billingFunction.ts",
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
        ordersTopic.addSubscription(new subscribe.LambdaSubscription(billingHandler, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ["ORDER_CREATED"]
                })
            }
        }))

        //Dead letter queue
        const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
            queueName: "order-events-dlq",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            retentionPeriod: cdk.Duration.days(10) //the default is 4 days
        })

        //sqs will receive messages from the sns topic
        const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
            queueName: "order-events",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            deadLetterQueue: {
                maxReceiveCount: 3, //the lambda function will try to treat the message 3 times before sending it to the dlq
                queue: orderEventsDlq
            }
        })
        ordersTopic.addSubscription(new subscribe.SqsSubscription(orderEventsQueue, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ["ORDER_CREATED"]
                })
            }
        }))

        const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEmailsFunction", {
            functionName: "OrderEmailsFunction",
            entry: "lambda/orders/orderEmailsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [orderEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })
        orderEmailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(orderEventsQueue, {
            batchSize: 5,
            enabled: true,
            maxBatchingWindow: cdk.Duration.minutes(1)
        }))
        orderEventsQueue.grantConsumeMessages(orderEmailsHandler)
        const orderEmailSesPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"]
        })
        orderEmailsHandler.addToRolePolicy(orderEmailSesPolicy)

        this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFetchFunction", {
            functionName: "OrderEventsFetchFunction",
            entry: "lambda/orders/orderEventsFetchFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                EVENTS_DB: props.eventsdb.tableName
            },
            layers: [orderEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //it adds another lambda layer
        })

        const eventsFetchDbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:Query"],
            resources: [`${props.eventsdb.tableArn}/index/emailIndex`]
        })
        this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDbPolicy)
    }
}