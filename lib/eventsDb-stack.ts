import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"

export class EventsDbStack extends cdk.Stack {
    readonly table: dynamodb.Table

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        this.table = new dynamodb.Table(this, "EventsDb", {
            tableName: "events",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: { //it is part of the primary key (composite primary key)
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: { //it is also part of the primary key (composite primary key)
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            timeToLiveAttribute: "ttl", //it's the attribute name in our table that represents the time the information must be kept in our db
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        })
    }
}