<h1 align="center">E-commerce API REST: AWS CDK TypeScript project</h1>

## ℹ️About
This project is an API REST that simulates the back-end of an ecommerce.

## 📷 Architecture of the project:
![api-architecture](./api-architecture.png)
<br>

## 🔗Documentation API REST:
https://documenter.getpostman.com/view/26335922/2s93sc3rmW

## 🌐 Deploy API REST
https://lgsqgv19ml.execute-api.us-east-1.amazonaws.com/prod/

## 🌐 Deploy WEBSOCKET API
wss://thw4rndw60.execute-api.us-east-1.amazonaws.com/prod

## 🔗Documentation WEBSOCKET API:
WebSocket API has 2 endpoints:
- Get Url Invoice
- Cancel Import Invoice File

To test these endpoints, you need to use the WEBSOCKET API url (provided above) on Postman (use WebSocket request).
To test the 'Get Url Invoice' endpoint: 

<pre>
  <code>Click on 'connect'</code>
</pre>

Write the following JSON message on the specified field:
<pre>
  <code>
  {
    "action": "getImportUrl"
  }
  </code>
</pre>
<pre>
  <code>Click on 'send'</code>
</pre>

You will receive a url that you can use on the 'Import Invoice File' endpoint.

To test the 'Cancel Import Invoice File' endpoint:
<pre>
  <code>Click on 'connect'</code>
</pre>

Write the following JSON message on the specified field:
<pre>
  <code>
  {
    "action": "putImport"
  }
  </code>
</pre>

<pre>
  <code>Click on 'send'</code>
</pre>

## ☑️Requests created:
- `Products:`
- Get All Products
- Get Product By Id
- Create Product
- Update Product
- Delete Product
- `Orders:`
- Get All Orders
- Get All Orders From A Client
- Get An Order From A Client
- Create An Order
- Delete An Order
- `Events:`
- Get Events By Email
- Get Events By Email And Event Type
- Create An Event
- `Invoices:`
- Get Url (this url will be used to import the invoice file)
- Import Invoice File
- Cancel Import Invoice


## 💻 Technologies:
- Typescript
- Node.js
- AWS Lambda
- AWS API Gateway (REST)
- WebSocket API do API Gateway
- AWS Simple Notification Service (SNS)
- AWS Simple Queue Service (SQS)
- AWS Simple Email Service (SES)
- AWS Event Bridge
- AWS Cloud Watch
- AWS X-Ray
- AWS Simple Storage Service (S3)
- DynamoDB (noSQL database)
- AWS Cloud Development Kit (CDK)

## 🛰 Running the project:
<pre>
  <code>Install node js</code>
</pre>

<pre>
  <code>Install aws cli</code>
</pre>

<pre>
  <code>Install aws cdk</code>
</pre>

<pre>
  <code>Install Docker Desktop</code>
</pre>

<pre>
  <code>git clone https://github.com/francinehahn/aws-ecommerce-api.git</code>
</pre>

<pre>
  <code>cd aws-ecommerce-api</code>
</pre>

<pre>
  <code>npm install</code>
</pre>

Create a file .env and complete the following variable:
<pre>
  <code>account = ""</code>
</pre>

On a terminal, you will need to set the environment variables so that you can make the deploy to your aws account:
<pre>
  <code>aws configure</code>
</pre>
Provide the access key ID, the Secret access key, the region and the file format
The access key ID and the Secret access key can be generated on your aws account (IAM User)
This will generate a ~/.aws/config file and a ~/.aws/credentials file that will be saved on your computer

From now on, make sure that your Docker Desktop is open.
On a terminal, run this command only once (the other times you want to deploy something to your aws account, you can skip this command)
<pre>
  <code>cdk bootstrap --profile your-aws-account-name</code>
</pre>

On a terminal, run this command to deploy your app to your aws account
<pre>
  <code>cdk deploy --all --profile your-aws-account-name</code>
</pre>

After the deployment process, a url will be generated (you will have access to it on the terminal).
You can use Postman or another similar tool to test the endpoints.

