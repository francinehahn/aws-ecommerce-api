import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import * as apiGateway from "aws-cdk-lib/aws-apigateway"
import * as cwLogs from "aws-cdk-lib/aws-logs"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { Construct } from "constructs"

interface EcommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction,
    productsAdminHandler: lambdaNodeJS.NodejsFunction,
    ordersHandler: lambdaNodeJS.NodejsFunction,
    orderEventsFetchHandler: lambdaNodeJS.NodejsFunction
}

export class EcommerceApiStack extends cdk.Stack {
    private productsAuthorizer: apiGateway.CognitoUserPoolsAuthorizer
    private productsAdminAuthorizer: apiGateway.CognitoUserPoolsAuthorizer
    private customerPool: cognito.UserPool
    private adminPool: cognito.UserPool

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

        this.createCognitoAuth()
        this.createProductsService(props, api)
        this.createOrdersService(props, api)
    }


    private createCognitoAuth () {
        //This function will be triggered after the user registration
        const postConfirmationHandler = new lambdaNodeJS.NodejsFunction(this, "PostConfirmationFunction", {
            functionName: "PostConfirmationFunction",
            entry: "lambda/auth/postConfirmationFunction.ts",
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

        const preAuthenticationHandler = new lambdaNodeJS.NodejsFunction(this, "PreAuthenticationFunction", {
            functionName: "PreAuthenticationFunction",
            entry: "lambda/auth/preAuthenticationFunction.ts",
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
        
        //cognito customer user pool
        this.customerPool = new cognito.UserPool(this, "CustomerPool", {
            lambdaTriggers: {
                preAuthentication: preAuthenticationHandler,
                postAuthentication: postConfirmationHandler
            },
            userPoolName: "CustomerPool",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true,
            autoVerify: {
                email: true,
                phone: false
            },
            userVerification: {
                emailSubject: "Verify your email for the ecommerce service",
                emailBody: "Thanks for signing up! Your verification code is {####}",
                emailStyle: cognito.VerificationEmailStyle.CODE
            },
            signInAliases: {
                username: false,
                email: true
            },
            standardAttributes: {
                fullname: {
                    required: true,
                    mutable: false
                }
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
                tempPasswordValidity: cdk.Duration.days(3)
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY
        })

        //Cognito admin userPool
        this.adminPool = new cognito.UserPool(this, "AdminPool", {
            userPoolName: "AdminPool",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: false,
            userInvitation: {
                emailSubject: "Welcome to the admin page",
                emailBody: "Your username is {username} and your temporary password is {####}."
            },
            signInAliases: {
                username: false,
                email: true
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: false
                }
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
                tempPasswordValidity: cdk.Duration.days(3)
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY
        })

        this.customerPool.addDomain("CustomerDomain", {
            cognitoDomain: {
                domainPrefix: "fh-customer-service"
            }
        })

        this.adminPool.addDomain("AdminDomain", {
            cognitoDomain: {
                domainPrefix: "fh-admin-service"
            }
        })

        const customerWebScope = new cognito.ResourceServerScope({
            scopeName: "web",
            scopeDescription: "Customer Web Operation"
        })

        const customerMobileScope = new cognito.ResourceServerScope({
            scopeName: "mobile",
            scopeDescription: "Customer Mobile Operation"
        })

        const adminWebScope = new cognito.ResourceServerScope({
            scopeName: "web",
            scopeDescription: "Admin Web Operation"
        })

        const customerResourceServer = this.customerPool.addResourceServer("CustomerResourceServer", {
            identifier: "customer",
            userPoolResourceServerName: "CustomerResourceServer",
            scopes: [customerWebScope, customerMobileScope]
        })

        const adminResourceServer = this.adminPool.addResourceServer("AdminResourceServer", {
            identifier: "admin",
            userPoolResourceServerName: "AdminResourceServer",
            scopes: [adminWebScope]
        })

        this.customerPool.addClient("customer-web-client", {
            userPoolClientName: "customerWebClient",
            authFlows: {
                userPassword: true
            },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                scopes: [cognito.OAuthScope.resourceServer(customerResourceServer, customerWebScope)]
            }
        })

        this.adminPool.addClient("admin-web-client", {
            userPoolClientName: "adminWebClient",
            authFlows: {
                userPassword: true
            },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                scopes: [cognito.OAuthScope.resourceServer(adminResourceServer, adminWebScope)]
            }
        })

        this.customerPool.addClient("customer-mobile-client", {
            userPoolClientName: "customerMobileClient",
            authFlows: {
                userPassword: true
            },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                scopes: [cognito.OAuthScope.resourceServer(customerResourceServer, customerMobileScope)]
            }
        })

        this.productsAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, "ProductsAuthorizer", {
            authorizerName: "ProductsAuthorizer",
            cognitoUserPools: [this.customerPool, this.adminPool]
        })

        this.productsAdminAuthorizer = new apiGateway.CognitoUserPoolsAuthorizer(this, "ProductsAdminAuthorizer", {
            authorizerName: "ProductsAdminAuthorizer",
            cognitoUserPools: [this.adminPool]
        })
    }


    private createProductsService(props: EcommerceApiStackProps, api: apiGateway.RestApi) {
        //Integration between the API and the lambda function
        const productsFetchIntegration = new apiGateway.LambdaIntegration(props.productsFetchHandler)

        const productsFetchWebMobileIntegrationOption = {
            authorizer: this.productsAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ["customer/web", "customer/mobile", "admin/web"]
        }

        // GET "/products" endpoint
        const productsRosource = api.root.addResource("products")
        productsRosource.addMethod("GET", productsFetchIntegration, productsFetchWebMobileIntegrationOption)

        // GET "/products/{id}" endpoint
        const productIdResource = productsRosource.addResource("{id}")
        productIdResource.addMethod("GET", productsFetchIntegration, productsFetchWebMobileIntegrationOption)

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
            },
            authorizer: this.productsAdminAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ["admin/web"]
        })

        // PUT "/products/{id}" endpoint
        productIdResource.addMethod("PUT", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            },
            authorizer: this.productsAdminAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ["admin/web"]
        })

        // DELETE "/products/{id}" endpoint
        productIdResource.addMethod("DELETE", productsAdminIntegration, {
            authorizer: this.productsAdminAuthorizer,
            authorizationType: apiGateway.AuthorizationType.COGNITO,
            authorizationScopes: ["admin/web"]
        })
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