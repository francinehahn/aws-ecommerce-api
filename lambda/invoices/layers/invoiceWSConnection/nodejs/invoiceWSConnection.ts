import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWsService {
    private apigwManagementApi: ApiGatewayManagementApi

    constructor (apigwManagementApi: ApiGatewayManagementApi) {
        this.apigwManagementApi = apigwManagementApi
    }

    sendInvoiceStatus (transactionId: string, connectionId: string, status: string) {
        const postData = JSON.stringify({
            transactionId: transactionId,
            status: status
        })

        return this.sendData(connectionId, postData)
    }

    async disconnectClient (connectionId: string): Promise<boolean> {
        try {
            //Is the client still connected?
            await this.apigwManagementApi.getConnection({
                ConnectionId: connectionId
            }).promise()

            await this.apigwManagementApi.deleteConnection({
                ConnectionId: connectionId
            }).promise()

            return true

        } catch (error: any) {
            console.error(error)
            return false
        }
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