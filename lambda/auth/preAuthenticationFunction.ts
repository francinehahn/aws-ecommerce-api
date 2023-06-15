import * as xray from "aws-xray-sdk"
import { Callback, Context, PreAuthenticationTriggerEvent } from "aws-lambda"

xray.captureAWS(require("aws-sdk"))

export async function handler (event: PreAuthenticationTriggerEvent, context: Context, callback: Callback): Promise<void> {
    console.log(event)

    callback(null, event)
}