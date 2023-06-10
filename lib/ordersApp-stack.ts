import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"

interface OrdersAppStackProps extends cdk.StackProps {
    //this table was created on the productsApp-stack file
    productsdb: dynamodb.Table
}

export class OrdersAppStack extends cdk.Stack {
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
    }
}