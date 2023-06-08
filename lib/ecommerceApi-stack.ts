import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import * as apiGateway from "aws-cdk-lib/aws-apigateway"
import * as cwLogs from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"

interface EcommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction
}

export class EcommerceApiStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props: EcommerceApiStackProps) {
        super (scope, id, props)

        const logGroup = new cwLogs.LogGroup(this, "EcommerceApiLogs")

        //Integration between the API and the lambda function
        const api = new apiGateway.RestApi(this, "EcommerceApi", {
            restApiName: "EcommerceApi",
            cloudWatchRole: true,
            deployOptions: {
                accessLogDestination: new apiGateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apiGateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true
                })
            }
        })

        const productsFetchIntegration = new apiGateway.LambdaIntegration(props.productsFetchHandler)
        
        // "/products"
        const productsRosource = api.root.addResource("products")
        productsRosource.addMethod("GET", productsFetchIntegration)
    }
}