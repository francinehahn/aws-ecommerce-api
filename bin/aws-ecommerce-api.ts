#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { ProductsAppStack } from '../lib/productsApp-stack'
import { EcommerceApiStack } from '../lib/ecommerceApi-stack'
import * as dotenv from "dotenv"
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack'
import { EventsDbStack } from 'lib/eventsDb-stack'

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

//Layers stack
const productsAppLayersStack = new ProductsAppLayersStack(app, "ProductsAppLayers", {
  tags: tags,
  env: env
})

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

//EcommerceApi stack
const ecommerceApiStack = new EcommerceApiStack(app, "EcommerceApi", {
  productsFetchHandler: productsAppStack.producstFetchHandler,
  productsAdminHandler: productsAppStack.producstAdminHandler,
  tags: tags,
  env: env
})

ecommerceApiStack.addDependency(productsAppStack)