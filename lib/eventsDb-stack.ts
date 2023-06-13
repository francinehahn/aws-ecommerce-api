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

        const readScale = this.table.autoScaleReadCapacity({
            maxCapacity: 2,
            minCapacity: 1
        })
        readScale.scaleOnUtilization({
            targetUtilizationPercent: 50, //if the reading capacity reaches 50%, the table will increase 1 read capacity
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        })

        const writeScale = this.table.autoScaleWriteCapacity({
            maxCapacity: 4,
            minCapacity: 1
        })
        writeScale.scaleOnUtilization({
            targetUtilizationPercent: 50, //if the writing capacity reaches 50%, the table will increase 1 write capacity
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        })
    }
}