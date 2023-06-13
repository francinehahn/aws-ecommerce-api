import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import * as apiGateway from "aws-cdk-lib/aws-apigateway"
import * as cwLogs from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"

interface EcommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction,
    productsAdminHandler: lambdaNodeJS.NodejsFunction,
    ordersHandler: lambdaNodeJS.NodejsFunction,
    orderEventsFetchHandler: lambdaNodeJS.NodejsFunction
}

export class EcommerceApiStack extends cdk.Stack {
    constructor (scope: Construct, id: string, props: EcommerceApiStackProps) {
        super (scope, id, props)

        const logGroup = new cwLogs.LogGroup(this, "EcommerceApiLogs")

        //API Gateway config
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

        this.createProductsService(props, api)
        this.createOrdersService(props, api)
    }

    private createProductsService(props: EcommerceApiStackProps, api: apiGateway.RestApi) {
        //Integration between the API and the lambda function
        const productsFetchIntegration = new apiGateway.LambdaIntegration(props.productsFetchHandler)

        // GET "/products" endpoint
        const productsRosource = api.root.addResource("products")
        productsRosource.addMethod("GET", productsFetchIntegration)

        // GET "/products/{id}" endpoint
        const productIdResource = productsRosource.addResource("{id}")
        productIdResource.addMethod("GET", productsFetchIntegration)

        //Integration between the API and the lambda function
        const productsAdminIntegration = new apiGateway.LambdaIntegration(props.productsAdminHandler)

        // POST "/products" endpoint
        const productRequestValidator = new apiGateway.RequestValidator(this, "ProductRequestValidator", {
            restApi: api,
            requestValidatorName: "Product request validator",
            validateRequestBody: true
        })

        const productModel = new apiGateway.Model(this, "ProductModel", {
            modelName: "ProductModel",
            restApi: api,
            contentType: "application/json",
            schema: {
                type: apiGateway.JsonSchemaType.OBJECT,
                properties: {
                    productName: {
                        type: apiGateway.JsonSchemaType.STRING,
                    },
                    code: {
                        type: apiGateway.JsonSchemaType.STRING,
                    },
                    price: {
                        type: apiGateway.JsonSchemaType.NUMBER,
                    },
                    model: {
                        type: apiGateway.JsonSchemaType.STRING,
                    },
                    productUrl: {
                        type: apiGateway.JsonSchemaType.STRING
                    }
                },
                required: [
                    "productName",
                    "code",
                    "price",
                    "model",
                    "productUrl"
                ]
            }
        })

        productsRosource.addMethod("POST", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            }
        })

        // PUT "/products/{id}" endpoint
        productIdResource.addMethod("PUT", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            }
        })

        // DELETE "/products/{id}" endpoint
        productIdResource.addMethod("DELETE", productsAdminIntegration)
    }

    private createOrdersService (props: EcommerceApiStackProps, api: apiGateway.RestApi) {
        //Integration between the API and the lambda function
        const ordersIntegration = new apiGateway.LambdaIntegration(props.ordersHandler)
        const ordersResource = api.root.addResource("orders")

        // GET "/orders" endpoint
        // GET "/orders?email=xxxxxxx" endpoint --> These params are not mandatory
        // GET "/orders?email=xxxxxxx&orderId=xxx" endpoint --> These params are not mandatory
        ordersResource.addMethod("GET", ordersIntegration)

        const orderDeletionValidator = new apiGateway.RequestValidator(this, "OrderDeletionValidator", {
            restApi: api,
            requestValidatorName: "OrderDeletionValidator",
            validateRequestParameters: true
        }) 

        // DELETE "/orders?email=xxxxxxx&orderId=xxx" endpoint --> These params are mandatory
        ordersResource.addMethod("DELETE", ordersIntegration, {
            requestParameters: {
                "method.request.querystring.email": true,
                "method.request.querystring.orderId": true
            },
            requestValidator: orderDeletionValidator
        })

        // POST "/orders" endpoint
        const orderRequestValidator = new apiGateway.RequestValidator(this, "OrderRequestValidator", {
            restApi: api,
            requestValidatorName: "Order request validator",
            validateRequestBody: true
        })

        const orderModel = new apiGateway.Model(this, "OrderModel", {
            modelName: "OrderModel",
            restApi: api,
            contentType: "application/json",
            schema: {
                type: apiGateway.JsonSchemaType.OBJECT,
                properties: {
                    email: {
                        type: apiGateway.JsonSchemaType.STRING
                    },
                    productIds: {
                        type: apiGateway.JsonSchemaType.ARRAY,
                        minItems: 1,
                        items: {
                            type: apiGateway.JsonSchemaType.STRING
                        }
                    },
                    payment: {
                        type: apiGateway.JsonSchemaType.STRING,
                        enum: ["CASH", "DEBIT_CARD", "CREDIT_CARD"]
                    }
                },
                required: [
                    "email",
                    "productIds",
                    "payment"
                ]
            }
        })

        ordersResource.addMethod("POST", ordersIntegration, {
            requestValidator: orderRequestValidator,
            requestModels: {
                "application/json": orderModel
            }
        })

        // '/orders/events'
        const orderEventsResource = ordersResource.addResource("events")
        const orderEventsFetchValidator = new apiGateway.RequestValidator(this, "OrderEventsFetchValidator", {
            restApi: api,
            requestValidatorName: "OrderEventsFetchValidator",
            validateRequestParameters: true
        })

        const orderEventsFunctionIntegration = new apiGateway.LambdaIntegration(props.orderEventsFetchHandler)

        // GET /orders/events?email=fran_hahn@hotmail.com
        // GET /orders/events?email=fran_hahn@hotmail.com&eventType=ORDER_CREATED
        orderEventsResource.addMethod("GET", orderEventsFunctionIntegration, {
            requestParameters: {
                "method.request.querystring.email": true, //email is mandatory
                "method.request.querystring.eventType": false, //event type is not mandatory
            },
            requestValidator: orderEventsFetchValidator
        })
    }
}