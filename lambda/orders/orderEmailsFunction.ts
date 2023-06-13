import { Context, SNSMessage, SQSEvent } from "aws-lambda"
import * as xray from "aws-xray-sdk"
import { Envelope, OrderEvent } from "/opt/nodejs/orderEventsLayer"
import { AWSError, SES } from "aws-sdk"
import { PromiseResult } from "aws-sdk/lib/request"

xray.captureAWS(require("aws-sdk"))

const sesClient = new SES()

//This function will be triggered by the sqs
export async function handler (event: SQSEvent, context: Context): Promise<void> {    
    const promises: Promise<PromiseResult<SES.SendEmailResponse, AWSError>>[] = []
    
    event.Records.forEach(record => {
        console.log(record)
        const body = JSON.parse(record.body) as SNSMessage
        promises.push(sendOrderEmail(body))
    })

    await Promise.all(promises)
    return
}

function sendOrderEmail (body: SNSMessage) {
    const envelope = JSON.parse(body.Message) as Envelope
    const event = JSON.parse(envelope.data) as OrderEvent

    return sesClient.sendEmail({
        Destination: {
            ToAddresses: [event.email]
        },
        Message: {
            Body: {
                Text: {
                    Charset: "UFT-8",
                    Data: `Recebemos o seu pedido de número ${event.orderId} no valor de ${event.billing.totalPrice}`
                }
            },
            Subject: {
                Charset: "UFT-8",
                Data: `Recebemos o seu pedido!`
            }
        },
        Source: "hahnf91@gmail.com",
        ReplyToAddresses: ["hahnf91@gmail.com"]
    }).promise()
}