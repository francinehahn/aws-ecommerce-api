#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { ProductsAppStack } from '../lib/productsApp-stack'
import { EcommerceApiStack } from '../lib/ecommerceApi-stack'
import * as dotenv from "dotenv"
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack'
import { EventsDbStack } from '../lib/eventsDb-stack'
import { OrdersAppLayersStack } from '../lib/ordersAppLayers-stack'
import { OrdersAppStack } from '../lib/ordersApp-stack'
import { InvoiceWSApiStack } from '../lib/invoiceWSApi-stack'
import { InvoicesAppLayersStack } from '../lib/invoicesAppLayers-stack'

dotenv.config()

const app = new cdk.App()

const env: cdk.Environment = {
  account: process.env.account,
  region: "us-east-1"
}

const tags = {
  cost: "Ecommerce",
  team: "FrancineHahn"
}

//Products Layers stack
const productsAppLayersStack = new ProductsAppLayersStack(app, "ProductsAppLayers", {
  tags: tags,
  env: env
})

//Events stack
const eventsDbStack = new EventsDbStack(app, "EventsDb", {
  tags: tags,
  env: env
})

//Products stack
const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  tags: tags,
  env: env,
  eventsDb: eventsDbStack.table
})

productsAppStack.addDependency(productsAppLayersStack)
productsAppStack.addDependency(eventsDbStack)

//Orders Layer Stack
const ordersAppLayerStack = new OrdersAppLayersStack(app, "OrdersAppLayers", {
  tags: tags,
  env: env
})

//Orders Stack
const ordersAppStack = new OrdersAppStack(app, "OrdersApp", {
  tags: tags,
  env: env,
  productsdb: productsAppStack.productsdb,
  eventsdb: eventsDbStack.table
})
ordersAppStack.addDependency(productsAppStack)
ordersAppStack.addDependency(ordersAppLayerStack)
ordersAppStack.addDependency(eventsDbStack)

//EcommerceApi stack
const ecommerceApiStack = new EcommerceApiStack(app, "EcommerceApi", {
  productsFetchHandler: productsAppStack.producstFetchHandler,
  productsAdminHandler: productsAppStack.producstAdminHandler,
  ordersHandler: ordersAppStack.ordersHandler,
  orderEventsFetchHandler: ordersAppStack.orderEventsFetchHandler,
  tags: tags,
  env: env
})

ecommerceApiStack.addDependency(productsAppStack)
ecommerceApiStack.addDependency(ordersAppStack)

//Invoices App Layers Stack
const invoicesAppLayersStack = new InvoicesAppLayersStack(app, "InvoicesAppLayer", {
  tags: {
    cost: "InvoiceApp",
    team: "FrancineHahn"
  },
  env: env
})

//Invoice WS Api Stack
const invoiceWSApiStack = new InvoiceWSApiStack(app, "InvoiceApi", {
  eventsDb: eventsDbStack.table,
  tags: {
    cost: "InvoiceApp",
    team: "FrancineHahn"
  },
  env: env
})
invoiceWSApiStack.addDependency(invoicesAppLayersStack)
invoiceWSApiStack.addDependency(eventsDbStack)
