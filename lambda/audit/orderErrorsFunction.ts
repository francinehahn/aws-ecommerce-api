import { Context, EventBridgeEvent } from "aws-lambda"

export async function handler (event: EventBridgeEvent<string, string>, context: Context): Promise<void> {
    console.log(event)
}