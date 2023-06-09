import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as ssm from "aws-cdk-lib/aws-ssm"

export class ProductsAppLayersStack extends cdk.Stack {
    readonly productsLayers: lambda.LayerVersion

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super (scope, id, props)

        this.productsLayers = new lambda.LayerVersion(this, "ProductsLayer", {
            code: lambda.Code.fromAsset("lambda/products/layers/productsLayer"),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: "ProductsLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN //the default pattern would be to destroy
        })

        //Systems Manager: Parameter Store (it stores information so that other functions can use the layers) 
        new ssm.StringParameter(this, "ProductsLayerVersionArn", {
            parameterName: "ProductsLayerVersionArn",
            stringValue: this.productsLayers.layerVersionArn
        })
    }
}