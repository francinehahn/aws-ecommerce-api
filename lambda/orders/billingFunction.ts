import { Context, SNSEvent } from "aws-lambda"

export async function handler (event: SNSEvent, context: Context): Promise<void> {
    event.Records.forEach(record => console.log(record.Sns))

    return
}