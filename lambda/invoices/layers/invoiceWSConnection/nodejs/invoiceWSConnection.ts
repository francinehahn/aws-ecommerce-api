import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWsService {
    private apigwManagementApi: ApiGatewayManagementApi

    constructor (apigwManagementApi: ApiGatewayManagementApi) {
        this.apigwManagementApi = apigwManagementApi
    }

    async sendData (connectionId: string, data: string): Promise<boolean> {
        try {
            //Is the client still connected?
            await this.apigwManagementApi.getConnection({
                ConnectionId: connectionId
            }).promise()

            await this.apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: data
            }).promise()

            return true
        } catch (error: any) {
            console.log(error)
            return false
        }


    }
}